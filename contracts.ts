import type { Lang } from './i18n.js';
export type { Lang, L3 } from './i18n.js';
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  QUTQAR AI — SHARED API CONTRACTS
 *  Единые типы для фронтенда (src/) и backend (server/).
 *  Любой ответ backend /api/ai/* обязан соответствовать этим типам.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ───────────── Базовые ───────────── */
export type IncidentType = 'fire' | 'flood' | 'accident' | 'hazard';
export type ObjectType = IncidentType | 'unit' | 'hospital' | 'water';
export type ThreatLevel = 'low' | 'medium' | 'high' | 'critical';
export type PageKey =
  | 'dashboard' | 'briefing' | 'resources' | 'assistant' | 'simulator' | 'photo' | 'map' | 'kb' | 'analysis' | 'report' | 'settings' | 'presentation';

export interface MapObject {
  id: string;
  type: ObjectType;
  title: string;
  region: string;
  lat: number;
  lng: number;
  description: string;
  status?: string;
  threat?: ThreatLevel;
  time?: string;
  details?: { label: string; value: string }[];
  /** Для DEMO: id города/региона из shared/geo/kz.ts */
  city?: string;
  regionId?: string;
  people?: { known?: number; atRisk?: number; evacuated?: number; injured?: number };
  tr?: Tr<'title' | 'description' | 'status' | 'region'>;
  detailsTr?: Partial<Record<Lang, { label: string; value: string }[]>>;
}

/* ───────────── Envelope ─────────────
 * demo  — ответ смоделирован в браузере (включен DEMO MODE)
 * mock  — ответ смоделирован backend (модель не подключена: нет AI_API_KEY)
 * live  — ответ сформирован подключенной AI-моделью
 */
export type AiMode = 'demo' | 'mock' | 'live';
export interface AiMeta {
  mode: AiMode;
  provider: string;
  model: string;
  latencyMs: number;
  warnings: string[];
}
export interface AiEnvelope<T> { data: T; meta: AiMeta }

export interface HealthInfo {
  status: 'ok';
  version: string;
  aiMode: 'mock' | 'live';
  provider: string;
  model: string;
  visionModel: string;
  embeddings: string;
  kb: { documents: number; chunks: number; official: number };
  operationalData: boolean;
}

/* ───────────── Dashboard ───────────── */
export interface SituationAnalysis {
  incidentId: string;
  summary: string;
  threatLevel: ThreatLevel;
  direction: string;
  forces: string;
  monitoring: boolean;
  factors: string[];
}
export interface DetailedAnalysis {
  title: string;
  forecast: { horizon: string; text: string }[];
  risks: string[];
  recommendations: string[];
}

export type RiskKind = 'fire' | 'flood' | 'weather' | 'hazmat';
export interface RegionRisk {
  id: string;
  region: string;
  lat: number;
  lng: number;
  risks: Record<RiskKind, number>; // 0..100
  drivers: Partial<Record<RiskKind, string>>;
  driversTr?: Partial<Record<Lang, Partial<Record<RiskKind, string>>>>;
}
export interface RiskAlert {
  id: string;
  kind: RiskKind;
  level: ThreatLevel;
  region: string;
  title: string;
  text: string;
  horizon: string;
  tr?: Tr<'title' | 'text' | 'region' | 'horizon'>;
}
export interface OperationalSnapshot {
  connected: boolean;
  source: string;
  message?: string;
  incidents: MapObject[];
  resources: MapObject[];
  unitsAtWork: { name: string; task: string; status: string }[];
  stats: { active: number; fires: number; rescues: number; units: number };
  risk: { regions: RegionRisk[]; alerts: RiskAlert[]; updatedAt: string } | null;
  /** Силы и средства для Resource Manager (DEMO или оперативный источник) */
  units?: ResourceUnit[];
  /** Метеоданные по id региона */
  weather?: Record<string, WeatherObs>;
}
/** Переводы полей демо-данных: tr.kz.title и т. п. (оперативный источник может их не передавать) */
export type Tr<K extends string> = Partial<Record<Lang, Partial<Record<K, string>>>>;

/* ───────────── Классификация утверждений ─────────────
 * fact           — прямо следует из сообщения пользователя / исходных данных
 * assumption     — вывод или допущение модели, требует проверки
 * recommendation — рекомендуемое действие (справочно)
 */
export type StatementKind = 'fact' | 'assumption' | 'recommendation';
export interface Statement { kind: StatementKind; text: string }

/* ───────────── RAG / Нормативная база ───────────── */
export interface Citation {
  chunkId: string;
  docId: string;
  document: string;   // Документ
  source: string;     // Источник (издатель / происхождение)
  section: string;    // Раздел
  clause?: string;    // Пункт
  page?: number;      // Страница
  score: number;      // 0..1 — косинусная близость
  excerpt: string;    // дословный фрагмент чанка (не сгенерирован моделью)
  official: boolean;  // true только для загруженных официальных документов
}
export interface KbDocumentInfo {
  id: string;
  title: string;
  category: string;
  source: string;
  official: boolean;
  chunks: number;
  pages?: number;
  addedAt: string;
  origin: 'demo' | 'upload';
  contentHash?: string;
}
export interface KbAnswer {
  query: string;
  found: boolean;
  officialConnected: boolean;
  answer: string;
  citations: Citation[];
  notice: string;
  pipeline: { chunksSearched: number; topK: number; embedding: string; threshold: number };
}

/* ───────────── AI-помощник ───────────── */
export type ResourceKind = 'truck' | 'breathing' | 'drone' | 'medical' | 'personnel' | 'special';
export interface AssistantResponse {
  scenario: string;
  classification: { category: string; subtype: string; confidence: number };
  threat: { level: ThreatLevel; rationale: Statement[] };
  hazards: Statement[];
  victims: Statement[];
  resources: { kind: ResourceKind; title: string; value: string; note: string; basis: StatementKind }[];
  actions: { step: number; text: string; priority: 'immediate' | 'high' | 'normal' }[];
  safety: Statement[];
  missingInfo: { question: string; why: string }[];
  regulations: { officialConnected: boolean; message: string; citations: Citation[] };
  facts: string[];
}

/* ───────────── Анализ фото ───────────── */
export type HazardCategory =
  | 'fire' | 'smoke' | 'people' | 'vehicles' | 'structural' | 'electrical' | 'hazmat' | 'blocked_exit';
export type DetectionBasis = 'model' | 'heuristic' | 'simulated';
export interface Detection {
  id: string;
  category: HazardCategory;
  label: string;
  confidence: number; // 0..100
  box: { x: number; y: number; w: number; h: number }; // % от размеров изображения
  severity: ThreatLevel;
  note: string;
  basis: DetectionBasis;
  /** detected — уверенное обнаружение, possible — возможно (для basis 'simulated' UI показывает SIMULATED) */
  status?: 'detected' | 'possible';
  /** Погрешность оценки уверенности, ± п. п.; null — не оценивалась (симуляция) */
  uncertainty?: number | null;
  /** Почему это важно для спасателей */
  why?: string;
}
export interface CategoryAssessment {
  category: HazardCategory;
  status: 'detected' | 'possible' | 'not_detected' | 'unknown';
  confidence: number;
  basis: DetectionBasis;
}
export interface ImageAnalysisResult {
  model: string;
  processedAt: string;
  image: { width: number; height: number; sizeKb: number };
  detections: Detection[];
  categories: CategoryAssessment[];
  overall: ThreatLevel;
  summary: string;
  recommendations: string[];
  limitations: string[];
}
/** Статистика изображения, вычисленная в браузере (цветовая эвристика, без нейросети) */
export interface ImageStats {
  width: number;
  height: number;
  sizeKb: number;
  firePixels: number;   // доля 0..1
  smokePixels: number;  // доля 0..1
  brightness: number;   // 0..1
  fireCentroid: { x: number; y: number; spreadX: number; spreadY: number } | null;
  smokeCentroid: { x: number; y: number; spreadX: number; spreadY: number } | null;
  seed: number;
}

/* ───────────── After-action analysis ───────────── */
export interface AarTimelineItem { time: string; minute: number; text: string; category: string; line: number }
export interface AarFinding { text: string; kind: StatementKind; evidence?: string }
export interface AfterActionReport {
  title: string;
  source: string;
  label: string; // «Аналитическая помощь, не является официальным расследованием»
  summary: string;
  timeline: AarTimelineItem[];
  keyDecisions: AarFinding[];
  delays: AarFinding[];
  risks: AarFinding[];
  resources: { item: string; count: string; evidence: string }[];
  resourceNotes: AarFinding[];
  communication: AarFinding[];
  lessons: AarFinding[];
  metrics: { label: string; value: string }[];
  dataQuality: string[];
}

/* ───────────── Отчет ───────────── */
export interface ReportForm {
  date: string;
  time: string;
  place: string;
  type: string;
  area: string;
  victims: string;
  forces: string;
  result: string;
  author: string;
}
export interface ReportDoc {
  number: string;
  createdAt: string;
  title: string;
  sections: { heading: string; paragraphs: string[] }[];
}

/* ───────────── Прошлые происшествия (архив, демо) ───────────── */
export interface PastIncident {
  id: string;
  title: string;
  type: IncidentType;
  date: string;
  location: string;
  description: string;
  timeline: {
    call: string;
    departure: string;
    arrival: string;
    deployment: string;
    localization: string;
    liquidation: string;
  };
  arrivalNormMin: number;
  responders: number;
  vehicles: number;
  equipment: string[];
  victims: { rescued: number; injured: number; dead: number };
  area: string;
  weather: string;
  facts: string[];
}

/* ───────────── AI Emergency Simulator ───────────── */
export type SimScenarioType = 'building_fire' | 'road_accident' | 'flood' | 'collapse' | 'steppe_fire' | 'hazmat' | 'industrial_fire';
export type SimDifficulty = 'easy' | 'medium' | 'hard' | 'expert';
/** Кнопка действия: подпись на языке обучаемого + распознанные действия движка */
export interface SimCommand { key: string; label: string; actions: string[] }
export interface SimObjective { id: string; label: string }
export type SimVerdict = 'correct' | 'acceptable' | 'mistake' | 'violation' | 'unclear';
export type SimEventKind = 'report' | 'decision' | 'escalation' | 'improvement' | 'violation' | 'radio' | 'info';

export interface SimEvent { id: number; t: number; kind: SimEventKind; text: string }
export interface SimDecision {
  id: number;
  t: number;              // минута модельного времени
  realSeconds: number;    // сколько секунд обучаемый думал
  input: string;
  actions: string[];
  results: { id: string; label: string; verdict: SimVerdict }[];
  verdict: SimVerdict;
  feedback: string;
  tactical: boolean;
}
export interface SimGauge { key: string; label: string; value: number; invert?: boolean } // 0..100; invert: больше = лучше
export interface SimBrief {
  place: string;
  time: string;
  weather: string;
  people: string;
  hazards: string[];
  forces: string[];
}
/** Схема обстановки для тактической карты (координаты 0..100) */
export interface SimScene {
  wind?: { deg: number; label: string };
  zones: { kind: 'fire' | 'smoke' | 'water' | 'cloud' | 'debris' | 'burned'; x: number; y: number; rx: number; ry: number; opacity: number }[];
  lines: { kind: 'road' | 'lep' | 'firebreak' | 'cordon' | 'building' | 'river' | 'dam'; points: [number, number][]; label?: string }[];
  markers: { kind: 'unit' | 'village' | 'victims' | 'hazard' | 'hq' | 'water' | 'drone' | 'medical'; x: number; y: number; label: string; state?: 'ok' | 'warn' | 'danger' }[];
}
export interface SimState {
  id: string;
  lang: Lang;
  difficulty: SimDifficulty;
  objectives: SimObjective[];
  /** true — повествование сценария доступно на всех трех языках */
  localized: boolean;
  trainee?: string;
  brief: SimBrief;
  scene: SimScene;
  seed: number;
  type: SimScenarioType;
  title: string;
  briefing: string;
  situation: string;
  conditions: { label: string; value: string }[];
  clock: number;
  timeLimit: number;
  status: 'active' | 'success' | 'failed' | 'ended';
  statusReason?: string;
  victims: { total: number; known: number; atRisk: number; rescued: number; lost: number; revealed: boolean };
  crewInjured: number;
  gauges: SimGauge[];
  vars: Record<string, number>;
  flags: Record<string, boolean>;
  resources: { name: string; label?: string; total: number; committed: number }[];
  pending: { at: number; id: string }[];
  log: SimEvent[];
  decisions: SimDecision[];
  suggestions: SimCommand[];
  nextEventId: number;
}
export interface SimDebrief {
  outcome: string;
  outcomeLevel: 'success' | 'partial' | 'failed';
  score: number;
  grade: string;
  gradeKey: 'excellent' | 'good' | 'satisfactory' | 'retrain';
  objectives: { id: string; label: string; achieved: boolean; note: string }[];
  totals: { decisions: number; correct: number; acceptable: number; mistakes: number; violations: number; unclear: number };
  timing: { avgSeconds: number; maxSeconds: number; firstDecisionSeconds: number; simMinutes: number };
  decisionTimes: { t: number; seconds: number; verdict: SimVerdict; input: string }[];
  categories: { key: string; label: string; score: number; note: string }[];
  missed: string[];
  correctList: string[];
  resourceUsage: { name: string; total: number; committed: number }[];
  timeline: { t: number; kind: 'decision' | SimEventKind; text: string; verdict?: SimVerdict }[];
  safetyViolations: string[];
  tactical: string[];
  mistakes: string[];
  analysis: string[];
  recommendations: string[];
}

export interface SimRequest {
  action: 'start' | 'step' | 'tick' | 'finish';
  type?: SimScenarioType;
  seed?: number;
  state?: SimState;
  input?: string;
  realSeconds?: number;
  minutes?: number;
  trainee?: string;
  lang?: Lang;
  difficulty?: SimDifficulty;
  /** действия, выбранные кнопкой (минуя разбор текста) */
  actionIds?: string[];
}
export interface SimResponse { state: SimState; decision?: SimDecision; debrief?: SimDebrief }

/** Запись для режима инструктора */
export interface SimSession {
  id: string;
  trainee: string;
  scenario: SimScenarioType;
  scenarioTitle: string;
  seed: number;
  score: number;
  grade: string;
  outcomeLevel: SimDebrief['outcomeLevel'];
  outcome: string;
  categories: SimDebrief['categories'];
  totals: SimDebrief['totals'];
  mistakes: string[];
  safetyViolations: string[];
  decisions: { t: number; input: string; verdict: SimVerdict; seconds: number }[];
  simMinutes: number;
  realSeconds: number;
  completedAt: string;
  demo: boolean;
  difficulty: SimDifficulty;
  gradeKey: SimDebrief['gradeKey'];
  avgDecisionSec: number;
  objectives: SimDebrief['objectives'];
  recommendations: string[];
  lang: Lang;
}

/* ───────────── Resource Manager ───────────── */
export type UnitKind = 'fire_engine' | 'rescue' | 'drone' | 'tanker' | 'ambulance' | 'ladder';
export type UnitStatus = 'available' | 'en_route' | 'on_scene' | 'returning' | 'maintenance';
export interface ResourceUnit {
  id: string;
  callsign: string;
  kind: UnitKind;
  status: UnitStatus;
  department: string;     // id подразделения
  city: string;           // id города (shared/geo/kz.ts)
  lat: number;
  lng: number;
  crew: number;
  assignment?: string;    // id происшествия
  note?: string;
}
export interface DeploymentPlan {
  incidentId: string;
  requirements: { kind: UnitKind; count: number; reason: string }[];
  /** remote — дальний резерв (прибытие позже REMOTE_ETA_MIN), не первый эшелон */
  suggestions: { unitId: string; callsign: string; kind: UnitKind; city: string; distanceKm: number; etaMin: number; crew: number; remote: boolean }[];
  shortages: { kind: UnitKind; missing: number }[];
  totalCrew: number;
  maxEtaMin: number;
  fuelCostKzt: number;
  assumptions: string[];
}

/* ───────────── AI Operational Briefing ───────────── */
/** Источник пункта брифинга: data — структурированные данные; derived — вывод правил; unknown — неизвестно */
export interface BriefItem { text: string; source: 'data' | 'derived' | 'unknown' }
export interface OperationalBriefing {
  incidentId: string;
  title: string;
  generatedAt: string;
  threat: ThreatLevel;
  narrative?: string;     // естественный текст модели (LIVE), проверенный на числа
  situation: BriefItem[];
  threats: BriefItem[];
  people: BriefItem[];
  weather: BriefItem[];
  resources: BriefItem[];
  priorities: BriefItem[];
  gaps: BriefItem[];
  questions: BriefItem[];
}
export interface WeatherObs { temp: number; windMs: number; windDir: string; humidity: number; precip: string; source: string }
