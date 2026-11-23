import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  BarChart3,
  Minus,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { auth } from '../../services/firebase';
import { normalizePaymentUiStatus } from '../../lib/paymentStatus';
import type { Application, PaymentTransaction } from '../../types';

export type RevenueChartRangeDays = 7 | 14 | 30;
export type RevenueChartMode = 'combined' | 'revenue' | 'volume';

export interface PostgresApplicationMetricRow {
  id: string;
  submissionDate: string;
  totalAmount: number;
  paymentStatus: string;
  status: string;
}

export interface DailyRevenueVolumePoint {
  dateKey: string;
  label: string;
  fullDateLabel: string;
  submissions: number;
  paidSubmissions: number;
  pendingSubmissions: number;
  confirmedRevenue: number;
  pendingRevenue: number;
  pipelineRevenue: number;
}

export interface RevenueVolumeSeriesSummary {
  days: DailyRevenueVolumePoint[];
  totalSubmissions: number;
  totalPaidSubmissions: number;
  totalConfirmedRevenue: number;
  totalPendingRevenue: number;
  averageTicketInr: number;
  paidConversionPercent: number;
  revenueDeltaPercent: number | null;
  submissionsDeltaPercent: number | null;
  peakDay: DailyRevenueVolumePoint | null;
}

export interface RevenueChartProps {
  applications?: Application[];
  transactions?: PaymentTransaction[];
  defaultDays?: RevenueChartRangeDays;
  className?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDayUtcMs(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function formatInr(amount: number): string {
  return `₹${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatCompactInr(value: number): string {
  if (value === 0) return '₹0';
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`;
  return `₹${value}`;
}

export function computeDailySubmissionRevenueSeries(params: {
  applications: Application[];
  transactions?: PaymentTransaction[];
  postgresRows?: PostgresApplicationMetricRow[];
  daysCount: RevenueChartRangeDays;
  now?: Date;
}): RevenueVolumeSeriesSummary {
  const {
    applications,
    transactions = [],
    postgresRows = [],
    daysCount,
  } = params;
  const now = params.now ?? new Date();
  const todayStart = startOfDayUtcMs(now);
  const windowStart = todayStart - (daysCount - 1) * DAY_MS;
  const windowEnd = todayStart + DAY_MS - 1;
  const prevWindowStart = windowStart - daysCount * DAY_MS;
  const prevWindowEnd = windowStart - 1;

  const days: DailyRevenueVolumePoint[] = [];
  const byDateKey = new Map<string, DailyRevenueVolumePoint>();

  for (let i = daysCount - 1; i >= 0; i--) {
    const dayStart = todayStart - i * DAY_MS;
    const d = new Date(dayStart);
    const dateKey = d.toISOString().slice(0, 10);
    const point: DailyRevenueVolumePoint = {
      dateKey,
      label: d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      }),
      fullDateLabel: d.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      }),
      submissions: 0,
      paidSubmissions: 0,
      pendingSubmissions: 0,
      confirmedRevenue: 0,
      pendingRevenue: 0,
      pipelineRevenue: 0,
    };
    days.push(point);
    byDateKey.set(dateKey, point);
  }

  // Merge Firestore/DataContext applications with any JustPostgreSQL metric rows without double-counting IDs
  const seenAppIds = new Set<string>();
  const normalizedApps: Array<{
    id: string;
    dateIso: string;
    amount: number;
    isPaid: boolean;
  }> = [];

  for (const app of applications) {
    if (!app?.id) continue;
    seenAppIds.add(app.id);
    const uiStatus = normalizePaymentUiStatus(
      app.payment?.status,
      app.status === 'Payment Confirmed' || app.status === 'Payment Successful'
    );
    normalizedApps.push({
      id: app.id,
      dateIso: app.submissionDate || app.updatedAt,
      amount: Number(app.payment?.totalAmount ?? 0) || 0,
      isPaid: uiStatus === 'Paid',
    });
  }

  for (const pgRow of postgresRows) {
    if (!pgRow?.id || seenAppIds.has(pgRow.id)) continue;
    seenAppIds.add(pgRow.id);
    const uiStatus = normalizePaymentUiStatus(
      pgRow.paymentStatus,
      pgRow.status === 'Payment Confirmed' || pgRow.status === 'Payment Successful'
    );
    normalizedApps.push({
      id: pgRow.id,
      dateIso: pgRow.submissionDate,
      amount: Number(pgRow.totalAmount ?? 0) || 0,
      isPaid: uiStatus === 'Paid',
    });
  }

  let prevWindowRevenue = 0;
  let prevWindowSubmissions = 0;

  // Track which application IDs already had confirmed revenue counted via applications
  const paidAppRevenueIds = new Set<string>();

  for (const item of normalizedApps) {
    const ts = new Date(item.dateIso).getTime();
    if (!Number.isFinite(ts)) continue;

    if (ts >= prevWindowStart && ts <= prevWindowEnd) {
      prevWindowSubmissions += 1;
      if (item.isPaid) prevWindowRevenue += item.amount;
      continue;
    }

    if (ts < windowStart || ts > windowEnd) continue;

    const dateKey = new Date(ts).toISOString().slice(0, 10);
    const bucket = byDateKey.get(dateKey);
    if (!bucket) continue;

    bucket.submissions += 1;
    bucket.pipelineRevenue += item.amount;

    if (item.isPaid) {
      bucket.paidSubmissions += 1;
      bucket.confirmedRevenue += item.amount;
      paidAppRevenueIds.add(item.id);
    } else {
      bucket.pendingSubmissions += 1;
      bucket.pendingRevenue += item.amount;
    }
  }

  // Also include standalone paid PaymentTransaction ledger entries (e.g. direct tool/product payments)
  for (const tx of transactions) {
    if (!tx) continue;
    if (tx.applicationId && paidAppRevenueIds.has(tx.applicationId)) continue;
    const uiStatus = normalizePaymentUiStatus(tx.status);
    if (uiStatus !== 'Paid') continue;

    const ts = new Date(tx.transactionDate).getTime();
    if (!Number.isFinite(ts)) continue;
    const amt = Number(tx.amount ?? 0) || 0;

    if (ts >= prevWindowStart && ts <= prevWindowEnd) {
      prevWindowRevenue += amt;
      continue;
    }
    if (ts < windowStart || ts > windowEnd) continue;

    const dateKey = new Date(ts).toISOString().slice(0, 10);
    const bucket = byDateKey.get(dateKey);
    if (!bucket) continue;

    bucket.confirmedRevenue += amt;
    bucket.pipelineRevenue += amt;
    if (tx.applicationId) {
      paidAppRevenueIds.add(tx.applicationId);
    }
  }

  let totalSubmissions = 0;
  let totalPaidSubmissions = 0;
  let totalConfirmedRevenue = 0;
  let totalPendingRevenue = 0;
  let peakDay: DailyRevenueVolumePoint | null = null;

  for (const day of days) {
    totalSubmissions += day.submissions;
    totalPaidSubmissions += day.paidSubmissions;
    totalConfirmedRevenue += day.confirmedRevenue;
    totalPendingRevenue += day.pendingRevenue;

    if (
      (day.confirmedRevenue > 0 || day.submissions > 0) &&
      (!peakDay ||
        day.confirmedRevenue > peakDay.confirmedRevenue ||
        (day.confirmedRevenue === peakDay.confirmedRevenue && day.submissions > peakDay.submissions))
    ) {
      peakDay = day;
    }
  }

  const paidConversionPercent =
    totalSubmissions > 0 ? Math.round((totalPaidSubmissions / totalSubmissions) * 100) : 0;
  const averageTicketInr =
    totalPaidSubmissions > 0
      ? Math.round(totalConfirmedRevenue / totalPaidSubmissions)
      : totalSubmissions > 0
      ? Math.round((totalConfirmedRevenue + totalPendingRevenue) / totalSubmissions)
      : 0;

  let revenueDeltaPercent: number | null = null;
  if (prevWindowRevenue > 0) {
    revenueDeltaPercent = Math.round(
      ((totalConfirmedRevenue - prevWindowRevenue) / prevWindowRevenue) * 100
    );
  } else if (totalConfirmedRevenue > 0) {
    revenueDeltaPercent = 100;
  }

  let submissionsDeltaPercent: number | null = null;
  if (prevWindowSubmissions > 0) {
    submissionsDeltaPercent = Math.round(
      ((totalSubmissions - prevWindowSubmissions) / prevWindowSubmissions) * 100
    );
  } else if (totalSubmissions > 0) {
    submissionsDeltaPercent = 100;
  }

  return {
    days,
    totalSubmissions,
    totalPaidSubmissions,
    totalConfirmedRevenue,
    totalPendingRevenue,
    averageTicketInr,
    paidConversionPercent,
    revenueDeltaPercent,
    submissionsDeltaPercent,
    peakDay,
  };
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: DailyRevenueVolumePoint }>;
}

const RevenueVolumeTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <div className="bg-slate-900 dark:bg-slate-950 text-white border border-slate-700 rounded-xl px-3.5 py-2.5 shadow-lg text-xs space-y-1.5 tabular-nums">
      <div className="font-bold text-slate-100 border-b border-slate-800 pb-1">
        {point.fullDateLabel}
      </div>
      <div className="flex items-center justify-between gap-5">
        <span className="text-slate-400">Applications Submitted</span>
        <span className="font-mono font-bold text-sky-300">{point.submissions}</span>
      </div>
      <div className="flex items-center justify-between gap-5">
        <span className="text-slate-400">Paid / Pending Count</span>
        <span className="font-mono font-semibold text-slate-200">
          {point.paidSubmissions} paid · {point.pendingSubmissions} pending
        </span>
      </div>
      <div className="flex items-center justify-between gap-5">
        <span className="text-slate-400">Confirmed Revenue</span>
        <span className="font-mono font-bold text-emerald-400">
          {formatInr(point.confirmedRevenue)}
        </span>
      </div>
      {point.pendingRevenue > 0 && (
        <div className="flex items-center justify-between gap-5">
          <span className="text-slate-400">Pending Order Value</span>
          <span className="font-mono font-semibold text-amber-300">
            {formatInr(point.pendingRevenue)}
          </span>
        </div>
      )}
    </div>
  );
};

export const RevenueChart: React.FC<RevenueChartProps> = ({
  applications: propApplications,
  transactions: propTransactions,
  defaultDays = 14,
  className = '',
}) => {
  const dataCtx = useData();
  const applications = propApplications ?? dataCtx.applications;
  const transactions = propTransactions ?? dataCtx.transactions;

  const [daysCount, setDaysCount] = useState<RevenueChartRangeDays>(defaultDays);
  const [mode, setMode] = useState<RevenueChartMode>('combined');
  const [postgresRows, setPostgresRows] = useState<PostgresApplicationMetricRow[]>([]);
  const [pgSourceLabel, setPgSourceLabel] = useState<'firestore' | 'firestore+postgres'>('firestore');
  const [syncing, setSyncing] = useState(false);

  const syncFromJustPostgres = useCallback(async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    setSyncing(true);
    try {
      const token = await currentUser.getIdToken();
      if (!token) return;
      const res = await fetch('/api/postgres/applications-metrics', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      const data = json?.data;
      if (data?.configured && Array.isArray(data.rows)) {
        setPostgresRows(data.rows);
        setPgSourceLabel('firestore+postgres');
      }
    } catch {
      // Non-blocking fallback to DataContext Firestore stream
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void syncFromJustPostgres();
  }, [syncFromJustPostgres]);

  const summary = useMemo(
    () =>
      computeDailySubmissionRevenueSeries({
        applications,
        transactions,
        postgresRows,
        daysCount,
      }),
    [applications, transactions, postgresRows, daysCount]
  );

  const revenuePositive = (summary.revenueDeltaPercent ?? 0) > 0;
  const revenueNegative = (summary.revenueDeltaPercent ?? 0) < 0;
  const hasAnyData = summary.totalSubmissions > 0 || summary.totalConfirmedRevenue > 0;
  const xInterval = daysCount === 7 ? 0 : daysCount === 14 ? 1 : 4;

  return (
    <section
      aria-label="Daily application submission volume and payment revenue trends"
      className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 ${className}`}
    >
      {/* Header Row */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
            <BarChart3 className="w-4 h-4 text-[#FF671F] shrink-0" />
            <span>Daily Submissions &amp; Payment Revenue</span>
            <span className="text-[10px] font-semibold normal-case tracking-normal text-slate-400 dark:text-slate-500">
              ({pgSourceLabel === 'firestore+postgres' ? 'Firestore + JustPostgreSQL' : 'Firestore Live'})
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-2.5 tabular-nums pt-0.5">
            <span className="text-2xl font-black font-mono text-slate-900 dark:text-white">
              {formatInr(summary.totalConfirmedRevenue)}
            </span>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              confirmed across <strong className="text-slate-700 dark:text-slate-200">{summary.totalSubmissions}</strong>{' '}
              {summary.totalSubmissions === 1 ? 'submission' : 'submissions'} ({daysCount}d)
            </span>

            {summary.revenueDeltaPercent !== null && (
              <span
                className={`inline-flex items-center gap-1 text-xs font-semibold ${
                  revenuePositive
                    ? 'text-[#138808] dark:text-emerald-400'
                    : revenueNegative
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {revenuePositive ? (
                  <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                ) : revenueNegative ? (
                  <TrendingDown className="w-3.5 h-3.5 shrink-0" />
                ) : (
                  <Minus className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>
                  {revenuePositive ? '+' : ''}
                  {summary.revenueDeltaPercent}% vs prior {daysCount}d
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Interactive Controls: Series Mode + Time Window + Sync */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div
            role="tablist"
            aria-label="Chart metric mode"
            className="inline-flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl"
          >
            {(
              [
                { id: 'combined', label: 'Combined' },
                { id: 'revenue', label: 'Revenue (₹)' },
                { id: 'volume', label: 'Submissions' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                role="tab"
                aria-selected={mode === opt.id}
                onClick={() => setMode(opt.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition cursor-pointer whitespace-nowrap ${
                  mode === opt.id
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div
            role="tablist"
            aria-label="Chart date range"
            className="inline-flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl tabular-nums"
          >
            {([7, 14, 30] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="tab"
                aria-selected={daysCount === d}
                onClick={() => setDaysCount(d)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer whitespace-nowrap ${
                  daysCount === d
                    ? 'bg-[#FF671F] text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {d}D
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => void syncFromJustPostgres()}
            disabled={syncing}
            aria-label="Refresh database metrics"
            title="Refresh database metrics"
            className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-[#FF671F] hover:text-[#FF671F] transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 3-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-3 border-y border-slate-100 dark:border-slate-800 tabular-nums text-xs">
        <div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Submission Volume &amp; Paid Rate
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-base font-black font-mono text-slate-900 dark:text-white">
              {summary.totalSubmissions}
            </span>
            <span className="text-[11px] font-semibold text-sky-700 dark:text-sky-400">
              {summary.paidConversionPercent}% payment confirmed
            </span>
          </div>
        </div>

        <div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Avg. Ticket &amp; Pending Pipeline
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-base font-black font-mono text-slate-900 dark:text-white">
              {formatInr(summary.averageTicketInr)}
            </span>
            <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">
              {formatInr(summary.totalPendingRevenue)} awaiting settlement
            </span>
          </div>
        </div>

        <div>
          <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
            Peak Day ({daysCount}D)
          </div>
          <div className="mt-0.5 text-base font-black font-mono text-[#138808] dark:text-emerald-400 truncate">
            {summary.peakDay
              ? `${summary.peakDay.label} · ${summary.peakDay.submissions} app(s) · ${formatInr(
                  summary.peakDay.confirmedRevenue
                )}`
              : '—'}
          </div>
        </div>
      </div>

      {/* Recharts Canvas or Empty / Loading State */}
      {syncing && applications.length === 0 ? (
        <div className="h-60 w-full flex items-end gap-1.5 pt-4 animate-pulse" aria-busy="true">
          {Array.from({ length: daysCount }).map((_, idx) => (
            <div
              key={idx}
              className="flex-1 bg-slate-200 dark:bg-slate-800 rounded-t"
              style={{ height: `${25 + ((idx * 19) % 65)}%` }}
            />
          ))}
        </div>
      ) : !hasAnyData ? (
        <div className="py-10 text-center space-y-2.5 text-xs">
          <p className="font-bold text-slate-800 dark:text-slate-200">
            No application submissions or payment revenue recorded in the last {daysCount} days.
          </p>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Daily submission volume bars and confirmed INR revenue curves appear automatically as applications are filed across portal channels.
          </p>
          {daysCount < 30 && (
            <button
              type="button"
              onClick={() => setDaysCount(30)}
              className="mt-1 inline-flex items-center gap-1.5 bg-[#FF671F] hover:bg-[#E55B1B] text-white font-bold px-3.5 py-1.5 rounded-lg text-xs cursor-pointer"
            >
              Expand to 30-Day View
            </button>
          )}
        </div>
      ) : (
        <div className="h-64 w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={summary.days}
              margin={{ top: 10, right: mode === 'combined' ? 6 : 12, left: -4, bottom: 0 }}
            >
              <defs>
                <linearGradient id="dipRevenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#138808" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#138808" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="rgba(148, 163, 184, 0.22)"
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: '#64748B' }}
                tickLine={false}
                axisLine={false}
                interval={xInterval}
              />

              {(mode === 'combined' || mode === 'revenue') && (
                <YAxis
                  yAxisId="revenue"
                  orientation="left"
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickLine={false}
                  axisLine={false}
                  width={54}
                  tickFormatter={(val: number) => formatCompactInr(val)}
                />
              )}

              {(mode === 'combined' || mode === 'volume') && (
                <YAxis
                  yAxisId="volume"
                  orientation={mode === 'combined' ? 'right' : 'left'}
                  tick={{ fontSize: 11, fill: '#64748B' }}
                  tickLine={false}
                  axisLine={false}
                  width={mode === 'combined' ? 32 : 40}
                  allowDecimals={false}
                />
              )}

              <Tooltip
                cursor={{ fill: 'rgba(148, 163, 184, 0.1)' }}
                content={<RevenueVolumeTooltip />}
              />

              {(mode === 'combined' || mode === 'volume') && (
                <Bar
                  yAxisId="volume"
                  dataKey="submissions"
                  name="Applications Submitted"
                  fill="#0284C7"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={daysCount === 7 ? 32 : daysCount === 14 ? 22 : 14}
                />
              )}

              {(mode === 'combined' || mode === 'revenue') && (
                <Area
                  yAxisId="revenue"
                  type="monotone"
                  dataKey="confirmedRevenue"
                  name="Confirmed Revenue (₹)"
                  stroke="#138808"
                  strokeWidth={2.25}
                  fillOpacity={1}
                  fill="url(#dipRevenueFill)"
                  activeDot={{ r: 5, strokeWidth: 0, fill: '#FF671F' }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legend Footer */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300">
        <div className="flex flex-wrap items-center gap-4">
          {(mode === 'combined' || mode === 'volume') && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#0284C7]" />
              Daily Application Submissions
            </span>
          )}
          {(mode === 'combined' || mode === 'revenue') && (
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#138808]" />
              Confirmed Payment Revenue (₹)
            </span>
          )}
        </div>
        <span className="text-[10px] text-slate-400 tabular-nums">
          UTC calendar day alignment · Deduplicated across records
        </span>
      </div>
    </section>
  );
};

export default RevenueChart;
