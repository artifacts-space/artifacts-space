ALTER TABLE "artifact" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_icon_length_check" CHECK (char_length("artifact"."icon") <= 64);