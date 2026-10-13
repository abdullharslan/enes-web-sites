"use client";

import { useActionState } from "react";
import {
  saveBrandAction,
  saveCategoryAction,
  saveProductAction,
  uploadImageAction,
} from "@/app/admin/actions/catalog";
import { IDLE, type FormState } from "@/lib/admin/form-state";
import { T } from "@/lib/admin/text";
import {
  CheckboxGroupInput,
  CheckboxInput,
  FormFeedback,
  INPUT,
  LocalizedInput,
  SelectInput,
  SubmitButton,
  TextInput,
} from "./fields";

type Translations = Readonly<Record<string, string>>;

/** Hidden bookkeeping shared by all edit forms. */
function Meta({
  id,
  version,
  requestKey,
}: {
  id: string | null;
  version: number;
  requestKey: string;
}) {
  return (
    <>
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="idempotencyKey" value={requestKey} />
    </>
  );
}

const FORM = "flex flex-col gap-6";
const GRID = "grid gap-6 sm:grid-cols-2";

export interface BrandFormProps {
  id: string | null;
  version: number;
  requestKey: string;
  savedVersion?: string;
  values: {
    slug: string;
    name: string;
    description: Translations;
    sortOrder: number;
    isVisible: boolean;
  };
}

export function BrandForm({
  id,
  version,
  requestKey,
  savedVersion,
  values,
}: BrandFormProps) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveBrandAction,
    IDLE,
  );
  return (
    <form action={action} className={FORM}>
      <Meta id={id} version={version} requestKey={requestKey} />
      <div className={GRID}>
        <TextInput
          state={state}
          name="name"
          label={T.brands.name}
          defaultValue={values.name}
          required
        />
        <TextInput
          state={state}
          name="slug"
          label={T.fields.slug}
          hint={T.fields.slugHint}
          defaultValue={values.slug}
          required
        />
        <TextInput
          state={state}
          name="sortOrder"
          label={T.fields.sortOrder}
          inputMode="numeric"
          pattern="\d+"
          defaultValue={String(values.sortOrder)}
          required
        />
      </div>
      <LocalizedInput
        state={state}
        name="description"
        label={T.brands.description}
        defaults={values.description}
        required={false}
        multiline
      />
      <CheckboxInput
        state={state}
        name="isVisible"
        label={T.fields.visible}
        defaultChecked={values.isVisible}
      />
      <FormFeedback state={state} savedVersion={savedVersion} />
      <div>
        <SubmitButton pending={pending} />
      </div>
    </form>
  );
}

export interface CategoryFormProps {
  id: string | null;
  version: number;
  requestKey: string;
  savedVersion?: string;
  values: { slug: string; name: Translations; sortOrder: number; isVisible: boolean };
}

export function CategoryForm({
  id,
  version,
  requestKey,
  savedVersion,
  values,
}: CategoryFormProps) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveCategoryAction,
    IDLE,
  );
  return (
    <form action={action} className={FORM}>
      <Meta id={id} version={version} requestKey={requestKey} />
      <LocalizedInput
        state={state}
        name="name"
        label={T.categories.name}
        defaults={values.name}
      />
      <div className={GRID}>
        <TextInput
          state={state}
          name="slug"
          label={T.fields.slug}
          hint={T.fields.slugHint}
          defaultValue={values.slug}
          required
        />
        <TextInput
          state={state}
          name="sortOrder"
          label={T.fields.sortOrder}
          inputMode="numeric"
          pattern="\d+"
          defaultValue={String(values.sortOrder)}
          required
        />
      </div>
      <CheckboxInput
        state={state}
        name="isVisible"
        label={T.fields.visible}
        defaultChecked={values.isVisible}
      />
      <FormFeedback state={state} savedVersion={savedVersion} />
      <div>
        <SubmitButton pending={pending} />
      </div>
    </form>
  );
}

type Option = { value: string; label: string };
const options = (record: Readonly<Record<string, string>>): Option[] =>
  Object.entries(record).map(([value, label]) => ({ value, label }));

export interface ProductFormProps {
  id: string | null;
  version: number;
  requestKey: string;
  savedVersion?: string;
  brands: Option[];
  categories: Option[];
  values: {
    slug: string;
    brandId: string;
    categoryId: string;
    model: string;
    reference: string | null;
    year: number | null;
    condition: string;
    setItems: readonly string[];
    material: Translations;
    dimensions: string | null;
    description: Translations;
    priceEur: number | null;
    status: string;
    sortOrder: number;
    isVisible: boolean;
    addedAt: string;
  };
}

export function ProductForm({
  id,
  version,
  requestKey,
  savedVersion,
  brands,
  categories,
  values,
}: ProductFormProps) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveProductAction,
    IDLE,
  );
  const p = T.products;
  return (
    <form action={action} className={FORM}>
      <Meta id={id} version={version} requestKey={requestKey} />
      <div className={GRID}>
        <SelectInput
          state={state}
          name="brandId"
          label={p.brand}
          options={brands}
          defaultValue={values.brandId}
          required
        />
        <SelectInput
          state={state}
          name="categoryId"
          label={p.category}
          options={categories}
          defaultValue={values.categoryId}
          required
        />
        <TextInput
          state={state}
          name="model"
          label={p.model}
          defaultValue={values.model}
          required
        />
        <TextInput
          state={state}
          name="slug"
          label={T.fields.slug}
          hint={T.fields.slugHint}
          defaultValue={values.slug}
          required
        />
        <TextInput
          state={state}
          name="reference"
          label={p.reference}
          defaultValue={values.reference}
        />
        <TextInput
          state={state}
          name="year"
          label={p.year}
          inputMode="numeric"
          pattern="\d{4}"
          defaultValue={values.year?.toString()}
        />
        <SelectInput
          state={state}
          name="condition"
          label={p.condition}
          options={options(p.conditions)}
          defaultValue={values.condition}
          required
        />
        <SelectInput
          state={state}
          name="status"
          label={p.status}
          options={options(p.statuses)}
          defaultValue={values.status}
          required
        />
        <TextInput
          state={state}
          name="priceEur"
          label={p.price}
          inputMode="numeric"
          pattern="\d+"
          defaultValue={values.priceEur?.toString()}
        />
        <TextInput
          state={state}
          name="dimensions"
          label={p.dimensions}
          defaultValue={values.dimensions}
        />
        <TextInput
          state={state}
          name="addedAt"
          label={p.addedAt}
          type="date"
          defaultValue={values.addedAt}
          required
        />
        <TextInput
          state={state}
          name="sortOrder"
          label={T.fields.sortOrder}
          inputMode="numeric"
          pattern="\d+"
          defaultValue={String(values.sortOrder)}
          required
        />
      </div>
      <CheckboxGroupInput
        state={state}
        name="setItems"
        legend={p.setItems}
        options={options(p.setItemLabels)}
        defaults={values.setItems}
      />
      <LocalizedInput
        state={state}
        name="material"
        label={p.material}
        defaults={values.material}
      />
      <LocalizedInput
        state={state}
        name="description"
        label={p.description}
        defaults={values.description}
        multiline
      />
      <CheckboxInput
        state={state}
        name="isVisible"
        label={T.fields.visible}
        defaultChecked={values.isVisible}
      />
      <FormFeedback state={state} savedVersion={savedVersion} />
      <div>
        <SubmitButton pending={pending} />
      </div>
    </form>
  );
}

export function ImageUploadForm({
  target,
  id,
  slug,
}: {
  target: "brand" | "category" | "product";
  id: string;
  slug: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    uploadImageAction,
    IDLE,
  );
  return (
    <form action={action} className="flex flex-col gap-4 border border-line p-4">
      <input type="hidden" name="target" value={target} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="slug" value={slug} />
      <div className="flex flex-col gap-2">
        <label
          htmlFor={`upload-${target}`}
          className="text-xs font-semibold uppercase tracking-label"
        >
          {T.fields.image}
        </label>
        <input
          id={`upload-${target}`}
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          className={`${INPUT} file:mr-4 file:border-0 file:bg-graphite file:px-3 file:py-2 file:text-cream`}
        />
        <p className="text-xs text-mist">{T.fields.imageHint}</p>
      </div>
      <LocalizedInput
        state={state}
        name="alt"
        label={T.fields.imageAlt}
        defaults={{}}
        required={false}
      />
      <FormFeedback state={state} />
      <div>
        <SubmitButton pending={pending} label={T.fields.upload} />
      </div>
    </form>
  );
}
