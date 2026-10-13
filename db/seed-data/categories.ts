import de from "@/messages/de.json";
import en from "@/messages/en.json";
import fr from "@/messages/fr.json";
import tr from "@/messages/tr.json";
import type { SeedCategory } from "./types";

const name = (key: "bags" | "watches" | "jewellery") => ({
  de: de.catalog.categories[key],
  en: en.catalog.categories[key],
  fr: fr.catalog.categories[key],
  tr: tr.catalog.categories[key],
});

/** Not part of the original UI dictionary: categories are data from now on. */
const SHOES = { de: "Schuhe", en: "Shoes", fr: "Chaussures", tr: "Ayakkabılar" };

export const SEED_CATEGORIES: readonly SeedCategory[] = [
  {
    slug: "bags",
    name: name("bags"),
    tileImage: { src: "/images/bag-burgundy-croc.jpg", alt: name("bags") },
  },
  {
    slug: "watches",
    name: name("watches"),
    tileImage: { src: "/images/watch-on-book.jpg", alt: name("watches") },
  },
  {
    slug: "shoes",
    name: SHOES,
    tileImage: { src: "/images/shoe-cream-pumps.jpg", alt: SHOES },
  },
  {
    slug: "jewellery",
    name: name("jewellery"),
    tileImage: { src: "/images/jewel-crescent.jpg", alt: name("jewellery") },
  },
];
