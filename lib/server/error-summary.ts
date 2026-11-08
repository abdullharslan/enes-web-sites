import { DrizzleQueryError } from "drizzle-orm";

const codeOf = (value: unknown) => {
  const code = (value as { code?: unknown } | null | undefined)?.code;
  return typeof code === "string" ? code : undefined;
};

/**
 * What may reach a log about a failure: its name and driver or system code. A
 * failed query's message and fields carry its parameters (names, phone numbers,
 * e-mails), and a log line is outside retention and erasure.
 */
export function errorSummary(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";
  const code = codeOf(error.cause) ?? codeOf(error);
  return code ? `${error.name} ${code}` : error.name;
}

/** For command-line tools, whose own messages are written for the operator. */
export function operatorMessage(error: unknown): string {
  if (error instanceof DrizzleQueryError) return errorSummary(error);
  return error instanceof Error ? error.message : "unknown";
}
