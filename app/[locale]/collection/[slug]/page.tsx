import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductGrid } from "@/components/catalog/product-grid";
import { InquiryForm } from "@/components/forms/inquiry-form";
import { ButtonLink } from "@/components/ui/button-link";
import { ArrowLeftIcon, ChatIcon } from "@/components/ui/icons";
import { findProduct, getRelatedProducts } from "@/lib/catalog/queries";
import { buildWhatsAppUrl } from "@/lib/contact-links";
import { formatPrice } from "@/lib/format";
import { getSiteContact } from "@/lib/server/content";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { interpolate } from "@/lib/i18n/interpolate";
import { localePath } from "@/lib/i18n/locales";
import { getCatalog } from "@/lib/server/catalog";

/*
 * Fail-closed 404s: with Partial Prefetching an unlisted slug would otherwise
 * get the route's fallback shell (HTTP 200) before notFound() runs. Requiring
 * fully static output makes Next.js finish the render before responding, so
 * unknown slugs return a real 404. Every known slug is prerendered below.
 */
export const ensureStatic = "navigation";

const RELATED_LIMIT = 4;

export async function generateStaticParams() {
  const { products } = await getCatalog();
  return products.map((p) => ({ slug: p.slug }));
}

async function loadProduct(params: PageProps<"/[locale]/collection/[slug]">["params"]) {
  const [{ slug }, catalog] = await Promise.all([params, getCatalog()]);
  const product = findProduct(catalog.products, slug);
  if (!product) notFound();
  return { product, catalog };
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/collection/[slug]">): Promise<Metadata> {
  const [{ locale }, { product }] = await Promise.all([
    getDictionary(),
    loadProduct(params),
  ]);
  return pageMetadata(locale, `/collection/${product.slug}`, {
    title: `${product.brandName} ${product.model}`,
    description: product.description[locale],
    images: product.images.map((i) => i.src),
  });
}

export default async function ProductPage({
  params,
}: PageProps<"/[locale]/collection/[slug]">) {
  const [{ locale, dict }, { product, catalog }, contact] = await Promise.all([
    getDictionary(),
    loadProduct(params),
    getSiteContact(),
  ]);
  const p = dict.product;
  const { brandName } = product;
  const item = [brandName, product.model, product.reference].filter(Boolean).join(" ");
  const isSold = product.status === "sold";
  const [mainImage, ...moreImages] = product.images;

  const details: ReadonlyArray<readonly [string, string | undefined]> = [
    [p.reference, product.reference],
    [p.year, product.year?.toString()],
    [p.condition, dict.catalog.conditions[product.condition]],
    [p.material, product.material[locale]],
    [p.dimensions, product.dimensions],
    [
      p.setItems,
      product.setItems.map((s) => dict.catalog.setItems[s]).join(", ") || p.noSetItems,
    ],
    [p.status, dict.catalog.statuses[product.status]],
  ];

  return (
    <article>
      <div className="mx-auto max-w-screen-2xl px-4 pt-28 sm:px-8 sm:pt-32">
        <Link
          href={localePath(locale, "/collection")}
          className="inline-flex min-h-11 items-center gap-3 text-xs font-semibold uppercase tracking-label text-mist transition-colors hover:text-gold"
        >
          <ArrowLeftIcon width={16} height={16} />
          {p.back}
        </Link>
      </div>

      <div className="mx-auto grid max-w-screen-2xl gap-12 px-4 py-10 sm:px-8 lg:grid-cols-[7fr_5fr] lg:gap-20">
        <div className="flex flex-col gap-4">
          {mainImage && (
            <div className="relative aspect-[4/5] overflow-hidden bg-graphite">
              <Image
                src={mainImage.src}
                alt={mainImage.alt[locale]}
                fill
                priority
                sizes="(min-width: 1024px) 58vw, 100vw"
                className="object-cover"
              />
            </div>
          )}
          {moreImages.map((image) => (
            <div
              key={image.src}
              className="relative aspect-[4/5] overflow-hidden bg-graphite"
            >
              <Image
                src={image.src}
                alt={image.alt[locale]}
                fill
                sizes="(min-width: 1024px) 58vw, 100vw"
                className="object-cover"
              />
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-8 lg:sticky lg:top-28 lg:self-start">
          <header className="flex flex-col gap-3">
            <p>
              <Link
                href={localePath(locale, `/brands/${product.brand}`)}
                lang="en"
                translate="no"
                className="inline-flex min-h-11 items-center text-xs font-semibold uppercase tracking-luxe text-gold underline-offset-8 hover:underline"
              >
                {brandName}
              </Link>
            </p>
            <h1 className="font-display text-5xl leading-tight font-light text-cream sm:text-6xl">
              {product.model}
            </h1>
            <p className="text-2xl text-cream">
              {isSold
                ? dict.catalog.statuses.sold
                : formatPrice(product.price, locale, dict.catalog.priceOnRequest)}
            </p>
            {product.status === "reserved" && (
              <p className="w-fit border border-gold px-3 py-1.5 text-2xs font-semibold uppercase tracking-label text-gold">
                {dict.catalog.statuses.reserved}
              </p>
            )}
          </header>

          <p className="leading-relaxed text-mist">{product.description[locale]}</p>

          {isSold ? (
            <p className="border border-line p-5 text-sm leading-relaxed text-mist">
              {p.soldNotice}
            </p>
          ) : (
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col 2xl:flex-row">
              <ButtonLink
                newTabHint={dict.nav.opensInNewTab}
                href={buildWhatsAppUrl(
                  contact.whatsappNumber,
                  interpolate(p.whatsappMessage, { item }),
                )}
              >
                <ChatIcon width={18} height={18} />
                {p.inquireWhatsapp}
              </ButtonLink>
              <ButtonLink href="#inquiry" variant="outline">
                {p.inquireForm}
              </ButtonLink>
            </div>
          )}

          <section aria-labelledby="details-title">
            <h2
              id="details-title"
              className="mb-4 text-xs font-semibold uppercase tracking-luxe text-gold"
            >
              {p.details}
            </h2>
            <dl className="divide-y divide-line border-y border-line">
              {details
                .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
                .map(([term, value]) => (
                  <div key={term} className="grid grid-cols-[2fr_3fr] gap-4 py-3 text-sm">
                    <dt className="text-mist">{term}</dt>
                    <dd className="text-cream">{value}</dd>
                  </div>
                ))}
            </dl>
          </section>

          <p className="text-xs leading-relaxed text-mist">{p.assurance}</p>
        </div>
      </div>

      {!isSold && (
        <section
          id="inquiry"
          aria-labelledby="inquiry-title"
          className="scroll-mt-24 border-t border-line bg-coal"
        >
          <div className="mx-auto max-w-3xl px-4 py-20 sm:px-8">
            <h2
              id="inquiry-title"
              className="mb-10 font-display text-4xl font-light text-cream"
            >
              {p.inquireForm}
            </h2>
            <InquiryForm
              kind="product"
              locale={locale}
              productSlug={product.slug}
              labels={dict.forms}
            />
          </div>
        </section>
      )}

      <section
        aria-labelledby="related-title"
        className="mx-auto max-w-screen-2xl px-4 py-20 sm:px-8"
      >
        <h2
          id="related-title"
          className="mb-12 font-display text-4xl font-light text-cream"
        >
          {p.related}
        </h2>
        <ProductGrid
          products={getRelatedProducts(product, catalog.products, RELATED_LIMIT)}
          locale={locale}
          labels={dict.catalog}
        />
      </section>
    </article>
  );
}
