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

/**
 * A safe copy for echoing input back: only the listed fields, each value (and
 * array) capped, so an oversized or padded request is not mirrored to the sender.
 */
export function boundRecord(
  record: FormRecord,
  fields: readonly string[],
  maxLength: number,
): FormRecord {
  return Object.fromEntries(
    fields
      .filter((key) => Object.hasOwn(record, key))
      .map((key) => {
        const value = record[key]!;
        return [
          key,
          Array.isArray(value)
            ? value.slice(0, MAX_ARRAY_ITEMS).map((item) => item.slice(0, maxLength))
            : value.slice(0, maxLength),
        ];
      }),
  );
}
