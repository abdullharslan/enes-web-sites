import { ButtonLink } from "@/components/ui/button-link";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localePath } from "@/lib/i18n/locales";

export default async function NotFound() {
  const { locale, dict } = await getDictionary();
  return (
    <section className="mx-auto flex min-h-svh max-w-3xl flex-col items-start justify-center gap-6 px-4 sm:px-8">
      <p className="font-display text-8xl text-gold">404</p>
      <h1 className="font-display text-5xl font-light text-cream">
        {dict.notFound.title}
      </h1>
      <p className="text-mist">{dict.notFound.text}</p>
      <ButtonLink href={localePath(locale, "/collection")}>
        {dict.notFound.cta}
      </ButtonLink>
    </section>
  );
}
