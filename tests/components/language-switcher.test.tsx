import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LocaleList } from "@/components/layout/language-switcher";

describe("LocaleList", () => {
  it("links every locale to the same page and marks the current one", () => {
    render(
      <LocaleList
        current="tr"
        label="Dil"
        pathname="/tr/collection/rolex-explorer-224270"
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Dil" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "de" })).toHaveAttribute(
      "href",
      "/de/collection/rolex-explorer-224270",
    );
    expect(screen.getByRole("link", { name: "en" })).toHaveAttribute("hreflang", "en");
    expect(screen.getByRole("link", { name: "tr" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByRole("link", { name: "de" })).not.toHaveAttribute("aria-current");
  });
});
