import type { ReactNode } from "react";

interface SectionProps {
  labelledBy: string;
  children: ReactNode;
  tone?: "ink" | "coal";
}

/** Standard page section: vertical rhythm, max width and side gutters. */
export function Section({ labelledBy, children, tone = "ink" }: SectionProps) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={tone === "coal" ? "bg-coal" : "bg-ink"}
    >
      <div className="mx-auto max-w-screen-2xl px-4 py-20 sm:px-8 sm:py-28">
        {children}
      </div>
    </section>
  );
}
