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

type MessageValue = string | number | readonly string[] | undefined;

/** Renders labelled values as a plain-text message body, skipping empty values. */
export function composeMessage(
  entries: ReadonlyArray<readonly [string, MessageValue]>,
): string {
  return entries
    .map(
      ([label, value]) =>
        [label, Array.isArray(value) ? value.join(", ") : String(value ?? "")] as const,
    )
    .filter(([, text]) => text.trim() !== "")
    .map(([label, text]) =>
      text.includes("\n") ? `\n${label}:\n${text}` : `${label}: ${text}`,
    )
    .join("\n");
}
