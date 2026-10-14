import type { FormRecord } from "./compose";
import type { FormErrors } from "./schemas";

/**
 * Result of a public form submission (shared by the Server Action and the forms).
 * React resets a form after every action, so unsuccessful results echo the
 * typed `values` back and the fields restore them.
 */
export type PublicFormState =
  | { status: "idle" }
  | { status: "sent" }
  | { status: "invalid"; errors: FormErrors; values: FormRecord }
  | { status: "rateLimited"; values: FormRecord }
  | { status: "failed"; values: FormRecord };

export type PublicFormStatus = PublicFormState["status"];

export const IDLE_FORM: PublicFormState = { status: "idle" };

/** Hidden field that people never see (display: none) but form-filling bots fill in. */
export const HONEYPOT_FIELD = "website";

/** A single echoed text value (array values belong to checkbox groups). */
export const echoedText = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;
