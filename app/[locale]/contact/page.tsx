import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { InquiryForm } from "@/components/forms/inquiry-form";
import { ButtonLink } from "@/components/ui/button-link";
import { ChatIcon, MailIcon, PhoneIcon } from "@/components/ui/icons";
import { PageHeader } from "@/components/ui/page-header";
import { SITE } from "@/config/site";
import { buildWhatsAppUrl } from "@/lib/contact-links";
import { getPages, getSiteContact } from "@/lib/server/content";
import { getDictionary } from "@/lib/i18n/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getDictionary();
  const { contact: c } = await getPages(locale);
  return pageMetadata(locale, "/contact", {
    title: c.eyebrow,
    description: c.text,
  });
}

export default async function ContactPage() {
  const [{ locale, dict }, contact] = await Promise.all([
    getDictionary(),
    getSiteContact(),
  ]);
  const { contact: c } = await getPages(locale);
  return (
    <>
      <PageHeader eyebrow={c.eyebrow} title={c.title} intro={c.text} />
      <div className="mx-auto grid max-w-screen-2xl gap-16 px-4 py-20 sm:px-8 lg:grid-cols-[2fr_3fr]">
        <aside className="flex flex-col gap-8">
          <div>
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-luxe text-gold">
              {c.addressTitle}
            </h2>
            <address className="leading-relaxed text-mist not-italic">
              {SITE.name}
              <br />
              {contact.street}
              <br />
              {contact.city}
              <br />
              {contact.country}
            </address>
          </div>
          <div className="flex flex-col gap-3">
            <ButtonLink
              href={buildWhatsAppUrl(contact.whatsappNumber, "")}
              newTabHint={dict.nav.opensInNewTab}
            >
              <ChatIcon width={18} height={18} />
              {dict.contactBar.whatsapp}
            </ButtonLink>
            <ButtonLink href={contact.phoneHref} variant="outline">
              <PhoneIcon width={18} height={18} />
              {contact.phoneDisplay}
            </ButtonLink>
            <ButtonLink href={`mailto:${contact.email}`} variant="outline">
              <MailIcon width={18} height={18} />
              {contact.email}
            </ButtonLink>
          </div>
        </aside>
        <section aria-labelledby="contact-form-title">
          <h2
            id="contact-form-title"
            className="mb-10 font-display text-4xl font-light text-cream"
          >
            {c.formTitle}
          </h2>
          <InquiryForm
            recipient={contact.email}
            subject={`${SITE.name} – ${c.formTitle}`}
            labels={dict.forms}
          />
        </section>
      </div>
    </>
  );
}
