import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { JournalForm, JournalImageForm } from "@/components/admin/content-forms";
import { TextLink } from "@/components/admin/table";
import { newRequestKey } from "@/lib/admin/request-key";
import { T } from "@/lib/admin/text";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";
import { getJournal } from "@/lib/server/content/admin-queries";

export const metadata: Metadata = { title: T.journal.edit };

export default async function EditJournalPage({
  params,
  searchParams,
}: PageProps<"/admin/journal/[id]">) {
  const user = await requireUser();
  if (!can(user.role, "content:write")) return <AccessDenied />;
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const entry = /^[0-9a-f-]{36}$/.test(id) ? await getJournal(id) : null;
  if (!entry) notFound();
  return (
    <>
      <AdminPageTitle
        actions={
          <TextLink href={`/admin/history/journal/${entry.id}`}>
            {T.common.history}
          </TextLink>
        }
      >
        {entry.title.tr ?? entry.title.de}
      </AdminPageTitle>
      <JournalForm
        key={entry.currentVersion}
        id={entry.id}
        version={entry.currentVersion}
        requestKey={await newRequestKey()}
        savedVersion={typeof query.saved === "string" ? query.saved : undefined}
        values={entry}
      />
      <section aria-labelledby="journal-image" className="mt-12">
        <h2
          id="journal-image"
          className="mb-4 text-xs font-semibold uppercase tracking-luxe text-gold"
        >
          {T.journal.image}
        </h2>
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <div className="relative aspect-[4/3] overflow-hidden border border-line bg-graphite">
            {entry.imageSrc ? (
              <Image
                src={entry.imageSrc}
                alt={T.fields.currentImage}
                fill
                sizes="18rem"
                className="object-cover"
              />
            ) : (
              <p className="p-4 text-sm text-mist">{T.fields.noImage}</p>
            )}
          </div>
          <JournalImageForm id={entry.id} slug={entry.slug} />
        </div>
      </section>
    </>
  );
}
