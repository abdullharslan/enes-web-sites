/**
 * Single source of truth for brand identity and contact details.
 *
 * The phone/WhatsApp number is from the Ofcom range reserved for fiction
 * (+44 7700 900xxx) and the e-mail uses the reserved example.com domain, so the
 * placeholders can never reach a real person. Replace them before going live.
 */
export const SITE = {
  name: "Maison Vault",
  url: "https://maison-vault.example",
  email: "concierge@example.com",
  phoneDisplay: "+44 7700 900123",
  phoneHref: "tel:+447700900123",
  whatsappNumber: "447700900123",
  address: {
    street: "Musterstraße 1",
    city: "00000 Musterstadt",
    country: "Deutschland",
  },
  social: {
    instagram: "https://www.instagram.com/",
  },
} as const;
