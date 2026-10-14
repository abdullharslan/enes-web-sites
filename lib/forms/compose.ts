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
