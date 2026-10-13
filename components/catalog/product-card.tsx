import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/catalog/schema";
import { formatPrice } from "@/lib/format";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { localePath, type Locale } from "@/lib/i18n/locales";

interface ProductCardProps {
  product: Product;
  locale: Locale;
  labels: Pick<Dictionary["catalog"], "statuses" | "priceOnRequest">;
  /** The first visible images are prioritised for LCP. */
  priority?: boolean;
  /** Heading level for the model name; follows the surrounding outline. */
  headingLevel?: "h2" | "h3";
}

export function ProductCard({
  product,
  locale,
  labels,
  priority = false,
  headingLevel: Heading = "h3",
}: ProductCardProps) {
  const [image] = product.images;
  const { brandName } = product;
  const isSold = product.status === "sold";

  return (
    <article className="group">
      <Link href={localePath(locale, `/collection/${product.slug}`)} className="block">
        <div className="relative aspect-[4/5] overflow-hidden bg-graphite">
          {image && (
            <Image
              src={image.src}
              alt={image.alt[locale]}
              fill
              priority={priority}
              sizes="(min-width: 1280px) 25vw, (min-width: 640px) 45vw, 85vw"
              className={`object-cover transition-transform duration-700 ease-out group-hover:scale-105 ${
                isSold ? "grayscale-[60%]" : ""
              }`}
            />
          )}
          {product.status !== "available" && (
            <span className="absolute top-4 left-4 bg-ink/85 px-3 py-1.5 text-2xs font-semibold uppercase tracking-label text-gold">
              {labels.statuses[product.status]}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-1.5 pt-5">
          <p
            lang="en"
            translate="no"
            className="text-2xs font-semibold uppercase tracking-luxe text-gold"
          >
            {brandName}
          </p>
          <Heading className="font-display text-2xl leading-tight text-cream transition-colors group-hover:text-gold-soft">
            {product.model}
          </Heading>
          <p className="text-xs text-mist">
            {[product.reference, product.year].filter(Boolean).join(" · ")}
          </p>
          {!isSold && (
            <p className="mt-1 text-sm font-medium text-cream">
              {formatPrice(product.price, locale, labels.priceOnRequest)}
            </p>
          )}
        </div>
      </Link>
    </article>
  );
}
