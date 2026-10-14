import React from 'react';
import { useTranslation } from 'react-i18next';

interface BrandLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const BrandLogo: React.FC<BrandLogoProps> = ({ className = '', size = 'md' }) => {
  const { t } = useTranslation();

  const iconSizes = {
    sm: 'w-7 h-7',
    md: 'w-8 h-8',
    lg: 'w-10 h-10',
  };

  const textSizes = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-xl',
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Isotipo con gradiente corporativo Azul Klertech a Cian */}
      <div className={`${iconSizes[size]} rounded-xl bg-gradient-to-br from-[#1746D1] to-[#08B9E6] flex items-center justify-center shadow-sm text-white font-bold tracking-wider`}>
        K
      </div>
      
      {/* Texto de Marca y Firma adaptado a i18n y modo oscuro */}
      <div className="flex flex-col">
        <div className="flex items-center gap-1.5">
          <span className={`font-bold tracking-tight text-[#0A0D12] dark:text-white ${textSizes[size]}`}>
            TryAIGap
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded-md bg-[#1746D1]/10 dark:bg-[#08B9E6]/20 text-[#1746D1] dark:text-[#08B9E6] font-semibold">
            AI
          </span>
        </div>
        <span className="text-[10px] text-gray-500 dark:text-gray-400 font-medium tracking-wide uppercase">
          {t('common.solutionTagline')}
        </span>
      </div>
    </div>
  );
};