import {
  Bot, BookOpen, Check, ClipboardCopy, CircleHelp, HeartPulse, ListChecks, Radar, RotateCcw, Send, ShieldAlert, Siren, Truck, User, Users, Wind, Wrench,
} from 'lucide-react';
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { AiDisclaimer, ContentLangNote, ErrorAlert, MetaWarnings, ModeBadge, PageHeader, SafetyNotice, Skeleton, StatementTag, ThreatBadge, statementLabel } from '../components/ui';
import { useApp } from '../context';
import type { TKey } from '../i18n';
import { ai } from '../services/aiService';
import { fmtTime } from '../i18n';
import type { AiMeta, AssistantResponse, ResourceKind, Statement } from '../types';

interface Msg { id: number; role: 'user' | 'ai'; text?: string; response?: AssistantResponse; meta?: AiMeta; error?: string; time: string }

const EXAMPLES: TKey[] = ['as.ex1', 'as.ex2', 'as.ex3', 'as.ex4', 'as.ex5'];

const RES_ICONS: Record<ResourceKind, ComponentType<{ className?: string }>> = {
  truck: Truck, breathing: Wind, drone: Radar, medical: HeartPulse, personnel: Users, special: Wrench,
};
const PRIORITY = { immediate: { key: 'as.prio.immediate', cls: 'bg-red-600 text-white' }, high: { key: 'as.prio.high', cls: 'bg-amber-500 text-navy-950' }, normal: { key: 'as.prio.normal', cls: 'bg-slate-200 text-slate-700' } } as const;

const now = () => fmtTime(new Date());
type T = (k: TKey, p?: Record<string, string | number>) => string;
function toPlainText(r: AssistantResponse, t: T): string {
  const tag = (x: Statement) => `[${t(statementLabel(x.kind))}] ${x.text}`;
  return [
    `1. ${t('as.s1').toUpperCase()}: ${r.classification.category} — ${r.classification.subtype}`,
    `2. ${t('as.s2').toUpperCase()}: ${t(`threat.${r.threat.level}`)}\n${r.threat.rationale.map(tag).join('\n')}`,
    `3. ${t('as.s3').toUpperCase()}\n${r.hazards.map(tag).join('\n')}`,
    `4. ${t('as.s4').toUpperCase()}\n${r.victims.map(tag).join('\n')}`,
    `5. ${t('as.s5').toUpperCase()}\n${r.resources.map((x) => `— ${x.title}: ${x.value} (${x.note})`).join('\n')}`,
    `6. ${t('as.s6').toUpperCase()} [${t('stmt.recommendation')}]\n${r.actions.map((a) => `${a.step}. ${a.text}`).join('\n')}`,
    `7. ${t('as.s7').toUpperCase()}\n${r.safety.map(tag).join('\n')}`,
    `8. ${t('as.s8').toUpperCase()}\n${r.missingInfo.map((m) => `— ${m.question} (${m.why})`).join('\n')}`,
    `9. ${t('as.s9').toUpperCase()}\n${r.regulations.message}\n${r.regulations.citations.map((c) => `— ${c.document}, ${c.section}${c.clause ? `, ${c.clause}` : ''}`).join('\n')}`,
    t('safety.notice'),
  ].join('\n\n');
}

export default function Assistant() {
  const { t } = useApp();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.role === 'ai' && !loading) document.getElementById(`msg-${last.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, loading]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || loading) return;
    setMessages((m) => [...m, { id: ++idRef.current, role: 'user', text: q, time: now() }]);
    setInput('');
    setLoading(true);
    try {
      const r = await ai.assistant(q);
      setMessages((m) => [...m, { id: ++idRef.current, role: 'ai', response: r.data, meta: r.meta, time: now() }]);
    } catch (e) {
      setMessages((m) => [...m, { id: ++idRef.current, role: 'ai', error: (e as Error).message, time: now() }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <PageHeader icon={<Bot className="h-5 w-5" />} title={t('as.title')} subtitle={t('as.subtitle')}
        actions={messages.length > 0 && <button className="btn-ghost" onClick={() => setMessages([])}><RotateCcw className="h-4 w-4" />{t('as.new')}</button>} />

      <div className="card flex h-[calc(100vh-15rem)] min-h-[520px] flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3">
          <div className="min-w-0 flex-1"><AiDisclaimer compact /></div>
          <div className="flex flex-wrap gap-1.5 text-[11px]">{(['fact', 'assumption', 'recommendation'] as const).map((k) => <StatementTag key={k} kind={k} />)}</div>
        </div>

        <div className="scroll-thin flex-1 space-y-4 overflow-y-auto bg-slate-50 p-3 sm:p-5">
          {messages.length === 0 && (
            <div className="mx-auto max-w-2xl py-6 text-center">
              <Bot className="mx-auto h-10 w-10 text-navy-500" />
              <p className="mt-2 font-semibold text-slate-800">{t('as.emptyTitle')}</p>
              <p className="text-sm text-slate-500">{t('as.emptyText')}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {EXAMPLES.map((k) => t(k)).map((e) => <button key={e} onClick={() => void send(e)} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-left text-xs text-slate-700 hover:border-navy-500">{e}</button>)}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} id={`msg-${m.id}`} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${m.role === 'user' ? 'bg-navy-700 text-white' : 'bg-signal-red text-white'}`}>
                {m.role === 'user' ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div className={`min-w-0 ${m.role === 'user' ? 'max-w-[85%] rounded-lg bg-navy-800 px-3.5 py-2.5 text-sm text-white' : 'w-full max-w-5xl'}`}>
                {m.text && <p>{m.text}</p>}
                {m.error && <ErrorAlert message={m.error} />}
                {m.response && <ResponseView r={m.response} meta={m.meta} />}
                <div className={`mt-1 text-[11px] ${m.role === 'user' ? 'text-slate-300' : 'text-slate-400'}`}>{m.time}</div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-signal-red text-white"><Bot className="h-4 w-4" /></div>
              <div className="card w-full max-w-3xl space-y-3 p-4"><div className="text-xs font-semibold text-slate-500">{t('as.thinking')}</div><Skeleton lines={4} /></div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form className="flex gap-2 border-t border-slate-200 p-3" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
          <textarea className="input min-h-[44px] flex-1 resize-y" rows={2} value={input} onChange={(e) => setInput(e.target.value)} maxLength={4000}
            placeholder={t('as.placeholder')} aria-label={t('as.placeholder')}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(input); } }} />
          <button type="submit" className="btn-primary self-end" disabled={loading || !input.trim()} aria-label={t('as.send')}><Send className="h-4 w-4" /><span className="hidden sm:inline">{t('as.send')}</span></button>
        </form>
      </div>
    </>
  );
}

function Section({ n, icon, title, children, className = '' }: { n: number; icon: ReactNode; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-md border border-slate-200 bg-white p-3 ${className}`}>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-navy-800 text-[11px] font-bold text-white">{n}</span>{icon}{title}
      </h3>
      {children}
    </section>
  );
}
function Statements({ items }: { items: Statement[] }) {
  if (!items.length) return <p className="text-sm text-slate-500">—</p>;
  return <ul className="space-y-1.5">{items.map((s, i) => <li key={i} className="flex items-start gap-2 text-sm text-slate-800"><StatementTag kind={s.kind} /><span>{s.text}</span></li>)}</ul>;
}

function ResponseView({ r, meta }: { r: AssistantResponse; meta?: AiMeta }) {
  const { t } = useApp();
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(toPlainText(r, t)); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* ignore */ } };
  const critical = r.threat.level === 'critical';
  return (
    <div className={`card overflow-hidden ${critical ? 'alert-border' : ''}`}>
      <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 ${critical ? 'bg-signal-red text-white' : 'bg-navy-800 text-white'}`}>
        <div className="flex items-center gap-2 font-cond text-base font-semibold"><Siren className="h-4 w-4" />{t('as.assessment')}</div>
        <div className="flex flex-wrap items-center gap-2">
          <ModeBadge meta={meta} />
          <button onClick={() => void copy()} className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20">{copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}{copied ? t('common.copied') : t('common.copy')}</button>
        </div>
      </div>
      <div className="space-y-3 p-3 sm:p-4">
        <MetaWarnings meta={meta} />
        <ContentLangNote />
        <div className="rounded-md border border-sky-200 bg-sky-50 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-sky-900"><StatementTag kind="fact" />{t('as.facts')}</div>
          <ul className="flex flex-wrap gap-1.5">{r.facts.map((f) => <li key={f} className="rounded bg-white px-2 py-0.5 text-xs text-slate-800 ring-1 ring-sky-200">{f}</li>)}</ul>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Section n={1} icon={<ListChecks className="h-4 w-4 text-navy-600" />} title={t('as.s1')}>
            <p className="text-sm font-semibold text-slate-900">{r.classification.category}: {r.classification.subtype}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">{t('as.confidence', { p: Math.round(r.classification.confidence * 100) })} <StatementTag kind="assumption" /></p>
          </Section>
          <Section n={2} icon={<ShieldAlert className="h-4 w-4 text-signal-red" />} title={t('as.s2')}>
            <ThreatBadge level={r.threat.level} />
            <div className="mt-2"><Statements items={r.threat.rationale} /></div>
          </Section>
          <Section n={3} icon={<ShieldAlert className="h-4 w-4 text-orange-600" />} title={t('as.s3')}><Statements items={r.hazards} /></Section>
          <Section n={4} icon={<Users className="h-4 w-4 text-navy-600" />} title={t('as.s4')}><Statements items={r.victims} /></Section>
        </div>
        <Section n={5} icon={<Truck className="h-4 w-4 text-navy-600" />} title={t('as.s5')}>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {r.resources.map((x) => {
              const Icon = RES_ICONS[x.kind] ?? Wrench;
              return (
                <div key={x.title} className="flex gap-2.5 rounded border border-slate-200 p-2.5">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-navy-600" />
                  <div className="min-w-0 text-sm">
                    <div className="flex flex-wrap items-center gap-1.5"><span className="font-semibold text-slate-900">{x.title}</span><StatementTag kind={x.basis} /></div>
                    <div className="font-cond text-lg font-bold text-slate-900">{x.value}</div>
                    <div className="text-xs text-slate-500">{x.note}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
        <Section n={6} icon={<ListChecks className="h-4 w-4 text-emerald-700" />} title={t('as.s6')}>
          <div className="mb-2"><StatementTag kind="recommendation" /></div>
          <ol className="space-y-1.5">
            {r.actions.map((a) => (
              <li key={a.step} className="flex items-start gap-2 text-sm text-slate-800">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy-800 text-[11px] font-bold text-white">{a.step}</span>
                <span className="flex-1">{a.text}</span>
                <span className={`shrink-0 rounded px-1.5 py-px text-[10px] font-bold ${PRIORITY[a.priority].cls}`}>{t(PRIORITY[a.priority].key)}</span>
              </li>
            ))}
          </ol>
        </Section>
        <div className="grid gap-3 lg:grid-cols-2">
          <Section n={7} icon={<ShieldAlert className="h-4 w-4 text-red-700" />} title={t('as.s7')} className="border-red-200 bg-red-50/40"><Statements items={r.safety} /></Section>
          <Section n={8} icon={<CircleHelp className="h-4 w-4 text-violet-700" />} title={t('as.s8')}>
            <ul className="space-y-1.5 text-sm">{r.missingInfo.map((m) => <li key={m.question}><span className="font-medium text-slate-900">{m.question}</span> <span className="text-slate-500">— {m.why}</span></li>)}</ul>
          </Section>
        </div>
        <Section n={9} icon={<BookOpen className="h-4 w-4 text-navy-600" />} title={t('as.s9')}>
          <p className={`rounded px-2.5 py-1.5 text-sm ${r.regulations.officialConnected ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 font-semibold text-amber-900'}`}>{r.regulations.message}</p>
          {r.regulations.citations.length > 0 && (
            <ul className="mt-2 space-y-2">
              {r.regulations.citations.map((c) => (
                <li key={c.chunkId} className="rounded border border-slate-200 p-2.5 text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold text-slate-900">{c.document}</span>
                    <span className={`rounded px-1.5 py-px text-[10px] font-bold ${c.official ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{c.official ? t('as.official') : t('as.demoDoc')}</span>
                    <span className="text-xs text-slate-500">{t('as.proximity', { s: c.score.toFixed(2) })}</span>
                  </div>
                  <div className="text-xs text-slate-500">{t('as.citeMeta', { s: c.source, r: c.section, c: c.clause ?? '—', p: c.page ?? '—' })}</div>
                  <p className="mt-1 text-slate-700">«{c.excerpt}»</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <SafetyNotice />
      </div>
    </div>
  );
}
