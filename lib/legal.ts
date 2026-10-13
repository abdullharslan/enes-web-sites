export const LEGAL_PAGES = ["impressum", "datenschutz", "agb", "widerruf"] as const;

export type LegalPage = (typeof LEGAL_PAGES)[number];

export function isLegalPage(value: string): value is LegalPage {
  return (LEGAL_PAGES as readonly string[]).includes(value);
}
