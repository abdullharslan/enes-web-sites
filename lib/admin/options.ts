import "server-only";
import { listBrands, listCategories } from "@/lib/server/catalog/admin-queries";

/** Brand and category choices for product forms (hidden ones included, marked). */
export async function productFormOptions() {
  const [brands, categories] = await Promise.all([listBrands(), listCategories()]);
  return {
    brands: brands.map((b) => ({
      value: b.id,
      label: b.isVisible ? b.name : `${b.name} (gizli)`,
    })),
    categories: categories.map((c) => ({
      value: c.id,
      label: c.name.tr ?? c.name.de ?? c.slug,
    })),
  };
}
