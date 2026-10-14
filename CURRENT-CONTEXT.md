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

- [x] Phase 1: showcase site; review findings fixed and re-reviewed
- [x] Step 1: PostgreSQL + Drizzle, versioned media store, revisions, catalog from DB (golden master verified)
- [x] Step 2: brand pages with A–Z / Z–A / price sorting, French, Miu Miu + Shoes
- [x] Step 3: auth (argon2id, hashed sessions, lockout), roles owner/editor, admin shell, user management, `admin:create`
- [x] Step 4: catalog CRUD, versioned image uploads, history + restore, optimistic concurrency
- [x] Step 5: home-page content editor (hero image etc.) with versions, journal, media library, audit view
- [x] Step 6: full verify, independent security review (2 Important) → fixes → re-review (2 new Important) → fixes → re-review: all Important resolved; backup/restore with verified recovery
- [x] Pushed to GitHub (user approved); later commits stay local until the next approval
- [x] Gap step 1: about/sell/contact/legal pages, footer, SEO editable (`65f7b3a`)
- [x] Gap step 2: product image ordering/cover + site search; catalog/search pages work without JavaScript
- [x] Gap step 3: user management (own password change, owner reset, role change, last-owner protection)
- [x] Gap step 4: inquiries inbox (forms stored server-side, rate limit, honeypot, private sell photos, status, retention)
- [ ] Gap step 5: cookieless analytics dashboard
- [ ] Gap step 6: CI (GitHub Actions), full verify, independent review → fixes → re-review
- Demo: `next start -p 1113` + Cloudflare quick tunnel run in the background (temporary; a rebuild/restart is needed to show new code)

## Known risks / open items

- Login throttling relies on a reverse proxy that sets `X-Forwarded-For`; without one, per-address limits can be bypassed (per-e-mail cap of 50/15 min and trusted devices still hold). Documented in README.
- Accepted Low items from the security review: a stolen device cookie still has its own 5/15 min limit; the per-address limit may overshoot slightly under concurrency (lock is per e-mail); a successful login does not reset earlier failures.
- CSP still allows `'unsafe-inline'` scripts (static CSP trade-off); nonces for the dynamic admin could be added.

- No admin account exists in the dev database yet: the owner must run `npm run admin:create` (password is never stored in files).
- Next.js will make Partial Prefetching always-on in its next major; the real-404 strategy for unknown slugs must be revisited then.
- Uploaded files are written before the DB transaction commits; a rolled-back upload leaves an unreferenced (immutable, harmless) file — a cleanup job can be added later.
- Dev-only `npm audit` findings in the `eslint-config-next` chain (no production impact).
- Privacy policy must describe inquiry storage/retention before going live (README). No e-mail notification for new inquiries yet (needs SMTP).
- One unidentified E2E failure in a single full run (not reproduced in 544 repeats) — watch.
- Legal pages are placeholders; demo data/photos must be replaced with real stock and own photos via the admin panel.
