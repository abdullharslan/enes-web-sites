"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { HONEYPOT_FIELD } from "@/lib/forms/state";

export const CONTROL =
  "w-full min-h-12 border border-line bg-ink px-4 py-3 text-cream placeholder:text-mist transition-colors focus:border-gold aria-[invalid=true]:border-danger";

interface FieldShellProps {
  id: string;
  label: string;
  error?: string;
  optionalLabel?: string;
  children: ReactNode;
}

/** Label + control + error message, wired together for assistive technology. */
export function FieldShell({
  id,
  label,
  error,
  optionalLabel,
  children,
}: FieldShellProps) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-xs font-semibold uppercase tracking-label text-cream"
      >
        {label}
        {optionalLabel && (
          <span className="ml-2 font-normal normal-case tracking-normal text-mist">
            ({optionalLabel})
          </span>
        )}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function describedBy(id: string, error?: string) {
  return error
    ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` }
    : {};
}

interface TextFieldProps {
  id: string;
  name: string;
  label: string;
  error?: string;
  optionalLabel?: string;
  type?: "text" | "email" | "tel" | "number";
  autoComplete?: string;
  inputMode?: "numeric" | "text" | "email" | "tel";
  multiline?: boolean;
  defaultValue?: string;
}

export function TextField({
  id,
  name,
  label,
  error,
  optionalLabel,
  type = "text",
  autoComplete,
  inputMode,
  multiline,
  defaultValue,
}: TextFieldProps) {
  const common = {
    id,
    name,
    defaultValue,
    className: CONTROL,
    ...describedBy(id, error),
  };
  return (
    <FieldShell id={id} label={label} error={error} optionalLabel={optionalLabel}>
      {multiline ? (
        <textarea {...common} rows={5} />
      ) : (
        <input
          {...common}
          type={type}
          autoComplete={autoComplete}
          inputMode={inputMode}
        />
      )}
    </FieldShell>
  );
}

interface SelectFieldProps {
  id: string;
  name: string;
  label: string;
  placeholder: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  error?: string;
  defaultValue?: string;
}

export function SelectField({
  id,
  name,
  label,
  placeholder,
  options,
  error,
  defaultValue = "",
}: SelectFieldProps) {
  return (
    <FieldShell id={id} label={label} error={error}>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        className={CONTROL}
        {...describedBy(id, error)}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

interface CheckboxGroupProps {
  name: string;
  legend: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  error?: string;
  defaultValues?: readonly string[];
}

export function CheckboxGroup({
  name,
  legend,
  options,
  error,
  defaultValues = [],
}: CheckboxGroupProps) {
  const errorId = `${name}-error`;
  return (
    <fieldset
      className="flex flex-col gap-3"
      {...(error ? { "aria-describedby": errorId } : {})}
    >
      <legend className="mb-2 text-xs font-semibold uppercase tracking-label text-cream">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {options.map((o) => (
          <label
            key={o.value}
            className="inline-flex min-h-11 cursor-pointer items-center gap-3 text-sm text-mist"
          >
            <input
              type="checkbox"
              name={name}
              value={o.value}
              defaultChecked={defaultValues.includes(o.value)}
              className="size-5 accent-gold"
            />
            {o.label}
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className="text-sm text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}

interface FileFieldProps {
  id: string;
  name: string;
  label: string;
  hint: string;
  accept: string;
  optionalLabel?: string;
  error?: string;
}

export function FileField({
  id,
  name,
  label,
  hint,
  accept,
  optionalLabel,
  error,
}: FileFieldProps) {
  const hintId = `${id}-hint`;
  const described = error ? `${hintId} ${id}-error` : hintId;
  return (
    <FieldShell id={id} label={label} error={error} optionalLabel={optionalLabel}>
      <p id={hintId} className="text-xs text-mist">
        {hint}
      </p>
      <input
        id={id}
        name={name}
        type="file"
        multiple
        accept={accept}
        aria-describedby={described}
        {...(error ? { "aria-invalid": true as const } : {})}
        className={`${CONTROL} file:mr-4 file:min-h-11 file:border-0 file:bg-gold file:px-4 file:text-xs file:font-semibold file:uppercase file:tracking-label file:text-ink`}
      />
    </FieldShell>
  );
}

interface HiddenFieldsProps {
  kind: "product" | "contact" | "sell";
  locale: string;
  productSlug?: string;
}

/** What the server needs besides the visible fields, plus the bot trap. */
export function InquiryHiddenFields({ kind, locale, productSlug }: HiddenFieldsProps) {
  return (
    <>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="locale" value={locale} />
      {productSlug && <input type="hidden" name="productSlug" value={productSlug} />}
      <input type="hidden" name="submissionKey" defaultValue="" />
      {/* display:none hides it from people and assistive technology; bots still fill it in. */}
      <div className="hidden">
        <label>
          Website
          <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" />
        </label>
      </div>
    </>
  );
}

/** Disabled while sending, so one click sends one request. */
export function SubmitButton({
  children,
  pendingLabel,
}: {
  children: ReactNode;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <div>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-11 items-center justify-center bg-gold px-8 py-3 text-xs font-semibold uppercase tracking-label text-ink transition-colors hover:bg-gold-soft disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? pendingLabel : children}
      </button>
    </div>
  );
}
