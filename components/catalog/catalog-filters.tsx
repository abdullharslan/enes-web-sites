import Link from "next/link";
import type { Brand, Category } from "@/lib/catalog/schema";
import {
  AVAILABILITY,
  DEFAULT_FILTER,
  SORTS,
  isDefaultFilter,
  type CatalogFilter,
} from "@/lib/catalog/filter";
import { CATEGORIES } from "@/lib/catalog/schema";
import type { Dictionary } from "@/lib/i18n/dictionaries";

interface CatalogFiltersProps {
  filter: CatalogFilter;
  brands: readonly Brand[];
  labels: Dictionary["catalog"];
  hrefFor: (filter: CatalogFilter) => string;
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
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-6">
      <p className="w-36 shrink-0 text-2xs font-semibold uppercase tracking-luxe text-gold">
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
export function CatalogFilters({ filter, brands, labels, hrefFor }: CatalogFiltersProps) {
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
      <ChipGroup
        legend={f.category}
        options={[
          option("all", f.allCategories, { category: null }, filter.category === null),
          ...CATEGORIES.map((c: Category) =>
            option(c, labels.categories[c], { category: c }, filter.category === c),
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
      {isDefaultFilter(filter) ? null : (
        <p>
          <Link
            href={hrefFor(DEFAULT_FILTER)}
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
