ALTER TABLE "inquiries" ADD COLUMN "first_completed_at" timestamp with time zone;--> statement-breakpoint
-- The best known completion time of inquiries finished before this column existed.
UPDATE "inquiries" SET "first_completed_at" = "updated_at" WHERE "status" = 'done';
