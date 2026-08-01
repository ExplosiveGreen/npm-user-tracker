import { integer, sqliteTable, text, real, primaryKey } from "drizzle-orm/sqlite-core";
import { v4 as uuidv4 } from "uuid";

export const npmUsers = sqliteTable("npm_users", {
    id: text().primaryKey().$default(() => uuidv4()),
    username: text().notNull().unique(),
    email: text(),
    enable: integer({ mode: "boolean" }).notNull().$default(() => true),
});

export const scans = sqliteTable("scans", {
    id: text().primaryKey().$default(() => uuidv4()),
    npmUserId: text().notNull().references(() => npmUsers.id),
    type: text({ enum: ["author", "maintainer"] }).notNull(),
    scannedAt: integer({ mode: "timestamp" }).notNull(),
    total: integer().notNull(),
});

export const packages = sqliteTable("packages", {
    id: text().primaryKey().$default(() => uuidv4()),
    publisherId: text().notNull().references(() => npmUsers.id),
    name: text().notNull().unique(),
    sanitizedName: text().notNull(),
    version: text().notNull(),
    description: text(),
    license: text(),
    publishDate: integer({ mode: "timestamp" }),
    updated: integer({ mode: "timestamp" }),
    repository: text(),
    homepage: text(),
    bugs: text(),
    npm: text(),
});

export const packageMaintainers = sqliteTable(
    "package_maintainers",
    {
        packageId: text().notNull().references(() => packages.id),
        userId: text().notNull().references(() => npmUsers.id),
    },
    (table) => [
        primaryKey({
            columns: [table.packageId, table.userId],
        }),
    ]
);

export const packageKeywords = sqliteTable(
    "package_keywords",
    {
        packageId: text().notNull().references(() => packages.id),
        keyword: text().notNull(),
    },
    (table) => [
        primaryKey({
            columns: [table.packageId, table.keyword],
        }),
    ]
);

export const scanPackages = sqliteTable(
    "scan_packages",
    {
        id: text().primaryKey().$default(() => uuidv4()),
        packageId: text().notNull().references(() => packages.id),
        scanId: text().notNull().references(() => scans.id),
        weeklyDownloads: integer().notNull(),
        monthlyDownloads: integer().notNull(),
        dependents: integer(),
        searchScore: real().notNull(),
        finalScore: real().notNull(),
        popularityScore: real().notNull(),
        qualityScore: real().notNull(),
        maintenanceScore: real().notNull(),
    }
);

export const flags = sqliteTable(
    "flags",
    {
        id: text().primaryKey().$default(() => uuidv4()),
        name: text().notNull(),
    }
);

export const packageFlags = sqliteTable(
    "package_flags",
    {
        scanPackageId: text().notNull().references(() => scanPackages.id),
        flagId: text().notNull().references(() => flags.id),
        value: integer({ mode: "boolean" }).notNull(),
    },
);

export const packageVersions = sqliteTable(
    "package_versions",
    {
        packageId: text().notNull().references(() => packages.id),
        version: text().notNull(),
        date: integer({ mode: "timestamp" }).notNull()
    },
    (table) => [
        primaryKey({
            columns: [table.packageId, table.version],
        }),
    ]
);
