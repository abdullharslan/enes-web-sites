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
  // Skip Next internals, static assets and any path with a file extension.
  // (Routes outside the locale tree are added here only once they exist.)
  matcher: ["/((?!_next/|images/|favicon.ico|.*\\..*).*)"],
};
