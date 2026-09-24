import { ChevronLeft, Download, FileText, FilterX, GraduationCap, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import Radar from './Radar';
import { Kpi, Pager, TrainingBadge } from '../ui';
import { useApp } from '../../context';
import { fmtClock, fmtDate, fmtDateTime } from '../../i18n';
import type { TKey } from '../../i18n';
import { allSessions, clearSessions, loadSessions } from '../../services/simSessions';
import { DIFFICULTIES, SCENARIO_LIST, scenarioMeta, scenarioObjectives } from '../../../shared/engine/simulator';
import { tx } from '../../../shared/i18n';
import type { SimDifficulty, SimScenarioType, SimSession, SimVerdict } from '../../types';

const CATS = ['tactical', 'safety', 'speed', 'resources', 'risk', 'interaction'] as const;
const DOT: Record<SimVerdict, string> = { correct: 'bg-emerald-500', acceptable: 'bg-sky-500', mistake: 'bg-orange-500', violation: 'bg-red-600', unclear: 'bg-slate-400' };
const PAGE = 12;
const scoreCls = (s: number) => (s >= 75 ? 'bg-emerald-100 text-emerald-800' : s >= 50 ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800');
const catScore = (s: SimSession, key: string) => s.categories.find((c) => c.key === key)?.score ?? 0;
const avg = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);

export default function Instructor({ onBack, highlight }: { onBack: () => void; highlight?: string }) {
  const { t, lang, navigate } = useApp();
  const [version, setVersion] = useState(0);
  const all = useMemo(() => allSessions(), [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const ownCount = useMemo(() => loadSessions().length, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const [scenario, setScenario] = useState<'' | SimScenarioType>('');
  const [trainee, setTrainee] = useState('');
  const [difficulty, setDifficulty] = useState<'' | SimDifficulty>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string | null>(highlight ?? null);

  const trainees = useMemo(() => [...new Set(all.map((s) => s.trainee))].sort(), [all]);
  const rows = useMemo(() => all.filter((s) => (!scenario || s.scenario === scenario) && (!trainee || s.trainee === trainee) && (!difficulty || s.difficulty === difficulty)
    && (!from || s.completedAt.slice(0, 10) >= from) && (!to || s.completedAt.slice(0, 10) <= to))
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt)), [all, scenario, trainee, difficulty, from, to]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const view = rows.slice((page - 1) * PAGE, page * PAGE);
  const selected = all.find((s) => s.id === sel) ?? rows[0] ?? null;

  const catAvg = useMemo(() => CATS.map((k) => ({ key: k, label: t(`cat.${k}`), score: avg(rows.map((r) => catScore(r, k))) })), [rows, t]);
  const sortedCats = [...catAvg].sort((a, b) => b.score - a.score);
  const byTrainee = useMemo(() => {
    const m = new Map<string, SimSession[]>();
    rows.forEach((r) => m.set(r.trainee, [...(m.get(r.trainee) ?? []), r]));
    return [...m].map(([name, ss]) => {
      const cats = CATS.map((k) => ({ k, v: avg(ss.map((s) => catScore(s, k))) })).sort((a, b) => a.v - b.v);
      return { name, n: ss.length, avg: avg(ss.map((s) => s.score)), best: Math.max(...ss.map((s) => s.score)), viol: ss.reduce((a, s) => a + s.totals.violations, 0),
        time: avg(ss.map((s) => s.avgDecisionSec)), weak: cats[0].k, last: ss.map((s) => s.completedAt).sort().reverse()[0], demo: ss.every((s) => s.demo) };
    }).sort((a, b) => b.avg - a.avg);
  }, [rows]);

  // Для DEMO-записей подписи целей берутся из текущего языка
  const objLabel = (s: SimSession, i: number) => (s.demo ? scenarioObjectives(s.scenario, lang)[i]?.label ?? s.objectives[i].label : s.objectives[i].label);
  const scTitle = (s: SimSession) => (s.demo ? tx(lang, scenarioMeta(s.scenario).label) : s.scenarioTitle);
  const resetFilters = () => { setScenario(''); setTrainee(''); setDifficulty(''); setFrom(''); setTo(''); setPage(1); };

  const exportCsv = () => {
    const head = [t('ins.col.trainee'), t('ins.col.scenario'), t('ins.col.diff'), t('ins.col.score'), t('ins.col.grade'), t('ins.col.obj'), t('ins.col.mistakes'), t('ins.col.viol'), t('ins.col.avgTime'), t('ins.col.duration'), t('ins.col.date'), ...CATS.map((k) => t(`cat.s.${k}`)), 'DEMO'];
    const lines = rows.map((r) => [r.trainee, scTitle(r), t(`sim.diff.${r.difficulty}`), r.score, t(`grade.${r.gradeKey}`), `${r.objectives.filter((o) => o.achieved).length}/${r.objectives.length}`,
      r.totals.mistakes, r.totals.violations, r.avgDecisionSec, fmtClock(r.realSeconds), fmtDateTime(r.completedAt), ...CATS.map((k) => catScore(r, k)), r.demo ? 'DEMO' : '']
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';'));
    const blob = new Blob(['\ufeff' + [head.join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `qutqar-training-results-${fmtDate(new Date()).replace(/\./g, '-')}.csv`; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <GraduationCap className="h-6 w-6 text-navy-600" />
        <div className="flex-1"><h2 className="font-cond text-xl font-semibold text-slate-900">{t('ins.title')}</h2><p className="text-xs text-slate-500">{t('ins.note')}</p></div>
        <TrainingBadge />
        <button className="btn-ghost" onClick={exportCsv}><Download className="h-4 w-4" />{t('common.exportCsv')}</button>
        {ownCount > 0 && <button className="btn-ghost" onClick={() => { clearSessions(); setVersion((v) => v + 1); }}><Trash2 className="h-4 w-4" />{t('ins.clear')}</button>}
        <button className="btn-navy" onClick={onBack}><ChevronLeft className="h-4 w-4" />{t('common.back')}</button>
      </div>

      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div><label className="label" htmlFor="f-sc">{t('ins.f.scenario')}</label><select id="f-sc" className="input" value={scenario} onChange={(e) => { setScenario(e.target.value as '' | SimScenarioType); setPage(1); }}><option value="">{t('common.all')}</option>{SCENARIO_LIST.map((m) => <option key={m.type} value={m.type}>{tx(lang, m.label)}</option>)}</select></div>
        <div><label className="label" htmlFor="f-tr">{t('ins.f.trainee')}</label><select id="f-tr" className="input" value={trainee} onChange={(e) => { setTrainee(e.target.value); setPage(1); }}><option value="">{t('common.all')}</option>{trainees.map((n) => <option key={n} value={n}>{n}</option>)}</select></div>
        <div><label className="label" htmlFor="f-df">{t('ins.f.difficulty')}</label><select id="f-df" className="input" value={difficulty} onChange={(e) => { setDifficulty(e.target.value as '' | SimDifficulty); setPage(1); }}><option value="">{t('common.all')}</option>{DIFFICULTIES.map((d) => <option key={d} value={d}>{t(`sim.diff.${d}`)}</option>)}</select></div>
        <div><label className="label" htmlFor="f-from">{t('ins.f.from')}</label><input id="f-from" type="date" className="input" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></div>
        <div><label className="label" htmlFor="f-to">{t('ins.f.to')}</label><input id="f-to" type="date" className="input" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></div>
        <div className="flex items-end"><button className="btn-ghost w-full" onClick={resetFilters}><FilterX className="h-4 w-4" />{t('ins.f.reset')}</button></div>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label={t('ins.k.trainees')} value={byTrainee.length} accent="bg-navy-500" />
        <Kpi label={t('ins.k.sessions')} value={rows.length} accent="bg-sky-500" />
        <Kpi label={t('ins.k.avg')} value={avg(rows.map((r) => r.score))} accent="bg-emerald-600" />
        <Kpi label={t('ins.k.viol')} value={rows.reduce((a, r) => a + r.totals.violations, 0)} accent="bg-signal-red" />
        <Kpi label={t('ins.k.time')} value={`${avg(rows.map((r) => r.avgDecisionSec))} ${t('common.sec')}`} accent="bg-amber-500" />
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="card p-4">
          <h3 className="section-title mb-2 !text-base">{t('ins.catAvg')}</h3>
          <Radar cats={catAvg} size={200} aria={t('ins.catAvg')} />
          {rows.length > 0 && (
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded border border-emerald-200 bg-emerald-50 p-2"><dt className="text-xs text-emerald-800">{t('ins.strong')}</dt><dd className="font-semibold">{sortedCats[0].label} · {sortedCats[0].score}</dd></div>
              <div className="rounded border border-red-200 bg-red-50 p-2"><dt className="text-xs text-red-800">{t('ins.weak')}</dt><dd className="font-semibold">{sortedCats[sortedCats.length - 1].label} · {sortedCats[sortedCats.length - 1].score}</dd></div>
            </dl>
          )}
        </section>
        <section className="card overflow-hidden xl:col-span-2">
          <h3 className="section-title border-b border-slate-200 px-4 py-3 !text-base">{t('ins.trainees')}</h3>
          <div className="overflow-x-auto">
            <table className="data-table min-w-[640px]">
              <thead><tr><th>{t('ins.col.trainee')}</th><th className="text-right">{t('ins.col.sessions')}</th><th className="text-right">{t('ins.col.avg')}</th><th className="text-right">{t('ins.col.best')}</th><th className="text-right">{t('ins.col.viol')}</th><th className="text-right">{t('ins.col.avgTime')}</th><th>{t('ins.col.weak')}</th><th>{t('ins.col.last')}</th></tr></thead>
              <tbody>
                {byTrainee.map((r) => (
                  <tr key={r.name} className="cursor-pointer" onClick={() => { setTrainee(r.name); setPage(1); }}>
                    <td className="font-medium text-slate-900">{r.name}{r.demo && <span className="ml-1 tag bg-slate-100 text-slate-500">DEMO</span>}</td>
                    <td className="text-right tabular-nums">{r.n}</td><td className="text-right"><span className={`tag ${scoreCls(r.avg)}`}>{r.avg}</span></td><td className="text-right tabular-nums">{r.best}</td>
                    <td className="text-right tabular-nums">{r.viol}</td><td className="text-right tabular-nums">{r.time} {t('common.sec')}</td><td className="text-xs">{t(`cat.${r.weak}`)}</td><td className="text-xs text-slate-500">{fmtDate(r.last)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="card overflow-hidden">
        <h3 className="section-title flex items-center gap-2 border-b border-slate-200 px-4 py-3">{t('ins.history')} <span className="text-sm font-normal text-slate-500">({rows.length})</span></h3>
        <div className="overflow-x-auto">
          <table className="data-table min-w-[1000px]">
            <thead><tr><th>{t('ins.col.trainee')}</th><th>{t('ins.col.scenario')}</th><th>{t('ins.col.diff')}</th><th>{t('ins.col.score')}</th>{CATS.map((k) => <th key={k} className="text-center">{t(`cat.s.${k}` as TKey)}</th>)}<th className="text-center">{t('ins.col.obj')}</th><th className="text-center">{t('ins.col.viol')}</th><th>{t('ins.col.duration')}</th><th>{t('ins.col.date')}</th></tr></thead>
            <tbody>
              {view.map((r) => (
                <tr key={r.id} onClick={() => setSel(r.id)} className={`cursor-pointer ${selected?.id === r.id ? '!bg-amber-50' : ''}`}>
                  <td className="font-medium text-slate-900">{r.trainee}{r.id === highlight && <span className="ml-1 tag bg-navy-800 text-white">{t('common.newRecord')}</span>}</td>
                  <td className="text-slate-600">{scTitle(r)}</td><td><span className="text-xs">{t(`sim.diff.${r.difficulty}`)}</span></td>
                  <td><span className={`tag ${scoreCls(r.score)}`}>{r.score}</span></td>
                  {CATS.map((k) => { const v = catScore(r, k); return <td key={k} className="text-center tabular-nums" style={{ backgroundColor: `rgba(${v >= 50 ? '16,185,129' : '217,45,32'},${Math.abs(v - 50) / 220})` }}>{v}</td>; })}
                  <td className="text-center tabular-nums">{r.objectives.filter((o) => o.achieved).length}/{r.objectives.length}</td>
                  <td className="text-center tabular-nums">{r.totals.violations}</td><td className="tabular-nums">{fmtClock(r.realSeconds)}</td><td className="text-xs text-slate-500">{fmtDateTime(r.completedAt)}</td>
                </tr>
              ))}
              {!view.length && <tr><td colSpan={14} className="py-6 text-center text-slate-500">{t('ins.empty')}</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={page} pages={pages} onPage={setPage} />
      </section>

      {selected && (
        <section className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="section-title">{t('ins.detail')}: {selected.trainee} · {scTitle(selected)}{selected.demo && <span className="ml-2 tag bg-slate-100 text-slate-500">{t('ins.demoRecord')}</span>}</h3>
            <button className="btn-navy !py-1.5" onClick={() => navigate('report', { session: selected.id })}><FileText className="h-4 w-4" />{t('sim.trainingReport')}</button>
          </div>
          <p className="mt-1 text-sm text-slate-600">{t('ins.detailMeta', { s: selected.score, g: t(`grade.${selected.gradeKey}`), o: selected.demo ? t(`tr.out.${selected.outcomeLevel}`) : selected.outcome, m: selected.simMinutes, r: fmtClock(selected.realSeconds) })}</p>
          <div className="mt-3 grid gap-4 lg:grid-cols-3">
            <div>
              <Radar cats={selected.categories.map((c) => ({ ...c, label: t(`cat.${c.key}` as TKey) }))} size={200} aria={t('sim.radarAria')} />
              <ul className="mt-2 space-y-1 text-sm">{selected.objectives.map((o, i) => <li key={o.id} className="flex gap-2"><span className={o.achieved ? 'text-emerald-600' : 'text-red-600'}>{o.achieved ? '✔' : '✘'}</span>{objLabel(selected, i)}</li>)}</ul>
            </div>
            <div>
              <h4 className="mb-1 text-xs font-semibold text-slate-600">{t('ins.decisions')}</h4>
              <ol className="scroll-thin max-h-64 space-y-1 overflow-y-auto text-sm">
                {selected.decisions.map((x, i) => <li key={i} className="flex items-start gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[x.verdict]}`} /><span className="font-mono text-xs text-slate-500">T+{x.t}′</span><span className="flex-1">{x.input}</span><span className="text-xs tabular-nums text-slate-500">{x.seconds} {t('common.sec')}</span></li>)}
                {!selected.decisions.length && <li className="text-slate-500">{t('ins.noDecisions')}</li>}
              </ol>
            </div>
            <div className="space-y-3 text-sm">
              <div><h4 className="mb-1 text-xs font-semibold text-red-700">{t('sim.violList')} ({selected.safetyViolations.length})</h4>
                <ul className="space-y-1">{selected.safetyViolations.map((x, i) => <li key={i} className="rounded bg-red-50 px-2 py-1">{x}</li>)}{!selected.safetyViolations.length && <li className="text-slate-500">{t('common.none')}</li>}</ul></div>
              <div><h4 className="mb-1 text-xs font-semibold text-orange-700">{t('sim.mistakeList')} ({selected.mistakes.length})</h4>
                <ul className="scroll-thin max-h-40 space-y-1 overflow-y-auto">{selected.mistakes.map((x, i) => <li key={i} className="rounded bg-orange-50 px-2 py-1">{x}</li>)}{!selected.mistakes.length && <li className="text-slate-500">{t('common.none')}</li>}</ul></div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
