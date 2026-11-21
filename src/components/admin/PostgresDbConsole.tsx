import React, { useEffect, useRef, useState } from 'react';
import {
  exportJustPostgresBackup,
  fetchJustPostgresSchemaSql,
  fetchJustPostgresStatus,
  importJsonToJustPostgres,
  runJustPostgresMigration,
  syncCatalogueToJustPostgres,
  type JustPostgresStatusResponse,
} from '../../services/backendApi';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Database,
  Download,
  FileCode2,
  Play,
  RefreshCw,
  Server,
  Sparkles,
  Upload,
} from 'lucide-react';

export const PostgresDbConsole: React.FC = () => {
  const [status, setStatus] = useState<JustPostgresStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [migratingSql, setMigratingSql] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [schemaPreview, setSchemaPreview] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchJustPostgresStatus();
      if (res.ok && res.data) {
        setStatus(res.data);
      } else {
        setErrorMsg(res.message || 'Unable to inspect remote PostgreSQL status.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to reach /api/admin/postgres/status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleRunSqlMigration = async () => {
    setMigratingSql(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await runJustPostgresMigration();
      if (res.ok) {
        setStatusMsg(res.message || 'PostgreSQL schema migration executed cleanly.');
        await loadStatus();
      } else {
        setErrorMsg(res.message || 'Schema migration failed.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to run PostgreSQL schema migration.');
    } finally {
      setMigratingSql(false);
    }
  };

  const handleSeedCatalogue = async () => {
    setSeeding(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await syncCatalogueToJustPostgres();
      if (res.ok && res.data) {
        const totals = Object.entries(res.data).map(
          ([table, r]) => `${table}: ${r.upserted} upserted`
        );
        setStatusMsg(`Seeded Remote PostgreSQL (${totals.join(' · ')}).`);
        await loadStatus();
      } else {
        setErrorMsg(res.message || 'Unable to seed data to remote PostgreSQL.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to seed remote PostgreSQL.');
    } finally {
      setSeeding(false);
    }
  };

  const handleViewOrCopySchema = async (action: 'toggle' | 'copy' | 'download') => {
    setErrorMsg(null);
    try {
      const res = await fetchJustPostgresSchemaSql();
      if (!res.ok || !res.data?.sql) {
        setErrorMsg(res.message || 'Unable to load JustPostgreSQL migration SQL.');
        return;
      }
      const sql = res.data.sql;
      if (action === 'toggle') {
        setSchemaPreview((prev) => (prev ? null : sql));
      } else if (action === 'copy') {
        await navigator.clipboard.writeText(sql);
        setStatusMsg('Copied 0001 + 0002 JustPostgreSQL schema & core seed SQL to clipboard.');
      } else {
        const blob = new Blob([sql], { type: 'application/sql' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = res.data.filename || 'justpostgres_0001_0002_init.sql';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setStatusMsg('Downloaded justpostgres_0001_0002_init.sql.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to retrieve PostgreSQL schema SQL.');
    }
  };

  const handleImportBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImporting(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const collections = parsed?.collections;
      if (!collections || typeof collections !== 'object') {
        throw new Error('Invalid JSON backup file: missing "collections" object.');
      }
      const res = await importJsonToJustPostgres(collections);
      if (res.ok && res.data) {
        const summary = Object.entries(res.data)
          .map(([t, s]) => `${t}: ${s.upserted}`)
          .join(' · ');
        setStatusMsg(`Imported backup into PostgreSQL (${summary || '0 rows'}).`);
        await loadStatus();
      } else {
        setErrorMsg(res.message || 'Failed to import JSON backup into PostgreSQL.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to import JSON backup into PostgreSQL.');
    } finally {
      setImporting(false);
    }
  };

  const handleExportPostgres = async () => {
    setExporting(true);
    setErrorMsg(null);
    try {
      const res = await exportJustPostgresBackup();
      if (!res.ok || !res.data) {
        setErrorMsg(res.message || 'Unable to export PostgreSQL tables.');
        return;
      }
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `justpostgres-backup-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatusMsg('Downloaded Remote PostgreSQL JSON backup.');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to export PostgreSQL JSON.');
    } finally {
      setExporting(false);
    }
  };

  const busy = loading || migratingSql || seeding || importing || exporting;
  const healthBadgeClass =
    status?.healthState === 'connected'
      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
      : status?.healthState === 'tables_missing' || status?.healthState === 'api_not_enabled'
      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-900'
      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';

  return (
    <div className="bg-white dark:bg-slate-900 border-2 border-indigo-500/30 dark:border-indigo-900/60 rounded-2xl p-5 sm:p-6 space-y-4 shadow-xs">
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleImportBackupFile}
      />

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
            <Server className="w-4 h-4 shrink-0" />
            <span>Remote PostgreSQL (JustPostgres · Server-Side Proxy)</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
              Host: <span className="font-mono text-indigo-600 dark:text-indigo-400">{status?.endpointHost || 'djp.bakeweb.in'}</span>
            </h3>
            {status && (
              <span className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full border ${healthBadgeClass}`}>
                {status.healthState}
                {status.transportMode && status.transportMode !== 'unconfigured'
                  ? ` · ${status.transportMode === 'direct_pg' ? 'Session PG Pool' : 'PostgREST API'}`
                  : ''}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            All Postgres credentials (<span className="font-mono">DATABASE_URL</span> &amp; <span className="font-mono">JUSTPOSTGRES_SERVICE_ROLE_KEY</span>) stay strictly on the server—never exposed to browser clients.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleRunSqlMigration}
            disabled={busy}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{migratingSql ? 'Applying SQL...' : 'Run Schema Migration'}</span>
          </button>

          <button
            type="button"
            onClick={handleSeedCatalogue}
            disabled={busy}
            className="px-3.5 py-2 bg-[#138808] hover:bg-emerald-700 text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <Sparkles className={`w-3.5 h-3.5 ${seeding ? 'animate-spin' : ''}`} />
            <span>{seeding ? 'Recreating Tables...' : 'Recreate All DB Tables (No Backup)'}</span>
          </button>

          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={busy}
            className="px-3 py-2 bg-[#FF671F] hover:bg-[#E55B1B] text-white text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>{importing ? 'Importing...' : 'Import JSON Backup'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportPostgres}
            disabled={busy}
            className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Postgres JSON</span>
          </button>

          <button
            type="button"
            onClick={() => handleViewOrCopySchema('copy')}
            disabled={busy}
            className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Copy SQL</span>
          </button>

          <button
            type="button"
            onClick={() => handleViewOrCopySchema('toggle')}
            disabled={busy}
            className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <FileCode2 className="w-3.5 h-3.5" />
            <span>{schemaPreview ? 'Hide SQL' : 'View SQL'}</span>
          </button>

          <button
            type="button"
            onClick={loadStatus}
            disabled={busy}
            className="px-3 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold rounded-xl inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Check Status</span>
          </button>
        </div>
      </div>

      {status && (
        <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-700 dark:text-slate-300 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>{status.message}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono">
            <span>DATABASE_URL: {status.directPgConfigured ? 'SET' : 'UNSET'}</span>
            <span>·</span>
            <span>REST_URL: {status.restConfigured ? 'SET' : 'UNSET'}</span>
            <span>·</span>
            <span>SERVICE_ROLE: {status.hasServiceRoleKey ? 'SET' : 'UNSET'}</span>
          </div>
        </div>
      )}

      {statusMsg && (
        <div className="p-3 rounded-xl border bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl border bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/50 dark:bg-indigo-950/20 text-xs text-slate-700 dark:text-slate-300 space-y-2">
        <div className="font-extrabold text-indigo-900 dark:text-indigo-200 flex items-center justify-between gap-2 flex-wrap">
          <span>Easy 3-Step Setup (No Terminal Needed)</span>
          <button
            type="button"
            onClick={() => handleViewOrCopySchema('copy')}
            disabled={busy}
            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg inline-flex items-center gap-1 cursor-pointer disabled:opacity-60"
          >
            <Copy className="w-3 h-3" />
            <span>Copy Complete SQL (0001 + 0002)</span>
          </button>
        </div>
        <ol className="list-decimal list-inside space-y-1 leading-relaxed">
          <li>
            Click <strong>Copy Complete SQL (0001 + 0002)</strong> above, open your <strong>JustPostgres Dashboard → SQL Editor</strong>, paste, and click <strong>Run</strong> (creates <span className="font-mono">users</span>, <span className="font-mono">services</span>, <span className="font-mono">applications</span>, <span className="font-mono">business_settings</span>, all 18 tables &amp; initial admin/settings).
          </li>
          <li>
            In JustPostgres, turn <strong>ON</strong> the <strong>REST / Data API</strong>, and add <span className="font-mono">JUSTPOSTGRES_REST_URL</span>, <span className="font-mono">JUSTPOSTGRES_SERVICE_ROLE_KEY</span>, and <span className="font-mono">DATABASE_URL</span> in AI Studio <strong>Settings → Secrets</strong>.
          </li>
          <li>
            Come back here and click <strong>Check Status</strong>, then click <strong>Recreate All DB Tables (No Backup)</strong> to load all 149 services and 106 bilingual blog posts automatically.
          </li>
        </ol>
      </div>

      {status?.tableStats && status.tableStats.length > 0 && (
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs min-w-[520px]">
            <thead className="bg-slate-50 dark:bg-slate-800/70 text-[10px] font-bold uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-2 px-3.5">PostgreSQL Table</th>
                <th className="py-2 px-3.5 text-center">Schema Present</th>
                <th className="py-2 px-3.5 text-right">Row Count</th>
                <th className="py-2 px-3.5 text-right">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 tabular-nums">
              {status.tableStats.map((row) => (
                <tr key={row.table}>
                  <td className="py-1.5 px-3.5 font-mono font-bold text-slate-900 dark:text-white">
                    public.{row.table}
                  </td>
                  <td className="py-1.5 px-3.5 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        row.exists
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                          : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                      }`}
                    >
                      {row.exists ? 'READY' : 'MISSING'}
                    </span>
                  </td>
                  <td className="py-1.5 px-3.5 text-right font-mono font-semibold text-slate-800 dark:text-slate-200">
                    {row.rowCount}
                  </td>
                  <td className="py-1.5 px-3.5 text-right text-[11px] text-slate-500">
                    {row.error || 'OK'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {schemaPreview && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300 font-mono">
              migrations/postgres/0001_justpostgres_schema.sql + 0002_justpostgres_init_core.sql
            </span>
            <button
              type="button"
              onClick={() => handleViewOrCopySchema('download')}
              className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 text-xs font-bold rounded-lg inline-flex items-center gap-1 cursor-pointer"
            >
              <Download className="w-3 h-3" />
              <span>Download .sql</span>
            </button>
          </div>
          <pre className="max-h-72 overflow-auto p-3.5 rounded-xl bg-slate-950 text-slate-100 text-[11px] font-mono leading-relaxed">
            {schemaPreview}
          </pre>
        </div>
      )}
    </div>
  );
};
