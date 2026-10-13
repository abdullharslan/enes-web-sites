import type { LocalizedText } from "@/lib/catalog/schema";

export interface JournalEntry {
  slug: string;
  publishedAt: string;
  image: string;
  title: LocalizedText;
  excerpt: LocalizedText;
}

const t = (de: string, en: string, tr: string): LocalizedText => ({ de, en, tr });

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
    ),
    excerpt: t(
      "Staubbeutel, Füllpapier und die richtige Luftfeuchtigkeit: So bleibt Epsom-, Togo- oder Kaviarleder über Jahrzehnte schön.",
      "Dust bags, stuffing paper and the right humidity: how Epsom, Togo or caviar leather stays beautiful for decades.",
      "Toz torbası, dolgu kâğıdı ve doğru nem: Epsom, Togo veya havyar deri on yıllarca nasıl güzel kalır?",
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
    ),
    excerpt: t(
      "Box, Papiere und Garantiekarte erzählen die Geschichte einer Uhr – und beeinflussen ihren Wert spürbar.",
      "Box, papers and warranty card tell a watch's story – and noticeably influence its value.",
      "Kutu, belgeler ve garanti kartı bir saatin hikâyesini anlatır – ve değerini belirgin biçimde etkiler.",
    ),
  },
  {
    slug: "alhambra-icon",
    publishedAt: "2026-07-01",
    image: "/images/jewel-layered.jpg",
    title: t("Ikone Alhambra", "The Alhambra icon", "İkon: Alhambra"),
    excerpt: t(
      "Seit 1968 steht das Vierblatt-Motiv für Glück. Ein Blick auf Materialien, Varianten und Pflege.",
      "Since 1968 the four-leaf motif has stood for luck. A look at materials, variations and care.",
      "1968'den beri dört yapraklı motif şansı simgeliyor. Malzemeler, çeşitler ve bakım üzerine.",
    ),
  },
];
