import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { ImageUploadForm, ProductForm } from "@/components/admin/catalog-forms";
import { ProductImageControls } from "@/components/admin/product-image-controls";
import { TextLink } from "@/components/admin/table";
import { productFormOptions } from "@/lib/admin/options";
import { fieldsKey, savedNotice } from "@/lib/admin/form-key";
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
        fieldsKey={fieldsKey(product)}
        id={product.id}
        version={product.currentVersion}
        requestKey={requestKey}
        savedVersion={savedNotice(query.saved, product.currentVersion)}
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
          {product.images.map((image, index) => (
            <li key={image.mediaId} className="flex flex-col gap-2">
              <div className="relative aspect-[4/5] overflow-hidden border border-line bg-graphite">
                <Image
                  src={image.src}
                  alt={image.alt.de ?? ""}
                  fill
                  sizes="12rem"
                  className="object-cover"
                />
                {index === 0 && (
                  <span className="absolute top-2 left-2 bg-ink/85 px-2 py-1 text-2xs uppercase tracking-label text-gold">
                    {T.products.cover}
                  </span>
                )}
              </div>
              <ProductImageControls
                productId={product.id}
                mediaId={image.mediaId}
                version={product.currentVersion}
                index={index}
                count={product.images.length}
              />
            </li>
          ))}
        </ul>
        <ImageUploadForm
          target="product"
          id={product.id}
          slug={product.slug}
          version={product.currentVersion}
        />
      </section>
    </>
  );
}
