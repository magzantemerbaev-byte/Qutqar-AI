import { Calculator, Radio, Search, Truck, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import KzMap from '../components/KzMap';
import { EmptyState, ErrorAlert, PageHeader, Pager, SafetyNotice, Skeleton, StatusPill, ThreatBadge } from '../components/ui';
import { useApp } from '../context';
import { TYPE_META } from '../data/meta';
import { fmtKZT, fmtNum } from '../i18n';
import { useSnapshot } from '../services/dataService';
import { locField } from '../../shared/engine/briefing';
import { UNIT_KIND_EMOJI, UNIT_KIND_LABEL, optimizeDeployment } from '../../shared/engine/resources';
import { KZ_REGIONS, cityById, regionById } from '../../shared/geo/kz';
import { tx } from '../../shared/i18n';
import type { DeploymentPlan, ResourceUnit, UnitKind, UnitStatus } from '../types';
import { UNIT_TONE } from './Dashboard';

const KINDS: UnitKind[] = ['fire_engine', 'rescue', 'ladder', 'tanker', 'ambulance', 'drone'];
const STATUSES: UnitStatus[] = ['available', 'en_route', 'on_scene', 'returning', 'maintenance'];
const PAGE = 25;

export default function Resources() {
  const { t, lang, params, navigate } = useApp();
  const { snapshot, error, loading, reload } = useSnapshot();
  const units = useMemo(() => snapshot?.units ?? [], [snapshot]);
  const incidents = useMemo(() => (snapshot?.connected ? snapshot.incidents : []), [snapshot]);
  const [kind, setKind] = useState<'' | UnitKind>('');
  const [status, setStatus] = useState<'' | UnitStatus>('');
  const [region, setRegion] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [incId, setIncId] = useState(params.get('incident') ?? '');
  const [plan, setPlan] = useState<DeploymentPlan | null>(null);

  useEffect(() => { if (!incId && incidents[0]) setIncId(incidents[0].id); }, [incidents, incId]);
  const incident = incidents.find((i) => i.id === incId) ?? null;
  const calc = () => { if (incident) setPlan(optimizeDeployment(incident, units, lang)); };
  // Пересчет при смене происшествия / языка (алгоритм детерминирован и быстрый)
  useEffect(() => { if (incident && units.length) setPlan(optimizeDeployment(incident, units, lang)); }, [incident, units, lang]);

  const filtered = useMemo(() => {
    const qq = q.trim().toUpperCase();
    return units.filter((u) => (!kind || u.kind === kind) && (!status || u.status === status) && (!region || u.department === `dep-${region}`) && (!qq || u.callsign.includes(qq)));
  }, [units, kind, status, region, q]);
  useEffect(() => setPage(1), [kind, status, region, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const rows = filtered.slice((page - 1) * PAGE, page * PAGE);

  const planUnits = useMemo(() => (plan ? plan.suggestions.map((s) => units.find((u) => u.id === s.unitId)).filter((u): u is ResourceUnit => Boolean(u)) : []), [plan, units]);
  const lines = useMemo(() => (incident && plan ? planUnits.map((u) => [[incident.lat, incident.lng], [u.lat, u.lng]] as [[number, number], [number, number]]) : undefined), [incident, plan, planUnits]);

  const head = <PageHeader icon={<Truck className="h-5 w-5" />} title={t('res.title')} subtitle={t('res.subtitle')} />;
  if (loading) return <>{head}<div className="card p-6"><Skeleton lines={6} /></div></>;
  if (error) return <>{head}<ErrorAlert title={t('err.ops')} message={error} onRetry={() => void reload()} /></>;
  if (!snapshot?.connected) return <>{head}<div className="card"><EmptyState icon={<Truck className="h-10 w-10" />} title={t('empty.opsTitle')}>{snapshot?.message} {t('empty.opsText')}</EmptyState></div></>;
  if (!units.length) return <>{head}<div className="card"><EmptyState icon={<Truck className="h-10 w-10" />} title={t('res.none')}>{t('res.noneText')}</EmptyState></div></>;

  const deptName = (u: ResourceUnit) => regionById(u.department.replace('dep-', ''))?.name[lang] ?? u.department;
  const cityName = (id: string) => cityById(id)?.name[lang] ?? id;

  return (
    <>
      {head}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {KINDS.map((k) => {
          const all = units.filter((u) => u.kind === k);
          const av = all.filter((u) => u.status === 'available').length;
          return (
            <button key={k} onClick={() => setKind(kind === k ? '' : k)} aria-pressed={kind === k}
              className={`card p-3 text-left transition ${kind === k ? 'ring-2 ring-signal-amber' : 'hover:-translate-y-0.5'}`}>
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800"><span aria-hidden>{UNIT_KIND_EMOJI[k]}</span>{tx(lang, UNIT_KIND_LABEL[k])}</div>
              <div className="mt-1 font-cond text-2xl font-bold text-slate-900">{av}<span className="text-base font-medium text-slate-400"> / {all.length}</span></div>
              <div className="text-xs text-slate-500">{t('res.availableOf', { a: av, n: all.length })}</div>
            </button>
          );
        })}
      </section>

      <section className="mt-4 overflow-hidden rounded-lg border border-white/10 bg-navy-950">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
          <h2 className="flex items-center gap-2 font-cond text-lg font-semibold text-white"><Calculator className="h-5 w-5 text-signal-amber" />{t('res.optimize')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="r-inc">{t('res.selectIncident')}</label>
            <select id="r-inc" className="input !w-auto min-w-[240px]" value={incId} onChange={(e) => setIncId(e.target.value)}>
              {incidents.map((i) => <option key={i.id} value={i.id}>{TYPE_META[i.type].emoji} {locField(i, 'title', lang)} — {locField(i, 'region', lang)}</option>)}
            </select>
            <button className="btn-primary" onClick={calc}><Calculator className="h-4 w-4" />{t('res.calc')}</button>
          </div>
        </div>
        <div className="flex items-start gap-3 border-b border-signal-amber/40 bg-signal-amber px-4 py-2.5 text-navy-950" role="note">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <div><div className="font-cond text-base font-bold tracking-wide">{t('res.demoRec')}</div><p className="text-xs">{t('res.demoRecText')}</p></div>
        </div>
        {incident && plan && (
          <div className="grid gap-3 p-3 xl:grid-cols-5">
            <div className="card space-y-3 p-4 xl:col-span-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><div className="font-semibold text-slate-900">{locField(incident, 'title', lang)}</div><div className="text-xs text-slate-500">{locField(incident, 'region', lang)}</div></div>
                {incident.threat && <ThreatBadge level={incident.threat} />}
              </div>
              <div>
                <div className="eyebrow mb-1">{t('res.requirements')}</div>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {plan.requirements.map((r) => (
                    <li key={r.kind} className="rounded border border-slate-200 p-2 text-sm"><span className="font-semibold">{UNIT_KIND_EMOJI[r.kind]} {tx(lang, UNIT_KIND_LABEL[r.kind])} × {r.count}</span><span className="block text-xs text-slate-500">{r.reason}</span></li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="eyebrow mb-1">{t('res.suggested')}</div>
                <div className="overflow-x-auto rounded border border-slate-200">
                  <table className="data-table min-w-[520px]">
                    <thead><tr><th>{t('res.col.callsign')}</th><th>{t('res.col.kind')}</th><th>{t('res.col.location')}</th><th className="text-right">{t('res.col.distance')}</th><th className="text-right">{t('res.col.eta')}</th><th className="text-right">{t('res.col.crew')}</th></tr></thead>
                    <tbody>
                      {plan.suggestions.map((s) => (
                        <tr key={s.unitId}>
                          <td className="font-mono text-xs font-semibold">{s.callsign}{s.remote && <span className="ml-1 tag bg-amber-100 font-sans text-amber-900">{t('res.remote')}</span>}</td><td>{UNIT_KIND_EMOJI[s.kind]} {tx(lang, UNIT_KIND_LABEL[s.kind])}</td><td>{cityName(s.city)}</td>
                          <td className="text-right tabular-nums">{fmtNum(s.distanceKm, lang)} {t('common.km')}</td><td className={`text-right tabular-nums ${s.remote ? 'font-semibold text-amber-700' : ''}`}>{s.etaMin} {t('common.min')}</td><td className="text-right tabular-nums">{s.crew}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              {plan.suggestions.some((x) => x.remote) && <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-sm text-amber-900">{t('res.remoteNote')}</div>}
              {plan.shortages.length ? (
                <div className="rounded-md border border-red-300 bg-red-50 p-2.5 text-sm text-red-900"><strong>{t('res.shortage')}:</strong> {plan.shortages.map((s) => `${tx(lang, UNIT_KIND_LABEL[s.kind])} × ${s.missing}`).join(', ')}</div>
              ) : <StatusPill tone="ok">{t('res.noShortage')}</StatusPill>}
              <dl className="grid grid-cols-3 gap-2 text-sm">
                <div className="rounded bg-slate-50 p-2"><dt className="text-xs text-slate-500">{t('res.totalCrew')}</dt><dd className="font-cond text-xl font-bold">{plan.totalCrew}</dd></div>
                <div className="rounded bg-slate-50 p-2"><dt className="text-xs text-slate-500">{t('res.maxEta')}</dt><dd className="font-cond text-xl font-bold">{plan.maxEtaMin} {t('common.min')}</dd></div>
                <div className="rounded bg-slate-50 p-2"><dt className="text-xs text-slate-500">{t('res.fuel')}</dt><dd className="font-cond text-xl font-bold">{fmtKZT(plan.fuelCostKzt, lang)}</dd></div>
              </dl>
              <details className="text-xs text-slate-600"><summary className="cursor-pointer font-semibold">{t('res.assumptions')}</summary><ul className="mt-1 list-disc space-y-0.5 pl-5">{plan.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></details>
              <SafetyNotice />
              <button className="btn-ghost" onClick={() => navigate('briefing', { incident: incident.id })}><Radio className="h-4 w-4" />{t('dash.toBriefing')}</button>
            </div>
            <div className="card overflow-hidden xl:col-span-2">
              <div className="border-b border-slate-200 px-4 py-2 text-sm font-semibold">{t('res.onMap')}</div>
              <KzMap objects={[incident]} units={planUnits} selectedId={incident.id} lines={lines} flyToSelected className="h-[460px]" />
            </div>
          </div>
        )}
      </section>

      <section className="card mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="section-title mr-auto">{t('res.inventory')} <span className="text-sm font-normal text-slate-500">({filtered.length})</span></h2>
          <div className="relative"><Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-slate-400" /><input className="input !w-36 pl-7" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('res.searchCallsign')} aria-label={t('res.searchCallsign')} /></div>
          <select className="input !w-auto" value={kind} onChange={(e) => setKind(e.target.value as '' | UnitKind)} aria-label={t('res.col.kind')}><option value="">{t('res.filterKind')}</option>{KINDS.map((k) => <option key={k} value={k}>{tx(lang, UNIT_KIND_LABEL[k])}</option>)}</select>
          <select className="input !w-auto" value={status} onChange={(e) => setStatus(e.target.value as '' | UnitStatus)} aria-label={t('res.col.status')}><option value="">{t('res.filterStatus')}</option>{STATUSES.map((s) => <option key={s} value={s}>{t(`unit.${s}`)}</option>)}</select>
          <select className="input !w-auto" value={region} onChange={(e) => setRegion(e.target.value)} aria-label={t('common.region')}><option value="">{t('res.filterRegion')}</option>{KZ_REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name[lang]}</option>)}</select>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[860px]">
            <thead><tr><th>{t('res.col.callsign')}</th><th>{t('res.col.kind')}</th><th>{t('res.col.status')}</th><th>{t('res.col.dept')}</th><th>{t('res.col.location')}</th><th className="text-right">{t('res.col.crew')}</th><th>{t('res.col.assignment')}</th></tr></thead>
            <tbody>
              {rows.map((u) => {
                const inc = incidents.find((i) => i.id === u.assignment);
                return (
                  <tr key={u.id}>
                    <td className="font-mono text-xs font-semibold text-slate-900">{u.callsign}</td>
                    <td>{UNIT_KIND_EMOJI[u.kind]} {tx(lang, UNIT_KIND_LABEL[u.kind])}</td>
                    <td><StatusPill tone={UNIT_TONE[u.status]}>{t(`unit.${u.status}`)}</StatusPill></td>
                    <td className="text-xs text-slate-600">{deptName(u)} · DEMO</td>
                    <td>{cityName(u.city)}</td>
                    <td className="text-right tabular-nums">{u.crew}</td>
                    <td className="text-xs text-slate-600">{inc ? locField(inc, 'title', lang) : t('res.idle')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager page={page} pages={pages} onPage={setPage} />
      </section>
    </>
  );
}
