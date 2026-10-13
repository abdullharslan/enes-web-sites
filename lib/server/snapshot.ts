const BOOKKEEPING = new Set(["createdAt", "updatedAt", "currentVersion"]);

/** Editable state of a row for a revision: bookkeeping columns are not part of history. */
export function toSnapshot(
  row: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const editable = Object.fromEntries(
    Object.entries(row).filter(([key]) => !BOOKKEEPING.has(key)),
  );
  return JSON.parse(JSON.stringify({ ...editable, ...extra })) as Record<string, unknown>;
}
