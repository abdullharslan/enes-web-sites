import type { Metadata } from "next";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { BrandForm } from "@/components/admin/catalog-forms";
import { newRequestKey } from "@/lib/admin/request-key";
import { T } from "@/lib/admin/text";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";

export const metadata: Metadata = { title: T.brands.new };

export default async function NewBrandPage() {
  const user = await requireUser();
  if (!can(user.role, "catalog:write")) return <AccessDenied />;
  return (
    <>
      <AdminPageTitle>{T.brands.new}</AdminPageTitle>
      <BrandForm
        id={null}
        version={0}
        requestKey={await newRequestKey()}
        values={{ slug: "", name: "", description: {}, sortOrder: 0, isVisible: true }}
      />
    </>
  );
}
