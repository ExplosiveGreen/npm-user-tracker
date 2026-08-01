CREATE TABLE `flags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `npm_users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text,
	`enable` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `npm_users_username_unique` ON `npm_users` (`username`);--> statement-breakpoint
CREATE TABLE `package_flags` (
	`scanPackageId` text NOT NULL,
	`flagId` text NOT NULL,
	`value` integer NOT NULL,
	FOREIGN KEY (`scanPackageId`) REFERENCES `scan_packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`flagId`) REFERENCES `flags`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `package_keywords` (
	`packageId` text NOT NULL,
	`keyword` text NOT NULL,
	PRIMARY KEY(`packageId`, `keyword`),
	FOREIGN KEY (`packageId`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `package_maintainers` (
	`packageId` text NOT NULL,
	`userId` text NOT NULL,
	PRIMARY KEY(`packageId`, `userId`),
	FOREIGN KEY (`packageId`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`userId`) REFERENCES `npm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `package_versions` (
	`packageId` text NOT NULL,
	`version` text NOT NULL,
	`date` integer NOT NULL,
	PRIMARY KEY(`packageId`, `version`),
	FOREIGN KEY (`packageId`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `packages` (
	`id` text PRIMARY KEY NOT NULL,
	`publisherId` text NOT NULL,
	`name` text NOT NULL,
	`sanitizedName` text NOT NULL,
	`version` text NOT NULL,
	`description` text,
	`license` text,
	`publishDate` integer,
	`updated` integer,
	`repository` text,
	`homepage` text,
	`bugs` text,
	`npm` text,
	FOREIGN KEY (`publisherId`) REFERENCES `npm_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `packages_name_unique` ON `packages` (`name`);--> statement-breakpoint
CREATE TABLE `scan_packages` (
	`id` text PRIMARY KEY NOT NULL,
	`packageId` text NOT NULL,
	`scanId` text NOT NULL,
	`weeklyDownloads` integer NOT NULL,
	`monthlyDownloads` integer NOT NULL,
	`dependents` integer,
	`searchScore` real NOT NULL,
	`finalScore` real NOT NULL,
	`popularityScore` real NOT NULL,
	`qualityScore` real NOT NULL,
	`maintenanceScore` real NOT NULL,
	FOREIGN KEY (`packageId`) REFERENCES `packages`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`scanId`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `scans` (
	`id` text PRIMARY KEY NOT NULL,
	`npmUserId` text NOT NULL,
	`type` text NOT NULL,
	`scannedAt` integer NOT NULL,
	`total` integer NOT NULL,
	FOREIGN KEY (`npmUserId`) REFERENCES `npm_users`(`id`) ON UPDATE no action ON DELETE no action
);
