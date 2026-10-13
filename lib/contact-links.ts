// E.164 without the leading "+": country code + subscriber number, 8–15 digits.
const WHATSAPP_NUMBER = /^[1-9]\d{7,14}$/;
// Deliberately strict: a single address, no query or header injection.
const EMAIL = /^[^\s@?&=]+@[^\s@?&=]+\.[^\s@?&=]+$/;

export function buildWhatsAppUrl(internationalNumber: string, message: string): string {
  if (!WHATSAPP_NUMBER.test(internationalNumber)) {
    throw new TypeError(`Invalid WhatsApp number: ${internationalNumber}`);
  }
  const base = `https://wa.me/${internationalNumber}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

export function buildMailtoUrl(recipient: string, subject: string, body: string): string {
  if (!EMAIL.test(recipient)) {
    throw new TypeError(`Invalid e-mail recipient: ${recipient}`);
  }
  // RFC 6068: line breaks in mailto bodies are CRLF.
  const crlfBody = body.replace(/\r?\n/g, "\r\n");
  const query = `subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(crlfBody)}`;
  return `mailto:${recipient}?${query}`;
}
