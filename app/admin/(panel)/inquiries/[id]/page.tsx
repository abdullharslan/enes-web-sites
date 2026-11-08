import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AccessDenied, AdminPageTitle } from "@/components/admin/admin-shell";
import { InquiryDeleteForm, InquiryStatusForm } from "@/components/admin/inquiry-forms";
import { db } from "@/db/client";
import { T } from "@/lib/admin/text";
import { inquiryDetails } from "@/lib/inquiries/present";
import { interpolate } from "@/lib/i18n/interpolate";
import { isLocale } from "@/lib/i18n/locales";
import { requireUser } from "@/lib/server/auth/current";
import { can } from "@/lib/server/auth/permissions";
import { getInquiry } from "@/lib/server/inquiries/service";
import tr from "@/messages/tr.json";

export const metadata: Metadata = { title: T.inquiries.detailTitle };

const dateTime = new Intl.DateTimeFormat("tr-TR", {
  dateStyle: "full",
  timeStyle: "short",
});

const CODE_NAMES = { conditions: tr.catalog.conditions, setItems: tr.catalog.setItems };

export default async function InquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  if (!can(user.role, "inquiries:manage")) return <AccessDenied />;
  const id = z.uuid().safeParse((await params).id);
  const found = id.success ? await getInquiry(db, id.data) : null;
  if (!found) notFound();
  const { inquiry, photos } = found;
  const email = typeof inquiry.data.email === "string" ? inquiry.data.email : null;
  const locale = isLocale(inquiry.locale) ? inquiry.locale : "de";

  return (
    <>
      <AdminPageTitle>
        {T.inquiries.kinds[inquiry.kind]} · {T.inquiries.statuses[inquiry.status]}
      </AdminPageTitle>
      <p className="mb-8 text-sm text-mist">{dateTime.format(inquiry.createdAt)}</p>

      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <section aria-labelledby="inquiry-data" className="min-w-0">
          <h2 id="inquiry-data" className="sr-only">
            {T.inquiries.detailTitle}
          </h2>
          <dl className="divide-y divide-line border-y border-line">
            {inquiryDetails(inquiry.data, CODE_NAMES).map(([field, value]) => (
              <div key={field} className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]">
                <dt className="text-xs uppercase tracking-label text-mist">
                  {T.inquiries.fields[field]}
                </dt>
                <dd className="whitespace-pre-line break-words">{value}</dd>
              </div>
            ))}
            <div className="grid gap-1 py-3 sm:grid-cols-[12rem_1fr]">
              <dt className="text-xs uppercase tracking-label text-mist">
                {T.inquiries.fields.locale}
              </dt>
              <dd>{locale.toUpperCase()}</dd>
            </div>
          </dl>

          {photos.length > 0 && (
            <section aria-labelledby="inquiry-photos" className="mt-10">
              <h2
                id="inquiry-photos"
                className="mb-4 text-xs font-semibold uppercase tracking-luxe text-gold"
              >
                {T.inquiries.photos}
              </h2>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {photos.map((photo) => (
                  <li key={photo.id}>
                    <a href={`/admin/inquiries/photos/${photo.id}`} target="_blank">
                      {/* Private, session-protected image: next/image would cache it. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/admin/inquiries/photos/${photo.id}`}
                        alt={interpolate(T.inquiries.photoAlt, { n: photo.position + 1 })}
                        width={photo.width}
                        height={photo.height}
                        className="aspect-square w-full border border-line object-cover"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>

        <aside className="flex flex-col gap-8">
          <InquiryStatusForm id={inquiry.id} status={inquiry.status} />
          {email && (
            <a
              href={`mailto:${email}`}
              className="inline-flex min-h-11 items-center justify-center border border-gold px-6 text-xs font-semibold uppercase tracking-label text-gold"
            >
              {T.inquiries.replyByMail}
            </a>
          )}
          {inquiry.productSlug && (
            <a
              href={`/${locale}/collection/${encodeURIComponent(inquiry.productSlug)}`}
              target="_blank"
              className="inline-flex min-h-11 items-center text-gold underline-offset-4 hover:underline"
            >
              {T.inquiries.viewProduct}
            </a>
          )}
          <InquiryDeleteForm id={inquiry.id} />
        </aside>
      </div>
    </>
  );
}
