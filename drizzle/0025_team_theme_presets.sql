CREATE TABLE "team_theme_preset" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"theme" jsonb NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_theme_preset_slug_length_check" CHECK (char_length("team_theme_preset"."slug") <= 56),
	CONSTRAINT "team_theme_preset_name_length_check" CHECK (char_length("team_theme_preset"."name") <= 60),
	CONSTRAINT "team_theme_preset_description_length_check" CHECK (char_length("team_theme_preset"."description") <= 160),
	CONSTRAINT "team_theme_preset_theme_size_check" CHECK (octet_length("team_theme_preset"."theme"::text) <= 16000)
);
--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "default_theme" text;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "default_theme_set_by" text;--> statement-breakpoint
ALTER TABLE "team" ADD COLUMN "default_theme_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "team_theme_preset" ADD CONSTRAINT "team_theme_preset_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_theme_preset" ADD CONSTRAINT "team_theme_preset_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_theme_preset" ADD CONSTRAINT "team_theme_preset_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_theme_preset_slug_idx" ON "team_theme_preset" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "team_theme_preset_team_idx" ON "team_theme_preset" USING btree ("team_id","created_at");--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_default_theme_set_by_user_id_fk" FOREIGN KEY ("default_theme_set_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_default_theme_length_check" CHECK (char_length("team"."default_theme") <= 64);