import type { Metadata } from "next";
import { Cormorant_Garamond, Montserrat } from "next/font/google";
import { Suspense, type ReactNode } from "react";
import { T } from "@/lib/admin/text";
import "../globals.css";

const display = Cormorant_Garamond({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-cormorant",
});
const sans = Montserrat({
  subsets: ["latin", "latin-ext"],
  variable: "--font-montserrat",
});

export const metadata: Metadata = {
  title: { default: T.meta.title, template: `%s | ${T.meta.title}` },
  robots: { index: false, follow: false },
};

function Loading() {
  return (
    <p role="status" className="p-8 text-sm text-mist">
      {T.common.loading}
    </p>
  );
}

/** Separate root layout: the admin area is not localised and never indexed. */
export default function AdminRootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" className={`${display.variable} ${sans.variable}`}>
      <body className="min-h-svh">
        {/* Everything below reads the session cookie, i.e. request-time data. */}
        <Suspense fallback={<Loading />}>{children}</Suspense>
      </body>
    </html>
  );
}
