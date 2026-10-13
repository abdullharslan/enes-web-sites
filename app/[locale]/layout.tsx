import type { Metadata } from "next";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { FloatingContact } from "@/components/layout/floating-contact";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { SITE } from "@/config/site";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { INTL_LOCALE, LOCALES, localePath } from "@/lib/i18n/locales";
import { buildNavLinks } from "@/lib/navigation";
import "../globals.css";

const display = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500"],
  variable: "--font-cormorant",
});

const sans = Montserrat({
  subsets: ["latin", "latin-ext"],
  variable: "--font-montserrat",
});

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { locale, dict } = await getDictionary();
  return {
    metadataBase: new URL(SITE.url),
    title: { default: dict.meta.title, template: `%s | ${SITE.name}` },
    description: dict.meta.description,
    alternates: {
      canonical: localePath(locale, "/"),
      languages: Object.fromEntries(
        LOCALES.map((l) => [INTL_LOCALE[l], localePath(l, "/")]),
      ),
    },
    openGraph: { siteName: SITE.name, locale: INTL_LOCALE[locale], type: "website" },
  };
}

export default async function LocaleLayout({ children }: LayoutProps<"/[locale]">) {
  const { locale, dict } = await getDictionary();
  const links = buildNavLinks(locale, dict.nav);

  return (
    <html lang={INTL_LOCALE[locale]} className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-svh pb-12 sm:pb-0">
        <a
          href="#content"
          className="sr-only z-50 bg-gold px-5 text-ink focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:inline-flex focus:min-h-11 focus:items-center"
        >
          {dict.nav.skipToContent}
        </a>
        <SiteHeader
          locale={locale}
          siteName={SITE.name}
          homeHref={localePath(locale, "/")}
          links={links}
          labels={{
            menu: dict.nav.menu,
            openMenu: dict.nav.openMenu,
            closeMenu: dict.nav.closeMenu,
            language: dict.nav.language,
            primary: dict.nav.primary,
          }}
        />
        <main id="content">{children}</main>
        <SiteFooter locale={locale} links={links} dict={dict} />
        <FloatingContact label={dict.nav.contact} labels={dict.contactBar} />
      </body>
    </html>
  );
}
