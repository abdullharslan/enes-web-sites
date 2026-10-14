import type { InquiryKind } from "./policy";

/** Fields shown to staff, in reading order; anything else in the payload is ignored. */
export const DETAIL_FIELDS = [
  "item",
  "name",
  "email",
  "phone",
  "brand",
  "category",
  "model",
  "condition",
  "year",
  "askingPrice",
  "setItems",
  "message",
] as const;
export type DetailField = (typeof DETAIL_FIELDS)[number];

const SUBJECT_LENGTH = 60;

const str = (value: unknown) =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : "";

/** One line describing what the inquiry is about (stored data is treated as untrusted). */
export function inquirySubject(kind: InquiryKind, data: Record<string, unknown>): string {
  const subject =
    kind === "product"
      ? str(data.item)
      : kind === "sell"
        ? [str(data.brand), str(data.model)].filter(Boolean).join(" ")
        : str(data.message);
  if (!subject.trim()) return "—";
  return subject.length > SUBJECT_LENGTH
    ? `${subject.slice(0, SUBJECT_LENGTH)}…`
    : subject;
}

interface CodeNames {
  conditions: Record<string, string>;
  setItems: Record<string, string>;
}

/** Labelled, human-readable values for the detail view. */
export function inquiryDetails(
  data: Record<string, unknown>,
  names: CodeNames,
): Array<[DetailField, string]> {
  const rows: Array<[DetailField, string]> = [];
  for (const field of DETAIL_FIELDS) {
    const raw = data[field];
    const value =
      field === "setItems" && Array.isArray(raw)
        ? raw.map((code) => names.setItems[str(code)] ?? str(code)).join(", ")
        : field === "condition"
          ? (names.conditions[str(raw)] ?? str(raw))
          : str(raw);
    if (value.trim()) rows.push([field, value]);
  }
  return rows;
}
