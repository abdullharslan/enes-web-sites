import type { CatalogImage } from "./schema";

/** Shown for products that have no photo yet (never another brand's photo). */
export const PLACEHOLDER_IMAGE: CatalogImage = {
  src: "/images/placeholder-mv.jpg",
  alt: {
    de: "Platzhalter – Foto folgt",
    en: "Placeholder – photo to follow",
    fr: "Espace réservé – photo à venir",
    tr: "Yer tutucu – fotoğraf yakında",
  },
};
