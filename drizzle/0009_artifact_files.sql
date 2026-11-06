CREATE TABLE "artifact_file" (
	"id" text PRIMARY KEY NOT NULL,
	"uploader_id" text,
	"artifact_id" text,
	"key" text NOT NULL,
	"filename" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_file_size_check" CHECK ("artifact_file"."size" > 0 and "artifact_file"."size" <= 26214400)
);
--> statement-breakpoint
ALTER TABLE "artifact_file" ADD CONSTRAINT "artifact_file_uploader_id_user_id_fk" FOREIGN KEY ("uploader_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_file" ADD CONSTRAINT "artifact_file_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "artifact_file_key_idx" ON "artifact_file" USING btree ("key");--> statement-breakpoint
CREATE INDEX "artifact_file_artifact_idx" ON "artifact_file" USING btree ("artifact_id");--> statement-breakpoint
CREATE INDEX "artifact_file_uploader_status_idx" ON "artifact_file" USING btree ("uploader_id","status");--> statement-breakpoint
CREATE INDEX "artifact_file_status_created_idx" ON "artifact_file" USING btree ("status","created_at");