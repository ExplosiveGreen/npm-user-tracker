import { safeRandomUUID } from '@tanstack/db';
import type { ObjectsEntity, PackageInfo, scanResult } from '@/types';
import { notifyReleases } from '@/lib/notifications';
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
} from '@/db';

const NPM_SEARCH_URL = 'https://registry.npmjs.org/-/v1/search';

// npm_users can hold the same username under different ids when a discovered
// co-maintainer is later added explicitly, so look users up by username and
// reuse their existing id when available.
const loadUsersByUsername = async (): Promise<Map<string, string>> => {
  await npmUsersCollection.preload();
  const byUsername = new Map<string, string>();
  for (const user of npmUsersCollection.toArray) byUsername.set(user.username, user.id);
  return byUsername;
};

// Fetches one of the two npm registry search results. The registry response
// (`objects`, `total`, `time`) does not include the query kind, so the caller
// supplies `type: 'author' | 'maintainer'` to build a full `scanResult`.
export const fetchScan = async (
  type: scanResult['type'],
  username: string,
): Promise<scanResult> => {
  const response = await fetch(`${NPM_SEARCH_URL}?text=${type}:${encodeURIComponent(username)}`);
  if (!response.ok) {
    throw new Error(`npm search for "${username}" failed with status ${response.status}`);
  }
  const body = (await response.json()) as Omit<scanResult, 'type'>;
  return { ...body, type };
};

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

// Fetches the full metadata for one package and records the release date of every
// published version in package_versions. `created` and `modified` are registry
// bookkeeping timestamps, not versions, so they are skipped. Versions are upserted
// so overlapping author/maintainer scans and re-scans only fill in missing rows.
const syncPackageVersions = async (packageId: string): Promise<void> => {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageId)}`);
  if (!response.ok) {
    throw new Error(`fetching versions for "${packageId}" failed with status ${response.status}`);
  }
  const { time } = (await response.json()) as PackageInfo;
  if (!time) return;
  await packageVersionsCollection.preload();
  for (const [version, date] of Object.entries(time)) {
    if (version === 'created' || version === 'modified') continue;
    upsert(packageVersionsCollection, `${packageId}/${version}`, { packageId, version, date });
  }
};

// Upserts the `insecure` flag used by the package-flags join.
const ensureInsecureFlag = (): string => {
  upsert(flagsCollection, 'insecure', { id: 'insecure', name: 'insecure' });
  return 'insecure';
};

// Writes one scan (author or maintainer) plus all of its related rows into the
// schema tables. Returns the releases worth notifying about: new packages and
// version bumps seen in this scan. Version-history sync is best-effort — one
// missing package must not fail the whole user scan.
const persistScan = async (
  npmUserId: string,
  scan: scanResult,
): Promise<{ packageId: string; version: string; isNewPackage: boolean }[]> => {
  const scanId = safeRandomUUID();
  scansCollection.insert({
    id: scanId,
    npmUserId,
    type: scan.type,
    scannedAt: new Date().toISOString(),
    total: scan.total,
  });

  await packagesCollection.preload();
  await packageMaintainersCollection.preload();
  await packageKeywordsCollection.preload();
  const byUsername = await loadUsersByUsername();
  const releases: { packageId: string; version: string; isNewPackage: boolean }[] = [];

  for (const object of scan.objects) {
    const { id: packageId, versionChanged, isNewPackage } = upsertPackage(object);

    if (versionChanged) {
      try {
        await syncPackageVersions(packageId);
      } catch (error) {
        // Keep the scan going; the job still records the new version from the
        // search result even when the full history fetch fails.
        console.warn(`Version history sync skipped for "${packageId}"`, error);
      }
      releases.push({ packageId, version: object.package.version, isNewPackage });
    }

    const scanPackageId = safeRandomUUID();
    scanPackagesCollection.insert({
      id: scanPackageId,
      packageId,
      scanId,
      weeklyDownloads: object.downloads.weekly,
      monthlyDownloads: object.downloads.monthly,
      dependents:
        typeof object.dependents === 'number' ? object.dependents : Number(object.dependents) || null,
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

    for (const maintainer of object.package.maintainers ?? []) {
      const maintainerId = await ensureUser(byUsername, maintainer.username, maintainer.email);
      if (!maintainerId) continue;
      upsert(packageMaintainersCollection, `${packageId}/${maintainerId}`, { packageId, userId: maintainerId });
    }
  }

  return releases;
};

const setJob = (
  jobId: string,
  patch: Partial<
    Pick<Job, 'status' | 'error' | 'authorTotal' | 'maintainerTotal' | 'startedAt' | 'finishedAt'>
  >,
): void => {
  jobsCollection.update(jobId, (draft) => Object.assign(draft, patch));
};

// Runs one tracked job to completion, driving its status as it goes: queued ->
// running -> success | no-data | failed. The first-ever scan for a user only
// establishes the baseline and never notifies; later scans notify (when the
// user is still enabled) about new packages and version bumps.
export const processJob = async (jobId: string): Promise<void> => {
  const job = jobsCollection.get(jobId);
  if (!job) return;
  if (job.status !== 'queued' && job.status !== 'failed') return;

  const now = new Date().toISOString();
  setJob(jobId, { status: 'running', error: null, startedAt: now, finishedAt: null });

  try {
    await loadUsersByUsername();
    const npmUser = npmUsersCollection.get(job.npmUserId);
    if (!npmUser) {
      setJob(jobId, { status: 'failed', error: 'Tracked user was deleted', finishedAt: new Date().toISOString() });
      return;
    }

    await scansCollection.preload();
    const isBaseline = !scansCollection.toArray.some((scan) => scan.npmUserId === job.npmUserId);

    const author = await fetchScan('author', npmUser.username);
    const maintainer = await fetchScan('maintainer', npmUser.username);

    if (author.total === 0 && maintainer.total === 0) {
      setJob(jobId, { status: 'no-data', authorTotal: 0, maintainerTotal: 0, finishedAt: new Date().toISOString() });
      return;
    }

    const authorReleases = await persistScan(job.npmUserId, author);
    const maintainerReleases = await persistScan(job.npmUserId, maintainer);
    // The same package can appear in both scans; keep the first sighting so
    // the notification counts it once.
    const seen = new Set<string>();
    const releases = [...authorReleases, ...maintainerReleases].filter((r) =>
      seen.has(r.packageId) ? false : (seen.add(r.packageId), true),
    );

    setJob(jobId, {
      status: 'success',
      authorTotal: author.total,
      maintainerTotal: maintainer.total,
      finishedAt: new Date().toISOString(),
    });

    if (!isBaseline && npmUser.enable && releases.length > 0) {
      await notifyReleases(npmUser.username, releases);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error while scanning';
    setJob(jobId, { status: 'failed', error: message, finishedAt: new Date().toISOString() });
  }
};

// Queues a fresh scan job for every enabled user and runs it. Used by the
// "Check now" button and shared with the background task path.
export const scanAllEnabled = async (): Promise<void> => {
  await npmUsersCollection.preload();
  const enabled = npmUsersCollection.toArray.filter((user) => user.enable);
  for (const user of enabled) {
    const jobId = safeRandomUUID();
    jobsCollection.insert({
      id: jobId,
      npmUserId: user.id,
      status: 'queued',
      error: null,
      authorTotal: 0,
      maintainerTotal: 0,
      createdAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
    });
    await processJob(jobId);
  }
};