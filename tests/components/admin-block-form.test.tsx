import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BlockForm } from "@/components/admin/content-forms";

vi.mock("@/app/admin/actions/content", () => ({
  saveBlockAction: vi.fn(),
  uploadBlockImageAction: vi.fn(),
  saveJournalAction: vi.fn(),
  uploadJournalImageAction: vi.fn(),
}));

describe("BlockForm (content text form)", () => {
  it("posts no image field: images change only through the upload form", () => {
    const { container } = render(
      <BlockForm
        blockKey="home.hero"
        version={3}
        requestKey="00000000-0000-4000-8000-000000000000"
        fields={[
          { key: "title", kind: "text", label: "Titel" },
          { key: "image", kind: "image", label: "Görsel" },
        ]}
        values={{ title: { de: "Hallo" }, image: "11111111-1111-4111-8111-111111111111" }}
      />,
    );
    const form = container.querySelector("form")!;
    const posted = new FormData(form);
    expect(posted.has("image")).toBe(false);
    expect(posted.get("expectedVersion")).toBe("3");
    expect(container.innerHTML).not.toContain("11111111-1111-4111-8111-111111111111");
  });
});
