ALTER TABLE "comment" ADD COLUMN "quote" text;--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "quote_prefix" text;--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "quote_suffix" text;--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "comment" ADD COLUMN "resolved_by" text;--> statement-breakpoint
ALTER TABLE "comment" ADD CONSTRAINT "comment_resolved_by_user_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;