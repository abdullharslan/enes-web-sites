import { ButtonLink } from "@/components/ui/button-link";
import {
  DEFAULT_FILTER,
  filterProducts,
  parseCatalogFilter,
  serializeCatalogFilter,
  type CatalogFilter,
} from "@/lib/catalog/filter";
import type { Catalog } from "@/lib/catalog/schema";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { localePath, type Locale } from "@/lib/i18n/locales";
import { pluralize } from "@/lib/i18n/plural";
import { CatalogFilters } from "./catalog-filters";
import { ProductGrid } from "./product-grid";

export type RawSearchParams = Record<string, string | string[] | undefined>;

function toUrlSearchParams(raw: RawSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    // Repeated keys are ambiguous for single-value filters: keep the first.
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string") params.set(key, first);
  }
  return params;
}

interface CatalogBrowserProps {
  catalog: Catalog;
  searchParams: Promise<RawSearchParams>;
  locale: Locale;
  dict: Dictionary;
  /** Locale-less path of the listing, e.g. `/collection` or `/brands/rolex`. */
  basePath: string;
  /** Restricts the listing to one brand and hides the brand filter. */
  fixedBrand?: string;
  /** Heading level of product names, following the page outline. */
  cardHeadingLevel?: "h2" | "h3";
}

/** Filterable, sortable product listing driven entirely by the URL. */
export async function CatalogBrowser({
  catalog,
  searchParams,
  locale,
  dict,
  basePath,
  fixedBrand,
  cardHeadingLevel = "h2",
}: CatalogBrowserProps) {
  const scope = fixedBrand
    ? catalog.products.filter((p) => p.brand === fixedBrand)
    : catalog.products;
  const categorySlugs = new Set(scope.map((p) => p.category));
  const categories = catalog.categories.filter((c) => categorySlugs.has(c.slug));

  const parsed = parseCatalogFilter(toUrlSearchParams(await searchParams), {
    brands: catalog.brands.map((b) => b.slug),
    categories: categories.map((c) => c.slug),
  });
  const filter: CatalogFilter = fixedBrand ? { ...parsed, brand: fixedBrand } : parsed;
  const resetTo: CatalogFilter = { ...DEFAULT_FILTER, brand: fixedBrand ?? null };
  const products = filterProducts(scope, filter, locale);

  const hrefFor = (next: CatalogFilter) => {
    const query = serializeCatalogFilter(fixedBrand ? { ...next, brand: null } : next);
    return localePath(locale, query ? `${basePath}?${query}` : basePath);
  };

  return (
    <>
      <CatalogFilters
        filter={filter}
        brands={fixedBrand ? undefined : catalog.brands}
        categories={categories}
        locale={locale}
        labels={dict.catalog}
        hrefFor={hrefFor}
        resetTo={resetTo}
      />
      <p
        role="status"
        className="mt-12 mb-8 border-t border-line pt-8 text-xs uppercase tracking-label text-mist"
      >
        {pluralize(locale, products.length, dict.catalog.results)}
      </p>
      {products.length > 0 ? (
        <ProductGrid
          headingLevel={cardHeadingLevel}
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
