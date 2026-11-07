"use client";

import { useId } from "react";
import { inquirySchema } from "@/lib/forms/schemas";
import { echoedText } from "@/lib/forms/state";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import type { Locale } from "@/lib/i18n/locales";
import { InquiryHiddenFields, SubmitButton, TextField } from "./fields";
import { FormStatus } from "./form-status";
import { useInquiryForm } from "./use-inquiry-form";

interface InquiryFormProps {
  kind: "product" | "contact";
  locale: Locale;
  /** The product asked about (product inquiries only). */
  productSlug?: string;
  labels: Dictionary["forms"];
}

export function InquiryForm({ kind, locale, productSlug, labels }: InquiryFormProps) {
  const uid = useId();
  const { formAction, handleSubmit, errors, status, values, submissionKey } =
    useInquiryForm(inquirySchema, []);
  const error = (field: string) =>
    errors[field] ? labels.errors[errors[field]] : undefined;

  return (
    <form
      action={formAction}
      noValidate
      onSubmit={handleSubmit}
      className="flex flex-col gap-6"
    >
      <InquiryHiddenFields
        kind={kind}
        locale={locale}
        productSlug={productSlug}
        submissionKey={submissionKey}
      />
      <div className="grid gap-6 sm:grid-cols-2">
        <TextField
          id={`${uid}-name`}
          name="name"
          label={labels.name}
          autoComplete="name"
          defaultValue={echoedText(values?.name)}
          error={error("name")}
        />
        <TextField
          id={`${uid}-email`}
          name="email"
          type="email"
          label={labels.email}
          autoComplete="email"
          defaultValue={echoedText(values?.email)}
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
        defaultValue={echoedText(values?.phone)}
        error={error("phone")}
      />
      <TextField
        id={`${uid}-message`}
        name="message"
        label={labels.message}
        multiline
        defaultValue={echoedText(values?.message)}
        error={error("message")}
      />
      <p className="text-xs leading-relaxed text-mist">{labels.privacyNote}</p>
      <FormStatus status={status} messages={labels} />
      <SubmitButton pendingLabel={labels.sending}>{labels.submit}</SubmitButton>
    </form>
  );
}
