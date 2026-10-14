export type FormRecord = Record<string, string | string[]>;

/** Converts FormData to a plain record; `arrayFields` always become string arrays. */
export function formDataToRecord(
  formData: FormData,
  arrayFields: readonly string[],
): FormRecord {
  const record: FormRecord = Object.fromEntries(arrayFields.map((field) => [field, []]));
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    const current = record[key];
    record[key] = Array.isArray(current) ? [...current, value] : value;
  }
  return record;
}

const MAX_ARRAY_ITEMS = 20;

/** Caps every value (and array) so that echoing input back stays small. */
export function boundRecord(record: FormRecord, maxLength: number): FormRecord {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? value.slice(0, MAX_ARRAY_ITEMS).map((item) => item.slice(0, maxLength))
        : value.slice(0, maxLength),
    ]),
  );
}
