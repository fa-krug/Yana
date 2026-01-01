CREATE TABLE `task_executions` (
	`id` integer PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`executed_at` integer NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`duration` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `task_executions_task_id_idx` ON `task_executions` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_executions_executed_at_idx` ON `task_executions` (`executed_at`);--> statement-breakpoint
CREATE INDEX `task_executions_status_idx` ON `task_executions` (`status`);
