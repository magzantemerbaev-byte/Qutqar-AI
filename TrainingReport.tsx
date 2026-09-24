import QrPlaceholder from './QrPlaceholder';
import { Logo } from './ui';
import { useApp } from '../context';
import { fmtClock, fmtDateTime, fmtLongDate } from '../i18n';
import type { TKey } from '../i18n';
import { reportId } from '../services/simSessions';
import { scenarioMeta, scenarioObjectives } from '../../shared/engine/simulator';
import { tx } from '../../shared/i18n';
import type { SimSession, SimVerdict } from '../types';

const VERDICT_KEY: Record<SimVerdict, TKey> = { correct: 'sim.v.correct', acceptable: 'sim.v.acceptable', mistake: 'sim.v.mistake', violation: 'sim.v.violation', unclear: 'sim.v.unclear' };

/** Печатный учебный отчет. Используется на странице «Отчеты» и печатается через window.print(). */
export default function TrainingReport({ s }: { s: SimSession }) {
  const { t, lang } = useApp();
  const id = reportId(s);
  const title = s.demo ? tx(lang, scenarioMeta(s.scenario).label) : s.scenarioTitle;
  const objLabel = (i: number) => (s.demo ? scenarioObjectives(s.scenario, lang)[i]?.label ?? s.objectives[i].label : s.objectives[i].label);
  const Row = ({ k, v }: { k: string; v: string }) => <div className="flex gap-3 border-b border-slate-200 py-1.5"><dt className="w-40 shrink-0 text-slate-500">{k}</dt><dd className="font-medium text-slate-900">{v}</dd></div>;

  return (
    <article id="print-area" className="mx-auto max-w-[210mm] bg-white px-8 py-9 text-[13.5px] leading-relaxed text-slate-900 shadow-lg sm:px-12">
      <header className="flex items-start justify-between gap-4 border-b-4 border-navy-800 pb-4">
        <div className="flex items-center gap-3">
          <Logo className="h-12 w-12" />
          <div>
            <h1 className="font-cond text-2xl font-bold tracking-[0.06em] text-navy-900">{t('tr.docTitle')}</h1>
            <p className="text-sm text-slate-600">{t('tr.docSubtitle')}</p>
            <p className="mt-1 inline-block rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">DEMO / TRAINING{s.demo ? ` · ${t('ins.demoRecord')}` : ''}</p>
          </div>
        </div>
        <QrPlaceholder value={id} label={t('tr.qr')} />
      </header>

      <dl className="mt-4 text-sm">
        <Row k={t('tr.id')} v={`${id} — ${t('tr.idNote')}`} />
        <Row k={t('tr.trainee')} v={s.trainee} />
        <Row k={t('tr.scenario')} v={title} />
        <Row k={t('tr.difficulty')} v={t(`sim.diff.${s.difficulty}`)} />
        <Row k={t('tr.date')} v={`${fmtLongDate(s.completedAt, lang)}, ${fmtDateTime(s.completedAt).split(', ')[1]} (UTC+5)`} />
        <Row k={t('tr.duration')} v={t('tr.durationValue', { r: fmtClock(s.realSeconds), m: s.simMinutes })} />
      </dl>

      <section className="mt-5 flex items-center gap-4 rounded-md border border-slate-300 p-3">
        <div className="text-center"><div className="font-cond text-4xl font-bold leading-none">{s.score}</div><div className="text-[11px] text-slate-500">/ 100</div></div>
        <div><div className="text-xs uppercase tracking-wide text-slate-500">{t('tr.score')}</div><div className="font-semibold">{t(`grade.${s.gradeKey}`)}</div><div className="text-sm text-slate-600">{t('tr.outcome')}: {s.demo ? t(`tr.out.${s.outcomeLevel}`) : s.outcome}</div></div>
      </section>

      <h2 className="mt-5 font-cond text-base font-bold uppercase tracking-wide text-navy-900">{t('tr.objectives')}</h2>
      <ul className="mt-1 space-y-1">{s.objectives.map((o, i) => <li key={o.id} className="flex gap-2"><span className={`font-bold ${o.achieved ? 'text-emerald-700' : 'text-red-700'}`}>{o.achieved ? '✔' : '✘'}</span><span>{objLabel(i)} — {o.achieved ? t('sim.objAchieved') : t('sim.objMissed')}</span></li>)}</ul>

      <h2 className="mt-5 font-cond text-base font-bold uppercase tracking-wide text-navy-900">{t('tr.categories')}</h2>
      <table className="mt-1 w-full text-sm">
        <tbody>{s.categories.map((c) => (
          <tr key={c.key} className="border-b border-slate-100"><td className="w-56 py-1">{t(`cat.${c.key}` as TKey)}</td>
            <td className="py-1"><div className="h-2.5 rounded bg-slate-100"><div className="h-full rounded bg-navy-700 print:bg-slate-800" style={{ width: `${c.score}%` }} /></div></td>
            <td className="w-10 py-1 text-right font-semibold tabular-nums">{c.score}</td></tr>
        ))}</tbody>
      </table>

      <h2 className="mt-5 font-cond text-base font-bold uppercase tracking-wide text-navy-900">{t('tr.decisions')} ({s.decisions.length})</h2>
      <table className="mt-1 w-full border-collapse text-xs">
        <thead><tr className="border-b-2 border-slate-300 text-left text-slate-500"><th className="w-12 py-1">{t('tr.colT')}</th><th className="py-1">{t('tr.colDecision')}</th><th className="w-40 py-1">{t('tr.colVerdict')}</th><th className="w-16 py-1 text-right">{t('tr.colSec')}</th></tr></thead>
        <tbody>{s.decisions.map((d, i) => <tr key={i} className="border-b border-slate-100"><td className="py-1 font-mono">T+{d.t}′</td><td className="py-1">{d.input}</td><td className="py-1">{t(VERDICT_KEY[d.verdict])}</td><td className="py-1 text-right tabular-nums">{d.seconds}</td></tr>)}</tbody>
      </table>
      {s.demo && <p className="mt-1 text-[11px] text-slate-500">{t('tr.demoNames')}</p>}

      <h2 className="mt-5 font-cond text-base font-bold uppercase tracking-wide text-navy-900">{t('tr.violations')} ({s.totals.violations})</h2>
      {s.safetyViolations.length ? <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">{s.safetyViolations.map((v, i) => <li key={i}>{v}</li>)}</ul> : <p className="mt-1 text-sm text-slate-600">{t('sim.violNone')}</p>}

      <h2 className="mt-5 font-cond text-base font-bold uppercase tracking-wide text-navy-900">{t('tr.recs')}</h2>
      <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm">{s.recommendations.map((r) => <li key={r}>{r}</li>)}</ol>

      <div className="mt-8 grid grid-cols-2 gap-6 text-sm text-slate-700"><div>{t('tr.signTrainee')}</div><div>{t('tr.signInstructor')}</div></div>
      <footer className="mt-6 border-t border-slate-300 pt-2 text-[10.5px] text-slate-500">{t('tr.footer')} · {t('safety.notice')}</footer>
    </article>
  );
}
