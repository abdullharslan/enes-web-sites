import Image from "next/image";
import { T } from "@/lib/admin/text";
import { ImageUploadForm } from "./catalog-forms";

/** Current image + upload of a new version (the old file is kept). */
export function ImagePanel({
  title,
  src,
  target,
  id,
  slug,
  version,
}: {
  title: string;
  src: string | null;
  target: "brand" | "category";
  id: string;
  slug: string;
  version: number;
}) {
  return (
    <section aria-labelledby={`${target}-image`} className="mt-12">
      <h2
        id={`${target}-image`}
        className="mb-4 text-xs font-semibold uppercase tracking-luxe text-gold"
      >
        {title}
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
        <ImageUploadForm target={target} id={id} slug={slug} version={version} />
      </div>
    </section>
  );
}
