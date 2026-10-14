// E.164 without the leading "+": country code + subscriber number, 8–15 digits.
const WHATSAPP_NUMBER = /^[1-9]\d{7,14}$/;

export function buildWhatsAppUrl(internationalNumber: string, message: string): string {
  if (!WHATSAPP_NUMBER.test(internationalNumber)) {
    throw new TypeError(`Invalid WhatsApp number: ${internationalNumber}`);
  }
  const base = `https://wa.me/${internationalNumber}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
