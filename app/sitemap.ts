import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";
import { PRODUCTS } from "@/data/products";
import { LOCALES } from "@/lib/i18n/locales";
import { buildAlternates } from "@/lib/seo";

const STATIC_PATHS = ["/", "/collection", "/sell", "/about", "/journal", "/contact"];

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = [...STATIC_PATHS, ...PRODUCTS.map((p) => `/collection/${p.slug}`)];
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
