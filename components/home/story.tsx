import Image from "next/image";
import { ButtonLink } from "@/components/ui/button-link";
import { Section } from "@/components/ui/section";
import { SectionHeading } from "@/components/ui/section-heading";
import type { HomeContent } from "@/lib/content/home";

interface StoryProps {
  dict: HomeContent["story"];
  contactHref: string;
}

export function Story({ dict, contactHref }: StoryProps) {
  return (
    <Section labelledBy="story-title">
      <div className="grid items-center gap-12 lg:grid-cols-[5fr_6fr] lg:gap-20">
        <div className="reveal relative order-last aspect-[3/4] overflow-hidden bg-graphite lg:order-first">
          {dict.image && (
            <Image
              src={dict.image.src}
              alt=""
              fill
              sizes="(min-width: 1024px) 45vw, 100vw"
              className="object-cover"
            />
          )}
        </div>
        <div className="reveal flex flex-col gap-8">
          <SectionHeading id="story-title" eyebrow={dict.eyebrow} title={dict.title} />
          <p className="max-w-xl text-base leading-relaxed text-mist sm:text-lg">
            {dict.text}
          </p>
          <div>
            <ButtonLink href={contactHref} variant="outline">
              {dict.cta}
            </ButtonLink>
          </div>
          <p className="text-sm text-mist">{dict.social}</p>
        </div>
      </div>
    </Section>
  );
}
