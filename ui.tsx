import { CircleCheck, Cpu, FlaskConical, Info, Languages, Server, OctagonAlert, ShieldAlert, TriangleAlert } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import type { AiMeta, BriefItem, StatementKind, ThreatLevel } from '../types';
import { THREAT_META } from '../data/meta';
import { useApp } from '../context';

/** Оригинальный знак QUTQAR AI: щит + ориентир (перекрестие), без заимствования символики МЧС */
export function Logo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path d="M32 3 57 12v19c0 15-10.6 25.8-25 30C17.6 56.8 7 46 7 31V12z" fill="#0F2444" stroke="#E4572E" strokeWidth="3" />
      <circle cx="32" cy="31" r="11" fill="none" stroke="#fff" strokeWidth="3" />
      <path d="M32 14v8M32 40v8M15 31h8M41 31h8" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="31" r="3.5" fill="#E4572E" />
    </svg>
  );
}

export function PageHeader({ icon, title, subtitle, actions }: { icon: ReactNode; title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 border-b border-white/10 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-navy-800 text-signal-amber ring-1 ring-white/10">{icon}</div>
        <div className="min-w-0">
          <h1 className="font-cond text-2xl font-semibold leading-tight tracking-wide text-white">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-300">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export const ThreatBadge = memo(function ThreatBadge({ level, size = 'md' }: { level: ThreatLevel; size?: 'sm' | 'md' }) {
  const { t } = useApp();
  const m = THREAT_META[level];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded font-bold ring-1 ring-inset ${m.className} ${size === 'sm' ? 'px-1.5 py-px text-[10px]' : 'px-2 py-0.5 text-xs'}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: level === 'critical' ? '#fff' : m.color }} />{t(m.key)}
    </span>
  );
});

/** Индикатор состояния: точка + подпись */
export function StatusPill({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'info' | 'idle'; children: ReactNode }) {
  const c = { ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200', warn: 'bg-amber-50 text-amber-900 ring-amber-200', bad: 'bg-red-50 text-red-800 ring-red-200', info: 'bg-sky-50 text-sky-900 ring-sky-200', idle: 'bg-slate-100 text-slate-600 ring-slate-200' }[tone];
  const d = { ok: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-red-600', info: 'bg-sky-500', idle: 'bg-slate-400' }[tone];
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${c}`}><span className={`h-1.5 w-1.5 rounded-full ${d}`} />{children}</span>;
}

/** KPI-плитка */
export function Kpi({ label, value, note, accent = 'bg-navy-500', icon }: { label: string; value: ReactNode; note?: string; accent?: string; icon?: ReactNode }) {
  return (
    <div className="card relative overflow-hidden p-4">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} aria-hidden />
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
        {icon && <div className="text-slate-400">{icon}</div>}
      </div>
      <div className="mt-1 font-cond text-3xl font-bold leading-none text-slate-900 tabular-nums">{value}</div>
      {note && <div className="mt-1.5 text-xs text-slate-500">{note}</div>}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 text-sm text-slate-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-signal-red" aria-hidden />{label}
    </div>
  );
}

export function AiDisclaimer({ compact }: { compact?: boolean }) {
  const { t } = useApp();
  return (
    <div className={`flex gap-2.5 rounded-md border border-amber-200 bg-amber-50 text-amber-950 ${compact ? 'p-2.5 text-xs' : 'p-3 text-sm'}`}>
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
      <p><strong>{t('disclaimer.title')}</strong> {t('disclaimer.text')}</p>
    </div>
  );
}

/** Обязательная оговорка для операционных рекомендаций AI (ТЗ п. 11) */
export function SafetyNotice({ className = '' }: { className?: string }) {
  const { t } = useApp();
  return (
    <div className={`flex gap-2.5 rounded-md border border-slate-300 bg-slate-50 p-2.5 text-xs text-slate-700 ${className}`} role="note">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-navy-600" aria-hidden />
      <p><strong className="text-slate-900">{t('safety.title')}.</strong> {t('safety.notice')}</p>
    </div>
  );
}

/** Пометка: содержимое DEMO-движка на русском (показывается в KZ/EN) */
export function ContentLangNote({ show = true }: { show?: boolean }) {
  const { lang, settings, t } = useApp();
  if (!show || lang === 'ru' || !settings.demoMode) return null;
  return <p className="flex items-center gap-1.5 text-[11px] text-slate-500"><Languages className="h-3.5 w-3.5" aria-hidden />{t('common.contentRu')}</p>;
}

export function ModeBadge({ meta }: { meta?: AiMeta | null }) {
  const { t } = useApp();
  if (!meta) return null;
  const m = {
    demo: { cls: 'bg-amber-100 text-amber-900 ring-amber-300', icon: FlaskConical, text: t('badge.demo') },
    mock: { cls: 'bg-orange-100 text-orange-900 ring-orange-300', icon: Server, text: t('badge.mock') },
    live: { cls: 'bg-emerald-100 text-emerald-900 ring-emerald-300', icon: Cpu, text: t('badge.live', { m: meta.model }) },
  }[meta.mode];
  const Icon = m.icon;
  return (
    <span title={t('badge.provider', { p: meta.provider, m: meta.model, ms: meta.latencyMs })}
      className={`inline-flex max-w-full items-center gap-1 truncate rounded px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${m.cls}`}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden />{m.text}
    </span>
  );
}

export function MetaWarnings({ meta }: { meta?: AiMeta | null }) {
  if (!meta?.warnings.length) return null;
  return (
    <ul className="space-y-1">
      {meta.warnings.map((w) => (
        <li key={w} className="flex gap-2 rounded border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs text-orange-900"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{w}</li>
      ))}
    </ul>
  );
}

const STMT: Record<StatementKind, { key: 'stmt.fact' | 'stmt.assumption' | 'stmt.recommendation'; cls: string }> = {
  fact: { key: 'stmt.fact', cls: 'bg-sky-100 text-sky-900 ring-sky-300' },
  assumption: { key: 'stmt.assumption', cls: 'bg-violet-100 text-violet-900 ring-violet-300' },
  recommendation: { key: 'stmt.recommendation', cls: 'bg-emerald-100 text-emerald-900 ring-emerald-300' },
};
export function StatementTag({ kind }: { kind: StatementKind }) {
  const { t } = useApp();
  const m = STMT[kind];
  return <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] font-bold tracking-wide ring-1 ring-inset ${m.cls}`}>{t(m.key)}</span>;
}
export const statementLabel = (kind: StatementKind) => STMT[kind].key;

const SRC: Record<BriefItem['source'], { key: 'src.data' | 'src.derived' | 'src.unknown'; cls: string }> = {
  data: { key: 'src.data', cls: 'bg-sky-100 text-sky-900 ring-sky-300' },
  derived: { key: 'src.derived', cls: 'bg-slate-100 text-slate-700 ring-slate-300' },
  unknown: { key: 'src.unknown', cls: 'bg-amber-100 text-amber-900 ring-amber-300' },
};
export function SourceTag({ source }: { source: BriefItem['source'] }) {
  const { t } = useApp();
  const m = SRC[source];
  return <span className={`inline-flex shrink-0 items-center rounded px-1.5 py-px text-[10px] font-bold tracking-wide ring-1 ring-inset ${m.cls}`}>{t(m.key)}</span>;
}

export function ErrorAlert({ title, message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  const { t } = useApp();
  const msg = message === 'backend' ? t('err.backendDown') : message;
  return (
    <div role="alert" className="flex gap-3 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">
      <OctagonAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{title ?? t('err.title')}</div>
        <p className="mt-0.5">{msg}</p>
        <p className="mt-1 text-xs text-red-700">{t('err.noSubstitute')}</p>
        {onRetry && <button className="btn-ghost mt-2 !py-1 text-xs" onClick={onRetry}>{t('common.retry')}</button>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      {icon && <div className="text-slate-400">{icon}</div>}
      <div className="font-semibold text-slate-700">{title}</div>
      {children && <div className="max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function PipelineSteps({ steps, active, done }: { steps: string[]; active: number; done?: boolean }) {
  const { t } = useApp();
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold" aria-label={t('pipeline.aria')}>
      {steps.map((st, i) => {
        const state = done || i < active ? 'done' : i === active ? 'active' : 'idle';
        return (
          <li key={st} className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ring-1 ring-inset transition-colors ${
              state === 'done' ? 'bg-emerald-50 text-emerald-800 ring-emerald-300' : state === 'active' ? 'bg-navy-800 text-white ring-navy-700 animate-pulse-soft' : 'bg-slate-50 text-slate-500 ring-slate-200'}`}>
              {state === 'done' ? <CircleCheck className="h-3 w-3" aria-hidden /> : <span className="tabular-nums">{i + 1}</span>}{st}
            </span>
            {i < steps.length - 1 && <span className="text-slate-300" aria-hidden>→</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return <div className="space-y-2" aria-hidden>{Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton h-3.5 rounded" style={{ width: `${92 - i * 13}%` }} />)}</div>;
}

export function TrainingBadge() {
  const { t } = useApp();
  return <span className="inline-flex items-center gap-1 rounded bg-signal-amber px-2 py-0.5 text-[11px] font-bold text-navy-950">{t('badge.training')}</span>;
}

/** Простая постраничная навигация для длинных списков */
export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  const { t } = useApp();
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-2 text-xs text-slate-600">
      <button className="btn-ghost !px-2 !py-1 text-xs" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t('common.prev')}</button>
      <span>{t('common.page', { p: page, n: pages })}</span>
      <button className="btn-ghost !px-2 !py-1 text-xs" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t('common.next')}</button>
    </div>
  );
}
