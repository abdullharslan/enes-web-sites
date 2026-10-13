import { pathToFileURL } from "node:url";

/** True when the calling module is the script being run (robust to non-ASCII paths). */
export function isMain(importMetaUrl: string): boolean {
  const entry = process.argv[1];
  return entry !== undefined && pathToFileURL(entry).href === importMetaUrl;
}
