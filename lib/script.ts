import { Data, Effect, Schedule, Schema } from "effect";
import { safeRandomUUID } from "@tanstack/db";
import type { ObjectsEntity, scanResult } from "@/types";
import { notifyReleases } from "@/lib/notifications";
import { getPref, setPref } from "@/lib/prefs";
import { PackageTime, SearchResponse } from "@/lib/registry-schema";
import {
  jobsCollection,
  npmUsersCollection,
  scansCollection,
  packagesCollection,
  packageMaintainersCollection,
  packageKeywordsCollection,
  packageVersionsCollection,
  scanPackagesCollection,
  flagsCollection,
  packageFlagsCollection,
  type Job,
} from "@/db";

const NPM_SEARCH_URL = "https://registry.npmjs.org/-/v1/search";

// Single typed failure for the whole scan pipeline. Every fallible step maps
// into it, so job rows always get a human-readable message.
export class ScanError extends Data.TaggedError("ScanError")<{
  readonly operation: string;
  readonly message: string;
}> {}

export interface Release {
  packageId: string;
  version: string;
  isNewPackage: boolean;
}

// Two attempts after the first, two seconds apart — enough for transient
// mobile-network blips without stalling background scans.
const retryPolicy = Schedule.recurs(2).pipe(
  Schedule.addDelay(() => Effect.succeed("2 seconds" as const)),
);

// Yields to the JS event loop so touches, scrolls, and Switch toggles are
// processed between scan batches. (Effect.yieldNow only yields to the Effect
// runtime — only a real macrotask lets the UI thread breathe.) Awaiting one
// of these every few packages keeps the app responsive while a big scan
// (e.g. a prolific author like tannerlinsley) churns through hundreds of
// network + SQLite writes.
const yieldToUI = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

// Fast-phase writes are pure search-result upserts (no version-history
// fetches), so a small concurrency is plenty; version history syncs each pull
// a full metadata document (often 100KB+) and JSON.parse blocks the thread,
// so they run at lower concurrency in the background after the job succeeds.
const PACKAGE_WRITE_CONCURRENCY = 3;
const VERSION_SYNC_CONCURRENCY = 2;
// SQLite-backed collection writes each notify live-query subscribers, so a
// package with hundreds of versions would re-render lists hundreds of times
// in a tight loop — yield periodically to let input/scroll events through.
const VERSION_INSERT_YIELD_EVERY = 50;

// Retry budget for one job: this many immediate retries after a short delay,
// then the job waits for the next scheduled scan ("a later date"). Fresh jobs
// from "Check now" / the background task always start at 0.
const MAX_IMMEDIATE_RETRIES = 2;
const RETRY_DELAY_MS = 30_000;

// Durable backfill queue: package ids whose version history still needs
// syncing. Saved to prefs before the backfill starts and pruned as packages
// complete, so killing the app mid-backfill resumes it on next launch
// instead of dropping it. Failures stay queued — the next launch or scan
// retries them. Capped so the pref can't grow without bound.
const PENDING_HISTORIES_KEY = 'pending-version-histories';
const MAX_PENDING_HISTORIES = 500;

const getPendingHistories = (): Array<string> => {
  try {
    const raw = getPref(PENDING_HISTORIES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

const setPendingHistories = (ids: ReadonlyArray<string>): void => {
  setPref(PENDING_HISTORIES_KEY, ids.length === 0 ? null : JSON.stringify(ids));
};

// npm_users can hold the same username under different ids when a discovered
// co-maintainer is later added explicitly, so look users up by username and
// reuse their existing id when available.
const loadUsersByUsername = async (): Promise<Map<string, string>> => {
  await npmUsersCollection.preload();
  const byUsername = new Map<string, string>();
  for (const user of npmUsersCollection.toArray) byUsername.set(user.username, user.id);
  return byUsername;
};

// Fetches and validates untrusted registry JSON. Retries transient network
// failures; schema mismatches fail immediately (retrying won't help).
const fetchJson = (url: string, operation: string): Effect.Effect<unknown, ScanError> =>
  Effect.tryPromise({
    try: () =>
      fetch(url, { signal: AbortSignal.timeout(30_000) }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`status ${response.status}`);
        }
        return (await response.json()) as unknown;
      }),
    catch: (cause) =>
      new ScanError({
        operation,
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  }).pipe(Effect.retry(retryPolicy));

// One of the two npm registry search results. The registry response
// (`objects`, `total`, `time`) does not include the query kind, so the caller
// supplies `type: 'author' | 'maintainer'` to build a full `scanResult`.
const fetchScan = (
  type: scanResult["type"],
  username: string,
): Effect.Effect<scanResult, ScanError> =>
  Effect.gen(function* () {
    const operation = `npm search for "${username}"`;
    const json = yield* fetchJson(
      `${NPM_SEARCH_URL}?text=${type}:${encodeURIComponent(username)}`,
      operation,
    );
    const decoded = yield* Schema.decodeEffect(SearchResponse)(
      // Cast satisfies the decoder's input type; the Schema validates the
      // actual content at runtime and fails on mismatch.
      json as typeof SearchResponse.Encoded,
    ).pipe(
      Effect.mapError(
        (issue) => new ScanError({ operation, message: `invalid registry response: ${String(issue)}` }),
      ),
    );
    const objects: ObjectsEntity[] = decoded.objects.map((object) => ({
      downloads: {
        monthly: object.downloads.monthly,
        weekly: object.downloads.weekly,
      },
      dependents: object.dependents,
      updated: object.updated,
      searchScore: object.searchScore,
      package: {
        name: object.package.name,
        keywords: object.package.keywords ? [...object.package.keywords] : null,
        version: object.package.version,
        sanitized_name: object.package.sanitized_name,
        publisher: { ...object.package.publisher },
        maintainers: object.package.maintainers ? object.package.maintainers.map((m) => ({ ...m })) : null,
        license: object.package.license ?? null,
        date: object.package.date,
        links: {
          npm: object.package.links.npm,
          homepage: object.package.links.homepage ?? null,
          repository: object.package.links.repository ?? null,
          bugs: object.package.links.bugs ?? null,
        },
        description: object.package.description ?? null,
      },
      score: {
        final: object.score.final,
        detail: { ...object.score.detail },
      },
      flags: { insecure: object.flags?.insecure ?? 0 },
    }));
    return { objects, total: decoded.total, time: decoded.time, type };
  });

// Ensures a username/email pair is present in npm_users (used for the scanned
// user's co-maintainers and the package publisher) so relations can reference
// it. Returns the id to use for the user: an already-tracked id when one exists
// for that username, otherwise the username itself.
const ensureUser = async (
  byUsername: Map<string, string>,
  username: string | null | undefined,
  email?: string | null | undefined,
): Promise<string | null> => {
  if (!username) return null;
  const existingId = byUsername.get(username);
  if (existingId) return existingId;
  byUsername.set(username, username);
  npmUsersCollection.insert({ id: username, username, email: email ?? null, enable: false });
  return username;
};

// Inserts `row` keyed by `key`, or applies the latest values to the existing
// row so re-scanning updates stale data instead of failing on duplicate keys.
const upsert = <T extends object>(
  collection: {
    get(key: string): unknown;
    update(key: string, callback: (draft: T) => void): unknown;
    insert(row: T): unknown;
  },
  key: string,
  row: T,
): void => {
  const existing = collection.get(key);
  if (existing) {
    collection.update(key, (draft) => Object.assign(draft, row));
  } else {
    collection.insert(row);
  }
};

// Packages are keyed by their unique npm name, so re-scanning a user upserts
// instead of duplicating rows. Returns the package id (the name), whether the
// package is new or its version changed since the last scan, so the caller can
// refresh the tracked version history. `isNewPackage` is true only when no row
// existed before this scan.
const upsertPackage = (object: ObjectsEntity): { id: string; versionChanged: boolean; isNewPackage: boolean } => {
  const pkg = object.package;
  const existing = packagesCollection.get(pkg.name);
  const isNewPackage = !existing;
  const versionChanged = isNewPackage || existing.version !== pkg.version;
  upsert(
    packagesCollection,
    pkg.name,
    {
      id: pkg.name,
      name: pkg.name,
      sanitizedName: pkg.sanitized_name,
      version: pkg.version,
      description: pkg.description ?? null,
      license: pkg.license ?? null,
      publishDate: pkg.date ?? null,
      updated: object.updated ?? null,
      repository: pkg.links?.repository ?? null,
      homepage: pkg.links?.homepage ?? null,
      bugs: pkg.links?.bugs ?? null,
      npm: pkg.links?.npm ?? null,
      publisherId: pkg.publisher?.username ?? null,
    },
  );
  return { id: pkg.name, versionChanged, isNewPackage };
};

// The metadata document's `time` map (version → release date), or an empty
// record when the field is missing. The cast only satisfies the decoder's
// input type — the Schema validates the actual content.
const toTimeRecord = (json: unknown): Record<string, string> => {
  const time = (json as { time?: unknown }).time;
  if (typeof time === "object" && time !== null) return time as Record<string, string>;
  return {};
};

// Records the release date of every published version in package_versions.
// `created` and `modified` are registry bookkeeping timestamps, not versions,
// so they are skipped. Only the `time` map is decoded — the full metadata
// document can be megabytes. Versions are upserted so overlapping
// author/maintainer scans and re-scans only fill in missing rows. Inserts are
// chunked with yields: each write notifies live-query subscribers (which
// re-sort lists), so a package with hundreds of versions must not write them
// in one tight loop or the UI freezes until it finishes.
const syncPackageVersions = (packageId: string): Effect.Effect<void, ScanError> =>
  Effect.gen(function* () {
    const operation = `fetching versions for "${packageId}"`;
    const json = yield* fetchJson(
      `https://registry.npmjs.org/${encodeURIComponent(packageId)}`,
      operation,
    );
    const time = yield* Schema.decodeEffect(PackageTime)(toTimeRecord(json)).pipe(
      Effect.mapError(
        (issue) => new ScanError({ operation, message: `invalid version history: ${String(issue)}` }),
      ),
    );
    const entries = Object.entries(time).filter(([version]) => version !== "created" && version !== "modified");
    for (let i = 0; i < entries.length; i += VERSION_INSERT_YIELD_EVERY) {
      const chunk = entries.slice(i, i + VERSION_INSERT_YIELD_EVERY);
      yield* Effect.sync(() => {
        for (const [version, date] of chunk) {
          upsert(packageVersionsCollection, `${packageId}/${version}`, { packageId, version, date });
        }
      });
      yield* Effect.promise(() => yieldToUI());
    }
  });

// Deferred version-history backfill. The job is already marked success before
// this runs: search results alone determine releases/notifications, while the
// full per-version history streams in afterwards at low concurrency. If the OS
// kills a background task mid-backfill, the next scan upserts the missing rows.
// The pending list is durable (prefs): whatever was already applied stays
// applied (idempotent upserts), and whatever hadn't finished resumes later.
const backfillVersionHistories = (packageIds: ReadonlyArray<string>): void => {
  const unique = [...new Set(packageIds)];
  const merged = [...new Set([...getPendingHistories(), ...unique])].slice(-MAX_PENDING_HISTORIES);
  if (merged.length === 0) return;
  setPendingHistories(merged);
  void Effect.runPromise(
    Effect.gen(function* () {
      yield* Effect.promise(() => packageVersionsCollection.preload());
      // Preload once up front instead of once per package.
      yield* Effect.forEach(merged, (packageId) =>
        syncPackageVersions(packageId).pipe(
          Effect.matchEffect({
            // Stays in the pending list — retried on a later launch/scan.
            onFailure: (error) =>
              Effect.sync(() => {
                console.warn(`Version history sync skipped for "${packageId}"`, error.message);
              }),
            onSuccess: () =>
              Effect.sync(() => {
                // Read-modify-write inside one sync block: no yield inside,
                // so concurrent fibers can't interleave and lose a removal.
                setPendingHistories(getPendingHistories().filter((id) => id !== packageId));
              }),
          }),
        ), { concurrency: VERSION_SYNC_CONCURRENCY });
    }),
  );
};

// Enqueues a scan job for one user without running it. The foreground NEVER
// executes scans — it only writes jobs. Execution belongs exclusively to the
// OS background task, so a scan never depends on the app being alive. Reuses
// a waiting job when one already exists for the user.
export const enqueueUserScan = (npmUserId: string): string => {
  const existing = jobsCollection.toArray.find(
    (job) => job.npmUserId === npmUserId && (job.status === "queued" || job.status === "running"),
  );
  if (existing) return existing.id;
  const jobId = safeRandomUUID();
  jobsCollection.insert({
    id: jobId,
    npmUserId,
    status: "queued",
    error: null,
    authorTotal: 0,
    maintainerTotal: 0,
    attempts: 0,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
  });
  return jobId;
};

// Enqueues a sweep over all enabled users, skipping anyone who already has a
// waiting job. Powers the "Queue check" button — foreground equivalent of
// asking the background task for a full pass on its next run.
export const enqueueSweep = (): void => {
  for (const user of npmUsersCollection.toArray.filter((u) => u.enable)) {
    enqueueUserScan(user.id);
  }
};

// Waits until the version-history backfill drains (or the budget runs out).
// Used by the background task: unlike the foreground, which detaches the
// backfill and stays interactive, the headless task holds its OS execution
// window open so histories actually finish while the app is closed. Whatever
// doesn't fit in the budget stays queued and resumes on the next run.
const drainPendingHistories = async (budgetMs: number): Promise<void> => {
  const deadline = Date.now() + budgetMs;
  while (getPendingHistories().length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
};

// One full background execution: finish anything a killed session left behind
// (interrupted jobs resume, failed jobs retry, backfill continues), sweep all
// enabled users, then hold the execution window until histories drain. Every
// step is idempotent and durable, so an OS kill mid-run just means the next
// run continues — closing the app never loses a scan.
export const runBackgroundScan = async (): Promise<void> => {
  await recoverInterruptedScans();
  await scanAllEnabled();
  // ~8 minutes: fits inside Android's ~10-minute JobScheduler window; on iOS
  // the OS kills earlier anyway and the remainder resumes next run.
  await drainPendingHistories(8 * 60_000);
};

// Upserts the `insecure` flag used by the package-flags join.
const ensureInsecureFlag = (): string => {
  upsert(flagsCollection, "insecure", { id: "insecure", name: "insecure" });
  return "insecure";
};

// Persists one search object plus its related rows from the search result
// only — deliberately no version-history fetch here. History is backfilled
// after the job succeeds (see backfillVersionHistories), so adding a prolific
// author marks Done quickly instead of blocking on hundreds of metadata
// documents while the UI can't respond.
const processSearchObject = (
  scanId: string,
  object: ObjectsEntity,
  byUsername: Map<string, string>,
): Effect.Effect<{ release: Release | null; historyPending: string | null }, ScanError> =>
  Effect.gen(function* () {
    const { id: packageId, versionChanged, isNewPackage } = yield* Effect.sync(() =>
      upsertPackage(object),
    );

    const release: Release | null = versionChanged
      ? { packageId, version: object.package.version, isNewPackage }
      : null;
    const historyPending = versionChanged ? packageId : null;

    yield* Effect.sync(() => {
      const scanPackageId = safeRandomUUID();
      scanPackagesCollection.insert({
        id: scanPackageId,
        packageId,
        scanId,
        weeklyDownloads: object.downloads.weekly,
        monthlyDownloads: object.downloads.monthly,
        dependents:
          typeof object.dependents === "number" ? object.dependents : Number(object.dependents) || null,
        searchScore: object.searchScore,
        finalScore: object.score.final,
        popularityScore: object.score.detail.popularity,
        qualityScore: object.score.detail.quality,
        maintenanceScore: object.score.detail.maintenance,
      });

      const insecureFlagId = ensureInsecureFlag();
      packageFlagsCollection.insert({
        scanPackageId,
        flagId: insecureFlagId,
        value: Boolean(object.flags?.insecure),
      });

      for (const keyword of object.package.keywords ?? []) {
        if (!keyword) continue;
        upsert(packageKeywordsCollection, `${packageId}/${keyword}`, { packageId, keyword });
      }
    });

    for (const maintainer of object.package.maintainers ?? []) {
      const maintainerId = yield* Effect.promise(() =>
        ensureUser(byUsername, maintainer.username, maintainer.email),
      );
      if (!maintainerId) continue;
      yield* Effect.sync(() =>
        upsert(packageMaintainersCollection, `${packageId}/${maintainerId}`, {
          packageId,
          userId: maintainerId,
        }),
      );
    }

    return { release, historyPending };
  });

// Writes one scan (author or maintainer) plus all of its related rows into the
// schema tables. Returns the releases worth notifying about plus the package
// ids whose version history still needs backfilling. Objects are processed in
// small batches with a yield between batches: every write notifies live-query
// subscribers, and without yielding a 100+ package scan starves touches and
// scrolls until it finishes.
const persistScan = (
  npmUserId: string,
  scan: scanResult,
  byUsername: Map<string, string>,
): Effect.Effect<{ releases: Array<Release>; historyPending: Array<string> }, ScanError> =>
  Effect.gen(function* () {
    const scanId = safeRandomUUID();
    yield* Effect.sync(() =>
      scansCollection.insert({
        id: scanId,
        npmUserId,
        type: scan.type,
        scannedAt: new Date().toISOString(),
        total: scan.total,
      }),
    );

    const releases: Array<Release> = [];
    const historyPending: Array<string> = [];
    for (let i = 0; i < scan.objects.length; i += PACKAGE_WRITE_CONCURRENCY) {
      const batch = scan.objects.slice(i, i + PACKAGE_WRITE_CONCURRENCY);
      const results = yield* Effect.forEach(batch, (object) => processSearchObject(scanId, object, byUsername), {
        concurrency: PACKAGE_WRITE_CONCURRENCY,
      });
      for (const { release, historyPending: pending } of results) {
        if (release) releases.push(release);
        if (pending) historyPending.push(pending);
      }
      // Let taps, scrolls, and Switch toggles process before the next batch.
      yield* Effect.promise(() => yieldToUI());
    }
    return { releases, historyPending };
  });

const setJob = (
  jobId: string,
  patch: Partial<
    Pick<Job, "status" | "error" | "authorTotal" | "maintainerTotal" | "attempts" | "startedAt" | "finishedAt">
  >,
): void => {
  jobsCollection.update(jobId, (draft) => Object.assign(draft, patch));
};

// The fallible core of one tracked job. The first-ever scan for a user only
// establishes the baseline and never notifies; later scans notify (when the
// user is still enabled) about new packages and version bumps.
const runScan = (job: Job): Effect.Effect<void, ScanError> =>
  Effect.gen(function* () {
    const npmUser = npmUsersCollection.get(job.npmUserId);
    if (!npmUser) {
      return yield* Effect.fail(
        new ScanError({ operation: "scan", message: "Tracked user was deleted" }),
      );
    }

    yield* Effect.promise(() => scansCollection.preload());
    const isBaseline = !scansCollection.toArray.some((scan) => scan.npmUserId === job.npmUserId);

    const [author, maintainer] = yield* Effect.all(
      [fetchScan("author", npmUser.username), fetchScan("maintainer", npmUser.username)],
      { concurrency: 2 },
    );

    if (author.total === 0 && maintainer.total === 0) {
      yield* Effect.sync(() =>
        setJob(job.id, {
          status: "no-data",
          authorTotal: 0,
          maintainerTotal: 0,
          finishedAt: new Date().toISOString(),
        }),
      );
      return;
    }

    // Preload once per job instead of once per scan — persistScan used to do
    // this twice (author + maintainer) back to back.
    yield* Effect.promise(() => packagesCollection.preload());
    yield* Effect.promise(() => packageMaintainersCollection.preload());
    yield* Effect.promise(() => packageKeywordsCollection.preload());
    const byUsername = yield* Effect.promise(() => loadUsersByUsername());

    const { releases: authorReleases, historyPending: authorPending } = yield* persistScan(
      job.npmUserId,
      author,
      byUsername,
    );
    // Yield between the two scans so a big author result can't starve input.
    yield* Effect.promise(() => yieldToUI());
    const { releases: maintainerReleases, historyPending: maintainerPending } = yield* persistScan(
      job.npmUserId,
      maintainer,
      byUsername,
    );
    // The same package can appear in both scans; keep the first sighting so
    // the notification counts it once.
    const seen = new Set<string>();
    const releases = [...authorReleases, ...maintainerReleases].filter((r) =>
      seen.has(r.packageId) ? false : (seen.add(r.packageId), true),
    );

    yield* Effect.sync(() =>
      setJob(job.id, {
        status: "success",
        authorTotal: author.total,
        maintainerTotal: maintainer.total,
        finishedAt: new Date().toISOString(),
      }),
    );

    if (!isBaseline && npmUser.enable && releases.length > 0) {
      // A failed notification must not fail the scan that already succeeded.
      yield* notifyReleases(npmUser.username, releases).pipe(
        Effect.matchEffect({
          onFailure: () => Effect.void,
          onSuccess: () => Effect.void,
        }),
      );
    }

    // Backfill full version histories after the job is Done. This is the slow
    // part (one full metadata document per new/changed package) and it runs
    // detached at low concurrency with yields, so "Recent updates" fills in
    // gradually while the UI stays interactive.
    yield* Effect.sync(() => backfillVersionHistories([...authorPending, ...maintainerPending]));
  });

// Runs one tracked job to completion, driving its status as it goes: queued ->
// running -> success | no-data | failed. Runs ONLY inside the OS background
// task — the foreground enqueues jobs and never calls this, so execution
// never depends on the app being alive.
export const processJob = (jobId: string): Promise<void> => {
  const job = jobsCollection.get(jobId);
  if (!job) return Promise.resolve();
  if (job.status !== "queued" && job.status !== "failed") return Promise.resolve();

  const now = new Date().toISOString();
  setJob(jobId, { status: "running", error: null, startedAt: now, finishedAt: null });
  liveJobIds.add(jobId);

  return Effect.runPromise(
    runScan(job).pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          Effect.sync(() => {
            const attempts = (jobsCollection.get(jobId)?.attempts ?? 0) + 1;
            setJob(jobId, {
              status: "failed",
              error: error.message,
              attempts,
              finishedAt: new Date().toISOString(),
            });
            if (attempts <= MAX_IMMEDIATE_RETRIES) scheduleRetry(jobId);
          }),
        onSuccess: () => Effect.void,
      }),
    ),
  ).finally(() => {
    liveJobIds.delete(jobId);
  });
};

// A `running` row older than this belonged to a dead session. Fresh ones may
// be a live worker in another runtime (foreground vs headless background share
// SQLite but not memory), so both sides leave fresh `running` jobs alone.
// A single job's running phase is only searches + local upserts — minutes at
// most — so anything older is certainly orphaned.
const STALE_RUNNING_MS = 10 * 60_000;

// Jobs actively running in this session. A `running` row NOT in this set is
// either a live worker in the other runtime or a leftover from a killed
// session — isStaleRunning tells those apart.
const liveJobIds = new Set<string>();

const isStaleRunning = (job: Job): boolean => {
  if (job.status !== "running") return false;
  const started = job.startedAt ? Date.parse(job.startedAt) : NaN;
  if (Number.isNaN(started)) return true;
  return Date.now() - started > STALE_RUNNING_MS;
};

// One-shot delayed retry for a failed job. Guards: never double-schedule, and
// re-checks the job is still `failed` at fire time (the user may have tapped
// Retry or deleted it meanwhile). The timer only lives while the app does —
// a killed app retries via recoverInterruptedScans on next launch instead.
const scheduledRetries = new Set<string>();

const scheduleRetry = (jobId: string, delayMs: number = RETRY_DELAY_MS): void => {
  if (scheduledRetries.has(jobId)) return;
  scheduledRetries.add(jobId);
  setTimeout(() => {
    scheduledRetries.delete(jobId);
    const job = jobsCollection.get(jobId);
    if (!job || job.status !== "failed") return;
    void processJob(jobId);
  }, delayMs);
};

// Requeues scan work left behind by a killed session. Requeue-ONLY: the
// foreground never executes scans, so this resets stale `running` jobs and
// retryable `failed` jobs back to `queued` and stops there. The background
// task (or its next OS window) does the actual running — including the
// persisted version-history backlog, which merges into the next backfill on
// its own. Anything past the immediate retry budget waits for a fresh sweep
// job from the next scheduled run.
export const recoverInterruptedScans = (): Promise<void> =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* Effect.promise(() => jobsCollection.preload());
      yield* Effect.promise(() => npmUsersCollection.preload());

      const interrupted = jobsCollection.toArray.filter(
        (job) => isStaleRunning(job) && (job.attempts ?? 0) <= MAX_IMMEDIATE_RETRIES,
      );
      for (const job of interrupted) {
        yield* Effect.sync(() => setJob(job.id, { status: "queued", startedAt: null }));
      }
      const retryable = jobsCollection.toArray.filter(
        (job) => job.status === "failed" && (job.attempts ?? 0) <= MAX_IMMEDIATE_RETRIES,
      );
      for (const job of retryable) {
        yield* Effect.sync(() => setJob(job.id, { status: "queued", error: null }));
      }
    }),
  );

// Queues a fresh scan job for every enabled user and runs it. Runs ONLY inside
// the OS background task path — the foreground "Queue check" button merely
// enqueues via enqueueSweep. A fresh sweep is also the "later date" retry:
// anything still failed or interrupted gets scanned again here once the
// immediate retry budget is spent.
export const scanAllEnabled = (): Promise<void> =>
  Effect.runPromise(
    Effect.gen(function* () {
      yield* Effect.promise(() => npmUsersCollection.preload());
      yield* Effect.promise(() => jobsCollection.preload());
      // `running` rows from a killed session never complete on their own —
      // close them out as interrupted so "Needs attention" tells the truth.
      // Live jobs in this session are excluded via liveJobIds; possibly-live
      // jobs in the other runtime via isStaleRunning.
      const stale = jobsCollection.toArray.filter(
        (job) => isStaleRunning(job) && !liveJobIds.has(job.id),
      );
      for (const job of stale) {
        yield* Effect.sync(() =>
          setJob(job.id, {
            status: "failed",
            error: "Scan interrupted",
            attempts: (job.attempts ?? 0) + 1,
            finishedAt: new Date().toISOString(),
          }),
        );
      }
      const enabled = npmUsersCollection.toArray.filter((user) => user.enable);
      yield* Effect.forEach(enabled, (user) =>
        Effect.gen(function* () {
          // Reuse a waiting job when one exists (e.g. left by a killed
          // session) instead of stacking a duplicate sweep on top of it.
          const existing = jobsCollection.toArray.find(
            (job) => job.npmUserId === user.id && job.status === "queued",
          );
          const jobId = existing?.id ?? safeRandomUUID();
          if (!existing) {
            yield* Effect.sync(() =>
              jobsCollection.insert({
                id: jobId,
                npmUserId: user.id,
                status: "queued",
                error: null,
                authorTotal: 0,
                maintainerTotal: 0,
                attempts: 0,
                createdAt: new Date().toISOString(),
                startedAt: null,
                finishedAt: null,
              }),
            );
          }
          yield* Effect.promise(() => processJob(jobId));
        }),
      );
    }),
  );
