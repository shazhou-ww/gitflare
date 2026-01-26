CREATE TABLE `git_object_index` (
	`oid` text PRIMARY KEY NOT NULL,
	`pack_id` text NOT NULL,
	`pack_offset` integer NOT NULL,
	`compressed_size` integer NOT NULL,
	`type` text NOT NULL,
	`is_delta` integer DEFAULT false NOT NULL,
	`base_oid` text,
	FOREIGN KEY (`pack_id`) REFERENCES `git_packs`(`pack_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_object_pack` ON `git_object_index` (`pack_id`);--> statement-breakpoint
CREATE TABLE `git_packs` (
	`pack_id` text PRIMARY KEY NOT NULL,
	`r2_key` text NOT NULL,
	`object_count` integer,
	`size_bytes` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `git_refs` (
	`name` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`is_symbolic` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
