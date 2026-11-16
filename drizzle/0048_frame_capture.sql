CREATE TABLE "frame_capture" (
	"id" text PRIMARY KEY NOT NULL,
	"artifact_id" text NOT NULL,
	"mode" text NOT NULL,
	"frame_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"part_count" integer NOT NULL,
	"columns" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"drawn_height" integer NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"partial" boolean DEFAULT false NOT NULL,
	"captured_by" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"captured_at" timestamp with time zone,
	CONSTRAINT "frame_capture_mode_check" CHECK ("frame_capture"."mode" in ('light', 'dark')),
	CONSTRAINT "frame_capture_status_check" CHECK ("frame_capture"."status" in ('pending', 'ready', 'removed')),
	CONSTRAINT "frame_capture_type_check" CHECK ("frame_capture"."content_type" in ('image/webp', 'image/jpeg')),
	CONSTRAINT "frame_capture_parts_check" CHECK ("frame_capture"."part_count" between 1 and 12 and "frame_capture"."columns" between 1 and 2),
	CONSTRAINT "frame_capture_bytes_check" CHECK ("frame_capture"."bytes" > 0 and "frame_capture"."bytes" <= 3686400)
);
--> statement-breakpoint
ALTER TABLE "frame_capture" ADD CONSTRAINT "frame_capture_captured_by_user_id_fk" FOREIGN KEY ("captured_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "frame_capture_content_idx" ON "frame_capture" USING btree ("artifact_id","frame_hash","mode","status");--> statement-breakpoint
CREATE INDEX "frame_capture_captured_by_idx" ON "frame_capture" USING btree ("captured_by","status");--> statement-breakpoint
CREATE INDEX "frame_capture_status_started_idx" ON "frame_capture" USING btree ("status","started_at");