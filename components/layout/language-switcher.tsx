"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LOCALES, switchLocalePath, type Locale } from "@/lib/i18n/locales";

interface LocaleListProps {
  current: Locale;
  label: string;
  pathname: string;
}

/** Presentational list of locale links for a given pathname. */
export function LocaleList({ current, label, pathname }: LocaleListProps) {
  return (
    <nav aria-label={label}>
      <ul className="flex items-center">
        {LOCALES.map((locale) => (
          <li key={locale}>
            <Link
              href={switchLocalePath(pathname, locale)}
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

/** Keeps the visitor on the same page when switching language. */
export function LanguageSwitcher(props: Omit<LocaleListProps, "pathname">) {
  return <LocaleList {...props} pathname={usePathname()} />;
}
