/** Replaces `{name}` placeholders; throws if a placeholder has no value. */
export function interpolate(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = values[key];
    if (value === undefined) throw new Error(`Missing value for placeholder "${key}"`);
    return String(value);
  });
}
