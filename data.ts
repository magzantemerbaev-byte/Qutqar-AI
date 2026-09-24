/**
 * /api/data/situation — оперативные данные для дашборда и карты.
 * Данные НЕ генерируются: либо проксируются из OPERATIONAL_DATA_URL (ЦУКС / ГИС),
 * либо возвращается явный статус «не подключен».
 */
import { Router } from 'express';
import type { OperationalSnapshot } from '../../../shared/contracts.js';
import { config } from '../config.js';
import { HttpError, wrap } from '../lib/http.js';
import { isObj } from '../lib/normalize.js';

export const dataRouter = Router();

const EMPTY: OperationalSnapshot = {
  connected: false,
  source: 'не подключен',
  message: 'Источник оперативных данных не подключен. Укажите OPERATIONAL_DATA_URL на сервере или включите DEMO MODE.',
  incidents: [], resources: [], unitsAtWork: [], stats: { active: 0, fires: 0, rescues: 0, units: 0 }, risk: null,
};

dataRouter.get('/situation', wrap(async (_req, res) => {
  if (!config.data.url) return res.json(EMPTY);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(config.data.url, {
      headers: config.data.token ? { authorization: `Bearer ${config.data.token}` } : {},
      signal: ctrl.signal,
    });
    if (!r.ok) throw new HttpError(502, `Источник оперативных данных: HTTP ${r.status}`);
    const d = (await r.json()) as Partial<OperationalSnapshot>;
    if (!isObj(d) || !Array.isArray(d.incidents)) throw new HttpError(502, 'Источник оперативных данных вернул данные не по контракту OperationalSnapshot');
    res.json({ ...EMPTY, ...d, connected: true, source: d.source ?? new URL(config.data.url).host, message: undefined });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(502, `Источник оперативных данных недоступен: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}));
