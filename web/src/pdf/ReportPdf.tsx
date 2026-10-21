/**
 * Lazy-loaded PDF actions (preview + download) for the Results page.
 * This module pulls in @react-pdf/renderer (~1.5 MB); it must ONLY be
 * imported via React.lazy so the main bundle stays lean.
 */
import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer';
import { Download, Radar as RadarIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { createReportContent } from './reportI18n';
import { ReportDocument, type ReportData } from '@/pdf/ReportDocument';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface ReportPdfActionsProps {
  data: ReportData;
  fileName: string;
  texts: { preview: string; download: string; loading: string };
}

export default function ReportPdfActions({ data, fileName, texts }: ReportPdfActionsProps) {
  const { i18n } = useTranslation();
  const { data: localizedData, labels } = createReportContent(data, i18n);
  const doc = <ReportDocument data={localizedData} labels={labels} />;
  return (
    <>
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">
            <RadarIcon className="h-4 w-4" /> {texts.preview}
          </Button>
        </DialogTrigger>
        <DialogContent className="h-[85vh] max-w-4xl">
          <DialogHeader>
            <DialogTitle>{texts.preview}</DialogTitle>
          </DialogHeader>
          <PDFViewer key={labels.locale} width="100%" height="100%" showToolbar={false}>
            {doc}
          </PDFViewer>
        </DialogContent>
      </Dialog>
      <PDFDownloadLink key={labels.locale} document={doc} fileName={fileName}>
        {({ loading }) => (
          <Button className="brand-gradient border-0 text-white" disabled={loading}>
            <Download className="h-4 w-4" />
            {loading ? texts.loading : texts.download}
          </Button>
        )}
      </PDFDownloadLink>
    </>
  );
}
