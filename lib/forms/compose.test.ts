import { describe, expect, it } from "vitest";
import { formDataToRecord } from "./compose";

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
