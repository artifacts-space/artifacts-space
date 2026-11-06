CREATE TABLE "artifact_report" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"team_id" text,
	"reason" text NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"reporter_id" text,
	"reporter_key" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "artifact_version" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"title" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"content" text NOT NULL,
	"kind" text NOT NULL,
	"language" text DEFAULT '' NOT NULL,
	"project" text DEFAULT '' NOT NULL,
	"source" text DEFAULT '' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit_bucket" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_bucket_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
ALTER TABLE "artifact" ADD COLUMN "approved_version_id" text;--> statement-breakpoint
ALTER TABLE "sharing_request" ADD COLUMN "kind" text DEFAULT 'sharing' NOT NULL;--> statement-breakpoint
ALTER TABLE "sharing_request" ADD COLUMN "version_id" text;--> statement-breakpoint
ALTER TABLE "artifact_report" ADD CONSTRAINT "artifact_report_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_report" ADD CONSTRAINT "artifact_report_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_report" ADD CONSTRAINT "artifact_report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_report" ADD CONSTRAINT "artifact_report_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD CONSTRAINT "artifact_version_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD CONSTRAINT "artifact_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifact_report_team_status_idx" ON "artifact_report" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "artifact_report_artifact_idx" ON "artifact_report" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "artifact_version_artifact_created_idx" ON "artifact_version" USING btree ("artifact_id","created_at");--> statement-breakpoint
CREATE INDEX "rate_limit_bucket_window_idx" ON "rate_limit_bucket" USING btree ("window_start");--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_approved_version_id_artifact_version_id_fk" FOREIGN KEY ("approved_version_id") REFERENCES "public"."artifact_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing_request" ADD CONSTRAINT "sharing_request_version_id_artifact_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."artifact_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sharing_request_pending_artifact_kind_idx" ON "sharing_request" USING btree ("artifact_id","kind") WHERE "sharing_request"."status" = 'pending';--> statement-breakpoint
DROP INDEX "sharing_request_pending_artifact_idx";--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_content_size_check" CHECK (octet_length("artifact"."content") <= 1048576);--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_metadata_size_check" CHECK (octet_length("artifact"."metadata"::text) <= 131072);