import Link from "next/link";
import { InstagramIcon } from "@/components/ui/icons";
import { SITE } from "@/config/site";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { localePath, type Locale } from "@/lib/i18n/locales";
import { LEGAL_PAGES } from "@/lib/legal";
import type { PagesContent } from "@/lib/content/home";
import type { SiteContact } from "@/lib/content/resolve";
import { LanguageSwitcher } from "./language-switcher";
import type { NavLink } from "./site-header";

interface SiteFooterProps {
  contact: SiteContact;
  /** Editable footer texts (admin → Alt bilgi). */
  content: PagesContent["footer"];
  locale: Locale;
  links: readonly NavLink[];
  dict: Pick<Dictionary, "footer" | "legal" | "nav">;
}

const HEADING = "mb-5 text-xs font-semibold uppercase tracking-luxe text-gold";
const LINK =
  "inline-flex min-h-11 min-w-11 items-center text-sm text-mist transition-colors hover:text-cream";

export function SiteFooter({ contact, content, locale, links, dict }: SiteFooterProps) {
  return (
    <footer className="border-t border-line bg-coal">
      <div className="mx-auto grid max-w-screen-2xl gap-12 px-4 py-16 sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
        <div>
          <p
            lang="en"
            translate="no"
            className="font-display text-3xl tracking-label text-cream uppercase"
          >
            {SITE.name}
          </p>
          <p className="mt-3 text-sm text-mist">{content.tagline}</p>
          <a
            href={contact.instagram}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Instagram ${dict.nav.opensInNewTab}`}
            className="mt-6 inline-flex size-11 items-center justify-center border border-line text-gold transition-colors hover:border-gold"
          >
            <InstagramIcon />
          </a>
          {/* Phones: the header has no room for it and the menu needs JavaScript. */}
          <div className="mt-6 sm:hidden">
            <LanguageSwitcher current={locale} label={dict.nav.language} />
          </div>
        </div>

        <nav aria-label={dict.footer.explore}>
          <h2 className={HEADING}>{dict.footer.explore}</h2>
          <ul>
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={LINK}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className={HEADING}>{dict.footer.contact}</h2>
          <address className="text-sm leading-relaxed text-mist not-italic">
            <p>{contact.street}</p>
            <p>{contact.city}</p>
            <p>
              <a href={contact.phoneHref} className={LINK}>
                {contact.phoneDisplay}
              </a>
            </p>
            <p>
              <a href={`mailto:${contact.email}`} className={LINK}>
                {contact.email}
              </a>
            </p>
          </address>
        </div>

        <nav aria-label={dict.footer.legal}>
          <h2 className={HEADING}>{dict.footer.legal}</h2>
          <ul>
            {LEGAL_PAGES.map((page) => (
              <li key={page}>
                <Link href={localePath(locale, `/legal/${page}`)} className={LINK}>
                  {dict.legal.titles[page]}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto max-w-screen-2xl space-y-2 px-4 py-6 text-xs text-mist sm:px-8">
          {content.showDemoNotice && <p className="text-gold">{content.demoNotice}</p>}
          <p>{content.trademarkNotice}</p>
          <p>
            © {SITE.name}. {dict.footer.rights}
          </p>
        </div>
      </div>
    </footer>
  );
}
