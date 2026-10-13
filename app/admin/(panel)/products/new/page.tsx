import type { Metadata } from "next";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { ProductForm } from "@/components/admin/catalog-forms";
import { productFormOptions } from "@/lib/admin/options";
import { newRequestKey } from "@/lib/admin/request-key";
import { T } from "@/lib/admin/text";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";

export const metadata: Metadata = { title: T.products.new };

export default async function NewProductPage() {
  const user = await requireUser();
  if (!can(user.role, "catalog:write")) return <AccessDenied />;
  const [{ brands, categories }, requestKey] = await Promise.all([
    productFormOptions(),
    newRequestKey(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <AdminPageTitle>{T.products.new}</AdminPageTitle>
      <ProductForm
        id={null}
        version={0}
        requestKey={requestKey}
        brands={brands}
        categories={categories}
        values={{
          slug: "",
          brandId: "",
          categoryId: "",
          model: "",
          reference: null,
          year: null,
          condition: "excellent",
          setItems: [],
          material: {},
          dimensions: null,
          description: {},
          priceEur: null,
          status: "available",
          sortOrder: 0,
          isVisible: true,
          addedAt: today,
        }}
      />
      <p className="mt-8 text-sm text-mist">{T.products.saveFirst}</p>
    </>
  );
}
