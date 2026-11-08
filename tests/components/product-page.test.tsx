import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProductPage from "@/app/[locale]/collection/[slug]/page";
import type { Catalog } from "@/lib/catalog/schema";
import { seedCatalogFixture } from "../fixtures/catalog";
import { dict } from "./fixtures";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/app/actions/inquiries", () => ({ submitInquiryAction: vi.fn() }));
vi.mock("@/lib/i18n/dictionaries", async () => ({
  getDictionary: async () => ({
    locale: "de",
    dict: (await import("./fixtures")).dict,
  }),
}));
vi.mock("@/lib/server/content", () => ({
  getSiteContact: async () => ({ whatsappNumber: "491700000000" }),
}));

const catalog = vi.hoisted(() => ({ current: undefined as Catalog | undefined }));
vi.mock("@/lib/server/catalog", () => ({ getCatalog: async () => catalog.current }));

beforeEach(() => {
  catalog.current = seedCatalogFixture();
});

async function renderProduct(slug: string) {
  const page = await ProductPage({
    params: Promise.resolve({ locale: "de", slug }),
  } as PageProps<"/[locale]/collection/[slug]">);
  render(page);
}

const inquiryHeading = () =>
  screen.queryByRole("heading", { name: dict.product.inquireForm });
const submitButton = () => screen.queryByRole("button", { name: dict.forms.submit });
const whatsapp = () =>
  screen.queryByRole("link", { name: new RegExp(dict.product.inquireWhatsapp) });
const productHeader = () => {
  const header = screen.getByRole("heading", { level: 1 }).parentElement;
  if (!header) throw new Error("product header missing");
  return within(header);
};

describe("product page availability", () => {
  it("offers both ways to ask about an available product, without a status badge", async () => {
    await renderProduct("rolex-submariner-date-126610ln");
    expect(whatsapp()).toBeInTheDocument();
    expect(inquiryHeading()).toBeInTheDocument();
    expect(submitButton()).toBeInTheDocument();
    expect(productHeader().queryByText(dict.catalog.statuses.reserved)).toBeNull();
  });

  it("replaces every purchase action of a sold product with the sold note", async () => {
    await renderProduct("chanel-wallet-on-chain");
    expect(screen.getByText(dict.product.soldNotice)).toBeInTheDocument();
    expect(productHeader().getByText(dict.catalog.statuses.sold)).toBeInTheDocument();
    expect(whatsapp()).toBeNull();
    expect(inquiryHeading()).toBeNull();
    expect(submitButton()).toBeNull();
  });

  it("says reserved at the top of the page and keeps the inquiry open", async () => {
    await renderProduct("rolex-explorer-224270");
    expect(productHeader().getByText(dict.catalog.statuses.reserved)).toBeInTheDocument();
    expect(whatsapp()).toBeInTheDocument();
    expect(submitButton()).toBeInTheDocument();
  });
});
