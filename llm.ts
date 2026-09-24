import type { Lang } from '../../../shared/i18n.js';
/**
 * ═══════════════════════════════════════════════════════════════════
 *  LLM-шлюз. Единственное место, где используется AI_API_KEY.
 *  Поддерживаются: OpenAI-совместимые API (/chat/completions) и Anthropic (/messages).
 *  Ответы запрашиваются в JSON и затем проходят нормализацию (normalize.ts).
 * ═══════════════════════════════════════════════════════════════════
 */
import { config } from '../config.js';

export interface LlmRequest {
  lang?: Lang;
  system: string;
  user: string;
  image?: { mime: string; base64: string };
  model?: string;
  maxTokens?: number;
  temperature?: number;
}
export interface LlmResult { json: unknown; raw: string; model: string; latencyMs: number }

export class LlmError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.ai.timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = await res.text();
    if (!res.ok) {
      // Тело ошибки провайдера клиенту не пересылаем (может содержать служебные данные)
      throw new LlmError(`AI provider HTTP ${res.status}`, res.status === 429 ? 429 : 502);
    }
    return JSON.parse(text) as unknown;
  } catch (e) {
    if (e instanceof LlmError) throw e;
    if ((e as Error).name === 'AbortError') throw new LlmError('AI provider timeout', 504);
    throw new LlmError(`AI provider unreachable: ${(e as Error).message}`, 502);
  } finally {
    clearTimeout(timer);
  }
}

/** Извлекает JSON-объект из ответа модели (снимает ```json-обертки и лишний текст). */
export function parseModelJson(raw: string): unknown {
  const clean = raw.replace(/```(?:json)?/gi, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new LlmError('Model returned no JSON object', 502);
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    throw new LlmError('Model returned invalid JSON', 502);
  }
}

const LANG_LINE: Record<Lang, string> = {
  ru: 'LANGUAGE: пиши все текстовые значения на русском языке.',
  kz: 'LANGUAGE: барлық мәтіндік мәндерді қазақ тілінде жаз (JSON кілттері мен enum мәндерін өзгертпе).',
  en: 'LANGUAGE: write all human-readable text values in English (keep JSON keys and enum values unchanged).',
};
export async function chatJSON(req: LlmRequest): Promise<LlmResult> {
  req = { ...req, system: `${req.system}\n${LANG_LINE[req.lang ?? 'ru']}` };
  const model = req.model ?? config.ai.model;
  const t0 = Date.now();
  let raw = '';

  if (config.ai.provider === 'anthropic') {
    const content: unknown[] = [];
    if (req.image) content.push({ type: 'image', source: { type: 'base64', media_type: req.image.mime, data: req.image.base64 } });
    content.push({ type: 'text', text: req.user });
    const data = (await fetchJson(`${config.ai.apiUrl}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': config.ai.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, max_tokens: req.maxTokens ?? 2000, temperature: req.temperature ?? 0.2,
        system: `${req.system}\nОтвечай ТОЛЬКО одним JSON-объектом без пояснений и без markdown.`,
        messages: [{ role: 'user', content }],
      }),
    })) as { content?: { type: string; text?: string }[] };
    raw = (data.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  } else {
    const userContent = req.image
      ? [{ type: 'text', text: req.user }, { type: 'image_url', image_url: { url: `data:${req.image.mime};base64,${req.image.base64}` } }]
      : req.user;
    const data = (await fetchJson(`${config.ai.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.ai.apiKey}` },
      body: JSON.stringify({
        model, temperature: req.temperature ?? 0.2, max_tokens: req.maxTokens ?? 2000,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: req.system }, { role: 'user', content: userContent }],
      }),
    })) as { choices?: { message?: { content?: string } }[] };
    raw = data.choices?.[0]?.message?.content ?? '';
  }

  if (!raw) throw new LlmError('Empty model response', 502);
  return { json: parseModelJson(raw), raw, model, latencyMs: Date.now() - t0 };
}

/** Эмбеддинги через OpenAI-совместимый /embeddings (батчами по 64). */
export async function embedRemote(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 64) {
    const batch = texts.slice(i, i + 64);
    const data = (await fetchJson(`${config.embeddings.apiUrl}/embeddings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${config.embeddings.apiKey}` },
      body: JSON.stringify({ model: config.embeddings.model, input: batch }),
    })) as { data?: { embedding: number[] }[] };
    if (!data.data || data.data.length !== batch.length) throw new LlmError('Invalid embeddings response', 502);
    for (const d of data.data) {
      const n = Math.hypot(...d.embedding) || 1;
      out.push(d.embedding.map((x) => x / n));
    }
  }
  return out;
}
