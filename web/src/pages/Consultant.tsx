import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, ChevronRight, Search } from 'lucide-react';
import { fetchConsultantClients, fetchConsultantKpis } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
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
import { Button } from '@/components/ui/button';

const STATUS_LABEL_KEYS: Record<string, string> = {
  lead: 'lead',
  in_progress: 'inprog',
  completed: 'done',
  draft: 'inprog',
};

function ClientStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const key = STATUS_LABEL_KEYS[status] ?? 'stalled';
  return <Badge variant="secondary">{t(`consultant.statuses.${key}`)}</Badge>;
}

/** Consultant console: KPIs + client portfolio (role=consultant only). */
export default function Consultant() {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const [plan, setPlan] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);

  const kpisQuery = useQuery({ queryKey: ['consultant', 'kpis'], queryFn: fetchConsultantKpis });
  const clientsQuery = useQuery({
    queryKey: ['consultant', 'clients', plan, status, page],
    queryFn: () =>
      fetchConsultantClients({
        plan: plan !== 'all' ? plan : undefined,
        status: status !== 'all' ? status : undefined,
        page,
      }),
  });

  const items = useMemo(() => {
    const all = clientsQuery.data?.items ?? [];
    const q = search.trim().toLowerCase();
    return q ? all.filter((c) => c.name.toLowerCase().includes(q)) : all;
  }, [clientsQuery.data, search]);
  const meta = clientsQuery.data?.meta;
  const dateFmt = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' });

  const kpis = kpisQuery.data;
  const KPI_CARDS = [
    { label: t('consultant.kpis.leads'), value: kpis?.leads },
    { label: t('consultant.kpis.active'), value: kpis?.active_engagements },
    { label: t('consultant.kpis.avg'), value: kpis?.avg_maturity },
    { label: t('consultant.kpis.conv'), value: kpis ? `${kpis.free_to_paid_conversion_pct}%` : undefined },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg brand-gradient-soft text-primary">
          <Briefcase className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t('consultant.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('consultant.sub')}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPI_CARDS.map((k) => (
          <Card key={k.label}>
            <CardHeader className="pb-2">
              <CardDescription>{k.label}</CardDescription>
            </CardHeader>
            <CardContent>
              {kpisQuery.isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-2xl font-bold">{k.value ?? '—'}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('consultant.searchPh')}
              className="pl-9"
              aria-label={t('consultant.searchPh')}
            />
          </div>
          <Select
            value={plan}
            onValueChange={(v) => {
              setPlan(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44" aria-label={t('consultant.allPlans')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('consultant.allPlans')}</SelectItem>
              <SelectItem value="free">{t('consultant.plans.free')}</SelectItem>
              <SelectItem value="pro">Pro</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44" aria-label={t('consultant.allStatuses')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('consultant.allStatuses')}</SelectItem>
              <SelectItem value="lead">{t('consultant.statuses.lead')}</SelectItem>
              <SelectItem value="in_progress">{t('consultant.statuses.inprog')}</SelectItem>
              <SelectItem value="completed">{t('consultant.statuses.done')}</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Clients table */}
      <Card>
        <CardContent className="p-0">
          {clientsQuery.isLoading ? (
            <div className="space-y-2 p-6">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Briefcase />
                </EmptyMedia>
                <EmptyTitle>{t('consultant.noClients')}</EmptyTitle>
                <EmptyDescription>{t('consultant.empty')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('consultant.th.client')}</TableHead>
                  <TableHead>{t('consultant.th.plan')}</TableHead>
                  <TableHead>{t('consultant.th.progress')}</TableHead>
                  <TableHead>{t('consultant.th.score')}</TableHead>
                  <TableHead>{t('consultant.th.status')}</TableHead>
                  <TableHead>{t('consultant.th.last')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((c) => (
                  <TableRow key={c.client_id}>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.sector ?? '—'}</div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.plan === 'pro' ? 'default' : 'outline'}>
                        {c.plan === 'pro' ? 'Pro' : t('consultant.plans.free')}
                      </Badge>
                    </TableCell>
                    <TableCell className="min-w-32">
                      <div className="flex items-center gap-2">
                        <Progress value={c.progress} className="h-1.5 w-20" />
                        <span className="text-xs text-muted-foreground">{c.progress}%</span>
                      </div>
                    </TableCell>
                    <TableCell>{c.maturity != null ? c.maturity.toFixed(1) : '—'}</TableCell>
                    <TableCell>
                      <ClientStatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {c.last_activity ? dateFmt.format(new Date(c.last_activity)) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/consultant/clients/${c.client_id}`}>
                          {t('consultant.viewDetail')} <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {meta && meta.total_pages > 1 && (
            <div className="flex items-center justify-between border-t p-4">
              <p className="text-sm text-muted-foreground">
                {t('common.pageInfo', { page: meta.page, pages: meta.total_pages })}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
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
        </CardContent>
      </Card>
    </div>
  );
}
