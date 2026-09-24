import { ChevronLeft, ChevronRight, Maximize, Pause, Play, X } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import KzMap from '../components/KzMap';
import { riskColorOnDark, riskLevelKey } from '../components/RiskMap';
import { Logo, ThreatBadge } from '../components/ui';
import { useApp, type Lang } from '../context';
import { TYPE_META } from '../data/meta';
import { fmtLongDate, fmtTime } from '../i18n';
import { ai } from '../services/aiService';
import { useSnapshot } from '../services/dataService';
import { locField } from '../../shared/engine/briefing';
import { UNIT_KIND_EMOJI, UNIT_KIND_LABEL } from '../../shared/engine/resources';
import { regionById } from '../../shared/geo/kz';
import { tx } from '../../shared/i18n';
import type { RiskKind, SituationAnalysis, UnitKind } from '../types';

const CYCLE_MS = 20000;
const KINDS: UnitKind[] = ['fire_engine', 'rescue', 'ladder', 'tanker', 'ambulance', 'drone'];
const RISKS: { k: RiskKind; key: 'risk.fire' | 'risk.flood' | 'risk.weather' | 'risk.hazmat' }[] = [{ k: 'fire', key: 'risk.fire' }, { k: 'flood', key: 'risk.flood' }, { k: 'weather', key: 'risk.weather' }, { k: 'hazmat', key: 'risk.hazmat' }];

/** Часы вынесены отдельно: ежесекундное обновление не перерисовывает карту */
const BigClock = memo(function BigClock({ lang }: { lang: Lang }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return <div className="text-right leading-tight"><div className="font-cond text-xl font-semibold tabular-nums text-white sm:text-3xl">{fmtTime(now, true)}</div><div className="hidden text-xs text-slate-400 md:block">{fmtLongDate(now, lang, true)} · UTC+5</div></div>;
});

export default function Presentation() {
  const { t, lang, navigate, settings, updateSettings, backend, online } = useApp();
  const { snapshot } = useSnapshot();
  const incidents = useMemo(() => (snapshot?.connected ? [...snapshot.incidents].sort((a, b) => ['critical', 'high', 'medium', 'low'].indexOf(a.threat ?? 'low') - ['critical', 'high', 'medium', 'low'].indexOf(b.threat ?? 'low')) : []), [snapshot]);
  const units = useMemo(() => snapshot?.units ?? [], [snapshot]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [analysis, setAnalysis] = useState<SituationAnalysis | null>(null);
  const inc = incidents.length ? incidents[idx % incidents.length] : null;

  const step = useCallback((d: number) => setIdx((i) => (incidents.length ? (i + d + incidents.length) % incidents.length : 0)), [incidents.length]);
  const fullscreen = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.().catch(() => undefined); };

  useEffect(() => { if (!playing || incidents.length < 2) return; const id = setInterval(() => step(1), CYCLE_MS); return () => clearInterval(id); }, [playing, step, incidents.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (document.fullscreenElement) void document.exitFullscreen(); navigate('dashboard'); }
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === ' ') { e.preventDefault(); setPlaying((p) => !p); }
      else if (e.key.toLowerCase() === 'f') fullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, step]);
  useEffect(() => {
    if (!inc) return;
    let off = false;
    ai.situation(inc).then((r) => { if (!off) setAnalysis(r.data); }).catch(() => { if (!off) setAnalysis(null); });
    return () => { off = true; };
  }, [inc, lang]);

  const events = useMemo(() => {
    const byId = new Map(incidents.map((i) => [i.id, i]));
    const ev = [
      ...incidents.map((i) => ({ time: i.time ?? '', text: t('pr.ev.incident', { i: locField(i, 'title', lang) }), tone: i.threat })),
      ...units.filter((u) => u.assignment && byId.has(u.assignment)).map((u) => ({ time: byId.get(u.assignment!)!.time ?? '', text: t(u.status === 'on_scene' ? 'pr.ev.onScene' : 'pr.ev.dispatch', { u: u.callsign, i: locField(byId.get(u.assignment!)!, 'title', lang) }), tone: undefined })),
    ];
    return ev.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 8);
  }, [incidents, units, t, lang]);

  const h = backend.health;
  const status: [string, string, boolean][] = settings.demoMode
    ? [[t('pr.st.mode'), t('pr.v.demo'), true], [t('pr.st.backend'), t('pr.v.notUsed'), true], [t('pr.st.ai'), t('pr.v.simulated'), true], [t('pr.st.rag'), t('pr.v.demoIndex'), true], [t('pr.st.data'), t('pr.v.demoData'), true], [t('pr.st.net'), online ? t('pr.v.online') : t('pr.v.offline'), true]]
    : [[t('pr.st.mode'), t('pr.v.live'), true], [t('pr.st.backend'), t(`set.st.${backend.state}`), backend.state === 'online'], [t('pr.st.ai'), h?.aiMode === 'live' ? h.model : t('mode.mock'), h?.aiMode === 'live'],
      [t('pr.st.rag'), h ? t('mode.ragOfficial', { n: h.kb.official }) : '—', Boolean(h?.kb.official)], [t('pr.st.data'), h?.operationalData ? t('mode.connected') : t('mode.notConnected'), Boolean(h?.operationalData)], [t('pr.st.net'), online ? t('pr.v.online') : t('pr.v.offline'), online]];

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-[#06101F] text-slate-100 xl:overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-white/10 px-4 py-3 sm:px-6">
        <Logo className="h-9 w-9 sm:h-11 sm:w-11" />
        <div className="min-w-0">
          <div className="font-cond text-xl font-bold tracking-[0.1em] sm:text-2xl">QUTQAR AI</div>
          <div className="hidden truncate text-sm text-slate-400 md:block">{t('pr.subtitle')}</div>
        </div>
        {settings.demoMode && <span className="rounded bg-signal-amber px-2 py-1 text-xs font-bold text-navy-950">DEMO<span className="hidden lg:inline"> · {t('common.notOfficial')}</span></span>}
        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          <div className="flex rounded bg-white/5 p-0.5 ring-1 ring-white/10">{(['ru', 'kz', 'en'] as Lang[]).map((l) => <button key={l} onClick={() => updateSettings({ lang: l })} className={`rounded px-2 py-0.5 text-xs font-bold ${lang === l ? 'bg-white text-navy-900' : 'text-slate-300'}`}>{l.toUpperCase()}</button>)}</div>
          <BigClock lang={lang} />
          <button onClick={fullscreen} className="rounded p-2 text-slate-300 hover:bg-white/10" aria-label={t('pr.fullscreen')} title={t('pr.fullscreen')}><Maximize className="h-5 w-5" /></button>
          <button onClick={() => navigate('dashboard')} className="flex items-center gap-1.5 rounded px-3 py-1.5 text-sm ring-1 ring-white/20 hover:bg-white/10" aria-label={t('pr.exit')}><X className="h-4 w-4" /><span className="hidden sm:inline">{t('pr.exit')}</span></button>
        </div>
      </header>

      <main className="grid flex-1 gap-4 p-4 xl:min-h-0 xl:grid-cols-3">
        <section className="relative min-h-[360px] overflow-hidden rounded-lg ring-1 ring-white/10 xl:col-span-2">
          <KzMap objects={incidents} units={units} selectedId={inc?.id} onSelect={(id) => { const i = incidents.findIndex((x) => x.id === id); if (i >= 0) setIdx(i); }} className="h-full min-h-[360px]" flyToSelected large />
          <div className="pointer-events-none absolute bottom-3 left-3 z-[500] rounded bg-navy-950/85 px-3 py-1.5 text-xs text-slate-300">{t('pr.hint')}</div>
        </section>

        <div className="scroll-thin flex flex-col gap-4 xl:min-h-0 xl:overflow-y-auto">
          {inc && (
            <section className="rounded-lg bg-white/5 p-4 ring-1 ring-white/10">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-slate-400">
                <span>{t('pr.activeIncident')} · {t('pr.of', { i: (idx % incidents.length) + 1, n: incidents.length })}</span>
                <span className="flex gap-1">
                  <button onClick={() => step(-1)} className="rounded p-1 hover:bg-white/10" aria-label={t('pr.prev')}><ChevronLeft className="h-4 w-4" /></button>
                  <button onClick={() => setPlaying((p) => !p)} className="rounded p-1 hover:bg-white/10" aria-label={playing ? t('pr.pause') : t('pr.play')}>{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
                  <button onClick={() => step(1)} className="rounded p-1 hover:bg-white/10" aria-label={t('pr.next')}><ChevronRight className="h-4 w-4" /></button>
                </span>
              </div>
              <div key={inc.id} className="pop-in mt-2">
                <div className="flex items-start justify-between gap-3">
                  <div><div className="text-3xl" aria-hidden>{TYPE_META[inc.type].emoji}</div><h2 className="mt-1 font-cond text-2xl font-semibold leading-tight text-white">{locField(inc, 'title', lang)}</h2><p className="text-sm text-slate-400">{locField(inc, 'region', lang)} · {inc.time}</p></div>
                  {inc.threat && <ThreatBadge level={inc.threat} />}
                </div>
                <div className="mt-3 border-l-4 border-signal-red pl-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-signal-amber">{t('pr.ai')}</div>
                  <p className="mt-1 text-base leading-relaxed text-slate-100">{analysis?.summary ?? '…'}</p>
                  {analysis && <ul className="mt-2 flex flex-wrap gap-1.5">{analysis.factors.map((f) => <li key={f} className="rounded bg-white/10 px-2 py-0.5 text-xs text-slate-200">{f}</li>)}</ul>}
                </div>
                {playing && incidents.length > 1 && <div className="mt-3 h-0.5 overflow-hidden rounded bg-white/10"><div key={`${inc.id}-bar`} className="h-full bg-signal-amber" style={{ animation: `pr-progress ${CYCLE_MS}ms linear` }} /></div>}
              </div>
            </section>
          )}

          {snapshot?.risk && (
            <section className="rounded-lg bg-white/5 p-4 ring-1 ring-white/10">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t('pr.risk')}</h3>
              <ul className="mt-2 grid grid-cols-2 gap-2">
                {RISKS.map(({ k, key }) => {
                  const top = [...snapshot.risk!.regions].sort((a, b) => b.risks[k] - a.risks[k])[0];
                  const v = top?.risks[k] ?? 0;
                  return <li key={k} className="rounded bg-white/5 p-2"><div className="text-xs text-slate-400">{t(key)}</div><div className="flex items-baseline gap-2"><span className="font-cond text-2xl font-bold" style={{ color: riskColorOnDark(v) }}>{v}</span><span className="text-xs text-slate-300">{t(riskLevelKey(v))}</span></div><div className="truncate text-[11px] text-slate-500">{top ? regionById(top.id)?.name[lang] ?? top.region : ''}</div></li>;
                })}
              </ul>
            </section>
          )}

          <section className="rounded-lg bg-white/5 p-4 ring-1 ring-white/10">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t('pr.forces')}</h3>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {KINDS.map((k) => { const all = units.filter((u) => u.kind === k); const av = all.filter((u) => u.status === 'available').length; const busy = all.filter((u) => u.status === 'on_scene' || u.status === 'en_route').length;
                return <li key={k} className="flex items-center gap-2"><span aria-hidden>{UNIT_KIND_EMOJI[k]}</span><span className="flex-1 truncate text-slate-300">{tx(lang, UNIT_KIND_LABEL[k])}</span><span className="tabular-nums text-emerald-300" title={t('pr.available')}>{av}</span><span className="text-slate-600">/</span><span className="tabular-nums text-amber-300" title={t('pr.committed')}>{busy}</span></li>; })}
            </ul>
            <div className="mt-1 text-[11px] text-slate-500"><span className="text-emerald-300">■</span> {t('pr.available')} · <span className="text-amber-300">■</span> {t('pr.committed')}</div>
          </section>

          <section className="rounded-lg bg-white/5 p-4 ring-1 ring-white/10">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t('pr.events')}</h3>
            <ol className="mt-2 space-y-1.5 text-sm">{events.map((e, i) => <li key={i} className="flex gap-3"><span className="w-12 shrink-0 font-mono text-xs text-slate-500">{e.time}</span><span className={e.tone === 'critical' || e.tone === 'high' ? 'text-red-200' : 'text-slate-200'}>{e.text}</span></li>)}</ol>
          </section>

          <section className="rounded-lg bg-white/5 p-4 ring-1 ring-white/10">
            <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t('pr.status')}</h3>
            <ul className="mt-2 grid grid-cols-2 gap-2 text-sm">{status.map(([k, v, ok]) => <li key={k} className="flex items-center gap-2 rounded bg-white/5 px-2 py-1.5"><span className={`h-2 w-2 shrink-0 rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'}`} /><span className="text-slate-400">{k}</span><span className="ml-auto truncate font-medium text-slate-100">{v}</span></li>)}</ul>
          </section>
        </div>
      </main>
      <footer className="border-t border-white/10 px-6 py-2 text-center text-[11px] text-slate-500">{t('safety.notice')}</footer>
    </div>
  );
}
