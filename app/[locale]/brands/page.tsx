import type { Metadata } from "next";
import { BrandCard } from "@/components/catalog/brand-card";
import { PageHeader } from "@/components/ui/page-header";
import { summarizeBrands } from "@/lib/catalog/brands";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localePath } from "@/lib/i18n/locales";
import { pluralize } from "@/lib/i18n/plural";
import { pageMetadata } from "@/lib/seo";
import { getCatalog } from "@/lib/server/catalog";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, dict } = await getDictionary();
  return pageMetadata(locale, "/brands", {
    title: dict.brandsPage.title,
    description: dict.brandsPage.intro,
  });
}

export default async function BrandsPage() {
  const [{ locale, dict }, catalog] = await Promise.all([getDictionary(), getCatalog()]);
  const b = dict.brandsPage;
  return (
    <>
      <PageHeader eyebrow={b.eyebrow} title={b.title} intro={b.intro} />
      <div className="mx-auto max-w-screen-2xl px-4 py-16 sm:px-8">
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {summarizeBrands(catalog).map((summary) => (
            <li key={summary.brand.slug} className="reveal">
              <BrandCard
                summary={summary}
                locale={locale}
                href={localePath(locale, `/brands/${summary.brand.slug}`)}
                countLabel={pluralize(locale, summary.availableCount, b.pieces)}
                discoverLabel={b.discover}
              />
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
