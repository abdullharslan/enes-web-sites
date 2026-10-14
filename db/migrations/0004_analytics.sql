CREATE TABLE "page_views_daily" (
	"day" date NOT NULL,
	"locale" text NOT NULL,
	"page" text NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "page_views_daily_day_locale_page_pk" PRIMARY KEY("day","locale","page")
);
