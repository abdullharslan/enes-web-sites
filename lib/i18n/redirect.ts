import { isLocale, resolveLocale } from "./locales";

/**
 * Returns the same-site path to redirect to when `pathname` has no supported
 * locale prefix, or `null` when no redirect is needed. The target always starts
 * with `/{locale}/…`, so it can never become protocol-relative or external.
 */
export function resolveRedirect(
  pathname: string,
  search: string,
  acceptLanguage: string | null,
): string | null {
  const firstSegment = pathname.split("/")[1] ?? "";
  if (isLocale(firstSegment)) return null;

  const locale = resolveLocale(acceptLanguage);
  const rest = pathname === "/" ? "" : pathname;
  return `/${locale}${rest}${search}`;
}
