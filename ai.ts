/**
 * /api/ai/* — AI-эндпоинты.
 * Схема: фронтенд → этот backend → AI-модель. Ключ модели есть только здесь (config.ts).
 * Без AI_API_KEY каждый эндпоинт отвечает mock-движком (meta.mode = "mock").
 * При ошибке модели в live-режиме возвращается ошибка — подмена ответа выдуманными данными не выполняется.
 */
import { Router } from 'express';
import multer from 'multer';
import type {
  AarFinding, DeploymentPlan, ImageStats, MapObject, PastIncident, ReportForm, SimRequest, SimResponse, SimState, WeatherObs,
} from '../../../shared/contracts.js';
import { analyzeReportText, pastIncidentToText } from '../../../shared/engine/aar.js';
import { assistantRagQuery, runAssistant } from '../../../shared/engine/assistant.js';
import { detailedEngine, reportEngine, situationEngine } from '../../../shared/engine/ops.js';
import { answerFromHits, extractiveAnswer, toCitation, validateCitationMarkers } from '../../../shared/engine/rag.js';
import { DIFFICULTIES, SCENARIOS, actionById, applyDecision, debrief, finishScenario, startScenario, tickState } from '../../../shared/engine/simulator.js';
import { briefingEngine, briefingNumbers } from '../../../shared/engine/briefing.js';
import { LANGS, SAFETY_NOTICE, type Lang } from '../../../shared/i18n.js';
import { visionFromStats } from '../../../shared/engine/vision.js';
import { aiLive, config, visionLive } from '../config.js';
import { HttpError, envelope, str, wrap } from '../lib/http.js';
import { chatJSON } from '../lib/llm.js';
import {
  arr, buildVisionResult, isObj, normalizeAssistant, normalizeDetailed, normalizeDetections, normalizeSituation, s, strings,
} from '../lib/normalize.js';
import { PROMPTS } from '../prompts.js';
import { extractPages } from '../rag/extract.js';
import { kb } from '../rag/store.js';

export const aiRouter = Router();
const imageUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 1 } });

/** Язык ответа: body.lang | query.lang | заголовок x-lang (по умолчанию ru) */
function langOf(req: { body?: unknown; query?: unknown; headers?: Record<string, unknown> }): Lang {
  const cands = [(req.body as { lang?: unknown } | undefined)?.lang, (req.query as { lang?: unknown } | undefined)?.lang, req.headers?.['x-lang']];
  const v = cands.find((c) => typeof c === 'string' && (LANGS as string[]).includes(c));
  return (v as Lang | undefined) ?? 'ru';
}

function parseIncident(v: unknown): MapObject {
  if (!isObj(v) || typeof v.id !== 'string' || typeof v.title !== 'string' || typeof v.type !== 'string') {
    throw new HttpError(400, 'Ожидается объект incident {id, type, title, ...}');
  }
  if (JSON.stringify(v).length > 20_000) throw new HttpError(413, 'Слишком большой объект incident');
  return v as unknown as MapObject;
}

/* ───────── situation / detailed ───────── */
aiRouter.post('/situation', wrap(async (req, res) => {
  const t0 = Date.now();
  const incident = parseIncident(req.body?.incident);
  const fb = situationEngine(incident, langOf(req));
  if (!aiLive()) return res.json(envelope(fb, t0, { live: false }));
  const r = await chatJSON({ lang: langOf(req), system: PROMPTS.situation, user: `ПРОИСШЕСТВИЕ (данные оператора):\n${JSON.stringify(incident)}` });
  res.json(envelope(normalizeSituation(r.json, incident.id, fb), t0, { live: true, model: r.model }));
}));

aiRouter.post('/detailed', wrap(async (req, res) => {
  const t0 = Date.now();
  const incident = parseIncident(req.body?.incident);
  const fb = detailedEngine(incident);
  if (!aiLive()) return res.json(envelope(fb, t0, { live: false }));
  const r = await chatJSON({ lang: langOf(req), system: PROMPTS.detailed, user: `ПРОИСШЕСТВИЕ:\n${JSON.stringify(incident)}`, maxTokens: 1500 });
  res.json(envelope(normalizeDetailed(r.json, fb), t0, { live: true, model: r.model }));
}));

/* ───────── assistant ───────── */
aiRouter.post('/assistant', wrap(async (req, res) => {
  const t0 = Date.now();
  const message = str(req.body?.message, 'message', 4000);
  const hits = (await kb.search(assistantRagQuery(message), 5)).filter((h) => h.score >= kb.threshold);
  const fb = runAssistant(message, hits);
  if (!aiLive()) return res.json(envelope(fb, t0, { live: false }));
  const allowed = hits.map((h) => toCitation(h.chunk, h.score));
  const fragments = allowed.length
    ? allowed.map((c) => `ID: ${c.chunkId}\nДокумент: ${c.document}\nРаздел: ${c.section}${c.clause ? `, ${c.clause}` : ''}\nОфициальный: ${c.official ? 'да' : 'нет (демо, условный текст)'}\nТекст: ${c.excerpt}`).join('\n---\n')
    : 'НЕТ ФРАГМЕНТОВ. Официальный источник не подключен — regulationChunkIds должен быть пустым.';
  const r = await chatJSON({ lang: langOf(req), system: PROMPTS.assistant, user: `СООБЩЕНИЕ ОПЕРАТОРА:\n${message}\n\nФРАГМЕНТЫ НОРМАТИВНОЙ БАЗЫ:\n${fragments}`, maxTokens: 2500 });
  const warnings: string[] = [];
  res.json(envelope(normalizeAssistant(r.json, fb, allowed, warnings), t0, { live: true, model: r.model, warnings }));
}));

/* ───────── vision ───────── */
function parseStats(v: unknown): ImageStats | null {
  if (typeof v !== 'string') return null;
  try {
    const o = JSON.parse(v) as ImageStats;
    const ok = ['width', 'height', 'sizeKb', 'firePixels', 'smokePixels', 'brightness', 'seed'].every((k) => typeof (o as unknown as Record<string, unknown>)[k] === 'number');
    return ok ? o : null;
  } catch { return null; }
}

aiRouter.post('/vision', imageUpload.single('image'), wrap(async (req, res) => {
  const t0 = Date.now();
  const file = req.file;
  if (!file) throw new HttpError(400, 'Ожидается файл image (multipart/form-data)');
  if (!/^image\/(jpeg|png|webp)$/.test(file.mimetype)) throw new HttpError(415, 'Поддерживаются JPEG, PNG, WEBP');
  const stats = parseStats(req.body?.stats);
  const image = { width: stats?.width ?? 0, height: stats?.height ?? 0, sizeKb: Math.round(file.size / 1024) };

  if (!visionLive()) {
    if (!stats) throw new HttpError(503, 'Модель компьютерного зрения не подключена, а статистика изображения не передана.');
    return res.json(envelope(visionFromStats(stats, 'backend mock: цветовая эвристика + симуляция', langOf(req)), t0, { live: false }));
  }
  if (config.vision.provider === 'http') {
    const fd = new FormData();
    fd.append('image', new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }), file.originalname || 'image');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), config.ai.timeoutMs);
    try {
      const r = await fetch(config.vision.apiUrl, { method: 'POST', body: fd, signal: ctrl.signal });
      if (!r.ok) throw new HttpError(502, `Сервис компьютерного зрения: HTTP ${r.status}`);
      const parsed = normalizeDetections(await r.json());
      return res.json(envelope(buildVisionResult('vision-http', image, parsed), t0, { live: true, model: 'VISION_API_URL' }));
    } finally { clearTimeout(timer); }
  }
  const r = await chatJSON({
    lang: langOf(req),
    system: PROMPTS.vision, user: 'Проанализируй изображение с места происшествия.',
    image: { mime: file.mimetype, base64: file.buffer.toString('base64') }, model: config.ai.visionModel, maxTokens: 1800,
  });
  res.json(envelope(buildVisionResult(r.model, image, normalizeDetections(r.json)), t0, { live: true, model: r.model }));
}));

/* ───────── kb-search (RAG) ───────── */
aiRouter.post('/kb-search', wrap(async (req, res) => {
  const t0 = Date.now();
  const query = str(req.body?.query, 'query', 1000);
  const topK = 4;
  const hits = await kb.search(query, topK);
  const base = answerFromHits(query, hits, {
    chunksSearched: kb.index.chunks.length, topK, embedding: kb.embedder, threshold: kb.threshold, officialConnected: kb.index.officialCount() > 0,
  });
  const warnings = [...kb.warnings];
  if (!aiLive() || !base.found) return res.json(envelope(base, t0, { live: aiLive(), warnings: aiLive() ? [...warnings, 'Модель не вызывалась: релевантные фрагменты не найдены.'] : warnings }));
  const numbered = base.citations.map((c, i) => `[${i + 1}] ${c.document}, ${c.section}${c.clause ? `, ${c.clause}` : ''}${c.page ? `, стр. ${c.page}` : ''}\n${c.excerpt}`).join('\n\n');
  const r = await chatJSON({ lang: langOf(req), system: PROMPTS.kb, user: `ВОПРОС: ${query}\n\nФРАГМЕНТЫ:\n${numbered}`, maxTokens: 1200 });
  let answer = isObj(r.json) ? s(r.json.answer, '', 3000) : '';
  const check = validateCitationMarkers(answer, base.citations.length);
  if (!answer || !check.ok || !/\[\d+\]/.test(answer)) {
    warnings.push('Ответ модели содержал ссылки вне найденных фрагментов или без ссылок — показан экстрактивный ответ.');
    answer = extractiveAnswer(query, hits.filter((h) => h.score >= kb.threshold));
  }
  res.json(envelope({ ...base, answer }, t0, { live: true, model: r.model, warnings }));
}));

/* ───────── incident (after-action) ───────── */
aiRouter.post('/incident', docUpload.single('file'), wrap(async (req, res) => {
  const t0 = Date.now();
  let title = typeof req.body?.title === 'string' ? req.body.title.slice(0, 200) : 'Донесение';
  let text = '';
  let source = 'Текст, введенный оператором';
  if (req.file) {
    const ex = await extractPages(req.file.buffer, req.file.originalname, req.file.mimetype);
    text = ex.pages.join('\n');
    source = `Файл: ${req.file.originalname}`;
    title = title === 'Донесение' ? req.file.originalname : title;
  } else if (isObj(req.body?.incident)) {
    const inc = req.body.incident as PastIncident;
    text = pastIncidentToText(inc);
    title = inc.title;
    source = 'Архив происшествий (демо)';
  } else {
    text = str(req.body?.text, 'text', 100_000);
  }
  if (text.length > 100_000) throw new HttpError(413, 'Текст донесения превышает 100 000 символов');
  const base = analyzeReportText({ title, text, source });
  if (!aiLive()) return res.json(envelope(base, t0, { live: false }));

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const numbered = lines.map((l, i) => `${i + 1}: ${l}`).join('\n');
  const r = await chatJSON({ lang: langOf(req), system: PROMPTS.incident, user: `ДОНЕСЕНИЕ (номер строки: текст):\n${numbered}`, maxTokens: 2500 });
  const warnings: string[] = [];
  const o = isObj(r.json) ? r.json : {};
  const findings = (v: unknown, d: AarFinding['kind']): AarFinding[] => {
    const out: AarFinding[] = [];
    for (const x of arr(v)) {
      if (!isObj(x)) continue;
      const ev = s(x.evidence, '', 60);
      const nums = [...ev.matchAll(/\d+/g)].map((m) => Number(m[0]));
      if (d !== 'recommendation' && (!nums.length || nums.some((k) => k < 1 || k > lines.length))) { warnings.push('Отброшен вывод модели без корректной ссылки на строку донесения.'); continue; }
      const kind = (['fact', 'assumption', 'recommendation'].includes(x.kind as string) ? x.kind : d) as AarFinding['kind'];
      out.push({ text: s(x.text, '', 400), kind, evidence: ev || undefined });
    }
    return out.filter((f) => f.text).slice(0, 10);
  };
  const pick = (llm: AarFinding[], rules: AarFinding[]) => (llm.length ? llm : rules);
  res.json(envelope({
    ...base,
    summary: s(o.summary, base.summary, 1500),
    keyDecisions: pick(findings(o.keyDecisions, 'fact'), base.keyDecisions),
    delays: pick(findings(o.delays, 'assumption'), base.delays),
    risks: pick(findings(o.risks, 'assumption'), base.risks),
    communication: pick(findings(o.communication, 'fact'), base.communication),
    lessons: pick(findings(o.lessons, 'recommendation'), base.lessons),
  }, t0, { live: true, model: r.model, warnings: [...new Set(warnings)] }));
}));

/* ───────── report ───────── */
function parseForm(v: unknown): ReportForm {
  if (!isObj(v)) throw new HttpError(400, 'Ожидается объект form');
  const keys: (keyof ReportForm)[] = ['date', 'time', 'place', 'type', 'area', 'victims', 'forces', 'result', 'author'];
  const f = {} as ReportForm;
  for (const k of keys) f[k] = typeof v[k] === 'string' ? (v[k] as string).slice(0, 2000) : '';
  if (!f.date || !f.place || !f.type || !f.result) throw new HttpError(400, 'Заполните дату, место, тип ЧС и результат');
  return f;
}

aiRouter.post('/report', wrap(async (req, res) => {
  const t0 = Date.now();
  const form = parseForm(req.body?.form);
  const base = reportEngine(form);
  if (!aiLive()) return res.json(envelope(base, t0, { live: false }));
  const r = await chatJSON({ lang: langOf(req), system: PROMPTS.report, user: `ФОРМА:\n${JSON.stringify(form, null, 1)}`, maxTokens: 1800 });
  const o = isObj(r.json) ? r.json : {};
  const sections = arr(o.sections).filter(isObj).map((x) => ({ heading: s(x.heading, '', 120), paragraphs: strings(x.paragraphs, 6, 1200) }))
    .filter((x) => x.heading && x.paragraphs.length);
  // Защита от выдуманных фактов: каждое число в тексте модели должно присутствовать в форме
  const formText = Object.values(form).join(' ');
  const formNums = new Set(formText.match(/\d+/g) ?? []);
  const bodyNums = sections.flatMap((x) => x.paragraphs.join(' ').match(/\d+/g) ?? []);
  const invented = bodyNums.filter((d) => !formNums.has(d));
  if (!sections.length || invented.length) {
    return res.json(envelope(base, t0, { live: true, model: r.model, warnings: ['Текст модели содержал сведения, отсутствующие в форме, — использован шаблон.'] }));
  }
  res.json(envelope({ ...base, title: s(o.title, base.title, 200), sections }, t0, { live: true, model: r.model }));
}));

/* ───────── operational briefing ─────────
 * Факты — только из структурированных данных (briefingEngine). Модель пишет лишь narrative;
 * если в нем есть числа, которых нет в данных, narrative отбрасывается. */
aiRouter.post('/briefing', wrap(async (req, res) => {
  const t0 = Date.now();
  const lang = langOf(req);
  const incident = parseIncident(req.body?.incident);
  const weather = isObj(req.body?.weather) ? (req.body.weather as unknown as WeatherObs) : null;
  const plan = isObj(req.body?.plan) ? (req.body.plan as unknown as DeploymentPlan) : null;
  const b = briefingEngine({ incident, weather, plan, lang });
  if (!aiLive()) return res.json(envelope(b, t0, { live: false }));
  const warnings: string[] = [];
  try {
    const r = await chatJSON({ lang, system: PROMPTS.briefing, user: JSON.stringify(b), maxTokens: 600, temperature: 0.3 });
    const text = isObj(r.json) ? s(r.json.narrative, '', 1200) : '';
    const allowed = briefingNumbers(b);
    const bad = (text.match(/\d+(?:[.,]\d+)?/g) ?? []).filter((n) => !allowed.has(n));
    if (text && !bad.length) b.narrative = `${text}\n\n${SAFETY_NOTICE[lang]}`;
    else if (text) warnings.push(`Нарратив модели отклонен: числа ${bad.slice(0, 3).join(', ')} отсутствуют в структурированных данных.`);
    return res.json(envelope(b, t0, { live: true, model: r.model, warnings }));
  } catch (e) {
    warnings.push(`Модель недоступна (${(e as Error).message}); показан брифинг по структурированным данным.`);
    return res.json(envelope(b, t0, { live: false, warnings }));
  }
}));

/* ───────── simulate ───────── */
function parseState(v: unknown): SimState {
  if (!isObj(v) || typeof v.type !== 'string' || !(v.type in SCENARIOS) || !Array.isArray(v.log)) throw new HttpError(400, 'Некорректное состояние сценария');
  if (JSON.stringify(v).length > 400_000) throw new HttpError(413, 'Состояние сценария слишком большое');
  return v as unknown as SimState;
}

async function narrate(state: SimState, feedback?: string): Promise<{ state: SimState; model?: string; warning?: string }> {
  if (!aiLive() || state.status !== 'active') return { state };
  try {
    const ctx = {
      сценарий: state.title, минута: state.clock, обстановка_движка: state.situation, условия: state.conditions,
      пострадавшие: state.victims, показатели: state.gauges.map((g) => `${g.label}: ${Math.round(g.value)}%`),
      последние_события: state.log.slice(-5).map((e) => e.text), последнее_решение: feedback ?? null,
    };
    const r = await chatJSON({ lang: state.lang, system: PROMPTS.simulate, user: JSON.stringify(ctx), maxTokens: 400, temperature: 0.6 });
    const text = isObj(r.json) ? s(r.json.situation, '', 700) : '';
    return text ? { state: { ...state, situation: text }, model: r.model } : { state };
  } catch (e) {
    return { state, warning: `Нарратив модели недоступен (${(e as Error).message}); показано описание движка.` };
  }
}

aiRouter.post('/simulate', wrap(async (req, res) => {
  const t0 = Date.now();
  const body = (req.body ?? {}) as SimRequest;
  let out: SimResponse;
  if (body.action === 'start') {
    if (!body.type || !(body.type in SCENARIOS)) throw new HttpError(400, 'Неизвестный тип сценария');
    out = { state: startScenario(body.type, typeof body.seed === 'number' ? body.seed : undefined, {
      trainee: typeof body.trainee === 'string' ? body.trainee.slice(0, 80) : undefined,
      difficulty: body.difficulty && DIFFICULTIES.includes(body.difficulty) ? body.difficulty : undefined,
      lang: langOf(req),
    }) };
  } else if (body.action === 'step') {
    const ids = Array.isArray(body.actionIds) ? body.actionIds.filter((x): x is string => typeof x === 'string' && Boolean(actionById(x))).slice(0, 5) : undefined;
    const r = applyDecision(parseState(body.state), str(body.input, 'input', 500), Math.max(0, Math.min(3600, Number(body.realSeconds) || 0)), ids);
    out = { state: r.state, decision: r.decision };
  } else if (body.action === 'tick') {
    out = { state: tickState(parseState(body.state), Math.max(1, Math.min(5, Number(body.minutes) || 1))) };
  } else if (body.action === 'finish') {
    const st = finishScenario(parseState(body.state));
    out = { state: st, debrief: debrief(st) };
  } else {
    throw new HttpError(400, 'action: start | step | tick | finish');
  }
  if (out.state.status !== 'active' && !out.debrief) out.debrief = debrief(out.state);
  const n = body.action === 'start' || body.action === 'step' ? await narrate(out.state, out.decision?.feedback) : { state: out.state };
  out.state = n.state;
  res.json(envelope(out, t0, { live: aiLive() && Boolean(n.model), model: n.model, warnings: n.warning ? [n.warning] : [] }));
}));
