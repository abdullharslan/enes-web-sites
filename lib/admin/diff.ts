export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

const IGNORED = new Set(["id"]);

/** Stable stringify: key order must not create phantom changes. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

/** Field-level changes between two revision snapshots (previous may be null for v1). */
export function diffSnapshots(
  previous: Record<string, unknown> | null,
  next: Record<string, unknown>,
): FieldChange[] {
  const before = previous ?? {};
  const fields = [...new Set([...Object.keys(before), ...Object.keys(next)])].filter(
    (f) => !IGNORED.has(f),
  );
  return fields
    .filter((field) => canonical(before[field]) !== canonical(next[field]))
    .map((field) => ({ field, before: before[field], after: next[field] }));
}

const MAX_LENGTH = 118;

/** Compact human-readable rendering for the history table. */
export function formatValue(value: unknown): string {
  let text: string;
  if (value === undefined || value === null) text = "—";
  else if (typeof value === "boolean") text = value ? "evet" : "hayır";
  else if (Array.isArray(value)) text = value.map(String).join(", ");
  else if (typeof value === "object") {
    text = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(" · ");
  } else text = String(value);
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1)}…` : text;
}

export interface ChangeContext {
  labels: Readonly<Record<string, string>>;
  /** Id → human name for referenced records (brands, categories). */
  names: ReadonlyMap<string, string>;
  /** Template like "{count} görsel". */
  imagesLabel: string;
}

/** Field label and before/after text an editor can read (no raw ids). */
export function describeChange(change: FieldChange, context: ChangeContext) {
  const render = (value: unknown) => {
    if (change.field === "mediaIds" && Array.isArray(value)) {
      return context.imagesLabel.replace("{count}", String(value.length));
    }
    if (typeof value === "string" && context.names.has(value))
      return context.names.get(value)!;
    return formatValue(value);
  };
  return {
    label: context.labels[change.field] ?? change.field,
    before: render(change.before),
    after: render(change.after),
  };
}
