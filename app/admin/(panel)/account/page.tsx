import type { Metadata } from "next";
import { AdminPageTitle } from "@/components/admin/admin-shell";
import { ChangePasswordForm } from "@/components/admin/user-forms";
import { T } from "@/lib/admin/text";
import { requireUser } from "@/lib/server/auth/current";

export const metadata: Metadata = { title: T.account.title };

export default async function AccountPage() {
  const me = await requireUser();
  return (
    <>
      <AdminPageTitle>{T.account.title}</AdminPageTitle>
      <p className="mb-8 text-sm text-mist">
        {me.name} · {me.email} · {T.roles[me.role]}
      </p>
      <ChangePasswordForm />
    </>
  );
}
