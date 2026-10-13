import Link from "next/link";
import type { Brand } from "@/lib/catalog/schema";
import type { Dictionary } from "@/lib/i18n/dictionaries";

interface BrandSelectorProps {
  brands: readonly Brand[];
  dict: Dictionary["brands"];
  hrefFor: (brandSlug: string | null) => string;
}

export function BrandSelector({ brands, dict, hrefFor }: BrandSelectorProps) {
  return (
    <section aria-labelledby="brands-title" className="border-y border-line bg-coal">
      <div className="mx-auto max-w-screen-2xl px-4 py-14 sm:px-8">
        <h2
          id="brands-title"
          className="mb-8 text-center text-xs font-semibold uppercase tracking-luxe text-gold"
        >
          {dict.title}
        </h2>
        <ul className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-6">
          {brands.map((brand) => (
            <li key={brand.slug} className="bg-coal">
              <Link
                href={hrefFor(brand.slug)}
                className="flex min-h-24 items-center justify-center px-4 text-center font-display text-xl text-cream transition-colors hover:bg-graphite hover:text-gold sm:text-2xl"
              >
                <span lang="en" translate="no">
                  {brand.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-center">
          <Link
            href={hrefFor(null)}
            className="inline-flex min-h-11 items-center text-xs font-semibold uppercase tracking-label text-gold underline-offset-8 hover:underline"
          >
            {dict.all}
          </Link>
        </p>
      </div>
    </section>
  );
}
