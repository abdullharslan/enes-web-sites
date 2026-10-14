import { T } from "@/lib/admin/text";
import { can, type Permission, type Role } from "@/lib/server/auth/permissions";

interface AdminNavItem {
  href: string;
  label: string;
  permission?: Permission;
}

const ITEMS: readonly AdminNavItem[] = [
  { href: "/admin", label: T.nav.dashboard },
  { href: "/admin/inquiries", label: T.nav.inquiries, permission: "inquiries:manage" },
  { href: "/admin/products", label: T.nav.products, permission: "catalog:write" },
  { href: "/admin/brands", label: T.nav.brands, permission: "catalog:write" },
  { href: "/admin/categories", label: T.nav.categories, permission: "catalog:write" },
  { href: "/admin/home", label: T.nav.home, permission: "content:write" },
  { href: "/admin/journal", label: T.nav.journal, permission: "content:write" },
  { href: "/admin/media", label: T.nav.media, permission: "media:write" },
  { href: "/admin/audit", label: T.nav.audit, permission: "audit:read" },
  { href: "/admin/users", label: T.nav.users, permission: "users:manage" },
  { href: "/admin/account", label: T.nav.account },
];

/** Menu entries the role may use; hidden entries are also enforced server-side. */
export function adminNavFor(role: Role): AdminNavItem[] {
  return ITEMS.filter((item) => !item.permission || can(role, item.permission));
}
