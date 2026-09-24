/**
 * /api/kb/* — управление базой знаний (шаг 1 RAG: загрузка документа).
 * POST /api/kb/documents  multipart: file, title, category, source, official=true|false
 */
import { Router } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { HttpError, requireAdmin, wrap } from '../lib/http.js';
import { extractPages } from '../rag/extract.js';
import { DuplicateError, kb } from '../rag/store.js';

export const kbRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: config.kb.maxUploadMb * 1024 * 1024, files: 1 } });

kbRouter.get('/documents', (_req, res) => {
  res.json({
    documents: kb.index.listDocs(),
    pipeline: { embedding: kb.embedder, threshold: kb.threshold, chunks: kb.index.chunks.length, official: kb.index.officialCount() },
    warnings: kb.warnings,
  });
});

kbRouter.post('/documents', requireAdmin, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Ожидается файл (поле file)');
  const title = String(req.body?.title ?? '').trim() || req.file.originalname;
  const category = String(req.body?.category ?? '').trim() || 'Без категории';
  const source = String(req.body?.source ?? '').trim();
  const official = req.body?.official === 'true';
  if (official && !source) throw new HttpError(400, 'Для официального документа укажите источник (издатель, реквизиты, дата).');
  const ex = await extractPages(req.file.buffer, req.file.originalname, req.file.mimetype);
  let info;
  try {
    info = await kb.addDocument({ title: title.slice(0, 300), category: category.slice(0, 100), source: (source || 'Загружено пользователем').slice(0, 300), official }, ex.pages, ex.paged);
  } catch (e) {
    if (e instanceof DuplicateError) throw new HttpError(409, e.message);
    throw e;
  }
  res.status(201).json({ document: info, format: ex.format });
}));

kbRouter.delete('/documents/:id', requireAdmin, wrap(async (req, res) => {
  const ok = await kb.remove(req.params.id);
  if (!ok) throw new HttpError(404, 'Документ не найден (демо-документы удалить нельзя — отключите KB_INCLUDE_DEMO)');
  res.json({ removed: req.params.id });
}));
