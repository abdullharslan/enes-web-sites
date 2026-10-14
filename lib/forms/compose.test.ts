import { describe, expect, it } from "vitest";
import { boundRecord, formDataToRecord } from "./compose";

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

describe("boundRecord", () => {
  it("caps strings, array items and array length", () => {
    const bounded = boundRecord(
      {
        message: "x".repeat(5000),
        setItems: Array.from({ length: 50 }, () => "y".repeat(50)),
      },
      10,
    );
    expect(bounded.message).toBe("x".repeat(10));
    expect(bounded.setItems).toHaveLength(20);
    expect((bounded.setItems as string[])[0]).toBe("y".repeat(10));
  });

  it("leaves normal input untouched", () => {
    expect(boundRecord({ name: "Ada", setItems: ["box"] }, 1001)).toEqual({
      name: "Ada",
      setItems: ["box"],
    });
  });
});
