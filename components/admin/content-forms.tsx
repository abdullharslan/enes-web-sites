"use client";

import { useActionState } from "react";
import {
  saveBlockAction,
  saveJournalAction,
  uploadBlockImageAction,
  uploadJournalImageAction,
} from "@/app/admin/actions/content";
import { IDLE, type FormState } from "@/lib/admin/form-state";
import { T } from "@/lib/admin/text";
import type { FieldKind } from "@/lib/content/blocks";
import {
  CheckboxInput,
  FormFeedback,
  INPUT,
  LocalizedInput,
  SubmitButton,
  TextInput,
} from "./fields";

export interface EditableField {
  key: string;
  kind: FieldKind;
  label: string;
}

type Translations = Readonly<Record<string, string>>;

/** Editor generated from a content block definition (images are changed via upload below). */
export function BlockForm({
  blockKey,
  version,
  requestKey,
  savedVersion,
  fields,
  values,
}: {
  blockKey: string;
  version: number;
  requestKey: string;
  savedVersion?: string;
  fields: readonly EditableField[];
  values: Readonly<Record<string, unknown>>;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveBlockAction,
    IDLE,
  );
  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="key" value={blockKey} />
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="idempotencyKey" value={requestKey} />
      {fields.map((field) => {
        const value = values[field.key];
        // Images are changed only through the upload form below; a text save keeps them.
        if (field.kind === "image") return null;
        if (field.kind === "toggle") {
          return (
            <CheckboxInput
              key={field.key}
              state={state}
              name={field.key}
              label={field.label}
              defaultChecked={value === true}
            />
          );
        }
        if (
          field.kind === "text" ||
          field.kind === "multiline" ||
          field.kind === "longtext"
        ) {
          return (
            <LocalizedInput
              key={field.key}
              state={state}
              name={field.key}
              label={field.label}
              defaults={(value ?? {}) as Translations}
              multiline={field.kind !== "text"}
              rows={field.kind === "longtext" ? 14 : 4}
            />
          );
        }
        return (
          <TextInput
            key={field.key}
            state={state}
            name={field.key}
            label={field.label}
            defaultValue={typeof value === "string" ? value : ""}
            required
          />
        );
      })}
      <FormFeedback state={state} savedVersion={savedVersion} />
      <div>
        <SubmitButton pending={pending} />
      </div>
    </form>
  );
}

function UploadFields({ state, inputId }: { state: FormState; inputId: string }) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <label
          htmlFor={inputId}
          className="text-xs font-semibold uppercase tracking-label"
        >
          {T.fields.image}
        </label>
        <input
          id={inputId}
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
      <FormFeedback state={state} conflictMessage={T.fields.imageConflict} />
    </>
  );
}

export function BlockImageForm({
  blockKey,
  field,
  version,
}: {
  blockKey: string;
  field: string;
  /** The version the page showed; an upload on an outdated image state is refused. */
  version: number;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    uploadBlockImageAction,
    IDLE,
  );
  return (
    <form action={action} className="flex flex-col gap-4 border border-line p-4">
      <input type="hidden" name="key" value={blockKey} />
      <input type="hidden" name="field" value={field} />
      <input type="hidden" name="expectedVersion" value={version} />
      <UploadFields state={state} inputId={`upload-${field}`} />
      <div>
        <SubmitButton pending={pending} label={T.fields.upload} />
      </div>
    </form>
  );
}

export function JournalForm({
  id,
  version,
  requestKey,
  savedVersion,
  values,
}: {
  id: string | null;
  version: number;
  requestKey: string;
  savedVersion?: string;
  values: {
    slug: string;
    publishedAt: string;
    title: Translations;
    excerpt: Translations;
    isVisible: boolean;
  };
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    saveJournalAction,
    IDLE,
  );
  return (
    <form action={action} className="flex flex-col gap-6">
      {id && <input type="hidden" name="id" value={id} />}
      <input type="hidden" name="expectedVersion" value={version} />
      <input type="hidden" name="idempotencyKey" value={requestKey} />
      <div className="grid gap-6 sm:grid-cols-2">
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
          name="publishedAt"
          label={T.journal.publishedAt}
          type="date"
          defaultValue={values.publishedAt}
          required
        />
      </div>
      <LocalizedInput
        state={state}
        name="title"
        label={T.journal.titleField}
        defaults={values.title}
      />
      <LocalizedInput
        state={state}
        name="excerpt"
        label={T.journal.excerpt}
        defaults={values.excerpt}
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

export function JournalImageForm({
  id,
  slug,
  version,
}: {
  id: string;
  slug: string;
  /** The version the page showed; an upload on an outdated image state is refused. */
  version: number;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    uploadJournalImageAction,
    IDLE,
  );
  return (
    <form action={action} className="flex flex-col gap-4 border border-line p-4">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="expectedVersion" value={version} />
      <UploadFields state={state} inputId="upload-journal" />
      <div>
        <SubmitButton pending={pending} label={T.fields.upload} />
      </div>
    </form>
  );
}
