import { ProductGrid } from "@/components/catalog/product-grid";
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import type { Product } from "@/lib/catalog/schema";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

interface SoldHighlightsProps {
  products: readonly Product[];
  locale: Locale;
  dict: Dictionary["sold"];
  catalogLabels: Dictionary["catalog"];
}

export function SoldHighlights({
  products,
  locale,
  dict,
  catalogLabels,
}: SoldHighlightsProps) {
  return (
    <Section labelledBy="sold-title" tone="coal">
      <div className="mb-12">
        <SectionHeading id="sold-title" eyebrow={dict.eyebrow} title={dict.title} />
      </div>
      <ProductGrid products={products} locale={locale} labels={catalogLabels} />
    </Section>
  );
}
