import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { db } from "@/db/client";
import { T } from "@/lib/admin/text";
import {
  ANALYTICS_RANGES,
  brandInterest,
  dailySeries,
  parseRange,
} from "@/lib/analytics/track";
import { interpolate } from "@/lib/i18n/interpolate";
import { INQUIRY_KINDS } from "@/lib/inquiries/policy";
import {
  inquiriesPerDay,
  topPages,
  totalViews,
  viewsPerDay,
} from "@/lib/server/analytics/service";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";
import { loadCatalog } from "@/lib/server/catalog/load";

export const metadata: Metadata = { title: T.analytics.title };

const DAY_MS = 24 * 60 * 60 * 1000;
const TOP = 10;
const shortDay = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "short",
  timeZone: "UTC",
});

/** A row of a ranked list with a proportional bar (the number is always shown as text). */
function BarRow({ label, count, max }: { label: ReactNode; count: number; max: number }) {
  return (
    <tr>
      <td className="py-2 pr-4 break-words">{label}</td>
      <td className="w-1/2 py-2">
        <div className="flex items-center gap-3">
          <div
            aria-hidden="true"
            className="h-2 bg-gold"
            style={{ width: `${max ? Math.max(2, (count / max) * 100) : 0}%` }}
          />
          <span className="tabular-nums">{count}</span>
        </div>
      </td>
    </tr>
  );
}

function Ranked({
  title,
  head,
  rows,
}: {
  title: string;
  head: string;
  rows: ReadonlyArray<{ key: string; label: ReactNode; count: number }>;
}) {
  const max = Math.max(0, ...rows.map((r) => r.count));
  return (
    <section className="min-w-0">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-luxe text-gold">
        {title}
      </h2>
      {rows.length === 0 ? (
        <p className="text-sm text-mist">{T.analytics.none}</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="sr-only">
            <tr>
              <th scope="col">{head}</th>
              <th scope="col">{T.analytics.count}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <BarRow key={row.key} label={row.label} count={row.count} max={max} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user.role, "analytics:read")) return <AccessDenied />;
  const range = parseRange((await searchParams).range);
  const today = new Date();
  const from = new Date(today.getTime() - (range - 1) * DAY_MS);

  const [total, perDay, products, pages, allPages, inquiryRows, catalog] =
    await Promise.all([
      totalViews(db, from),
      viewsPerDay(db, from),
      topPages(db, from, TOP, "/collection/"),
      topPages(db, from, TOP),
      topPages(db, from, 1000),
      inquiriesPerDay(db, from),
      loadCatalog(db),
    ]);
  const series = dailySeries(perDay, range, today);
  const productName = new Map(
    catalog.products.map((p) => [
      p.slug,
      `${catalog.brands.find((b) => b.slug === p.brand)?.name ?? p.brand} ${p.model}`,
    ]),
  );
  const brandName = new Map(catalog.brands.map((b) => [b.slug, b.name]));
  const brands = brandInterest(
    allPages,
    new Map(catalog.products.map((p) => [p.slug, p.brand])),
  ).slice(0, TOP);
  const inquiryDays = dailySeries([], range, today).map(({ day }) => ({
    day,
    kinds: INQUIRY_KINDS.map(
      (kind) => inquiryRows.find((r) => r.day === day && r.kind === kind)?.count ?? 0,
    ),
  }));
  const inquiryTotal = inquiryRows.reduce((sum, r) => sum + r.count, 0);
  const maxDay = Math.max(0, ...series.map((d) => d.count));

  return (
    <>
      <AdminPageTitle>{T.analytics.title}</AdminPageTitle>
      <nav aria-label={T.analytics.range} className="mb-8">
        <ul className="flex flex-wrap gap-2">
          {ANALYTICS_RANGES.map((r) => (
            <li key={r}>
              <Link
                href={`/admin/analytics?range=${r}`}
                aria-current={r === range ? "page" : undefined}
                className="inline-flex min-h-11 items-center border border-line px-4 text-xs uppercase tracking-label text-mist aria-[current=page]:border-gold aria-[current=page]:text-gold"
              >
                {interpolate(T.analytics.days, { n: r })}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <dl className="mb-10 grid gap-4 sm:grid-cols-2">
        {[
          [T.analytics.views, total],
          [T.analytics.inquiries, inquiryTotal],
        ].map(([label, value]) => (
          <div key={label} className="border border-line bg-coal p-6">
            <dt className="text-xs uppercase tracking-label text-mist">{label}</dt>
            <dd className="mt-2 font-display text-4xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <section className="mb-12">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-luxe text-gold">
          {T.analytics.perDay}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="sr-only">
              <tr>
                <th scope="col">{T.analytics.day}</th>
                <th scope="col">{T.analytics.count}</th>
              </tr>
            </thead>
            <tbody>
              {series.map((d) => (
                <BarRow
                  key={d.day}
                  label={shortDay.format(new Date(`${d.day}T00:00:00Z`))}
                  count={d.count}
                  max={maxDay}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="mb-12 grid gap-12 lg:grid-cols-3">
        <Ranked
          title={T.analytics.topProducts}
          head={T.analytics.product}
          rows={products.map((r) => {
            const slug = r.page.split("/")[2] ?? "";
            return { key: r.page, label: productName.get(slug) ?? slug, count: r.count };
          })}
        />
        <Ranked
          title={T.analytics.topBrands}
          head={T.analytics.brand}
          rows={brands.map((b) => ({
            key: b.brand,
            label: brandName.get(b.brand) ?? b.brand,
            count: b.count,
          }))}
        />
        <Ranked
          title={T.analytics.topPages}
          head={T.analytics.page}
          rows={pages.map((r) => ({
            key: r.page,
            label: <span className="font-mono text-xs">{r.page}</span>,
            count: r.count,
          }))}
        />
      </div>

      <section className="mb-10">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-luxe text-gold">
          {T.analytics.inquiriesPerDay}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-label text-mist">
              <tr>
                <th scope="col" className="py-2 pr-4">
                  {T.analytics.day}
                </th>
                {INQUIRY_KINDS.map((kind) => (
                  <th key={kind} scope="col" className="py-2 pr-4">
                    {T.inquiries.kinds[kind]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {inquiryDays
                .filter((d) => d.kinds.some((n) => n > 0))
                .map((d) => (
                  <tr key={d.day}>
                    <td className="py-2 pr-4">
                      {shortDay.format(new Date(`${d.day}T00:00:00Z`))}
                    </td>
                    {d.kinds.map((n, i) => (
                      <td key={INQUIRY_KINDS[i]} className="py-2 pr-4 tabular-nums">
                        {n}
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {inquiryTotal === 0 && (
          <p className="mt-2 text-sm text-mist">{T.analytics.none}</p>
        )}
      </section>

      <p className="max-w-3xl text-xs leading-relaxed text-mist">{T.analytics.privacy}</p>
    </>
  );
}
