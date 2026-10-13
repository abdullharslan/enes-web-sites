import { describe, expect, it } from "vitest";
import { buildAlternates, pageMetadata } from "./seo";

describe("buildAlternates", () => {
  it("points canonical at the page itself, not the home page", () => {
    expect(buildAlternates("de", "/collection/rolex-explorer-224270").canonical).toBe(
      "/de/collection/rolex-explorer-224270",
    );
  });

  it("lists every locale for the same page, keyed by BCP 47 tag, plus x-default", () => {
    expect(buildAlternates("tr", "/sell").languages).toEqual({
      "de-DE": "/de/sell",
      "en-GB": "/en/sell",
      "tr-TR": "/tr/sell",
      "x-default": "/de/sell",
    });
  });

  it("handles the home page", () => {
    expect(buildAlternates("en", "/").canonical).toBe("/en");
  });
});

describe("pageMetadata", () => {
  it("keeps site-wide Open Graph fields when a page sets its own title and images", () => {
    const meta = pageMetadata("en", "/collection/x", {
      title: "Rolex X",
      images: ["/images/a.jpg"],
    });
    expect(meta.openGraph).toMatchObject({
      siteName: "Maison Vault",
      locale: "en-GB",
      type: "website",
      title: "Rolex X",
      images: ["/images/a.jpg"],
      url: "/en/collection/x",
    });
    expect(meta.alternates?.canonical).toBe("/en/collection/x");
  });

  it("marks pages as noindex on request", () => {
    expect(pageMetadata("de", "/legal/agb", { noIndex: true }).robots).toEqual({
      index: false,
    });
  });
});
