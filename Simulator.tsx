import {
  ChevronLeft, CircleCheck, CircleX, Clock, CloudSun, FileText, Flag, GraduationCap, Languages, ListChecks, MapPin, Pause, Play, Radio,
  RotateCcw, Send, ShieldAlert, Siren, Target, TriangleAlert, Trophy, Truck, Users,
} from 'lucide-react';
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import SceneMap from '../components/SceneMap';
import Radar from '../components/sim/Radar';
import { ErrorAlert, MetaWarnings, ModeBadge, PageHeader, SafetyNotice, Spinner, TrainingBadge } from '../components/ui';
import { useApp } from '../context';
import { fmtClock } from '../i18n';
import type { TKey } from '../i18n';
import { ai } from '../services/aiService';
import { saveSession } from '../services/simSessions';
import { DIFFICULTIES, DIFFICULTY_RULES, SCENARIO_LIST, liveScore, scenarioObjectives } from '../../shared/engine/simulator';
import { tx } from '../../shared/i18n';
import type { AiMeta, SimCommand, SimDebrief, SimDecision, SimDifficulty, SimEvent, SimScenarioType, SimSession, SimState, SimVerdict } from '../types';

const Instructor = lazy(() => import('../components/sim/Instructor'));
type View = 'select' | 'briefing' | 'live' | 'debrief' | 'instructor';

export const VERDICT: Record<SimVerdict, { key: TKey; cls: string; dot: string; icon: typeof CircleCheck }> = {
  correct: { key: 'sim.v.correct', cls: 'border-emerald-300 bg-emerald-50 text-emerald-900', dot: 'bg-emerald-500', icon: CircleCheck },
  acceptable: { key: 'sim.v.acceptable', cls: 'border-sky-300 bg-sky-50 text-sky-900', dot: 'bg-sky-500', icon: CircleCheck },
  mistake: { key: 'sim.v.mistake', cls: 'border-orange-300 bg-orange-50 text-orange-900', dot: 'bg-orange-500', icon: TriangleAlert },
  violation: { key: 'sim.v.violation', cls: 'border-red-400 bg-red-50 text-red-900', dot: 'bg-red-600', icon: ShieldAlert },
  unclear: { key: 'sim.v.unclear', cls: 'border-slate-300 bg-slate-50 text-slate-800', dot: 'bg-slate-400', icon: CircleX },
};
const EVENT_CLS: Record<SimEvent['kind'], string> = {
  escalation: 'border-l-red-500 bg-red-500/10 text-red-100', improvement: 'border-l-emerald-400 bg-emerald-500/10 text-emerald-100',
  report: 'border-l-sky-400 bg-sky-500/10 text-sky-100', radio: 'border-l-amber-400 bg-amber-500/10 text-amber-100',
  violation: 'border-l-red-600 bg-red-600/20 text-red-100', decision: 'border-l-slate-400 bg-white/5 text-slate-200', info: 'border-l-slate-500 bg-white/5 text-slate-300',
};
export const DIFF_CLS: Record<SimDifficulty, string> = { easy: 'bg-emerald-100 text-emerald-800', medium: 'bg-sky-100 text-sky-900', hard: 'bg-amber-100 text-amber-900', expert: 'bg-red-100 text-red-800' };

export default function Simulator() {
  const { settings, lang, t, navigate, params } = useApp();
  const [view, setViewState] = useState<View>(params.get('view') === 'instructor' ? 'instructor' : 'select');
  // Режим инструктора адресуем ссылкой #/simulator?view=instructor (сохраняется при обновлении страницы)
  const setView = (v: View) => {
    setViewState(v);
    const target = v === 'instructor' ? '#/simulator?view=instructor' : '#/simulator';
    if (window.location.hash !== target) window.history.replaceState(null, '', target);
  };
  // Если адрес изменился без перезагрузки (ссылка, кнопка «назад»), показываем соответствующий экран
  const urlView = params.get('view');
  useEffect(() => {
    if (urlView === 'instructor') setViewState('instructor');
  }, [urlView]);
  const [trainee, setTrainee] = useState(settings.operator);
  const [state, setState] = useState<SimState | null>(null);
  const [debrief, setDebrief] = useState<SimDebrief | null>(null);
  const [meta, setMeta] = useState<AiMeta | null>(null);
  const [lastDecision, setLastDecision] = useState<{ d: SimDecision; delta: number } | null>(null);
  const [narration, setNarration] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [lastAt, setLastAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [savedSession, setSavedSession] = useState<SimSession | null>(null);
  const [returnView, setReturnView] = useState<View>('select');
  const stateRef = useRef<SimState | null>(null);
  stateRef.current = state;

  const openInstructor = () => { setReturnView(view); setView('instructor'); };

  const prepare = async (type: SimScenarioType, seed?: number, difficulty?: SimDifficulty) => {
    setBusy(true); setError(null); setDebrief(null); setLastDecision(null); setNarration(null); setSavedSession(null);
    try {
      const r = await ai.simulate({ action: 'start', type, seed, trainee, difficulty });
      setState(r.data.state); setMeta(r.meta);
      if (r.meta.mode === 'live') setNarration(r.data.state.situation);
      setView('briefing');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const begin = () => { const x = Date.now(); setStartedAt(x); setLastAt(x); setNow(x); setPaused(false); setView('live'); };

  const conclude = useCallback((st: SimState, d: SimDebrief) => {
    setDebrief(d); setView('debrief');
    setSavedSession(saveSession(st, d, (Date.now() - startedAt) / 1000, lang));
  }, [startedAt, lang]);

  useEffect(() => {
    if (view !== 'live') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [view]);

  // Модельное время идет, пока обучаемый думает; темп зависит от уровня сложности
  const tickMs = state ? DIFFICULTY_RULES[state.difficulty].tickMs : 15000;
  useEffect(() => {
    if (view !== 'live' || paused) return;
    const id = setInterval(async () => {
      const st = stateRef.current;
      if (!st || st.status !== 'active') return;
      const r = await ai.simulate({ action: 'tick', state: st, minutes: 1 });
      setState(r.data.state);
      if (r.data.state.status !== 'active' && r.data.debrief) conclude(r.data.state, r.data.debrief);
    }, tickMs);
    return () => clearInterval(id);
  }, [view, paused, conclude, tickMs]);

  const decide = async (input: string, actionIds?: string[]) => {
    if (!state || busy || !input.trim()) return;
    setBusy(true); setError(null);
    const before = liveScore(state);
    try {
      const r = await ai.simulate({ action: 'step', state, input, actionIds, realSeconds: (Date.now() - lastAt) / 1000 });
      const st = r.data.state;
      const x = Date.now();
      setState(st); setMeta(r.meta); setLastAt(x); setNow(x);
      if (r.data.decision) setLastDecision({ d: r.data.decision, delta: liveScore(st) - before });
      setNarration(r.meta.mode === 'live' ? st.situation : null);
      if (st.status !== 'active' && r.data.debrief) conclude(st, r.data.debrief);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  const finish = async () => {
    if (!state) return;
    setBusy(true);
    try {
      const r = await ai.simulate({ action: 'finish', state });
      setState(r.data.state);
      if (r.data.debrief) conclude(r.data.state, r.data.debrief);
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader icon={<Siren className="h-5 w-5" />} title={t('sim.title')} subtitle={t('sim.subtitle')}
        actions={<><TrainingBadge />{view !== 'instructor' && view !== 'live' && <button className="btn-ghost" onClick={openInstructor}><GraduationCap className="h-4 w-4" />{t('sim.instructor')}</button>}</>} />
      {error && <div className="mb-4"><ErrorAlert message={error} onRetry={() => setError(null)} /></div>}
      {view === 'select' && <SelectView trainee={trainee} setTrainee={setTrainee} onPick={(ty) => void prepare(ty)} busy={busy} />}
      {view === 'briefing' && state && (
        <BriefingView state={state} meta={meta} narration={narration} busy={busy} onBack={() => setView('select')} onStart={begin}
          onDifficulty={(d) => void prepare(state.type, state.seed, d)} />
      )}
      {view === 'live' && state && (
        <LiveView state={state} meta={meta} busy={busy} paused={paused} setPaused={setPaused} lastDecision={lastDecision} narration={narration}
          elapsed={(now - startedAt) / 1000} thinking={(now - lastAt) / 1000} onDecide={decide} onFinish={() => void finish()} />
      )}
      {view === 'debrief' && state && debrief && (
        <DebriefView state={state} d={debrief} saved={savedSession} onRepeat={() => void prepare(state.type, state.seed, state.difficulty)}
          onOther={() => setView('select')} onInstructor={openInstructor} onReport={() => savedSession && navigate('report', { session: savedSession.id })} />
      )}
      {view === 'instructor' && (
        <Suspense fallback={<Spinner />}><Instructor onBack={() => setView(returnView === 'instructor' ? 'select' : returnView)} highlight={savedSession?.id} /></Suspense>
      )}
    </>
  );
}

/* ══════════════ 1. Выбор сценария ══════════════ */
function SelectView({ trainee, setTrainee, onPick, busy }: { trainee: string; setTrainee: (v: string) => void; onPick: (ty: SimScenarioType) => void; busy: boolean }) {
  const { t, lang } = useApp();
  return (
    <div className="space-y-4">
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="label" htmlFor="trainee">{t('sim.trainee')}</label>
          <input id="trainee" className="input" value={trainee} onChange={(e) => setTrainee(e.target.value)} placeholder={t('sim.traineePh')} maxLength={80} />
        </div>
        <p className="max-w-xl text-xs text-slate-500">{t('sim.intro')}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {SCENARIO_LIST.map((m) => (
          <button key={m.type} disabled={busy} onClick={() => onPick(m.type)}
            className={`card group flex flex-col p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lg disabled:opacity-60 ${m.featured ? 'ring-2 ring-signal-amber' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3">
                <span className="text-3xl" aria-hidden>{m.emoji}</span>
                <div><div className="font-cond text-lg font-semibold text-slate-900">{tx(lang, m.label)}</div><div className="text-xs text-slate-500">{tx(lang, m.hint)}</div></div>
              </div>
              {m.featured && <span className="shrink-0 rounded bg-signal-amber px-1.5 py-0.5 text-[10px] font-bold text-navy-950">{t('sim.full')}</span>}
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <div><dt className="text-slate-500">{t('sim.difficulty')}</dt><dd><span className={`mt-0.5 inline-block rounded px-1.5 py-0.5 font-semibold ${DIFF_CLS[m.difficulty]}`}>{t(`sim.diff.${m.difficulty}`)}</span></dd></div>
              <div><dt className="text-slate-500">{t('sim.duration')}</dt><dd className="mt-0.5 font-semibold text-slate-800">{tx(lang, m.duration)}</dd></div>
              <div><dt className="text-slate-500">{t('sim.points')}</dt><dd className="mt-0.5 font-semibold text-slate-800">{m.decisionPoints}</dd></div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-1">{m.skills.map((s) => <span key={s.ru} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">{tx(lang, s)}</span>)}</div>
            <div className="mt-2 text-[11px] text-slate-500"><Target className="mr-1 inline h-3 w-3" />{t('sim.objectives')}: {scenarioObjectives(m.type, lang).length}</div>
            {!m.localized && lang !== 'ru' && <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500"><Languages className="h-3 w-3" />{t('sim.ruOnly')}</div>}
            <span className="mt-4 inline-flex items-center gap-1.5 self-start rounded-md bg-navy-800 px-3 py-1.5 text-xs font-semibold text-white group-hover:bg-navy-700"><Play className="h-3.5 w-3.5" />{t('sim.toBriefing')}</span>
          </button>
        ))}
      </div>
      {busy && <Spinner label={t('sim.generating')} />}
    </div>
  );
}

/* ══════════════ 2. Брифинг ══════════════ */
function BriefingView({ state, meta, narration, busy, onBack, onStart, onDifficulty }: { state: SimState; meta: AiMeta | null; narration: string | null; busy: boolean; onBack: () => void; onStart: () => void; onDifficulty: (d: SimDifficulty) => void }) {
  const { t, lang } = useApp();
  const b = state.brief;
  const Item = ({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) => (
    <div className="flex gap-3 rounded-md border border-slate-200 p-3"><div className="mt-0.5 text-navy-600">{icon}</div><div className="min-w-0"><div className="text-xs font-semibold text-slate-500">{label}</div><div className="text-sm text-slate-800">{children}</div></div></div>
  );
  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <div className="card overflow-hidden xl:col-span-3">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-navy-800 px-4 py-3 text-white">
          <h2 className="flex items-center gap-2 font-cond text-lg font-semibold"><Radio className="h-5 w-5 text-signal-amber" />{t('sim.briefing', { t: state.title })}</h2>
          <div className="flex gap-2"><TrainingBadge /><ModeBadge meta={meta} /></div>
        </div>
        <div className="space-y-4 p-4">
          <p className="rounded-md border-l-4 border-signal-red bg-slate-50 p-3 text-sm leading-relaxed text-slate-800"><span className="font-semibold">{t('sim.ccTo')}</span> {state.briefing}</p>
          {narration && <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900"><span className="font-semibold">{t('sim.aiNarr')}:</span> {narration}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Item icon={<MapPin className="h-4 w-4" />} label={t('sim.place')}>{b.place}</Item>
            <Item icon={<Clock className="h-4 w-4" />} label={t('sim.time')}>{b.time}</Item>
            <Item icon={<CloudSun className="h-4 w-4" />} label={t('sim.weather')}>{b.weather}</Item>
            <Item icon={<Users className="h-4 w-4" />} label={t('sim.people')}>{b.people}</Item>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-red-200 bg-red-50/60 p-3"><div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-red-800"><TriangleAlert className="h-4 w-4" />{t('sim.hazards')}</div><ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-800">{b.hazards.map((h) => <li key={h}>{h}</li>)}</ul></div>
            <div className="rounded-md border border-slate-200 p-3"><div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><Truck className="h-4 w-4" />{t('sim.forces')}</div><ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-800">{b.forces.map((h) => <li key={h}>{h}</li>)}</ul></div>
          </div>
          <div className="rounded-md border border-navy-500/30 bg-navy-500/5 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-navy-700"><Target className="h-4 w-4" />{t('sim.objectives')}</div>
            <ol className="list-decimal space-y-0.5 pl-5 text-sm text-slate-800">{state.objectives.map((o) => <li key={o.id}>{o.label}</li>)}</ol>
          </div>
          <div>
            <div className="label">{t('sim.chooseDiff')}</div>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('sim.chooseDiff')}>
              {DIFFICULTIES.map((d) => (
                <button key={d} role="radio" aria-checked={state.difficulty === d} disabled={busy} onClick={() => state.difficulty !== d && onDifficulty(d)}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold ring-1 transition ${state.difficulty === d ? 'bg-navy-800 text-white ring-navy-800' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'}`}>{t(`sim.diff.${d}`)}</button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500">{tx(lang, DIFFICULTY_RULES[state.difficulty].note)} · {state.timeLimit} {t('common.min')}</p>
          </div>
          <p className="text-xs text-slate-500">{t('sim.disclaimer', { n: state.seed })}</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost" onClick={onBack}><ChevronLeft className="h-4 w-4" />{t('sim.other')}</button>
            <button className="btn-primary px-6 text-base font-bold tracking-wide" onClick={onStart} disabled={busy}><Play className="h-5 w-5" />{t('sim.start')}</button>
          </div>
        </div>
      </div>
      <div className="card overflow-hidden xl:col-span-2">
        <h3 className="section-title border-b border-slate-200 px-4 py-3">{t('sim.initial')}</h3>
        <div className="p-3"><SceneMap scene={state.scene} className="aspect-[4/3]" /></div>
      </div>
    </div>
  );
}

/* ══════════════ 3. Симуляция (командный интерфейс) ══════════════ */
function LiveView(p: {
  state: SimState; meta: AiMeta | null; busy: boolean; paused: boolean; setPaused: (v: boolean) => void;
  lastDecision: { d: SimDecision; delta: number } | null; narration: string | null; elapsed: number; thinking: number;
  onDecide: (input: string, actionIds?: string[]) => void; onFinish: () => void;
}) {
  const { t } = useApp();
  const { state: s } = p;
  const [text, setText] = useState('');
  const score = useMemo(() => liveScore(s), [s]);
  const done = useMemo(() => new Set(s.decisions.flatMap((d) => d.results.filter((r) => r.verdict === 'correct' || r.verdict === 'acceptable').map((r) => r.id))), [s.decisions]);
  // Показываем последние 80 событий — длинные сессии не тормозят интерфейс
  const events = useMemo(() => s.log.slice(-80).reverse(), [s.log]);
  const current = events.find((e) => e.kind !== 'decision');
  const submit = (e: FormEvent) => { e.preventDefault(); p.onDecide(text); setText(''); };
  const urgent = current?.kind === 'escalation' || current?.kind === 'violation';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border border-white/10 bg-navy-950 px-4 py-2.5 text-slate-200">
        <div className="flex items-center gap-2"><span className="status-dot is-live bg-signal-red" /><span className="font-cond text-lg font-semibold text-white">{s.title}</span></div>
        <Stat label={t('sim.simTime')} value={`T+${s.clock} / ${s.timeLimit} ${t('common.min')}`} />
        <Stat label={t('sim.elapsed')} value={fmtClock(p.elapsed)} />
        <Stat label={t('sim.thinking')} value={fmtClock(p.thinking)} warn={p.thinking > 45} />
        <Stat label={t('sim.score')} value={`${score}`} />
        <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${DIFF_CLS[s.difficulty]}`}>{t(`sim.diff.${s.difficulty}`)}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <TrainingBadge /><ModeBadge meta={p.meta} />
          <button className="btn-ghost !py-1.5" onClick={() => p.setPaused(!p.paused)}>{p.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}{p.paused ? t('sim.resume') : t('sim.pause')}</button>
          <button className="btn-primary !py-1.5" onClick={p.onFinish} disabled={p.busy}><Flag className="h-4 w-4" />{t('sim.finish')}</button>
        </div>
        <div className="h-1 w-full overflow-hidden rounded bg-white/10" aria-hidden><div className="h-full bg-signal-amber transition-all duration-700" style={{ width: `${(s.clock / s.timeLimit) * 100}%` }} /></div>
        {p.paused && <div className="w-full text-xs font-semibold text-signal-amber">{t('sim.paused')}</div>}
      </div>

      <div className="grid gap-3 xl:grid-cols-12">
        <div className="order-3 space-y-3 xl:order-none xl:col-span-4">
          <Panel title={t('sim.situation')}>
            <p key={s.situation} className="flash-in rounded p-1 text-sm leading-relaxed text-slate-800">{s.situation}</p>
            <div className="mt-3 space-y-2">
              {s.gauges.map((g) => {
                const bad = g.invert ? 100 - g.value : g.value;
                return (
                  <div key={g.key}>
                    <div className="flex justify-between text-xs"><span className="text-slate-600">{g.label}</span><span className="font-semibold tabular-nums">{Math.round(g.value)}%</span></div>
                    <div className="mt-0.5 h-2 overflow-hidden rounded bg-slate-100"><div className={`h-full transition-all duration-700 ${bad > 70 ? 'bg-red-600' : bad > 40 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.max(2, g.value)}%` }} /></div>
                  </div>
                );
              })}
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded bg-slate-50 p-1.5"><dt className="text-slate-500">{t('sim.atRisk')}</dt><dd className="font-cond text-xl font-bold text-red-700">{s.victims.revealed ? s.victims.atRisk : '?'}</dd></div>
              <div className="rounded bg-slate-50 p-1.5"><dt className="text-slate-500">{t('sim.rescued')}</dt><dd className="font-cond text-xl font-bold text-emerald-700">{s.victims.rescued}</dd></div>
              <div className="rounded bg-slate-50 p-1.5"><dt className="text-slate-500">{t('sim.lost')}</dt><dd className="font-cond text-xl font-bold text-slate-800">{s.victims.lost}</dd></div>
            </dl>
          </Panel>
          <Panel title={t('sim.scheme')} pad={false}><div className="p-2"><SceneMap scene={s.scene} className="aspect-[4/3]" /></div></Panel>
          <Panel title={t('sim.resources')}>
            <ul className="space-y-1.5 text-sm">
              {s.resources.map((r) => (
                <li key={r.name} className="flex items-center gap-2">
                  <span className="flex-1 text-slate-700">{r.label ?? r.name}</span>
                  <span className="text-xs tabular-nums text-slate-500">{t('sim.committed', { c: Math.round(r.committed), t: r.total })}</span>
                  <span className="h-1.5 w-16 overflow-hidden rounded bg-slate-100"><span className="block h-full bg-navy-500" style={{ width: `${r.total ? (r.committed / r.total) * 100 : 0}%` }} /></span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <div className="order-1 space-y-3 xl:order-none xl:col-span-5">
          <div className={`card overflow-hidden ${urgent ? 'alert-border' : ''}`}>
            <div className={`flex items-center justify-between px-4 py-2 text-xs font-bold ${urgent ? 'bg-signal-red text-white' : 'bg-navy-800 text-white'}`}>
              <span className="flex items-center gap-1.5"><Radio className="h-4 w-4" />{t('sim.currentEvent')}{current ? ` · ${t(`sim.ev.${current.kind}`)}` : ''}</span>
              <span className="tabular-nums">T+{current?.t ?? 0}′</span>
            </div>
            <div className="p-4">
              <p key={current?.id} className="flash-in rounded text-base leading-relaxed text-slate-900">{current?.text ?? '—'}</p>
              {p.narration && <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-sm text-emerald-900"><span className="font-semibold">{t('sim.aiNarr')}</span> <span className="text-xs text-emerald-700">{t('sim.aiNarrNote')}</span>: {p.narration}</p>}
            </div>
          </div>
          {p.lastDecision && (() => {
            const v = VERDICT[p.lastDecision.d.verdict];
            const Icon = v.icon;
            return (
              <div key={p.lastDecision.d.id} className={`pop-in rounded-lg border p-3 ${v.cls}`} role="status">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-bold"><Icon className="h-4 w-4" />{t(v.key)}</span>
                  <span className={`rounded px-2 py-0.5 text-xs font-bold tabular-nums ${p.lastDecision.delta >= 0 ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>{t('sim.delta', { d: `${p.lastDecision.delta >= 0 ? '+' : ''}${p.lastDecision.delta}` })}</span>
                </div>
                <p className="mt-1 text-xs opacity-80">«{p.lastDecision.d.input}» · {t('sim.decidedIn', { s: p.lastDecision.d.realSeconds })}</p>
                <p className="mt-1.5 text-sm">{p.lastDecision.d.feedback}</p>
              </div>
            );
          })()}
          <div className="rounded-lg border border-white/10 bg-navy-950">
            <h3 className="border-b border-white/10 px-4 py-2 font-cond text-base font-semibold text-white">{t('sim.log')}</h3>
            <ol className="scroll-thin max-h-[240px] space-y-1.5 overflow-y-auto p-3 xl:max-h-[440px]">{events.map((e) => <EventRow key={e.id} e={e} />)}</ol>
          </div>
        </div>

        <div className="order-2 xl:order-none xl:col-span-3">
          <div className="card overflow-hidden xl:sticky xl:top-2">
            <div className="flex items-center justify-between bg-signal-red px-4 py-2.5 text-white">
              <h2 className="font-cond text-lg font-bold tracking-wide">{t('sim.actions')}</h2>
              {p.busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-label={t('sim.processing')} />}
            </div>
            <div className="p-3">
              <p className="mb-2 text-xs text-slate-500">{t('sim.actionsHint')}</p>
              <ul id="sim-actions" className="space-y-1.5" aria-label={t('sim.actions')}>
                {s.suggestions.map((c) => <ActionButton key={c.key} c={c} done={c.actions.length > 0 && c.actions.every((id) => done.has(id))} disabled={p.busy} onClick={() => p.onDecide(c.label, c.actions)} />)}
              </ul>
              <form onSubmit={submit} className="mt-3">
                <label className="label" htmlFor="cmd">{t('sim.ownCmd')}</label>
                <div className="flex gap-2">
                  <input id="cmd" className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('sim.ownCmdPh')} maxLength={300} />
                  <button className="btn-navy !px-3" disabled={p.busy || !text.trim()} aria-label={t('sim.sendCmd')}><Send className="h-4 w-4" /></button>
                </div>
              </form>
              <MetaWarnings meta={p.meta} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const EventRow = memo(function EventRow({ e }: { e: SimEvent }) {
  const { t } = useApp();
  return <li className={`rounded border-l-4 px-3 py-1.5 text-sm ${EVENT_CLS[e.kind]}`}><span className="mr-2 font-mono text-xs opacity-70">T+{e.t}′</span><span className="mr-1 text-[10px] font-bold uppercase opacity-70">{t(`sim.ev.${e.kind}`)}</span> {e.text}</li>;
});
const ActionButton = memo(function ActionButton({ c, done, disabled, onClick }: { c: SimCommand; done: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <li>
      <button disabled={disabled} onClick={onClick}
        className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors disabled:opacity-50 ${done ? 'border-emerald-200 bg-emerald-50/60 text-slate-600' : 'border-slate-200 bg-white text-slate-800 hover:border-navy-500 hover:bg-slate-50'}`}>
        {done ? <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600" /> : <Target className="h-4 w-4 shrink-0 text-slate-400" />}<span className="flex-1">{c.label}</span>
      </button>
    </li>
  );
});
function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return <div className="leading-tight"><div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</div><div className={`font-cond text-lg font-semibold tabular-nums ${warn ? 'text-signal-amber' : 'text-white'}`}>{value}</div></div>;
}
function Panel({ title, children, pad = true }: { title: string; children: ReactNode; pad?: boolean }) {
  return <section className="card overflow-hidden"><h3 className="section-title border-b border-slate-200 px-4 py-2 !text-base">{title}</h3><div className={pad ? 'p-3' : ''}>{children}</div></section>;
}

/* ══════════════ 4. Разбор ══════════════ */
function DebriefView({ state, d, saved, onRepeat, onOther, onInstructor, onReport }: { state: SimState; d: SimDebrief; saved: SimSession | null; onRepeat: () => void; onOther: () => void; onInstructor: () => void; onReport: () => void }) {
  const { t } = useApp();
  const outcome = { success: 'border-emerald-400 bg-emerald-50 text-emerald-900', partial: 'border-amber-400 bg-amber-50 text-amber-900', failed: 'border-red-400 bg-red-50 text-red-900' }[d.outcomeLevel];
  const maxSec = Math.max(30, ...d.decisionTimes.map((x) => x.seconds));
  const List = ({ title, items, empty, cls }: { title: string; items: string[]; empty: string; cls: string }) => (
    <section className="card p-4"><h3 className="section-title mb-2 !text-base">{title} <span className="text-sm font-normal text-slate-500">({items.length})</span></h3>
      {items.length ? <ul className="space-y-1.5">{items.map((x, i) => <li key={i} className={`rounded border-l-4 px-3 py-1.5 text-sm ${cls}`}>{x}</li>)}</ul> : <p className="text-sm text-slate-500">{empty}</p>}</section>
  );
  const cats = d.categories.map((c) => ({ ...c, label: t(`cat.${c.key}` as TKey) }));
  return (
    <div className="space-y-4">
      <div className={`flex flex-col gap-4 rounded-lg border-2 p-4 sm:flex-row sm:items-center ${outcome}`}>
        <Trophy className="h-10 w-10 shrink-0" />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2"><h2 className="font-cond text-2xl font-bold">{t('sim.debrief')}</h2><TrainingBadge /></div>
          <p className="mt-0.5 text-sm"><strong>{state.title}</strong> · {t('sim.debriefMeta', { n: state.trainee || '—', s: state.seed, d: t(`sim.diff.${state.difficulty}`) })}</p>
          <p className="mt-1 text-sm">{t('sim.outcome', { o: d.outcome })}</p>
        </div>
        <div className="text-center"><div className="font-cond text-5xl font-bold leading-none tabular-nums">{d.score}</div><div className="text-xs font-semibold">{t('sim.scoreOf')}</div><div className="mt-1 text-sm font-semibold">{t(`grade.${d.gradeKey}`)}</div></div>
      </div>
      <p className="text-xs text-slate-400">{t('sim.scoreNote')}{saved ? ` ${t('sim.savedJournal')}` : ''}</p>

      <section className="card p-4">
        <h3 className="section-title mb-2 flex items-center gap-2"><Target className="h-5 w-5 text-navy-600" />{t('sim.objResult')} <span className="text-sm font-normal text-slate-500">({d.objectives.filter((o) => o.achieved).length}/{d.objectives.length})</span></h3>
        <ul className="grid gap-2 md:grid-cols-2">
          {d.objectives.map((o) => (
            <li key={o.id} className={`flex gap-2 rounded-md border p-2.5 text-sm ${o.achieved ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}>
              {o.achieved ? <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
              <span><span className="font-semibold text-slate-900">{o.label}</span> — {o.achieved ? t('sim.objAchieved') : t('sim.objMissed')}<span className="block text-xs text-slate-600">{o.note}</span></span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-2">
          <h3 className="section-title mb-3">{t('sim.final')}</h3>
          <div className="grid items-center gap-4 md:grid-cols-2">
            <Radar cats={cats} aria={t('sim.radarAria')} />
            <ul className="space-y-2.5">
              {cats.map((c) => (
                <li key={c.key}>
                  <div className="flex justify-between text-sm"><span className="font-medium text-slate-800">{c.label}</span><span className="font-bold tabular-nums">{c.score}</span></div>
                  <div className="mt-0.5 h-2 overflow-hidden rounded bg-slate-100"><div className={`h-full ${c.score >= 75 ? 'bg-emerald-500' : c.score >= 50 ? 'bg-amber-500' : 'bg-red-600'}`} style={{ width: `${c.score}%` }} /></div>
                  <p className="mt-0.5 text-xs text-slate-500">{c.note}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>
        <section className="card p-4">
          <h3 className="section-title mb-3">{t('sim.indicators')}</h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {([['sim.i.decisions', d.totals.decisions], ['sim.i.correct', d.totals.correct], ['sim.i.acceptable', d.totals.acceptable], ['sim.i.mistakes', d.totals.mistakes], ['sim.i.violations', d.totals.violations], ['sim.i.unclear', d.totals.unclear],
              ['sim.i.avg', `${d.timing.avgSeconds} ${t('common.sec')}`], ['sim.i.simMin', `${d.timing.simMinutes} ${t('common.min')}`]] as [TKey, string | number][]).map(([k, v]) => (
              <div key={k} className="rounded bg-slate-50 p-2"><dt className="text-xs text-slate-500">{t(k)}</dt><dd className="font-cond text-xl font-bold text-slate-900">{v}</dd></div>
            ))}
          </dl>
          <h4 className="mb-1 mt-4 text-xs font-semibold text-slate-600">{t('sim.decTimes')}</h4>
          <div className="flex h-24 items-end gap-1 border-b border-slate-200">
            {d.decisionTimes.map((x, i) => <div key={i} title={`T+${x.t}′ «${x.input}» — ${x.seconds} ${t('common.sec')}`} className={`min-w-[6px] flex-1 rounded-t ${VERDICT[x.verdict].dot}`} style={{ height: `${Math.max(6, (x.seconds / maxSec) * 100)}%` }} />)}
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-500">{(['correct', 'acceptable', 'mistake', 'violation'] as SimVerdict[]).map((v) => <span key={v} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-sm ${VERDICT[v].dot}`} />{t(VERDICT[v].key)}</span>)}</div>
        </section>
      </div>

      <section className="card p-4">
        <h3 className="section-title mb-2">{t('sim.timeline')}</h3>
        <ol className="relative space-y-1.5 border-l-2 border-slate-200 pl-4">
          {d.timeline.map((x, i) => (
            <li key={i} className="text-sm">
              <span className={`absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full ${x.verdict ? VERDICT[x.verdict].dot : x.kind === 'escalation' ? 'bg-red-500' : x.kind === 'improvement' ? 'bg-emerald-500' : 'bg-sky-500'}`} />
              <span className="mr-2 font-mono text-xs text-slate-500">T+{x.t}′</span>
              <span className={x.kind === 'decision' ? 'font-semibold text-slate-900' : 'text-slate-700'}>{x.kind === 'decision' ? t('sim.icPrefix') : ''}{x.text}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <List title={t('sim.correctList')} items={d.correctList} empty={t('sim.correctNone')} cls="border-emerald-400 bg-emerald-50" />
        <List title={t('sim.mistakeList')} items={d.mistakes} empty={t('sim.mistakeNone')} cls="border-orange-400 bg-orange-50" />
        <List title={t('sim.violList')} items={d.safetyViolations} empty={t('sim.violNone')} cls="border-red-500 bg-red-50" />
        <List title={t('sim.missedList')} items={d.missed} empty={t('sim.missedNone')} cls="border-slate-400 bg-slate-50" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h3 className="section-title mb-2">{t('sim.resUsage')}</h3>
          <table className="data-table"><thead><tr><th>{t('sim.resCol')}</th><th>{t('sim.usedCol')}</th><th>{t('sim.totalCol')}</th></tr></thead>
            <tbody>{d.resourceUsage.map((r) => <tr key={r.name}><td>{r.name}</td><td className="tabular-nums">{r.committed}</td><td className="tabular-nums">{r.total}</td></tr>)}</tbody></table>
        </section>
        <section className="card p-4">
          <h3 className="section-title mb-2">{t('sim.recs')}</h3>
          <ul className="space-y-1.5 text-sm text-slate-700">{d.analysis.map((a) => <li key={a} className="flex gap-2"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />{a}</li>)}</ul>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-slate-800">{d.recommendations.map((r) => <li key={r}>{r}</li>)}</ol>
        </section>
      </div>
      <SafetyNotice />
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" onClick={onRepeat}><RotateCcw className="h-4 w-4" />{t('sim.repeat')}</button>
        <button className="btn-navy" onClick={onOther}><ListChecks className="h-4 w-4" />{t('sim.chooseOther')}</button>
        <button className="btn-ghost" onClick={onReport} disabled={!saved}><FileText className="h-4 w-4" />{t('sim.trainingReport')}</button>
        <button className="btn-ghost" onClick={onInstructor}><GraduationCap className="h-4 w-4" />{t('sim.instructor')}</button>
      </div>
    </div>
  );
}
