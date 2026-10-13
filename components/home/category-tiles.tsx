import Image from "next/image";
import Link from "next/link";
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import type { Category } from "@/lib/catalog/schema";
import type { Dictionary } from "@/lib/i18n/dictionaries";

const TILE_IMAGES: Record<Category, string> = {
  bags: "/images/bag-burgundy-croc.jpg",
  watches: "/images/watch-on-book.jpg",
  jewellery: "/images/jewel-crescent.jpg",
};

interface CategoryTilesProps {
  dict: Dictionary["categories"];
  categoryLabels: Dictionary["catalog"]["categories"];
  hrefFor: (category: Category) => string;
}

export function CategoryTiles({ dict, categoryLabels, hrefFor }: CategoryTilesProps) {
  const categories = Object.keys(TILE_IMAGES) as Category[];
  return (
    <Section labelledBy="categories-title">
      <div className="mb-12">
        <SectionHeading id="categories-title" eyebrow={dict.eyebrow} title={dict.title} />
      </div>
      <ul className="grid gap-4 md:grid-cols-3">
        {categories.map((category) => (
          <li key={category} className="reveal">
            <Link
              href={hrefFor(category)}
              className="group relative block aspect-[3/4] overflow-hidden bg-graphite"
            >
              <Image
                src={TILE_IMAGES[category]}
                alt=""
                fill
                sizes="(min-width: 768px) 33vw, 100vw"
                className="object-cover transition-transform duration-1000 ease-out group-hover:scale-105"
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/20 to-transparent"
              />
              <span className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6 sm:p-8">
                <span className="font-display text-4xl text-cream">
                  {categoryLabels[category]}
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
