CREATE TABLE "artifact_edit_lease" (
	"artifact_id" text NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "artifact_edit_lease_artifact_id_user_id_pk" PRIMARY KEY("artifact_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "artifact" ADD COLUMN "person_saved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "artifact_edit_lease" ADD CONSTRAINT "artifact_edit_lease_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_edit_lease" ADD CONSTRAINT "artifact_edit_lease_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifact_edit_lease_expires_idx" ON "artifact_edit_lease" USING btree ("expires_at");