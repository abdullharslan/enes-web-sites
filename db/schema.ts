import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/** Locale code → text. The default locale is always present (enforced by zod on write). */
export type Translations = Record<string, string>;

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

/** Every editable entity carries the version number of its latest revision. */
const versioned = {
  currentVersion: integer("current_version").notNull().default(1),
};

// ── Access ───────────────────────────────────────────────────────────────────

export const roleEnum = pgEnum("role", ["owner", "editor"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: roleEnum("role").notNull(),
  passwordHash: text("password_hash").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  ...timestamps,
});

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the session token; the raw token only ever lives in the cookie. */
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    email: text("email").notNull(),
    /** Client address bucket ("unknown" when not available). */
    ip: text("ip").notNull().default("unknown"),
    succeeded: boolean("succeeded").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("login_attempts_email_time_idx").on(t.email, t.createdAt),
    index("login_attempts_ip_time_idx").on(t.ip, t.createdAt),
  ],
);

/**
 * Browsers that have signed in successfully before. A login from a known
 * device is not blocked by the per-e-mail cap, so attackers cannot lock the
 * owner out by spraying failures from spoofed addresses.
 */
export const trustedDevices = pgTable(
  "trusted_devices",
  {
    /** SHA-256 of the device token; the raw token only lives in the cookie. */
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("trusted_devices_user_idx").on(t.userId)],
);

// ── Media (immutable, versioned files) ───────────────────────────────────────

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Relative storage key, e.g. `brand/rolex/20261014-153000_v3_a1b2c3d4.webp`. Never reused. */
    key: text("key").notNull().unique(),
    kind: text("kind").notNull(),
    entitySlug: text("entity_slug").notNull(),
    version: integer("version").notNull(),
    sha256: text("sha256").notNull(),
    mimeType: text("mime_type").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    alt: jsonb("alt").$type<Translations>().notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (t) => [
    unique("media_kind_entity_version_uq").on(t.kind, t.entitySlug, t.version),
    index("media_sha_idx").on(t.sha256),
  ],
);

// ── Catalog ──────────────────────────────────────────────────────────────────

export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: jsonb("description").$type<Translations>().notNull().default({}),
  heroMediaId: uuid("hero_media_id").references(() => media.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(0),
  isVisible: boolean("is_visible").notNull().default(true),
  ...versioned,
  ...timestamps,
});

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: jsonb("name").$type<Translations>().notNull(),
  tileMediaId: uuid("tile_media_id").references(() => media.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").notNull().default(0),
  isVisible: boolean("is_visible").notNull().default(true),
  ...versioned,
  ...timestamps,
});

export const conditionEnum = pgEnum("condition", [
  "new",
  "unworn",
  "excellent",
  "very-good",
  "good",
]);
export const statusEnum = pgEnum("status", ["available", "reserved", "sold"]);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    brandId: uuid("brand_id")
      .notNull()
      .references(() => brands.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    model: text("model").notNull(),
    reference: text("reference"),
    year: integer("year"),
    condition: conditionEnum("condition").notNull(),
    setItems: text("set_items")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    material: jsonb("material").$type<Translations>().notNull(),
    dimensions: text("dimensions"),
    description: jsonb("description").$type<Translations>().notNull(),
    /** `null` means "price on request". */
    priceEur: integer("price_eur"),
    status: statusEnum("status").notNull().default("available"),
    sortOrder: integer("sort_order").notNull().default(0),
    addedAt: date("added_at").notNull(),
    isVisible: boolean("is_visible").notNull().default(true),
    ...versioned,
    ...timestamps,
  },
  (t) => [
    index("products_brand_idx").on(t.brandId),
    index("products_category_idx").on(t.categoryId),
    check("products_price_positive", sql`${t.priceEur} IS NULL OR ${t.priceEur} > 0`),
    check(
      "products_year_range",
      sql`${t.year} IS NULL OR ${t.year} BETWEEN 1900 AND 2100`,
    ),
  ],
);

export const productMedia = pgTable(
  "product_media",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.productId, t.position] })],
);

// ── Editable page content ────────────────────────────────────────────────────

/** One row per editable block, e.g. `home.hero`, `home.story`, `site.contact`. */
export const contentBlocks = pgTable("content_blocks", {
  key: text("key").primaryKey(),
  data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  ...versioned,
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const journalEntries = pgTable("journal_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  publishedAt: date("published_at").notNull(),
  imageMediaId: uuid("image_media_id").references(() => media.id, {
    onDelete: "set null",
  }),
  title: jsonb("title").$type<Translations>().notNull(),
  excerpt: jsonb("excerpt").$type<Translations>().notNull(),
  isVisible: boolean("is_visible").notNull().default(true),
  ...versioned,
  ...timestamps,
});

// ── History & audit ──────────────────────────────────────────────────────────

/** Append-only snapshots. Restoring an old version writes a new revision. */
export const revisions = pgTable(
  "revisions",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    version: integer("version").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    comment: text("comment"),
    /** Makes retried submissions safe: the same key never creates a second revision. */
    idempotencyKey: text("idempotency_key").unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("revisions_entity_version_uq").on(t.entityType, t.entityId, t.version)],
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_events_time_idx").on(t.createdAt)],
);

// ── Inquiries (personal data: minimal, private, deleted on a schedule) ───────

export const inquiryKindEnum = pgEnum("inquiry_kind", ["product", "contact", "sell"]);
export const inquiryStatusEnum = pgEnum("inquiry_status", ["new", "in_progress", "done"]);

export const inquiries = pgTable(
  "inquiries",
  {
    id: uuid("id").primaryKey(),
    kind: inquiryKindEnum("kind").notNull(),
    status: inquiryStatusEnum("status").notNull().default("new"),
    locale: text("locale").notNull(),
    /** Product the visitor asked about (kept as text: products may be renamed or removed). */
    productSlug: text("product_slug"),
    /** The validated form payload (see lib/inquiries). */
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    /** Client generated; a retried submission never creates a second inquiry. */
    submissionKey: uuid("submission_key").unique(),
    /** SHA-256 of the client address, only for rate limiting; cleared after a day. */
    addressHash: text("address_hash"),
    handledBy: uuid("handled_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("inquiries_status_time_idx").on(t.status, t.createdAt),
    index("inquiries_address_time_idx").on(t.addressHash, t.createdAt),
  ],
);

/** Photos sent with a consignment request. Private files: never served by /media. */
export const inquiryPhotos = pgTable(
  "inquiry_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    inquiryId: uuid("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    key: text("key").notNull().unique(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
  },
  (t) => [unique("inquiry_photos_position_uq").on(t.inquiryId, t.position)],
);

// ── Analytics (aggregate counters only: no visitor data at all) ──────────────

export const pageViewsDaily = pgTable(
  "page_views_daily",
  {
    day: date("day").notNull(),
    locale: text("locale").notNull(),
    /** Path without the locale, e.g. "/collection/rolex-explorer-224270". */
    page: text("page").notNull(),
    views: integer("views").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.locale, t.page] })],
);
