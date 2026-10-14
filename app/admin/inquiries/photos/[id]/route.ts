import { z } from "zod";
import { db } from "@/db/client";
import { getCurrentUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";
import { PRIVATE_ROOT, readInquiryPhoto } from "@/lib/server/inquiries/photos";
import { findInquiryPhoto } from "@/lib/server/inquiries/service";

const PRIVATE_HEADERS = {
  "Content-Type": "image/webp",
  // Personal data: never stored by shared caches or the browser cache.
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Content-Disposition": "inline",
};

/** Photos sent with consignment requests: only for signed-in staff allowed to handle inquiries. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  if (!can(user.role, "inquiries:manage")) return new Response(null, { status: 403 });

  const id = z.uuid().safeParse((await params).id);
  const photo = id.success ? await findInquiryPhoto(db, id.data) : null;
  const file = photo ? await readInquiryPhoto(PRIVATE_ROOT, photo.key) : null;
  if (!file) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(file), { headers: PRIVATE_HEADERS });
}
