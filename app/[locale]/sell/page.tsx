import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { SellForm } from "@/components/forms/sell-form";
import { PageHeader } from "@/components/ui/page-header";
import { getPages } from "@/lib/server/content";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getCatalog } from "@/lib/server/catalog";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getDictionary();
  const { sell } = await getPages(locale);
  return pageMetadata(locale, "/sell", { title: sell.title, description: sell.intro });
}

export default async function SellPage() {
  const [{ locale, dict }, catalog] = await Promise.all([getDictionary(), getCatalog()]);
  const { sell } = await getPages(locale);
  return (
    <>
      <PageHeader eyebrow={sell.eyebrow} title={sell.title} intro={sell.intro} />
      <section
        aria-labelledby="steps-title"
        className="mx-auto max-w-screen-2xl px-4 py-20 sm:px-8"
      >
        <h2
          id="steps-title"
          className="mb-12 text-xs font-semibold uppercase tracking-luxe text-gold"
        >
          {sell.stepsTitle}
        </h2>
        <ol className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {sell.steps.map((step, index) => (
            <li key={step.title} className="border-t border-line pt-6">
              <span aria-hidden="true" className="font-display text-5xl text-gold">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-4 text-sm font-semibold uppercase tracking-label text-cream">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-mist">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="sell-form-title" className="border-t border-line bg-coal">
        <div className="mx-auto max-w-3xl px-4 py-20 sm:px-8">
          <h2
            id="sell-form-title"
            className="mb-10 font-display text-4xl font-light text-cream sm:text-5xl"
          >
            {sell.formTitle}
          </h2>
          <SellForm
            brands={catalog.brands}
            categories={catalog.categories}
            locale={locale}
            labels={{ forms: dict.forms, sell: dict.sell, catalog: dict.catalog }}
          />
        </div>
      </section>
    </>
  );
}
