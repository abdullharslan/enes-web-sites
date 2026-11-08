// @vitest-environment node
import { DrizzleQueryError } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { inspect } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { concealFailure } from "./conceal-failure";

const caught = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
};

describe("concealFailure", () => {
  it.each([
    ["redirect", () => redirect("/admin")],
    ["notFound", () => notFound()],
  ])("lets Next's own %s through unchanged and unlogged", (_name, control) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = caught(control);
    expect(caught(() => concealFailure("Label", error))).toBe(error);
    expect(log).not.toHaveBeenCalled();
  });

  it("logs the kind of a failed query and throws a generic error without a cause", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new DrizzleQueryError(
      "insert into users values ($1)",
      ["ada@example.com"],
      Object.assign(new Error("ada@example.com exists"), { code: "23505" }),
    );

    const thrown = caught(() => concealFailure("Label", failure));

    expect(log.mock.calls).toEqual([["Label", "Error 23505"]]);
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).cause).toBeUndefined();
    expect(inspect(thrown, { depth: 10, showHidden: true })).not.toContain(
      "ada@example.com",
    );
  });

  it("conceals whatever else was thrown", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(caught(() => concealFailure("Label", "ada@example.com"))).toBeInstanceOf(
      Error,
    );
    expect(log.mock.calls).toEqual([["Label", "unknown"]]);
  });
});
