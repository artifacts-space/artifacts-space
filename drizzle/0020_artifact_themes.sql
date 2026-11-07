ALTER TABLE "artifact" ADD COLUMN "theme" jsonb;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD COLUMN "theme" jsonb;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_theme_size_check" CHECK (octet_length("artifact"."theme"::text) <= 16000);