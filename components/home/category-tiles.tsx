import Image from "next/image";
import Link from "next/link";
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import type { Category } from "@/lib/catalog/schema";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

interface CategoryTilesProps {
  categories: readonly Category[];
  locale: Locale;
  dict: Dictionary["categories"];
  hrefFor: (categorySlug: string) => string;
}

export function CategoryTiles({ categories, locale, dict, hrefFor }: CategoryTilesProps) {
  return (
    <Section labelledBy="categories-title">
      <div className="mb-12">
        <SectionHeading id="categories-title" eyebrow={dict.eyebrow} title={dict.title} />
      </div>
      <ul className="grid gap-4 md:grid-cols-3">
        {categories.map((category) => (
          <li key={category.slug} className="reveal">
            <Link
              href={hrefFor(category.slug)}
              className="group relative block aspect-[3/4] overflow-hidden bg-graphite"
            >
              {category.tileImage && (
                <Image
                  src={category.tileImage.src}
                  alt=""
                  fill
                  sizes="(min-width: 768px) 33vw, 100vw"
                  className="object-cover transition-transform duration-1000 ease-out group-hover:scale-105"
                />
              )}
              <span
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/20 to-transparent"
              />
              <span className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6 sm:p-8">
                <span className="font-display text-4xl text-cream">
                  {category.name[locale]}
                </span>
                <span className="text-xs font-semibold uppercase tracking-label text-gold">
                  {dict.explore}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
