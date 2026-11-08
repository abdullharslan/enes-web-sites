import type { Metadata } from "next";
import Image from "next/image";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { AdminButtonLink, AdminTable, TextLink } from "@/components/admin/table";
import { T } from "@/lib/admin/text";
import { formatEur } from "@/lib/format";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";
import { listProducts } from "@/lib/server/catalog/admin-queries";

export const metadata: Metadata = { title: T.products.title };

/** What the public site actually does: a hidden brand or category hides its products too. */
function effectiveVisibility(
  ownVisible: boolean,
  brandVisible: boolean,
  categoryVisible: boolean,
): string {
  if (!ownVisible) return T.common.hidden;
  if (!brandVisible && !categoryVisible) return T.products.hiddenByBrandAndCategory;
  if (!brandVisible) return T.products.hiddenByBrand;
  if (!categoryVisible) return T.products.hiddenByCategory;
  return T.common.visible;
}

export default async function ProductsAdminPage() {
  const user = await requireUser();
  if (!can(user.role, "catalog:write")) return <AccessDenied />;
  const rows = await listProducts();
  const p = T.products;
  return (
    <>
      <AdminPageTitle
        actions={<AdminButtonLink href="/admin/products/new">{p.new}</AdminButtonLink>}
      >
        {p.title}
      </AdminPageTitle>
      <AdminTable
        head={[
          p.images,
          p.brand,
          p.model,
          p.category,
          p.status,
          p.price,
          T.common.visibility,
          T.common.version,
          T.common.actions,
        ]}
      >
        {rows.map(({ product, brandName, categoryName, thumbSrc, ...parents }) => (
          <tr key={product.id}>
            <td className="py-2 pr-4">
              <div className="relative size-12 overflow-hidden bg-graphite">
                {thumbSrc && (
                  <Image
                    src={thumbSrc}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                )}
              </div>
            </td>
            <td className="py-3 pr-4">{brandName}</td>
            <td className="py-3 pr-4">{product.model}</td>
            <td className="py-3 pr-4">{categoryName.tr ?? categoryName.de}</td>
            <td className="py-3 pr-4">{p.statuses[product.status]}</td>
            <td className="py-3 pr-4">
              {product.priceEur === null
                ? p.onRequest
                : formatEur(product.priceEur, "de")}
            </td>
            <td className="py-3 pr-4">
              {effectiveVisibility(
                product.isVisible,
                parents.brandVisible,
                parents.categoryVisible,
              )}
            </td>
            <td className="py-3 pr-4">v{product.currentVersion}</td>
            <td className="py-3">
              <TextLink href={`/admin/products/${product.id}`}>{T.common.edit}</TextLink>
            </td>
          </tr>
        ))}
      </AdminTable>
    </>
  );
}
