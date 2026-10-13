import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { CategoryForm } from "@/components/admin/catalog-forms";
import { ImagePanel } from "@/components/admin/image-panel";
import { TextLink } from "@/components/admin/table";
import { newRequestKey } from "@/lib/admin/request-key";
import { T } from "@/lib/admin/text";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";
import { getCategory } from "@/lib/server/catalog/admin-queries";

export const metadata: Metadata = { title: T.categories.edit };

export default async function EditCategoryPage({
  params,
  searchParams,
}: PageProps<"/admin/categories/[id]">) {
  const user = await requireUser();
  if (!can(user.role, "catalog:write")) return <AccessDenied />;
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const category = /^[0-9a-f-]{36}$/.test(id) ? await getCategory(id) : null;
  if (!category) notFound();
  return (
    <>
      <AdminPageTitle
        actions={
          <TextLink href={`/admin/history/category/${category.id}`}>
            {T.common.history}
          </TextLink>
        }
      >
        {category.name.tr ?? category.name.de}
      </AdminPageTitle>
      <CategoryForm
        key={category.currentVersion}
        id={category.id}
        version={category.currentVersion}
        requestKey={await newRequestKey()}
        savedVersion={typeof query.saved === "string" ? query.saved : undefined}
        values={category}
      />
      <ImagePanel
        title={T.categories.tile}
        src={category.tileSrc}
        target="category"
        id={category.id}
        slug={category.slug}
      />
    </>
  );
}
