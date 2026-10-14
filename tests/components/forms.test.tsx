import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InquiryForm } from "@/components/forms/inquiry-form";
import { SellForm } from "@/components/forms/sell-form";
import type { PublicFormState } from "@/lib/forms/state";
import { INQUIRY_LIMITS } from "@/lib/inquiries/policy";
import { seedCatalogFixture } from "../fixtures/catalog";
import { dict } from "./fixtures";

const submit = vi.hoisted(() =>
  vi.fn<(prev: PublicFormState, fd: FormData) => Promise<PublicFormState>>(),
);
vi.mock("@/app/actions/inquiries", () => ({ submitInquiryAction: submit }));

const { brands: BRANDS, categories: CATEGORIES } = seedCatalogFixture();

afterEach(() => submit.mockReset());

const sentForm = () => submit.mock.calls[0]?.[1];
const photo = (name: string, size = 10, type = "image/jpeg") =>
  new File([new Uint8Array(size)], name, { type });

describe("InquiryForm", () => {
  const renderForm = () =>
    render(
      <InquiryForm
        kind="product"
        locale="de"
        productSlug="rolex-submariner-date-126610ln"
        labels={dict.forms}
      />,
    );

  const fillValid = async () => {
    await userEvent.type(screen.getByLabelText(dict.forms.name), "Ada Lovelace");
    await userEvent.type(screen.getByLabelText(dict.forms.email), "ada@example.com");
    await userEvent.type(screen.getByLabelText(dict.forms.message), "Noch verfügbar?");
  };

  it("blocks submission, flags fields and focuses the first invalid one", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: dict.forms.submit }));

    expect(submit).not.toHaveBeenCalled();
    const name = screen.getByLabelText(dict.forms.name);
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAccessibleDescription(dict.forms.errors.required);
    expect(name).toHaveFocus();
    expect(screen.getByText(dict.forms.errorSummary)).toBeInTheDocument();
  });

  it("rejects an invalid e-mail with a specific message", async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText(dict.forms.name), "Ada");
    await userEvent.type(screen.getByLabelText(dict.forms.email), "ada@");
    await userEvent.type(screen.getByLabelText(dict.forms.message), "Hallo");
    await userEvent.click(screen.getByRole("button", { name: dict.forms.submit }));

    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(dict.forms.email)).toHaveAccessibleDescription(
      dict.forms.errors.invalidEmail,
    );
  });

  it("sends valid input with kind, product, locale and a submission key", async () => {
    submit.mockResolvedValue({ status: "sent" });
    renderForm();
    await fillValid();
    await userEvent.click(screen.getByRole("button", { name: dict.forms.submit }));

    await waitFor(() => expect(screen.getByText(dict.forms.success)).toBeVisible());
    expect(submit).toHaveBeenCalledOnce();
    const fd = sentForm()!;
    expect(fd.get("kind")).toBe("product");
    expect(fd.get("locale")).toBe("de");
    expect(fd.get("productSlug")).toBe("rolex-submariner-date-126610ln");
    expect(fd.get("name")).toBe("Ada Lovelace");
    expect(fd.get("website")).toBe("");
    expect(String(fd.get("submissionKey"))).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps what was typed when the server cannot accept the request", async () => {
    submit.mockImplementation(async (_prev, fd) => ({
      status: "rateLimited",
      values: Object.fromEntries(
        [...fd.entries()].filter(([, v]) => typeof v === "string"),
      ) as Record<string, string>,
    }));
    renderForm();
    await fillValid();
    await userEvent.click(screen.getByRole("button", { name: dict.forms.submit }));

    await waitFor(() => expect(screen.getByText(dict.forms.rateLimited)).toBeVisible());
    expect(screen.getByLabelText(dict.forms.name)).toHaveValue("Ada Lovelace");
    expect(screen.getByLabelText(dict.forms.message)).toHaveValue("Noch verfügbar?");
  });
});

describe("SellForm", () => {
  const renderSell = () =>
    render(
      <SellForm
        brands={BRANDS}
        categories={CATEGORIES}
        locale="de"
        labels={{ forms: dict.forms, sell: dict.sell, catalog: dict.catalog }}
      />,
    );
  const f = dict.sell.fields;

  const fillValid = async () => {
    await userEvent.selectOptions(screen.getByLabelText(f.brand), "rolex");
    await userEvent.selectOptions(screen.getByLabelText(f.category), "watches");
    await userEvent.type(screen.getByLabelText(f.model), "Daytona 116500LN");
    await userEvent.selectOptions(screen.getByLabelText(f.condition), "excellent");
    await userEvent.type(screen.getByLabelText(new RegExp(f.year)), "2020");
    await userEvent.click(screen.getByLabelText(dict.catalog.setItems.box));
    await userEvent.click(screen.getByLabelText(dict.catalog.setItems.papers));
    await userEvent.type(screen.getByLabelText(dict.forms.name), "Ada");
    await userEvent.type(screen.getByLabelText(dict.forms.email), "ada@example.com");
  };

  it("sends the consignment with accessories and photos", async () => {
    submit.mockResolvedValue({ status: "sent" });
    renderSell();
    await fillValid();
    await userEvent.upload(screen.getByLabelText(new RegExp(f.photos)), [
      photo("front.jpg"),
      photo("back.png", 10, "image/png"),
    ]);
    // jsdom cannot serialise user-selected files into FormData (it adds one empty
    // placeholder), so the selection is checked on the input; the real upload is
    // covered by the E2E test in a browser.
    const input = screen.getByLabelText<HTMLInputElement>(new RegExp(f.photos));
    expect([...(input.files ?? [])].map((p) => p.name)).toEqual([
      "front.jpg",
      "back.png",
    ]);
    await userEvent.click(screen.getByRole("button", { name: dict.forms.submit }));

    await waitFor(() => expect(submit).toHaveBeenCalledOnce());
    const fd = sentForm()!;
    expect(fd.get("kind")).toBe("sell");
    expect(fd.getAll("setItems")).toEqual(["box", "papers"]);
  });

  it("rejects too many photos before uploading anything", async () => {
    renderSell();
    await fillValid();
    await userEvent.upload(
      screen.getByLabelText(new RegExp(f.photos)),
      Array.from({ length: INQUIRY_LIMITS.maxPhotos + 1 }, (_, i) => photo(`${i}.jpg`)),
    );
    await userEvent.click(screen.getByRole("button", { name: dict.forms.submit }));

    expect(submit).not.toHaveBeenCalled();
    const input = screen.getByLabelText(new RegExp(f.photos));
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(
      expect.stringContaining(String(INQUIRY_LIMITS.maxPhotos)),
    );
    expect(input).toHaveFocus();
  });

  it("rejects an out-of-range year (boundary)", async () => {
    renderSell();
    await userEvent.type(screen.getByLabelText(new RegExp(f.year)), "1899");
    await userEvent.click(screen.getByRole("button", { name: dict.forms.submit }));
    expect(screen.getByLabelText(new RegExp(f.year))).toHaveAccessibleDescription(
      dict.forms.errors.invalidYear,
    );
    expect(submit).not.toHaveBeenCalled();
  });
});
