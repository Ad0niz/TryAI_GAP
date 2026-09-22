/**
 * i18n setup: react-i18next + browser language detection.
 * Locales: es (default), en, de, pt. Dictionaries are extracted from
 * wireframe-v2.html by scripts/extract-i18n.mjs into ./locales.
 *
 * Namespaces:
 *  - translation (default): all UI strings (nav, login, onboarding, dashboard, …)
 *  - qbank: question banks (maturity + area kits), used by phase-2 questionnaires
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import es from './locales/es.json';
import en from './locales/en.json';
import de from './locales/de.json';
import pt from './locales/pt.json';
import qbankEs from './locales/qbank.es.json';
import qbankEn from './locales/qbank.en.json';
import qbankDe from './locales/qbank.de.json';
import qbankPt from './locales/qbank.pt.json';

import { setLanguageProvider } from '@/api/client';

export const SUPPORTED_LANGUAGES = [
  { code: 'es', name: 'Español' },
  { code: 'en', name: 'English' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português' },
] as const;

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { translation: es, qbank: qbankEs },
      en: { translation: en, qbank: qbankEn },
      de: { translation: de, qbank: qbankDe },
      pt: { translation: pt, qbank: qbankPt },
    },
    fallbackLng: 'es',
    supportedLngs: ['es', 'en', 'de', 'pt'],
    nonExplicitSupportedLngs: true,
    ns: ['translation', 'qbank'],
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
    returnObjects: true,
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'tryaigap.locale',
    },
  });

// API client sends Accept-Language with the active UI locale.
setLanguageProvider(() => (i18n.language ?? 'es').slice(0, 2));

export default i18n;
