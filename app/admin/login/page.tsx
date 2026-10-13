import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/admin/login-form";
import { SITE } from "@/config/site";
import { T } from "@/lib/admin/text";
import { getCurrentUser } from "@/lib/server/auth/current";

export const metadata: Metadata = { title: T.login.title };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/admin");
  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <p
          lang="en"
          translate="no"
          className="mb-2 font-display text-3xl tracking-label uppercase"
        >
          {SITE.name}
        </p>
        <h1 className="mb-10 text-xs font-semibold uppercase tracking-luxe text-gold">
          {T.login.title}
        </h1>
        <LoginForm />
      </div>
    </main>
  );
}
