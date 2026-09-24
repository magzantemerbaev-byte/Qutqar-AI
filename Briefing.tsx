import { FileText, Printer, Radio, Sparkles, Truck } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { EmptyState, ErrorAlert, MetaWarnings, ModeBadge, PageHeader, SafetyNotice, Skeleton, SourceTag, ThreatBadge } from '../components/ui';
import { useApp } from '../context';
import { INCIDENT_TYPES, TYPE_META } from '../data/meta';
import { fmtDateTime } from '../i18n';
import type { TKey } from '../i18n';
import { ai } from '../services/aiService';
import { useSnapshot } from '../services/dataService';
import { locField } from '../../shared/engine/briefing';
import { optimizeDeployment } from '../../shared/engine/resources';
import { KZ_CITIES } from '../../shared/geo/kz';
import { tx } from '../../shared/i18n';
import type { AiMeta, BriefItem, MapObject, ObjectType, OperationalBriefing, ThreatLevel } from '../types';

const SECTIONS: { key: keyof Pick<OperationalBriefing, 'situation' | 'threats' | 'people' | 'weather' | 'resources' | 'priorities' | 'gaps' | 'questions'>; t: TKey }[] = [
  { key: 'situation', t: 'brief.s.situation' }, { key: 'threats', t: 'brief.s.threats' }, { key: 'people', t: 'brief.s.people' },
  { key: 'weather', t: 'brief.s.weather' }, { key: 'resources', t: 'brief.s.resources' }, { key: 'priorities', t: 'brief.s.priorities' },
  { key: 'gaps', t: 'brief.s.gaps' }, { key: 'questions', t: 'brief.s.questions' },
];

interface Manual { type: ObjectType; title: string; city: string; description: string; threat: ThreatLevel; known: string; atRisk: string; injured: string; evacuated: string }
const EMPTY: Manual = { type: 'fire', title: '', city: 'ast', description: '', threat: 'medium', known: '', atRisk: '', injured: '', evacuated: '' };
const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v)) ? undefined : Math.max(0, Math.round(Number(v))));

export default function Briefing() {
  const { t, lang, params, navigate } = useApp();
  const { snapshot, error: snapErr } = useSnapshot();
  const incidents = snapshot?.connected ? snapshot.incidents : [];
  const [mode, setMode] = useState<'list' | 'manual'>('list');
  const [incId, setIncId] = useState(params.get('incident') ?? '');
  const [manual, setManual] = useState<Manual>(EMPTY);
  const [brief, setBrief] = useState<OperationalBriefing | null>(null);
  const [meta, setMeta] = useState<AiMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (!incId && incidents[0]) setIncId(incidents[0].id); }, [incidents, incId]);

  const manualIncident = useMemo((): MapObject | null => {
    if (!manual.title.trim() || !manual.description.trim()) return null;
    const c = KZ_CITIES.find((x) => x.id === manual.city)!;
    const people = { known: num(manual.known), atRisk: num(manual.atRisk), injured: num(manual.injured), evacuated: num(manual.evacuated) };
    const hasPeople = Object.values(people).some((v) => v !== undefined);
    return {
      id: 'manual', type: manual.type, title: manual.title.trim(), description: manual.description.trim(), region: c.name[lang], city: c.id, regionId: c.region,
      lat: c.lat, lng: c.lng, threat: manual.threat, time: fmtDateTime(new Date()).split(', ')[1],
      people: hasPeople ? Object.fromEntries(Object.entries(people).filter(([, v]) => v !== undefined)) : undefined,
    };
  }, [manual, lang]);

  const generate = async (e?: FormEvent) => {
    e?.preventDefault();
    const inc = mode === 'list' ? incidents.find((i) => i.id === incId) : manualIncident;
    if (!inc) { setError(t('brief.f.required')); return; }
    setLoading(true); setError(null); setBrief(null);
    try {
      const weather = (inc.regionId && snapshot?.weather?.[inc.regionId]) || null;
      const plan = snapshot?.units?.length ? optimizeDeployment(inc, snapshot.units, lang) : null;
      const r = await ai.briefing(inc, weather, plan);
      setBrief(r.data); setMeta(r.meta);
    } catch (err) { setError((err as Error).message); } finally { setLoading(false); }
  };
  // Автогенерация, если пришли по ссылке с дашборда/карты
  useEffect(() => { if (params.get('incident') && incidents.length) void generate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [incidents.length, lang]);

  const upd = (k: keyof Manual) => (e: { target: { value: string } }) => setManual((m) => ({ ...m, [k]: e.target.value }));

  return (
    <>
      <PageHeader icon={<Radio className="h-5 w-5" />} title={t('brief.title')} subtitle={t('brief.subtitle')} />
      <div className="grid gap-4 xl:grid-cols-3">
        <form onSubmit={(e) => void generate(e)} className="card h-fit space-y-3 p-4">
          <div className="eyebrow">{t('brief.source')}</div>
          <div className="grid grid-cols-2 gap-1 rounded-md bg-slate-100 p-1 text-sm" role="tablist">
            {(['list', 'manual'] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                className={`rounded px-2 py-1.5 font-medium ${mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}>{m === 'list' ? t('brief.fromList') : t('brief.manual')}</button>
            ))}
          </div>
          {snapErr && mode === 'list' && <ErrorAlert title={t('err.ops')} message={snapErr} />}
          {mode === 'list' ? (
            <div>
              <label className="label" htmlFor="b-inc">{t('brief.incident')}</label>
              <select id="b-inc" className="input" value={incId} onChange={(e) => setIncId(e.target.value)}>
                {incidents.map((i) => <option key={i.id} value={i.id}>{TYPE_META[i.type].emoji} {locField(i, 'title', lang)} — {locField(i, 'region', lang)}</option>)}
              </select>
              {!incidents.length && !snapErr && <p className="mt-1 text-xs text-slate-500">{t('empty.opsTitle')}</p>}
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div><label className="label" htmlFor="m-type">{t('brief.f.type')}</label>
                  <select id="m-type" className="input" value={manual.type} onChange={upd('type')}>{INCIDENT_TYPES.map((ty) => <option key={ty} value={ty}>{TYPE_META[ty].emoji} {tx(lang, TYPE_META[ty].label)}</option>)}</select></div>
                <div><label className="label" htmlFor="m-threat">{t('brief.f.threat')}</label>
                  <select id="m-threat" className="input" value={manual.threat} onChange={upd('threat')}>{(['low', 'medium', 'high', 'critical'] as ThreatLevel[]).map((l) => <option key={l} value={l}>{t(`threat.${l}`)}</option>)}</select></div>
              </div>
              <div><label className="label" htmlFor="m-title">{t('brief.f.title')}</label><input id="m-title" className="input" value={manual.title} onChange={upd('title')} maxLength={120} /></div>
              <div><label className="label" htmlFor="m-city">{t('brief.f.city')}</label>
                <select id="m-city" className="input" value={manual.city} onChange={upd('city')}>{KZ_CITIES.map((c) => <option key={c.id} value={c.id}>{c.name[lang]}</option>)}</select></div>
              <div><label className="label" htmlFor="m-desc">{t('brief.f.desc')}</label><textarea id="m-desc" rows={3} className="input" value={manual.description} onChange={upd('description')} maxLength={1000} /></div>
              <div className="grid grid-cols-2 gap-2">
                {(['known', 'atRisk', 'injured', 'evacuated'] as const).map((k) => (
                  <div key={k}><label className="label" htmlFor={`m-${k}`}>{t(`brief.f.${k}`)}</label><input id={`m-${k}`} type="number" min={0} className="input" value={manual[k]} onChange={upd(k)} /></div>
                ))}
              </div>
              <p className="text-xs text-slate-500">{t('brief.f.hint')}</p>
            </div>
          )}
          <button type="submit" className="btn-primary w-full" disabled={loading}><Sparkles className="h-4 w-4" />{loading ? t('brief.generating') : t('brief.generate')}</button>
          {error && <ErrorAlert message={error} />}
        </form>

        <div className="xl:col-span-2">
          {loading && <div className="card p-6"><Skeleton lines={8} /></div>}
          {!loading && !brief && <div className="card"><EmptyState icon={<FileText className="h-10 w-10" />} title={t('brief.empty')} /></div>}
          {brief && !loading && (
            <article id="print-area" className="card overflow-hidden">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b-4 border-signal-red bg-navy-900 px-5 py-3 text-white">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-signal-amber">QUTQAR AI · {t('brief.doc')}</div>
                  <h2 className="font-cond text-xl font-semibold">{brief.title}</h2>
                  <div className="text-xs text-slate-300">{t('brief.generated', { d: fmtDateTime(brief.generatedAt) })} · {t('common.notOfficial')}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2"><ThreatBadge level={brief.threat} /><ModeBadge meta={meta} /></div>
              </header>
              <div className="space-y-4 p-5">
                <MetaWarnings meta={meta} />
                {brief.narrative && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
                    <div className="mb-1 text-xs font-semibold text-emerald-800">{t('brief.narrative')}</div>
                    <p className="whitespace-pre-line">{brief.narrative}</p>
                  </div>
                )}
                <div className="grid gap-4 md:grid-cols-2">
                  {SECTIONS.map((s, idx) => (
                    <section key={s.key} className={`rounded-md border p-3 ${s.key === 'gaps' || s.key === 'questions' ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200'}`}>
                      <h3 className="mb-2 flex items-center gap-2 font-cond text-sm font-bold tracking-[0.1em] text-slate-900">
                        <span className="flex h-5 w-5 items-center justify-center rounded bg-navy-800 text-[11px] text-white">{idx + 1}</span>{t(s.t)}
                      </h3>
                      <ItemList items={brief[s.key]} numbered={s.key === 'priorities' || s.key === 'questions'} />
                    </section>
                  ))}
                </div>
                <p className="text-xs text-slate-500">{t('brief.legend')}</p>
                <SafetyNotice />
                <div className="no-print flex flex-wrap gap-2">
                  <button className="btn-navy" onClick={() => window.print()}><Printer className="h-4 w-4" />{t('common.print')}</button>
                  {brief.incidentId !== 'manual' && <button className="btn-ghost" onClick={() => navigate('resources', { incident: brief.incidentId })}><Truck className="h-4 w-4" />{t('brief.toResources')}</button>}
                </div>
              </div>
            </article>
          )}
        </div>
      </div>
    </>
  );
}

function ItemList({ items, numbered }: { items: BriefItem[]; numbered?: boolean }) {
  return (
    <ol className="space-y-1.5">
      {items.map((i, n) => (
        <li key={n} className="flex items-start gap-2 text-sm text-slate-800">
          {numbered && <span className="w-4 shrink-0 text-right text-xs font-bold text-slate-400">{n + 1}.</span>}
          <SourceTag source={i.source} /><span className="flex-1">{i.text}</span>
        </li>
      ))}
    </ol>
  );
}
