import { open } from '@op-engineering/op-sqlite';
import type { Scalar } from '@op-engineering/op-sqlite';
import { createCollection } from '@tanstack/db';
import type { Collection, UtilsRecord } from '@tanstack/db';
import {
  createReactNativeSQLitePersistence,
  persistedCollectionOptions,
} from '@tanstack/react-native-db-sqlite-persistence';

// Local SQLite-backed persistence shared by every collection below. The database
// is opened once and reused across the whole app runtime (and across app restarts),
// which is what makes the data durable on-device.
const database = open({
  name: 'npm-user-tracker.sqlite',
  location: 'default',
});

const persistence = createReactNativeSQLitePersistence({
  database: {
    execute: (sql, params) =>
      database.execute(sql, params as Scalar[] | undefined),
    close: () => database.close(),
  },
});

export type NpmUser = {
  id: string;
  username: string;
  email: string | null;
  enable: boolean;
};

export type Scan = {
  id: string;
  npmUserId: string;
  type: 'author' | 'maintainer';
  scannedAt: string;
  total: number;
};

export type Package = {
  id: string;
  publisherId: string;
  name: string;
  sanitizedName: string;
  version: string;
  description: string | null;
  license: string | null;
  publishDate: string | null;
  updated: string | null;
  repository: string | null;
  homepage: string | null;
  bugs: string | null;
  npm: string | null;
};

export type PackageMaintainer = {
  packageId: string;
  userId: string;
};

export type PackageKeyword = {
  packageId: string;
  keyword: string;
};

export type ScanPackage = {
  id: string;
  packageId: string;
  scanId: string;
  weeklyDownloads: number;
  monthlyDownloads: number;
  dependents: number | null;
  searchScore: number;
  finalScore: number;
  popularityScore: number;
  qualityScore: number;
  maintenanceScore: number;
};

export type Flag = {
  id: string;
  name: string;
};

export type PackageFlag = {
  scanPackageId: string;
  flagId: string;
  value: boolean;
};

export type PackageVersion = {
  packageId: string;
  version: string;
  date: string;
};

export const npmUsersCollection = createCollection(
  persistedCollectionOptions<NpmUser, string>({
    id: 'npm-users',
    getKey: (user) => user.id,
    persistence,
    schemaVersion: 1,
  }),
);

export const scansCollection = createCollection<Scan, string>(
  persistedCollectionOptions<Scan, string>({
    id: 'scans',
    getKey: (scan) => scan.id,
    persistence,
    schemaVersion: 1,
  }),
);

export const packagesCollection = createCollection<Package, string>(
  persistedCollectionOptions<Package, string>({
    id: 'packages',
    getKey: (pkg) => pkg.id,
    persistence,
    schemaVersion: 1,
  }),
);

export const packageMaintainersCollection = createCollection<PackageMaintainer, string>(
  persistedCollectionOptions<PackageMaintainer, string>({
    id: 'package-maintainers',
    getKey: (row) => `${row.packageId}/${row.userId}`,
    persistence,
    schemaVersion: 1,
  }),
);

export const packageKeywordsCollection = createCollection<PackageKeyword, string>(
  persistedCollectionOptions<PackageKeyword, string>({
    id: 'package-keywords',
    getKey: (row) => `${row.packageId}/${row.keyword}`,
    persistence,
    schemaVersion: 1,
  }),
);

export const scanPackagesCollection = createCollection<ScanPackage, string>(
  persistedCollectionOptions<ScanPackage, string>({
    id: 'scan-packages',
    getKey: (row) => row.id,
    persistence,
    schemaVersion: 1,
  }),
);

export const flagsCollection = createCollection<Flag, string>(
  persistedCollectionOptions<Flag, string>({
    id: 'flags',
    getKey: (flag) => flag.id,
    persistence,
    schemaVersion: 1,
  }),
);

export const packageFlagsCollection = createCollection<PackageFlag, string>(
  persistedCollectionOptions<PackageFlag, string>({
    id: 'package-flags',
    getKey: (row) => `${row.scanPackageId}/${row.flagId}`,
    persistence,
    schemaVersion: 1,
  }),
);

export const packageVersionsCollection = createCollection<PackageVersion, string>(
  persistedCollectionOptions<PackageVersion, string>({
    id: 'package-versions',
    getKey: (row) => `${row.packageId}/${row.version}`,
    persistence,
    schemaVersion: 1,
  }),
);

// Registry of persisted collections used to render the DB explorer screens. The
// collection is stored loosely so the screens can render arbitrary rows.
export type DbTable = {
  name: string;
  columns: string[];
  collection: Collection<Record<string, unknown>, string, UtilsRecord, never, Record<string, unknown>>;
};

export const dbTables: DbTable[] = [
  {
    name: 'npm_users',
    columns: ['id', 'username', 'email', 'enable'],
    collection: npmUsersCollection as unknown as DbTable['collection'],
  },
  {
    name: 'scans',
    columns: ['id', 'npmUserId', 'type', 'scannedAt', 'total'],
    collection: scansCollection as unknown as DbTable['collection'],
  },
  {
    name: 'packages',
    columns: [
      'id', 'publisherId', 'name', 'sanitizedName', 'version', 'description',
      'license', 'publishDate', 'updated', 'repository', 'homepage', 'bugs', 'npm',
    ],
    collection: packagesCollection as unknown as DbTable['collection'],
  },
  {
    name: 'package_maintainers',
    columns: ['packageId', 'userId'],
    collection: packageMaintainersCollection as unknown as DbTable['collection'],
  },
  {
    name: 'package_keywords',
    columns: ['packageId', 'keyword'],
    collection: packageKeywordsCollection as unknown as DbTable['collection'],
  },
  {
    name: 'scan_packages',
    columns: [
      'id', 'packageId', 'scanId', 'weeklyDownloads', 'monthlyDownloads',
      'dependents', 'searchScore', 'finalScore', 'popularityScore',
      'qualityScore', 'maintenanceScore',
    ],
    collection: scanPackagesCollection as unknown as DbTable['collection'],
  },
  {
    name: 'flags',
    columns: ['id', 'name'],
    collection: flagsCollection as unknown as DbTable['collection'],
  },
  {
    name: 'package_flags',
    columns: ['scanPackageId', 'flagId', 'value'],
    collection: packageFlagsCollection as unknown as DbTable['collection'],
  },
  {
    name: 'package_versions',
    columns: ['packageId', 'version', 'date'],
    collection: packageVersionsCollection as unknown as DbTable['collection'],
  },
];