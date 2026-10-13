import type { Product } from "@/lib/catalog/schema";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";
import { ProductCard } from "./product-card";

interface ProductGridProps {
  products: readonly Product[];
  locale: Locale;
  labels: Dictionary["catalog"];
  /** Number of leading cards whose images load with priority. */
  priorityCount?: number;
}

export function ProductGrid({
  products,
  locale,
  labels,
  priorityCount = 0,
}: ProductGridProps) {
  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-14 sm:grid-cols-2 xl:grid-cols-4">
      {products.map((product, index) => (
        <li key={product.slug}>
          <ProductCard
            product={product}
            locale={locale}
            labels={labels}
            priority={index < priorityCount}
          />
        </li>
      ))}
    </ul>
  );
}
