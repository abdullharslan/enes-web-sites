"use client";

import { useState, type FormEvent } from "react";
import type { z } from "zod";
import { formDataToRecord } from "@/lib/forms/compose";
import { validateForm, type FormErrors } from "@/lib/forms/schemas";

type Status = "idle" | "invalid" | "sent";

/**
 * Validates a native form against a zod schema on submit. On success the
 * caller hands the data off (e.g. opens the mail client); nothing is stored.
 */
export function useValidatedForm<S extends z.ZodType>(
  schema: S,
  arrayFields: readonly string[],
  onValid: (data: z.infer<S>) => void,
) {
  const [errors, setErrors] = useState<FormErrors>({});
  const [status, setStatus] = useState<Status>("idle");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const result = validateForm(
      schema,
      formDataToRecord(new FormData(form), arrayFields),
    );

    if (!result.ok) {
      setErrors(result.errors);
      setStatus("invalid");
      const firstInvalid = Object.keys(result.errors)[0];
      if (firstInvalid)
        form.querySelector<HTMLElement>(`[name="${CSS.escape(firstInvalid)}"]`)?.focus();
      return;
    }

    setErrors({});
    setStatus("sent");
    onValid(result.data);
  };

  return { errors, status, handleSubmit };
}
