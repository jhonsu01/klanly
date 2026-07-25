ALTER TABLE "communities" ADD COLUMN "manual_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "communities" ADD COLUMN "manual_accounts" jsonb DEFAULT '[]'::jsonb NOT NULL;