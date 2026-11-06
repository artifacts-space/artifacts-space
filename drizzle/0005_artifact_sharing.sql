CREATE TABLE "sharing_request" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"team_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"visibility" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifact" ADD COLUMN "public_id" text DEFAULT generate_public_id() NOT NULL;--> statement-breakpoint
ALTER TABLE "artifact" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "artifact" ADD COLUMN "original_author_id" text;--> statement-breakpoint
ALTER TABLE "sharing_request" ADD CONSTRAINT "sharing_request_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing_request" ADD CONSTRAINT "sharing_request_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing_request" ADD CONSTRAINT "sharing_request_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sharing_request" ADD CONSTRAINT "sharing_request_decided_by_user_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sharing_request_pending_artifact_idx" ON "sharing_request" USING btree ("artifact_id") WHERE "sharing_request"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "sharing_request_team_status_idx" ON "sharing_request" USING btree ("team_id","status");--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_original_author_id_user_id_fk" FOREIGN KEY ("original_author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_public_id_idx" ON "artifact" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "artifact_team_updated_idx" ON "artifact" USING btree ("team_id","updated_at");