// @vitest-environment node
/// <reference types="node" />
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { renderToBuffer } from '@react-pdf/renderer';
import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';
import es from '@/i18n/locales/es.json';
import en from '@/i18n/locales/en.json';
import de from '@/i18n/locales/de.json';
import pt from '@/i18n/locales/pt.json';
import { ReportDocument, type ReportData } from './ReportDocument';
import { createReportContent } from './reportI18n';

const resources = { es: { translation: es }, en: { translation: en }, de: { translation: de }, pt: { translation: pt } };
const areas = ['ventas', 'marketing', 'servicio', 'finanzas', 'rrhh', 'operaciones', 'legal'];
const vectors = ['eficiencia', 'ingresos', 'experiencia', 'riesgo', 'talento'];

function fixture(mode: 'mixed' | 'complete' | 'empty'): ReportData {
  const data: ReportData = { orgName: 'Compañía Ñandú Müller São João', results: {
    maturity: { average: 3.8, level: 'Gestionado', dimensions: [
      { key: 'datos', label: 'Datos', score: 4.2 }, { key: 'tech', label: 'Tecnología', score: 3.1 },
      { key: 'talento', label: 'Talento', score: 3.8 }, { key: 'procesos', label: 'Procesos', score: 4 },
      { key: 'cultura', label: 'Cultura', score: 3.9 },
    ] },
    heatmap: { vectors: ['Bloque A', 'Bloque B', 'Bloque C', 'Bloque D'],
      areas: areas.map(name => ({ name, row: mode === 'empty' ? [null, null, null, null] : [3, 4, null, 5] })) },
    priorities: [],
    value_vectors: { status: 'mapping_pending', mapped_questions: 112, total_questions: 132, unmapped_numeric_answers: 2,
      vectors: vectors.map((key, index) => ({ key, percentage: mode === 'empty' || index === 4 ? null : 66.66666667,
        numeric_answers: mode === 'empty' || index === 4 ? 0 : 16 })) },
    pain_readiness: { threshold: 3, coverage_rule: 'complete_numeric_blocks',
      points: (mode === 'empty' ? [] : mode === 'complete' ? areas : ['ventas']).map((area_key, index) => ({
        area_key, pain: index === 0 ? 3.001 : 3, readiness: 4, numeric_answers: 16, total_questions: 16,
        quadrant: index === 0 ? 'high_high' : 'boundary', quick_win: index === 0,
      })),
      pending_areas: (mode === 'complete' ? [] : mode === 'empty' ? areas : areas.slice(1)).map((area_key, index) => ({
        area_key, numeric_answers: mode === 'empty' ? 0 : index + 1, total_questions: 16,
      })),
    },
  } };
  return data;
}

describe('executive PDF real rendering', () => {
  it.each(['es', 'en', 'de', 'pt'] as const)('renders vectors, matrix and coverage in %s without altering server values', async lang => {
    const i18n = createInstance();
    await i18n.init({ lng: lang, fallbackLng: 'es', resources, interpolation: { escapeValue: false } });
    for (const mode of ['mixed', 'complete', 'empty'] as const) {
      const input = fixture(mode);
      const before = structuredClone(input);
      const { data, labels } = createReportContent(input, i18n, new Date(2026, 9, 29, 12));
      expect(data.results.value_vectors).toEqual(input.results.value_vectors);
      expect(data.results.pain_readiness).toEqual(input.results.pain_readiness);
      expect(labels.analytics.areaNames.ventas).toBe(resources[lang].translation.areaList.ventas.name);
      expect(labels.analytics.vectorNames.eficiencia).toBe(resources[lang].translation.results.vectors[0]);
      expect(labels.analytics.quadrants.boundary).toBe(resources[lang].translation.resultsAnalytics.quadrants.boundary);
      const buffer = await renderToBuffer(<ReportDocument data={data} labels={labels} />);
      expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
      expect(buffer.length).toBeGreaterThan(1000);
      expect(input).toEqual(before);
      if (process.env.APP14_PDF_QA_DIR) {
        await mkdir(process.env.APP14_PDF_QA_DIR, { recursive: true });
        await writeFile(join(process.env.APP14_PDF_QA_DIR, `${lang}-${mode}.pdf`), buffer);
      }
    }
  }, 60000);

  it('still renders an individual initiative when supplied by the backend', async () => {
    const i18n = createInstance();
    await i18n.init({ lng: 'es', resources });
    const input = fixture('mixed');
    input.results.priorities = [{ initiative: 'Iniciativa de prueba Ñandú', area: 'ventas', vector: 'Eficiencia',
      pain: 4, readiness: 4, recommendation: 'qw' }];
    const { data, labels } = createReportContent(input, i18n);
    expect(data.results.priorities[0].initiative).toBe(input.results.priorities[0].initiative);
    const buffer = await renderToBuffer(<ReportDocument data={data} labels={labels} />);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    if (process.env.APP14_PDF_QA_DIR) await writeFile(join(process.env.APP14_PDF_QA_DIR, 'es-initiative.pdf'), buffer);
  }, 60000);
});
