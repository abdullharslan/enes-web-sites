import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveBrandAction } from "@/app/admin/actions/catalog";
import { BrandForm, type BrandFormProps } from "@/components/admin/catalog-forms";
import { ADMIN_ERROR_MESSAGES } from "@/lib/admin/error-messages";
import { formValues, type FormState } from "@/lib/admin/form-state";
import { T } from "@/lib/admin/text";

vi.mock("@/app/admin/actions/catalog", () => ({
  saveBrandAction: vi.fn(),
  saveCategoryAction: vi.fn(),
  saveProductAction: vi.fn(),
  uploadImageAction: vi.fn(),
}));

const stale: BrandFormProps = {
  id: "11111111-1111-4111-8111-111111111111",
  version: 2,
  requestKey: "00000000-0000-4000-8000-000000000000",
  fieldsKey: "before",
  values: {
    slug: "rolex",
    name: "Rolex",
    description: {},
    sortOrder: 0,
    isVisible: true,
  },
};
/** What the revalidated page delivers after someone else changed the record. */
const current: BrandFormProps = {
  ...stale,
  version: 3,
  fieldsKey: "after",
  values: { ...stale.values, name: "Their name" },
};

const nameInput = () =>
  screen.getByLabelText(new RegExp(`^${T.brands.name}`)) as HTMLInputElement;
const posted = (container: HTMLElement) => new FormData(container.querySelector("form")!);

describe("edit form after a version conflict", () => {
  beforeEach(() => {
    vi.mocked(saveBrandAction).mockImplementation(async (_prev, fd) => ({
      status: "error",
      error: "conflict",
      values: formValues(fd),
    }));
  });

  async function saveIntoConflict() {
    const view = render(<BrandForm {...stale} />);
    fireEvent.change(nameInput(), { target: { value: "My name" } });
    fireEvent.click(screen.getByRole("button", { name: T.common.save }));
    await screen.findByText(T.fields.conflict);
    view.rerender(<BrandForm {...current} />);
    return view;
  }

  it("keeps the warning and the typed edits when the page data is refreshed", async () => {
    await saveIntoConflict();
    expect(nameInput().value).toBe("My name");
    expect(screen.getByText(T.fields.conflict)).toBeInTheDocument();
  });

  it("does not send the current version until the overwrite is confirmed", async () => {
    const { container } = await saveIntoConflict();
    expect(posted(container).has("expectedVersion")).toBe(false);
    const confirm = screen.getByLabelText(T.fields.conflictOverwrite);
    expect(confirm).toBeRequired();
    fireEvent.click(confirm);
    await waitFor(() => expect(posted(container).get("expectedVersion")).toBe("3"));
  });

  it("asks nothing extra without a conflict, and shows new stored values", () => {
    const view = render(<BrandForm {...stale} />);
    expect(posted(view.container).get("expectedVersion")).toBe("2");
    expect(screen.queryByLabelText(T.fields.conflictOverwrite)).toBeNull();
    view.rerender(<BrandForm {...current} />);
    expect(nameInput().value).toBe("Their name");
  });
});

describe("the version a save is based on", () => {
  type ErrorCode = Extract<FormState, { status: "error" }>["error"];
  const save = () => fireEvent.click(screen.getByRole("button", { name: T.common.save }));

  /** The next save fails with `error`, echoing what was submitted. */
  const failsWith = (error: ErrorCode) =>
    vi.mocked(saveBrandAction).mockImplementationOnce(async (_prev, fd) => ({
      status: "error",
      error,
      values: formValues(fd),
    }));

  async function conflictAgainstV3() {
    failsWith("conflict");
    const view = render(<BrandForm {...stale} />);
    save();
    await screen.findByText(T.fields.conflict);
    view.rerender(<BrandForm {...current} />);
    return view;
  }

  it.each(["invalid", "duplicateSlug", "upload"] as const)(
    "stays the one the echoed values were based on after %s and a refresh",
    async (error) => {
      failsWith(error);
      const view = render(<BrandForm {...stale} />);
      fireEvent.change(nameInput(), { target: { value: "My name" } });
      save();
      await screen.findByText(ADMIN_ERROR_MESSAGES[error]);

      view.rerender(<BrandForm {...current} />);

      expect(nameInput().value).toBe("My name");
      expect(posted(view.container).get("expectedVersion")).toBe("2");
      expect(screen.queryByLabelText(T.fields.conflictOverwrite)).toBeNull();
    },
  );

  it("does not carry a confirmed overwrite over to a version never seen", async () => {
    const view = await conflictAgainstV3();
    fireEvent.click(screen.getByLabelText(T.fields.conflictOverwrite));
    failsWith("invalid");
    save();
    await screen.findByText(ADMIN_ERROR_MESSAGES.invalid);

    view.rerender(<BrandForm {...current} version={4} fieldsKey="later" />);

    expect(posted(view.container).get("expectedVersion")).toBe("3");
  });

  it("unticks the overwrite when a refresh brings a newer version", async () => {
    const view = await conflictAgainstV3();
    fireEvent.click(screen.getByLabelText(T.fields.conflictOverwrite));
    expect(posted(view.container).get("expectedVersion")).toBe("3");

    // Same fields, newer version: an image change does not remount the form.
    view.rerender(<BrandForm {...current} version={4} />);

    expect(posted(view.container).has("expectedVersion")).toBe(false);
    expect(screen.getByLabelText(T.fields.conflictOverwrite)).not.toBeChecked();
  });

  it("asks for confirmation when the echoed values carry no version", async () => {
    vi.mocked(saveBrandAction).mockImplementationOnce(async () => ({
      status: "error",
      error: "invalid",
      values: { name: "My name" },
    }));
    const view = render(<BrandForm {...stale} />);
    save();
    await screen.findByText(ADMIN_ERROR_MESSAGES.invalid);

    view.rerender(<BrandForm {...current} />);

    expect(posted(view.container).has("expectedVersion")).toBe(false);
    expect(screen.getByLabelText(T.fields.conflictOverwrite)).toBeRequired();
  });
});
