"use client";

import { useActionState } from "react";
import { productImageAction } from "@/app/admin/actions/catalog";
import { ADMIN_ERROR_MESSAGES } from "@/lib/admin/error-messages";
import { IDLE, type FormState } from "@/lib/admin/form-state";
import { T } from "@/lib/admin/text";

const LINK = "min-h-11 text-sm underline-offset-4 hover:underline disabled:opacity-60";

/**
 * Cover / up / down / remove for one image. The page's version travels with
 * the request, so a change based on an outdated image list is refused; the
 * outcome is shown right here, never silently dropped.
 */
export function ProductImageControls({
  productId,
  mediaId,
  version,
  index,
  count,
}: {
  productId: string;
  mediaId: string;
  version: number;
  index: number;
  count: number;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    productImageAction,
    IDLE,
  );
  const moves = [
    ["first", T.products.makeCover, index > 0],
    ["up", T.products.moveUp, index > 0],
    ["down", T.products.moveDown, index < count - 1],
  ] as const;
  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="mediaId" value={mediaId} />
      <input type="hidden" name="expectedVersion" value={version} />
      <div className="flex flex-wrap gap-x-3">
        {moves.map(([op, label, enabled]) =>
          enabled ? (
            <button
              key={op}
              type="submit"
              name="op"
              value={op}
              disabled={pending}
              className={`${LINK} text-gold`}
            >
              {label}
            </button>
          ) : null,
        )}
        <button
          type="submit"
          name="op"
          value="remove"
          disabled={pending}
          className={`${LINK} text-danger`}
        >
          {T.products.removeImage}
        </button>
      </div>
      <div aria-live="polite" className="text-xs">
        {state.status === "ok" && state.message && (
          <p className="text-gold">{state.message}</p>
        )}
        {state.status === "error" && (
          <p className="text-danger">
            {state.error === "conflict"
              ? T.fields.imageConflict
              : ADMIN_ERROR_MESSAGES[state.error]}
          </p>
        )}
      </div>
    </form>
  );
}
