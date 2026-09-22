import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Building2, StickyNote } from 'lucide-react';
import { createConsultantNote, fetchConsultantClient } from '@/api';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

interface PostedNote {
  note_id: string;
  body: string;
  created_at: string;
}

/** Consultant client detail: org snapshot, maturity dimensions, notes. */
export default function ConsultantClient() {
  const { t, i18n } = useTranslation();
  const { clientId } = useParams<{ clientId: string }>();
  const [noteBody, setNoteBody] = useState('');
  const [postedNotes, setPostedNotes] = useState<PostedNote[]>([]);

  const clientQuery = useQuery({
    queryKey: ['consultant', 'client', clientId],
    queryFn: () => fetchConsultantClient(clientId!),
    enabled: !!clientId,
  });

  const noteMutation = useMutation({
    mutationFn: () => createConsultantNote(clientId!, noteBody.trim()),
    onSuccess: (res) => {
      setPostedNotes((prev) => [
        { note_id: res.note_id, body: noteBody.trim(), created_at: res.created_at },
        ...prev,
      ]);
      setNoteBody('');
    },
  });

  const client = clientQuery.data;
  const dateFmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm">
        <Link to="/consultant">
          <ArrowLeft className="h-4 w-4" /> {t('consultant.back')}
        </Link>
      </Button>

      {clientQuery.isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {client && (
        <>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg brand-gradient-soft text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle>{client.name}</CardTitle>
                    <CardDescription>{t('consultant.detail')}</CardDescription>
                  </div>
                </div>
                <Badge variant={client.plan === 'pro' ? 'default' : 'outline'}>
                  {client.plan === 'pro' ? 'Pro' : t('consultant.plans.free')}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">{t('consultant.progressLabel')}</p>
                <div className="mt-1 flex items-center gap-2">
                  <Progress value={client.progress} className="h-2 flex-1" />
                  <span className="text-sm font-semibold">{client.progress}%</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('consultant.maturityLabel')}</p>
                <p className="text-xl font-bold">
                  {client.maturity != null ? `${client.maturity.toFixed(1)} / 5` : '—'}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('common.status')}</p>
                <p className="text-xl font-bold">
                  {t(
                    `consultant.statuses.${
                      client.status === 'in_progress'
                        ? 'inprog'
                        : client.status === 'completed'
                          ? 'done'
                          : client.status === 'lead'
                            ? 'lead'
                            : 'stalled'
                    }`,
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('consultant.dims')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {client.dimensions.map((d) => (
                <div key={d.label}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="font-medium">{d.label}</span>
                    <span className="text-muted-foreground">{d.score.toFixed(1)} / 5</span>
                  </div>
                  <Progress value={(d.score / 5) * 100} className="h-2" />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <StickyNote className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{t('consultant.notesTitle')}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <form
                className="space-y-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (noteBody.trim()) noteMutation.mutate();
                }}
              >
                <Textarea
                  value={noteBody}
                  onChange={(e) => setNoteBody(e.target.value)}
                  placeholder={t('consultant.notePh')}
                  rows={3}
                  aria-label={t('consultant.notePh')}
                />
                <div className="flex justify-end">
                  <Button type="submit" disabled={!noteBody.trim() || noteMutation.isPending}>
                    {noteMutation.isPending ? t('common.loading') : t('consultant.noteSend')}
                  </Button>
                </div>
              </form>
              {noteMutation.isSuccess && (
                <Alert>
                  <AlertDescription>{t('consultant.noteSaved')}</AlertDescription>
                </Alert>
              )}
              {postedNotes.length > 0 && (
                <ul className="space-y-2">
                  {postedNotes.map((n) => (
                    <li key={n.note_id} className="rounded-lg border p-3">
                      <p className="text-sm">{n.body}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {dateFmt.format(new Date(n.created_at))}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">{t('consultant.notesLocalNote')}</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
