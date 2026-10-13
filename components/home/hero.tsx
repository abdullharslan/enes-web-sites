import Image from "next/image";
import { ButtonLink } from "@/components/ui/button-link";
import type { HomeContent } from "@/lib/content/home";

interface HeroProps {
  dict: HomeContent["hero"];
  collectionHref: string;
  sellHref: string;
}

export function Hero({ dict, collectionHref, sellHref }: HeroProps) {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-svh items-end overflow-hidden"
    >
      {dict.image && (
        <Image
          src={dict.image.src}
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-20 object-cover object-center"
        />
      )}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-gradient-to-t from-ink via-ink/70 to-ink/30"
      />
      <div className="mx-auto w-full max-w-screen-2xl px-4 pt-32 pb-20 sm:px-8 sm:pb-28">
        <p className="mb-6 flex items-center gap-4 text-xs font-medium uppercase tracking-luxe text-gold">
          <span aria-hidden="true" className="h-px w-12 bg-gold" />
          {dict.eyebrow}
        </p>
        <h1
          id="hero-title"
          className="max-w-4xl font-display text-5xl leading-none font-light text-cream sm:text-7xl lg:text-8xl"
        >
          {dict.title}
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-mist sm:text-lg">
          {dict.subtitle}
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href={collectionHref}>{dict.ctaCollection}</ButtonLink>
          <ButtonLink href={sellHref} variant="outline">
            {dict.ctaSell}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
