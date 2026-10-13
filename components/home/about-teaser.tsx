import Image from "next/image";
import { ButtonLink } from "@/components/ui/button-link";
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import type { Dictionary } from "@/lib/i18n/dictionaries";

interface AboutTeaserProps {
  dict: Dictionary["about"];
  aboutHref: string;
}

export function AboutTeaser({ dict, aboutHref }: AboutTeaserProps) {
  return (
    <Section labelledBy="about-title">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <div className="reveal flex flex-col gap-8">
          <SectionHeading id="about-title" eyebrow={dict.eyebrow} title={dict.title} />
          <p className="max-w-xl text-base leading-relaxed text-mist sm:text-lg">
            {dict.teaser}
          </p>
          <div>
            <ButtonLink href={aboutHref} variant="outline">
              {dict.cta}
            </ButtonLink>
          </div>
        </div>
        <div className="reveal relative aspect-[4/5] overflow-hidden bg-graphite lg:aspect-square">
          <Image
            src="/images/jewel-portrait.jpg"
            alt=""
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover"
          />
        </div>
      </div>
    </Section>
  );
}
