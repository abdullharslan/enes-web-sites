import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { db } from "@/db/client";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";
import { countNewInquiries } from "@/lib/server/inquiries/service";

/** Every page in this group requires a valid session (checked per request). */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const badges: Record<string, number> = can(user.role, "inquiries:manage")
    ? { "/admin/inquiries": await countNewInquiries(db) }
    : {};
  return (
    <AdminShell user={user} badges={badges}>
      {children}
    </AdminShell>
  );
}
