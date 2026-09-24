/**
 * Система переводов QUTQAR AI.
 * Каждый ключ содержит кортеж [ru, kz, en]. Отсутствие перевода — ошибка компиляции TypeScript,
 * поэтому новый текст интерфейса нельзя добавить только на одном языке.
 * Использование в компонентах: const { t } = useApp(); t('sim.start') / t('common.minutes', { n: 5 }).
 */
import type { Lang } from '../../shared/i18n';
import { fill } from '../../shared/i18n';
import { STR } from './strings/index';

export type TKey = keyof typeof STR;
export type TParams = Record<string, string | number>;
const IDX: Record<Lang, 0 | 1 | 2> = { ru: 0, kz: 1, en: 2 };

export function translate(lang: Lang, key: TKey, params?: TParams): string {
  const s = STR[key][IDX[lang]];
  return params ? fill(s, params) : s;
}
export { fmtClock, fmtDate, fmtDateTime, fmtKZT, fmtLongDate, fmtNum, fmtTime, TZ_LABEL } from './format';
