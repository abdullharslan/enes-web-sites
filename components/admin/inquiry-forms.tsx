"use client";

import { useActionState } from "react";
import {
  deleteInquiryAction,
  setInquiryStatusAction,
  type InquiryActionState,
} from "@/app/admin/actions/inquiries";
import { T } from "@/lib/admin/text";
import { INQUIRY_STATUSES, type InquiryStatus } from "@/lib/inquiries/policy";

const ERRORS = {
  forbidden: T.common.forbidden,
  invalid: T.common.error,
  notFound: T.inquiries.notFound,
} as const;

const IDLE: InquiryActionState = { status: "idle" };

export function InquiryStatusForm({ id, status }: { id: string; status: InquiryStatus }) {
  const [state, action, pending] = useActionState(setInquiryStatusAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="id" value={id} />
      <label className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-label">
          {T.inquiries.status}
        </span>
        <select
          name="status"
          defaultValue={status}
          className="min-h-11 w-full border border-line bg-ink px-3 py-2 text-cream focus:border-gold sm:w-64"
        >
          {INQUIRY_STATUSES.map((s) => (
            <option key={s} value={s}>
              {T.inquiries.statuses[s]}
            </option>
          ))}
        </select>
      </label>
      <div>
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 bg-gold px-6 text-xs font-semibold uppercase tracking-label text-ink disabled:opacity-60"
        >
          {pending ? T.common.saving : T.inquiries.setStatus}
        </button>
      </div>
      <div aria-live="polite" className="text-sm">
        {state.status === "ok" && <p className="text-gold">{T.inquiries.statusSaved}</p>}
        {state.status === "error" && <p className="text-danger">{ERRORS[state.error]}</p>}
      </div>
    </form>
  );
}

export function InquiryDeleteForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState(deleteInquiryAction, IDLE);
  return (
    <form action={action} className="flex flex-col gap-3 border border-danger/60 p-4">
      <input type="hidden" name="id" value={id} />
      <label className="inline-flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="confirm" required className="size-5 accent-gold" />
        {T.inquiries.deleteConfirm}
      </label>
      <button
        type="submit"
        disabled={pending}
        className="min-h-11 border border-danger px-4 text-xs font-semibold uppercase tracking-label text-danger disabled:opacity-60"
      >
        {T.inquiries.delete}
      </button>
      <div aria-live="polite" className="text-sm">
        {state.status === "error" && <p className="text-danger">{ERRORS[state.error]}</p>}
      </div>
    </form>
  );
}
