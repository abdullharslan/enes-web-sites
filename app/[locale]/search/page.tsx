import type { Metadata } from "next";
import type { RawSearchParams } from "@/components/catalog/catalog-browser";
import { ProductGrid } from "@/components/catalog/product-grid";
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { MAX_QUERY_LENGTH, searchProducts } from "@/lib/catalog/search";
import { getDictionary, type Dictionary } from "@/lib/i18n/dictionaries";
import { interpolate } from "@/lib/i18n/interpolate";
import { localePath, type Locale } from "@/lib/i18n/locales";
import { pluralize } from "@/lib/i18n/plural";
import { pageMetadata } from "@/lib/seo";
import { getCatalog } from "@/lib/server/catalog";

/*
 * Results render on the server before the response is sent (no streamed
 * <Suspense> hole), so search works without JavaScript and in any crawler.
 */
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  const { locale, dict } = await getDictionary();
  return pageMetadata(locale, "/search", { title: dict.search.title, noIndex: true });
}

async function Results({
  searchParams,
  locale,
  dict,
}: {
  searchParams: Promise<RawSearchParams>;
  locale: Locale;
  dict: Dictionary;
}) {
  const raw = (await searchParams).q;
  const query =
    (Array.isArray(raw) ? raw[0] : raw)?.trim().slice(0, MAX_QUERY_LENGTH) ?? "";
  const s = dict.search;

  return (
    <>
      <form
        role="search"
        action={localePath(locale, "/search")}
        method="get"
        className="mb-12 flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex flex-1 flex-col gap-2">
          <label
            htmlFor="search-q"
            className="text-xs font-semibold uppercase tracking-label"
          >
            {s.label}
          </label>
          <input
            id="search-q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder={s.placeholder}
            maxLength={MAX_QUERY_LENGTH}
            className="min-h-12 w-full border border-line bg-ink px-4 text-cream placeholder:text-mist focus:border-gold"
          />
        </div>
        <button
          type="submit"
          className="min-h-12 bg-gold px-8 text-xs font-semibold uppercase tracking-label text-ink transition-colors hover:bg-gold-soft"
        >
          {s.submit}
        </button>
      </form>
      {query ? (
        <Found query={query} locale={locale} dict={dict} />
      ) : (
        <p className="text-mist">{s.hint}</p>
      )}
    </>
  );
}

async function Found({
  query,
  locale,
  dict,
}: {
  query: string;
  locale: Locale;
  dict: Dictionary;
}) {
  const products = searchProducts(await getCatalog(), query, locale);
  const forms = {
    one: interpolate(dict.search.results.one, { count: "{count}", query }),
    other: interpolate(dict.search.results.other, { count: "{count}", query }),
  };
  return (
    <>
      <p
        role="status"
        className="mb-8 border-t border-line pt-8 text-xs uppercase tracking-label text-mist"
      >
        {products.length > 0
          ? pluralize(locale, products.length, forms)
          : interpolate(dict.search.empty, { query })}
      </p>
      {products.length > 0 ? (
        <ProductGrid
          headingLevel="h2"
          products={products}
          locale={locale}
          labels={dict.catalog}
          priorityCount={4}
        />
      ) : (
        <ButtonLink href={localePath(locale, "/contact")} variant="outline">
          {dict.nav.contact}
        </ButtonLink>
      )}
    </>
  );
}

export default async function SearchPage({
  searchParams,
}: PageProps<"/[locale]/search">) {
  const { locale, dict } = await getDictionary();
  return (
    <>
      <PageHeader eyebrow={dict.catalog.eyebrow} title={dict.search.title} />
      <div className="mx-auto max-w-screen-2xl px-4 py-16 sm:px-8">
        <Results searchParams={searchParams} locale={locale} dict={dict} />
      </div>
    </>
  );
}
