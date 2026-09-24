/**
 * Векторное хранилище базы знаний (шаги 3–5 RAG-конвейера).
 * Простая реализация: индекс в памяти + сохранение в JSON (KB_DATA_DIR/kb-store.json).
 * Для промышленной эксплуатации замените на pgvector / Qdrant / OpenSearch —
 * интерфейс search() и метаданные чанков (документ, раздел, пункт, страница) сохраняются.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { KbDocumentInfo } from '../../../shared/contracts.js';
import { DEMO_DOCUMENTS, DEMO_SOURCE } from '../../../shared/engine/demoDocs.js';
import {
  HASH_EMBEDDER_NAME, RAG_THRESHOLD, VectorIndex, chunkPages, demoChunks, hashEmbed,
  type Chunk, type Hit, type IndexedChunk,
} from '../../../shared/engine/rag.js';
import { config } from '../config.js';
import { embedRemote } from '../lib/llm.js';

export class DuplicateError extends Error {
  constructor(public doc: KbDocumentInfo) { super(`Документ уже загружен: «${doc.title}»`); }
}

interface Persisted { embedder: string; docs: KbDocumentInfo[]; chunks: IndexedChunk[] }

export class KbStore {
  index = new VectorIndex();
  embedder = config.embeddings.model ? `${config.embeddings.model} (API)` : HASH_EMBEDDER_NAME;
  warnings: string[] = [];
  private file = path.resolve(config.kb.dir, 'kb-store.json');

  get threshold(): number {
    return config.embeddings.minScore ?? (this.embedder === HASH_EMBEDDER_NAME ? RAG_THRESHOLD : 0.3);
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (this.embedder === HASH_EMBEDDER_NAME) return texts.map(hashEmbed);
    return embedRemote(texts);
  }

  async init() {
    try {
      const raw = JSON.parse(await readFile(this.file, 'utf8')) as Persisted;
      if (raw.embedder === this.embedder) {
        for (const d of raw.docs) this.index.add(d, raw.chunks.filter((c) => c.docId === d.id));
      } else {
        this.warnings.push(`Сменилась модель эмбеддингов (${raw.embedder} → ${this.embedder}); загруженные документы нужно переиндексировать.`);
      }
    } catch { /* первый запуск */ }
    if (config.kb.includeDemo) {
      try {
        await this.addDemo();
      } catch (e) {
        this.warnings.push(`Эмбеддинги API недоступны (${(e as Error).message}); используется локальный hash-эмбеддер.`);
        this.embedder = HASH_EMBEDDER_NAME;
        this.index = new VectorIndex();
        await this.addDemo();
      }
    }
  }

  private async addDemo() {
    const all = demoChunks();
    for (const d of DEMO_DOCUMENTS) {
      if (this.index.docs.has(d.id)) continue;
      const chunks = all.filter((c) => c.docId === d.id);
      const vectors = await this.embed(chunks.map((c) => `${c.section} ${c.text} ${c.embedHint ?? ''}`));
      this.index.add({ id: d.id, title: d.title, category: d.category, source: DEMO_SOURCE, official: false, chunks: chunks.length, addedAt: '2026-01-01T00:00:00.000Z', origin: 'demo' },
        chunks.map((c, i) => ({ ...c, vector: vectors[i] })));
    }
  }

  private async persist() {
    const uploaded = this.index.listDocs().filter((d) => d.origin === 'upload');
    const data: Persisted = {
      embedder: this.embedder,
      docs: uploaded,
      chunks: this.index.chunks.filter((c) => uploaded.some((d) => d.id === c.docId)),
    };
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(data));
  }

  async addDocument(meta: { title: string; category: string; source: string; official: boolean }, pages: string[], paged: boolean): Promise<KbDocumentInfo> {
    const contentHash = createHash('sha256').update(pages.join('\f')).digest('hex').slice(0, 16);
    const dup = this.index.listDocs().find((d) => d.contentHash === contentHash);
    if (dup) throw new DuplicateError(dup);
    const id = `up-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const chunks: Chunk[] = chunkPages({ id, title: meta.title, source: meta.source, official: meta.official }, pages, 700, paged);
    if (!chunks.length) throw new Error('Документ не содержит текста для индексации');
    const vectors = await this.embed(chunks.map((c) => `${c.section} ${c.text}`));
    const info: KbDocumentInfo = { id, ...meta, contentHash, chunks: chunks.length, pages: paged ? pages.length : undefined, addedAt: new Date().toISOString(), origin: 'upload' };
    this.index.add(info, chunks.map((c, i) => ({ ...c, vector: vectors[i] })));
    await this.persist();
    return info;
  }

  async remove(id: string): Promise<boolean> {
    const d = this.index.docs.get(id);
    if (!d || d.origin !== 'upload') return false;
    this.index.remove(id);
    await this.persist();
    return true;
  }

  async search(query: string, k = 4): Promise<Hit[]> {
    const [qv] = await this.embed([query]);
    return this.index.search(qv, k);
  }
}

export const kb = new KbStore();
