/**
 * Языки интерфейса и контента QUTQAR AI: русский, казахский, английский.
 * L3 — текст на трех языках. Движки (shared/engine) формируют контент через tx(),
 * UI — через src/i18n (типизированный словарь, пропуск перевода = ошибка компиляции).
 */
export type Lang = 'ru' | 'kz' | 'en';
export const LANGS: Lang[] = ['ru', 'kz', 'en'];
export interface L3 { ru: string; kz: string; en: string }
export type Txt = string | L3;

export const tx = (lang: Lang | undefined, v: Txt): string => (typeof v === 'string' ? v : v[lang ?? 'ru']);
export const L = (ru: string, kz: string, en: string): L3 => ({ ru, kz, en });
/** Подстановка {name} в строку */
export const fill = (s: string, p: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (m, k: string) => (k in p ? String(p[k]) : m));
export const LANG_NAME: Record<Lang, string> = { ru: 'русском', kz: 'казахском', en: 'английском' };
export const LANG_NAME_EN: Record<Lang, string> = { ru: 'Russian', kz: 'Kazakh', en: 'English' };

/** Обязательная оговорка для операционных рекомендаций AI */
export const SAFETY_NOTICE: L3 = L(
  'Сформировано AI в целях обучения и информационной поддержки. Руководствуйтесь действующими официальными процедурами МЧС РК и указаниями ответственного руководителя.',
  'AI оқыту және ақпараттық қолдау мақсатында қалыптастырды. ҚР ТЖМ-нің қолданыстағы ресми рәсімдерін және жауапты басшының нұсқауларын басшылыққа алыңыз.',
  "AI-generated training/information assistance. Follow current official MChS RK procedures and the responsible commander's instructions.",
);
