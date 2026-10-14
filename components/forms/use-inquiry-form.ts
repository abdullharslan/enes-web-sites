"use client";

import { useActionState, useState, type FormEvent } from "react";
import type { z } from "zod";
import { submitInquiryAction } from "@/app/actions/inquiries";
import { formDataToRecord } from "@/lib/forms/compose";
import { validateForm, type FormErrors } from "@/lib/forms/schemas";
import { IDLE_FORM, type PublicFormStatus } from "@/lib/forms/state";
import { photoProblem } from "@/lib/inquiries/policy";

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
    // One key per filled-in form: a double submit or retry is stored only once.
    const key = form.elements.namedItem("submissionKey");
    if (key instanceof HTMLInputElement && !key.value) {
      key.value = globalThis.crypto?.randomUUID?.() ?? "";
    }
  };

  const errors = clientErrors ?? (state.status === "invalid" ? state.errors : {});
  const status: PublicFormStatus = clientErrors ? "invalid" : state.status;
  const values = "values" in state ? state.values : undefined;
  return { formAction, handleSubmit, errors, status, values };
}
