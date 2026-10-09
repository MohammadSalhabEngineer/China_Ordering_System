import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "../locales/en.json";
import ar from "../locales/ar.json";

export type Locale = "en" | "ar";
const KEY = "cs.locale";

function savedLocale(): Locale {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "ar" || v === "en") return v;
  } catch {
    /* ignore */
  }
  return navigator.language.toLowerCase().startsWith("ar") ? "ar" : "en";
}

export function applyDir(locale: Locale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
}

export function setLocale(locale: Locale) {
  try {
    localStorage.setItem(KEY, locale);
  } catch {
    /* ignore */
  }
  applyDir(locale);
  void i18n.changeLanguage(locale);
}

const initial = savedLocale();
applyDir(initial);

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  lng: initial,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
