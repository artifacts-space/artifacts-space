CREATE TABLE "team_permission_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"subject" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_role" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"built_in" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_role_key_length_check" CHECK (char_length("team_role"."key") between 1 and 40),
	CONSTRAINT "team_role_name_length_check" CHECK (char_length("team_role"."name") between 1 and 40)
);
--> statement-breakpoint
CREATE TABLE "team_role_assignment" (
	"member_id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"assigned_by" text,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_role_capability" (
	"role_id" text NOT NULL,
	"capability" text NOT NULL,
	CONSTRAINT "team_role_capability_role_id_capability_pk" PRIMARY KEY("role_id","capability")
);
--> statement-breakpoint
ALTER TABLE "team_permission_audit" ADD CONSTRAINT "team_permission_audit_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_permission_audit" ADD CONSTRAINT "team_permission_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_role" ADD CONSTRAINT "team_role_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_role_assignment" ADD CONSTRAINT "team_role_assignment_member_id_team_member_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."team_member"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_role_assignment" ADD CONSTRAINT "team_role_assignment_role_id_team_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."team_role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_role_assignment" ADD CONSTRAINT "team_role_assignment_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_role_capability" ADD CONSTRAINT "team_role_capability_role_id_team_role_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."team_role"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_permission_audit_team_idx" ON "team_permission_audit" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "team_role_team_key_idx" ON "team_role" USING btree ("team_id","key");--> statement-breakpoint
CREATE INDEX "team_role_assignment_role_idx" ON "team_role_assignment" USING btree ("role_id");