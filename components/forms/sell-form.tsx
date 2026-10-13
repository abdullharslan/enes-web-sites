"use client";

import { useId, useMemo } from "react";
import { buildMailtoUrl } from "@/lib/contact-links";
import { CONDITIONS, SET_ITEMS, type Brand, type Category } from "@/lib/catalog/schema";
import { composeMessage } from "@/lib/forms/compose";
import { createSellSchema } from "@/lib/forms/schemas";
import type { Dictionary } from "@/lib/i18n/dictionaries";
import { interpolate } from "@/lib/i18n/interpolate";
import type { Locale } from "@/lib/i18n/locales";
import { CheckboxGroup, SelectField, SubmitButton, TextField } from "./fields";
import { FormStatus } from "./form-status";
import { useValidatedForm } from "./use-validated-form";

const OTHER_BRAND = "other";

interface SellFormProps {
  recipient: string;
  brands: readonly Pick<Brand, "slug" | "name">[];
  categories: readonly Pick<Category, "slug" | "name">[];
  locale: Locale;
  labels: {
    forms: Dictionary["forms"];
    sell: Dictionary["sell"];
    catalog: Pick<Dictionary["catalog"], "conditions" | "setItems">;
  };
}

export function SellForm({
  recipient,
  brands,
  categories,
  locale,
  labels,
}: SellFormProps) {
  const uid = useId();
  const { forms, sell, catalog } = labels;
  const f = sell.fields;

  const categoryName = (slug: string) =>
    categories.find((c) => c.slug === slug)?.name[locale] ?? slug;
  const brandName = (slug: string) =>
    brands.find((b) => b.slug === slug)?.name ?? f.otherBrand;

  const { errors, status, handleSubmit } = useValidatedForm(
    useMemo(() => createSellSchema(categories.map((c) => c.slug)), [categories]),
    ["setItems"],
    (data) => {
      const item = `${brandName(data.brand)} ${data.model}`;
      const body = composeMessage([
        [f.brand, brandName(data.brand)],
        [f.category, categoryName(data.category)],
        [f.model, data.model],
        [f.condition, catalog.conditions[data.condition]],
        [f.year, data.year],
        [f.askingPrice, data.askingPrice],
        [f.setItems, data.setItems.map((s) => catalog.setItems[s])],
        [forms.name, data.name],
        [forms.email, data.email],
        [forms.phone, data.phone],
        [forms.message, data.message],
      ]);
      window.location.assign(
        buildMailtoUrl(recipient, interpolate(sell.subject, { item }), body),
      );
    },
  );
  const error = (field: string) =>
    errors[field] ? forms.errors[errors[field]] : undefined;

  return (
    <form
      method="post"
      noValidate
      onSubmit={handleSubmit}
      className="flex flex-col gap-6"
    >
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
          error={error("brand")}
        />
        <SelectField
          id={`${uid}-category`}
          name="category"
          label={f.category}
          placeholder={forms.select}
          options={categories.map((c) => ({ value: c.slug, label: c.name[locale] }))}
          error={error("category")}
        />
        <TextField
          id={`${uid}-model`}
          name="model"
          label={f.model}
          error={error("model")}
        />
        <SelectField
          id={`${uid}-condition`}
          name="condition"
          label={f.condition}
          placeholder={forms.select}
          options={CONDITIONS.map((c) => ({ value: c, label: catalog.conditions[c] }))}
          error={error("condition")}
        />
        <TextField
          id={`${uid}-year`}
          name="year"
          label={f.year}
          optionalLabel={forms.optional}
          inputMode="numeric"
          error={error("year")}
        />
        <TextField
          id={`${uid}-price`}
          name="askingPrice"
          label={f.askingPrice}
          optionalLabel={forms.optional}
          inputMode="numeric"
          error={error("askingPrice")}
        />
      </div>
      <CheckboxGroup
        name="setItems"
        legend={f.setItems}
        options={SET_ITEMS.map((s) => ({ value: s, label: catalog.setItems[s] }))}
        error={error("setItems")}
      />
      <div className="grid gap-6 border-t border-line pt-6 sm:grid-cols-2">
        <TextField
          id={`${uid}-name`}
          name="name"
          label={forms.name}
          autoComplete="name"
          error={error("name")}
        />
        <TextField
          id={`${uid}-email`}
          name="email"
          type="email"
          label={forms.email}
          autoComplete="email"
          error={error("email")}
        />
        <TextField
          id={`${uid}-phone`}
          name="phone"
          type="tel"
          label={forms.phone}
          optionalLabel={forms.optional}
          autoComplete="tel"
          error={error("phone")}
        />
      </div>
      <TextField
        id={`${uid}-message`}
        name="message"
        label={forms.message}
        optionalLabel={forms.optional}
        multiline
        error={error("message")}
      />
      <p className="text-xs leading-relaxed text-mist">
        {sell.photoHint} {forms.handoffNote}
      </p>
      <FormStatus status={status} messages={forms} />
      <SubmitButton>{forms.submit}</SubmitButton>
    </form>
  );
}
