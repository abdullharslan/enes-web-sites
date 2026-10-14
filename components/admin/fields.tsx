import type { ReactNode } from "react";
import { pick, type FormState } from "@/lib/admin/form-state";
import { T } from "@/lib/admin/text";
import { DEFAULT_LOCALE, LOCALES } from "@/lib/i18n/locales";

export const INPUT =
  "w-full min-h-11 border border-line bg-ink px-3 py-2 text-cream focus:border-gold aria-[invalid=true]:border-danger";
const LABEL = "text-xs font-semibold uppercase tracking-label";
const LOCALE_NAMES: Record<string, string> = {
  de: "Almanca",
  en: "İngilizce",
  fr: "Fransızca",
  tr: "Türkçe",
};

const errorFor = (state: FormState, name: string) =>
  state.status === "error" ? state.fieldErrors?.[name] : undefined;

interface FieldProps {
  state: FormState;
  name: string;
  label: string;
  defaultValue?: string | null;
  required?: boolean;
  hint?: string;
}

function Field({
  id,
  label,
  error,
  hint,
  required,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={LABEL}>
        {label}
        {required && <span className="text-gold"> *</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-mist">{hint}</p>}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error === "duplicate" ? T.fields.duplicateSlug : T.fields.invalid}
        </p>
      )}
    </div>
  );
}

const describedBy = (id: string, error?: string) =>
  error ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` } : {};

export function TextInput({
  state,
  name,
  label,
  defaultValue,
  required,
  hint,
  type = "text",
  inputMode,
  pattern,
}: FieldProps & { type?: "text" | "date"; inputMode?: "numeric"; pattern?: string }) {
  const id = `f-${name}`;
  const error = errorFor(state, name);
  return (
    <Field id={id} label={label} error={error} hint={hint} required={required}>
      <input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        pattern={pattern}
        required={required}
        defaultValue={pick(state, name, defaultValue ?? undefined)}
        className={INPUT}
        {...describedBy(id, error)}
      />
    </Field>
  );
}

export function SelectInput({
  state,
  name,
  label,
  defaultValue,
  required,
  options,
}: FieldProps & { options: ReadonlyArray<{ value: string; label: string }> }) {
  const id = `f-${name}`;
  const error = errorFor(state, name);
  return (
    <Field id={id} label={label} error={error} required={required}>
      <select
        id={id}
        name={name}
        required={required}
        defaultValue={pick(state, name, defaultValue ?? undefined)}
        className={INPUT}
        {...describedBy(id, error)}
      >
        <option value="">{T.fields.choose}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function CheckboxInput({
  state,
  name,
  label,
  defaultChecked,
}: {
  state: FormState;
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  const submitted =
    state.status === "error" && state.values
      ? state.values[name] === "on"
      : defaultChecked;
  return (
    <label className="inline-flex min-h-11 items-center gap-3 text-sm">
      <input
        type="checkbox"
        name={name}
        defaultChecked={submitted}
        className="size-5 accent-gold"
      />
      {label}
    </label>
  );
}

export function CheckboxGroupInput({
  state,
  name,
  legend,
  options,
  defaults,
}: {
  state: FormState;
  name: string;
  legend: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  defaults: readonly string[];
}) {
  const submitted =
    state.status === "error" && state.values
      ? [state.values[name] ?? []].flat()
      : defaults;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className={`${LABEL} mb-2`}>{legend}</legend>
      <div className="flex flex-wrap gap-x-6">
        {options.map((o) => (
          <label
            key={o.value}
            className="inline-flex min-h-11 items-center gap-3 text-sm"
          >
            <input
              type="checkbox"
              name={name}
              value={o.value}
              defaultChecked={submitted.includes(o.value)}
              className="size-5 accent-gold"
            />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** One input per locale; the default locale is required, others fall back to it on the site. */
export function LocalizedInput({
  state,
  name,
  label,
  defaults,
  required = true,
  multiline = false,
  rows = 4,
}: {
  state: FormState;
  name: string;
  label: string;
  defaults: Readonly<Record<string, string>>;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
}) {
  const missing = LOCALES.filter((l) => l !== DEFAULT_LOCALE && !defaults[l]);
  return (
    <fieldset className="flex flex-col gap-3 border border-line p-4">
      <legend className={`${LABEL} px-2`}>{label}</legend>
      {LOCALES.map((locale) => {
        const key = `${name}.${locale}`;
        const id = `f-${key}`;
        const error =
          errorFor(state, key) ??
          (locale === DEFAULT_LOCALE ? errorFor(state, name) : undefined);
        const isRequired = required && locale === DEFAULT_LOCALE;
        const common = {
          id,
          name: key,
          lang: locale,
          required: isRequired,
          defaultValue: pick(state, key, defaults[locale]),
          className: INPUT,
          ...describedBy(id, error),
        };
        return (
          <Field
            key={locale}
            id={id}
            label={LOCALE_NAMES[locale] ?? locale}
            error={error}
            required={isRequired}
          >
            {multiline ? <textarea rows={rows} {...common} /> : <input {...common} />}
          </Field>
        );
      })}
      {missing.length > 0 && (
        <p className="text-xs text-mist">
          {T.common.missingTranslations.replace(
            "{locales}",
            missing.map((l) => LOCALE_NAMES[l]).join(", "),
          )}
        </p>
      )}
    </fieldset>
  );
}

const MESSAGES: Record<string, string> = {
  invalid: T.common.error,
  conflict: T.fields.conflict,
  duplicateSlug: T.fields.duplicateSlug,
  forbidden: T.common.forbidden,
  notFound: T.fields.notFound,
  upload: T.fields.uploadFailed,
};

export function FormFeedback({
  state,
  savedVersion,
}: {
  state: FormState;
  savedVersion?: string;
}) {
  return (
    <div aria-live="polite" className="min-h-6 text-sm">
      {state.status === "error" && <p className="text-danger">{MESSAGES[state.error]}</p>}
      {state.status !== "error" && savedVersion && (
        <p className="text-gold">
          {T.fields.savedVersion.replace("{version}", savedVersion)}
        </p>
      )}
    </div>
  );
}

export function SubmitButton({
  pending,
  label = T.common.save,
}: {
  pending: boolean;
  label?: string;
}) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="min-h-11 bg-gold px-8 text-xs font-semibold uppercase tracking-label text-ink transition-colors hover:bg-gold-soft disabled:opacity-60"
    >
      {pending ? T.common.saving : label}
    </button>
  );
}
