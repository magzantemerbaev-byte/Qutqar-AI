/**
 * Объединенный словарь. Каждый модуль — объект { ключ: [ru, kz, en] }.
 * satisfies гарантирует, что у каждого ключа ровно три перевода.
 */
import { aitools } from './aitools';
import { common } from './common';
import { dashboard } from './dashboard';
import { ops } from './ops';
import { presentation } from './presentation';
import { report } from './report';
import { sim } from './sim';

export const STR = { ...common, ...dashboard, ...ops, ...aitools, ...sim, ...report, ...presentation } satisfies Record<string, readonly [string, string, string]>;
