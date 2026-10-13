import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireUser } from "@/lib/server/auth/current";

/** Every page in this group requires a valid session (checked per request). */
export default async function PanelLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  return <AdminShell user={user}>{children}</AdminShell>;
}
