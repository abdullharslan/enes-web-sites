import { connect } from "@/db/connection";
import { detachPhotosBySha } from "@/lib/server/catalog/maintenance";

/*
 * One-off data fix for databases seeded before 2026-11-07: those seeds stored
 * the old framed placeholder (public/images/placeholder-mv.jpg, this SHA-256)
 * as a product photo. Products that only had it now show the shared, frameless
 * placeholder. Every change is a new product version (restorable); safe to re-run.
 */
const OLD_PLACEHOLDER_SHA256 =
  "a458ed69e022323d7dd816fc425a345429ee6e1bbb88e4f6874c195b75d614f5";

const { db, close } = connect(process.env.DATABASE_URL, { max: 1 });
db.transaction((tx) => detachPhotosBySha(tx, OLD_PLACEHOLDER_SHA256))
  .then((detached) =>
    console.log(`placeholder copies detached from products: ${detached}`),
  )
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(close);
