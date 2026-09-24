/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  RAG-конвейер QUTQAR AI
 *  документ → извлечение текста → чанкинг → эмбеддинги → векторный поиск → ответ
 *
 *  Этот модуль не зависит от среды: работает и в браузере (DEMO MODE),
 *  и на сервере (server/src/rag/*). На сервере эмбеддинги могут считаться
 *  внешней моделью (EMBEDDING_MODEL), здесь — локальный hashing-эмбеддер.
 *
 *  ПРИНЦИП: цитаты НЕ генерируются моделью. Источник, документ, раздел, пункт,
 *  страница и фрагмент берутся только из метаданных найденных чанков.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import type { Citation, KbAnswer, KbDocumentInfo } from '../contracts.js';
import { DEMO_DOCUMENTS, DEMO_SOURCE } from './demoDocs.js';
import { hash32, splitSentences, tokens } from './text.js';

export const NOT_CONNECTED = 'Официальный источник не подключен.';

export interface Chunk {
  id: string;
  docId: string;
  document: string;
  source: string;
  section: string;
  clause?: string;
  page?: number;
  text: string;
  official: boolean;
  /** Дополнительный текст, участвующий только в эмбеддинге (ключевые слова и т. п.) */
  embedHint?: string;
}
export interface IndexedChunk extends Chunk { vector: number[] }

/* ───────────── 1. Чанкинг ───────────── */

const HEADING = /^\s*((глава|раздел|часть)\s+[\dIVXLC]+.*|статья\s+\d+.*|\d+(\.\d+)*\.?\s+[А-ЯЁA-Z][^.]{3,80})$/i;
const CLAUSE = /^\s*((п\.|пункт)\s*\d+(\.\d+)*|ст\.\s*\d+(\.\d+)*|\d+(\.\d+)+\.?)\s*/i;

/**
 * Режет постраничный текст на смысловые фрагменты ~maxChars с сохранением
 * раздела, пункта и страницы. Заголовки разделов распознаются по шаблонам.
 */
export function chunkPages(
  doc: { id: string; title: string; source: string; official: boolean },
  pages: string[],
  maxChars = 700,
  paged = true,
): Chunk[] {
  const out: Chunk[] = [];
  let section = 'Без раздела';
  let clause: string | undefined;
  let buf: string[] = [];
  let bufPage = 1;
  const flush = () => {
    const text = buf.join(' ').replace(/\s+/g, ' ').trim();
    if (text.length > 20) {
      out.push({
        id: `${doc.id}#${out.length + 1}`, docId: doc.id, document: doc.title, source: doc.source,
        section, clause, page: paged ? bufPage : undefined, text, official: doc.official,
      });
    }
    buf = [];
  };
  pages.forEach((pageText, pi) => {
    const lines = pageText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (HEADING.test(line) && line.length < 120 && !/[.;]$/.test(line)) {
        flush();
        section = line.replace(/\s+/g, ' ');
        clause = undefined;
        bufPage = pi + 1;
        continue;
      }
      const cm = line.match(CLAUSE);
      if (cm) {
        flush();
        clause = cm[1].trim().replace(/\.$/, '');
        bufPage = pi + 1;
      }
      if (!buf.length) bufPage = pi + 1;
      for (const s of splitSentences(line)) {
        if (buf.join(' ').length + s.length > maxChars && buf.length) {
          const last = buf[buf.length - 1];
          flush();
          buf = [last]; // перекрытие в одно предложение для связности
          bufPage = pi + 1;
        }
        buf.push(s);
      }
    }
  });
  flush();
  return out;
}

/* ───────────── 2. Эмбеддинги ───────────── */

export const HASH_DIM = 512;
export const HASH_EMBEDDER_NAME = 'hash-bow-512 (локальный, демо)';

/**
 * Hashing-эмбеддер: мешок основ + биграммы, хеширование в 512 измерений, L2-норма.
 * Работает офлайн и детерминированно. В рабочей версии заменяется моделью
 * эмбеддингов на backend (EMBEDDING_MODEL), интерфейс поиска не меняется.
 */
export function hashEmbed(text: string): number[] {
  const v = new Array<number>(HASH_DIM).fill(0);
  const tk = tokens(text);
  const add = (term: string, w: number) => {
    const h = hash32(term);
    v[h % HASH_DIM] += (h & 0x80000000 ? -1 : 1) * w;
  };
  tk.forEach((t, i) => {
    add(t, 1);
    if (i > 0) add(`${tk[i - 1]}_${t}`, 0.5);
  });
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

/* ───────────── 3. Векторный индекс ───────────── */

export class VectorIndex {
  chunks: IndexedChunk[] = [];
  docs = new Map<string, KbDocumentInfo>();

  add(info: KbDocumentInfo, chunks: IndexedChunk[]) {
    this.remove(info.id);
    this.docs.set(info.id, { ...info, chunks: chunks.length });
    this.chunks.push(...chunks);
  }
  remove(docId: string) {
    this.docs.delete(docId);
    this.chunks = this.chunks.filter((c) => c.docId !== docId);
  }
  search(qv: number[], topK = 5): { chunk: IndexedChunk; score: number }[] {
    return this.chunks
      .map((chunk) => ({ chunk, score: cosine(qv, chunk.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
  listDocs(): KbDocumentInfo[] { return [...this.docs.values()] }
  officialCount(): number { return this.listDocs().filter((d) => d.official).length }
}

/* ───────────── 4. Демо-корпус ───────────── */

export function demoChunks(): Chunk[] {
  const out: Chunk[] = [];
  for (const d of DEMO_DOCUMENTS) {
    d.sections.forEach((s, i) => out.push({
      id: `${d.id}#${i + 1}`, docId: d.id, document: d.title, source: DEMO_SOURCE,
      section: s.title, clause: s.clause, text: s.text, official: false,
      embedHint: s.keywords.join(' '),
    }));
  }
  return out;
}

export function buildDemoIndex(): VectorIndex {
  const idx = new VectorIndex();
  const all = demoChunks();
  for (const d of DEMO_DOCUMENTS) {
    const chunks = all.filter((c) => c.docId === d.id)
      .map((c) => ({ ...c, vector: hashEmbed(`${c.section} ${c.text} ${c.embedHint ?? ''}`) }));
    idx.add({
      id: d.id, title: d.title, category: d.category, source: DEMO_SOURCE, official: false,
      chunks: chunks.length, addedAt: '2026-01-01T00:00:00.000Z', origin: 'demo',
    }, chunks);
  }
  return idx;
}

/** Индексирует текстовый документ (для загрузки .txt/.md в браузере или на сервере). */
export function indexTextDocument(
  idx: VectorIndex,
  meta: { id: string; title: string; category: string; source: string; official: boolean; origin: 'demo' | 'upload' },
  pages: string[],
): KbDocumentInfo {
  const chunks = chunkPages(meta, pages).map((c) => ({ ...c, vector: hashEmbed(`${c.section} ${c.text}`) }));
  const info: KbDocumentInfo = { ...meta, chunks: chunks.length, pages: pages.length, addedAt: new Date().toISOString() };
  idx.add(info, chunks);
  return info;
}

/* ───────────── 5. Ответ на основе найденных фрагментов ───────────── */

export const RAG_THRESHOLD = 0.12;

export function toCitation(c: Chunk, score: number): Citation {
  return {
    chunkId: c.id, docId: c.docId, document: c.document, source: c.source, section: c.section,
    clause: c.clause, page: c.page, score: Math.round(score * 1000) / 1000, excerpt: c.text, official: c.official,
  };
}

/**
 * Экстрактивный ответ (без генерации): предложения берутся из найденных чанков
 * и помечаются номерами источников [n]. Используется в DEMO/mock-режиме и как
 * страховка, если LLM вернула ответ со ссылками на несуществующие фрагменты.
 */
export function extractiveAnswer(query: string, hits: { chunk: Chunk; score: number }[]): string {
  const q = new Set(tokens(query));
  const picked: { s: string; n: number; score: number }[] = [];
  hits.forEach((h, i) => {
    for (const s of splitSentences(h.chunk.text)) {
      const overlap = tokens(s).filter((t) => q.has(t)).length;
      picked.push({ s, n: i + 1, score: overlap + h.score * 2 });
    }
  });
  const best = picked.sort((a, b) => b.score - a.score).slice(0, 3);
  return best.map((b) => `${b.s.replace(/[.;]?$/, '.')} [${b.n}]`).join(' ');
}

export interface Hit { chunk: Chunk; score: number }

/** Формирует ответ по уже найденным фрагментам (общая логика браузера и сервера). */
export function answerFromHits(
  query: string,
  hits: Hit[],
  ctx: { chunksSearched: number; topK: number; embedding: string; threshold: number; officialConnected: boolean },
): KbAnswer {
  const { officialConnected, ...pipeline } = ctx;
  const good = hits.filter((h) => h.score >= ctx.threshold);
  if (!good.length) {
    return {
      query, found: false, officialConnected, citations: [], pipeline,
      answer: 'В подключенных документах не найдено фрагментов, отвечающих на этот вопрос. Ответ не формируется, чтобы не выдавать непроверенные сведения.',
      notice: officialConnected ? 'Уточните формулировку или загрузите документ, содержащий ответ.' : NOT_CONNECTED,
    };
  }
  const citations = good.map((h) => toCitation(h.chunk, h.score));
  const anyOfficial = citations.some((c) => c.official);
  return {
    query, found: true, officialConnected, citations, pipeline,
    answer: extractiveAnswer(query, good),
    notice: anyOfficial
      ? 'Ответ составлен из фрагментов загруженных документов. Сверяйте с первоисточником.'
      : `${NOT_CONNECTED} Ответ составлен по демонстрационным документам с условными текстами.`,
  };
}

export function answerFromIndex(idx: VectorIndex, query: string, topK = 4): KbAnswer {
  return answerFromHits(query, idx.search(hashEmbed(query), topK), {
    chunksSearched: idx.chunks.length, topK, embedding: HASH_EMBEDDER_NAME, threshold: RAG_THRESHOLD, officialConnected: idx.officialCount() > 0,
  });
}

/** Проверка ссылок [n] в тексте LLM: разрешены только номера найденных фрагментов. */
export function validateCitationMarkers(answer: string, count: number): { ok: boolean; bad: number[] } {
  const bad = [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])).filter((n) => n < 1 || n > count);
  return { ok: bad.length === 0, bad };
}
