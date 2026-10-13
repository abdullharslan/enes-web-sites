# CURRENT-CONTEXT

_Last updated: 2026-10-14 by Claude Opus 5.5_

## Goal

"Maison Vault" — a black / champagne-gold luxury **showcase** site for pre-owned bags (Hermès, Louis Vuitton, Chanel), watches (Rolex, Patek Philippe) and jewellery (Van Cleef & Arpels), structurally modelled on vdmcars.de. No checkout in phase 1: enquiries go via WhatsApp or the visitor's own e-mail client.

## Decisions

| Topic                     | Decision                                                                                                    | Reason                                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Stack                     | Next.js 16.4 (App Router, Cache Components, Partial Prefetching) + Tailwind 4 + TypeScript strict           | User choice; brother (engineer) will extend                                                                                              |
| i18n                      | `app/[locale]` root segment, `proxy.ts` negotiates `Accept-Language`, JSON dictionaries, `next/root-params` | Official Next 16 pattern, no extra library (KISS)                                                                                        |
| Data                      | Typed static data in `data/`, validated by zod schemas in `lib/catalog/schema.ts`                           | YAGNI until a CMS/DB is needed                                                                                                           |
| Forms                     | Client-side zod validation → `mailto:` hand-off; WhatsApp link carries only the product name                | No backend, nothing stored, no personal data in third-party URLs                                                                         |
| Placeholder contacts      | +44 7700 900123 (Ofcom drama range), `concierge@example.com`                                                | Cannot reach a real person                                                                                                               |
| Cookie banner             | **Not built** (deviation from plan)                                                                         | Site sets no cookies and loads no third-party resources; a banner would be misleading. Required once analytics/marketing tools are added |
| Photo upload in sell form | **Not built** (deviation from plan)                                                                         | Without a backend an upload field would be fake UI; users are told to attach photos to the e-mail / WhatsApp                             |
| Dev port                  | 1111 (`npm run dev`, `npm start`, Playwright)                                                               | User requirement                                                                                                                         |

## Status

- [x] Phase 1: showcase site, 127 unit/contract/component tests, 61 E2E + 8 visual baselines, prod audit clean
- [x] Independent adversarial review → 4 Important + 11 Minor findings (open)
- [ ] Phase 3 step 0: fix review findings, re-review
- [ ] Phase 3 steps 1–6: PostgreSQL + Drizzle, brand pages with sorting, FR locale, auth + roles, admin CRUD, versioned media + content with rollback, audit log
- [ ] Push to GitHub — **only after explicit user approval**

## Known risks / open items

- Review findings open: canonical/hreflang on all pages point to home; no-JS form submit would put personal data in the URL; language switch drops collection filters; fixed header may obscure focused elements.
- Dev-only `npm audit` findings in `eslint-config-next` chain (no production impact).
- Legal pages are placeholders — must be written by a lawyer before launch.
- Demo data and stock photos; official brand imagery is copyrighted → real photos must be uploaded via the coming admin panel.
- Do not run `next build`/E2E while the dev server writes to `.next` (an interrupted write corrupted `.next/dev` once; fix = delete `.next/dev`).
