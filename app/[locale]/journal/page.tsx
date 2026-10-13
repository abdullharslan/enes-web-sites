import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";
import { JournalList } from "@/components/home/journal-list";
import { PageHeader } from "@/components/ui/page-header";
import { JOURNAL } from "@/data/journal";
import { getDictionary } from "@/lib/i18n/dictionaries";

export async function generateMetadata(): Promise<Metadata> {
  const { locale, dict } = await getDictionary();
  return pageMetadata(locale, "/journal", {
    title: dict.journal.title,
    description: dict.journal.intro,
  });
}

export default async function JournalPage() {
  const { locale, dict } = await getDictionary();
  return (
    <>
      <PageHeader
        eyebrow={dict.journal.eyebrow}
        title={dict.journal.title}
        intro={dict.journal.intro}
      />
      <div className="mx-auto max-w-screen-2xl px-4 py-20 sm:px-8">
        <JournalList entries={JOURNAL} locale={locale} headingLevel="h2" />
      </div>
    </>
  );
}
