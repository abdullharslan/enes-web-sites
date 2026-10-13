"use client";

import { useActionState } from "react";
import { login, type LoginState } from "@/app/admin/actions/auth";
import { T } from "@/lib/admin/text";

const INPUT =
  "w-full min-h-12 border border-line bg-ink px-4 py-3 text-cream focus:border-gold";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-xs font-semibold uppercase tracking-label">
          {T.login.email}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className={INPUT}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label
          htmlFor="password"
          className="text-xs font-semibold uppercase tracking-label"
        >
          {T.login.password}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={INPUT}
        />
      </div>
      <div aria-live="polite" className="min-h-6 text-sm text-danger">
        {state.error && T.login[state.error]}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 bg-gold px-8 py-3 text-xs font-semibold uppercase tracking-label text-ink transition-colors hover:bg-gold-soft disabled:opacity-60"
      >
        {pending ? T.login.pending : T.login.submit}
      </button>
    </form>
  );
}
