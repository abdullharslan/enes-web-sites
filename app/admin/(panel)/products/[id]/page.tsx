import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { removeProductImageAction } from "@/app/admin/actions/catalog";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { ImageUploadForm, ProductForm } from "@/components/admin/catalog-forms";
import { TextLink } from "@/components/admin/table";
import { productFormOptions } from "@/lib/admin/options";
import { newRequestKey } from "@/lib/admin/request-key";
import { T } from "@/lib/admin/text";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";
import { getProduct } from "@/lib/server/catalog/admin-queries";

export const metadata: Metadata = { title: T.products.edit };

export default async function EditProductPage({
  params,
  searchParams,
}: PageProps<"/admin/products/[id]">) {
  const user = await requireUser();
  if (!can(user.role, "catalog:write")) return <AccessDenied />;
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const product = /^[0-9a-f-]{36}$/.test(id) ? await getProduct(id) : null;
  if (!product) notFound();
  const [{ brands, categories }, requestKey] = await Promise.all([
    productFormOptions(),
    newRequestKey(),
  ]);

  return (
    <>
      <AdminPageTitle
        actions={
          <TextLink href={`/admin/history/product/${product.id}`}>
            {T.common.history}
          </TextLink>
        }
      >
        {product.model}
      </AdminPageTitle>
      <ProductForm
        key={product.currentVersion}
        id={product.id}
        version={product.currentVersion}
        requestKey={requestKey}
        savedVersion={typeof query.saved === "string" ? query.saved : undefined}
        brands={brands}
        categories={categories}
        values={product}
      />
      <section aria-labelledby="product-images" className="mt-12">
        <h2
          id="product-images"
          className="mb-4 text-xs font-semibold uppercase tracking-luxe text-gold"
        >
          {T.products.images}
        </h2>
        <ul className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {product.images.map((image) => (
            <li key={image.mediaId} className="flex flex-col gap-2">
              <div className="relative aspect-[4/5] overflow-hidden border border-line bg-graphite">
                <Image
                  src={image.src}
                  alt={image.alt.de ?? ""}
                  fill
                  sizes="12rem"
                  className="object-cover"
                />
              </div>
              <form action={removeProductImageAction}>
                <input type="hidden" name="productId" value={product.id} />
                <input type="hidden" name="mediaId" value={image.mediaId} />
                <button
                  type="submit"
                  className="min-h-11 text-sm text-danger underline-offset-4 hover:underline"
                >
                  {T.products.removeImage}
                </button>
              </form>
            </li>
          ))}
        </ul>
        <ImageUploadForm target="product" id={product.id} slug={product.slug} />
      </section>
    </>
  );
}
