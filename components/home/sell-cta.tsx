import Image from "next/image";
import { ButtonLink } from "@/components/ui/button-link";
import type { HomeContent } from "@/lib/content/home";

interface SellCtaProps {
  dict: HomeContent["sellCta"];
  sellHref: string;
}

export function SellCta({ dict, sellHref }: SellCtaProps) {
  return (
    <section
      aria-labelledby="sell-cta-title"
      className="relative isolate overflow-hidden"
    >
      {dict.image && (
        <Image
          src={dict.image.src}
          alt=""
          fill
          sizes="100vw"
          className="-z-20 object-cover"
        />
      )}
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-ink/80" />
      <div className="reveal mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 py-28 text-center sm:py-36">
        <p className="text-xs font-medium uppercase tracking-luxe text-gold">
          {dict.eyebrow}
        </p>
        <h2
          id="sell-cta-title"
          className="font-display text-4xl font-light text-cream sm:text-6xl"
        >
          {dict.title}
        </h2>
        <p className="max-w-xl leading-relaxed text-mist">{dict.text}</p>
        <ButtonLink href={sellHref}>{dict.cta}</ButtonLink>
      </div>
    </section>
  );
}
