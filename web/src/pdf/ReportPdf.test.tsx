import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import i18n from '@/i18n';
import type { ReportData, ReportLabels } from './ReportDocument';
import ReportPdfActions from './ReportPdf';

vi.mock('./ReportDocument', () => ({ ReportDocument: () => null }));
vi.mock('@react-pdf/renderer', () => ({
  PDFViewer: () => null,
  PDFDownloadLink: ({ document, children }: {
    document: ReactElement<{ data: ReportData; labels: ReportLabels }>;
    children: (state: { loading: boolean }) => ReactNode;
  }) => <div><pre data-testid="pdf-content">{JSON.stringify(document.props)}</pre>{children({ loading: false })}</div>,
}));

describe('PDF download language wiring', () => {
  it('passes translated data to ReportDocument after changing UI language with unchanged API results', async () => {
    await i18n.changeLanguage('es');
    const data: ReportData = { orgName: 'Compañía Müller', results: {
      maturity: { average: 3.8, level: 'Gestionado', dimensions: [{ key: 'datos', label: 'Datos', score: 3.8 }] },
      heatmap: { vectors: ['Bloque A'], areas: [{ name: 'Ventas B2B', row: [4] }] }, priorities: [],
    } };
    render(<ReportPdfActions data={data} fileName="test.pdf" texts={{ preview: 'Preview', download: 'Download', loading: 'Loading' }} />);
    for (const [lang, level, dimension, block] of [
      ['es', 'Gestionado', 'Datos', 'Bloque A'], ['en', 'Managed', 'Data', 'Block A'],
      ['de', 'Gesteuert', 'Daten', 'Block A'], ['pt', 'Gerenciado', 'Dados', 'Bloco A'],
    ]) {
      await act(async () => { await i18n.changeLanguage(lang); });
      const props = JSON.parse(screen.getByTestId('pdf-content').textContent!) as { data: ReportData; labels: ReportLabels };
      expect(props.labels.locale).toBe(lang);
      expect(props.data.results.maturity.level).toBe(level);
      expect(props.data.results.maturity.dimensions[0].label).toBe(dimension);
      expect(props.data.results.heatmap.vectors[0]).toBe(block);
      expect(props.data.results.maturity.average).toBe(3.8);
      expect(props.data.orgName).toBe('Compañía Müller');
    }
    expect(data.results.maturity.level).toBe('Gestionado');
    await act(async () => { await i18n.changeLanguage('es'); });
  });
});
