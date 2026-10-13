import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";
import { LOCALES } from "@/lib/i18n/locales";
import { buildAlternates } from "@/lib/seo";
import { getCatalog } from "@/lib/server/catalog";

const STATIC_PATHS = [
  "/",
  "/collection",
  "/brands",
  "/sell",
  "/about",
  "/journal",
  "/contact",
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { brands, products } = await getCatalog();
  const paths = [
    ...STATIC_PATHS,
    ...brands.map((b) => `/brands/${b.slug}`),
    ...products.map((p) => `/collection/${p.slug}`),
  ];
  return paths.flatMap((path) =>
    LOCALES.map((locale) => {
      const { canonical, languages } = buildAlternates(locale, path);
      const absolute = (href: string) => `${SITE.url}${href}`;
      return {
        url: absolute(canonical),
        alternates: {
          languages: Object.fromEntries(
            Object.entries(languages).map(([tag, href]) => [tag, absolute(href)]),
          ),
        },
      };
    }),
  );
}
