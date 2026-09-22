import { useTranslation } from 'react-i18next';
import brandLogo from '@/assets/brand-logo.jpg';
import { cn } from '@/lib/utils';

interface BrandLogoProps {
  /** Show the tagline under the wordmark (hero contexts). */
  withTagline?: boolean;
  compact?: boolean;
  className?: string;
}

/** Brand lockup: logo image + "tryAIGap" wordmark with the magenta→teal gradient. */
export function BrandLogo({ withTagline = false, compact = false, className }: BrandLogoProps) {
  const { t } = useTranslation();
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <img
        src={brandLogo}
        alt="tryAIGap"
        className={cn('rounded-md object-cover', compact ? 'h-7 w-7' : 'h-9 w-9')}
      />
      <span className="flex flex-col leading-none">
        <span
          className={cn(
            'font-bold tracking-tight text-brand-gradient',
            compact ? 'text-base' : 'text-xl',
          )}
        >
          tryAIGap
        </span>
        {withTagline && (
          <span className="mt-1 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {t('common.appTagline')}
          </span>
        )}
      </span>
    </span>
  );
}
