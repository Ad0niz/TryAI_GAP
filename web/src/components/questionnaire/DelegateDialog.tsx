import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { delegateQuestion } from '@/api';
import { ApiError } from '@/api/client';
import { isValidEmail } from '@/lib/leadForm';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface DelegateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assessmentId: string;
  questionId: string;
  /** Fired after the delegation email is accepted by the backend. */
  onSent: (name: string) => void;
}

type Step = 'form' | 'sent';

/** Per-question delegation by email (POST …/questions/{id}/delegate). */
export function DelegateDialog({
  open,
  onOpenChange,
  assessmentId,
  questionId,
  onSent,
}: DelegateDialogProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  function reset() {
    setStep('form');
    setName('');
    setEmail('');
    setError(null);
    setSending(false);
  }

  async function handleSend() {
    if (!name.trim() || !isValidEmail(email)) {
      setError(t('delegateModal.validationError'));
      return;
    }
    setSending(true);
    setError(null);
    try {
      await delegateQuestion(assessmentId, questionId, {
        name: name.trim(),
        email: email.trim(),
      });
      setStep('sent');
      onSent(name.trim());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('common.errorGeneric'));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        {step === 'form' ? (
          <>
            <DialogHeader>
              <DialogTitle>{t('delegateModal.title')}</DialogTitle>
              <DialogDescription>{t('delegateModal.sub')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="dlg-name">
                  {t('delegateModal.name')} *<span className="sr-only">{t('delegateModal.required')}</span>
                </Label>
                <Input id="dlg-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dlg-email">{t('delegateModal.email')} *</Label>
                <Input
                  id="dlg-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription className="text-xs">{error}</AlertDescription>
                </Alert>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={sending}>
                {t('delegateModal.cancel')}
              </Button>
              <Button onClick={() => void handleSend()} disabled={sending}>
                {sending ? t('common.loading') : t('delegateModal.send')}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('delegateModal.successTitle')}</DialogTitle>
              <DialogDescription>
                {t('delegateModal.successSub', { name })}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>
                {t('delegateModal.continue')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
