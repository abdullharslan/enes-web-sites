import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveBrandAction } from "@/app/admin/actions/catalog";
import { BrandForm, type BrandFormProps } from "@/components/admin/catalog-forms";
import { formValues } from "@/lib/admin/form-state";
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
