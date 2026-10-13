import type { Metadata } from "next";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { AdminTable } from "@/components/admin/table";
import { T } from "@/lib/admin/text";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";
import { listAudit } from "@/lib/server/content/admin-queries";

export const metadata: Metadata = { title: T.audit.title };

const dateTime = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "medium",
});

export default async function AuditPage() {
  const user = await requireUser();
  if (!can(user.role, "audit:read")) return <AccessDenied />;
  const rows = await listAudit();
  return (
    <>
      <AdminPageTitle>{T.audit.title}</AdminPageTitle>
      <AdminTable head={[T.audit.when, T.audit.who, T.audit.action, T.audit.entity]}>
        {rows.map(({ event, actor }) => (
          <tr key={event.id}>
            <td className="py-3 pr-4 whitespace-nowrap">
              {dateTime.format(event.createdAt)}
            </td>
            <td className="py-3 pr-4">{actor ?? T.audit.system}</td>
            <td className="py-3 pr-4 font-mono text-xs">{event.action}</td>
            <td className="py-3 font-mono text-xs break-all text-mist">
              {event.entityType ? `${event.entityType} · ${event.entityId}` : "—"}
            </td>
          </tr>
        ))}
      </AdminTable>
    </>
  );
}
