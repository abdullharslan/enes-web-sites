/**
 * Versioned, immutable media keys:
 *   {kind}/{entity-slug}/{YYYYMMDD-HHmmss}_v{N}_{sha256[0..8]}.webp
 * Keys are never reused, so every historical version stays addressable.
 */

export const MEDIA_KINDS = ["brand", "category", "product", "home", "journal"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SHA256 = /^[a-f0-9]{64}$/;
const KEY =
  /^(?<kind>[a-z]+)\/(?<slug>[a-z0-9]+(?:-[a-z0-9]+)*)\/\d{8}-\d{6}_v(?<version>[1-9]\d*)_(?<hash>[a-f0-9]{8})\.webp$/;

export interface MediaKeyInput {
  kind: MediaKind;
  entitySlug: string;
  version: number;
  sha256: string;
  createdAt: Date;
}

export interface ParsedMediaKey {
  kind: MediaKind;
  entitySlug: string;
  version: number;
  shortHash: string;
}

const isMediaKind = (value: string): value is MediaKind =>
  (MEDIA_KINDS as readonly string[]).includes(value);

function utcStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}-` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
}

export function buildMediaKey({
  kind,
  entitySlug,
  version,
  sha256,
  createdAt,
}: MediaKeyInput): string {
  if (!isMediaKind(kind)) throw new TypeError(`Invalid media kind: ${kind}`);
  if (!SLUG.test(entitySlug)) throw new TypeError(`Invalid entity slug: ${entitySlug}`);
  if (!Number.isInteger(version) || version < 1)
    throw new TypeError(`Invalid version: ${version}`);
  if (!SHA256.test(sha256)) throw new TypeError("Invalid sha256 digest");
  return `${kind}/${entitySlug}/${utcStamp(createdAt)}_v${version}_${sha256.slice(0, 8)}.webp`;
}

/** Strict parser used before touching the filesystem; anything unexpected is rejected. */
export function parseMediaKey(key: string): ParsedMediaKey | null {
  const groups = KEY.exec(key)?.groups;
  if (!groups?.kind || !groups.slug || !groups.version || !groups.hash) return null;
  if (!isMediaKind(groups.kind)) return null;
  return {
    kind: groups.kind,
    entitySlug: groups.slug,
    version: Number(groups.version),
    shortHash: groups.hash,
  };
}
