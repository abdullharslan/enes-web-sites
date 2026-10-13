import { ChatIcon, MailIcon, PhoneIcon } from "@/components/ui/icons";
import type { SiteContact } from "@/lib/content/resolve";
import { buildWhatsAppUrl } from "@/lib/contact-links";

interface FloatingContactProps {
  contact: SiteContact;
  label: string;
  labels: { call: string; whatsapp: string; email: string; opensInNewTab: string };
}

const BUTTON =
  "flex h-12 w-full items-center justify-center border border-line bg-coal/95 text-gold backdrop-blur transition-colors hover:bg-gold hover:text-ink sm:w-12";

/** Bottom bar on phones; fixed rail on the right edge from `sm` up, as on the reference site. */
export function FloatingContact({ contact, label, labels }: FloatingContactProps) {
  return (
    <aside
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-30 sm:inset-x-auto sm:top-1/2 sm:right-0 sm:bottom-auto sm:-translate-y-1/2"
    >
      <ul className="grid grid-cols-3 sm:flex sm:flex-col">
        <li>
          <a href={contact.phoneHref} aria-label={labels.call} className={BUTTON}>
            <PhoneIcon />
          </a>
        </li>
        <li>
          <a
            href={buildWhatsAppUrl(contact.whatsappNumber, "")}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${labels.whatsapp} ${labels.opensInNewTab}`}
            className={BUTTON}
          >
            <ChatIcon />
          </a>
        </li>
        <li>
          <a
            href={`mailto:${contact.email}`}
            aria-label={labels.email}
            className={BUTTON}
          >
            <MailIcon />
          </a>
        </li>
      </ul>
    </aside>
  );
}
