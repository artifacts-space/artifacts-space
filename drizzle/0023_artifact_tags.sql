ALTER TABLE "artifact" ADD COLUMN "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
CREATE INDEX "artifact_tags_idx" ON "artifact" USING gin ("tags");--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_tags_count_check" CHECK (cardinality("artifact"."tags") <= 20);