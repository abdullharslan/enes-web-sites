"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CloseIcon, MenuIcon, SearchIcon } from "@/components/ui/icons";
import { SITE } from "@/config/site";
import type { Locale } from "@/lib/i18n/locales";
import { LanguageSwitcher } from "./language-switcher";

export interface NavLink {
  href: string;
  label: string;
}

interface SiteHeaderProps {
  locale: Locale;
  homeHref: string;
  searchHref: string;
  links: readonly NavLink[];
  labels: {
    menu: string;
    search: string;
    openMenu: string;
    closeMenu: string;
    language: string;
    primary: string;
  };
}

const SCROLL_THRESHOLD = 24;

export function SiteHeader({
  locale,
  homeHref,
  searchHref,
  links,
  labels,
}: SiteHeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SCROLL_THRESHOLD);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const openMenu = () => {
    dialogRef.current?.showModal();
    setMenuOpen(true);
  };
  // Escape and link clicks both end in the dialog's native "close" event.
  const closeMenu = () => dialogRef.current?.close();

  const switcher = <LanguageSwitcher current={locale} label={labels.language} />;

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-colors duration-500 ${
        scrolled
          ? "border-b border-line bg-ink/95 backdrop-blur"
          : "bg-gradient-to-b from-ink/80 to-transparent"
      }`}
    >
      <div className="mx-auto grid h-20 max-w-screen-2xl grid-cols-[1fr_auto_1fr] items-center px-4 sm:px-8">
        <button
          type="button"
          onClick={openMenu}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-label={labels.openMenu}
          className="inline-flex min-h-11 min-w-11 items-center gap-3 justify-self-start text-cream transition-colors hover:text-gold"
        >
          <MenuIcon width={24} height={24} />
          <span
            aria-hidden="true"
            className="hidden text-xs font-semibold uppercase tracking-label sm:inline"
          >
            {labels.menu}
          </span>
        </button>

        <Link
          href={homeHref}
          className="flex min-h-11 flex-col items-center justify-center leading-none"
        >
          <span
            lang="en"
            translate="no"
            className="font-display text-lg whitespace-nowrap tracking-label text-cream uppercase sm:text-3xl"
          >
            {SITE.name}
          </span>
        </Link>

        {/* Four locales do not fit next to the logo on phones; there the switcher lives in the menu. */}
        <div className="flex items-center justify-self-end">
          <Link
            href={searchHref}
            aria-label={labels.search}
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-cream transition-colors hover:text-gold"
          >
            <SearchIcon width={20} height={20} />
          </Link>
          <div className="hidden sm:block">{switcher}</div>
        </div>
      </div>

      <dialog
        ref={dialogRef}
        onClose={() => setMenuOpen(false)}
        aria-label={labels.primary}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-ink text-cream backdrop:bg-ink/80"
      >
        <div className="mx-auto flex h-full max-w-screen-2xl flex-col px-4 sm:px-8">
          <div className="flex h-20 items-center justify-between">
            <button
              type="button"
              onClick={closeMenu}
              className="inline-flex min-h-11 min-w-11 items-center gap-3 text-cream transition-colors hover:text-gold"
            >
              <CloseIcon width={24} height={24} />
              <span className="text-xs font-semibold uppercase tracking-label">
                {labels.closeMenu}
              </span>
            </button>
            {switcher}
          </div>
          <nav aria-label={labels.primary} className="flex flex-1 items-center">
            <ul className="grid gap-x-16 gap-y-2 sm:grid-cols-2">
              {links.map((link, index) => (
                <li key={link.href} className="flex items-baseline gap-5">
                  <span aria-hidden="true" className="w-6 text-xs text-gold">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <Link
                    href={link.href}
                    onClick={closeMenu}
                    className="inline-block min-h-11 font-display text-4xl font-light text-cream transition-colors hover:text-gold sm:text-6xl"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </dialog>
    </header>
  );
}
