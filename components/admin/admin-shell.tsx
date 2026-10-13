import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/app/admin/actions/auth";
import { SITE } from "@/config/site";
import { adminNavFor } from "@/lib/admin/navigation";
import { T } from "@/lib/admin/text";
import type { SessionUser } from "@/lib/server/auth/service";

const LINK =
  "flex min-h-11 items-center px-4 text-sm text-mist transition-colors hover:bg-graphite hover:text-cream";

export function AdminShell({
  user,
  children,
}: {
  user: SessionUser;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[16rem_1fr]">
      <aside className="border-b border-line bg-coal lg:border-r lg:border-b-0">
        <div className="px-4 py-6">
          <p
            lang="en"
            translate="no"
            className="font-display text-2xl tracking-label uppercase"
          >
            {SITE.name}
          </p>
          <p className="mt-2 text-xs text-mist">
            {user.name} · {T.roles[user.role]}
          </p>
        </div>
        <nav aria-label={T.nav.label}>
          <ul className="flex flex-wrap lg:flex-col">
            {adminNavFor(user.role).map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={LINK}>
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/de" className={LINK}>
                {T.nav.viewSite}
              </Link>
            </li>
            <li>
              <form action={logout}>
                <button type="submit" className={`${LINK} w-full text-left`}>
                  {T.nav.logout}
                </button>
              </form>
            </li>
          </ul>
        </nav>
      </aside>
      <main id="admin-content" className="min-w-0 px-4 py-8 sm:px-8">
        {children}
      </main>
    </div>
  );
}

export function AccessDenied() {
  return (
    <p role="alert" className="border border-danger/60 p-6 text-danger">
      {T.common.forbidden}
    </p>
  );
}

export function AdminPageTitle({
  children,
  actions,
}: {
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
      <h1 className="font-display text-4xl font-light">{children}</h1>
      {actions}
    </div>
  );
}
