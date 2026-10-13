import type { Metadata } from "next";
import { Suspense } from "react";
import { CatalogBrowser, CatalogSkeleton } from "@/components/catalog/catalog-browser";
import { PageHeader } from "@/components/ui/page-header";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { pageMetadata } from "@/lib/seo";
import { getCatalog } from "@/lib/server/catalog";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, dict } = await getDictionary();
  return pageMetadata(locale, "/collection", {
    title: dict.catalog.title,
    description: dict.catalog.intro,
  });
}

export default async function CollectionPage({
  searchParams,
}: PageProps<"/[locale]/collection">) {
  const [{ locale, dict }, catalog] = await Promise.all([getDictionary(), getCatalog()]);
  return (
    <>
      <PageHeader
        eyebrow={dict.catalog.eyebrow}
        title={dict.catalog.title}
        intro={dict.catalog.intro}
      />
      <div className="mx-auto max-w-screen-2xl px-4 py-16 sm:px-8">
        <Suspense fallback={<CatalogSkeleton />}>
          <CatalogBrowser
            catalog={catalog}
            searchParams={searchParams}
            locale={locale}
            dict={dict}
            basePath="/collection"
          />
        </Suspense>
      </div>
    </>
  );
}
