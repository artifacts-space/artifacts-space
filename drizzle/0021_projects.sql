CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"team_id" text,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"icon" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_scope_check" CHECK (("project"."user_id" is null) <> ("project"."team_id" is null)),
	CONSTRAINT "project_name_check" CHECK (char_length("project"."name") between 1 and 120),
	CONSTRAINT "project_icon_length_check" CHECK (char_length("project"."icon") <= 64)
);
--> statement-breakpoint
ALTER TABLE "artifact" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_user_key_idx" ON "project" USING btree ("user_id","name_key") WHERE "project"."user_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "project_team_key_idx" ON "project" USING btree ("team_id","name_key") WHERE "project"."team_id" is not null;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifact_project_idx" ON "artifact" USING btree ("project_id");