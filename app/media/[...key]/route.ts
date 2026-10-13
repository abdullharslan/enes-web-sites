import { readFile } from "node:fs/promises";
import { db } from "@/db/client";
import { parseMediaKey } from "@/lib/server/media/naming";
import { findServableMedia, resolveInside } from "@/lib/server/media/store";

const MEDIA_ROOT = process.env.MEDIA_ROOT ?? "storage/media";

/**
 * Serves immutable, versioned uploads. The key is parsed strictly and must
 * belong to a committed media row before the disk is touched.
 */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/media/[...key]">,
) {
  const key = (await params).key.join("/");
  if (!parseMediaKey(key) || !(await findServableMedia(db, key))) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const file = await readFile(resolveInside(MEDIA_ROOT, key));
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "image/webp",
        "Content-Length": String(file.length),
        // The key changes with every version, so the bytes behind a URL never change.
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
