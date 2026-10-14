import type { Metadata } from "next";
import Link from "next/link";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { AdminTable } from "@/components/admin/table";
import { db } from "@/db/client";
import { T } from "@/lib/admin/text";
import { INQUIRY_STATUSES, type InquiryStatus } from "@/lib/inquiries/policy";
import { inquirySubject } from "@/lib/inquiries/present";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";
import { listInquiries } from "@/lib/server/inquiries/service";

export const metadata: Metadata = { title: T.inquiries.title };

const dateTime = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
});

const TABS: ReadonlyArray<{ value: InquiryStatus | "all"; label: string }> = [
  ...INQUIRY_STATUSES.map((s) => ({ value: s, label: T.inquiries.statuses[s] })),
  { value: "all", label: T.inquiries.all },
];

/** Unknown values fall back to the default view (fail closed, no error page). */
function parseView(value: string | string[] | undefined): InquiryStatus | "all" {
  return TABS.some((t) => t.value === value) ? (value as InquiryStatus | "all") : "new";
}

export default async function InquiriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  if (!can(user.role, "inquiries:manage")) return <AccessDenied />;
  const params = await searchParams;
  const view = parseView(params.status);
  const rows = await listInquiries(db, view === "all" ? undefined : view);

  return (
    <>
      <AdminPageTitle>{T.inquiries.title}</AdminPageTitle>
      {params.deleted === "1" && (
        <p role="status" className="mb-6 text-sm text-gold">
          {T.inquiries.deleted}
        </p>
      )}
      <nav aria-label={T.inquiries.filter} className="mb-6">
        <ul className="flex flex-wrap gap-2">
          {TABS.map((tab) => (
            <li key={tab.value}>
              <Link
                href={`/admin/inquiries?status=${tab.value}`}
                aria-current={tab.value === view ? "page" : undefined}
                className="inline-flex min-h-11 items-center border border-line px-4 text-xs uppercase tracking-label text-mist aria-[current=page]:border-gold aria-[current=page]:text-gold"
              >
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {rows.length === 0 ? (
        <p className="text-sm text-mist">{T.inquiries.empty}</p>
      ) : (
        <AdminTable
          head={[
            T.inquiries.date,
            T.inquiries.kind,
            T.inquiries.from,
            T.inquiries.subject,
            T.inquiries.status,
          ]}
        >
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="py-3 pr-4 whitespace-nowrap">
                {dateTime.format(row.createdAt)}
              </td>
              <td className="py-3 pr-4">{T.inquiries.kinds[row.kind]}</td>
              <td className="py-3 pr-4">
                <Link
                  href={`/admin/inquiries/${row.id}`}
                  className="inline-flex min-h-11 items-center text-gold underline-offset-4 hover:underline"
                >
                  {typeof row.data.name === "string" ? row.data.name : "—"}
                </Link>
              </td>
              <td className="py-3 pr-4 break-words">
                {inquirySubject(row.kind, row.data)}
              </td>
              <td className="py-3">{T.inquiries.statuses[row.status]}</td>
            </tr>
          ))}
        </AdminTable>
      )}
      <p className="mt-8 text-xs text-mist">{T.inquiries.retention}</p>
    </>
  );
}
