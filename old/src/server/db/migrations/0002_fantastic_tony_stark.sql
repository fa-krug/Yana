CREATE TABLE IF NOT EXISTS `sessions` (
	`sid` text PRIMARY KEY NOT NULL,
	`sess` text NOT NULL,
	`expire` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sessions_expire_idx` ON `sessions` (`expire`);