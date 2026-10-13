import { NextResponse, type NextRequest } from "next/server";
import { isLocale, resolveLocale } from "@/lib/i18n/locales";

/** Ensures every page URL carries a supported locale prefix. */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/")[1] ?? "";
  if (isLocale(firstSegment)) return NextResponse.next();

  const locale = resolveLocale(request.headers.get("accept-language"));
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals, static assets and any path with a file extension.
  matcher: ["/((?!_next/|images/|favicon.ico|.*\\..*).*)"],
};
