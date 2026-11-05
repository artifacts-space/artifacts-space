CREATE TABLE "api_token" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "artifact" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"content" text NOT NULL,
	"kind" text DEFAULT 'markdown' NOT NULL,
	"language" text DEFAULT '' NOT NULL,
	"project" text DEFAULT '' NOT NULL,
	"session_id" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"share_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "api_token_hash_idx" ON "api_token" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "api_token_user_idx" ON "api_token" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_share_id_idx" ON "artifact" USING btree ("share_id");--> statement-breakpoint
CREATE INDEX "artifact_user_updated_idx" ON "artifact" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "artifact_user_project_idx" ON "artifact" USING btree ("user_id","project");