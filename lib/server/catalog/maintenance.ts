import { eq } from "drizzle-orm";
import type { Executor } from "@/db/connection";
import { media, productMedia } from "@/db/schema";
import { removeProductImage } from "./admin";

/**
 * Detaches every product photo whose original bytes have the given SHA-256 —
 * e.g. copies of an old placeholder stored by earlier seeds. Each removal is a
 * normal, versioned and audited change (actor: system); the media files stay
 * in the library. Running it again finds nothing.
 */
export async function detachPhotosBySha(tx: Executor, sha256: string): Promise<number> {
  const links = await tx
    .select({ productId: productMedia.productId, mediaId: productMedia.mediaId })
    .from(productMedia)
    .innerJoin(media, eq(media.id, productMedia.mediaId))
    .where(eq(media.sha256, sha256));
  for (const link of links) {
    await removeProductImage(tx, null, link.productId, link.mediaId);
  }
  return links.length;
}
