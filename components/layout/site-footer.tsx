import Link from "next/link";
import { InstagramIcon } from "@/components/ui/icons";
import { SITE } from "@/config/site";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { localePath, type Locale } from "@/lib/i18n/locales";
import { LEGAL_PAGES } from "@/lib/legal";
import type { NavLink } from "./site-header";

interface SiteFooterProps {
  locale: Locale;
  links: readonly NavLink[];
  dict: Pick<Dictionary, "footer" | "legal">;
}

const HEADING = "mb-5 text-xs font-semibold uppercase tracking-luxe text-gold";
const LINK =
  "inline-flex min-h-11 min-w-11 items-center text-sm text-mist transition-colors hover:text-cream";

export function SiteFooter({ locale, links, dict }: SiteFooterProps) {
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
          <p className="mt-3 text-sm text-mist">{dict.footer.tagline}</p>
          <a
            href={SITE.social.instagram}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Instagram"
            className="mt-6 inline-flex size-11 items-center justify-center border border-line text-gold transition-colors hover:border-gold"
          >
            <InstagramIcon />
          </a>
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
            <p>{SITE.address.street}</p>
            <p>{SITE.address.city}</p>
            <p>
              <a href={SITE.phoneHref} className={LINK}>
                {SITE.phoneDisplay}
              </a>
            </p>
            <p>
              <a href={`mailto:${SITE.email}`} className={LINK}>
                {SITE.email}
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
          <p className="text-gold">{dict.footer.demoNotice}</p>
          <p>{dict.footer.trademarkNotice}</p>
          <p>
            © {SITE.name}. {dict.footer.rights}
          </p>
        </div>
      </div>
    </footer>
  );
}
