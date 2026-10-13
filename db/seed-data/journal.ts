import type { LocalizedText } from "@/lib/catalog/schema";

export interface JournalEntry {
  slug: string;
  publishedAt: string;
  image: string;
  title: LocalizedText;
  excerpt: LocalizedText;
}

const t = (de: string, en: string, tr: string, fr: string): LocalizedText => ({
  de,
  en,
  fr,
  tr,
});

/* DEMO DATA — replace with real articles. */
export const JOURNAL: readonly JournalEntry[] = [
  {
    slug: "leather-care",
    publishedAt: "2026-09-18",
    image: "/images/bag-teal-flap.jpg",
    title: t(
      "Lederpflege für Ihre Lieblingstasche",
      "Leather care for your favourite bag",
      "Favori çantanız için deri bakımı",
      "L'entretien du cuir de votre sac préféré",
    ),
    excerpt: t(
      "Staubbeutel, Füllpapier und die richtige Luftfeuchtigkeit: So bleibt Epsom-, Togo- oder Kaviarleder über Jahrzehnte schön.",
      "Dust bags, stuffing paper and the right humidity: how Epsom, Togo or caviar leather stays beautiful for decades.",
      "Toz torbası, dolgu kâğıdı ve doğru nem: Epsom, Togo veya havyar deri on yıllarca nasıl güzel kalır?",
      "Housses, papier de soie et bonne hygrométrie : comment le cuir Epsom, Togo ou caviar reste beau pendant des décennies.",
    ),
  },
  {
    slug: "full-set-value",
    publishedAt: "2026-08-07",
    image: "/images/watch-on-book.jpg",
    title: t(
      "Warum ein Full Set zählt",
      "Why a full set matters",
      "Tam set neden önemli?",
      "Pourquoi un set complet compte",
    ),
    excerpt: t(
      "Box, Papiere und Garantiekarte erzählen die Geschichte einer Uhr – und beeinflussen ihren Wert spürbar.",
      "Box, papers and warranty card tell a watch's story – and noticeably influence its value.",
      "Kutu, belgeler ve garanti kartı bir saatin hikâyesini anlatır – ve değerini belirgin biçimde etkiler.",
      "Boîte, papiers et carte de garantie racontent l'histoire d'une montre – et influencent nettement sa valeur.",
    ),
  },
  {
    slug: "alhambra-icon",
    publishedAt: "2026-07-01",
    image: "/images/jewel-layered.jpg",
    title: t("Ikone Alhambra", "The Alhambra icon", "İkon: Alhambra", "L'icône Alhambra"),
    excerpt: t(
      "Seit 1968 steht das Vierblatt-Motiv für Glück. Ein Blick auf Materialien, Varianten und Pflege.",
      "Since 1968 the four-leaf motif has stood for luck. A look at materials, variations and care.",
      "1968'den beri dört yapraklı motif şansı simgeliyor. Malzemeler, çeşitler ve bakım üzerine.",
      "Depuis 1968, le motif à quatre feuilles symbolise la chance. Matières, variantes et entretien.",
    ),
  },
];
