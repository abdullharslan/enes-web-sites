import type { Metadata } from "next";
import Image from "next/image";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { AdminTable } from "@/components/admin/table";
import { T } from "@/lib/admin/text";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";
import { listMedia } from "@/lib/server/content/admin-queries";

export const metadata: Metadata = { title: T.media.title };

const dateTime = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "medium",
  timeStyle: "short",
});
const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

export default async function MediaPage() {
  const user = await requireUser();
  if (!can(user.role, "media:write")) return <AccessDenied />;
  const rows = await listMedia();
  return (
    <>
      <AdminPageTitle>{T.media.title}</AdminPageTitle>
      <p className="mb-8 max-w-2xl text-sm text-mist">{T.media.intro}</p>
      <AdminTable
        head={[
          "",
          T.media.kind,
          T.media.entity,
          T.media.version,
          T.media.file,
          T.media.size,
          T.media.created,
        ]}
      >
        {rows.map((m) => (
          <tr key={m.id}>
            <td className="py-2 pr-4">
              <div className="relative size-12 overflow-hidden bg-graphite">
                <Image
                  src={m.src}
                  alt={m.alt.de ?? ""}
                  fill
                  sizes="48px"
                  className="object-cover"
                />
              </div>
            </td>
            <td className="py-3 pr-4">{m.kind}</td>
            <td className="py-3 pr-4">{m.entitySlug}</td>
            <td className="py-3 pr-4">v{m.version}</td>
            <td className="py-3 pr-4 font-mono text-xs break-all text-mist">{m.key}</td>
            <td className="py-3 pr-4">{kb(m.bytes)}</td>
            <td className="py-3">{dateTime.format(m.createdAt)}</td>
          </tr>
        ))}
      </AdminTable>
    </>
  );
}
