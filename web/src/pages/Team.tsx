import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MailPlus, RefreshCw, Send, Trash2, Users as UsersIcon, Waypoints } from 'lucide-react';
import { ApiError } from '@/api/client';
import { createInvitation, deleteInvitation, fetchAreas, fetchTeam, resendInvitation } from '@/api';
import type { InvitationOut } from '@/api/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const variant =
    status === 'active' || status === 'accepted'
      ? 'default'
      : status === 'expired' || status === 'disabled'
        ? 'destructive'
        : 'secondary';
  const memberKeys = ['active', 'invited', 'pending', 'disabled'];
  const label = memberKeys.includes(status)
    ? t(`team.memberStatus.${status}`)
    : t(`team.invStatus.${status}`, { defaultValue: status });
  return <Badge variant={variant}>{label}</Badge>;
}

/** Team & collaboration: members, invitations (invite/resend/revoke), delegation info. */
export default function Team() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { assessment } = useAssessment();

  const [inviteOpen, setInviteOpen] = useState(false);
  const [toRevoke, setToRevoke] = useState<InvitationOut | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  // Invite form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [phone, setPhone] = useState('');
  const [areaKey, setAreaKey] = useState('');

  const teamQuery = useQuery({ queryKey: ['team'], queryFn: fetchTeam });
  const areasQuery = useQuery({
    queryKey: ['areas', assessment?.id],
    queryFn: () => fetchAreas(assessment!.id),
    enabled: !!assessment,
  });
  const areas = areasQuery.data?.items ?? [];
  const areaName = (key?: string | null) =>
    key ? (areas.find((a) => a.area_key === key)?.name ?? key) : t('team.areaGeneral');

  const inviteMutation = useMutation({
    mutationFn: () =>
      createInvitation({
        full_name: fullName.trim(),
        email: email.trim(),
        area_key: areaKey || null,
        whatsapp: whatsapp.trim() || null,
        phone: phone.trim() || null,
      }),
    onSuccess: () => {
      setInviteOpen(false);
      setFullName('');
      setEmail('');
      setWhatsapp('');
      setPhone('');
      setAreaKey('');
      setNotice({ kind: 'info', text: t('inviteModal.successTitle') });
      void queryClient.invalidateQueries({ queryKey: ['team'] });
    },
    onError: (e) => {
      const text =
        e instanceof ApiError && e.code === 'INVITE_ALREADY_EXISTS'
          ? t('team.errAlready')
          : e instanceof ApiError && e.code === 'INVITE_EMAIL_INVALID'
            ? t('team.errEmail')
            : t('common.errorGeneric');
      setNotice({ kind: 'error', text });
    },
  });

  const resendMutation = useMutation({
    mutationFn: (id: string) => resendInvitation(id),
    onSuccess: (_data, id) => {
      const inv = teamQuery.data?.invitations.find((i) => i.invitation_id === id);
      setNotice({ kind: 'info', text: t('team.resent', { email: inv?.email ?? '' }) });
      void queryClient.invalidateQueries({ queryKey: ['team'] });
    },
    onError: () => setNotice({ kind: 'error', text: t('common.errorGeneric') }),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => deleteInvitation(id),
    onSuccess: () => {
      setToRevoke(null);
      void queryClient.invalidateQueries({ queryKey: ['team'] });
    },
    onError: () => setNotice({ kind: 'error', text: t('common.errorGeneric') }),
  });

  const formValid = fullName.trim().length > 0 && /.+@.+\..+/.test(email.trim()) && !!areaKey;
  const members = teamQuery.data?.items ?? [];
  const invitations = teamQuery.data?.invitations ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('team.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('team.sub')}</p>
        </div>
        <Button className="brand-gradient border-0 text-white" onClick={() => setInviteOpen(true)}>
          <MailPlus className="h-4 w-4" /> {t('team.invite')}
        </Button>
      </div>

      {notice && (
        <Alert variant={notice.kind === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{notice.text}</AlertDescription>
        </Alert>
      )}

      {/* Members */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('team.members')}</CardTitle>
        </CardHeader>
        <CardContent>
          {teamQuery.isLoading ? (
            <div className="space-y-2">
              {[0, 1].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersIcon />
                </EmptyMedia>
                <EmptyTitle>{t('team.empty')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('team.colName')}</TableHead>
                  <TableHead>{t('team.colEmail')}</TableHead>
                  <TableHead>{t('team.colArea')}</TableHead>
                  <TableHead>{t('team.colRole')}</TableHead>
                  <TableHead>{t('team.colStatus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.member_id}>
                    <TableCell className="font-medium">{m.name ?? '—'}</TableCell>
                    <TableCell>{m.email ?? '—'}</TableCell>
                    <TableCell>{areaName(m.area_key)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(`team.roles.${m.role}`, { defaultValue: m.role })}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={m.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invitations */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('team.invitationsSec')}</CardTitle>
          <CardDescription>{t('inviteModal.sub')}</CardDescription>
        </CardHeader>
        <CardContent>
          {teamQuery.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : invitations.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Send />
                </EmptyMedia>
                <EmptyTitle>{t('team.emptyInv')}</EmptyTitle>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('team.colName')}</TableHead>
                  <TableHead>{t('team.colEmail')}</TableHead>
                  <TableHead>{t('team.colArea')}</TableHead>
                  <TableHead>{t('team.colStatus')}</TableHead>
                  <TableHead className="text-right">{t('team.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.invitation_id}>
                    <TableCell className="font-medium">{inv.full_name}</TableCell>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell>{areaName(inv.area_key)}</TableCell>
                    <TableCell>
                      <StatusBadge status={inv.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('team.resend')}
                          disabled={resendMutation.isPending}
                          onClick={() => resendMutation.mutate(inv.invitation_id)}
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={t('team.revoke')}
                          onClick={() => setToRevoke(inv)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delegation mechanism */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Waypoints className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{t('team.delegationTitle')}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t('team.delegationBody')}</p>
        </CardContent>
      </Card>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('inviteModal.title')}</DialogTitle>
            <DialogDescription>{t('inviteModal.sub')}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (formValid) inviteMutation.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="inv-name">
                {t('inviteModal.name')} · {t('inviteModal.required')}
              </Label>
              <Input
                id="inv-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-email">
                {t('inviteModal.email')} · {t('inviteModal.required')}
              </Label>
              <Input
                id="inv-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              {email.trim() && !/.+@.+\..+/.test(email.trim()) && (
                <p className="text-xs text-destructive">{t('inviteModal.emailInvalid')}</p>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="inv-wa">
                  {t('inviteModal.whatsapp')} · {t('inviteModal.optional')}
                </Label>
                <Input
                  id="inv-wa"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  autoComplete="tel"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="inv-phone">
                  {t('inviteModal.phone')} · {t('inviteModal.optional')}
                </Label>
                <Input id="inv-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>
                {t('inviteModal.area')} · {t('inviteModal.required')}
              </Label>
              <Select value={areaKey} onValueChange={setAreaKey}>
                <SelectTrigger aria-label={t('inviteModal.area')}>
                  <SelectValue placeholder={t('inviteModal.selectArea')} />
                </SelectTrigger>
                <SelectContent>
                  {areas.map((a) => (
                    <SelectItem key={a.area_key} value={a.area_key}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!areaKey && (
                <p className="text-xs text-muted-foreground">{t('inviteModal.validationError')}</p>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setInviteOpen(false)}>
                {t('inviteModal.back')}
              </Button>
              <Button type="submit" disabled={!formValid || inviteMutation.isPending}>
                {inviteMutation.isPending ? t('common.loading') : t('inviteModal.save')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Revoke confirm */}
      <AlertDialog open={!!toRevoke} onOpenChange={(open) => !open && setToRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('team.revokeTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('team.revokeBody', { email: toRevoke?.email ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toRevoke && revokeMutation.mutate(toRevoke.invitation_id)}
              disabled={revokeMutation.isPending}
            >
              {t('team.revokeConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
