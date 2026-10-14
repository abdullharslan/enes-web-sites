import { NextResponse, type NextRequest } from "next/server";
import { resolveRedirect } from "@/lib/i18n/redirect";

/** Ensures every page URL carries a supported locale prefix. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const target = resolveRedirect(
    pathname,
    search,
    request.headers.get("accept-language"),
  );
  if (target === null) return NextResponse.next();
  return NextResponse.redirect(new URL(target, request.url));
}

export const config = {
  // Skip Next internals, static assets, the admin area, media, API routes and any path with a file extension.
  matcher: ["/((?!_next/|images/|admin(?:/|$)|media/|api/|favicon.ico|.*\\..*).*)"],
};
