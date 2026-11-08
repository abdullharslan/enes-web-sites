import type { z } from "zod";

export type FormValues = Record<string, string | string[]>;

export type FormState =
  | { status: "idle" }
  | { status: "ok"; message?: string }
  | {
      status: "error";
      error:
        | "invalid"
        | "conflict"
        | "duplicateSlug"
        | "forbidden"
        | "notFound"
        | "upload"
        | "noChange";
      fieldErrors?: Record<string, string>;
      /** Echoed back so React's post-submit reset keeps the admin's edits (never files or passwords). */
      values?: FormValues;
    };

export const IDLE: FormState = { status: "idle" };

/** Plain, serialisable copy of submitted text fields; repeated keys become arrays, files are dropped. */
export function formValues(form: FormData): FormValues {
  const values: FormValues = {};
  for (const [key, value] of form.entries()) {
    if (typeof value !== "string" || key.startsWith("$ACTION")) continue;
    const current = values[key];
    values[key] = current === undefined ? value : [...[current].flat(), value];
  }
  return values;
}

/** Maps zod issues to `field.path → message code` (first issue per field); `refine` rules name their own code. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    result[key] ??= issue.code === "custom" ? issue.message : "invalid";
  }
  return result;
}

/** Value to show in a field: what was just submitted (after an error) or the stored default. */
export function pick(
  state: FormState,
  key: string,
  fallback: string | undefined,
): string {
  if (state.status === "error" && state.values && key in state.values) {
    const value = state.values[key];
    return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
  }
  return fallback ?? "";
}

export type FormErrorCode = Extract<FormState, { status: "error" }>["error"];
