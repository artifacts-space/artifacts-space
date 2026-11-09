CREATE TABLE "mcp_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"oauth_client_id" text,
	"api_token_id" text,
	"client_name" text,
	"client_version" text,
	"harness_override" text,
	"client_changed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_connection_kind_check" CHECK (("mcp_connection"."oauth_client_id" is null) <> ("mcp_connection"."api_token_id" is null)),
	CONSTRAINT "mcp_connection_client_name_check" CHECK (char_length("mcp_connection"."client_name") <= 64),
	CONSTRAINT "mcp_connection_client_version_check" CHECK (char_length("mcp_connection"."client_version") <= 32),
	CONSTRAINT "mcp_connection_override_check" CHECK (char_length("mcp_connection"."harness_override") <= 32)
);
--> statement-breakpoint
ALTER TABLE "artifact" ADD COLUMN "harness" text;--> statement-breakpoint
ALTER TABLE "artifact" ADD COLUMN "harness_override" text;--> statement-breakpoint
ALTER TABLE "artifact_version" ADD COLUMN "harness" text;--> statement-breakpoint
ALTER TABLE "mcp_connection" ADD CONSTRAINT "mcp_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_connection" ADD CONSTRAINT "mcp_connection_oauth_client_id_oauth_client_client_id_fk" FOREIGN KEY ("oauth_client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mcp_connection" ADD CONSTRAINT "mcp_connection_api_token_id_api_token_id_fk" FOREIGN KEY ("api_token_id") REFERENCES "public"."api_token"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_connection_oauth_idx" ON "mcp_connection" USING btree ("user_id","oauth_client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_connection_token_idx" ON "mcp_connection" USING btree ("api_token_id");--> statement-breakpoint
ALTER TABLE "artifact" ADD CONSTRAINT "artifact_harness_length_check" CHECK (char_length("artifact"."harness") <= 32 and char_length("artifact"."harness_override") <= 32);--> statement-breakpoint
ALTER TABLE "artifact_version" ADD CONSTRAINT "artifact_version_harness_length_check" CHECK (char_length("artifact_version"."harness") <= 32);