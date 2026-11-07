import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { BrandForm } from "@/components/admin/catalog-forms";
import { ImagePanel } from "@/components/admin/image-panel";
import { TextLink } from "@/components/admin/table";
import { fieldsKey, savedNotice } from "@/lib/admin/form-key";
import { newRequestKey } from "@/lib/admin/request-key";
import { T } from "@/lib/admin/text";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";
import { getBrand } from "@/lib/server/catalog/admin-queries";

export const metadata: Metadata = { title: T.brands.edit };

export default async function EditBrandPage({
  params,
  searchParams,
}: PageProps<"/admin/brands/[id]">) {
  const user = await requireUser();
  if (!can(user.role, "catalog:write")) return <AccessDenied />;
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const brand = /^[0-9a-f-]{36}$/.test(id) ? await getBrand(id) : null;
  if (!brand) notFound();

  return (
    <>
      <AdminPageTitle
        actions={
          <TextLink href={`/admin/history/brand/${brand.id}`}>
            {T.common.history}
          </TextLink>
        }
      >
        {brand.name}
      </AdminPageTitle>
      <BrandForm
        key={fieldsKey(brand)}
        id={brand.id}
        version={brand.currentVersion}
        requestKey={await newRequestKey()}
        savedVersion={savedNotice(query.saved, brand.currentVersion)}
        values={brand}
      />
      <ImagePanel
        title={T.brands.hero}
        src={brand.heroSrc}
        target="brand"
        id={brand.id}
        slug={brand.slug}
        version={brand.currentVersion}
      />
    </>
  );
}
