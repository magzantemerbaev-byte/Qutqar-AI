import { BookOpen, FileUp, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import Modal from '../components/Modal';
import { ContentLangNote, ErrorAlert, MetaWarnings, ModeBadge, PageHeader, PipelineSteps, SafetyNotice, Skeleton } from '../components/ui';
import { useApp } from '../context';
import { ai, kbApi, type KbListResponse } from '../services/aiService';
import type { AiMeta, KbAnswer } from '../types';

const EXAMPLES = ['kb.ex1', 'kb.ex2', 'kb.ex3', 'kb.ex4'] as const;
const STEPS = ['kb.st1', 'kb.st2', 'kb.st3', 'kb.st4', 'kb.st5', 'kb.st6'] as const;

/** Ответ со ссылками [n] → подсветка номеров источников */
function AnswerText({ text }: { text: string }) {
  const parts = text.split(/(\[\d+\])/g);
  return <p className="text-sm leading-relaxed text-slate-800">{parts.map((p, i) => /^\[\d+\]$/.test(p)
    ? <a key={i} href={`#cit-${p.slice(1, -1)}`} className="mx-0.5 rounded bg-navy-800 px-1 text-[11px] font-bold text-white no-underline">{p.slice(1, -1)}</a> : <span key={i}>{p}</span>)}</p>;
}

export default function KnowledgeBase() {
  const { settings, t } = useApp();
  const [list, setList] = useState<KbListResponse | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState<KbAnswer | null>(null);
  const [meta, setMeta] = useState<AiMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  const load = useCallback(async () => {
    setListError(null);
    try { setList(await kbApi.list()); } catch (e) { setList(null); setListError((e as Error).message); }
  }, []);
  useEffect(() => { void load(); }, [load, settings.demoMode]);

  const search = async (q: string) => {
    const text = q.trim();
    if (!text) return;
    setQuery(text); setLoading(true); setError(null); setAnswer(null);
    try { const r = await ai.kbSearch(text); setAnswer(r.data); setMeta(r.meta); }
    catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  };
  const remove = async (id: string) => {
    try { await kbApi.remove(id); await load(); } catch (e) { setListError((e as Error).message); }
  };

  return (
    <>
      <PageHeader icon={<BookOpen className="h-5 w-5" />} title={t('kb.title')} subtitle={t('kb.subtitle')}
        actions={<button className="btn-primary" onClick={() => setUploadOpen(true)}><FileUp className="h-4 w-4" />{t('kb.upload')}</button>} />

      <div className="card mb-4 space-y-2 p-3">
        <PipelineSteps steps={STEPS.map((k) => t(k))} active={loading ? 4 : answer ? 6 : 0} done={Boolean(answer)} />
        {list && <p className="text-xs text-slate-500">{t('kb.pipeline', { e: list.pipeline.embedding, c: list.pipeline.chunks, t: list.pipeline.threshold })} <strong className={list.pipeline.official ? 'text-emerald-700' : 'text-red-700'}>{list.pipeline.official}</strong></p>}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <form className="card flex gap-2 p-3" onSubmit={(e: FormEvent) => { e.preventDefault(); void search(query); }}>
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('kb.placeholder')} maxLength={1000} aria-label={t('kb.placeholder')} />
            <button type="submit" className="btn-navy" disabled={loading || !query.trim()}><Search className="h-4 w-4" />{t('kb.find')}</button>
          </form>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((k) => t(k)).map((e) => <button key={e} onClick={() => void search(e)} className="rounded-full border border-white/20 bg-white/5 px-3 py-1 text-xs text-slate-200 hover:bg-white/10">{e}</button>)}
          </div>
          {error && <ErrorAlert message={error} />}
          {loading && <div className="card p-4"><Skeleton lines={5} /></div>}
          {answer && (
            <section className="card overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-navy-800 px-4 py-2.5 text-white">
                <h2 className="font-cond text-lg font-semibold">{t('kb.answer')}</h2><ModeBadge meta={meta} />
              </div>
              <div className="space-y-3 p-4">
                <p className={`rounded px-3 py-2 text-sm font-semibold ${answer.citations.some((c) => c.official) ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>{answer.notice}</p>
                <MetaWarnings meta={meta} />
                <ContentLangNote />
                <AnswerText text={answer.answer} />
                {answer.citations.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-slate-900">{t('kb.sources')}</h3>
                    <ol className="space-y-2">
                      {answer.citations.map((c, i) => (
                        <li key={c.chunkId} id={`cit-${i + 1}`} className="rounded-md border border-slate-200 p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded bg-navy-800 px-1.5 text-xs font-bold text-white">{i + 1}</span>
                            <span className={`rounded px-1.5 py-px text-[10px] font-bold ${c.official ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{c.official ? t('as.official') : t('as.demoDoc')}</span>
                            <span className="text-xs text-slate-500">{t('as.proximity', { s: c.score.toFixed(3) })}</span>
                          </div>
                          <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                            <div><dt className="inline text-slate-500">{t('kb.src')}: </dt><dd className="inline font-medium text-slate-800">{c.source}</dd></div>
                            <div><dt className="inline text-slate-500">{t('kb.doc')}: </dt><dd className="inline font-medium text-slate-800">{c.document}</dd></div>
                            <div><dt className="inline text-slate-500">{t('kb.section')}: </dt><dd className="inline font-medium text-slate-800">{c.section}</dd></div>
                            <div><dt className="inline text-slate-500">{t('kb.clausePage')}: </dt><dd className="inline font-medium text-slate-800">{c.clause ?? '—'} / {c.page ?? '—'}</dd></div>
                          </dl>
                          <p className="mt-2 border-l-2 border-slate-300 pl-2 text-sm text-slate-700">{c.excerpt}</p>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
                <p className="text-[11px] text-slate-400">{t('kb.searchStats', { c: answer.pipeline.chunksSearched, k: answer.pipeline.topK, e: answer.pipeline.embedding, t: answer.pipeline.threshold })}</p>
                <SafetyNotice />
              </div>
            </section>
          )}
        </div>

        <section className="card h-fit overflow-hidden">
          <h2 className="section-title border-b border-slate-200 px-4 py-3">{t('kb.docs')}</h2>
          {listError && <div className="p-3"><ErrorAlert message={listError} onRetry={() => void load()} /></div>}
          {!list && !listError && <div className="p-4"><Skeleton /></div>}
          {list && (
            <ul className="divide-y divide-slate-100">
              {list.documents.map((d) => (
                <li key={d.id} className="flex items-start gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-900">{d.title}</div>
                    <div className="text-xs text-slate-500">{d.category} · {t('kb.chunks', { n: d.chunks })}{d.pages ? ` · ${t('kb.pages', { n: d.pages })}` : ''}</div>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      <span className={`rounded px-1.5 py-px text-[10px] font-bold ${d.official ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{d.official ? t('as.official') : d.origin === 'demo' ? 'DEMO' : t('kb.unofficial')}</span>
                    </div>
                  </div>
                  {d.origin === 'upload' && <button onClick={() => void remove(d.id)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={t('kb.delete', { t: d.title })}><Trash2 className="h-4 w-4" /></button>}
                </li>
              ))}
              {!list.documents.length && <li className="px-4 py-6 text-center text-sm text-slate-500">{t('kb.noDocs')}</li>}
            </ul>
          )}
        </section>
      </div>

      <UploadModal open={uploadOpen} onClose={() => setUploadOpen(false)} onDone={() => { setUploadOpen(false); void load(); }} demo={settings.demoMode} />
    </>
  );
}

function UploadModal({ open, onClose, onDone, demo }: { open: boolean; onClose: () => void; onDone: () => void; demo: boolean }) {
  const { t } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('orders');
  const [source, setSource] = useState('');
  const [official, setOfficial] = useState(false);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!file) { setError(t('kb.up.noFile')); return; }
    if (official && !source.trim()) { setError(t('kb.up.needSource')); return; }
    setBusy(true); setError(null);
    try { await kbApi.upload(file, { title: title || file.name, category: t(`kb.cat.${category}` as 'kb.cat.laws'), source, official, adminToken: token || undefined }); setFile(null); setTitle(''); setSource(''); setOfficial(false); onDone(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('kb.up.title')}
      footer={<><button className="btn-ghost" onClick={onClose}>{t('common.cancel')}</button><button className="btn-primary" onClick={() => void submit()} disabled={busy || !file}><FileUp className="h-4 w-4" />{busy ? t('kb.up.busy') : t('kb.up.go')}</button></>}>
      <div className="space-y-3 text-sm">
        <p className="text-slate-600">{t('kb.up.types')} {demo ? t('kb.up.demo') : t('kb.up.live')}</p>
        <div><label className="label" htmlFor="kb-file">{t('kb.up.file')}</label><input id="kb-file" type="file" accept={demo ? '.txt,.md' : '.txt,.md,.pdf,.docx'} className="input" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        <div><label className="label" htmlFor="kb-title">{t('kb.up.name')}</label><input id="kb-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="label" htmlFor="kb-cat">{t('kb.up.cat')}</label>
            <select id="kb-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {(['laws', 'rules', 'orders', 'instr', 'method'] as const).map((c) => <option key={c} value={c}>{t(`kb.cat.${c}`)}</option>)}
            </select></div>
          <div><label className="label" htmlFor="kb-src">{t('kb.up.source')}</label><input id="kb-src" className="input" value={source} onChange={(e) => setSource(e.target.value)} placeholder={t('kb.up.sourcePh')} /></div>
        </div>
        {!demo && (
          <>
            <label className="flex items-start gap-2 rounded border border-slate-200 p-2.5">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-emerald-600" checked={official} onChange={(e) => setOfficial(e.target.checked)} />
              <span><span className="flex items-center gap-1 font-semibold"><ShieldCheck className="h-4 w-4 text-emerald-600" />{t('kb.up.official')}</span><span className="text-xs text-slate-500">{t('kb.up.officialHint')}</span></span>
            </label>
            <div><label className="label" htmlFor="kb-token">{t('kb.up.token')}</label><input id="kb-token" type="password" className="input" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" /></div>
          </>
        )}
        {error && <ErrorAlert title={t('kb.up.failed')} message={error} />}
      </div>
    </Modal>
  );
}
