import React, { useState } from 'react';
import { Download } from 'lucide-react';
import type { Application, BusinessSettings } from '../../types';
import { downloadApplicationReceiptPdf } from '../../lib/applicationReceiptPdf';

interface DownloadReceiptButtonProps {
  application: Application;
  businessSettings?: Partial<BusinessSettings>;
  size?: 'xs' | 'sm';
  className?: string;
}

export const DownloadReceiptButton: React.FC<DownloadReceiptButtonProps> = ({
  application,
  businessSettings,
  size = 'sm',
  className = '',
}) => {
  const [generating, setGenerating] = useState(false);

  const handleClick = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (generating) return;
    setGenerating(true);
    try {
      await downloadApplicationReceiptPdf(application, businessSettings);
    } catch (err) {
      console.error('[DownloadReceiptButton] PDF generation failed:', err);
    } finally {
      setGenerating(false);
    }
  };

  const sizeClass =
    size === 'xs'
      ? 'px-2.5 py-1 rounded-lg text-[11px] gap-1'
      : 'px-3 py-1.5 rounded-lg text-xs gap-1.5';

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={generating}
      aria-label={`Download printable PDF receipt for ${application.id}`}
      className={`inline-flex items-center font-bold bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-slate-700 hover:border-[#FF671F] transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0 ${sizeClass} ${className}`}
    >
      <Download className="w-3.5 h-3.5 shrink-0 text-[#FF671F]" />
      <span>{generating ? 'Preparing PDF...' : 'Download Receipt'}</span>
    </button>
  );
};
