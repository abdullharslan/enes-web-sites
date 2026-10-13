import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { ProductGrid } from "@/components/catalog/product-grid";
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { BRANDS, BRAND_SLUGS } from "@/data/brands";
import { PRODUCTS } from "@/data/products";
import {
  filterProducts,
  parseCatalogFilter,
  serializeCatalogFilter,
} from "@/lib/catalog/filter";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionaries";
import { interpolate } from "@/lib/i18n/interpolate";
import { localePath, type Locale } from "@/lib/i18n/locales";

export async function generateMetadata(): Promise<Metadata> {
  const { dict } = await getDictionary();
  return { title: dict.catalog.title, description: dict.catalog.intro };
}

type SearchParams = PageProps<"/[locale]/collection">["searchParams"];

function toUrlSearchParams(raw: Awaited<SearchParams>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    // Repeated keys are ambiguous for single-value filters: keep the first.
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string") params.set(key, first);
  }
  return params;
}

async function FilteredCatalog({
  searchParams,
  locale,
  dict,
}: {
  searchParams: SearchParams;
  locale: Locale;
  dict: Dictionary;
}) {
  const filter = parseCatalogFilter(toUrlSearchParams(await searchParams), BRAND_SLUGS);
  const products = filterProducts(PRODUCTS, filter);
  const hrefFor = (next: typeof filter) => {
    const query = serializeCatalogFilter(next);
    return localePath(locale, query ? `/collection?${query}` : "/collection");
  };

  return (
    <>
      <CatalogFilters
        filter={filter}
        brands={BRANDS}
        labels={dict.catalog}
        hrefFor={hrefFor}
      />
      <p
        role="status"
        className="mt-12 mb-8 border-t border-line pt-8 text-xs uppercase tracking-label text-mist"
      >
        {interpolate(dict.catalog.results, { count: products.length })}
      </p>
      {products.length > 0 ? (
        <ProductGrid
          products={products}
          locale={locale}
          labels={dict.catalog}
          priorityCount={4}
        />
      ) : (
        <div className="flex flex-col items-start gap-6 py-10">
          <p className="max-w-xl text-mist">{dict.catalog.empty}</p>
          <ButtonLink href={localePath(locale, "/contact")} variant="outline">
            {dict.nav.contact}
          </ButtonLink>
        </div>
      )}
    </>
  );
}

function CatalogSkeleton() {
  return <div aria-hidden="true" className="h-96 animate-pulse bg-coal" />;
}

export default async function CollectionPage({
  searchParams,
}: PageProps<"/[locale]/collection">) {
  const { locale, dict } = await getDictionary();
  return (
    <>
      <PageHeader
        eyebrow={dict.catalog.eyebrow}
        title={dict.catalog.title}
        intro={dict.catalog.intro}
      />
      <div className="mx-auto max-w-screen-2xl px-4 py-16 sm:px-8">
        <Suspense fallback={<CatalogSkeleton />}>
          <FilteredCatalog searchParams={searchParams} locale={locale} dict={dict} />
        </Suspense>
      </div>
    </>
  );
}
