import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fieldErrors, formValues, pick, type FormState } from "./form-state";

describe("formValues", () => {
  it("keeps strings, groups repeated keys and drops files and action ids", () => {
    const fd = new FormData();
    fd.append("name", "Rolex");
    fd.append("setItems", "box");
    fd.append("setItems", "papers");
    fd.append("image", new File(["x"], "x.jpg"));
    fd.append("$ACTION_ID_abc", "");
    expect(formValues(fd)).toEqual({ name: "Rolex", setItems: ["box", "papers"] });
  });
});

describe("fieldErrors", () => {
  it("maps nested zod paths to dotted keys", () => {
    const result = z
      .object({
        name: z.string().min(1),
        description: z.object({ de: z.string().min(1) }),
      })
      .safeParse({ name: "", description: { de: "" } });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(fieldErrors(result.error)).toEqual({
        name: "invalid",
        "description.de": "invalid",
      });
  });
});

describe("pick", () => {
  it("prefers the submitted value after an error, else the stored default", () => {
    const error: FormState = {
      status: "error",
      error: "invalid",
      values: { name: "Edited" },
    };
    expect(pick(error, "name", "Stored")).toBe("Edited");
    expect(pick(error, "slug", "stored-slug")).toBe("stored-slug");
    expect(pick({ status: "idle" }, "name", "Stored")).toBe("Stored");
    expect(pick({ status: "idle" }, "name", undefined)).toBe("");
  });
});
