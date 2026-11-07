"use client";

import { useActionState, useState, type FormEvent } from "react";
import type { z } from "zod";
import { submitInquiryAction } from "@/app/actions/inquiries";
import { formDataToRecord } from "@/lib/forms/compose";
import { validateForm, type FormErrors } from "@/lib/forms/schemas";
import { IDLE_FORM, type PublicFormStatus } from "@/lib/forms/state";
import { photoProblem } from "@/lib/inquiries/policy";

/** Empty where randomUUID is unavailable (insecure context): the server then derives a key. */
const newSubmissionKey = () => globalThis.crypto?.randomUUID?.() ?? "";

const selectedFiles = (form: HTMLFormElement) =>
  [...form.querySelectorAll<HTMLInputElement>('input[type="file"]')].flatMap((input) => [
    ...(input.files ?? []),
  ]);

/**
 * Sends a public form to the inquiry Server Action. With JavaScript the input
 * is checked first (instant feedback, no wasted upload); without it the
 * browser posts the form and the server runs the very same validation.
 */
export function useInquiryForm<S extends z.ZodType>(
  schema: S,
  arrayFields: readonly string[],
) {
  const [state, formAction] = useActionState(submitInquiryAction, IDLE_FORM);
  const [clientErrors, setClientErrors] = useState<FormErrors | null>(null);
  const [submissionKey, setSubmissionKey] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const form = event.currentTarget;
    const result = validateForm(
      schema,
      formDataToRecord(new FormData(form), arrayFields),
    );
    const photos = photoProblem(selectedFiles(form));
    const errors: FormErrors = {
      ...(result.ok ? {} : result.errors),
      ...(photos ? { photos } : {}),
    };
    const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid) {
      event.preventDefault();
      setClientErrors(errors);
      form.querySelector<HTMLElement>(`[name="${CSS.escape(firstInvalid)}"]`)?.focus();
      return;
    }
    setClientErrors(null);
    // One key per inquiry: every retry of it (failed, rate-limited, double click)
    // carries the same key, so the server stores it once; the next inquiry after
    // a stored one gets a new key. Kept in state because React resets the form
    // (and with it the hidden input) after every action.
    const key =
      submissionKey && state.status !== "sent" ? submissionKey : newSubmissionKey();
    if (key !== submissionKey) setSubmissionKey(key);
    // The FormData is built right after this handler, before React re-renders.
    const input = form.elements.namedItem("submissionKey");
    if (input instanceof HTMLInputElement) input.value = key;
  };

  const errors = clientErrors ?? (state.status === "invalid" ? state.errors : {});
  const status: PublicFormStatus = clientErrors ? "invalid" : state.status;
  const values = "values" in state ? state.values : undefined;
  return { formAction, handleSubmit, errors, status, values, submissionKey };
}
