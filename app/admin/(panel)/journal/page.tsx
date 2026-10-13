import type { Metadata } from "next";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { AdminButtonLink, AdminTable, TextLink } from "@/components/admin/table";
import { T } from "@/lib/admin/text";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";
import { listJournal } from "@/lib/server/content/admin-queries";

export const metadata: Metadata = { title: T.journal.title };

export default async function JournalAdminPage() {
  const user = await requireUser();
  if (!can(user.role, "content:write")) return <AccessDenied />;
  const rows = await listJournal();
  return (
    <>
      <AdminPageTitle
        actions={
          <AdminButtonLink href="/admin/journal/new">{T.journal.new}</AdminButtonLink>
        }
      >
        {T.journal.title}
      </AdminPageTitle>
      <AdminTable
        head={[
          T.journal.titleField,
          T.journal.publishedAt,
          T.common.visibility,
          T.common.version,
          T.common.actions,
        ]}
      >
        {rows.map((j) => (
          <tr key={j.id}>
            <td className="py-3 pr-4">{j.title.tr ?? j.title.de}</td>
            <td className="py-3 pr-4">{j.publishedAt}</td>
            <td className="py-3 pr-4">
              {j.isVisible ? T.common.visible : T.common.hidden}
            </td>
            <td className="py-3 pr-4">v{j.currentVersion}</td>
            <td className="py-3">
              <TextLink href={`/admin/journal/${j.id}`}>{T.common.edit}</TextLink>
            </td>
          </tr>
        ))}
      </AdminTable>
    </>
  );
}
