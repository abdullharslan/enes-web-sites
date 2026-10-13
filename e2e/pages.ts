/** Representative routes covering every page template. */
export const PAGES = [
  "/de",
  "/en/collection",
  "/tr/collection?category=watches&availability=all",
  "/de/collection/rolex-submariner-date-126610ln",
  "/en/collection/chanel-wallet-on-chain",
  "/de/sell",
  "/en/about",
  "/tr/journal",
  "/de/contact",
  "/en/legal/impressum",
  "/de/does-not-exist",
] as const;

export const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
] as const;
