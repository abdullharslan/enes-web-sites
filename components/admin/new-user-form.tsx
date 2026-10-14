"use client";

import { useActionState } from "react";
import { createUserAction, type UserActionState } from "@/app/admin/actions/users";
import { T } from "@/lib/admin/text";
import { USER_INPUT as INPUT, USER_LABEL as LABEL, UserFormStatus } from "./user-forms";

export function NewUserForm() {
  const [state, action, pending] = useActionState<UserActionState, FormData>(
    createUserAction,
    { status: "idle" },
  );
  const values = state.status === "error" ? state.values : undefined;
  return (
    <form
      action={action}
      className="grid gap-4 border border-line bg-coal p-6 sm:grid-cols-2"
    >
      <h2 className="text-xs font-semibold uppercase tracking-luxe text-gold sm:col-span-2">
        {T.users.createTitle}
      </h2>
      <label className="flex flex-col gap-2">
        <span className={LABEL}>{T.users.name}</span>
        <input
          name="name"
          required
          maxLength={120}
          defaultValue={values?.name}
          className={INPUT}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className={LABEL}>{T.users.email}</span>
        <input
          name="email"
          type="email"
          required
          defaultValue={values?.email}
          className={INPUT}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className={LABEL}>{T.users.role}</span>
        <select name="role" defaultValue={values?.role || "editor"} className={INPUT}>
          <option value="editor">{T.roles.editor}</option>
          <option value="owner">{T.roles.owner}</option>
        </select>
      </label>
      <label className="flex flex-col gap-2">
        <span className={LABEL}>{T.users.password}</span>
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          className={INPUT}
        />
      </label>
      <div className="sm:col-span-2">
        <UserFormStatus state={state} ok={T.users.created} />
      </div>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 bg-gold px-6 text-xs font-semibold uppercase tracking-label text-ink disabled:opacity-60"
        >
          {pending ? T.common.saving : T.common.create}
        </button>
      </div>
    </form>
  );
}
