ALTER TABLE "login_attempts" ADD COLUMN "ip" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
CREATE INDEX "login_attempts_ip_time_idx" ON "login_attempts" USING btree ("ip","created_at");