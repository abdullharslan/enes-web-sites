import Link from "next/link";
import { useId } from "react";
import type { Brand, Category } from "@/lib/catalog/schema";
import type { Locale } from "@/lib/i18n/locales";
import {
  AVAILABILITY,
  DEFAULT_FILTER,
  SORTS,
  serializeCatalogFilter,
  type CatalogFilter,
} from "@/lib/catalog/filter";
import type { Dictionary } from "@/lib/i18n/dictionaries";

interface CatalogFiltersProps {
  filter: CatalogFilter;
  /** Omit to hide the brand group (e.g. on a single brand's page). */
  brands?: readonly Brand[];
  categories: readonly Category[];
  locale: Locale;
  labels: Dictionary["catalog"];
  hrefFor: (filter: CatalogFilter) => string;
  /** The filter the reset link returns to. */
  resetTo?: CatalogFilter;
}

interface ChipOption {
  key: string;
  label: string;
  /** Set for proper nouns (brand names) so CSS uppercase is not localised. */
  lang?: string;
  active: boolean;
  href: string;
}

function ChipGroup({ legend, options }: { legend: string; options: ChipOption[] }) {
  const legendId = useId();
  return (
    <div
      role="group"
      aria-labelledby={legendId}
      className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6"
    >
      <p
        id={legendId}
        className="w-36 shrink-0 text-2xs font-semibold uppercase tracking-luxe text-gold"
      >
        {legend}
      </p>
      <ul className="flex flex-wrap gap-2">
        {options.map((option) => (
          <li key={option.key}>
            <Link
              href={option.href}
              scroll={false}
              aria-current={option.active ? "true" : undefined}
              lang={option.lang}
              translate={option.lang ? "no" : undefined}
              className={`inline-flex min-h-11 items-center border px-4 text-xs tracking-label uppercase transition-colors ${
                option.active
                  ? "border-gold bg-gold text-ink"
                  : "border-line text-mist hover:border-gold hover:text-cream"
              }`}
            >
              {option.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Link-based filters: shareable URLs, no client JavaScript required. */
export function CatalogFilters({
  filter,
  brands,
  categories,
  locale,
  labels,
  hrefFor,
  resetTo = DEFAULT_FILTER,
}: CatalogFiltersProps) {
  const option = (
    key: string,
    label: string,
    patch: Partial<CatalogFilter>,
    active: boolean,
  ): ChipOption => ({
    key,
    label,
    active,
    href: hrefFor({ ...filter, ...patch }),
  });
  const f = labels.filters;

  return (
    <nav aria-label={f.label} className="flex flex-col gap-6">
      {brands && (
        <ChipGroup
          legend={f.brand}
          options={[
            option("all", f.allBrands, { brand: null }, filter.brand === null),
            ...brands.map((b) => ({
              ...option(b.slug, b.name, { brand: b.slug }, filter.brand === b.slug),
              lang: "en",
            })),
          ]}
        />
      )}
      <ChipGroup
        legend={f.category}
        options={[
          option("all", f.allCategories, { category: null }, filter.category === null),
          ...categories.map((c) =>
            option(
              c.slug,
              c.name[locale],
              { category: c.slug },
              filter.category === c.slug,
            ),
          ),
        ]}
      />
      <ChipGroup
        legend={f.availability}
        options={AVAILABILITY.map((a) =>
          option(a, f[a], { availability: a }, filter.availability === a),
        )}
      />
      <ChipGroup
        legend={f.sort}
        options={SORTS.map((s) => option(s, f[s], { sort: s }, filter.sort === s))}
      />
      {serializeCatalogFilter(filter) === serializeCatalogFilter(resetTo) ? null : (
        <p>
          <Link
            href={hrefFor(resetTo)}
            scroll={false}
            className="inline-flex min-h-11 items-center text-xs font-semibold uppercase tracking-label text-gold underline-offset-8 hover:underline"
          >
            {f.reset}
          </Link>
        </p>
      )}
    </nav>
  );
}
