import type { i18n } from 'i18next';
import type { ResultOut } from '@/api/types';
import type { ReportData, ReportLabels } from './ReportDocument';

/** Translate system labels even when cached results arrived in a different locale.
 * User-authored organization/initiative names and all numeric values stay intact.
 * The API currently returns display names instead of area/level identifiers.
 */
export function createReportContent(data: ReportData, i18n: i18n, date = new Date()) {
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'es';
  const t = i18n.getFixedT(locale);
  const locales = ['es', 'en', 'de', 'pt'];
  const normalize = (value: string) => value.trim().normalize('NFC').toLocaleLowerCase();
  const areaNames = t('areaList', { returnObjects: true }) as Record<string, { name: string }>;
  const levels = t('resultsPdf.levels', { returnObjects: true }) as Record<string, string>;
  const dimensions = t('maturity.dims', { returnObjects: true }) as { id: string; label: string }[];
  const dimensionNames = Object.fromEntries(dimensions.map(({ id, label }) => [id, label]));
  const recoLabels = t('resultsUI.reco', { returnObjects: true }) as Record<string, string>;

  function areaLabel(value: string) {
    const input = normalize(value);
    for (const key of Object.keys(areaNames)) {
      if (input === key) return areaNames[key].name;
      for (const lang of locales) {
        const names = [
          i18n.getResource(lang, 'translation', `areaList.${key}.name`),
          i18n.getResource(lang, 'translation', `resultsPdf.areaAliases.${key}`),
        ];
        if (names.some((name) => typeof name === 'string' && normalize(name) === input)) {
          return areaNames[key].name;
        }
      }
    }
    return value; // Unknown area names may be user data; never rewrite them.
  }

  function levelLabel(value: string) {
    const input = normalize(value);
    for (const key of Object.keys(levels)) {
      if (input === key || locales.some((lang) => {
        const label = i18n.getResource(lang, 'translation', `resultsPdf.levels.${key}`);
        return typeof label === 'string' && normalize(label) === input;
      })) return levels[key];
    }
    return t('resultsPdf.unavailable');
  }

  function blockLabel(value: string) {
    const block = /^(?:(?:bloque|block|bloco)\s+)?([A-D])$/i.exec(value.trim());
    return block ? t('resultsPdf.block', { block: block[1].toUpperCase() }) : t('resultsPdf.unavailable');
  }

  function vectorLabel(value: string) {
    const input = normalize(value);
    for (const lang of locales) {
      const vectors = i18n.getResource(lang, 'translation', 'results.vectors') as string[];
      const index = vectors.findIndex((label) => normalize(label) === input);
      if (index >= 0) return (t('results.vectors', { returnObjects: true }) as string[])[index];
    }
    return blockLabel(value);
  }

  const results: ResultOut = {
    ...data.results,
    maturity: {
      ...data.results.maturity,
      level: levelLabel(data.results.maturity.level),
      dimensions: data.results.maturity.dimensions.map((dimension) => ({
        ...dimension,
        label: dimensionNames[dimension.key] ?? t('resultsPdf.unavailable'),
      })),
    },
    heatmap: {
      vectors: data.results.heatmap.vectors.map(blockLabel),
      areas: data.results.heatmap.areas.map((area) => ({ ...area, name: areaLabel(area.name) })),
    },
    priorities: data.results.priorities.map((priority) => ({
      ...priority,
      area: areaLabel(priority.area),
      vector: vectorLabel(priority.vector),
    })),
  };
  const score = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const labels: ReportLabels = {
    locale,
    coverTitle: t('resultsPdf.coverTitle'),
    coverSub: t('resultsPdf.coverSub'),
    generatedOn: t('resultsPdf.generatedOn', {
      date: new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(date),
    }),
    overallScore: t('resultsPdf.overallScore', {
      avg: score.format(results.maturity.average), level: results.maturity.level,
    }),
    methodology: t('resultsPdf.methodology'),
    methodologyBody: t('resultsPdf.methodologyBody'),
    dimTitle: t('resultsPdf.dimTitle'),
    dimName: t('resultsPdf.dimName'),
    dimScore: t('resultsPdf.dimScore'),
    heatTitle: t('resultsPdf.heatTitle'),
    heatNote: t('resultsPdf.heatNote'),
    noData: t('resultsPdf.noData'),
    noPriorities: t('resultsPdf.noPriorities'),
    unavailable: t('resultsPdf.unavailable'),
    prioTitle: t('resultsPdf.prioTitle'),
    recoTitle: t('resultsPdf.recoTitle'),
    nextSteps: t('resultsPdf.nextSteps', { returnObjects: true }) as string[],
    footer: t('resultsPdf.footer'),
    prioritiesHeaders: {
      initiative: t('resultsUI.thInitiative'), area: t('resultsUI.thArea'),
      vector: t('resultsUI.thVector'), recommendation: t('resultsUI.thReco'),
    },
    recoLabels,
    analytics: {
      vectorsTitle: t('resultsAnalytics.vectorsTitle'), vectorsDescription: t('resultsAnalytics.vectorsDescription'),
      vectorsNotice: !results.value_vectors || results.value_vectors.status === 'schema_pending'
        ? t('resultsAnalytics.schemaPending') : results.value_vectors.status === 'mapping_pending'
          ? t('resultsAnalytics.mappingPending', { mapped: results.value_vectors.mapped_questions, total: results.value_vectors.total_questions }) : '',
      unmapped: results.value_vectors?.unmapped_numeric_answers
        ? t('resultsAnalytics.unmapped', { count: results.value_vectors.unmapped_numeric_answers }) : '',
      vectorNames: Object.fromEntries(['eficiencia', 'ingresos', 'experiencia', 'riesgo', 'talento'].map((key, index) =>
        [key, (t('results.vectors', { returnObjects: true }) as string[])[index]])),
      areaNames: Object.fromEntries(Object.entries(areaNames).map(([key, value]) => [key, value.name])),
      matrixTitle: t('resultsAnalytics.matrixTitle'), matrixDescription: t('resultsAnalytics.matrixDescription'),
      coverageRule: t('resultsAnalytics.coverageRule'), boundaryRule: t('resultsAnalytics.boundaryRule'),
      noPoints: t('resultsAnalytics.noPoints'), pendingAreas: t('resultsAnalytics.pendingAreas'),
      coverageColumn: t('resultsAnalytics.coverageColumn'), answersLabel: t('resultsAnalytics.answersLabel'),
      pain: t('resultsAnalytics.pain'), readiness: t('resultsAnalytics.readiness'),
      classification: t('resultsAnalytics.classification'), legend: t('resultsAnalytics.legend'),
      noData: t('resultsAnalytics.noData'),
      quadrants: t('resultsAnalytics.quadrants', { returnObjects: true }) as Record<string, string>,
    },
  };
  return { data: { ...data, results }, labels };
}
