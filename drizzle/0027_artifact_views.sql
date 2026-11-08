CREATE TABLE "artifact_view_day" (
	"artifact_id" text NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	"visitors" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "artifact_view_day_artifact_id_day_pk" PRIMARY KEY("artifact_id","day")
);
--> statement-breakpoint
CREATE TABLE "artifact_view_referrer" (
	"artifact_id" text NOT NULL,
	"day" date NOT NULL,
	"domain" text NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "artifact_view_referrer_artifact_id_day_domain_pk" PRIMARY KEY("artifact_id","day","domain")
);
--> statement-breakpoint
CREATE TABLE "artifact_view_visitor" (
	"artifact_id" text NOT NULL,
	"day" date NOT NULL,
	"visitor" text NOT NULL,
	CONSTRAINT "artifact_view_visitor_artifact_id_day_visitor_pk" PRIMARY KEY("artifact_id","day","visitor")
);
--> statement-breakpoint
ALTER TABLE "artifact_view_day" ADD CONSTRAINT "artifact_view_day_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_view_referrer" ADD CONSTRAINT "artifact_view_referrer_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_view_visitor" ADD CONSTRAINT "artifact_view_visitor_artifact_id_artifact_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifact_view_visitor_day_idx" ON "artifact_view_visitor" USING btree ("day");