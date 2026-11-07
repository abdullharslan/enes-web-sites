"use client";

import { useId, useMemo } from "react";
import { CONDITIONS, SET_ITEMS, type Brand, type Category } from "@/lib/catalog/schema";
import { createSellSchema } from "@/lib/forms/schemas";
import { echoedText } from "@/lib/forms/state";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { interpolate } from "@/lib/i18n/interpolate";
import type { Locale } from "@/lib/i18n/locales";
import { INQUIRY_LIMITS } from "@/lib/inquiries/policy";
import {
  CheckboxGroup,
  FileField,
  InquiryHiddenFields,
  SelectField,
  SubmitButton,
  TextField,
} from "./fields";
import { FormStatus } from "./form-status";
import { useInquiryForm } from "./use-inquiry-form";

const OTHER_BRAND = "other";

const MB = 1024 * 1024;
/** Numbers shown in photo hints and errors come from the same policy the server enforces. */
const PHOTO_LIMITS = {
  maxPhotos: String(INQUIRY_LIMITS.maxPhotos),
  maxMb: String(INQUIRY_LIMITS.maxPhotoBytes / MB),
  totalMb: String(INQUIRY_LIMITS.maxTotalPhotoBytes / MB),
};
const PHOTO_TYPES = "image/jpeg,image/png,image/webp";

interface SellFormProps {
  brands: readonly Pick<Brand, "slug" | "name">[];
  categories: readonly Pick<Category, "slug" | "name">[];
  locale: Locale;
  labels: {
    forms: Dictionary["forms"];
    sell: Dictionary["sell"];
    catalog: Pick<Dictionary["catalog"], "conditions" | "setItems">;
  };
}

export function SellForm({ brands, categories, locale, labels }: SellFormProps) {
  const uid = useId();
  const { forms, sell, catalog } = labels;
  const f = sell.fields;

  const { formAction, handleSubmit, errors, status, values, submissionKey } =
    useInquiryForm(
      useMemo(() => createSellSchema(categories.map((c) => c.slug)), [categories]),
      ["setItems"],
    );
  const error = (field: string) =>
    errors[field] ? interpolate(forms.errors[errors[field]], PHOTO_LIMITS) : undefined;

  return (
    <form
      action={formAction}
      noValidate
      onSubmit={handleSubmit}
      className="flex flex-col gap-6"
    >
      <InquiryHiddenFields kind="sell" locale={locale} submissionKey={submissionKey} />
      <div className="grid gap-6 sm:grid-cols-2">
        <SelectField
          id={`${uid}-brand`}
          name="brand"
          label={f.brand}
          placeholder={forms.select}
          options={[
            ...brands.map((b) => ({ value: b.slug, label: b.name })),
            { value: OTHER_BRAND, label: f.otherBrand },
          ]}
          defaultValue={echoedText(values?.brand)}
          error={error("brand")}
        />
        <SelectField
          id={`${uid}-category`}
          name="category"
          label={f.category}
          placeholder={forms.select}
          options={categories.map((c) => ({ value: c.slug, label: c.name[locale] }))}
          defaultValue={echoedText(values?.category)}
          error={error("category")}
        />
        <TextField
          id={`${uid}-model`}
          name="model"
          label={f.model}
          defaultValue={echoedText(values?.model)}
          error={error("model")}
        />
        <SelectField
          id={`${uid}-condition`}
          name="condition"
          label={f.condition}
          placeholder={forms.select}
          options={CONDITIONS.map((c) => ({ value: c, label: catalog.conditions[c] }))}
          defaultValue={echoedText(values?.condition)}
          error={error("condition")}
        />
        <TextField
          id={`${uid}-year`}
          name="year"
          label={f.year}
          optionalLabel={forms.optional}
          inputMode="numeric"
          defaultValue={echoedText(values?.year)}
          error={error("year")}
        />
        <TextField
          id={`${uid}-price`}
          name="askingPrice"
          label={f.askingPrice}
          optionalLabel={forms.optional}
          inputMode="numeric"
          defaultValue={echoedText(values?.askingPrice)}
          error={error("askingPrice")}
        />
      </div>
      <CheckboxGroup
        name="setItems"
        legend={f.setItems}
        options={SET_ITEMS.map((s) => ({ value: s, label: catalog.setItems[s] }))}
        defaultValues={Array.isArray(values?.setItems) ? values.setItems : []}
        error={error("setItems")}
      />
      <div className="grid gap-6 border-t border-line pt-6 sm:grid-cols-2">
        <TextField
          id={`${uid}-name`}
          name="name"
          label={forms.name}
          autoComplete="name"
          defaultValue={echoedText(values?.name)}
          error={error("name")}
        />
        <TextField
          id={`${uid}-email`}
          name="email"
          type="email"
          label={forms.email}
          autoComplete="email"
          defaultValue={echoedText(values?.email)}
          error={error("email")}
        />
        <TextField
          id={`${uid}-phone`}
          name="phone"
          type="tel"
          label={forms.phone}
          optionalLabel={forms.optional}
          autoComplete="tel"
          defaultValue={echoedText(values?.phone)}
          error={error("phone")}
        />
      </div>
      <TextField
        id={`${uid}-message`}
        name="message"
        label={forms.message}
        optionalLabel={forms.optional}
        multiline
        defaultValue={echoedText(values?.message)}
        error={error("message")}
      />
      <FileField
        id={`${uid}-photos`}
        name="photos"
        label={f.photos}
        optionalLabel={forms.optional}
        hint={interpolate(sell.photoHint, PHOTO_LIMITS)}
        accept={PHOTO_TYPES}
        error={error("photos")}
      />
      <p className="text-xs leading-relaxed text-mist">{forms.privacyNote}</p>
      <FormStatus status={status} messages={forms} />
      <SubmitButton pendingLabel={forms.sending}>{forms.submit}</SubmitButton>
    </form>
  );
}
