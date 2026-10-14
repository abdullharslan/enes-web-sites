import { z } from "zod";
import { CONDITIONS, SET_ITEMS } from "@/lib/catalog/schema";

export const ERROR_CODES = [
  "required",
  "tooLong",
  "invalidEmail",
  "invalidPhone",
  "invalidYear",
  "invalidNumber",
  "invalid",
  "tooManyPhotos",
  "photoTooLarge",
  "photoInvalid",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const FIELD_LIMITS = { short: 120, email: 254, message: 1000 } as const;

const PHONE = /^\+?[0-9][0-9 ()/-]{5,24}$/;
const DIGITS = /^\d+$/;

const requiredText = (max: number) =>
  z
    .string({ error: "required" })
    .trim()
    .min(1, { error: "required" })
    .max(max, { error: "tooLong" });

const optionalText = (max: number) =>
  z.string().trim().max(max, { error: "tooLong" }).default("");

const email = requiredText(FIELD_LIMITS.email).pipe(z.email({ error: "invalidEmail" }));

const optionalPhone = optionalText(FIELD_LIMITS.short).refine(
  (v) => v === "" || PHONE.test(v),
  {
    error: "invalidPhone",
  },
);

const optionalInt = (min: number, max: number, code: ErrorCode) =>
  z
    .string()
    .trim()
    .default("")
    .transform((value, ctx) => {
      if (value === "") return undefined;
      // Plain decimal digits only: Number() would also accept "0x7E4" or "2.02e3".
      const n = DIGITS.test(value) ? Number(value) : Number.NaN;
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message: code });
        return z.NEVER;
      }
      return n;
    });

const contactFields = {
  name: requiredText(FIELD_LIMITS.short),
  email,
  phone: optionalPhone,
};

export const inquirySchema = z.object({
  ...contactFields,
  message: requiredText(FIELD_LIMITS.message),
});

/** Consignment form schema; categories come from the live catalog. */
export const createSellSchema = (categorySlugs: readonly string[]) =>
  z.object({
    brand: requiredText(FIELD_LIMITS.short),
    category: z.string().refine((v) => categorySlugs.includes(v), { error: "required" }),
    model: requiredText(FIELD_LIMITS.short),
    condition: z.enum(CONDITIONS, { error: "required" }),
    year: optionalInt(1900, 2100, "invalidYear"),
    askingPrice: optionalInt(1, 100_000_000, "invalidNumber"),
    setItems: z.array(z.enum(SET_ITEMS, { error: "invalid" })).default([]),
    ...contactFields,
    message: optionalText(FIELD_LIMITS.message),
  });

export type InquiryData = z.infer<typeof inquirySchema>;
export type SellData = z.infer<ReturnType<typeof createSellSchema>>;

export type FormErrors = Partial<Record<string, ErrorCode>>;
export type ValidationResult<T> =
  { ok: true; data: T } | { ok: false; errors: FormErrors };

function toErrorCode(message: string): ErrorCode {
  return (ERROR_CODES as readonly string[]).includes(message)
    ? (message as ErrorCode)
    : "invalid";
}

/** Validates raw form input, reporting the first error code per top-level field. */
export function validateForm<S extends z.ZodType>(
  schema: S,
  input: Record<string, unknown>,
): ValidationResult<z.infer<S>> {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };

  const errors: FormErrors = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? "form");
    errors[field] ??= toErrorCode(issue.message);
  }
  return { ok: false, errors };
}
