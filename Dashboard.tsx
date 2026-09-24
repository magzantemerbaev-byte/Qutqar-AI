import { Activity, Bot, CloudLightning, Factory, Flame, LayoutDashboard, LifeBuoy, MapPinned, MonitorPlay, Radar as RadarIcon, Radio, Siren, Truck, Waves, X } from 'lucide-react';
import { memo, useEffect, useMemo, useState, type ComponentType } from 'react';
import KzMap from '../components/KzMap';
import Modal from '../components/Modal';
import RiskMap, { riskColor, riskLevelKey } from '../components/RiskMap';
import { ContentLangNote, EmptyState, ErrorAlert, Kpi, MetaWarnings, ModeBadge, PageHeader, SafetyNotice, Skeleton, Spinner, StatusPill, ThreatBadge } from '../components/ui';
import { useApp } from '../context';
import { TYPE_META } from '../data/meta';
import { DRIVER_TR } from '../data/risk';
import { fmtDateTime } from '../i18n';
import { ai } from '../services/aiService';
import { useSnapshot } from '../services/dataService';
import { locField } from '../../shared/engine/briefing';
import { regionById } from '../../shared/geo/kz';
import { tx } from '../../shared/i18n';
import type { AiMeta, DetailedAnalysis, MapObject, OperationalSnapshot, RiskAlert, RiskKind, SituationAnalysis, UnitStatus } from '../types';

export const UNIT_TONE: Record<UnitStatus, 'ok' | 'warn' | 'info' | 'idle' | 'bad'> = { available: 'ok', en_route: 'warn', on_scene: 'info', returning: 'idle', maintenance: 'idle' };

export default function Dashboard() {
  const { t } = useApp();
  const { snapshot, error, loading, reload } = useSnapshot();
  if (loading) return <><Head /><div className="card p-6"><Skeleton lines={6} /></div></>;
  if (error) return <><Head /><ErrorAlert title={t('err.ops')} message={error} onRetry={() => void reload()} /></>;
  if (!snapshot?.connected) {
    return <><Head /><div className="card"><EmptyState icon={<Siren className="h-10 w-10" />} title={t('empty.opsTitle')}>{snapshot?.message} {t('empty.opsText')}</EmptyState></div></>;
  }
  return <DashboardBody snap={snapshot} />;
}

function Head() {
  const { t, navigate } = useApp();
  return (
    <PageHeader icon={<LayoutDashboard className="h-5 w-5" />} title={t('dash.title')} subtitle={t('dash.subtitle')}
      actions={<>
        <button className="btn-ghost" onClick={() => navigate('map')}><MapPinned className="h-4 w-4" />{t('dash.openMap')}</button>
        <button className="btn-navy" onClick={() => navigate('presentation')}><MonitorPlay className="h-4 w-4" />{t('nav.presentation')}</button>
      </>} />
  );
}

function DashboardBody({ snap }: { snap: OperationalSnapshot }) {
  const { t, lang, navigate } = useApp();
  const incidents = snap.incidents;
  const units = snap.units ?? [];
  const [selectedId, setSelectedId] = useState<string>(incidents[0]?.id ?? '');
  const [showUnits, setShowUnits] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [analysis, setAnalysis] = useState<SituationAnalysis | null>(null);
  const [meta, setMeta] = useState<AiMeta | null>(null);
  const [aErr, setAErr] = useState<string | null>(null);
  const [aLoading, setALoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<DetailedAnalysis | null>(null);
  const [dErr, setDErr] = useState<string | null>(null);
  const selected = incidents.find((i) => i.id === selectedId) ?? incidents[0];
  const mapObjects = useMemo(() => [...incidents, ...snap.resources], [incidents, snap.resources]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setALoading(true); setAErr(null);
    ai.situation(selected).then((r) => { if (!cancelled) { setAnalysis(r.data); setMeta(r.meta); } })
      .catch((e: Error) => { if (!cancelled) { setAnalysis(null); setAErr(e.message); } })
      .finally(() => { if (!cancelled) setALoading(false); });
    return () => { cancelled = true; };
  }, [selected, lang]);

  const openDetail = () => {
    if (!selected) return;
    setDetail(null); setDErr(null); setDetailOpen(true);
    ai.detailed(selected).then((r) => setDetail(r.data)).catch((e: Error) => setDErr(e.message));
  };
  const available = units.filter((u) => u.status === 'available').length;

  return (
    <>
      <Head />
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label={t('dash.kpi.active')} value={snap.stats.active} note={t('dash.kpi.activeNote')} accent="bg-signal-red" icon={<Siren className="h-4 w-4" />} />
        <Kpi label={t('dash.kpi.fires')} value={snap.stats.fires} note={t('dash.kpi.firesNote')} accent="bg-orange-500" icon={<Flame className="h-4 w-4" />} />
        <Kpi label={t('dash.kpi.rescues')} value={snap.stats.rescues} note={t('dash.kpi.rescuesNote')} accent="bg-navy-500" icon={<LifeBuoy className="h-4 w-4" />} />
        <Kpi label={t('dash.kpi.units')} value={snap.stats.units} note={t('dash.kpi.unitsNote')} accent="bg-amber-500" icon={<Truck className="h-4 w-4" />} />
        <Kpi label={t('dash.kpi.available')} value={available} note={t('dash.kpi.availableNote')} accent="bg-emerald-600" icon={<Activity className="h-4 w-4" />} />
      </section>

      {!selected ? (
        <div className="card mt-4"><EmptyState icon={<Siren className="h-8 w-8" />} title={t('empty.noIncidents')} /></div>
      ) : (
        <section className="mt-4 grid gap-4 xl:grid-cols-5">
          <div className="card overflow-hidden xl:col-span-3">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <h2 className="section-title !text-base">{t('dash.mapTitle')}</h2>
              <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" className="h-4 w-4 accent-navy-600" checked={showUnits} onChange={(e) => setShowUnits(e.target.checked)} />{t('dash.showUnits')}</label>
            </div>
            <KzMap objects={mapObjects} units={showUnits ? units : undefined} selectedId={selected.id} onSelect={(id) => { if (incidents.some((i) => i.id === id)) { setSelectedId(id); setPanelOpen(true); } }} className="h-[440px]" />
          </div>
          <div className={`card flex flex-col overflow-hidden xl:col-span-2 ${panelOpen ? '' : 'hidden xl:flex'}`}>
            <div className="flex items-center justify-between gap-2 bg-navy-800 px-4 py-2.5 text-white">
              <h2 className="flex items-center gap-2 font-cond text-base font-semibold"><Bot className="h-4 w-4 text-signal-amber" />{t('dash.aiTitle')}</h2>
              <div className="flex items-center gap-2"><ModeBadge meta={meta} /><button className="rounded p-1 hover:bg-white/10 xl:hidden" onClick={() => setPanelOpen(false)} aria-label={t('dash.closePanel')}><X className="h-4 w-4" /></button></div>
            </div>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-slate-500">{TYPE_META[selected.type].emoji} {tx(lang, TYPE_META[selected.type].label)} · {selected.time}</div>
                  <div className="font-semibold text-slate-900">{locField(selected, 'title', lang)}</div>
                  <div className="text-xs text-slate-500">{locField(selected, 'region', lang)}</div>
                </div>
                {selected.threat && <ThreatBadge level={selected.threat} />}
              </div>
              {aErr ? <ErrorAlert message={aErr} /> : aLoading || !analysis ? (
                <div className="space-y-3 py-4"><Spinner label={t('dash.aiLoading')} /><Skeleton lines={4} /></div>
              ) : (
                <>
                  <MetaWarnings meta={meta} />
                  <p className="border-l-4 border-signal-red pl-3 text-sm leading-relaxed text-slate-800">{analysis.summary}</p>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded bg-slate-50 p-2"><dt className="text-xs text-slate-500">{t('dash.forecast')}</dt><dd className="font-medium text-slate-900">{analysis.direction}</dd></div>
                    <div className="rounded bg-slate-50 p-2"><dt className="text-xs text-slate-500">{t('dash.forces')}</dt><dd className="font-medium text-slate-900">{analysis.forces}</dd></div>
                  </dl>
                  <div>
                    <div className="eyebrow mb-1">{t('dash.factors')}</div>
                    <ul className="space-y-1 text-sm text-slate-700">{analysis.factors.map((f) => <li key={f} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />{f}</li>)}</ul>
                  </div>
                  {analysis.monitoring && <StatusPill tone="warn">{t('dash.monitoring')}</StatusPill>}
                </>
              )}
              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                <button className="btn-navy !py-1.5" onClick={openDetail}><Activity className="h-4 w-4" />{t('dash.detailed')}</button>
                <button className="btn-ghost !py-1.5" onClick={() => navigate('briefing', { incident: selected.id })}><Radio className="h-4 w-4" />{t('dash.toBriefing')}</button>
                <button className="btn-ghost !py-1.5" onClick={() => navigate('resources', { incident: selected.id })}><Truck className="h-4 w-4" />{t('dash.toResources')}</button>
              </div>
              <SafetyNotice />
            </div>
          </div>
        </section>
      )}

      {snap.risk ? <RiskCenter risk={snap.risk} /> : <div className="card mt-4"><EmptyState icon={<RadarIcon className="h-8 w-8" />} title={t('risk.none')} /></div>}

      <section className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <h2 className="section-title border-b border-slate-200 px-4 py-3">{t('dash.feed')}</h2>
          <ul className="divide-y divide-slate-100">
            {incidents.map((i) => <FeedRow key={i.id} i={i} active={i.id === selected?.id} onClick={() => { setSelectedId(i.id); setPanelOpen(true); }} />)}
          </ul>
        </div>
        <div className="card">
          <h2 className="section-title border-b border-slate-200 px-4 py-3">{t('dash.unitsAtWork')}</h2>
          <ul className="scroll-thin max-h-[420px] divide-y divide-slate-100 overflow-y-auto">
            {units.filter((u) => u.assignment).map((u) => {
              const inc = incidents.find((i) => i.id === u.assignment);
              return (
                <li key={u.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="w-28 shrink-0 font-mono text-xs font-semibold text-slate-900">{u.callsign}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-600">{inc ? locField(inc, 'title', lang) : u.assignment}</span>
                  <StatusPill tone={UNIT_TONE[u.status]}>{t(`unit.${u.status}`)}</StatusPill>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title={detail?.title ?? t('dash.detailed')} wide>
        {dErr ? <ErrorAlert message={dErr} /> : !detail ? <div className="py-10"><Spinner label={t('dash.detailLoading')} /></div> : (
          <div className="space-y-5 text-sm">
            <ContentLangNote />
            <section><h3 className="section-title mb-2 !text-base">{t('dash.detailForecast')}</h3>
              <ol className="space-y-2">{detail.forecast.map((f) => <li key={f.horizon} className="flex gap-3"><span className="w-20 shrink-0 font-mono text-xs font-bold text-navy-700">{f.horizon}</span><span className="text-slate-800">{f.text}</span></li>)}</ol></section>
            <section><h3 className="section-title mb-2 !text-base">{t('dash.detailRisks')}</h3>
              <ul className="space-y-1.5">{detail.risks.map((r) => <li key={r} className="rounded border-l-4 border-orange-400 bg-orange-50 px-3 py-1.5 text-slate-800">{r}</li>)}</ul></section>
            <section><h3 className="section-title mb-2 !text-base">{t('dash.detailRecs')}</h3>
              <ol className="list-decimal space-y-1.5 pl-5 text-slate-700">{detail.recommendations.map((r) => <li key={r}>{r}</li>)}</ol></section>
            <SafetyNotice />
          </div>
        )}
      </Modal>
    </>
  );
}

const FeedRow = memo(function FeedRow({ i, active, onClick }: { i: MapObject; active: boolean; onClick: () => void }) {
  const { lang } = useApp();
  return (
    <li>
      <button onClick={onClick} className={`flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-slate-50 ${active ? 'bg-amber-50/70' : ''}`}>
        <span className="text-lg" aria-hidden>{TYPE_META[i.type].emoji}</span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-900">{locField(i, 'title', lang)}</span><span className="block truncate text-xs text-slate-500">{locField(i, 'region', lang)} · {i.time} · {locField(i, 'status', lang)}</span></span>
        {i.threat && <ThreatBadge level={i.threat} size="sm" />}
      </button>
    </li>
  );
});

/* ═════════════ AI RISK CENTER ═════════════ */
const KINDS: { kind: RiskKind; key: 'risk.fire' | 'risk.flood' | 'risk.weather' | 'risk.hazmat'; icon: ComponentType<{ className?: string }> }[] = [
  { kind: 'fire', key: 'risk.fire', icon: Flame }, { kind: 'flood', key: 'risk.flood', icon: Waves },
  { kind: 'weather', key: 'risk.weather', icon: CloudLightning }, { kind: 'hazmat', key: 'risk.hazmat', icon: Factory },
];
const LEVEL_CLS = { critical: 'border-red-700 bg-red-700 text-white', high: 'border-red-400 bg-red-50 text-red-900', medium: 'border-amber-400 bg-amber-50 text-amber-900', low: 'border-emerald-400 bg-emerald-50 text-emerald-900' };
const alertField = (a: RiskAlert, k: 'title' | 'text' | 'region' | 'horizon', lang: 'ru' | 'kz' | 'en') => a.tr?.[lang]?.[k] ?? a[k];

export function RiskCenter({ risk, compact }: { risk: NonNullable<OperationalSnapshot['risk']>; compact?: boolean }) {
  const { t, lang } = useApp();
  const [kind, setKind] = useState<RiskKind>('fire');
  const [sel, setSel] = useState<string | null>(null);
  const rName = (id: string, fb: string) => regionById(id)?.name[lang] ?? fb;
  const driver = (txt: string) => (lang === 'ru' ? txt : DRIVER_TR[txt]?.[lang] ?? txt);
  const top = useMemo(() => KINDS.map((k) => {
    const sorted = [...risk.regions].sort((a, b) => b.risks[k.kind] - a.risks[k.kind]);
    const avg = Math.round(risk.regions.reduce((s, r) => s + r.risks[k.kind], 0) / Math.max(1, risk.regions.length));
    return { ...k, max: sorted[0], avg, high: risk.regions.filter((r) => r.risks[k.kind] >= 60).length };
  }), [risk]);
  const region = risk.regions.find((r) => r.id === sel) ?? null;
  const ranking = useMemo(() => [...risk.regions].sort((a, b) => b.risks[kind] - a.risks[kind]).slice(0, 6), [risk, kind]);

  return (
    <section className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-navy-950" aria-label="AI RISK CENTER">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
        <h2 className="flex items-center gap-2 font-cond text-xl font-bold tracking-[0.08em] text-white"><RadarIcon className="h-5 w-5 text-signal-amber" />{t('risk.title')}</h2>
        <span className="text-xs text-slate-400">{t('risk.updated', { d: fmtDateTime(risk.updatedAt) })}</span>
      </div>
      <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
        {top.map((k) => {
          const Icon = k.icon;
          const active = kind === k.kind;
          const mv = k.max?.risks[k.kind] ?? 0;
          return (
            <button key={k.kind} onClick={() => setKind(k.kind)} aria-pressed={active}
              className={`rounded-lg p-3 text-left ring-1 transition ${active ? 'bg-white ring-signal-amber' : 'bg-white/5 ring-white/10 hover:bg-white/10'}`}>
              <div className={`flex items-center gap-2 text-sm font-semibold ${active ? 'text-slate-900' : 'text-slate-100'}`}><Icon className="h-4 w-4" />{t(k.key)}</div>
              <div className="mt-2 flex items-end gap-2">
                <span className="font-cond text-3xl font-bold leading-none" style={{ color: riskColor(mv) }}>{mv}</span>
                <span className={`pb-0.5 text-xs ${active ? 'text-slate-600' : 'text-slate-300'}`}>{t('risk.max', { r: k.max ? rName(k.max.id, k.max.region) : '—' })}</span>
              </div>
              <div className={`mt-1 text-xs ${active ? 'text-slate-500' : 'text-slate-400'}`}>{t('risk.avg', { a: k.avg, n: k.high })}</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded bg-slate-200/30"><div className="h-full" style={{ width: `${k.avg}%`, background: riskColor(k.avg) }} /></div>
            </button>
          );
        })}
      </div>
      {!compact && (
        <div className="grid gap-3 p-3 pt-0 xl:grid-cols-3">
          <div className="card relative overflow-hidden xl:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
              <h3 className="section-title !text-base">{t('risk.mapTitle', { k: t(KINDS.find((x) => x.kind === kind)!.key).toLowerCase() })}</h3>
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-600">{[10, 30, 50, 70, 90].map((v) => <span key={v} className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: riskColor(v) }} />{t(riskLevelKey(v))}</span>)}</div>
            </div>
            <RiskMap regions={risk.regions} kind={kind} selectedId={sel} onSelect={setSel} className="h-[380px]" />
            {region && (
              <div className="border-t border-slate-200 bg-white p-4 md:absolute md:bottom-3 md:right-3 md:z-[1000] md:w-72 md:rounded-lg md:border md:shadow-lg">
                <div className="flex items-start justify-between"><h4 className="font-semibold text-slate-900">{rName(region.id, region.region)}</h4>
                  <button onClick={() => setSel(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label={t('common.close')}><X className="h-4 w-4" /></button></div>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {KINDS.map((k) => (
                    <li key={k.kind}>
                      <div className="flex justify-between"><span className="text-slate-600">{t(k.key)}</span><span className="font-bold" style={{ color: riskColor(region.risks[k.kind]) }}>{region.risks[k.kind]}</span></div>
                      {region.drivers[k.kind] && <div className="text-xs text-slate-500">{driver(region.drivers[k.kind]!)}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="space-y-3">
            <div className="card">
              <h3 className="section-title border-b border-slate-200 px-4 py-2 !text-base">{t('risk.alerts')}</h3>
              <ul className="space-y-2 p-3">
                {risk.alerts.map((a) => (
                  <li key={a.id} className={`rounded-md border-l-4 p-2.5 ${LEVEL_CLS[a.level]}`}>
                    <div className="flex items-center justify-between gap-2 text-sm font-semibold"><span>{alertField(a, 'title', lang)}</span><span className="shrink-0 text-[11px] opacity-80">{alertField(a, 'horizon', lang)}</span></div>
                    <div className="text-xs font-medium opacity-90">{alertField(a, 'region', lang)}</div>
                    <p className="mt-0.5 text-xs opacity-90">{alertField(a, 'text', lang)}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card">
              <h3 className="section-title border-b border-slate-200 px-4 py-2 !text-base">{t('risk.top')}</h3>
              <ol className="divide-y divide-slate-100">
                {ranking.map((r, i) => (
                  <li key={r.id}><button onClick={() => setSel(r.id)} className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-slate-50">
                    <span className="w-4 text-xs text-slate-400">{i + 1}</span><span className="flex-1">{rName(r.id, r.region)}</span>
                    <span className="rounded px-1.5 text-xs font-bold text-white" style={{ background: riskColor(r.risks[kind]) }}>{r.risks[kind]}</span>
                  </button></li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
