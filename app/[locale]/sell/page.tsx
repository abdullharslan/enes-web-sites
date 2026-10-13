import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { SellForm } from "@/components/forms/sell-form";
import { PageHeader } from "@/components/ui/page-header";
import { SITE } from "@/config/site";
import { BRANDS } from "@/data/brands";
import { getDictionary } from "@/lib/i18n/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, dict } = await getDictionary();
  return pageMetadata(locale, "/sell", {
    title: dict.sell.title,
    description: dict.sell.intro,
  });
}

export default async function SellPage() {
  const { dict } = await getDictionary();
  return (
    <>
      <PageHeader
        eyebrow={dict.sell.eyebrow}
        title={dict.sell.title}
        intro={dict.sell.intro}
      />
      <section
        aria-labelledby="steps-title"
        className="mx-auto max-w-screen-2xl px-4 py-20 sm:px-8"
      >
        <h2
          id="steps-title"
          className="mb-12 text-xs font-semibold uppercase tracking-luxe text-gold"
        >
          {dict.sell.stepsTitle}
        </h2>
        <ol className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {dict.sell.steps.map((step, index) => (
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
            {dict.sell.formTitle}
          </h2>
          <SellForm
            recipient={SITE.email}
            brands={BRANDS}
            labels={{ forms: dict.forms, sell: dict.sell, catalog: dict.catalog }}
          />
        </div>
      </section>
    </>
  );
}
