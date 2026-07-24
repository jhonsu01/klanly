ALTER TABLE "payout_methods" ADD COLUMN "account_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "producer_status" text DEFAULT 'none' NOT NULL;