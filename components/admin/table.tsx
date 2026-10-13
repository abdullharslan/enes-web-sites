import Link from "next/link";
import type { ReactNode } from "react";

export function AdminTable({
  head,
  children,
}: {
  head: readonly string[];
  children: ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-label text-mist">
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className="py-3 pr-4 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line border-y border-line">{children}</tbody>
      </table>
    </div>
  );
}

export function AdminButtonLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center bg-gold px-6 text-xs font-semibold uppercase tracking-label text-ink transition-colors hover:bg-gold-soft"
    >
      {children}
    </Link>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center text-gold underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}
