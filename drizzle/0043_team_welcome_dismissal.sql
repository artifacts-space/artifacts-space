CREATE TABLE "team_welcome_dismissal" (
	"user_id" text NOT NULL,
	"team_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_welcome_dismissal_user_id_team_id_pk" PRIMARY KEY("user_id","team_id")
);
--> statement-breakpoint
ALTER TABLE "team_welcome_dismissal" ADD CONSTRAINT "team_welcome_dismissal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_welcome_dismissal" ADD CONSTRAINT "team_welcome_dismissal_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_welcome_dismissal_team_idx" ON "team_welcome_dismissal" USING btree ("team_id");