import { useSyncExternalStore, type ReactNode } from "react";

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
}: TextFieldProps) {
  const common = { id, name, className: CONTROL, ...describedBy(id, error) };
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
}

export function SelectField({
  id,
  name,
  label,
  placeholder,
  options,
  error,
}: SelectFieldProps) {
  return (
    <FieldShell id={id} label={label} error={error}>
      <select
        id={id}
        name={name}
        defaultValue=""
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
}

export function CheckboxGroup({ name, legend, options, error }: CheckboxGroupProps) {
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

const subscribeNothing = () => () => {};

/** False during SSR and before hydration, true once client JavaScript runs. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}

/**
 * Disabled until hydrated: without JavaScript the browser would submit the
 * form natively, and personal data must never leave via a native submission.
 */
export function SubmitButton({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  return (
    <div>
      <button
        type="submit"
        disabled={!hydrated}
        className="inline-flex min-h-11 items-center justify-center bg-gold px-8 py-3 text-xs font-semibold uppercase tracking-label text-ink transition-colors hover:bg-gold-soft disabled:cursor-wait disabled:opacity-60"
      >
        {children}
      </button>
    </div>
  );
}
