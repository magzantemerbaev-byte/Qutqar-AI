import { Map as MapIcon, Maximize2, Radio, Search, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import KzMap from '../components/KzMap';
import { EmptyState, ErrorAlert, PageHeader, Skeleton, ThreatBadge } from '../components/ui';
import { useApp } from '../context';
import { INCIDENT_TYPES, TYPE_META } from '../data/meta';
import { useSnapshot } from '../services/dataService';
import { locDetails, locField } from '../../shared/engine/briefing';
import { distanceKm } from '../../shared/engine/resources';
import { tx } from '../../shared/i18n';
import type { MapObject, ObjectType } from '../types';

export default function EmergencyMap() {
  const { t } = useApp();
  const { snapshot, error, loading, reload } = useSnapshot();
  const head = <PageHeader icon={<MapIcon className="h-5 w-5" />} title={t('map.title')} subtitle={t('map.subtitle')} />;
  if (loading) return <>{head}<div className="card p-6"><Skeleton lines={5} /></div></>;
  if (error) return <>{head}<ErrorAlert title={t('err.ops')} message={error} onRetry={() => void reload()} /></>;
  if (!snapshot?.connected) return <>{head}<div className="card"><EmptyState icon={<MapIcon className="h-10 w-10" />} title={t('empty.opsTitle')}>{snapshot?.message} {t('empty.opsText')}</EmptyState></div></>;
  return <>{head}<MapBody all={[...snapshot.incidents, ...snapshot.resources]} /></>;
}

const TYPES: ObjectType[] = ['fire', 'flood', 'accident', 'hazard', 'unit', 'hospital', 'water'];

function MapBody({ all }: { all: MapObject[] }) {
  const { t, lang, navigate } = useApp();
  const [filters, setFilters] = useState<Set<ObjectType>>(new Set(TYPES));
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((o) => filters.has(o.type) && (!q || `${locField(o, 'title', lang)} ${locField(o, 'region', lang)} ${o.title} ${o.region}`.toLowerCase().includes(q)));
  }, [all, filters, query, lang]);
  const counts = useMemo(() => { const c: Partial<Record<ObjectType, number>> = {}; all.forEach((o) => { c[o.type] = (c[o.type] ?? 0) + 1; }); return c; }, [all]);
  const selected = all.find((o) => o.id === selectedId) ?? null;
  const isIncident = selected ? INCIDENT_TYPES.includes(selected.type) : false;
  const nearest = useMemo(() => {
    if (!selected || !isIncident) return [];
    return (['unit', 'hospital', 'water'] as ObjectType[]).map((type) => {
      const best = all.filter((o) => o.type === type).map((o) => ({ o, d: distanceKm(selected, o) })).sort((a, b) => a.d - b.d)[0];
      return best ? { type, ...best } : null;
    }).filter((x): x is { type: ObjectType; o: MapObject; d: number } => Boolean(x));
  }, [selected, isIncident, all]);
  const lines = useMemo(() => (selected ? nearest.map((n) => [[selected.lat, selected.lng], [n.o.lat, n.o.lng]] as [[number, number], [number, number]]) : undefined), [nearest, selected]);
  const toggle = (ty: ObjectType) => setFilters((f) => { const n = new Set(f); if (n.has(ty)) n.delete(ty); else n.add(ty); return n; });

  return (
    <div className="grid gap-4 xl:grid-cols-4">
      <div className="space-y-3 xl:col-span-1">
        <div className="card p-3">
          <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><input className="input pl-8" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('map.search')} aria-label={t('map.search')} /></div>
          <div className="eyebrow mb-1.5 mt-3">{t('map.filters')}</div>
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((ty) => (
              <button key={ty} onClick={() => toggle(ty)} aria-pressed={filters.has(ty)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition ${filters.has(ty) ? 'bg-navy-800 text-white ring-navy-800' : 'bg-white text-slate-500 ring-slate-300'}`}>
                {TYPE_META[ty].emoji} {tx(lang, TYPE_META[ty].plural)} <span className="opacity-70">{counts[ty] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="card overflow-hidden">
          <div className="border-b border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800">{t('map.list', { n: visible.length })}</div>
          <ul className="scroll-thin max-h-[440px] divide-y divide-slate-100 overflow-y-auto">
            {visible.map((o) => (
              <li key={o.id}><button onClick={() => setSelectedId(o.id)} className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 ${o.id === selectedId ? 'bg-amber-50' : ''}`}>
                <span aria-hidden>{TYPE_META[o.type].emoji}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-medium text-slate-900">{locField(o, 'title', lang)}</span><span className="block truncate text-xs text-slate-500">{locField(o, 'region', lang)}</span></span>
                {o.threat && <ThreatBadge level={o.threat} size="sm" />}
              </button></li>
            ))}
            {!visible.length && <li className="px-3 py-6 text-center text-sm text-slate-500">{t('map.nothing')}</li>}
          </ul>
        </div>
      </div>
      <div className="card relative overflow-hidden xl:col-span-2">
        <KzMap objects={visible} selectedId={selectedId} onSelect={setSelectedId} className="h-[620px]" flyToSelected lines={lines} resetKey={resetKey} />
        <button onClick={() => { setSelectedId(null); setResetKey((k) => k + 1); }} className="btn-ghost absolute bottom-3 left-3 z-[500] !py-1.5 text-xs shadow"><Maximize2 className="h-3.5 w-3.5" />{t('map.reset')}</button>
      </div>
      <div className="card xl:col-span-1">
        {!selected ? <EmptyState icon={<MapIcon className="h-8 w-8" />} title={t('map.select')} /> : (
          <div className="space-y-3 p-4">
            <div className="text-xs text-slate-500">{TYPE_META[selected.type].emoji} {tx(lang, TYPE_META[selected.type].label)}{selected.time ? ` · ${selected.time}` : ''}</div>
            <h2 className="font-cond text-lg font-semibold text-slate-900">{locField(selected, 'title', lang)}</h2>
            <div className="text-sm text-slate-600">{locField(selected, 'region', lang)}</div>
            {selected.threat && <ThreatBadge level={selected.threat} />}
            <p className="text-sm text-slate-800">{locField(selected, 'description', lang)}</p>
            {selected.status && <div className="text-sm"><span className="text-slate-500">{t('common.status')}: </span><span className="font-medium">{locField(selected, 'status', lang)}</span></div>}
            {locDetails(selected, lang).length > 0 && (
              <dl className="grid grid-cols-2 gap-2 text-sm">{locDetails(selected, lang).map((d) => <div key={d.label} className="rounded bg-slate-50 p-2"><dt className="text-xs text-slate-500">{d.label}</dt><dd className="font-medium text-slate-900">{d.value}</dd></div>)}</dl>
            )}
            {isIncident && (
              <>
                <div>
                  <div className="eyebrow mb-1">{t('map.nearest')}</div>
                  <ul className="space-y-1.5 text-sm">{nearest.map((n) => <li key={n.type} className="flex gap-2"><span aria-hidden>{TYPE_META[n.type].emoji}</span><span className="flex-1"><span className="block font-medium text-slate-800">{locField(n.o, 'title', lang)}</span><span className="text-xs text-slate-500">{t('map.distance', { d: Math.round(n.d) })}</span></span></li>)}</ul>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-navy !py-1.5" onClick={() => navigate('briefing', { incident: selected.id })}><Radio className="h-4 w-4" />{t('dash.toBriefing')}</button>
                  <button className="btn-ghost !py-1.5" onClick={() => navigate('resources', { incident: selected.id })}><Truck className="h-4 w-4" />{t('dash.toResources')}</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
