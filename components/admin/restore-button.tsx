"use client";

import { useFormStatus } from "react-dom";
import { T } from "@/lib/admin/text";

/** Disabled while the restore is being sent, so one click restores once. */
export function RestoreButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 border border-gold/70 px-5 text-xs font-semibold uppercase tracking-label transition-colors hover:bg-gold hover:text-ink disabled:opacity-60"
    >
      {pending ? T.common.saving : T.history.restore}
    </button>
  );
}
