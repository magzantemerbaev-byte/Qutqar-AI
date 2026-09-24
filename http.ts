import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AiEnvelope, AiMeta } from '../../../shared/contracts.js';
import { aiLive, config } from '../config.js';

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const wrap = (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res).catch(next); };

export function envelope<T>(data: T, t0: number, opts: { live: boolean; model?: string; warnings?: string[] }): AiEnvelope<T> {
  const meta: AiMeta = {
    mode: opts.live ? 'live' : 'mock',
    provider: opts.live ? config.ai.provider : 'qutqar-rules',
    model: opts.live ? (opts.model ?? config.ai.model) : 'rules-engine (AI_API_KEY не задан)',
    latencyMs: Date.now() - t0,
    warnings: opts.warnings ?? [],
  };
  if (!opts.live && !aiLive()) meta.warnings.push('Модель не подключена: ответ сформирован mock-движком backend.');
  return { data, meta };
}

export function str(v: unknown, field: string, max = 8000): string {
  if (typeof v !== 'string' || !v.trim()) throw new HttpError(400, `Поле «${field}» обязательно`);
  if (v.length > max) throw new HttpError(413, `Поле «${field}» превышает ${max} символов`);
  return v.trim();
}

/** Простой лимитер запросов в памяти (на процесс). Для кластера замените на Redis. */
export function rateLimit(perMinute: number): RequestHandler {
  const hits = new Map<string, { n: number; reset: number }>();
  return (req, res, next) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) { hits.set(key, { n: 1, reset: now + 60_000 }); return next(); }
    h.n += 1;
    if (h.n > perMinute) {
      res.setHeader('Retry-After', Math.ceil((h.reset - now) / 1000));
      return res.status(429).json({ error: 'Слишком много запросов. Повторите через минуту.' });
    }
    next();
  };
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!config.kb.adminToken) return next(); // локальная разработка
  if (req.header('x-admin-token') === config.kb.adminToken) return next();
  next(new HttpError(401, 'Требуется токен администратора базы знаний (x-admin-token)'));
}
