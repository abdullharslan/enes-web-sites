import type { Metadata } from "next";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { AdminButtonLink, AdminTable, TextLink } from "@/components/admin/table";
import { T } from "@/lib/admin/text";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";
import { listCategories } from "@/lib/server/catalog/admin-queries";

export const metadata: Metadata = { title: T.categories.title };

export default async function CategoriesAdminPage() {
  const user = await requireUser();
  if (!can(user.role, "catalog:write")) return <AccessDenied />;
  const rows = await listCategories();
  return (
    <>
      <AdminPageTitle
        actions={
          <AdminButtonLink href="/admin/categories/new">
            {T.categories.new}
          </AdminButtonLink>
        }
      >
        {T.categories.title}
      </AdminPageTitle>
      <AdminTable
        head={[
          T.categories.name,
          T.fields.slug,
          T.fields.sortOrder,
          T.common.visibility,
          T.common.version,
          T.common.actions,
        ]}
      >
        {rows.map((c) => (
          <tr key={c.id}>
            <td className="py-3 pr-4">{c.name.tr ?? c.name.de}</td>
            <td className="py-3 pr-4 text-mist">{c.slug}</td>
            <td className="py-3 pr-4">{c.sortOrder}</td>
            <td className="py-3 pr-4">
              {c.isVisible ? T.common.visible : T.common.hidden}
            </td>
            <td className="py-3 pr-4">v{c.currentVersion}</td>
            <td className="py-3">
              <TextLink href={`/admin/categories/${c.id}`}>{T.common.edit}</TextLink>
            </td>
          </tr>
        ))}
      </AdminTable>
    </>
  );
}
