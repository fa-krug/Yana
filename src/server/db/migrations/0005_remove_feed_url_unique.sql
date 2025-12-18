DROP INDEX IF EXISTS `articles_feed_url_idx`;--> statement-breakpoint
CREATE INDEX `articles_feed_url_idx` ON `articles` (`feed_id`, `url`);--> statement-breakpoint
