import type { Metadata } from "next";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { CategoryForm } from "@/components/admin/catalog-forms";
import { newRequestKey } from "@/lib/admin/request-key";
import { T } from "@/lib/admin/text";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";

export const metadata: Metadata = { title: T.categories.new };

export default async function NewCategoryPage() {
  const user = await requireUser();
  if (!can(user.role, "catalog:write")) return <AccessDenied />;
  return (
    <>
      <AdminPageTitle>{T.categories.new}</AdminPageTitle>
      <CategoryForm
        id={null}
        version={0}
        requestKey={await newRequestKey()}
        values={{ slug: "", name: {}, sortOrder: 0, isVisible: true }}
      />
    </>
  );
}
