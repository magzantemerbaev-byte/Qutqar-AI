/** Текстовые утилиты (общие для браузера и сервера, без зависимостей). */

export const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

const ENDINGS = [
  'иями', 'ями', 'ами', 'ого', 'его', 'ому', 'ему', 'ыми', 'ими', 'ией', 'ией', 'иях', 'ах', 'ях',
  'ой', 'ей', 'ий', 'ый', 'ая', 'яя', 'ое', 'ее', 'ые', 'ие', 'ую', 'юю', 'ов', 'ев', 'ом', 'ем',
  'ам', 'ям', 'ть', 'ся', 'сь', 'ют', 'ут', 'ит', 'ет', 'ат', 'ят', 'ии', 'ия', 'ие', 'ью',
  'а', 'я', 'о', 'е', 'ы', 'и', 'у', 'ю', 'ь', 'й',
];

/** Легкий стеммер для русского языка: отсечение типовых окончаний. */
export function stem(w: string): string {
  let s = w;
  if (s.length <= 4) return s;
  for (const e of ENDINGS) {
    if (s.length - e.length >= 4 && s.endsWith(e)) { s = s.slice(0, -e.length); break; }
  }
  return s.length > 7 ? s.slice(0, 7) : s;
}

const STOP = new Set([
  'как', 'что', 'при', 'для', 'это', 'или', 'так', 'уже', 'его', 'она', 'они', 'все', 'был', 'быть',
  'какие', 'какой', 'каки', 'котор', 'нужно', 'необход', 'такое', 'также', 'если', 'когда', 'где',
  'после', 'перед', 'через', 'между', 'the', 'and',
]);

export function tokens(s: string): string[] {
  return norm(s)
    .split(/[^a-zа-я0-9]+/i)
    .filter((w) => w.length >= 3 && !STOP.has(w))
    .map(stem)
    .filter((w) => !STOP.has(w));
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?;])\s+(?=[А-ЯЁA-Z0-9«"(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Детерминированный PRNG (mulberry32) — одинаковый seed дает одинаковый сценарий. */
export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
  };
}

export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
