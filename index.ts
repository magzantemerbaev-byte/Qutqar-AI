/**
 * QUTQAR AI — backend (Node.js + Express + TypeScript)
 *   фронтенд → /api/* (этот сервер) → AI-модель / векторная БД / источники данных
 */
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import type { HealthInfo } from '../../shared/contracts.js';
import { aiLive, config } from './config.js';
import { HttpError, rateLimit } from './lib/http.js';
import { LlmError } from './lib/llm.js';
import { aiRouter } from './routes/ai.js';
import { dataRouter } from './routes/data.js';
import { kbRouter } from './routes/kb.js';
import { kb } from './rag/store.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});
app.use('/api', cors({ origin: config.corsOrigin, methods: ['GET', 'POST', 'DELETE'], allowedHeaders: ['content-type', 'x-admin-token'] }));
app.use('/api', express.json({ limit: '1mb' }));
app.use('/api/ai', rateLimit(config.rateLimitPerMin));

app.get('/api/health', (_req, res) => {
  const h: HealthInfo = {
    status: 'ok',
    version: config.version,
    aiMode: aiLive() ? 'live' : 'mock',
    provider: aiLive() ? config.ai.provider : 'none',
    model: aiLive() ? config.ai.model : '—',
    visionModel: config.vision.provider === 'http' ? (config.vision.apiUrl ? 'VISION_API_URL' : '—') : aiLive() ? config.ai.visionModel : '—',
    embeddings: kb.embedder,
    kb: { documents: kb.index.docs.size, chunks: kb.index.chunks.length, official: kb.index.officialCount() },
    operationalData: Boolean(config.data.url),
  };
  res.json(h);
});
app.use('/api/ai', aiRouter);
app.use('/api/kb', kbRouter);
app.use('/api/data', dataRouter);
app.use('/api', (_req: Request, res: Response) => res.status(404).json({ error: 'Not found' }));

// Необязательно: отдавать собранный фронтенд с того же адреса (SERVE_STATIC=../dist)
if (config.serveStatic) {
  const dir = path.resolve(config.serveStatic);
  if (existsSync(dir)) {
    app.use(express.static(dir, { index: 'index.html', maxAge: '1h' }));
    app.get('*', (_req: Request, res: Response) => res.sendFile(path.join(dir, 'index.html')));
  } else {
    console.warn(`[qutqar] SERVE_STATIC=${dir} не найден — статика не раздается`);
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof LlmError) return res.status(err.status).json({ error: `Ошибка AI-модели: ${err.message}` });
  if (err instanceof multer.MulterError) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: `Загрузка файла: ${err.message}` });
  if (err instanceof SyntaxError) return res.status(400).json({ error: 'Некорректный JSON' });
  console.error('[qutqar] unhandled', err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

await kb.init();
app.listen(config.port, () => {
  console.log(`[qutqar] backend http://localhost:${config.port}  AI: ${aiLive() ? `${config.ai.provider}/${config.ai.model}` : 'mock (AI_API_KEY не задан)'}  RAG: ${kb.embedder}, ${kb.index.chunks.length} фрагментов`);
  kb.warnings.forEach((w) => console.warn(`[qutqar] ${w}`));
});
