import type { FormErrorCode } from "@/lib/admin/form-state";
import { T } from "@/lib/admin/text";

/** One wording per admin error code, shared by forms (client) and pages (server). */
export const ADMIN_ERROR_MESSAGES: Record<FormErrorCode, string> = {
  invalid: T.common.error,
  conflict: T.fields.conflict,
  duplicateSlug: T.fields.duplicateSlug,
  forbidden: T.common.forbidden,
  notFound: T.fields.notFound,
  upload: T.fields.uploadFailed,
  noChange: T.fields.noChange,
};

/** Reads an error code from a query parameter (anything unknown is ignored). */
export function errorFromQuery(
  value: string | string[] | undefined,
): FormErrorCode | null {
  return typeof value === "string" && Object.hasOwn(ADMIN_ERROR_MESSAGES, value)
    ? (value as FormErrorCode)
    : null;
}
