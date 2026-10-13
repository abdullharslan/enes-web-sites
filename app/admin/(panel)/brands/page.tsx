import type { Metadata } from "next";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { AdminButtonLink, AdminTable, TextLink } from "@/components/admin/table";
import { T } from "@/lib/admin/text";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";
import { listBrands } from "@/lib/server/catalog/admin-queries";

export const metadata: Metadata = { title: T.brands.title };

export default async function BrandsAdminPage() {
  const user = await requireUser();
  if (!can(user.role, "catalog:write")) return <AccessDenied />;
  const rows = await listBrands();
  return (
    <>
      <AdminPageTitle
        actions={
          <AdminButtonLink href="/admin/brands/new">{T.brands.new}</AdminButtonLink>
        }
      >
        {T.brands.title}
      </AdminPageTitle>
      <AdminTable
        head={[
          T.brands.name,
          T.fields.slug,
          T.fields.sortOrder,
          T.common.visibility,
          T.common.version,
          T.common.actions,
        ]}
      >
        {rows.map((b) => (
          <tr key={b.id}>
            <td className="py-3 pr-4">{b.name}</td>
            <td className="py-3 pr-4 text-mist">{b.slug}</td>
            <td className="py-3 pr-4">{b.sortOrder}</td>
            <td className="py-3 pr-4">
              {b.isVisible ? T.common.visible : T.common.hidden}
            </td>
            <td className="py-3 pr-4">v{b.currentVersion}</td>
            <td className="py-3">
              <TextLink href={`/admin/brands/${b.id}`}>{T.common.edit}</TextLink>
            </td>
          </tr>
        ))}
      </AdminTable>
    </>
  );
}
