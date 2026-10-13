import { notFound } from "next/navigation";

// This segment only ever renders not-found, so there is no instant UI to validate.
export const instant = false;

/** Routes unmatched URLs inside a locale to the localized, styled not-found page. */
export default function CatchAllPage(): never {
  notFound();
}
