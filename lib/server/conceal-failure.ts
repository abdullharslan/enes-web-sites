import { unstable_rethrow } from "next/navigation";
import { errorSummary } from "./error-summary";

/**
 * The end of every server action's catch path. Next logs what an action throws,
 * and a failed query's message holds its parameters (e-mails, names, password
 * hashes), so only the kind of failure is logged and a generic error goes on.
 * Next's own control flow (redirect, notFound, ...) passes through unchanged.
 */
export function concealFailure(label: string, error: unknown): never {
  unstable_rethrow(error);
  console.error(label, errorSummary(error));
  throw new Error("The action could not be completed.");
}
