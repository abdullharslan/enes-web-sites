import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InquiryForm } from "@/components/forms/inquiry-form";
import { SellForm } from "@/components/forms/sell-form";
import { BRANDS } from "@/data/brands";
import { dict } from "./fixtures";

const assign = vi.fn();
const originalLocation = window.location;

beforeEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...originalLocation, assign },
  });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation,
  });
  assign.mockReset();
});

const decodedMailto = () => decodeURIComponent(String(assign.mock.calls[0]?.[0]));

describe("InquiryForm", () => {
  const renderForm = () =>
    render(
      <InquiryForm
        recipient="concierge@example.com"
        subject="Anfrage: Rolex Submariner"
        context={[["Objekt", "Rolex Submariner 126610LN"]]}
        labels={dict.forms}
      />,
    );

  it("blocks submission, flags fields and focuses the first invalid one", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: dict.forms.submit }));

    expect(assign).not.toHaveBeenCalled();
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

    expect(assign).not.toHaveBeenCalled();
    expect(screen.getByLabelText(dict.forms.email)).toHaveAccessibleDescription(
      dict.forms.errors.invalidEmail,
    );
  });

  it("hands a prepared message to the mail client on valid input", async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText(dict.forms.name), "Ada Lovelace");
    await userEvent.type(screen.getByLabelText(dict.forms.email), "ada@example.com");
    await userEvent.type(screen.getByLabelText(dict.forms.message), "Noch verfügbar?");
    await userEvent.click(screen.getByRole("button", { name: dict.forms.submit }));

    expect(assign).toHaveBeenCalledOnce();
    const url = decodedMailto();
    expect(
      url.startsWith("mailto:concierge@example.com?subject=Anfrage: Rolex Submariner"),
    ).toBe(true);
    expect(url).toContain("Objekt: Rolex Submariner 126610LN");
    expect(url).toContain("Name: Ada Lovelace");
    expect(screen.getByText(dict.forms.success)).toBeInTheDocument();
  });
});

describe("SellForm", () => {
  it("composes a consignment e-mail including selected accessories", async () => {
    render(
      <SellForm
        recipient="concierge@example.com"
        brands={BRANDS}
        labels={{ forms: dict.forms, sell: dict.sell, catalog: dict.catalog }}
      />,
    );
    const f = dict.sell.fields;
    await userEvent.selectOptions(screen.getByLabelText(f.brand), "rolex");
    await userEvent.selectOptions(screen.getByLabelText(f.category), "watches");
    await userEvent.type(screen.getByLabelText(f.model), "Daytona 116500LN");
    await userEvent.selectOptions(screen.getByLabelText(f.condition), "excellent");
    await userEvent.type(screen.getByLabelText(new RegExp(f.year)), "2020");
    await userEvent.click(screen.getByLabelText(dict.catalog.setItems.box));
    await userEvent.click(screen.getByLabelText(dict.catalog.setItems.papers));
    await userEvent.type(screen.getByLabelText(dict.forms.name), "Ada");
    await userEvent.type(screen.getByLabelText(dict.forms.email), "ada@example.com");
    await userEvent.click(screen.getByRole("button", { name: dict.forms.submit }));

    expect(assign).toHaveBeenCalledOnce();
    const url = decodedMailto();
    expect(url).toContain("subject=Kommissionsverkauf: Rolex Daytona 116500LN");
    expect(url).toContain(`${f.setItems}: Box, Papiere`);
    expect(url).toContain(`${f.year}: 2020`);
  });

  it("rejects an out-of-range year (boundary)", async () => {
    render(
      <SellForm
        recipient="concierge@example.com"
        brands={BRANDS}
        labels={{ forms: dict.forms, sell: dict.sell, catalog: dict.catalog }}
      />,
    );
    await userEvent.type(
      screen.getByLabelText(new RegExp(dict.sell.fields.year)),
      "1899",
    );
    await userEvent.click(screen.getByRole("button", { name: dict.forms.submit }));
    expect(
      screen.getByLabelText(new RegExp(dict.sell.fields.year)),
    ).toHaveAccessibleDescription(dict.forms.errors.invalidYear);
    expect(assign).not.toHaveBeenCalled();
  });
});
