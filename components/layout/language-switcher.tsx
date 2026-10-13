"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { LOCALES, switchLocalePath, type Locale } from "@/lib/i18n/locales";

interface LocaleListProps {
  current: Locale;
  label: string;
  pathname: string;
  query?: string;
}

/** Presentational list of locale links for a given pathname and query. */
export function LocaleList({ current, label, pathname, query = "" }: LocaleListProps) {
  return (
    <nav aria-label={label}>
      <ul className="flex items-center">
        {LOCALES.map((locale) => (
          <li key={locale}>
            <Link
              href={switchLocalePath(pathname, locale, query)}
              hrefLang={locale}
              lang={locale}
              aria-current={locale === current ? "true" : undefined}
              className={`inline-flex min-h-11 min-w-11 items-center justify-center text-xs font-semibold uppercase tracking-label transition-colors ${
                locale === current ? "text-gold" : "text-mist hover:text-cream"
              }`}
            >
              {locale}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

type SwitcherProps = Omit<LocaleListProps, "pathname" | "query">;

function LocaleListWithQuery(props: SwitcherProps) {
  return (
    <LocaleList
      {...props}
      pathname={usePathname()}
      query={useSearchParams().toString()}
    />
  );
}

/**
 * Keeps the visitor on the same page (and filters) when switching language.
 * The query is request data, so it streams in behind Suspense; the fallback
 * already links to the same page without the query.
 */
export function LanguageSwitcher(props: SwitcherProps) {
  const pathname = usePathname();
  return (
    <Suspense fallback={<LocaleList {...props} pathname={pathname} />}>
      <LocaleListWithQuery {...props} />
    </Suspense>
  );
}
