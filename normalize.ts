/**
 * Нормализация ответов модели: приведение к контрактам shared/contracts.ts.
 * Модель может ошибаться в формате — backend никогда не пропускает непроверенную структуру.
 */
import type {
  AssistantResponse, Citation, Detection, DetailedAnalysis, HazardCategory, ImageAnalysisResult,
  ResourceKind, SituationAnalysis, Statement, StatementKind, ThreatLevel,
} from '../../../shared/contracts.js';
import { HAZARD_ORDER } from '../../../shared/engine/vision.js';

type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
export const s = (v: unknown, d = '', max = 1200) => (typeof v === 'string' ? v.trim().slice(0, max) : d);
export const n = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const LEVELS: ThreatLevel[] = ['low', 'medium', 'high', 'critical'];
export const level = (v: unknown, d: ThreatLevel = 'medium'): ThreatLevel => (LEVELS.includes(v as ThreatLevel) ? (v as ThreatLevel) : d);
const KINDS: StatementKind[] = ['fact', 'assumption', 'recommendation'];
const kind = (v: unknown, d: StatementKind): StatementKind => (KINDS.includes(v as StatementKind) ? (v as StatementKind) : d);
const RES_KINDS: ResourceKind[] = ['truck', 'breathing', 'drone', 'medical', 'personnel', 'special'];

export function statements(v: unknown, d: StatementKind, limit = 10): Statement[] {
  return arr(v).slice(0, limit).map((x) => (isObj(x) ? { kind: kind(x.kind, d), text: s(x.text, '', 400) } : { kind: d, text: s(x, '', 400) }))
    .filter((x) => x.text);
}
export const strings = (v: unknown, limit = 10, max = 400) => arr(v).map((x) => s(x, '', max)).filter(Boolean).slice(0, limit);

export function normalizeSituation(raw: unknown, incidentId: string, fb: SituationAnalysis): SituationAnalysis {
  if (!isObj(raw)) return fb;
  return {
    incidentId,
    summary: s(raw.summary, fb.summary),
    threatLevel: level(raw.threatLevel, fb.threatLevel),
    direction: s(raw.direction, fb.direction, 200),
    forces: s(raw.forces, fb.forces, 300),
    monitoring: typeof raw.monitoring === 'boolean' ? raw.monitoring : fb.monitoring,
    factors: strings(raw.factors, 8).length ? strings(raw.factors, 8) : fb.factors,
  };
}

export function normalizeDetailed(raw: unknown, fb: DetailedAnalysis): DetailedAnalysis {
  if (!isObj(raw)) return fb;
  const forecast = arr(raw.forecast).filter(isObj).map((x) => ({ horizon: s(x.horizon, '', 40), text: s(x.text, '', 400) })).filter((x) => x.horizon && x.text).slice(0, 6);
  return {
    title: s(raw.title, fb.title, 200),
    forecast: forecast.length ? forecast : fb.forecast,
    risks: strings(raw.risks, 8).length ? strings(raw.risks, 8) : fb.risks,
    recommendations: strings(raw.recommendations, 10).length ? strings(raw.recommendations, 10) : fb.recommendations,
  };
}

/**
 * Ответ помощника. Раздел «Нормативные документы» НЕ берется у модели:
 * модель может только выбрать ID из переданных ей фрагментов; неизвестные ID отбрасываются.
 */
export function normalizeAssistant(raw: unknown, fb: AssistantResponse, allowed: Citation[], warnings: string[]): AssistantResponse {
  if (!isObj(raw)) { warnings.push('Модель вернула ответ не по схеме — показан ответ правил.'); return fb; }
  const cls = isObj(raw.classification) ? raw.classification : {};
  const threat = isObj(raw.threat) ? raw.threat : {};
  const ids = strings(raw.regulationChunkIds, 5, 100);
  const cited = ids.map((id) => allowed.find((c) => c.chunkId === id)).filter((c): c is Citation => Boolean(c));
  const invented = ids.filter((id) => !allowed.some((c) => c.chunkId === id));
  if (invented.length) warnings.push(`Отброшены ссылки модели на несуществующие фрагменты: ${invented.length}.`);
  const citations = cited.length ? cited : allowed.slice(0, 3);
  const officialConnected = citations.some((c) => c.official);
  const resources = arr(raw.resources).filter(isObj).slice(0, 8).map((r) => ({
    kind: (RES_KINDS.includes(r.kind as ResourceKind) ? r.kind : 'special') as ResourceKind,
    title: s(r.title, 'Ресурс', 80), value: s(r.value, '—', 60), note: s(r.note, '', 160), basis: kind(r.basis, 'recommendation'),
  }));
  const actions = arr(raw.actions).filter(isObj).slice(0, 12).map((a, i) => ({
    step: i + 1, text: s(a.text, '', 300),
    priority: (['immediate', 'high', 'normal'].includes(a.priority as string) ? a.priority : 'normal') as 'immediate' | 'high' | 'normal',
  })).filter((a) => a.text);
  const missing = arr(raw.missingInfo).filter(isObj).slice(0, 8).map((m) => ({ question: s(m.question, '', 200), why: s(m.why, '', 200) })).filter((m) => m.question);
  return {
    scenario: s(raw.scenario, fb.scenario, 40),
    classification: { category: s(cls.category, fb.classification.category, 80), subtype: s(cls.subtype, fb.classification.subtype, 120), confidence: Math.max(0, Math.min(1, n(cls.confidence, 0.6))) },
    threat: { level: level(threat.level, fb.threat.level), rationale: statements(threat.rationale, 'assumption', 6) },
    hazards: statements(raw.hazards, 'assumption'),
    victims: statements(raw.victims, 'assumption', 6),
    resources: resources.length ? resources : fb.resources,
    actions: actions.length ? actions : fb.actions,
    safety: statements(raw.safety, 'recommendation', 8),
    missingInfo: missing.length ? missing : fb.missingInfo,
    facts: strings(raw.facts, 12).length ? strings(raw.facts, 12) : fb.facts,
    regulations: {
      officialConnected,
      citations,
      message: officialConnected ? 'Фрагменты загруженных официальных документов. Сверяйте с первоисточником.' : fb.regulations.message,
    },
  };
}

export function normalizeDetections(raw: unknown): { detections: Detection[]; summary: string; recommendations: string[]; overall: ThreatLevel } {
  const o = isObj(raw) ? raw : {};
  // Неизвестные классы отбрасываются (не подменяются ближайшим), рамки обрезаются до 0..100
  const detections: Detection[] = arr(o.detections).filter(isObj)
    .filter((d) => HAZARD_ORDER.includes(d.category as HazardCategory)).slice(0, 30).map((d, i) => {
    const b = isObj(d.box) ? d.box : {};
    const clampP = (v: unknown) => Math.max(0, Math.min(100, n(v, 0)));
    const cat = d.category as HazardCategory;
    return {
      id: `m-${i}`, category: cat, label: s(d.label, cat, 80), confidence: clampP(d.confidence),
      box: { x: clampP(b.x), y: clampP(b.y), w: Math.max(2, clampP(b.w)), h: Math.max(2, clampP(b.h)) },
      severity: level(d.severity, 'medium'), note: s(d.note, '', 200), basis: 'model' as const,
    };
  });
  return { detections, summary: s(o.summary, ''), recommendations: strings(o.recommendations, 6), overall: level(o.overall, 'medium') };
}

export function buildVisionResult(model: string, image: ImageAnalysisResult['image'], p: ReturnType<typeof normalizeDetections>): ImageAnalysisResult {
  return {
    model, processedAt: new Date().toISOString(), image, detections: p.detections,
    categories: HAZARD_ORDER.map((c) => {
      const best = p.detections.filter((d) => d.category === c).sort((a, b) => b.confidence - a.confidence)[0];
      return { category: c, basis: 'model' as const, confidence: best?.confidence ?? 0, status: best ? (best.confidence >= 60 ? 'detected' as const : 'possible' as const) : 'not_detected' as const };
    }),
    overall: p.overall,
    summary: p.summary || 'Анализ выполнен моделью компьютерного зрения.',
    recommendations: p.recommendations,
    limitations: ['Результат модели требует подтверждения разведкой на месте.', 'Модель может ошибаться при плохой освещенности, дыме, низком разрешении.'],
  };
}
