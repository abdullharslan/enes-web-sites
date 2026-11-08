import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  brands,
  categories,
  media,
  productMedia,
  products,
  revisions,
  users,
} from "@/db/schema";
import { mediaUrl } from "@/lib/server/media/store";

/* Read side for the admin panel: includes hidden records, never cached. */

export async function listBrands() {
  return db.select().from(brands).orderBy(asc(brands.sortOrder), asc(brands.name));
}

export async function listCategories() {
  return db.select().from(categories).orderBy(asc(categories.sortOrder));
}

async function mediaSrc(id: string | null): Promise<string | null> {
  if (!id) return null;
  const [row] = await db.select({ key: media.key }).from(media).where(eq(media.id, id));
  return row ? mediaUrl(row.key) : null;
}

export async function getBrand(id: string) {
  const [row] = await db.select().from(brands).where(eq(brands.id, id));
  return row ? { ...row, heroSrc: await mediaSrc(row.heroMediaId) } : null;
}

export async function getCategory(id: string) {
  const [row] = await db.select().from(categories).where(eq(categories.id, id));
  return row ? { ...row, tileSrc: await mediaSrc(row.tileMediaId) } : null;
}

export async function listProducts() {
  const rows = await db
    .select({
      product: products,
      brandName: brands.name,
      categoryName: categories.name,
      brandVisible: brands.isVisible,
      categoryVisible: categories.isVisible,
    })
    .from(products)
    .innerJoin(brands, eq(products.brandId, brands.id))
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .orderBy(desc(products.updatedAt));
  const ids = rows.map((r) => r.product.id);
  const firstImages = ids.length
    ? await db
        .select({ productId: productMedia.productId, key: media.key })
        .from(productMedia)
        .innerJoin(media, eq(productMedia.mediaId, media.id))
        .where(inArray(productMedia.productId, ids))
        .orderBy(asc(productMedia.position))
    : [];
  const thumb = new Map<string, string>();
  for (const image of firstImages)
    if (!thumb.has(image.productId)) thumb.set(image.productId, mediaUrl(image.key));
  return rows.map((r) => ({ ...r, thumbSrc: thumb.get(r.product.id) ?? null }));
}

export async function getProduct(id: string) {
  const [row] = await db.select().from(products).where(eq(products.id, id));
  if (!row) return null;
  const images = await db
    .select({ mediaId: media.id, key: media.key, alt: media.alt })
    .from(productMedia)
    .innerJoin(media, eq(productMedia.mediaId, media.id))
    .where(eq(productMedia.productId, id))
    .orderBy(asc(productMedia.position));
  return { ...row, images: images.map((i) => ({ ...i, src: mediaUrl(i.key) })) };
}

export async function listHistory(entityType: string, entityId: string) {
  return db
    .select({ revision: revisions, author: users.name })
    .from(revisions)
    .leftJoin(users, eq(revisions.authorId, users.id))
    .where(and(eq(revisions.entityType, entityType), eq(revisions.entityId, entityId)))
    .orderBy(desc(revisions.version));
}
