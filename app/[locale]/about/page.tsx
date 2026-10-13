import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import Image from "next/image";
import { ButtonLink } from "@/components/ui/button-link";
import { PageHeader } from "@/components/ui/page-header";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localePath } from "@/lib/i18n/locales";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, dict } = await getDictionary();
  return pageMetadata(locale, "/about", {
    title: dict.about.eyebrow,
    description: dict.about.teaser,
  });
}

export default async function AboutPage() {
  const { locale, dict } = await getDictionary();
  return (
    <>
      <PageHeader
        eyebrow={dict.about.eyebrow}
        title={dict.about.title}
        intro={dict.about.teaser}
      />
      <div className="mx-auto grid max-w-screen-2xl gap-12 px-4 py-20 sm:px-8 lg:grid-cols-2 lg:gap-20">
        <div className="relative aspect-[4/5] overflow-hidden bg-graphite">
          <Image
            src="/images/watch-two-tone.jpg"
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
        <div className="flex flex-col justify-center gap-10">
          <p className="text-lg leading-relaxed text-mist">{dict.about.body}</p>
          <ul className="flex flex-col gap-8">
            {dict.about.values.map((value) => (
              <li key={value.title} className="border-l border-gold pl-6">
                <h2 className="font-display text-3xl text-cream">{value.title}</h2>
                <p className="mt-2 leading-relaxed text-mist">{value.text}</p>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-3 sm:flex-row">
            <ButtonLink href={localePath(locale, "/collection")}>
              {dict.hero.ctaCollection}
            </ButtonLink>
            <ButtonLink href={localePath(locale, "/contact")} variant="outline">
              {dict.nav.contact}
            </ButtonLink>
          </div>
        </div>
      </div>
    </>
  );
}
