import { describe, expect, it } from 'vitest';
import i18n, { SUPPORTED_LANGUAGES } from './index';
import es from './locales/es.json';
import en from './locales/en.json';
import de from './locales/de.json';
import pt from './locales/pt.json';
import qbankEs from './locales/qbank.es.json';
import qbankEn from './locales/qbank.en.json';
import qbankDe from './locales/qbank.de.json';
import qbankPt from './locales/qbank.pt.json';

type Dict = Record<string, unknown>;

function flattenKeys(obj: Dict, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return flattenKeys(value as Dict, path);
    }
    return [path];
  });
}

describe('i18n', () => {
  it('loads all 4 locales with both namespaces', () => {
    for (const lang of ['es', 'en', 'de', 'pt']) {
      expect(i18n.hasResourceBundle(lang, 'translation')).toBe(true);
      expect(i18n.hasResourceBundle(lang, 'qbank')).toBe(true);
    }
    expect(SUPPORTED_LANGUAGES.map((l) => l.code)).toEqual(['es', 'en', 'de', 'pt']);
  });

  it('translation key parity: es vs en/de/pt', () => {
    const base = flattenKeys(es as Dict).sort();
    for (const other of [en, de, pt]) {
      expect(flattenKeys(other as Dict).sort()).toEqual(base);
    }
  });

  it('qbank key parity: es vs en/de/pt', () => {
    const base = flattenKeys(qbankEs as unknown as Dict).sort();
    for (const other of [qbankEn, qbankDe, qbankPt]) {
      expect(flattenKeys(other as unknown as Dict).sort()).toEqual(base);
    }
  });

  it('resolves core keys in every locale', async () => {
    for (const lang of ['es', 'en', 'de', 'pt']) {
      await i18n.changeLanguage(lang);
      for (const key of ['nav.home', 'login.send', 'onboarding.next', 'dashboard.welcome']) {
        const value = i18n.t(key);
        expect(value).not.toBe(key);
        expect(value.length).toBeGreaterThan(0);
      }
    }
    await i18n.changeLanguage('es');
  });
});
