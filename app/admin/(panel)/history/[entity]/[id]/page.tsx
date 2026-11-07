import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { restoreAction } from "@/app/admin/actions/content";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { RestoreButton } from "@/components/admin/restore-button";
import { TextLink } from "@/components/admin/table";
import { describeChange, diffSnapshots } from "@/lib/admin/diff";
import { ADMIN_ERROR_MESSAGES, errorFromQuery } from "@/lib/admin/error-messages";
import { savedNotice } from "@/lib/admin/form-key";
import { newRequestKey } from "@/lib/admin/request-key";
import { T } from "@/lib/admin/text";
import { isContentKey } from "@/lib/content/blocks";
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
  content: "/admin/home",
  journal: "/admin/journal",
} as const;
type Entity = keyof typeof EDIT_PATH;
const isEntity = (value: string): value is Entity => Object.hasOwn(EDIT_PATH, value);

const WRITE_PERMISSION = {
  brand: "catalog:write",
  category: "catalog:write",
  product: "catalog:write",
  content: "content:write",
  journal: "content:write",
} as const;

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
  if (!isEntity(entity)) notFound();
  const entityId = decodeURIComponent(id);
  const validId =
    entity === "content" ? isContentKey(entityId) : /^[0-9a-f-]{36}$/.test(entityId);
  if (!validId) notFound();

  const [rows, brandRows, categoryRows] = await Promise.all([
    listHistory(entity, entityId),
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
  const canRestore = can(user.role, WRITE_PERMISSION[entity]);
  const currentVersion = rows[0]!.revision.version;
  // Shown only while the restored state is still the current version.
  const restored =
    typeof query.restored === "string" &&
    savedNotice(query.saved, currentVersion) &&
    rows.some(({ revision }) => String(revision.version) === query.restored)
      ? query.restored
      : undefined;
  const restoreError = errorFromQuery(query.restoreError);
  // One key per button: a double click restores once, a different version is a new request.
  const requestKeys = await Promise.all(rows.map(() => newRequestKey()));

  return (
    <>
      <AdminPageTitle
        actions={
          <TextLink href={`${EDIT_PATH[entity]}/${entityId}`}>{T.history.back}</TextLink>
        }
      >
        {T.history.title}
      </AdminPageTitle>
      <p className="mb-4 text-sm text-mist">{T.history.restoreNote}</p>
      <div aria-live="polite" className="mb-6 min-h-6 text-sm">
        {restoreError ? (
          <p role="alert" className="text-danger">
            {restoreError === "conflict"
              ? T.history.conflict
              : ADMIN_ERROR_MESSAGES[restoreError]}
          </p>
        ) : (
          restored && (
            <p className="text-gold">
              {T.history.restored.replace("{version}", restored)}
            </p>
          )
        )}
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
                <form action={restoreAction} className="mt-4">
                  <input type="hidden" name="entityType" value={entity} />
                  <input type="hidden" name="entityId" value={entityId} />
                  <input type="hidden" name="version" value={revision.version} />
                  <input type="hidden" name="expectedVersion" value={currentVersion} />
                  <input type="hidden" name="idempotencyKey" value={requestKeys[index]} />
                  <RestoreButton />
                </form>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
