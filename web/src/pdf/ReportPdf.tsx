/**
 * Lazy-loaded PDF actions (preview + download) for the Results page.
 * This module pulls in @react-pdf/renderer (~1.5 MB); it must ONLY be
 * imported via React.lazy so the main bundle stays lean.
 */
import { PDFDownloadLink, PDFViewer } from '@react-pdf/renderer';
import { Download, Radar as RadarIcon } from 'lucide-react';
import { ReportDocument, type ReportData, type ReportLabels } from '@/pdf/ReportDocument';
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
  labels: ReportLabels;
  fileName: string;
  texts: { preview: string; download: string; loading: string };
}

export default function ReportPdfActions({ data, labels, fileName, texts }: ReportPdfActionsProps) {
  const doc = <ReportDocument data={data} labels={labels} />;
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
          <PDFViewer width="100%" height="100%" showToolbar={false}>
            {doc}
          </PDFViewer>
        </DialogContent>
      </Dialog>
      <PDFDownloadLink document={doc} fileName={fileName}>
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
