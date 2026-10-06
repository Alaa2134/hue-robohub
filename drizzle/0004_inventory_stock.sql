ALTER TABLE "inventory_items" ADD COLUMN "sku" text;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "min_quantity" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "unit_cost" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "inventory_items" ADD COLUMN "datasheet_url" text;--> statement-breakpoint
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_min_nonneg" CHECK ("inventory_items"."min_quantity" >= 0);