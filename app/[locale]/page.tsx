import type { Metadata } from "next";
import { AboutTeaser } from "@/components/home/about-teaser";
import { BrandSelector } from "@/components/home/brand-selector";
import { CategoryTiles } from "@/components/home/category-tiles";
import { Hero } from "@/components/home/hero";
import { JournalList } from "@/components/home/journal-list";
import { NewArrivals } from "@/components/home/new-arrivals";
import { SellCta } from "@/components/home/sell-cta";
import { SoldHighlights } from "@/components/home/sold-highlights";
import { Story } from "@/components/home/story";
import { TrustBar } from "@/components/home/trust-bar";
import { ButtonLink } from "@/components/ui/button-link";
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import { JOURNAL } from "@/db/seed-data/journal";
import { DEFAULT_FILTER, serializeCatalogFilter } from "@/lib/catalog/filter";
import { getNewArrivals, getSoldHighlights } from "@/lib/catalog/queries";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localePath } from "@/lib/i18n/locales";
import { pageMetadata } from "@/lib/seo";
import { getCatalog } from "@/lib/server/catalog";

const NEW_ARRIVALS_LIMIT = 8;
const SOLD_HIGHLIGHTS_LIMIT = 4;

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getDictionary();
  return pageMetadata(locale, "/");
}

export default async function HomePage() {
  const [{ locale, dict }, catalog] = await Promise.all([getDictionary(), getCatalog()]);
  const href = (path: string) => localePath(locale, path);
  const collectionHref = (query: string) =>
    href(query ? `/collection?${query}` : "/collection");

  return (
    <>
      <Hero
        dict={dict.hero}
        collectionHref={href("/collection")}
        sellHref={href("/sell")}
      />
      <BrandSelector
        brands={catalog.brands}
        dict={dict.brands}
        hrefFor={(brand) =>
          collectionHref(serializeCatalogFilter({ ...DEFAULT_FILTER, brand }))
        }
      />
      <AboutTeaser dict={dict.about} aboutHref={href("/about")} />
      <NewArrivals
        products={getNewArrivals(catalog.products, NEW_ARRIVALS_LIMIT)}
        locale={locale}
        dict={dict.newArrivals}
        catalogLabels={dict.catalog}
        collectionHref={href("/collection")}
      />
      <CategoryTiles
        categories={catalog.categories}
        locale={locale}
        dict={dict.categories}
        hrefFor={(category) =>
          collectionHref(serializeCatalogFilter({ ...DEFAULT_FILTER, category }))
        }
      />
      <TrustBar dict={dict.trust} />
      <SoldHighlights
        products={getSoldHighlights(catalog.products, SOLD_HIGHLIGHTS_LIMIT)}
        locale={locale}
        dict={dict.sold}
        catalogLabels={dict.catalog}
      />
      <SellCta dict={dict.sellCta} sellHref={href("/sell")} />
      <Story dict={dict.story} contactHref={href("/contact")} />
      <Section labelledBy="journal-title" tone="coal">
        <div className="mb-12 flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <SectionHeading
            id="journal-title"
            eyebrow={dict.journal.eyebrow}
            title={dict.journal.title}
          />
          <ButtonLink href={href("/journal")} variant="outline">
            {dict.journal.overview}
          </ButtonLink>
        </div>
        <JournalList entries={JOURNAL} locale={locale} />
      </Section>
    </>
  );
}
