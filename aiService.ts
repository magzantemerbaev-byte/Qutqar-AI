/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  QUTQAR AI — AI SERVICE LAYER (фронтенд)
 *
 *  DEMO MODE включен  → ответы моделируются В БРАУЗЕРЕ общими движками shared/engine
 *                       (meta.mode = "demo"), сеть не используется.
 *  DEMO MODE выключен → запросы идут на backend:  браузер → /api/ai/* → AI-модель.
 *                       Если backend недоступен — показывается ОШИБКА. Подмены
 *                       реального ответа демонстрационным не происходит.
 *
 *  Ключей AI-провайдеров во фронтенде нет и быть не должно (см. server/.env).
 * ═══════════════════════════════════════════════════════════════════════════
 */
import type {
  AfterActionReport, AiEnvelope, AiMeta, AssistantResponse, DeploymentPlan, DetailedAnalysis, HealthInfo, ImageAnalysisResult, ImageStats, OperationalBriefing, WeatherObs,
  KbAnswer, KbDocumentInfo, MapObject, PastIncident, ReportDoc, ReportForm, SimRequest, SimResponse, SituationAnalysis,
} from '../types';
import { analyzeReportText, pastIncidentToText } from '../../shared/engine/aar';
import { assistantRagQuery, runAssistant } from '../../shared/engine/assistant';
import { detailedEngine, reportEngine, situationEngine } from '../../shared/engine/ops';
import { RAG_THRESHOLD, answerFromIndex, buildDemoIndex, hashEmbed, indexTextDocument } from '../../shared/engine/rag';
import { applyDecision, debrief, finishScenario, startScenario, tickState } from '../../shared/engine/simulator';
import { visionFromStats } from '../../shared/engine/vision';
import { briefingEngine } from '../../shared/engine/briefing';
import { L, tx, type Lang } from '../../shared/i18n';

export const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');

let demoMode = true;
let mockDelay = 900;
let lang: Lang = 'ru';
export function setDemoMode(v: boolean) { demoMode = v; }
export function setLang(v: Lang) { lang = v; }
export function isDemoMode() { return demoMode; }
export function setMockDelay(ms: number) { mockDelay = ms; }
const wait = (ms = mockDelay) => new Promise<void>((r) => setTimeout(r, ms));

export class ApiError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

/* ───────────── транспорт ───────────── */

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, credentials: 'same-origin', headers: { ...(init.headers as Record<string, string> | undefined), 'x-lang': lang } });
  } catch {
    throw new ApiError(tx(lang, L('Backend недоступен. Запустите сервер (npm run server:dev) или включите DEMO MODE.', 'Backend қолжетімсіз. Серверді іске қосыңыз (npm run server:dev) немесе DEMO MODE қосыңыз.', 'Backend unavailable. Start the server (npm run server:dev) or enable DEMO MODE.')));
  }
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { /* не JSON */ }
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
    throw new ApiError(msg, res.status);
  }
  if (body === null) throw new ApiError(tx(lang, L('Backend вернул пустой или некорректный ответ', 'Backend бос немесе қате жауап қайтарды', 'The backend returned an empty or invalid response')));
  return body as T;
}
const postJson = <T,>(path: string, data: unknown) =>
  request<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(data as object), lang }) });

async function demo<T>(fn: () => T, label: string, delay = mockDelay): Promise<AiEnvelope<T>> {
  const t0 = performance.now();
  await wait(delay);
  const meta: AiMeta = { mode: 'demo', provider: 'browser', model: label, latencyMs: Math.round(performance.now() - t0), warnings: [] };
  return { data: fn(), meta };
}

/* ───────────── демо-база знаний в браузере ───────────── */

export const demoKb = buildDemoIndex();
const demoHits = (q: string, k = 4) => demoKb.search(hashEmbed(q), k).filter((h) => h.score >= RAG_THRESHOLD);

/* ───────────── публичный API ───────────── */

export const ai = {
  situation: (incident: MapObject) =>
    demoMode ? demo(() => situationEngine(incident, lang), 'demo-rules') : postJson<AiEnvelope<SituationAnalysis>>('/api/ai/situation', { incident }),

  detailed: (incident: MapObject) =>
    demoMode ? demo(() => detailedEngine(incident), 'demo-rules') : postJson<AiEnvelope<DetailedAnalysis>>('/api/ai/detailed', { incident }),

  assistant: (message: string) =>
    demoMode
      ? demo(() => runAssistant(message, demoHits(assistantRagQuery(message), 3)), 'demo-rules + demo-RAG')
      : postJson<AiEnvelope<AssistantResponse>>('/api/ai/assistant', { message }),

  vision: (file: File, stats: ImageStats) => {
    if (demoMode) return demo(() => visionFromStats(stats, tx(lang, L('DEMO: цветовая эвристика + симуляция (без нейросети)', 'DEMO: түс эвристикасы + модельдеу (нейрожеліcіз)', 'DEMO: colour heuristic + simulation (no neural network)')), lang), 'demo-vision', mockDelay + 700);
    const fd = new FormData();
    fd.append('image', file);
    fd.append('stats', JSON.stringify(stats));
    fd.append('lang', lang);
    return request<AiEnvelope<ImageAnalysisResult>>('/api/ai/vision', { method: 'POST', body: fd });
  },

  kbSearch: (query: string) =>
    demoMode ? demo(() => answerFromIndex(demoKb, query), 'demo-RAG (hash-эмбеддинги)') : postJson<AiEnvelope<KbAnswer>>('/api/ai/kb-search', { query }),

  incidentText: (title: string, text: string) =>
    demoMode ? demo(() => analyzeReportText({ title, text, source: 'Текст / файл (обработан в браузере)' }), 'demo-aar-rules')
      : postJson<AiEnvelope<AfterActionReport>>('/api/ai/incident', { title, text }),

  incidentFile: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', file.name);
    return request<AiEnvelope<AfterActionReport>>('/api/ai/incident', { method: 'POST', body: fd });
  },

  incidentArchive: (inc: PastIncident) =>
    demoMode ? demo(() => analyzeReportText({ title: inc.title, text: pastIncidentToText(inc), source: 'Архив происшествий (демо)' }), 'demo-aar-rules')
      : postJson<AiEnvelope<AfterActionReport>>('/api/ai/incident', { incident: inc }),

  report: (form: ReportForm) =>
    demoMode ? demo(() => reportEngine(form), 'demo-template') : postJson<AiEnvelope<ReportDoc>>('/api/ai/report', { form }),

  /** AI-брифинг: факты — из структурированных данных; в LIVE модель добавляет только связный текст. */
  briefing: (incident: MapObject, weather: WeatherObs | null, plan: DeploymentPlan | null) =>
    demoMode ? demo(() => briefingEngine({ incident, weather, plan, lang }), 'demo-rules (structured)')
      : postJson<AiEnvelope<OperationalBriefing>>('/api/ai/briefing', { incident, weather, plan }),

  /** Симулятор: правила всегда детерминированы; в live-режиме backend добавляет AI-нарратив. */
  simulate: (req: SimRequest): Promise<AiEnvelope<SimResponse>> => {
    if (!demoMode && req.action !== 'tick') return postJson<AiEnvelope<SimResponse>>('/api/ai/simulate', req);
    const run = (): SimResponse => {
      if (req.action === 'start') return { state: startScenario(req.type!, req.seed, { trainee: req.trainee, difficulty: req.difficulty, lang }) };
      if (req.action === 'tick') return { state: tickState(req.state!, req.minutes ?? 1) };
      if (req.action === 'finish') { const st = finishScenario(req.state!); return { state: st, debrief: debrief(st) }; }
      const r = applyDecision(req.state!, req.input ?? '', req.realSeconds ?? 0, req.actionIds);
      return { state: r.state, decision: r.decision };
    };
    return demo(() => {
      const out = run();
      if (out.state.status !== 'active' && !out.debrief) out.debrief = debrief(out.state);
      return out;
    }, 'rules-engine (браузер)', req.action === 'tick' ? 0 : 250);
  },
};

export async function fetchHealth(): Promise<HealthInfo> {
  return request<HealthInfo>('/api/health', { method: 'GET' });
}

export interface KbListResponse { documents: KbDocumentInfo[]; pipeline: { embedding: string; threshold: number; chunks: number; official: number }; warnings: string[] }

export const kbApi = {
  async list(): Promise<KbListResponse> {
    if (demoMode) {
      return { documents: demoKb.listDocs(), pipeline: { embedding: 'hash-bow-512 (браузер, демо)', threshold: RAG_THRESHOLD, chunks: demoKb.chunks.length, official: 0 }, warnings: [] };
    }
    return request<KbListResponse>('/api/kb/documents', { method: 'GET' });
  },
  async upload(file: File, meta: { title: string; category: string; source: string; official: boolean; adminToken?: string }): Promise<KbDocumentInfo> {
    if (demoMode) {
      if (!/\.(txt|md)$/i.test(file.name)) throw new ApiError('В DEMO MODE в браузере индексируются только .txt и .md. PDF/DOCX — через backend (выключите DEMO MODE).');
      const text = await file.text();
      const pages = text.split('\f').map((p) => p.trim()).filter(Boolean);
      // В DEMO MODE загруженный документ не может считаться официальным
      return indexTextDocument(demoKb, { id: `local-${Date.now().toString(36)}`, title: meta.title || file.name, category: meta.category || 'Загружено', source: `${meta.source || 'Пользователь'} (DEMO)`, official: false, origin: 'upload' }, pages.length ? pages : [text]);
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('title', meta.title);
    fd.append('category', meta.category);
    fd.append('source', meta.source);
    fd.append('official', String(meta.official));
    const r = await request<{ document: KbDocumentInfo }>('/api/kb/documents', { method: 'POST', body: fd, headers: meta.adminToken ? { 'x-admin-token': meta.adminToken } : {} });
    return r.document;
  },
  async remove(id: string, adminToken?: string): Promise<void> {
    if (demoMode) { demoKb.remove(id); return; }
    await request('/api/kb/documents/' + encodeURIComponent(id), { method: 'DELETE', headers: adminToken ? { 'x-admin-token': adminToken } : {} });
  },
};
