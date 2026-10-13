import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { LEGAL_PAGES, isLegalPage } from "@/lib/legal";

// Complete the render before responding so unknown keys return a real 404
// (see the product page for the full rationale).
export const ensureStatic = "navigation";

export function generateStaticParams() {
  return LEGAL_PAGES.map((page) => ({ page }));
}

async function loadPage(params: PageProps<"/[locale]/legal/[page]">["params"]) {
  const { page } = await params;
  if (!isLegalPage(page)) notFound();
  return page;
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/legal/[page]">): Promise<Metadata> {
  const [{ locale, dict }, page] = await Promise.all([getDictionary(), loadPage(params)]);
  return pageMetadata(locale, `/legal/${page}`, {
    title: dict.legal.titles[page],
    noIndex: true,
  });
}

export default async function LegalPage({ params }: PageProps<"/[locale]/legal/[page]">) {
  const [{ dict }, page] = await Promise.all([getDictionary(), loadPage(params)]);
  return (
    <>
      <PageHeader eyebrow={dict.footer.legal} title={dict.legal.titles[page]} />
      <div className="mx-auto max-w-3xl px-4 py-20 sm:px-8">
        <p role="note" className="border border-gold/60 p-6 leading-relaxed text-cream">
          {dict.legal.placeholder}
        </p>
      </div>
    </>
  );
}
