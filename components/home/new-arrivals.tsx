import { ProductCarousel } from "@/components/catalog/product-carousel";
import { ProductCard } from "@/components/catalog/product-card";
import { ButtonLink } from "@/components/ui/button-link";
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import type { Product } from "@/lib/catalog/schema";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";

interface NewArrivalsProps {
  products: readonly Product[];
  locale: Locale;
  dict: Dictionary["newArrivals"];
  catalogLabels: Dictionary["catalog"];
  collectionHref: string;
}

export function NewArrivals({
  products,
  locale,
  dict,
  catalogLabels,
  collectionHref,
}: NewArrivalsProps) {
  return (
    <Section labelledBy="new-arrivals-title" tone="coal">
      <div className="mb-4">
        <SectionHeading
          id="new-arrivals-title"
          eyebrow={dict.eyebrow}
          title={dict.title}
        />
      </div>
      <ProductCarousel labels={{ previous: dict.previous, next: dict.next }}>
        {products.map((product) => (
          <ProductCard
            key={product.slug}
            product={product}
            locale={locale}
            labels={catalogLabels}
          />
        ))}
      </ProductCarousel>
      <div className="mt-12 text-center">
        <ButtonLink href={collectionHref}>{dict.viewAll}</ButtonLink>
      </div>
    </Section>
  );
}
