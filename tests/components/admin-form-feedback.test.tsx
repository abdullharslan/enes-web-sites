import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormFeedback, TextInput } from "@/components/admin/fields";
import { T } from "@/lib/admin/text";

describe("FormFeedback", () => {
  it("uses the form's own conflict wording when given (image forms)", () => {
    render(
      <FormFeedback
        state={{ status: "error", error: "conflict" }}
        conflictMessage={T.fields.imageConflict}
      />,
    );
    expect(screen.getByText(T.fields.imageConflict)).toBeInTheDocument();
  });

  it("falls back to the record-wide wording, and shows success messages", () => {
    const { rerender } = render(
      <FormFeedback state={{ status: "error", error: "conflict" }} />,
    );
    expect(screen.getByText(T.fields.conflict)).toBeInTheDocument();
    rerender(<FormFeedback state={{ status: "ok", message: T.fields.unchanged }} />);
    expect(screen.getByText(T.fields.unchanged)).toBeInTheDocument();
  });
});

describe("field errors", () => {
  it("says why a date is refused", () => {
    render(
      <TextInput
        state={{
          status: "error",
          error: "invalid",
          fieldErrors: { publishedAt: "futureDate" },
        }}
        name="publishedAt"
        label="Tarih"
      />,
    );
    expect(screen.getByText(T.fields.futureDate)).toBeInTheDocument();
  });
});
