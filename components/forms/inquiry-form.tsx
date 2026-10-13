"use client";

import { useId } from "react";
import { buildMailtoUrl } from "@/lib/contact-links";
import { composeMessage } from "@/lib/forms/compose";
import { inquirySchema } from "@/lib/forms/schemas";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { SubmitButton, TextField } from "./fields";
import { FormStatus } from "./form-status";
import { useValidatedForm } from "./use-validated-form";

interface InquiryFormProps {
  recipient: string;
  subject: string;
  /** Extra labelled lines placed at the top of the message (e.g. the product). */
  context?: ReadonlyArray<readonly [string, string]>;
  labels: Dictionary["forms"];
}

export function InquiryForm({
  recipient,
  subject,
  context = [],
  labels,
}: InquiryFormProps) {
  const uid = useId();
  const { errors, status, handleSubmit } = useValidatedForm(inquirySchema, [], (data) => {
    const body = composeMessage([
      ...context,
      [labels.name, data.name],
      [labels.email, data.email],
      [labels.phone, data.phone],
      [labels.message, data.message],
    ]);
    window.location.assign(buildMailtoUrl(recipient, subject, body));
  });
  const error = (field: string) =>
    errors[field] ? labels.errors[errors[field]] : undefined;

  return (
    <form
      method="post"
      noValidate
      onSubmit={handleSubmit}
      className="flex flex-col gap-6"
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <TextField
          id={`${uid}-name`}
          name="name"
          label={labels.name}
          autoComplete="name"
          error={error("name")}
        />
        <TextField
          id={`${uid}-email`}
          name="email"
          type="email"
          label={labels.email}
          autoComplete="email"
          error={error("email")}
        />
      </div>
      <TextField
        id={`${uid}-phone`}
        name="phone"
        type="tel"
        label={labels.phone}
        optionalLabel={labels.optional}
        autoComplete="tel"
        error={error("phone")}
      />
      <TextField
        id={`${uid}-message`}
        name="message"
        label={labels.message}
        multiline
        error={error("message")}
      />
      <p className="text-xs leading-relaxed text-mist">{labels.handoffNote}</p>
      <FormStatus status={status} messages={labels} />
      <SubmitButton>{labels.submit}</SubmitButton>
    </form>
  );
}
