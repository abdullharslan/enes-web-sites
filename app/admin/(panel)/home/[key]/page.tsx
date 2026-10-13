import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import {
  BlockForm,
  BlockImageForm,
  type EditableField,
} from "@/components/admin/content-forms";
import { TextLink } from "@/components/admin/table";
import { newRequestKey } from "@/lib/admin/request-key";
import { T } from "@/lib/admin/text";
import {
  CONTENT_BLOCKS,
  blockDefaults,
  isContentKey,
  type FieldDef,
} from "@/lib/content/blocks";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";
import { getBlock } from "@/lib/server/content/admin-queries";

export const metadata: Metadata = { title: T.home.title };

export default async function EditBlockPage({
  params,
  searchParams,
}: PageProps<"/admin/home/[key]">) {
  const user = await requireUser();
  if (!can(user.role, "content:write")) return <AccessDenied />;
  const [{ key }, query] = await Promise.all([params, searchParams]);
  if (!isContentKey(key)) notFound();

  const block = await getBlock(key);
  const definition = CONTENT_BLOCKS[key];
  const fields: EditableField[] = (definition.fields as readonly FieldDef[]).map(
    ({ key: k, kind, label }) => ({ key: k, kind, label }),
  );
  const values = block?.data ?? blockDefaults(key);
  const imageFields = fields.filter((f) => f.kind === "image");

  return (
    <>
      <AdminPageTitle
        actions={
          <TextLink href={`/admin/history/content/${key}`}>{T.common.history}</TextLink>
        }
      >
        {definition.label}
      </AdminPageTitle>
      <BlockForm
        key={block?.currentVersion ?? 0}
        blockKey={key}
        version={block?.currentVersion ?? 0}
        requestKey={await newRequestKey()}
        savedVersion={typeof query.saved === "string" ? query.saved : undefined}
        fields={fields}
        values={values}
      />
      {block &&
        imageFields.map((field) => {
          const mediaId = values[field.key];
          const src =
            typeof mediaId === "string" ? block.imageSrc.get(mediaId) : undefined;
          return (
            <section
              key={field.key}
              aria-labelledby={`image-${field.key}`}
              className="mt-12"
            >
              <h2
                id={`image-${field.key}`}
                className="mb-4 text-xs font-semibold uppercase tracking-luxe text-gold"
              >
                {field.label}
              </h2>
              <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
                <div className="relative aspect-[4/5] overflow-hidden border border-line bg-graphite">
                  {src ? (
                    <Image
                      src={src}
                      alt={T.fields.currentImage}
                      fill
                      sizes="18rem"
                      className="object-cover"
                    />
                  ) : (
                    <p className="p-4 text-sm text-mist">{T.fields.noImage}</p>
                  )}
                </div>
                <BlockImageForm blockKey={key} field={field.key} />
              </div>
            </section>
          );
        })}
    </>
  );
}
