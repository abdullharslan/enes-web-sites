import Image from "next/image";
import type { JournalEntry } from "@/data/journal";
import { INTL_LOCALE, type Locale } from "@/lib/i18n/locales";

interface JournalListProps {
  entries: readonly JournalEntry[];
  locale: Locale;
  headingLevel?: "h2" | "h3";
}

export function JournalList({
  entries,
  locale,
  headingLevel: Heading = "h3",
}: JournalListProps) {
  const dateFormat = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    dateStyle: "long",
    timeZone: "UTC",
  });
  return (
    <ul className="grid gap-12 md:grid-cols-3 md:gap-8">
      {entries.map((entry) => (
        <li key={entry.slug} className="reveal">
          <article>
            <div className="relative aspect-[4/3] overflow-hidden bg-graphite">
              <Image
                src={entry.image}
                alt=""
                fill
                sizes="(min-width: 768px) 33vw, 100vw"
                className="object-cover"
              />
            </div>
            <time
              dateTime={entry.publishedAt}
              className="mt-6 block text-xs uppercase tracking-label text-gold"
            >
              {dateFormat.format(new Date(`${entry.publishedAt}T00:00:00Z`))}
            </time>
            <Heading className="mt-3 font-display text-3xl leading-tight text-cream">
              {entry.title[locale]}
            </Heading>
            <p className="mt-3 text-sm leading-relaxed text-mist">
              {entry.excerpt[locale]}
            </p>
          </article>
        </li>
      ))}
    </ul>
  );
}
