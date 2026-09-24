import { Archive, ClipboardList, FileText, FileUp, Gavel, Lightbulb, MessageSquareWarning, Radio, Scale, Timer, TriangleAlert, Truck } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { ContentLangNote, ErrorAlert, MetaWarnings, ModeBadge, PageHeader, Skeleton, StatementTag } from '../components/ui';
import { useApp } from '../context';
import { PAST_INCIDENTS } from '../data/pastIncidents';
import { TYPE_META } from '../data/meta';
import { ai } from '../services/aiService';
import { SAMPLE_REPORT } from '../../shared/engine/aar';
import { tx } from '../../shared/i18n';
import type { AarFinding, AfterActionReport, AiEnvelope, AiMeta } from '../types';

type Source = 'upload' | 'text' | 'archive';

export default function IncidentAnalysis() {
  const { settings, t, lang } = useApp();
  const [source, setSource] = useState<Source>('upload');
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [archiveId, setArchiveId] = useState(PAST_INCIDENTS[0].id);
  const [report, setReport] = useState<AfterActionReport | null>(null);
  const [meta, setMeta] = useState<AiMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (p: Promise<AiEnvelope<AfterActionReport>>) => {
    setLoading(true); setError(null); setReport(null);
    try { const r = await p; setReport(r.data); setMeta(r.meta); setTimeout(() => document.getElementById('aar')?.scrollIntoView({ behavior: 'smooth' }), 50); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { setError(t('aar.tooBig')); return; }
    const isText = /\.(txt|md)$/i.test(f.name) || f.type.startsWith('text/');
    if (isText) {
      const t = await f.text();
      setText(t); setTitle(f.name);
      void run(ai.incidentText(f.name, t));
    } else if (/\.(pdf|docx)$/i.test(f.name)) {
      if (settings.demoMode) { setError(t('aar.pdfDemo')); return; }
      void run(ai.incidentFile(f));
    } else {
      setError(t('aar.badFile'));
    }
  };

  return (
    <>
      <PageHeader icon={<ClipboardList className="h-5 w-5" />} title={t('aar.title')} subtitle={t('aar.subtitle')} />

      <div className="mb-4 flex gap-3 rounded-md border-2 border-amber-400 bg-amber-50 p-3 text-sm text-amber-950" role="note">
        <Scale className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <p><strong>{t('aar.label')}</strong> {t('aar.labelText')}</p>
      </div>

      <div className="card mb-4 overflow-hidden">
        <div className="flex border-b border-slate-200 text-sm" role="tablist">
          {([['upload', t('aar.tab.upload'), FileUp], ['text', t('aar.tab.text'), FileText], ['archive', t('aar.tab.archive'), Archive]] as const).map(([k, label, Icon]) => (
            <button key={k} role="tab" aria-selected={source === k} onClick={() => setSource(k)}
              className={`flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 font-medium ${source === k ? 'border-b-2 border-signal-red text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {source === 'upload' && (
            <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-slate-300 p-6 text-center">
              <FileUp className="h-10 w-10 text-slate-400" />
              <p className="text-sm text-slate-700">{t('aar.uploadHint')}</p>
              <p className="text-xs text-slate-500">{settings.demoMode ? t('aar.formatsDemo') : t('aar.formatsLive')}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <button className="btn-navy" onClick={() => fileRef.current?.click()} disabled={loading}><FileUp className="h-4 w-4" />{t('aar.choose')}</button>
                <button className="btn-ghost" onClick={() => { setText(SAMPLE_REPORT); setTitle('Учебное донесение: пожар, г. Кокшетау'); setSource('text'); }}>{t('aar.sample')}</button>
              </div>
              <input ref={fileRef} type="file" className="hidden" accept={settings.demoMode ? '.txt,.md' : '.txt,.md,.pdf,.docx'} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
          )}
          {source === 'text' && (
            <div className="space-y-2">
              <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} aria-label={t('aar.docName')} placeholder={t('aar.docName')} />
              <textarea className="input min-h-[220px] font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder="21:14 …" aria-label={t('aar.docText')} />
              <div className="flex flex-wrap gap-2">
                <button className="btn-primary" disabled={loading || text.trim().length < 20} onClick={() => void run(ai.incidentText(title || t('aar.docName'), text))}><Gavel className="h-4 w-4" />{t('aar.run')}</button>
                <button className="btn-ghost" onClick={() => { setText(SAMPLE_REPORT); setTitle('Учебное донесение: пожар, г. Кокшетау'); }}>{t('aar.insertSample')}</button>
              </div>
            </div>
          )}
          {source === 'archive' && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <select className="input" value={archiveId} onChange={(e) => setArchiveId(e.target.value)} aria-label={t('aar.tab.archive')}>
                {PAST_INCIDENTS.map((p) => <option key={p.id} value={p.id}>{TYPE_META[p.type].emoji} {p.title} ({tx(lang, TYPE_META[p.type].label)}) — {p.date} ({p.location})</option>)}
              </select>
              <button className="btn-primary shrink-0" disabled={loading} onClick={() => void run(ai.incidentArchive(PAST_INCIDENTS.find((p) => p.id === archiveId)!))}><Gavel className="h-4 w-4" />{t('aar.run')}</button>
            </div>
          )}
        </div>
      </div>

      {error && <div className="mb-4"><ErrorAlert message={error} /></div>}
      {loading && <div className="card p-4"><div className="mb-2 text-xs font-semibold text-slate-500">{t('aar.loading')}</div><Skeleton lines={6} /></div>}
      {report && <AarView r={report} meta={meta} />}
    </>
  );
}

function Block({ icon, title, items, empty, children }: { icon: ReactNode; title: string; items?: AarFinding[]; empty?: string; children?: ReactNode }) {
  const { t } = useApp();
  return (
    <section className="card p-4">
      <h3 className="section-title mb-2 flex items-center gap-2 !text-base">{icon}{title}{items && <span className="text-sm font-normal text-slate-500">({items.length})</span>}</h3>
      {children}
      {items && (items.length ? (
        <ul className="space-y-1.5">{items.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-800"><StatementTag kind={f.kind} /><span className="flex-1">{f.text}</span>{f.evidence && <span className="shrink-0 rounded bg-slate-100 px-1.5 text-[11px] text-slate-500">{f.evidence}</span>}</li>
        ))}</ul>
      ) : <p className="text-sm text-slate-500">{empty ?? t('aar.none')}</p>)}
    </section>
  );
}

function AarView({ r, meta }: { r: AfterActionReport; meta: AiMeta | null }) {
  const { t } = useApp();
  return (
    <div id="aar" className="space-y-4">
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 bg-navy-800 px-4 py-3 text-white">
          <h2 className="font-cond text-lg font-semibold">{r.title}</h2>
          <div className="flex flex-wrap items-center gap-2"><span className="rounded bg-signal-amber px-2 py-0.5 text-[11px] font-bold text-navy-950">{t('aar.badge')}</span><ModeBadge meta={meta} /></div>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-xs font-semibold text-amber-800">{t('aar.label')}</p>
          <ContentLangNote />
          <p className="text-sm text-slate-800">{r.summary}</p>
          <p className="text-xs text-slate-500">{t('aar.source', { s: r.source })}</p>
          <MetaWarnings meta={meta} />
          {r.metrics.length > 0 && (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              {r.metrics.map((m) => <div key={m.label} className="rounded bg-slate-50 p-2"><dt className="text-xs text-slate-500">{m.label}</dt><dd className="font-cond text-xl font-bold text-slate-900">{m.value}</dd></div>)}
            </dl>
          )}
        </div>
      </section>

      <Block icon={<Timer className="h-4 w-4 text-navy-600" />} title={t('aar.timeline')}>
        {r.timeline.length ? (
          <ol className="relative space-y-2 border-l-2 border-slate-200 pl-4">
            {r.timeline.map((x, i) => (
              <li key={i} className="text-sm">
                <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-signal-red" />
                <span className="mr-2 font-mono font-semibold text-slate-900">{x.time}</span>
                <span className="mr-2 rounded bg-slate-100 px-1.5 text-[11px] text-slate-600">{x.category}</span>
                <span className="text-slate-700">{x.text}</span>
                <span className="ml-2 text-[11px] text-slate-400">{t('aar.line', { n: x.line })}</span>
              </li>
            ))}
          </ol>
        ) : <p className="text-sm text-slate-500">{t('aar.noTimeline')}</p>}
      </Block>

      <div className="grid gap-4 lg:grid-cols-2">
        <Block icon={<Gavel className="h-4 w-4 text-navy-600" />} title={t('aar.decisions')} items={r.keyDecisions} />
        <Block icon={<Timer className="h-4 w-4 text-orange-600" />} title={t('aar.delays')} items={r.delays} />
        <Block icon={<TriangleAlert className="h-4 w-4 text-red-600" />} title={t('aar.risks')} items={r.risks} />
        <Block icon={<Radio className="h-4 w-4 text-violet-600" />} title={t('aar.comms')} items={r.communication} />
        <Block icon={<Truck className="h-4 w-4 text-navy-600" />} title={t('aar.resources')} items={r.resourceNotes} empty="—">
          {r.resources.length > 0 && (
            <table className="mb-2 w-full text-sm"><thead className="text-left text-xs text-slate-500"><tr><th>{t('aar.resItem')}</th><th>{t('aar.resCount')}</th><th>{t('aar.resWhere')}</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{r.resources.map((x, i) => <tr key={i}><td className="py-1 uppercase">{x.item}</td><td className="tabular-nums">{x.count}</td><td className="text-xs text-slate-500">{x.evidence}</td></tr>)}</tbody></table>
          )}
        </Block>
        <Block icon={<Lightbulb className="h-4 w-4 text-emerald-600" />} title={t('aar.lessons')} items={r.lessons} empty="—" />
      </div>
      {r.dataQuality.length > 0 && (
        <section className="rounded-md border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">
          <h3 className="mb-1 flex items-center gap-1.5 font-semibold"><MessageSquareWarning className="h-4 w-4" />{t('aar.dataQuality')}</h3>
          <ul className="list-disc space-y-0.5 pl-5">{r.dataQuality.map((d) => <li key={d}>{d}</li>)}</ul>
        </section>
      )}
    </div>
  );
}
