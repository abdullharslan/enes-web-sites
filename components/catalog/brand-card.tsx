import Image from "next/image";
import Link from "next/link";
import type { BrandSummary } from "@/lib/catalog/brands";
import type { Locale } from "@/lib/i18n/locales";

interface BrandCardProps {
  summary: BrandSummary;
  locale: Locale;
  href: string;
  countLabel: string;
  discoverLabel: string;
}

export function BrandCard({
  summary,
  locale,
  href,
  countLabel,
  discoverLabel,
}: BrandCardProps) {
  const { brand, image } = summary;
  return (
    <Link
      href={href}
      className="group relative block aspect-[4/5] overflow-hidden bg-graphite"
    >
      {image ? (
        <Image
          src={image.src}
          alt={image.alt[locale]}
          fill
          sizes="(min-width: 1280px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-1000 ease-out group-hover:scale-105"
        />
      ) : null}
      <span
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-ink via-ink/40 to-ink/10"
      />
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-6 sm:p-8">
        <span
          lang="en"
          translate="no"
          className="font-display text-4xl text-cream sm:text-5xl"
        >
          {brand.name}
        </span>
        <span className="flex items-center justify-between gap-4 text-xs uppercase tracking-label">
          <span className="text-mist">{countLabel}</span>
          <span className="font-semibold text-gold">{discoverLabel}</span>
        </span>
      </span>
    </Link>
  );
}
