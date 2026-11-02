import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck2, CheckCircle2, Lock, Star, UserRound } from 'lucide-react';
import { ApiError } from '@/api/client';
import { createReview, fetchReview, fetchReviews, submitReviewRating } from '@/api';
import type { ReviewOut } from '@/api/types';
import { isRatingComplete } from '@/lib/reviewRating';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useAssessment } from '@/store/assessmentStore';
import { useAuthStore } from '@/store/authStore';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

const ratedKey = (reviewId: string) => `tryaigap.rated.${reviewId}`;

function ScorePicker({
  value,
  onChange,
  labels,
  idPrefix,
}: {
  value: number | null;
  onChange: (v: number) => void;
  labels: string[];
  idPrefix: string;
}) {
  return (
    <div className="flex gap-1" role="radiogroup">
      {[1, 2, 3, 4, 5].map((v) => (
        <button
          key={v}
          id={`${idPrefix}-${v}`}
          type="button"
          role="radio"
          aria-checked={value === v}
          aria-label={`${v} — ${labels[v - 1] ?? ''}`}
          onClick={() => onChange(v)}
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-md border text-sm font-semibold transition-colors',
            value === v
              ? 'border-primary bg-primary text-primary-foreground'
              : 'hover:border-primary/60',
          )}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function ReviewStatus({ review, onRated }: { review: ReviewOut; onRated: (avg: number) => void }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const stages = t('review.stages', { returnObjects: true }) as string[];
  const scaleLabels = t('evaluation.labels', { returnObjects: true }) as string[];

  const alreadyRated = localStorage.getItem(ratedKey(review.review_id)) !== null;
  const [ratingOpen, setRatingOpen] = useState(false);
  const [knowledge, setKnowledge] = useState<number | null>(null);
  const [friendliness, setFriendliness] = useState<number | null>(null);
  const [methodology, setMethodology] = useState<number | null>(null);
  const [comments, setComments] = useState('');
  const [ratingError, setRatingError] = useState(false);
  const [ratedAvg, setRatedAvg] = useState<number | null>(null);

  const currentStage = review.stage >= 2 ? 2 : review.stage >= 1 ? 1 : 0;
  const validatedCount = review.chapters.filter((c) => c.validated).length;

  const ratingMutation = useMutation({
    mutationFn: () =>
      submitReviewRating(review.review_id, {
        chapter_key: 'overall',
        knowledge,
        friendliness,
        methodology,
        comments: comments.trim() || null,
      }),
    onSuccess: (res) => {
      localStorage.setItem(ratedKey(review.review_id), String(res.average));
      setRatedAvg(res.average);
      setRatingOpen(false);
      onRated(res.average);
      void queryClient.invalidateQueries({ queryKey: ['review'] });
    },
    onError: () => setRatingError(true),
  });

  const dateFmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });
  const storedAvg = Number(localStorage.getItem(ratedKey(review.review_id)) ?? Number.NaN);

  return (
    <>
      {/* Stage stepper */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('review.status')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-wrap items-center gap-2">
            {stages.map((label, i) => (
              <li key={label} className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm',
                    i <= currentStage
                      ? 'border-primary bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground',
                  )}
                >
                  {i <= currentStage && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {label}
                </span>
                {i < stages.length - 1 && <span className="text-muted-foreground">→</span>}
              </li>
            ))}
          </ol>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <UserRound className="h-4 w-4" />
            {t('review.consultantLabel')}:{' '}
            <span className="font-medium text-foreground">
              {review.consultant ?? t('review.pendingAssign')}
            </span>
          </p>
        </CardContent>
      </Card>

      {/* Chapters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('review.chapters')}</CardTitle>
          <CardDescription>{t('review.validatedSub')}</CardDescription>
        </CardHeader>
        <CardContent>
          {review.chapters.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('review.noChapters')}</p>
          ) : (
            <ul className="space-y-3">
              {review.chapters.map((c) => (
                <li key={c.chapter_key} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{c.chapter_key}</span>
                    <Badge variant={c.validated ? 'default' : 'secondary'}>
                      {c.validated ? t('review.validatedChip') : t('review.pendingChip')}
                    </Badge>
                  </div>
                  {c.note && <p className="mt-1 text-sm text-muted-foreground">{c.note}</p>}
                  {c.validated_at && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('review.validatedOn')} {dateFmt.format(new Date(c.validated_at))}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {review.chapters.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {validatedCount}/{review.chapters.length} · {t('review.validatedTitle')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Rating */}
      {currentStage === 2 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">{t('evaluation.title')}</CardTitle>
            </div>
            <CardDescription>{t('evaluation.sub')}</CardDescription>
          </CardHeader>
          <CardContent>
            {alreadyRated || ratedAvg !== null ? (
              <Alert>
                <AlertTitle>{t('evaluation.successTitle')}</AlertTitle>
                <AlertDescription>
                  {t('evaluation.successSub')}{' '}
                  {t('review.avgRating', { n: ratedAvg ?? storedAvg })}
                </AlertDescription>
              </Alert>
            ) : ratingOpen ? (
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  setRatingError(false);
                  ratingMutation.mutate();
                }}
              >
                <div>
                  <Label>{t('evaluation.q1Title')}</Label>
                  <p className="mb-2 text-xs text-muted-foreground">{t('evaluation.q1Desc')}</p>
                  <ScorePicker
                    value={knowledge}
                    onChange={setKnowledge}
                    labels={scaleLabels}
                    idPrefix="q1"
                  />
                </div>
                <div>
                  <Label>{t('evaluation.q2Title')}</Label>
                  <p className="mb-2 text-xs text-muted-foreground">{t('evaluation.q2Desc')}</p>
                  <ScorePicker
                    value={friendliness}
                    onChange={setFriendliness}
                    labels={scaleLabels}
                    idPrefix="q2"
                  />
                </div>
                <div>
                  <Label>{t('evaluation.q3Title')}</Label>
                  <p className="mb-2 text-xs text-muted-foreground">{t('evaluation.q3Desc')}</p>
                  <ScorePicker
                    value={methodology}
                    onChange={setMethodology}
                    labels={scaleLabels}
                    idPrefix="q3"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rating-comments">{t('evaluation.q4Title')}</Label>
                  <Textarea
                    id="rating-comments"
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    placeholder={t('evaluation.q4Ph')}
                    rows={3}
                  />
                </div>
                {!isRatingComplete({ knowledge, friendliness, methodology }) && (
                  <p className="text-sm text-muted-foreground">{t('evaluation.missing')}</p>
                )}
                {ratingError && (
                  <Alert variant="destructive">
                    <AlertDescription>{t('common.errorGeneric')}</AlertDescription>
                  </Alert>
                )}
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setRatingOpen(false)}>
                    {t('evaluation.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      !isRatingComplete({ knowledge, friendliness, methodology }) ||
                      ratingMutation.isPending
                    }
                  >
                    {ratingMutation.isPending ? t('common.loading') : t('evaluation.save')}
                  </Button>
                </div>
              </form>
            ) : (
              <Button onClick={() => setRatingOpen(true)}>
                <Star className="h-4 w-4" /> {t('review.rateCta')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

/** Review history is discovered from the server; selection is scoped to the assessment. */
export default function Review() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const userId = useAuthStore(state => state.user?.id);
  const { assessment, status: assessmentStatus, reload } = useAssessment();
  const [mode, setMode] = useState<'sync' | 'async'>('async');
  const [selection, setSelection] = useState<{ assessmentId: string; reviewId: string } | null>(null);
  const [requestError, setRequestError] = useState<{ assessmentId: string; kind: 'paywall' | 'conflict' | 'generic' | 'forbidden' | 'missing' } | null>(null);

  useEffect(() => {
    if (assessmentStatus === 'idle') void reload();
  }, [assessmentStatus, reload]);

  const listQuery = useQuery({
    queryKey: ['reviews', userId, assessment?.id],
    queryFn: () => fetchReviews(assessment!.id),
    enabled: !!assessment,
    retry: 0,
    staleTime: 0,
    refetchInterval: query => query.state.status === 'success' && query.state.data?.items.some(item => item.stage < 2) ? 5000 : false,
  });
  const listAuthorized = listQuery.isSuccess && listQuery.isFetchedAfterMount;
  const items = listAuthorized ? listQuery.data.items : [];
  const selectedId = selection?.assessmentId === assessment?.id ? selection?.reviewId : undefined;
  const selected = items.find(item => item.review_id === selectedId);
  const reviewId = selected?.review_id ?? items[0]?.review_id;
  const reviewQuery = useQuery({
    queryKey: ['review', userId, assessment?.id, reviewId],
    queryFn: () => fetchReview(reviewId!),
    enabled: !!reviewId && listAuthorized,
    retry: 0,
    staleTime: 0,
    refetchInterval: query => query.state.status === 'success' && (query.state.data?.stage ?? 2) < 2 ? 5000 : false,
  });

  const createMutation = useMutation({
    mutationFn: (request: { assessmentId: string; mode: 'sync' | 'async' }) =>
      createReview({ assessment_id: request.assessmentId, mode: request.mode }),
    onSuccess: (res, request) => {
      setSelection({ assessmentId: request.assessmentId, reviewId: res.review_id });
      setRequestError(null);
      void queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
    onError: (error, request) => {
      const kind = error instanceof ApiError && error.status === 402 ? 'paywall'
        : error instanceof ApiError && error.status === 403 ? 'forbidden'
        : error instanceof ApiError && error.status === 404 ? 'missing'
        : error instanceof ApiError && error.code === 'REVIEW_ALREADY_REQUESTED' ? 'conflict' : 'generic';
      setRequestError({ assessmentId: request.assessmentId, kind });
      if (kind === 'conflict') void queryClient.invalidateQueries({ queryKey: ['reviews'] });
    },
  });

  const errorText = (error: unknown) => t(error instanceof ApiError && error.status === 403 ? 'reviewHistory.forbidden'
    : error instanceof ApiError && error.status === 404 ? 'reviewHistory.notFound' : 'reviewHistory.error');
  const stages = t('review.stages', { returnObjects: true }) as string[];
  const dateFmt = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  const requestKind = requestError?.assessmentId === assessment?.id ? requestError?.kind : null;
  const active = items.some(item => item.stage < 2);
  const review = listAuthorized && reviewQuery.isSuccess && reviewQuery.data.review_id === reviewId ? reviewQuery.data : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t('review.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('review.sub')}</p>
      </div>

      {(assessmentStatus === 'idle' || assessmentStatus === 'loading' || listQuery.isLoading || (!!assessment && !listQuery.isFetchedAfterMount && !listQuery.isError)) &&
        <div role="status" aria-label={t('reviewHistory.loading')}><Skeleton className="h-40 w-full" /></div>}
      {assessmentStatus === 'error' && <Alert variant="destructive">
        <AlertDescription>{t('reviewHistory.error')} <Button variant="outline" size="sm" onClick={() => void reload()}>{t('reviewHistory.retry')}</Button></AlertDescription>
      </Alert>}
      {!assessment && assessmentStatus === 'missing' && <Alert>
        <AlertDescription>{t('common.noAssessment')} <Button asChild variant="outline" size="sm"><Link to="/onboarding">{t('common.startDiagnostic')}</Link></Button></AlertDescription>
      </Alert>}
      {listQuery.isError && <Alert variant="destructive">
        <AlertDescription>{errorText(listQuery.error)} <Button variant="outline" size="sm" onClick={() => void listQuery.refetch()}>{t('reviewHistory.retry')}</Button></AlertDescription>
      </Alert>}

      {listAuthorized && <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">{t('reviewHistory.title')}</CardTitle>
            <Button variant="outline" size="sm" disabled={listQuery.isFetching} onClick={() => void listQuery.refetch()}>{t('reviewHistory.refresh')}</Button>
          </div>
          <CardDescription>{t('reviewHistory.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? <p className="text-sm text-muted-foreground">{t('reviewHistory.empty')}</p> : <Table>
            <TableHeader><TableRow>
              <TableHead>{t('reviewHistory.date')}</TableHead><TableHead>{t('reviewHistory.mode')}</TableHead>
              <TableHead>{t('reviewHistory.stage')}</TableHead><TableHead>{t('review.consultantLabel')}</TableHead>
              <TableHead>{t('reviewHistory.detail')}</TableHead>
            </TableRow></TableHeader>
            <TableBody>{items.map(item => <TableRow key={item.review_id}>
              <TableCell>{dateFmt.format(new Date(item.created_at))}</TableCell>
              <TableCell>{item.mode === 'sync' || item.mode === 'async' ? t(`review.modes.${item.mode}`) : t('reviewHistory.unknown')}</TableCell>
              <TableCell><Badge variant="secondary">{stages[item.stage] ?? t('reviewHistory.unknown')}</Badge></TableCell>
              <TableCell>{item.consultant ?? t('review.pendingAssign')}</TableCell>
              <TableCell><Button variant={item.review_id === reviewId ? 'secondary' : 'outline'} size="sm"
                aria-pressed={item.review_id === reviewId} onClick={() => setSelection({ assessmentId: assessment!.id, reviewId: item.review_id })}>
                {t('reviewHistory.open')}
              </Button></TableCell>
            </TableRow>)}</TableBody>
          </Table>}
        </CardContent>
      </Card>}

      {requestKind === 'conflict' && <Alert><AlertDescription>{t('review.requestedInfo')}</AlertDescription></Alert>}
      {requestKind === 'paywall' && <Alert><Lock className="h-4 w-4" /><AlertDescription>{t('review.needPro')}{' '}
        <Button asChild variant="outline" size="sm"><Link to="/estimator">{t('common.upgrade')}</Link></Button>
      </AlertDescription></Alert>}
      {(requestKind === 'generic' || requestKind === 'forbidden' || requestKind === 'missing') && <Alert variant="destructive">
        <AlertDescription>{t(requestKind === 'forbidden' ? 'reviewHistory.forbidden' : requestKind === 'missing' ? 'reviewHistory.notFound' : 'reviewHistory.error')}</AlertDescription>
      </Alert>}

      {listAuthorized && !active && assessment && <Card>
        <CardHeader>
          <div className="flex items-center gap-2"><CalendarCheck2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t('review.requestTitle')}</CardTitle>
          </div>
          <CardDescription>{t('review.modeLabel')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <RadioGroup value={mode} onValueChange={value => setMode(value as 'sync' | 'async')}>
            {(['async', 'sync'] as const).map(value => <div key={value} className="flex items-start gap-3 rounded-lg border p-3">
              <RadioGroupItem value={value} id={`mode-${value}`} className="mt-0.5" />
              <div><Label htmlFor={`mode-${value}`} className="font-medium">{t(`review.modes.${value}`)}</Label>
                <p className="text-sm text-muted-foreground">{t(`review.modesDesc.${value}`)}</p>
              </div>
            </div>)}
          </RadioGroup>
          <Button className="brand-gradient border-0 text-white" disabled={createMutation.isPending}
            onClick={() => createMutation.mutate({ assessmentId: assessment.id, mode })}>
            {createMutation.isPending ? t('common.loading') : t('review.requestCta')}
          </Button>
        </CardContent>
      </Card>}

      {reviewId && listAuthorized && reviewQuery.isLoading && <div role="status" aria-label={t('reviewHistory.loadingDetail')}><Skeleton className="h-40 w-full" /></div>}
      {reviewId && listAuthorized && reviewQuery.isError && <Alert variant="destructive">
        <AlertDescription>{errorText(reviewQuery.error)} <Button variant="outline" size="sm" onClick={() => void reviewQuery.refetch()}>{t('reviewHistory.retry')}</Button></AlertDescription>
      </Alert>}
      {review && assessment && <ReviewStatus key={`${assessment.id}:${review.review_id}`} review={review} onRated={() => undefined} />}
    </div>
  );
}
