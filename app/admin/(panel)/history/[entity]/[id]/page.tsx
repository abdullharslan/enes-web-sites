import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { restoreRevisionAction } from "@/app/admin/actions/catalog";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { TextLink } from "@/components/admin/table";
import { describeChange, diffSnapshots } from "@/lib/admin/diff";
import { T } from "@/lib/admin/text";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";
import {
  listBrands,
  listCategories,
  listHistory,
} from "@/lib/server/catalog/admin-queries";

export const metadata: Metadata = { title: T.history.title };

const EDIT_PATH = {
  brand: "/admin/brands",
  category: "/admin/categories",
  product: "/admin/products",
} as const;
type Entity = keyof typeof EDIT_PATH;
const isEntity = (value: string): value is Entity => value in EDIT_PATH;

const dateTime = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "medium",
});

export default async function HistoryPage({
  params,
  searchParams,
}: PageProps<"/admin/history/[entity]/[id]">) {
  const user = await requireUser();
  if (!can(user.role, "history:read")) return <AccessDenied />;
  const [{ entity, id }, query] = await Promise.all([params, searchParams]);
  if (!isEntity(entity) || !/^[0-9a-f-]{36}$/.test(id)) notFound();

  const [rows, brandRows, categoryRows] = await Promise.all([
    listHistory(entity, id),
    listBrands(),
    listCategories(),
  ]);
  if (rows.length === 0) notFound();
  const context = {
    labels: T.history.fieldLabels as Record<string, string>,
    names: new Map<string, string>([
      ...brandRows.map((b) => [b.id, b.name] as const),
      ...categoryRows.map((c) => [c.id, c.name.tr ?? c.name.de ?? c.slug] as const),
    ]),
    imagesLabel: T.history.images,
  };
  const canRestore = can(user.role, "catalog:write");
  const restored = typeof query.restored === "string" ? query.restored : undefined;

  return (
    <>
      <AdminPageTitle
        actions={
          <TextLink href={`${EDIT_PATH[entity]}/${id}`}>{T.history.back}</TextLink>
        }
      >
        {T.history.title}
      </AdminPageTitle>
      <div aria-live="polite" className="mb-6 min-h-6 text-sm text-gold">
        {restored && T.history.restored.replace("{version}", restored)}
      </div>
      <ol className="flex flex-col gap-6">
        {rows.map(({ revision, author }, index) => {
          const previous = rows[index + 1]?.revision.data ?? null;
          const changes = diffSnapshots(previous, revision.data);
          const isCurrent = index === 0;
          return (
            <li key={revision.id} className="border border-line bg-coal p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-2xl">
                  {T.history.version} {revision.version}
                  {isCurrent && (
                    <span className="ml-3 text-xs uppercase tracking-label text-gold">
                      {T.history.current}
                    </span>
                  )}
                </h2>
                <p className="text-sm text-mist">
                  {author ?? T.audit.system} · {dateTime.format(revision.createdAt)}
                  {revision.comment ? ` · ${revision.comment}` : ""}
                </p>
              </div>
              {changes.length === 0 ? (
                <p className="text-sm text-mist">{T.history.noChanges}</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">{T.history.changes}</caption>
                  <thead className="text-xs uppercase tracking-label text-mist">
                    <tr>
                      <th scope="col" className="py-2 pr-4">
                        {T.history.field}
                      </th>
                      <th scope="col" className="py-2 pr-4">
                        {T.history.before}
                      </th>
                      <th scope="col" className="py-2">
                        {T.history.after}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {changes.map((c) => {
                      const row = describeChange(c, context);
                      return (
                        <tr key={c.field}>
                          <td className="py-2 pr-4 text-mist">{row.label}</td>
                          <td className="py-2 pr-4 break-all">{row.before}</td>
                          <td className="py-2 break-all">{row.after}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {!isCurrent && canRestore && (
                <form action={restoreRevisionAction} className="mt-4">
                  <input type="hidden" name="entityType" value={entity} />
                  <input type="hidden" name="entityId" value={id} />
                  <input type="hidden" name="version" value={revision.version} />
                  <button
                    type="submit"
                    className="min-h-11 border border-gold/70 px-5 text-xs font-semibold uppercase tracking-label transition-colors hover:bg-gold hover:text-ink"
                  >
                    {T.history.restore}
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
