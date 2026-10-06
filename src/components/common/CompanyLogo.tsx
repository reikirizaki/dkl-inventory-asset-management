import React, { useEffect, useState } from 'react';
import {
  getCachedCompanySettings,
  getCompanySettings,
  subscribeCompanySettings,
} from '../../services/companyService';
import { CompanySettings } from '../../types';

interface CompanyLogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  showText?: boolean;
  textColor?: string;
  subtextColor?: string;
  logoUrl?: string;
  companyName?: string;
}

export const CompanyLogo: React.FC<CompanyLogoProps> = ({
  className = '',
  size = 'md',
  showText = false,
  textColor = 'text-slate-900',
  subtextColor = 'text-sky-600',
  logoUrl: propLogoUrl,
  companyName: propCompanyName,
}) => {
  const [settings, setSettings] = useState<CompanySettings>(getCachedCompanySettings());
  const [imageError, setImageError] = useState(false);

  // Sync settings and ensure initial fetch + real-time subscription
  useEffect(() => {
    setImageError(false);

    // 1. Fresh read from Firestore
    getCompanySettings().then((fresh) => {
      if (fresh) {
        setSettings(fresh);
        setImageError(false);
      }
    });

    // 2. Real-time updates subscription
    const unsubscribe = subscribeCompanySettings((newSettings) => {
      setSettings(newSettings);
      setImageError(false);
    });

    return () => unsubscribe();
  }, []);

  // Reset error when logo URL changes
  useEffect(() => {
    setImageError(false);
  }, [propLogoUrl, settings.logoUrl]);

  const effectiveLogoUrl = propLogoUrl || settings.logoUrl;
  const effectiveCompanyName = propCompanyName || settings.companyName || 'PT DARMA KARYA LESTARI';

  const sizeClasses = {
    sm: 'w-7 h-7 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-base',
    xl: 'w-20 h-20 text-lg',
    '2xl': 'w-28 h-28 text-2xl',
  };

  const imageSizes = {
    sm: 'h-7 w-auto max-w-[80px]',
    md: 'h-10 w-auto max-w-[120px]',
    lg: 'h-14 w-auto max-w-[160px]',
    xl: 'h-20 w-auto max-w-[220px]',
    '2xl': 'h-28 w-auto max-w-[280px]',
  };

  const hasValidLogo = Boolean(effectiveLogoUrl && !imageError);

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      {hasValidLogo ? (
        <img
          src={effectiveLogoUrl}
          alt={effectiveCompanyName}
          className={`object-contain rounded-lg ${imageSizes[size]}`}
          onError={() => setImageError(true)}
          loading="eager"
        />
      ) : (
        <div
          className={`${sizeClasses[size]} rounded-xl bg-gradient-to-tr from-sky-600 via-sky-500 to-sky-400 text-white flex items-center justify-center font-black tracking-wider shadow-sm shadow-sky-300/50 flex-shrink-0 select-none`}
        >
          DKL
        </div>
      )}

      {showText && (
        <div className="flex flex-col leading-tight">
          <span className={`font-bold tracking-tight ${textColor} text-base sm:text-lg`}>
            {effectiveCompanyName}
          </span>
          <span className={`text-xs font-semibold uppercase tracking-wider ${subtextColor}`}>
            Inventory & Asset Management
          </span>
        </div>
      )}
    </div>
  );
};
