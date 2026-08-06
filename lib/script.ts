import { safeRandomUUID } from '@tanstack/db';
import type { ObjectsEntity, scanResult } from '@/types';
import {
  jobsCollection,
  npmUsersCollection,
  scansCollection,
  packagesCollection,
  packageMaintainersCollection,
  packageKeywordsCollection,
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
// instead of duplicating rows. Returns the package id, which equals the name.
const upsertPackage = (object: ObjectsEntity): string => {
  const pkg = object.package;
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
  return pkg.name;
};

// Upserts the `insecure` flag used by the package-flags join.
const ensureInsecureFlag = (): string => {
  upsert(flagsCollection, 'insecure', { id: 'insecure', name: 'insecure' });
  return 'insecure';
};

// Writes one scan (author or maintainer) plus all of its related rows into the
// schema tables.
const persistScan = async (npmUserId: string, scan: scanResult): Promise<void> => {
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

  for (const object of scan.objects) {
    const packageId = upsertPackage(object);

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
// running -> success | no-data | failed.
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

    const author = await fetchScan('author', npmUser.username);
    const maintainer = await fetchScan('maintainer', npmUser.username);

    if (author.total === 0 && maintainer.total === 0) {
      setJob(jobId, { status: 'no-data', authorTotal: 0, maintainerTotal: 0, finishedAt: new Date().toISOString() });
      return;
    }

    await persistScan(job.npmUserId, author);
    await persistScan(job.npmUserId, maintainer);

    setJob(jobId, {
      status: 'success',
      authorTotal: author.total,
      maintainerTotal: maintainer.total,
      finishedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error while scanning';
    setJob(jobId, { status: 'failed', error: message, finishedAt: new Date().toISOString() });
  }
};