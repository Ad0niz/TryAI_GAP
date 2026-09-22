/**
 * Questionnaire engine shared by the maturity diagnostic and the area kits.
 * Flow per wireframe-v2.html: question → block summary → module summary,
 * 1-5 scale + "No sé" + per-question delegation, debounced autosave,
 * freemium gating on the free plan (maturity module only).
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Lock,
  Paperclip,
  UserPlus,
} from 'lucide-react';
import { fetchQuestionnaire } from '@/api';
import type { QuestionnaireOut } from '@/api/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { DelegateDialog } from '@/components/questionnaire/DelegateDialog';
import { MaturityRadar } from '@/components/questionnaire/MaturityRadar';
import { useQuestionnaireAnswers } from '@/hooks/useQuestionnaireAnswers';
import {
  averageScore,
  countAnswered,
  levelIndex,
  type AnswersMap,
} from '@/lib/answers';
import {
  canAnswerQuestion,
  FREE_MATURITY_LIMIT,
  freeMaturityLimitReached,
} from '@/lib/planGate';
import { useAssessmentStore } from '@/store/assessmentStore';
import { cn } from '@/lib/utils';

interface UiQuestion {
  id: string;
  code: string;
  text: string;
}

interface UiBlock {
  id: string;
  title: string;
  dim: string;
  questions: UiQuestion[];
}

interface QbankQuestion {
  id: string;
  text: string;
}

interface QbankBlock {
  id: string;
  title: string;
  dim?: string;
  questions: QbankQuestion[];
}

interface QbankModule {
  moduleLabel?: string;
  blocks: QbankBlock[];
}

type View = 'question' | 'block' | 'module';

interface QuestionnaireEngineProps {
  module: 'maturity' | 'area';
  areaKey?: string;
  moduleLabel: string;
}

export function QuestionnaireEngine({ module, areaKey, moduleLabel }: QuestionnaireEngineProps) {
  const { t, i18n } = useTranslation();
  const { t: tq } = useTranslation('qbank');
  const navigate = useNavigate();
  const assessment = useAssessmentStore((s) => s.assessment);

  const [blockIdx, setBlockIdx] = useState(0);
  const [qIdx, setQIdx] = useState(0);
  const [view, setView] = useState<View>('question');
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [delegatedNames, setDelegatedNames] = useState<Record<string, string>>({});

  const qQuery = useQuery<QuestionnaireOut>({
    queryKey: ['questionnaire', module, areaKey ?? null, i18n.language],
    queryFn: () => fetchQuestionnaire(module, areaKey),
  });

  const {
    answers,
    setAnswer,
    saveStatus,
    saveNow,
    paywallHit,
    loading: answersLoading,
  } = useQuestionnaireAnswers(assessment?.id, { module, areaKey });

  /** API questionnaire overlaid with qbank copy (full 4-locale coverage). */
  const blocks = useMemo<UiBlock[]>(() => {
    if (!qQuery.data) return [];
    const bankRaw: unknown =
      module === 'maturity' ? tq('maturity') : tq(`areas.${areaKey ?? ''}`);
    let bankBlocks: QbankBlock[] = [];
    if (module === 'maturity') {
      const m = bankRaw as QbankModule;
      if (m && typeof m === 'object' && Array.isArray(m.blocks)) bankBlocks = m.blocks;
    } else if (Array.isArray(bankRaw)) {
      bankBlocks = bankRaw as QbankBlock[];
    }
    return qQuery.data.blocks.map((b, bi) => {
      const qb = bankBlocks[bi];
      return {
        id: b.id,
        title: qb?.title ?? b.title ?? b.id,
        dim: qb?.dim ?? b.dimension ?? qb?.title ?? b.title ?? b.id,
        questions: b.questions.map((q) => ({
          id: q.id,
          code: q.code,
          text: qb?.questions?.find((x) => x.id === q.code)?.text ?? q.text ?? '',
        })),
      };
    });
  }, [qQuery.data, module, areaKey, tq]);

  const allQids = useMemo(() => blocks.flatMap((b) => b.questions.map((q) => q.id)), [blocks]);
  const total = allQids.length;
  const answered = countAnswered(answers, allQids);
  const plan = assessment?.plan ?? 'free';
  const isFreeMaturity = module === 'maturity' && plan === 'free';
  const limitReached = isFreeMaturity && freeMaturityLimitReached(plan, answered);

  if (qQuery.isLoading || answersLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  if (qQuery.error || blocks.length === 0) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{t('common.errorGeneric')}</AlertDescription>
      </Alert>
    );
  }

  const block = blocks[Math.min(blockIdx, blocks.length - 1)];
  const question = block.questions[Math.min(qIdx, block.questions.length - 1)];
  const stored = question ? answers[question.id] : undefined;

  function ordinal(): number {
    let ord = 0;
    for (let i = 0; i < blockIdx; i++) ord += blocks[i].questions.length;
    return ord + qIdx + 1;
  }

  function guardFree(q: UiQuestion): boolean {
    if (!isFreeMaturity) return true;
    if (canAnswerQuestion(plan, answered, !!answers[q.id])) return true;
    setPaywallOpen(true);
    return false;
  }

  function handleScale(v: number) {
    if (!question || !guardFree(question)) return;
    setAnswer(question.id, { value: v, state: 'answered' });
  }

  function handleIdk() {
    if (!question || !guardFree(question)) return;
    setAnswer(question.id, { value: null, state: 'idk' });
  }

  function handleDelegated(name: string) {
    if (!question) return;
    setDelegatedNames((m) => ({ ...m, [question.id]: name }));
    setAnswer(question.id, { value: null, state: 'delegated' });
  }

  function goPrev() {
    if (view === 'block') {
      setView('question');
      return;
    }
    if (view === 'module') {
      setBlockIdx(blocks.length - 1);
      setQIdx(blocks[blocks.length - 1].questions.length - 1);
      setView('question');
      return;
    }
    if (qIdx > 0) setQIdx(qIdx - 1);
    else if (blockIdx > 0) {
      setBlockIdx(blockIdx - 1);
      setQIdx(blocks[blockIdx - 1].questions.length - 1);
    }
  }

  function goNext() {
    if (qIdx < block.questions.length - 1) {
      setQIdx(qIdx + 1);
    } else {
      void saveNow();
      setView('block');
    }
  }

  function continueFromBlock() {
    if (blockIdx >= blocks.length - 1) {
      setView('module');
    } else {
      setBlockIdx(blockIdx + 1);
      setQIdx(0);
      setView('question');
    }
  }

  function gotoBlock(i: number) {
    setBlockIdx(i);
    setQIdx(0);
    setView('question');
  }

  const levels = t('questionnaire.levels', { returnObjects: true }) as string[];
  const levelLabel = (score: number) =>
    Array.isArray(levels) ? levels[levelIndex(score)] : '';

  const saveIndicator =
    saveStatus === 'saving'
      ? t('questionnaire.saving')
      : saveStatus === 'saved'
        ? t('questionnaire.saved')
        : saveStatus === 'error'
          ? t('questionnaire.saveError')
          : null;

  return (
    <div className="space-y-4">
      {/* Freemium banner (maturity, free plan) */}
      {isFreeMaturity && (
        <Card className="border-dashed border-primary">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{t('freemium.chip')}</Badge>
              <span className="text-xs text-muted-foreground">
                {Math.min(answered, FREE_MATURITY_LIMIT)}/{FREE_MATURITY_LIMIT}{' '}
                {t('freemium.counter')}
              </span>
            </div>
            <Button asChild size="sm" className="brand-gradient border-0 text-white">
              <Link to="/estimator">
                <Lock className="h-3.5 w-3.5" /> {t('freemium.upgrade')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Paywall alert (limit hit interactively or by the server) */}
      {(paywallOpen || paywallHit || (limitReached && view === 'question' && !stored)) && (
        <Alert className="border-primary">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm">
              <span className="font-semibold">{t('paywall.eyebrow')}. </span>
              {t('freemium.limitReached', { limit: FREE_MATURITY_LIMIT })}
            </span>
            <Button asChild size="sm" className="brand-gradient border-0 text-white">
              <Link to="/estimator">{t('paywall.cta')}</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Block chips with per-block scores */}
      <div className="flex flex-wrap gap-1.5">
        {blocks.map((b, i) => {
          const s = averageScore(answers, b.questions.map((q) => q.id));
          const current = i === blockIdx && view === 'question';
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => gotoBlock(i)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                current ? 'border-primary bg-accent/20 text-primary' : 'hover:bg-accent/10',
              )}
            >
              <span className={cn('h-1.5 w-1.5 rounded-full', current ? 'bg-primary' : 'bg-muted-foreground/50')} />
              {b.dim} · {s ? s.toFixed(1) : '—'}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setView('module')}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
            view === 'module' ? 'border-primary bg-accent/20 text-primary' : 'hover:bg-accent/10',
          )}
        >
          {t('maturity.viewSummary')}
        </button>
      </div>

      {view === 'question' && question && (
        <Card>
          <CardContent className="p-6 md:p-8">
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {moduleLabel} · {block.title}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('questionnaire.progress', { n: ordinal(), t: total })}
              </p>
            </div>
            <Progress value={(ordinal() / total) * 100} className="mt-2 h-1.5" />

            <h2 className="mt-6 text-lg font-semibold leading-7">{question.text}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t('questionnaire.scaleHelp')}</p>

            <div className="mt-5 grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => handleScale(v)}
                  aria-pressed={stored?.state === 'answered' && stored.value === v}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-md border py-3 transition-colors',
                    stored?.state === 'answered' && stored.value === v
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'hover:border-primary/60 hover:bg-accent/10',
                  )}
                >
                  <span className="text-lg font-bold">{v}</span>
                  <span className="px-1 text-center text-[10px] leading-tight opacity-80">
                    {(t('questionnaire.scale', { returnObjects: true }) as string[])[v - 1]}
                  </span>
                </button>
              ))}
            </div>

            {stored?.state === 'idk' && (
              <Badge variant="secondary" className="mt-3">
                {t('questionnaire.idkMarked')}
              </Badge>
            )}
            {stored?.state === 'delegated' && (
              <Badge variant="secondary" className="mt-3">
                {t('questionnaire.delegatedTo', {
                  name: delegatedNames[question.id] ?? '—',
                })}
              </Badge>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/documents">
                  <Paperclip className="h-3.5 w-3.5" /> {t('questionnaire.attach')}
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (guardFree(question)) setDelegateOpen(true);
                }}
              >
                <UserPlus className="h-3.5 w-3.5" /> {t('questionnaire.delegate')}
              </Button>
              <Button variant="ghost" size="sm" onClick={handleIdk}>
                {t('questionnaire.idk')}
              </Button>
            </div>

            <div className="mt-6 flex items-center justify-between border-t pt-4">
              <Button
                variant="ghost"
                onClick={goPrev}
                disabled={blockIdx === 0 && qIdx === 0}
              >
                <ArrowLeft className="h-4 w-4" /> {t('questionnaire.back')}
              </Button>
              <div className="flex items-center gap-3">
                {saveIndicator && (
                  <span
                    className={cn(
                      'text-xs',
                      saveStatus === 'error' ? 'text-destructive' : 'text-muted-foreground',
                    )}
                  >
                    {saveIndicator}
                  </span>
                )}
                <Button variant="outline" onClick={() => navigate('/dashboard')}>
                  {t('questionnaire.saveExit')}
                </Button>
                <Button
                  onClick={goNext}
                  disabled={!stored}
                  className="brand-gradient border-0 text-white"
                >
                  {t('questionnaire.next')} <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {view === 'block' && (
        <BlockSummary
          block={block}
          answers={answers}
          levelLabel={levelLabel}
          isLast={blockIdx >= blocks.length - 1}
          onEdit={goPrev}
          onContinue={continueFromBlock}
        />
      )}

      {view === 'module' && (
        <ModuleSummary
          module={module}
          moduleLabel={moduleLabel}
          blocks={blocks}
          answers={answers}
          levelLabel={levelLabel}
          onReview={goPrev}
        />
      )}

      {question && assessment && (
        <DelegateDialog
          open={delegateOpen}
          onOpenChange={setDelegateOpen}
          assessmentId={assessment.id}
          questionId={question.id}
          onSent={handleDelegated}
        />
      )}
    </div>
  );
}

function BlockSummary({
  block,
  answers,
  levelLabel,
  isLast,
  onEdit,
  onContinue,
}: {
  block: UiBlock;
  answers: AnswersMap;
  levelLabel: (score: number) => string;
  isLast: boolean;
  onEdit: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const score = averageScore(answers, block.questions.map((q) => q.id));
  return (
    <Card className="mx-auto max-w-3xl">
      <CardContent className="p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('questionnaire.blockComplete')} · {block.title}
        </p>
        <h2 className="mt-2 text-2xl font-bold">
          {block.dim} · {score.toFixed(1)}/5
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('questionnaire.prelimLevel')}: <span className="font-semibold">{levelLabel(score)}</span>
        </p>

        <ul className="mt-4 divide-y">
          {block.questions.map((q) => {
            const a = answers[q.id];
            return (
              <li key={q.id} className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-sm">
                  <span className="font-medium">{q.code}</span> · {q.text}
                </span>
                <Badge variant={a ? 'secondary' : 'outline'} className="shrink-0">
                  {a?.state === 'answered' && typeof a.value === 'number'
                    ? `${a.value}/5`
                    : a?.state === 'idk'
                      ? t('questionnaire.idkShort')
                      : a?.state === 'delegated'
                        ? t('questionnaire.delegate')
                        : '—'}
                </Badge>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex items-center justify-between">
          <Button variant="outline" onClick={onEdit}>
            <ArrowLeft className="h-4 w-4" /> {t('questionnaire.editAnswers')}
          </Button>
          <Button onClick={onContinue} className="brand-gradient border-0 text-white">
            {isLast ? t('questionnaire.seeModuleSummary') : t('questionnaire.continueBlock')}{' '}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ModuleSummary({
  module,
  moduleLabel,
  blocks,
  answers,
  levelLabel,
  onReview,
}: {
  module: 'maturity' | 'area';
  moduleLabel: string;
  blocks: UiBlock[];
  answers: AnswersMap;
  levelLabel: (score: number) => string;
  onReview: () => void;
}) {
  const { t } = useTranslation();
  const allQids = blocks.flatMap((b) => b.questions.map((q) => q.id));
  const score = averageScore(answers, allQids);
  const answered = countAnswered(answers, allQids);
  const radarData = blocks.map((b) => ({
    dim: b.dim,
    score: Number(averageScore(answers, b.questions.map((q) => q.id)).toFixed(2)),
  }));

  return (
    <Card className="mx-auto max-w-4xl border-primary/40">
      <CardContent className="p-6 md:p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('questionnaire.moduleComplete')} · {moduleLabel}
        </p>
        <h2 className="mt-2 text-3xl font-extrabold">
          {score.toFixed(1)}/5 · {levelLabel(score)}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('questionnaire.answeredCount', { answered, total: allQids.length })}
        </p>

        {module === 'maturity' && (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-semibold">{t('maturity.radarTitle')}</h3>
            <MaturityRadar data={radarData} />
          </div>
        )}

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {blocks.map((b) => {
            const s = averageScore(answers, b.questions.map((q) => q.id));
            return (
              <Card key={b.id}>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {b.dim}
                  </p>
                  <p className="mt-1 text-xl font-bold">{s ? s.toFixed(1) : '—'}/5</p>
                  <p className="text-xs text-muted-foreground">{levelLabel(s)}</p>
                  <Progress value={(s / 5) * 100} className="mt-2 h-1.5" />
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Button variant="outline" onClick={onReview}>
            <ArrowLeft className="h-4 w-4" /> {t('questionnaire.editAnswers')}
          </Button>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/areas">
                {module === 'area' ? t('questionnaire.backAreas') : t('questionnaire.continueAreas')}
              </Link>
            </Button>
            <Button asChild className="brand-gradient border-0 text-white">
              <Link to="/results">
                {t('questionnaire.seeResults')} <Check className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
