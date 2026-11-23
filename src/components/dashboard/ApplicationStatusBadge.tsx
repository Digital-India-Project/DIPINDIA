import React from 'react';
import { CheckCircle2, Clock, RefreshCw, XCircle } from 'lucide-react';
import type { ApplicationStatus } from '../../types';
import { resolveApplicationVisualState } from '../../lib/workflow';

interface ApplicationStatusBadgeProps {
  status: ApplicationStatus;
  size?: 'xs' | 'sm';
  className?: string;
}

const BUCKET_CLASSES = {
  Pending: {
    container:
      'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    icon: Clock,
  },
  Processing: {
    container:
      'bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border-sky-200 dark:border-sky-800',
    icon: RefreshCw,
  },
  Completed: {
    container:
      'bg-emerald-50 dark:bg-emerald-950/60 text-[#138808] dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
    icon: CheckCircle2,
  },
  Halted: {
    container:
      'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800',
    icon: XCircle,
  },
} as const;

export const ApplicationStatusBadge: React.FC<ApplicationStatusBadgeProps> = ({
  status,
  size = 'sm',
  className = '',
}) => {
  const visual = resolveApplicationVisualState(status);
  const style = BUCKET_CLASSES[visual.bucket];
  const Icon = style.icon;

  const sizeClass =
    size === 'xs'
      ? 'px-2 py-0.5 rounded-md text-[10px] gap-1'
      : 'px-2.5 py-1 rounded-lg text-[11px] gap-1.5';
  const iconClass = size === 'xs' ? 'w-3 h-3 shrink-0' : 'w-3.5 h-3.5 shrink-0';

  return (
    <span
      title={`Current stage: ${visual.stageLabel}`}
      className={`inline-flex items-center font-bold border whitespace-nowrap shrink-0 ${sizeClass} ${style.container} ${className}`}
    >
      <Icon className={iconClass} />
      <span>{visual.label}</span>
    </span>
  );
};
