import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';
import es from '@/i18n/locales/es.json';
import en from '@/i18n/locales/en.json';
import de from '@/i18n/locales/de.json';
import pt from '@/i18n/locales/pt.json';
import { createReportContent } from './reportI18n';
import type { ReportData } from './ReportDocument';

const resources = { es: { translation: es }, en: { translation: en }, de: { translation: de }, pt: { translation: pt } };
const date = new Date(2026, 9, 21, 12);
const data: ReportData = {
  orgName: 'Compañía Müller — São João',
  results: {
    maturity: { average: 3.8, level: 'Gestionado', dimensions: [
      { key: 'datos', label: 'Datos', score: 4.2 },
      { key: 'tech', label: 'Tecnología', score: 3.1 },
      { key: 'talento', label: 'Talento', score: 3.8 },
      { key: 'procesos', label: 'Procesos', score: 4 },
      { key: 'cultura', label: 'Cultura', score: 3.9 },
    ] },
    heatmap: { vectors: ['Bloque A', 'Bloque B', 'Bloque C', 'Bloque D'], areas: [
      { name: 'Ventas B2B', row: [5, 2, null, 4] },
      { name: 'Finanzas', row: [2.5, null, 3, 4] },
      { name: 'Área propia Ñandú', row: [1, 2, 3, 4] },
    ] },
    priorities: [],
  },
};

describe('PDF content localization', () => {
  it.each(['es', 'en', 'de', 'pt'] as const)('localizes cached Spanish results into %s without changing data', async (lang) => {
    const i18n = createInstance();
    await i18n.init({ lng: lang, fallbackLng: 'es', resources, interpolation: { escapeValue: false } });
    const before = structuredClone(data);
    const report = createReportContent(data, i18n, date);
    const dictionary = resources[lang].translation;
    expect(report.labels.locale).toBe(lang);
    expect(report.data.orgName).toBe(data.orgName);
    expect(report.data.results.maturity.level).toBe(dictionary.resultsPdf.levels.managed);
    expect(report.data.results.maturity.dimensions.map((d) => d.label)).toEqual(dictionary.maturity.dims.map((d) => d.label));
    expect(report.data.results.heatmap.vectors).toEqual(['A', 'B', 'C', 'D'].map((block) => i18n.t('resultsPdf.block', { block })));
    expect(report.data.results.heatmap.areas[0].name).toBe(dictionary.areaList.ventas.name);
    expect(report.data.results.heatmap.areas[1].name).toBe(dictionary.areaList.finanzas.name);
    expect(report.data.results.heatmap.areas[2].name).toBe('Área propia Ñandú');
    expect(report.data.results.maturity.average).toBe(data.results.maturity.average);
    expect(report.data.results.maturity.dimensions.map((d) => d.score)).toEqual(data.results.maturity.dimensions.map((d) => d.score));
    expect(report.data.results.heatmap.areas.map((a) => a.row)).toEqual(data.results.heatmap.areas.map((a) => a.row));
    expect(report.data.results.priorities).toEqual([]);
    expect(report.labels.noPriorities).toBe(dictionary.resultsPdf.noPriorities);
    expect(report.labels.noData).toBe(dictionary.resultsPdf.noData);
    expect(report.labels.heatTitle).toBe(dictionary.resultsPdf.heatTitle);
    expect(report.labels.nextSteps).toEqual(dictionary.resultsPdf.nextSteps);
    expect(report.labels.nextSteps.join(' ')).not.toMatch(/quick wins|pain|readiness/i);
    expect(report.labels.heatTitle).not.toMatch(/vector|vetor/i);
    expect(JSON.stringify(report.labels)).not.toMatch(/resultsPdf\.|\{\{/);
    expect(data).toEqual(before);
  });

  it('recognizes levels and area aliases from every backend locale, without recalculating levels', async () => {
    const i18n = createInstance();
    await i18n.init({ lng: 'en', resources });
    for (const source of ['es', 'en', 'de', 'pt'] as const) {
      for (const [key, level] of Object.entries(resources[source].translation.resultsPdf.levels)) {
        const input = structuredClone(data);
        input.results.maturity.level = level;
        const report = createReportContent(input, i18n, date);
        expect(report.data.results.maturity.level).toBe(i18n.t(`resultsPdf.levels.${key}`));
      }
      for (const [key, name] of Object.entries(resources[source].translation.resultsPdf.areaAliases)) {
        const input = structuredClone(data);
        input.results.heatmap.areas = [{ name, row: [1, 2, 3, 4] }];
        expect(createReportContent(input, i18n, date).data.results.heatmap.areas[0].name)
          .toBe(i18n.t(`areaList.${key}.name`));
      }
    }
  });

  it('preserves real initiative text and metrics while translating known system labels', async () => {
    const i18n = createInstance();
    await i18n.init({ lng: 'de', resources });
    const input = structuredClone(data);
    input.results.priorities = [{ initiative: 'Proyecto propio Ñandú', area: 'Ventas B2B', vector: 'Eficiencia', pain: 2.8, readiness: 3.1, recommendation: 'inv' }];
    const { data: report } = createReportContent(input, i18n, date);
    expect(report.results.priorities[0]).toEqual({
      ...input.results.priorities[0], area: de.areaList.ventas.name, vector: de.results.vectors[0],
    });
  });

  it('handles regional locale and empty results using localized fallbacks', async () => {
    const i18n = createInstance();
    await i18n.init({ lng: 'pt-BR', fallbackLng: 'es', resources });
    const input = structuredClone(data);
    input.results.maturity.level = 'unknown-system-value';
    input.results.heatmap.areas = [];
    const report = createReportContent(input, i18n, date);
    expect(report.labels.locale).toBe('pt');
    expect(report.data.results.maturity.level).toBe(pt.resultsPdf.unavailable);
    expect(report.data.results.heatmap.areas).toEqual([]);
    expect(report.labels.noData).toBe(pt.resultsPdf.noData);
  });
});
