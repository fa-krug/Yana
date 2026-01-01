DROP INDEX IF EXISTS `articles_url_unique`;--> statement-breakpoint
DROP INDEX IF EXISTS `articles_url_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `articles_feed_url_idx` ON `articles` (`feed_id`, `url`);
