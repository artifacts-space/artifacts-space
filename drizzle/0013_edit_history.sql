ALTER TABLE "artifact" ADD COLUMN "updated_by" text;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD COLUMN "saved_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD COLUMN "save_kind" text DEFAULT 'edit' NOT NULL;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD COLUMN "restored_from_id" text;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD COLUMN "bytes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD CONSTRAINT "artifact_version_restored_from_id_artifact_version_id_fk" FOREIGN KEY ("restored_from_id") REFERENCES "public"."artifact_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifact_version_saved_idx" ON "artifact_version" USING btree ("saved_at");