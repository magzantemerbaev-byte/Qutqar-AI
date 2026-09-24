import { Camera, Eye, EyeOff, ImageUp, RotateCcw, ScanSearch, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { ErrorAlert, MetaWarnings, ModeBadge, PageHeader, PipelineSteps, SafetyNotice, ThreatBadge } from '../components/ui';
import { useApp } from '../context';
import { fmtDateTime } from '../i18n';
import { computeImageStats } from '../lib/imageStats';
import { ai } from '../services/aiService';
import { HAZARD_META, HAZARD_ORDER } from '../../shared/engine/vision';
import { tx } from '../../shared/i18n';
import type { AiMeta, Detection, ImageAnalysisResult } from '../types';

const MAX_MB = 10;
type Kind = 'detected' | 'possible' | 'simulated';
const kindOf = (d: Detection): Kind => (d.basis === 'simulated' ? 'simulated' : d.status === 'detected' || d.confidence >= 70 ? 'detected' : 'possible');
const KIND_CLS: Record<Kind, string> = { detected: 'bg-red-600 text-white', possible: 'bg-amber-400 text-navy-950', simulated: 'bg-slate-200 text-slate-700 ring-1 ring-inset ring-slate-400' };
const KIND_KEY = { detected: 'ph.detected', possible: 'ph.possible', simulated: 'ph.simulated' } as const;

export default function PhotoAnalysis() {
  const { t, lang, settings } = useApp();
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [result, setResult] = useState<ImageAnalysisResult | null>(null);
  const [meta, setMeta] = useState<AiMeta | null>(null);
  const [step, setStep] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [overlay, setOverlay] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  // Освобождаем object URL, чтобы не держать изображение в памяти
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  const steps = settings.demoMode ? [t('ph.step1'), t('ph.step2demo'), t('ph.step3demo'), t('ph.step4')] : [t('ph.step1'), t('ph.step2live'), t('ph.step3live'), t('ph.step4')];

  const pick = (f: File | undefined) => {
    setError(null); setResult(null); setMeta(null); setStep(-1);
    if (!f) return;
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { setError(t('ph.badType')); return; }
    if (f.size > MAX_MB * 1024 * 1024) { setError(t('ph.tooBig', { mb: MAX_MB })); return; }
    setFile(f); setUrl(URL.createObjectURL(f)); setStep(0);
  };
  const run = async () => {
    if (!file) return;
    setError(null); setResult(null);
    try {
      setStep(1);
      const stats = await computeImageStats(file);
      setStep(2);
      const r = await ai.vision(file, stats);
      setStep(3); setResult(r.data); setMeta(r.meta); setStep(4);
    } catch (e) { setError((e as Error).message); setStep(0); }
  };
  const onDrop = (e: DragEvent) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); };
  const reset = () => { setFile(null); setUrl(null); setResult(null); setMeta(null); setStep(-1); setError(null); };
  const running = step >= 1 && step < 4;
  const dets = result ? [...result.detections].sort((a, b) => b.confidence - a.confidence) : [];

  return (
    <>
      <PageHeader icon={<Camera className="h-5 w-5" />} title={t('ph.title')} subtitle={t('ph.subtitle')}
        actions={file && <button className="btn-ghost" onClick={reset}><RotateCcw className="h-4 w-4" />{t('ph.other')}</button>} />
      <div className="card mb-4 p-3"><PipelineSteps steps={steps} active={Math.max(0, step)} done={step >= 4} /></div>

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="card overflow-hidden xl:col-span-3">
          {!url ? (
            <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={onDrop}
              className={`m-4 flex min-h-[340px] flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${drag ? 'border-signal-red bg-red-50' : 'border-slate-300'}`}>
              <ImageUp className="h-12 w-12 text-slate-400" />
              <p className="font-semibold text-slate-800">{t('ph.drop')}</p>
              <p className="text-sm text-slate-500">{t('ph.formats', { mb: MAX_MB, where: settings.demoMode ? t('ph.whereDemo') : t('ph.whereLive') })}</p>
              <button className="btn-navy" onClick={() => inputRef.current?.click()}><ImageUp className="h-4 w-4" />{t('ph.choose')}</button>
            </div>
          ) : (
            <div className="p-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="eyebrow">{t('ph.original')}</span>
                {result && (
                  <button className="btn-ghost !py-1 text-xs" onClick={() => setOverlay((v) => !v)} aria-pressed={overlay}>
                    {overlay ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}{t('ph.overlay')}
                  </button>
                )}
              </div>
              <div className="relative mx-auto w-fit max-w-full overflow-hidden rounded-md bg-slate-900">
                <img src={url} alt={t('ph.original')} className="block max-h-[540px] max-w-full" decoding="async" />
                {running && <div className="absolute inset-0 animate-pulse-soft bg-navy-900/30" aria-hidden />}
                {overlay && dets.map((d) => {
                  const m = HAZARD_META[d.category];
                  const k = kindOf(d);
                  return (
                    <div key={d.id} onMouseEnter={() => setHover(d.id)} onMouseLeave={() => setHover(null)}
                      className={`absolute border-2 transition-opacity ${k === 'simulated' ? 'border-dashed' : ''} ${hover && hover !== d.id ? 'opacity-25' : ''}`}
                      style={{ left: `${d.box.x}%`, top: `${d.box.y}%`, width: `${d.box.w}%`, height: `${d.box.h}%`, borderColor: m.color, background: k === 'simulated' ? 'transparent' : `${m.color}22` }}>
                      <span className={`absolute left-0 whitespace-nowrap rounded px-1 text-[10px] font-bold text-white ${k === 'simulated' ? '-bottom-5' : '-top-5'}`} style={{ background: m.color }}>
                        {m.emoji} {d.label} {d.confidence}% · {t(KIND_KEY[k])}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button className="btn-primary" onClick={() => void run()} disabled={running}><ScanSearch className="h-4 w-4" />{running ? t('common.analyzing') : result ? t('ph.reanalyze') : t('ph.analyze')}</button>
                <span className="text-xs text-slate-500">{file?.name} · {Math.round((file?.size ?? 0) / 1024)} KB</span>
              </div>
              {result && <p className="mt-2 text-xs text-slate-500">{t('ph.legend')}</p>}
            </div>
          )}
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          {error && <div className="px-4 pb-4"><ErrorAlert message={error} /></div>}
        </div>

        <div className="space-y-4 xl:col-span-2">
          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-navy-800 px-4 py-2.5 text-white"><h2 className="font-cond text-lg font-semibold">{t('ph.result')}</h2><ModeBadge meta={meta} /></div>
            <div className="space-y-3 p-4">
              {!result ? <p className="text-sm text-slate-500">{running ? t('ph.processing') : t('ph.wait')}</p> : (
                <>
                  <div className="flex items-center justify-between"><span className="text-sm text-slate-600">{t('ph.overall')}</span><ThreatBadge level={result.overall} /></div>
                  <p className="text-sm text-slate-800">{result.summary}</p>
                  <MetaWarnings meta={meta} />
                  <div>
                    <div className="eyebrow mb-1.5">{t('ph.detections')}</div>
                    {!dets.length && <p className="text-sm text-slate-500">{t('ph.noDetections')}</p>}
                    <ul className="space-y-2">
                      {dets.map((d) => {
                        const m = HAZARD_META[d.category];
                        const k = kindOf(d);
                        const u = d.uncertainty;
                        return (
                          <li key={d.id} onMouseEnter={() => setHover(d.id)} onMouseLeave={() => setHover(null)} className="rounded-md border border-slate-200 p-2.5" style={{ borderLeft: `4px solid ${m.color}` }}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900">{m.emoji} {d.label} — {d.confidence}%</span>
                              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${KIND_CLS[k]}`}>{t(KIND_KEY[k])}</span>
                            </div>
                            <div className="mt-1 h-1.5 overflow-hidden rounded bg-slate-100"><div className="h-full" style={{ width: `${d.confidence}%`, background: m.color, opacity: k === 'simulated' ? 0.4 : 1 }} /></div>
                            <p className="mt-1.5 text-xs text-slate-700"><strong>{t('ph.why')}:</strong> {d.why ?? tx(lang, m.why)}</p>
                            <p className="mt-0.5 text-xs text-slate-500"><strong>{t('ph.uncertainty')}:</strong> {u == null ? t('ph.unc.none') : t('ph.unc.value', { u, a: Math.max(0, d.confidence - u), b: Math.min(100, d.confidence + u) })} · {t(`ph.basis.${d.basis}`)}</p>
                            <p className="mt-0.5 text-[11px] text-slate-400">{d.note}</p>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  <details className="rounded-md border border-slate-200">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-800">{t('ph.categories')}</summary>
                    <ul className="divide-y divide-slate-100">
                      {HAZARD_ORDER.map((c) => {
                        const a = result.categories.find((x) => x.category === c);
                        if (!a) return null;
                        const txt = a.basis === 'simulated' ? t('ph.simulated') : a.status === 'detected' ? t('ph.detected') : a.status === 'possible' ? t('ph.possible') : a.status === 'not_detected' ? t('ph.notDetected') : t('ph.unknown');
                        return <li key={c} className="flex items-center gap-2 px-3 py-1.5 text-sm"><span aria-hidden>{HAZARD_META[c].emoji}</span><span className="flex-1">{tx(lang, HAZARD_META[c].label)}</span><span className="text-xs font-semibold text-slate-600">{txt}</span></li>;
                      })}
                    </ul>
                  </details>
                  <div><h3 className="mb-1 text-sm font-semibold text-slate-900">{t('ph.recs')}</h3><ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">{result.recommendations.map((r) => <li key={r}>{r}</li>)}</ul></div>
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
                    <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-900"><TriangleAlert className="h-4 w-4" />{t('ph.limits')}</h3>
                    <ul className="list-disc space-y-0.5 pl-5 text-xs text-amber-900">{result.limitations.map((r) => <li key={r}>{r}</li>)}</ul>
                  </div>
                  <p className="text-[11px] text-slate-400">{t('ph.meta', { m: result.model, d: fmtDateTime(result.processedAt), w: result.image.width, h: result.image.height })}</p>
                </>
              )}
            </div>
          </section>
          <SafetyNotice />
        </div>
      </div>
    </>
  );
}
