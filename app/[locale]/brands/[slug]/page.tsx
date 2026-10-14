import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CatalogBrowser } from "@/components/catalog/catalog-browser";
import { ArrowLeftIcon } from "@/components/ui/icons";
import { findBrand, summarizeBrands } from "@/lib/catalog/brands";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localePath } from "@/lib/i18n/locales";
import { pluralize } from "@/lib/i18n/plural";
import { pageMetadata } from "@/lib/seo";
import { getCatalog } from "@/lib/server/catalog";

/*
 * Filters and sorting are rendered on the server before the response is sent
 * (no streamed <Suspense> hole), so they work without JavaScript.
 */
export const instant = false;

export async function generateStaticParams() {
  const { brands } = await getCatalog();
  return brands.map((b) => ({ slug: b.slug }));
}

// Awaited outside <Suspense>: the response waits for the brand lookup, so an
// unknown slug returns a real 404 (see next.config.ts).
async function loadBrand(params: PageProps<"/[locale]/brands/[slug]">["params"]) {
  const [{ slug }, catalog] = await Promise.all([params, getCatalog()]);
  const brand = findBrand(catalog, slug);
  if (!brand) notFound();
  return { brand, catalog };
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/brands/[slug]">): Promise<Metadata> {
  const [{ locale, dict }, { brand }] = await Promise.all([
    getDictionary(),
    loadBrand(params),
  ]);
  return pageMetadata(locale, `/brands/${brand.slug}`, {
    title: brand.name,
    description: brand.description?.[locale] ?? dict.brandsPage.intro,
    images: brand.heroImage ? [brand.heroImage.src] : undefined,
  });
}

export default async function BrandPage({
  params,
  searchParams,
}: PageProps<"/[locale]/brands/[slug]">) {
  const [{ locale, dict }, { brand, catalog }] = await Promise.all([
    getDictionary(),
    loadBrand(params),
  ]);
  const summary = summarizeBrands(catalog).find((s) => s.brand.slug === brand.slug);
  const b = dict.brandsPage;

  return (
    <>
      <section
        aria-labelledby="brand-title"
        className="relative isolate flex min-h-[70svh] items-end overflow-hidden"
      >
        {summary?.image && (
          <Image
            src={summary.image.src}
            alt=""
            fill
            priority
            sizes="100vw"
            className="-z-20 object-cover"
          />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/70 to-ink/40"
        />
        <div className="mx-auto w-full max-w-screen-2xl px-4 pt-32 pb-16 sm:px-8">
          <Link
            href={localePath(locale, "/brands")}
            className="mb-8 inline-flex min-h-11 items-center gap-3 text-xs font-semibold uppercase tracking-label text-mist transition-colors hover:text-gold"
          >
            <ArrowLeftIcon width={16} height={16} />
            {b.back}
          </Link>
          <p className="mb-4 text-xs font-medium uppercase tracking-luxe text-gold">
            {pluralize(locale, summary?.availableCount ?? 0, b.pieces)}
          </p>
          <h1
            id="brand-title"
            lang="en"
            translate="no"
            className="font-display text-6xl font-light text-cream sm:text-8xl"
          >
            {brand.name}
          </h1>
          {brand.description && (
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-mist sm:text-lg">
              {brand.description[locale]}
            </p>
          )}
        </div>
      </section>
      <section
        aria-labelledby="brand-collection-title"
        className="mx-auto max-w-screen-2xl px-4 py-16 sm:px-8"
      >
        <h2
          id="brand-collection-title"
          className="mb-10 font-display text-4xl font-light text-cream"
        >
          {b.collectionTitle}
        </h2>
        <CatalogBrowser
          catalog={catalog}
          searchParams={searchParams}
          locale={locale}
          dict={dict}
          basePath={`/brands/${brand.slug}`}
          fixedBrand={brand.slug}
          cardHeadingLevel="h3"
        />
      </section>
    </>
  );
}
