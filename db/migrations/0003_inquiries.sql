CREATE TYPE "public"."inquiry_kind" AS ENUM('product', 'contact', 'sell');--> statement-breakpoint
CREATE TYPE "public"."inquiry_status" AS ENUM('new', 'in_progress', 'done');--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"kind" "inquiry_kind" NOT NULL,
	"status" "inquiry_status" DEFAULT 'new' NOT NULL,
	"locale" text NOT NULL,
	"product_slug" text,
	"data" jsonb NOT NULL,
	"submission_key" uuid,
	"address_hash" text,
	"handled_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inquiries_submission_key_unique" UNIQUE("submission_key")
);
--> statement-breakpoint
CREATE TABLE "inquiry_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inquiry_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"key" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"bytes" integer NOT NULL,
	CONSTRAINT "inquiry_photos_key_unique" UNIQUE("key"),
	CONSTRAINT "inquiry_photos_position_uq" UNIQUE("inquiry_id","position")
);
--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_handled_by_users_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry_photos" ADD CONSTRAINT "inquiry_photos_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inquiries_status_time_idx" ON "inquiries" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "inquiries_address_time_idx" ON "inquiries" USING btree ("address_hash","created_at");