import { Check, ClipboardCopy, Download, Eraser, FileText, GraduationCap, Printer, Siren, Sparkles, WandSparkles } from 'lucide-react';
import { useMemo, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react';
import TrainingReport from '../components/TrainingReport';
import { ContentLangNote, EmptyState, ErrorAlert, MetaWarnings, ModeBadge, PageHeader, SafetyNotice, Spinner } from '../components/ui';
import { useApp } from '../context';
import { fmtDateTime } from '../i18n';
import type { TKey } from '../i18n';
import { ai } from '../services/aiService';
import { allSessions } from '../services/simSessions';
import { scenarioMeta } from '../../shared/engine/simulator';
import { tx } from '../../shared/i18n';
import type { AiMeta, ReportDoc, ReportForm } from '../types';

/** Значения типов остаются на русском (их использует шаблон донесения), подписи — локализованы */
const TYPES: [string, TKey][] = [['Пожар', 'rep.t.fire'], ['Природный пожар', 'rep.t.wildfire'], ['Паводок / подтопление', 'rep.t.flood'], ['ДТП', 'rep.t.accident'],
  ['Авария на опасном объекте', 'rep.t.hazmat'], ['Обрушение здания', 'rep.t.collapse'], ['Поисково-спасательная операция', 'rep.t.sar'], ['Иное', 'rep.t.other']];
const today = () => new Date(Date.now() + 5 * 3600e3).toISOString().slice(0, 10);
const EMPTY = (author: string): ReportForm => ({ date: today(), time: '', place: '', type: '', area: '', victims: '', forces: '', result: '', author });
const SAMPLE = (author: string): ReportForm => ({
  date: today(), time: '09:42', type: 'Природный пожар', area: '45 га', victims: 'нет', author,
  place: 'Карагандинская обл., Бухар-Жырауский р-н, 12 км северо-восточнее пос. Ботакара (условно)',
  forces: '2 пожарных расчета, 1 АЦ, БПЛА, 14 человек личного состава, 3 единицы техники (DEMO)',
  result: 'Пожар локализован в 13:20 и ликвидирован в 15:05. Угроза населенному пункту устранена, проложена минерализованная полоса протяженностью 2,4 км',
});
type Errors = Partial<Record<keyof ReportForm, TKey>>;

export default function ReportGenerator() {
  const { t, params } = useApp();
  const [tab, setTab] = useState<'incident' | 'training'>(params.get('session') ? 'training' : 'incident');
  return (
    <>
      <PageHeader icon={<FileText className="h-5 w-5" />} title={t('rep.title')} subtitle={t('rep.subtitle')} />
      <div className="no-print mb-4 inline-flex rounded-md bg-white/5 p-1 ring-1 ring-white/10" role="tablist">
        {([['incident', 'rep.tab.incident', Siren], ['training', 'rep.tab.training', GraduationCap]] as const).map(([k, key, Icon]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium ${tab === k ? 'bg-white text-navy-900' : 'text-slate-200 hover:bg-white/10'}`}><Icon className="h-4 w-4" />{t(key)}</button>
        ))}
      </div>
      {tab === 'incident' ? <IncidentReport /> : <TrainingTab />}
    </>
  );
}

function TrainingTab() {
  const { t, lang, params, navigate } = useApp();
  const sessions = useMemo(() => allSessions().sort((a, b) => b.completedAt.localeCompare(a.completedAt)), []);
  const [id, setId] = useState(params.get('session') ?? sessions[0]?.id ?? '');
  const s = sessions.find((x) => x.id === id) ?? null;
  if (!sessions.length) return <div className="card"><EmptyState icon={<GraduationCap className="h-10 w-10" />} title={t('rep.noSessions')}><button className="btn-navy mt-2" onClick={() => navigate('simulator')}>{t('rep.openSim')}</button></EmptyState></div>;
  return (
    <div className="space-y-3">
      <div className="no-print card flex flex-wrap items-end gap-3 p-3">
        <div className="min-w-[260px] flex-1">
          <label className="label" htmlFor="tr-s">{t('rep.selectSession')}</label>
          <select id="tr-s" className="input" value={id} onChange={(e) => setId(e.target.value)}>
            {sessions.map((x) => <option key={x.id} value={x.id}>{fmtDateTime(x.completedAt)} · {x.trainee} · {x.demo ? tx(lang, scenarioMeta(x.scenario).label) : x.scenarioTitle} · {x.score}{x.demo ? ' · DEMO' : ''}</option>)}
          </select>
        </div>
        <button className="btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" />{t('common.print')}</button>
      </div>
      {s && <TrainingReport s={s} />}
    </div>
  );
}

function IncidentReport() {
  const { t, settings } = useApp();
  const [form, setForm] = useState<ReportForm>(() => EMPTY(settings.operator));
  const [errors, setErrors] = useState<Errors>({});
  const [doc, setDoc] = useState<ReportDoc | null>(null);
  const [author, setAuthor] = useState(settings.operator);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [meta, setMeta] = useState<AiMeta | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const toText = (d: ReportDoc) => [t('rep.docHeader'), t('rep.docNote'), t('rep.draftId', { n: d.number }), d.title, '', ...d.sections.flatMap((s) => [s.heading, ...s.paragraphs, '']), `${t('rep.preparedAt')} ${d.createdAt}`, t('rep.footer')].join('\n');
  const set = (k: keyof ReportForm) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setForm((f) => ({ ...f, [k]: e.target.value })); setErrors((er) => ({ ...er, [k]: undefined })); };
  const validate = () => {
    const e: Errors = {};
    if (!form.date) e.date = 'rep.e.date';
    if (!form.time) e.time = 'rep.e.time';
    if (form.place.trim().length < 3) e.place = 'rep.e.place';
    if (!form.type) e.type = 'rep.e.type';
    if (form.result.trim().length < 5) e.result = 'rep.e.result';
    setErrors(e);
    return Object.keys(e).length === 0;
  };
  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true); setErr(null);
    try {
      const r = await ai.report(form);
      setDoc(r.data); setMeta(r.meta); setAuthor(form.author || settings.operator);
      setTimeout(() => document.getElementById('print-area')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (e) { setErr((e as Error).message); } finally { setLoading(false); }
  };
  const copy = async () => { if (!doc) return; try { await navigator.clipboard.writeText(toText(doc)); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ } };
  const downloadTxt = () => {
    if (!doc) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([toText(doc)], { type: 'text/plain;charset=utf-8' }));
    a.download = `qutqar_${doc.number}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const E = (k: keyof ReportForm) => (errors[k] ? t(errors[k]!) : undefined);

  return (
    <div className="grid gap-4 xl:grid-cols-5">
      <form onSubmit={(e) => void submit(e)} className="no-print card h-fit p-4 xl:col-span-2" noValidate>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="section-title">{t('rep.input')}</h2>
          <div className="flex gap-2">
            <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => { setForm(SAMPLE(settings.operator)); setErrors({}); }}><WandSparkles className="h-4 w-4" />{t('rep.sample')}</button>
            <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => { setForm(EMPTY(settings.operator)); setErrors({}); setDoc(null); }}><Eraser className="h-4 w-4" />{t('rep.clear')}</button>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <F label={t('rep.f.date')} error={E('date')}><input type="date" className="input" value={form.date} onChange={set('date')} /></F>
          <F label={t('rep.f.time')} error={E('time')}><input type="time" className="input" value={form.time} onChange={set('time')} /></F>
          <F label={t('rep.f.place')} error={E('place')} wide><input className="input" value={form.place} onChange={set('place')} placeholder={t('rep.f.placePh')} /></F>
          <F label={t('rep.f.type')} error={E('type')}><select className="input" value={form.type} onChange={set('type')}><option value="">{t('rep.f.typePh')}</option>{TYPES.map(([v, k]) => <option key={v} value={v}>{t(k)}</option>)}</select></F>
          <F label={t('rep.f.area')}><input className="input" value={form.area} onChange={set('area')} placeholder={t('rep.f.areaPh')} /></F>
          <F label={t('rep.f.victims')} wide><input className="input" value={form.victims} onChange={set('victims')} placeholder={t('rep.f.victimsPh')} /></F>
          <F label={t('rep.f.forces')} wide><textarea rows={3} className="input" value={form.forces} onChange={set('forces')} placeholder={t('rep.f.forcesPh')} /></F>
          <F label={t('rep.f.result')} error={E('result')} wide><textarea rows={3} className="input" value={form.result} onChange={set('result')} placeholder={t('rep.f.resultPh')} /></F>
          <F label={t('rep.f.author')} wide><input className="input" value={form.author} onChange={set('author')} /></F>
        </div>
        <button type="submit" className="btn-primary mt-4 w-full" disabled={loading}>{loading ? <Spinner label={t('rep.generating')} /> : <><Sparkles className="h-4 w-4" />{t('rep.generate')}</>}</button>
      </form>
      <div className="xl:col-span-3">
        {!doc ? (
          <div className="card flex min-h-[300px] flex-col items-center justify-center p-8 text-center text-sm text-slate-500">
            {err && <div className="mb-4 w-full text-left"><ErrorAlert message={err} /></div>}
            <FileText className="mb-3 h-10 w-10 text-slate-300" />{t('rep.preview')}<span className="mt-1">{t('rep.empty')}</span>
          </div>
        ) : (
          <>
            {err && <div className="no-print mb-3"><ErrorAlert message={err} /></div>}
            <div className="no-print mb-3 flex flex-wrap items-center gap-2">
              <button className="btn-primary" onClick={() => window.print()}><Printer className="h-4 w-4" />{t('common.print')}</button>
              <button className="btn-ghost" onClick={downloadTxt}><Download className="h-4 w-4" />{t('rep.downloadTxt')}</button>
              <button className="btn-ghost" onClick={() => void copy()}>{copied ? <><Check className="h-4 w-4" />{t('common.copied')}</> : <><ClipboardCopy className="h-4 w-4" />{t('rep.copyText')}</>}</button>
              <ModeBadge meta={meta} />
            </div>
            <div className="no-print mb-3 space-y-1"><MetaWarnings meta={meta} /><ContentLangNote /></div>
            <article id="print-area" className="mx-auto max-w-[210mm] bg-white px-8 py-10 font-serif text-[15px] leading-relaxed text-slate-900 shadow-lg sm:px-14">
              <header className="border-b-2 border-slate-900 pb-3 text-center">
                <div className="text-xs font-semibold tracking-wide">{t('rep.docHeader')}</div>
                <div className="text-[11px] text-slate-500">{t('rep.docNote')}</div>
              </header>
              <div className="mt-6 text-center"><h2 className="text-lg font-bold">{t('rep.draftId', { n: doc.number })}</h2><p className="text-sm">{doc.title}</p></div>
              <div className="mt-6 space-y-4">
                {doc.sections.map((s) => <section key={s.heading}><h3 className="font-bold">{s.heading}</h3>{s.paragraphs.map((p) => <p key={p} className="indent-8 text-justify">{p}</p>)}</section>)}
              </div>
              <div className="mt-10 grid grid-cols-2 gap-6 text-sm">
                <div><div>{t('rep.preparedBy')}</div><div className="mt-6 border-b border-slate-900" /><div className="mt-1 text-xs">{author}</div></div>
                <div><div>{t('rep.preparedAt')}</div><div className="mt-6 border-b border-slate-900" /><div className="mt-1 text-xs">{doc.createdAt}</div></div>
              </div>
              <footer className="mt-10 border-t border-slate-300 pt-2 text-[11px] text-slate-500">{t('rep.footer')}</footer>
            </article>
            <div className="no-print mt-3"><SafetyNotice /></div>
          </>
        )}
      </div>
    </div>
  );
}

function F({ label, error, wide, children }: { label: string; error?: string; wide?: boolean; children: ReactNode }) {
  return <label className={`block ${wide ? 'sm:col-span-2' : ''}`}><span className="label">{label}</span>{children}{error && <span className="mt-1 block text-xs text-red-600">{error}</span>}</label>;
}
