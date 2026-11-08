ALTER TABLE "artifact" ADD COLUMN "cover" text;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD COLUMN "cover" text;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_cover_length_check" CHECK (char_length("artifact"."cover") <= 64);