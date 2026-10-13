import type { Metadata } from "next";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { AdminTable, TextLink } from "@/components/admin/table";
import { T } from "@/lib/admin/text";
import { CONTENT_BLOCKS, CONTENT_KEYS } from "@/lib/content/blocks";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";
import { listBlocks } from "@/lib/server/content/admin-queries";

export const metadata: Metadata = { title: T.home.title };

export default async function HomeContentPage() {
  const user = await requireUser();
  if (!can(user.role, "content:write")) return <AccessDenied />;
  const versions = new Map((await listBlocks()).map((b) => [b.key, b.currentVersion]));
  return (
    <>
      <AdminPageTitle actions={<TextLink href="/de">{T.home.viewPage}</TextLink>}>
        {T.home.title}
      </AdminPageTitle>
      <p className="mb-8 max-w-2xl text-sm text-mist">{T.home.intro}</p>
      <AdminTable head={[T.home.section, T.common.version, T.common.actions]}>
        {CONTENT_KEYS.map((key) => (
          <tr key={key}>
            <td className="py-3 pr-4">{CONTENT_BLOCKS[key].label}</td>
            <td className="py-3 pr-4">v{versions.get(key) ?? 0}</td>
            <td className="py-3">
              <TextLink href={`/admin/home/${key}`}>{T.common.edit}</TextLink>
            </td>
          </tr>
        ))}
      </AdminTable>
    </>
  );
}
