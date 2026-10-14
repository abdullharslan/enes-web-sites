export const ROLES = ["owner", "editor"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "catalog:write",
  "content:write",
  "media:write",
  "history:read",
  "audit:read",
  "users:manage",
  "inquiries:manage",
  "analytics:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const GRANTS: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(PERMISSIONS),
  editor: new Set([
    "catalog:write",
    "content:write",
    "media:write",
    "history:read",
    // Staff answer customers, so they read and handle inquiries (personal data).
    "inquiries:manage",
    // Aggregate counts only, no personal data.
    "analytics:read",
  ]),
};

/** Least privilege: anything not explicitly granted is denied. */
export function can(role: Role, permission: Permission): boolean {
  return GRANTS[role]?.has(permission) ?? false;
}
