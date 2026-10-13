import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { ProductCard } from "@/components/catalog/product-card";
import { seedCatalogFixture } from "../fixtures/catalog";
import { DEFAULT_FILTER, serializeCatalogFilter } from "@/lib/catalog/filter";
import type { Product } from "@/lib/catalog/schema";
import { dict } from "./fixtures";

const {
  brands: BRANDS,
  categories: CATEGORIES,
  products: PRODUCTS,
} = seedCatalogFixture();

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const bySlug = (slug: string): Product => {
  const product = PRODUCTS.find((p) => p.slug === slug);
  if (!product) throw new Error(slug);
  return product;
};

describe("ProductCard", () => {
  it("shows brand, model, price and links to the localized detail page", () => {
    render(
      <ProductCard
        product={bySlug("rolex-submariner-date-126610ln")}
        locale="en"
        labels={dict.catalog}
      />,
    );
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/en/collection/rolex-submariner-date-126610ln",
    );
    expect(screen.getByRole("heading", { name: "Submariner Date" })).toBeInTheDocument();
    expect(screen.getByText("Rolex")).toHaveAttribute("lang", "en");
    expect(screen.getByText("€13,900")).toBeInTheDocument();
  });

  it("uses the on-request label when there is no fixed price", () => {
    render(
      <ProductCard
        product={bySlug("patek-philippe-nautilus-5711")}
        locale="de"
        labels={dict.catalog}
      />,
    );
    expect(screen.getByText(dict.catalog.priceOnRequest)).toBeInTheDocument();
  });

  it("marks sold items and hides their price", () => {
    render(
      <ProductCard
        product={bySlug("chanel-wallet-on-chain")}
        locale="de"
        labels={dict.catalog}
      />,
    );
    expect(screen.getByText(dict.catalog.statuses.sold)).toBeInTheDocument();
    expect(screen.queryByText(/€/)).not.toBeInTheDocument();
  });

  it("uses localized alt text", () => {
    render(
      <ProductCard
        product={bySlug("rolex-submariner-date-126610ln")}
        locale="tr"
        labels={dict.catalog}
      />,
    );
    expect(screen.getByRole("img")).toHaveAccessibleName("Siyah kadranlı dalgıç saati");
  });
});

describe("CatalogFilters", () => {
  const hrefFor = (f: typeof DEFAULT_FILTER) =>
    `/de/collection?${serializeCatalogFilter(f)}`;

  it("marks active options and builds shareable links that keep other filters", () => {
    render(
      <CatalogFilters
        filter={{ ...DEFAULT_FILTER, brand: "rolex" }}
        brands={BRANDS}
        categories={CATEGORIES}
        locale="de"
        labels={dict.catalog}
        hrefFor={hrefFor}
      />,
    );
    const rolex = screen.getByRole("link", { name: "Rolex" });
    expect(rolex).toHaveAttribute("aria-current", "true");
    expect(rolex).toHaveAttribute("lang", "en");
    expect(
      screen.getByRole("link", { name: dict.catalog.categories.watches }),
    ).toHaveAttribute("href", "/de/collection?brand=rolex&category=watches");
  });

  it("offers a reset link only when a filter is active", () => {
    const { rerender } = render(
      <CatalogFilters
        filter={DEFAULT_FILTER}
        brands={BRANDS}
        categories={CATEGORIES}
        locale="de"
        labels={dict.catalog}
        hrefFor={hrefFor}
      />,
    );
    expect(
      screen.queryByRole("link", { name: dict.catalog.filters.reset }),
    ).not.toBeInTheDocument();

    rerender(
      <CatalogFilters
        filter={{ ...DEFAULT_FILTER, sort: "price-asc" }}
        brands={BRANDS}
        categories={CATEGORIES}
        locale="de"
        labels={dict.catalog}
        hrefFor={hrefFor}
      />,
    );
    const nav = screen.getByRole("navigation", { name: dict.catalog.filters.label });
    expect(
      within(nav).getByRole("link", { name: dict.catalog.filters.reset }),
    ).toHaveAttribute("href", "/de/collection?");
  });
});
