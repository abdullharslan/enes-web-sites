import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProductsAdminPage from "@/app/admin/(panel)/products/page";
import { T } from "@/lib/admin/text";
import { requireUser } from "@/lib/server/auth/current";
import { listProducts } from "@/lib/server/catalog/admin-queries";

vi.mock("server-only", () => ({}));
vi.mock("@/components/admin/admin-shell", () => ({
  AccessDenied: () => null,
  AdminPageTitle: () => null,
}));
vi.mock("@/lib/server/auth/current", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/server/catalog/admin-queries", () => ({ listProducts: vi.fn() }));

type Row = Awaited<ReturnType<typeof listProducts>>[number];

const row = (isVisible: boolean, brandVisible: boolean, categoryVisible: boolean) =>
  ({
    product: {
      id: `${isVisible}-${brandVisible}-${categoryVisible}`,
      model: "Model",
      status: "available",
      priceEur: null,
      isVisible,
      currentVersion: 1,
    },
    brandName: "Marke",
    categoryName: { de: "Uhren" },
    brandVisible,
    categoryVisible,
    thumbSrc: null,
  }) as unknown as Row;

describe("admin product list visibility", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u",
      email: "o@example.com",
      name: "O",
      role: "owner",
    });
  });

  it.each([
    ["visible everywhere", [true, true, true], T.common.visible],
    ["hidden itself", [false, true, true], T.common.hidden],
    ["hidden itself, brand too", [false, false, true], T.common.hidden],
    ["brand hidden", [true, false, true], T.products.hiddenByBrand],
    ["category hidden", [true, true, false], T.products.hiddenByCategory],
    ["both hidden", [true, false, false], T.products.hiddenByBrandAndCategory],
  ] as const)("%s", async (_, [own, brand, category], expected) => {
    vi.mocked(listProducts).mockResolvedValue([row(own, brand, category)]);
    render(await ProductsAdminPage());
    expect(screen.getByRole("cell", { name: expected })).toBeInTheDocument();
  });
});
