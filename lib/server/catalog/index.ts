import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { db } from "@/db/client";
import type { Catalog } from "@/lib/catalog/schema";
import { loadCatalog } from "./load";

/** Cache tag invalidated (via `updateTag`) by every admin catalog mutation. */
export const CATALOG_TAG = "catalog";

/** The public catalog, prerendered and cached until an admin change invalidates it. */
export async function getCatalog(): Promise<Catalog> {
  "use cache";
  cacheLife("max");
  cacheTag(CATALOG_TAG);
  return loadCatalog(db);
}
