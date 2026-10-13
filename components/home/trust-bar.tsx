import type { Dictionary } from "@/lib/i18n/dictionaries";

export function TrustBar({ dict }: { dict: Dictionary["trust"] }) {
  return (
    <section aria-labelledby="trust-title" className="border-y border-line bg-ink">
      <div className="mx-auto max-w-screen-2xl px-4 py-16 sm:px-8">
        <h2 id="trust-title" className="sr-only">
          {dict.title}
        </h2>
        <ul className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {dict.items.map((item, index) => (
            <li key={item.title} className="flex gap-5">
              <span aria-hidden="true" className="font-display text-3xl text-gold">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-label text-cream">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-mist">{item.text}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
