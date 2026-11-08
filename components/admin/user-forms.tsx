"use client";

import { useActionState } from "react";
import {
  changeOwnPasswordAction,
  changeUserRoleAction,
  resetUserPasswordAction,
  setUserActiveAction,
  type UserActionState,
} from "@/app/admin/actions/users";
import { T } from "@/lib/admin/text";
import type { Role } from "@/lib/server/auth/permissions";

export const USER_INPUT =
  "w-full min-h-11 border border-line bg-ink px-3 py-2 text-cream focus:border-gold";
export const USER_LABEL = "text-xs font-semibold uppercase tracking-label";
const BUTTON =
  "min-h-11 border border-gold px-4 text-xs font-semibold uppercase tracking-label text-gold disabled:opacity-60";

type ErrorCode = Extract<UserActionState, { status: "error" }>["error"];

export const USER_ERRORS: Record<ErrorCode, string> = {
  forbidden: T.common.forbidden,
  invalid: T.common.error,
  weakPassword: T.users.weakPassword,
  duplicate: T.users.duplicate,
  self: T.users.selfChange,
  notFound: T.users.notFound,
  unchanged: T.account.unchanged,
  tooManyAttempts: T.account.tooManyAttempts,
  wrongPassword: T.account.wrongPassword,
  mismatch: T.account.mismatch,
};

const IDLE: UserActionState = { status: "idle" };

export function UserFormStatus({ state, ok }: { state: UserActionState; ok: string }) {
  return (
    <div aria-live="polite" className="text-sm">
      {state.status === "ok" && <p className="text-gold">{ok}</p>}
      {state.status === "error" && (
        <p className="text-danger">{USER_ERRORS[state.error]}</p>
      )}
    </div>
  );
}

interface Target {
  userId: string;
  userName: string;
}

export function RoleForm({ userId, userName, role }: Target & { role: Role }) {
  const [state, action, pending] = useActionState(changeUserRoleAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap gap-2">
        <select
          name="role"
          defaultValue={role}
          aria-label={`${T.users.role}: ${userName}`}
          className={`${USER_INPUT} w-auto`}
        >
          <option value="editor">{T.roles.editor}</option>
          <option value="owner">{T.roles.owner}</option>
        </select>
        <button type="submit" disabled={pending} className={BUTTON}>
          {T.users.changeRole}
        </button>
      </div>
      <UserFormStatus state={state} ok={T.users.roleSaved} />
    </form>
  );
}

export function ResetPasswordForm({ userId, userName }: Target) {
  const [state, action, pending] = useActionState(resetUserPasswordAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex flex-wrap gap-2">
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={12}
          required
          aria-label={`${T.users.resetPassword}: ${userName}`}
          placeholder={T.users.resetPassword}
          className={`${USER_INPUT} sm:w-64`}
        />
        <button type="submit" disabled={pending} className={BUTTON}>
          {T.users.resetSubmit}
        </button>
      </div>
      <UserFormStatus state={state} ok={T.users.resetDone} />
    </form>
  );
}

export function UserActiveForm({
  userId,
  userName,
  isActive,
}: Target & { isActive: boolean }) {
  const [state, action, pending] = useActionState(setUserActiveAction, IDLE);
  const label = isActive ? T.users.deactivate : T.users.activate;
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="active" value={String(!isActive)} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`${label}: ${userName}`}
        className="min-h-11 text-gold underline-offset-4 hover:underline disabled:opacity-60"
      >
        {label}
      </button>
      <UserFormStatus state={state} ok={T.users.activeSaved} />
    </form>
  );
}

const PASSWORD_FIELDS = [
  { name: "currentPassword", label: T.account.currentPassword, auto: "current-password" },
  { name: "newPassword", label: T.account.newPassword, auto: "new-password" },
  { name: "confirmPassword", label: T.account.confirmPassword, auto: "new-password" },
] as const;

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPasswordAction, IDLE);
  return (
    <form action={action} className="grid max-w-md gap-4 border border-line bg-coal p-6">
      <h2 className="text-xs font-semibold uppercase tracking-luxe text-gold">
        {T.account.passwordTitle}
      </h2>
      {PASSWORD_FIELDS.map((field) => (
        <label key={field.name} className="flex flex-col gap-2">
          <span className={USER_LABEL}>{field.label}</span>
          <input
            name={field.name}
            type="password"
            autoComplete={field.auto}
            required
            minLength={field.name === "currentPassword" ? 1 : 12}
            maxLength={256}
            className={USER_INPUT}
          />
        </label>
      ))}
      <UserFormStatus state={state} ok={T.account.changed} />
      <div>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 bg-gold px-6 text-xs font-semibold uppercase tracking-label text-ink disabled:opacity-60"
        >
          {pending ? T.common.saving : T.account.submit}
        </button>
      </div>
    </form>
  );
}
