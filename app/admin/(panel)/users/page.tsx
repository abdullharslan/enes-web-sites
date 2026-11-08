import type { Metadata } from "next";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { NewUserForm } from "@/components/admin/new-user-form";
import {
  ResetPasswordForm,
  RoleForm,
  UserActiveForm,
} from "@/components/admin/user-forms";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { T } from "@/lib/admin/text";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";

export const metadata: Metadata = { title: T.users.title };

export default async function UsersPage() {
  const me = await requireUser();
  if (!can(me.role, "users:manage")) return <AccessDenied />;
  const rows = await db.select().from(users).orderBy(asc(users.createdAt));

  return (
    <>
      <AdminPageTitle>{T.users.title}</AdminPageTitle>
      <div className="mb-10 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-label text-mist">
            <tr>
              <th className="py-3 pr-4">{T.users.name}</th>
              <th className="py-3 pr-4">{T.users.email}</th>
              <th className="py-3 pr-4">{T.users.role}</th>
              <th className="py-3 pr-4">{T.users.status}</th>
              <th className="py-3">{T.common.actions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line border-y border-line">
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="py-3 pr-4">{u.name}</td>
                <td className="py-3 pr-4">{u.email}</td>
                <td className="py-3 pr-4">
                  {u.id === me.id ? (
                    T.roles[u.role]
                  ) : (
                    <RoleForm userId={u.id} userName={u.name} role={u.role} />
                  )}
                </td>
                <td className="py-3 pr-4">
                  {u.isActive ? T.users.active : T.users.inactive}
                </td>
                <td className="py-3">
                  {u.id === me.id ? (
                    <Link
                      href="/admin/account"
                      className="inline-flex min-h-11 items-center text-gold underline-offset-4 hover:underline"
                    >
                      {T.account.title}
                    </Link>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <ResetPasswordForm userId={u.id} userName={u.name} />
                      <UserActiveForm
                        userId={u.id}
                        userName={u.name}
                        isActive={u.isActive}
                      />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <NewUserForm />
    </>
  );
}
