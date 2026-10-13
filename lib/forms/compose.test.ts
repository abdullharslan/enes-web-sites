import { describe, expect, it } from "vitest";
import { composeMessage, formDataToRecord } from "./compose";

describe("formDataToRecord", () => {
  it("keeps the last scalar value and collects declared array fields", () => {
    const fd = new FormData();
    fd.append("name", "Ada");
    fd.append("setItems", "box");
    fd.append("setItems", "papers");
    expect(formDataToRecord(fd, ["setItems"])).toEqual({
      name: "Ada",
      setItems: ["box", "papers"],
    });
  });

  it("returns an empty array for declared array fields without values", () => {
    expect(formDataToRecord(new FormData(), ["setItems"])).toEqual({ setItems: [] });
  });

  it("ignores file entries", () => {
    const fd = new FormData();
    fd.append("photo", new File(["x"], "x.jpg"));
    expect(formDataToRecord(fd, [])).toEqual({});
  });
});

describe("composeMessage", () => {
  it("renders label/value lines and skips empty values", () => {
    expect(
      composeMessage([
        ["Name", "Ada"],
        ["Telefon", ""],
        ["Zubehör", ["Box", "Papiere"]],
        ["Jahr", undefined],
        ["Preis", 1200],
      ]),
    ).toBe("Name: Ada\nZubehör: Box, Papiere\nPreis: 1200");
  });

  it("puts multi-line free text in its own block", () => {
    expect(
      composeMessage([
        ["Name", "Ada"],
        ["Nachricht", "Zeile 1\nZeile 2"],
      ]),
    ).toBe("Name: Ada\n\nNachricht:\nZeile 1\nZeile 2");
  });
});
