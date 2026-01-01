CREATE TABLE `articles` (
	`id` integer PRIMARY KEY NOT NULL,
	`feed_id` integer NOT NULL,
	`name` text NOT NULL,
	`url` text NOT NULL,
	`date` integer NOT NULL,
	`content` text NOT NULL,
	`thumbnail_url` text,
	`media_url` text,
	`duration` integer,
	`view_count` integer,
	`media_type` text,
	`author` text,
	`external_id` text,
	`score` integer,
	`ai_processed` integer DEFAULT false NOT NULL,
	`ai_error` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `feed_groups` (
	`id` integer PRIMARY KEY NOT NULL,
	`feed_id` integer NOT NULL,
	`group_id` integer NOT NULL,
	FOREIGN KEY (`feed_id`) REFERENCES `feeds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `feeds` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` integer,
	`name` text NOT NULL,
	`identifier` text NOT NULL,
	`feed_type` text DEFAULT 'article' NOT NULL,
	`icon` text,
	`example` text DEFAULT '' NOT NULL,
	`aggregator` text DEFAULT 'full_website' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`generate_title_image` integer DEFAULT true NOT NULL,
	`add_source_footer` integer DEFAULT true NOT NULL,
	`skip_duplicates` integer DEFAULT true NOT NULL,
	`use_current_timestamp` integer DEFAULT true NOT NULL,
	`daily_post_limit` integer DEFAULT 50 NOT NULL,
	`aggregator_options` text DEFAULT '{}' NOT NULL,
	`ai_translate_to` text DEFAULT '' NOT NULL,
	`ai_summarize` integer DEFAULT false NOT NULL,
	`ai_custom_prompt` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `greader_auth_tokens` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`user_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` integer PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`result` text,
	`error` text,
	`retries` integer DEFAULT 0 NOT NULL,
	`max_retries` integer DEFAULT 3 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer
);
--> statement-breakpoint
CREATE TABLE `user_ai_quotas` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`daily_limit` integer DEFAULT 200 NOT NULL,
	`monthly_limit` integer DEFAULT 2000 NOT NULL,
	`daily_used` integer DEFAULT 0 NOT NULL,
	`monthly_used` integer DEFAULT 0 NOT NULL,
	`daily_reset_at` integer NOT NULL,
	`monthly_reset_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_article_states` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`article_id` integer NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`is_saved` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`reddit_enabled` integer DEFAULT false NOT NULL,
	`reddit_client_id` text DEFAULT '' NOT NULL,
	`reddit_client_secret` text DEFAULT '' NOT NULL,
	`reddit_user_agent` text DEFAULT 'Yana/1.0' NOT NULL,
	`youtube_enabled` integer DEFAULT false NOT NULL,
	`youtube_api_key` text DEFAULT '' NOT NULL,
	`openai_enabled` integer DEFAULT false NOT NULL,
	`openai_api_url` text DEFAULT 'https://api.openai.com/v1' NOT NULL,
	`openai_api_key` text DEFAULT '' NOT NULL,
	`ai_model` text DEFAULT 'gpt-4o-mini' NOT NULL,
	`ai_temperature` real DEFAULT 0.3 NOT NULL,
	`ai_max_tokens` integer DEFAULT 2000 NOT NULL,
	`ai_default_daily_limit` integer DEFAULT 200 NOT NULL,
	`ai_default_monthly_limit` integer DEFAULT 2000 NOT NULL,
	`ai_max_prompt_length` integer DEFAULT 500 NOT NULL,
	`ai_request_timeout` integer DEFAULT 120 NOT NULL,
	`ai_max_retries` integer DEFAULT 3 NOT NULL,
	`ai_retry_delay` integer DEFAULT 2 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`is_superuser` integer DEFAULT false NOT NULL,
	`is_staff` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `articles_url_unique` ON `articles` (`url`);--> statement-breakpoint
CREATE UNIQUE INDEX `articles_url_idx` ON `articles` (`url`);--> statement-breakpoint
CREATE INDEX `articles_feed_id_idx` ON `articles` (`feed_id`);--> statement-breakpoint
CREATE INDEX `articles_date_idx` ON `articles` (`date`);--> statement-breakpoint
CREATE INDEX `articles_feed_date_idx` ON `articles` (`feed_id`,`date`);--> statement-breakpoint
CREATE INDEX `articles_feed_name_created_idx` ON `articles` (`feed_id`,`name`,`created_at`);--> statement-breakpoint
CREATE INDEX `articles_feed_created_idx` ON `articles` (`feed_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `articles_feed_date_id_idx` ON `articles` (`feed_id`,`date`,`id`);--> statement-breakpoint
CREATE INDEX `articles_external_id_idx` ON `articles` (`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `feed_groups_feed_group_idx` ON `feed_groups` (`feed_id`,`group_id`);--> statement-breakpoint
CREATE INDEX `feed_groups_feed_id_idx` ON `feed_groups` (`feed_id`);--> statement-breakpoint
CREATE INDEX `feed_groups_group_id_idx` ON `feed_groups` (`group_id`);--> statement-breakpoint
CREATE INDEX `feeds_user_id_idx` ON `feeds` (`user_id`);--> statement-breakpoint
CREATE INDEX `feeds_feed_type_idx` ON `feeds` (`feed_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `greader_auth_tokens_token_unique` ON `greader_auth_tokens` (`token`);--> statement-breakpoint
CREATE UNIQUE INDEX `greader_auth_tokens_token_idx` ON `greader_auth_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `greader_auth_tokens_user_id_idx` ON `greader_auth_tokens` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `groups_name_user_idx` ON `groups` (`name`,`user_id`);--> statement-breakpoint
CREATE INDEX `groups_user_id_idx` ON `groups` (`user_id`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_type_status_idx` ON `tasks` (`type`,`status`);--> statement-breakpoint
CREATE INDEX `tasks_created_at_idx` ON `tasks` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_ai_quotas_user_id_unique` ON `user_ai_quotas` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_ai_quotas_user_id_idx` ON `user_ai_quotas` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_article_states_user_article_idx` ON `user_article_states` (`user_id`,`article_id`);--> statement-breakpoint
CREATE INDEX `user_article_states_user_read_idx` ON `user_article_states` (`user_id`,`is_read`);--> statement-breakpoint
CREATE INDEX `user_article_states_user_saved_idx` ON `user_article_states` (`user_id`,`is_saved`);--> statement-breakpoint
CREATE INDEX `user_article_states_user_article_read_idx` ON `user_article_states` (`user_id`,`article_id`,`is_read`);--> statement-breakpoint
CREATE INDEX `user_article_states_user_read_article_idx` ON `user_article_states` (`user_id`,`is_read`,`article_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_user_id_unique` ON `user_settings` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_user_id_idx` ON `user_settings` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_idx` ON `users` (`username`);
