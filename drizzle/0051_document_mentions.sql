ALTER TABLE "mention" ALTER COLUMN "comment_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mention" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "mention" ADD CONSTRAINT "mention_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mention_document_recipient_idx" ON "mention" USING btree ("artifact_id","recipient_id") WHERE "mention"."comment_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "notification_recipient_document_mention_idx" ON "notification" USING btree ("recipient_id","artifact_id") WHERE "notification"."type" = 'mention' and "notification"."comment_id" is null and "notification"."request_id" is null;