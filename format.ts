/**
 * Форматирование дат, времени, чисел и валюты для Казахстана.
 * С 1 марта 2024 г. в РК действует единый часовой пояс UTC+5, поэтому время
 * рассчитывается явным смещением (не зависит от устаревших tzdata в браузере).
 */
import type { Lang } from '../../shared/i18n';

const KZ_OFFSET_MS = 5 * 3600 * 1000;
const kz = (d: Date | string | number) => new Date(new Date(d).getTime() + KZ_OFFSET_MS);
const p2 = (n: number) => String(n).padStart(2, '0');

const MONTHS: Record<Lang, string[]> = {
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  kz: ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const WEEKDAYS: Record<Lang, string[]> = {
  ru: ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'],
  kz: ['жексенбі', 'дүйсенбі', 'сейсенбі', 'сәрсенбі', 'бейсенбі', 'жұма', 'сенбі'],
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

/** 23.09.2026 */
export const fmtDate = (d: Date | string | number) => { const x = kz(d); return `${p2(x.getUTCDate())}.${p2(x.getUTCMonth() + 1)}.${x.getUTCFullYear()}`; };
/** 16:05 */
export const fmtTime = (d: Date | string | number, seconds = false) => { const x = kz(d); return `${p2(x.getUTCHours())}:${p2(x.getUTCMinutes())}${seconds ? `:${p2(x.getUTCSeconds())}` : ''}`; };
/** 23.09.2026, 16:05 */
export const fmtDateTime = (d: Date | string | number) => `${fmtDate(d)}, ${fmtTime(d)}`;
/** 23 сентября 2026 г. / 2026 жылғы 23 қыркүйек / 23 September 2026 */
export function fmtLongDate(d: Date | string | number, lang: Lang, weekday = false): string {
  const x = kz(d);
  const day = x.getUTCDate(), m = MONTHS[lang][x.getUTCMonth()], y = x.getUTCFullYear();
  const wd = weekday ? WEEKDAYS[lang][x.getUTCDay()] : '';
  if (lang === 'kz') return `${y} жылғы ${day} ${m}${wd ? `, ${wd}` : ''}`;
  if (lang === 'en') return `${wd ? `${wd}, ` : ''}${day} ${m} ${y}`;
  return `${wd ? `${wd}, ` : ''}${day} ${m} ${y} г.`;
}
export const TZ_LABEL: Record<Lang, string> = { ru: 'Астана, UTC+5', kz: 'Астана, UTC+5', en: 'Astana, UTC+5' };

/** Число с разделением разрядов: 12 500 (ru/kz, узкий пробел) или 12,500 (en) */
export function fmtNum(n: number, lang: Lang, digits = 0): string {
  const [i, f] = Math.abs(n).toFixed(digits).split('.');
  const sep = lang === 'en' ? ',' : '\u202f';
  const dec = lang === 'en' ? '.' : ',';
  return `${n < 0 ? '−' : ''}${i.replace(/\B(?=(\d{3})+(?!\d))/g, sep)}${f ? dec + f : ''}`;
}
/** 12 500 ₸ — казахстанский тенге */
export const fmtKZT = (n: number, lang: Lang) => `${fmtNum(Math.round(n), lang)}\u00a0₸`;
/** 05:07 */
export const fmtClock = (raw: number) => { const s = Math.max(0, Math.floor(raw)); return `${p2(Math.floor(s / 60))}:${p2(s % 60)}`; };
