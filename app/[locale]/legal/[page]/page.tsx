import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { parseRichText } from "@/lib/content/rich-text";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getPages } from "@/lib/server/content";
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
  const [{ locale }, page] = await Promise.all([getDictionary(), loadPage(params)]);
  const { legal } = await getPages(locale);
  return pageMetadata(locale, `/legal/${page}`, {
    title: legal[page].title,
    noIndex: true,
  });
}

export default async function LegalPage({ params }: PageProps<"/[locale]/legal/[page]">) {
  const [{ locale, dict }, page] = await Promise.all([getDictionary(), loadPage(params)]);
  const { legal } = await getPages(locale);
  const { title, body } = legal[page];
  return (
    <>
      <PageHeader eyebrow={dict.footer.legal} title={title} />
      <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-20 leading-relaxed text-mist sm:px-8">
        {parseRichText(body).map((block, index) =>
          block.type === "heading" ? (
            <h2 key={index} className="mt-6 font-display text-3xl text-cream">
              {block.text}
            </h2>
          ) : (
            <p key={index}>
              {block.lines.map((line, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {line}
                </span>
              ))}
            </p>
          ),
        )}
      </div>
    </>
  );
}
