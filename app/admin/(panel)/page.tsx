import { count, desc, eq } from "drizzle-orm";
import { AdminPageTitle } from "@/components/admin/admin-shell";
import { db } from "@/db/client";
import { brands, categories, products, revisions, users } from "@/db/schema";
import { T } from "@/lib/admin/text";
import { interpolate } from "@/lib/i18n/interpolate";
import { requireUser } from "@/lib/server/auth/current";

const dateTime = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function DashboardPage() {
  const user = await requireUser();
  const [[p], [b], [c], recent] = await Promise.all([
    db.select({ n: count() }).from(products),
    db.select({ n: count() }).from(brands),
    db.select({ n: count() }).from(categories),
    db
      .select({ revision: revisions, author: users.name })
      .from(revisions)
      .leftJoin(users, eq(revisions.authorId, users.id))
      .orderBy(desc(revisions.createdAt), desc(revisions.id))
      .limit(10),
  ]);

  const stats = [
    [T.dashboard.products, p?.n ?? 0],
    [T.dashboard.brands, b?.n ?? 0],
    [T.dashboard.categories, c?.n ?? 0],
  ] as const;

  return (
    <>
      <AdminPageTitle>
        {interpolate(T.dashboard.welcome, { name: user.name })}
      </AdminPageTitle>
      <dl className="mb-12 grid gap-4 sm:grid-cols-3">
        {stats.map(([label, value]) => (
          <div key={label} className="border border-line bg-coal p-6">
            <dt className="text-xs uppercase tracking-label text-mist">{label}</dt>
            <dd className="mt-2 font-display text-5xl text-gold">{value}</dd>
          </div>
        ))}
      </dl>
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-luxe text-gold">
        {T.dashboard.recentChanges}
      </h2>
      {recent.length === 0 ? (
        <p className="text-mist">{T.dashboard.noChanges}</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line text-sm">
          {recent.map(({ revision, author }) => (
            <li key={revision.id} className="flex flex-wrap justify-between gap-2 py-3">
              <span>
                {revision.entityType} · v{revision.version}
                {revision.comment ? ` · ${revision.comment}` : ""}
              </span>
              <span className="text-mist">
                {author ?? T.audit.system} · {dateTime.format(revision.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
