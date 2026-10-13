import { notFound } from "next/navigation";
import { locale as rootLocale } from "next/root-params";
import { isLocale, type Locale } from "./locales";
import type de from "@/messages/de.json";

export type Dictionary = typeof de;

const loaders: Record<Locale, () => Promise<Dictionary>> = {
  de: () => import("@/messages/de.json").then((m) => m.default),
  en: () => import("@/messages/en.json").then((m) => m.default),
  tr: () => import("@/messages/tr.json").then((m) => m.default),
};

/** Resolves the current request locale from the `[locale]` root segment (404 if unsupported). */
export async function getLocale(): Promise<Locale> {
  const value = await rootLocale();
  if (!isLocale(value)) notFound();
  return value;
}

export async function getDictionary(): Promise<{ locale: Locale; dict: Dictionary }> {
  const locale = await getLocale();
  return { locale, dict: await loaders[locale]() };
}
