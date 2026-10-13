import type { Metadata } from "next";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { JournalForm } from "@/components/admin/content-forms";
import { newRequestKey } from "@/lib/admin/request-key";
import { T } from "@/lib/admin/text";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";

export const metadata: Metadata = { title: T.journal.new };

export default async function NewJournalPage() {
  const user = await requireUser();
  if (!can(user.role, "content:write")) return <AccessDenied />;
  const requestKey = await newRequestKey();
  return (
    <>
      <AdminPageTitle>{T.journal.new}</AdminPageTitle>
      <JournalForm
        id={null}
        version={0}
        requestKey={requestKey}
        values={{
          slug: "",
          publishedAt: new Date().toISOString().slice(0, 10),
          title: {},
          excerpt: {},
          isVisible: true,
        }}
      />
    </>
  );
}
