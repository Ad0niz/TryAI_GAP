import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Eye,
  File as FileIcon,
  FileImage,
  FileSpreadsheet,
  FileText,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { ApiError } from '@/api/client';
import { deleteDocument, downloadDocument, fetchAreas, fetchDocuments, uploadDocument } from '@/api';
import type { DocumentListItem } from '@/api/types';
import {
  ACCEPT_ATTR,
  documentKind,
  exceedsBackendCap,
  formatBytes,
  validateDocumentFile,
} from '@/lib/documents';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAssessment } from '@/store/assessmentStore';
import { cn } from '@/lib/utils';

const KIND_ICONS = {
  pdf: FileText,
  doc: FileText,
  sheet: FileSpreadsheet,
  image: FileImage,
  other: FileIcon,
} as const;

interface UploadNotice {
  kind: 'error' | 'info';
  text: string;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Evidence manager: drag&drop upload, filterable paged list, download, delete. */
export default function Documents() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { assessment, status: assessmentStatus, reload } = useAssessment();

  const [page, setPage] = useState(1);
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [linkArea, setLinkArea] = useState<string>('none');
  const [dragOver, setDragOver] = useState(false);
  const [notices, setNotices] = useState<UploadNotice[]>([]);
  const [uploading, setUploading] = useState<string[]>([]);
  const [toDelete, setToDelete] = useState<DocumentListItem | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  if (assessmentStatus === 'idle') void reload();

  const areasQuery = useQuery({
    queryKey: ['areas', assessment?.id],
    queryFn: () => fetchAreas(assessment!.id),
    enabled: !!assessment,
  });
  const areas = useMemo(() => areasQuery.data?.items ?? [], [areasQuery.data]);

  const docsQuery = useQuery({
    queryKey: ['documents', page, areaFilter],
    queryFn: () =>
      fetchDocuments(page, areaFilter !== 'all' ? { areaKey: areaFilter } : {}),
  });

  const areaName = useMemo(() => {
    const map = new Map(areas.map((a) => [a.area_key, a.name]));
    return (key?: string | null) => (key ? (map.get(key) ?? key) : null);
  }, [areas]);

  function pushNotice(notice: UploadNotice) {
    setNotices((prev) => [...prev.slice(-4), notice]);
  }

  async function handleFiles(files: FileList | File[]) {
    if (!assessment) {
      pushNotice({ kind: 'error', text: t('documents.needAssessment') });
      return;
    }
    for (const file of Array.from(files)) {
      const validation = validateDocumentFile(file);
      if (!validation.ok) {
        pushNotice({
          kind: 'error',
          text:
            validation.error === 'too_large'
              ? t('documents.errTooLarge', { name: file.name })
              : t('documents.errType', { name: file.name }),
        });
        continue;
      }
      if (exceedsBackendCap(file.size)) {
        pushNotice({ kind: 'error', text: `${file.name}: ${t('documents.errBackendCap')}` });
        continue;
      }
      setUploading((prev) => [...prev, file.name]);
      try {
        await uploadDocument(file, {
          assessmentId: assessment.id,
          areaKey: linkArea !== 'none' ? linkArea : undefined,
        });
        pushNotice({ kind: 'info', text: t('documents.uploadDone', { name: file.name }) });
        void queryClient.invalidateQueries({ queryKey: ['documents'] });
      } catch (e) {
        const msg =
          e instanceof ApiError && e.status === 413
            ? t('documents.errBackendCap')
            : e instanceof ApiError && e.status === 415
              ? t('documents.errType', { name: file.name })
              : t('documents.uploadFailed', { name: file.name });
        pushNotice({ kind: 'error', text: msg });
      } finally {
        setUploading((prev) => prev.filter((n) => n !== file.name));
      }
    }
  }

  async function handleDownload(doc: DocumentListItem, preview: boolean) {
    try {
      const blob = await downloadDocument(doc.id);
      if (preview) {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        saveBlob(blob, doc.filename);
      }
    } catch {
      pushNotice({ kind: 'error', text: t('documents.errDownload') });
    }
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDocument(id),
    onSuccess: () => {
      setToDelete(null);
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: () => pushNotice({ kind: 'error', text: t('common.errorGeneric') }),
  });

  const meta = docsQuery.data?.meta;
  const docs = docsQuery.data?.items ?? [];
  const dateFmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('documents.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('documents.sub')}</p>
      </div>

      {/* Upload zone */}
      <Card>
        <CardContent className="space-y-4 p-6">
          <div
            role="button"
            tabIndex={0}
            aria-label={t('documents.drop')}
            onClick={() => fileInput.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInput.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              void handleFiles(e.dataTransfer.files);
            }}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors',
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50',
            )}
          >
            <UploadCloud className="h-8 w-8 text-primary" />
            <p className="font-medium">{t('documents.drop')}</p>
            <p className="text-xs text-muted-foreground">{t('documents.formats')}</p>
            <input
              ref={fileInput}
              type="file"
              multiple
              accept={ACCEPT_ATTR}
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void handleFiles(e.target.files);
                e.target.value = '';
              }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Select value={linkArea} onValueChange={setLinkArea}>
              <SelectTrigger className="w-64" aria-label={t('documents.selectArea')}>
                <SelectValue placeholder={t('documents.selectArea')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('documents.noArea')}</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a.area_key} value={a.area_key}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => fileInput.current?.click()}>
              <UploadCloud className="h-4 w-4" /> {t('documents.uploadCta')}
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">{t('documents.devNote')}</p>

          {uploading.map((name) => (
            <Alert key={name}>
              <AlertDescription>{t('documents.uploading', { name })}</AlertDescription>
            </Alert>
          ))}
          {notices.map((n, i) => (
            <Alert key={`${n.text}-${i}`} variant={n.kind === 'error' ? 'destructive' : 'default'}>
              <AlertDescription>{n.text}</AlertDescription>
            </Alert>
          ))}
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">{t('documents.title')}</CardTitle>
          <Select
            value={areaFilter}
            onValueChange={(v) => {
              setAreaFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48" aria-label={t('documents.colArea')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('areas.filterAll')}</SelectItem>
              {areas.map((a) => (
                <SelectItem key={a.area_key} value={a.area_key}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {docsQuery.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : docsQuery.isError ? (
            <Alert variant="destructive">
              <AlertTitle>{t('common.errorGeneric')}</AlertTitle>
              <AlertDescription>
                <Button variant="outline" size="sm" onClick={() => void docsQuery.refetch()}>
                  {t('common.retry')}
                </Button>
              </AlertDescription>
            </Alert>
          ) : docs.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileIcon />
                </EmptyMedia>
                <EmptyTitle>{t('documents.empty')}</EmptyTitle>
                <EmptyDescription>{t('documents.emptySub')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('documents.colName')}</TableHead>
                    <TableHead>{t('documents.colSize')}</TableHead>
                    <TableHead>{t('documents.colArea')}</TableHead>
                    <TableHead>{t('documents.colBy')}</TableHead>
                    <TableHead>{t('documents.colDate')}</TableHead>
                    <TableHead className="text-right">{t('documents.colActions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {docs.map((doc) => {
                    const Icon = KIND_ICONS[documentKind(doc.mime_type)];
                    const area = areaName(doc.area_key);
                    const previewable =
                      doc.mime_type === 'application/pdf' || doc.mime_type.startsWith('image/');
                    return (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4 shrink-0 text-primary" />
                            <span className="max-w-64 truncate font-medium" title={doc.filename}>
                              {doc.filename}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatBytes(doc.size_bytes)}
                        </TableCell>
                        <TableCell>
                          {area ? <Badge variant="secondary">{area}</Badge> : '—'}
                        </TableCell>
                        <TableCell>{doc.uploaded_by_name ?? '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {doc.created_at ? dateFmt.format(new Date(doc.created_at)) : '—'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {previewable && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={t('documents.preview')}
                                onClick={() => void handleDownload(doc, true)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t('documents.download')}
                              onClick={() => void handleDownload(doc, false)}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={t('documents.del')}
                              onClick={() => setToDelete(doc)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {meta && meta.total_pages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {t('common.pageInfo', { page: meta.page, pages: meta.total_pages })}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      {t('common.prev')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= meta.total_pages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      {t('common.nextPage')}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {assessmentStatus === 'missing' && (
        <Alert>
          <AlertDescription>
            {t('documents.needAssessment')}{' '}
            <Button asChild variant="outline" size="sm" className="ml-2">
              <Link to="/onboarding">{t('common.startDiagnostic')}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('documents.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('documents.deleteBody', { name: toDelete?.filename ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && deleteMutation.mutate(toDelete.id)}
              disabled={deleteMutation.isPending}
            >
              {t('documents.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
