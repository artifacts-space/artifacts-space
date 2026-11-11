CREATE TABLE "artifact_file_copy" (
	"id" text PRIMARY KEY NOT NULL,
	"file_id" text,
	"artifact_id" text,
	"key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"uploader_id" text,
	"current_from" timestamp with time zone,
	"replaced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replaced_by" text,
	"version_id" text,
	CONSTRAINT "artifact_file_copy_size_check" CHECK ("artifact_file_copy"."size" > 0 and "artifact_file_copy"."size" <= 26214400)
);
--> statement-breakpoint
ALTER TABLE "artifact_file" ADD COLUMN "replaced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "artifact_file_copy" ADD CONSTRAINT "artifact_file_copy_file_id_artifact_file_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."artifact_file"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_file_copy" ADD CONSTRAINT "artifact_file_copy_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_file_copy" ADD CONSTRAINT "artifact_file_copy_uploader_id_user_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_file_copy" ADD CONSTRAINT "artifact_file_copy_replaced_by_user_id_fk" FOREIGN KEY ("replaced_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_file_copy" ADD CONSTRAINT "artifact_file_copy_version_id_artifact_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."artifact_version"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_file_copy_key_idx" ON "artifact_file_copy" USING btree ("key");--> statement-breakpoint
CREATE INDEX "artifact_file_copy_file_replaced_idx" ON "artifact_file_copy" USING btree ("file_id","replaced_at");--> statement-breakpoint
CREATE INDEX "artifact_file_copy_artifact_idx" ON "artifact_file_copy" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "artifact_file_copy_uploader_idx" ON "artifact_file_copy" USING btree ("uploader_id");--> statement-breakpoint
CREATE INDEX "artifact_file_copy_replaced_by_idx" ON "artifact_file_copy" USING btree ("replaced_by");--> statement-breakpoint
CREATE INDEX "artifact_file_copy_version_idx" ON "artifact_file_copy" USING btree ("version_id");