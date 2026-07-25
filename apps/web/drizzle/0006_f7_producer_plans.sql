CREATE TABLE IF NOT EXISTS "platform_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"admin_accounts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"producer_plans" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "producer_access_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "producer_plan_months" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "producer_proof_url" text;