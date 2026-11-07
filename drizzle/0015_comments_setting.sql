ALTER TABLE "artifact" ADD COLUMN "comments" text DEFAULT 'signed_in' NOT NULL;--> statement-breakpoint
ALTER TABLE "sharing_request" ADD COLUMN "comments" text;--> statement-breakpoint
CREATE INDEX "agent_owner_idx" ON "agent" USING btree ("owner_id");--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_comments_check" CHECK ("artifact"."comments" in ('off', 'team', 'signed_in'));