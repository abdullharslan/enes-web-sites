import Link from "next/link";
import type { ReactNode } from "react";

const VARIANTS = {
  solid: "bg-gold text-ink hover:bg-gold-soft",
  outline:
    "border border-gold/70 text-cream hover:border-gold hover:bg-gold hover:text-ink",
} as const;

interface ButtonLinkProps {
  href: string;
  children: ReactNode;
  variant?: keyof typeof VARIANTS;
  /** Screen-reader hint for links that open a new tab (required for https: links). */
  newTabHint?: string;
}

/** In-app paths use client navigation; https: opens a new tab; tel:/mailto: stay plain. */
export function ButtonLink({
  href,
  children,
  variant = "solid",
  newTabHint,
}: ButtonLinkProps) {
  const className = `inline-flex min-h-11 items-center justify-center gap-3 px-7 py-3 text-xs font-semibold uppercase tracking-label transition-colors duration-300 ${VARIANTS[variant]}`;

  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }
  const opensNewTab = href.startsWith("https://");
  return (
    <a
      href={href}
      className={className}
      {...(opensNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
    >
      {children}
      {opensNewTab && newTabHint && <span className="sr-only"> {newTabHint}</span>}
    </a>
  );
}
