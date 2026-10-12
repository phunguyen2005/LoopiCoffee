ALTER TABLE customer_orders ADD COLUMN receipt_token_hash TEXT;
--> statement-breakpoint
ALTER TABLE customer_orders ADD COLUMN submission_key TEXT;
--> statement-breakpoint
ALTER TABLE customer_orders ADD COLUMN submission_hash TEXT;
--> statement-breakpoint
CREATE UNIQUE INDEX customer_orders_store_receipt_idx ON customer_orders(store_id, receipt_token_hash);
--> statement-breakpoint
CREATE UNIQUE INDEX customer_orders_store_submission_idx ON customer_orders(store_id, submission_key);
--> statement-breakpoint
CREATE TABLE order_rate_limits (
  bucket_key TEXT PRIMARY KEY NOT NULL,
  request_count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX order_rate_limits_expiry_idx ON order_rate_limits(expires_at);
