CREATE TABLE "team_theme_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"kind" text NOT NULL,
	"preset_id" text,
	"name" text,
	"theme" jsonb,
	"default_theme" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_theme_revision_kind_check" CHECK ("team_theme_revision"."kind" in ('preset', 'default')),
	CONSTRAINT "team_theme_revision_preset_check" CHECK ("team_theme_revision"."kind" <> 'preset' or ("team_theme_revision"."preset_id" is not null and "team_theme_revision"."theme" is not null)),
	CONSTRAINT "team_theme_revision_name_length_check" CHECK (char_length("team_theme_revision"."name") <= 60),
	CONSTRAINT "team_theme_revision_default_length_check" CHECK (char_length("team_theme_revision"."default_theme") <= 64),
	CONSTRAINT "team_theme_revision_theme_size_check" CHECK (octet_length("team_theme_revision"."theme"::text) <= 16000)
);
--> statement-breakpoint
ALTER TABLE "team_theme_revision" ADD CONSTRAINT "team_theme_revision_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_theme_revision" ADD CONSTRAINT "team_theme_revision_preset_id_team_theme_preset_id_fk" FOREIGN KEY ("preset_id") REFERENCES "public"."team_theme_preset"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_theme_revision" ADD CONSTRAINT "team_theme_revision_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_theme_revision_preset_idx" ON "team_theme_revision" USING btree ("preset_id","created_at");--> statement-breakpoint
CREATE INDEX "team_theme_revision_team_idx" ON "team_theme_revision" USING btree ("team_id","kind","created_at");--> statement-breakpoint
-- Backfill: each existing preset and team default starts its history with its current state, so the first change can be undone.
INSERT INTO "team_theme_revision" ("id", "team_id", "kind", "preset_id", "name", "theme", "created_by", "created_at")
SELECT gen_random_uuid()::text, "team_id", 'preset', "id", "name", "theme", coalesce("updated_by", "created_by"), "updated_at" FROM "team_theme_preset";--> statement-breakpoint
INSERT INTO "team_theme_revision" ("id", "team_id", "kind", "default_theme", "created_by", "created_at")
SELECT gen_random_uuid()::text, "id", 'default', "default_theme", "default_theme_set_by", "default_theme_set_at" FROM "team" WHERE "default_theme_set_at" IS NOT NULL;
