import type { Brand } from "@/lib/catalog/schema";

export const BRANDS: readonly Brand[] = [
  { slug: "hermes", name: "Hermès", categories: ["bags", "jewellery"] },
  { slug: "louis-vuitton", name: "Louis Vuitton", categories: ["bags"] },
  { slug: "chanel", name: "Chanel", categories: ["bags", "jewellery"] },
  { slug: "rolex", name: "Rolex", categories: ["watches"] },
  { slug: "patek-philippe", name: "Patek Philippe", categories: ["watches"] },
  { slug: "van-cleef-arpels", name: "Van Cleef & Arpels", categories: ["jewellery"] },
];

export const BRAND_SLUGS = BRANDS.map((brand) => brand.slug);

export function getBrandName(slug: string): string {
  const brand = BRANDS.find((b) => b.slug === slug);
  if (!brand) throw new Error(`Unknown brand: ${slug}`);
  return brand.name;
}
