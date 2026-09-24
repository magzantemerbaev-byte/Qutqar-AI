/**
 * Журнал учебных сессий тренажера для РЕЖИМА ИНСТРУКТОРА.
 * Хранится локально в браузере (localStorage). Демо-курсанты ВЫМЫШЛЕНЫ и помечены demo: true.
 * В рабочей версии сессии сохраняются на backend с авторизацией инструктора.
 */
import type { Lang, SimDebrief, SimDifficulty, SimScenarioType, SimSession, SimState, SimVerdict } from '../types';

const KEY = 'qutqar-sim-sessions-v2';
const CAT_KEYS = ['tactical', 'safety', 'speed', 'resources', 'risk', 'interaction'];
const CAT_RU = ['Тактические решения', 'Безопасность', 'Скорость реагирования', 'Управление ресурсами', 'Оценка рисков', 'Взаимодействие подразделений'];

type DemoSpec = [string, string, SimScenarioType, string, SimDifficulty, number[], number, number, number, string, number, [string, boolean][]];
// [id, обучаемый, сценарий, название, сложность, категории, ошибки, нарушения, ср. время решения, дата, модельные минуты, цели]
const SPECS: DemoSpec[] = [
  ['d1', 'Абенов Н. (DEMO)', 'steppe_fire', 'Степной пожар у населенного пункта', 'hard', [92, 95, 84, 86, 80, 90], 0, 0, 16, '2026-09-08T05:20:00Z', 44, [['Защитить личный состав', true], ['Эвакуировать аул до подхода огня', true], ['Вывести людей с чабанской точки', true], ['Не допустить выхода огня к аулу', true], ['Взаимодействие: ЦУКС, акимат, полиция', true]]],
  ['d2', 'Иванова Е. (DEMO)', 'steppe_fire', 'Степной пожар у населенного пункта', 'medium', [66, 55, 70, 58, 45, 72], 1, 1, 38, '2026-09-10T09:05:00Z', 60, [['Защитить личный состав', false], ['Эвакуировать аул до подхода огня', true], ['Вывести людей с чабанской точки', false], ['Не допустить выхода огня к аулу', true], ['Взаимодействие: ЦУКС, акимат, полиция', false]]],
  ['d3', 'Сейткали А. (DEMO)', 'building_fire', 'Пожар в 9-этажном жилом доме', 'medium', [85, 78, 88, 70, 76, 66], 0, 0, 21, '2026-09-11T04:40:00Z', 34, [['Защитить личный состав', true], ['Спасти людей', true], ['Организовать водоснабжение', true], ['Не допустить распространения огня вверх', false], ['Поддерживать связь и докладывать', true]]],
  ['d4', 'Муратов Д. (DEMO)', 'hazmat', 'Утечка: аммиак', 'hard', [40, 10, 52, 35, 30, 45], 1, 3, 44, '2026-09-12T11:15:00Z', 18, [['Защитить личный состав', false], ['Работать в СИЗ с наветренной стороны', false], ['Спасти людей', false], ['Защитить население по ветру', true], ['Устранить источник утечки', false]]],
  ['d5', 'Жумабекова А. (DEMO)', 'industrial_fire', 'Пожар на промышленном объекте', 'expert', [82, 90, 76, 80, 88, 84], 0, 0, 19, '2026-09-15T06:30:00Z', 29, [['Защитить личный состав', true], ['Найти и вывести рабочих', true], ['Не допустить распространения на соседний склад', true], ['Обеспечить водоснабжение и пену', true], ['Контролировать опасные факторы (газ, баллоны, электричество)', false]]],
  ['d6', 'Абенов Н. (DEMO)', 'industrial_fire', 'Пожар на промышленном объекте', 'hard', [70, 60, 81, 62, 71, 66], 2, 1, 27, '2026-09-16T08:10:00Z', 45, [['Защитить личный состав', false], ['Найти и вывести рабочих', true], ['Не допустить распространения на соседний склад', false], ['Обеспечить водоснабжение и пену', true], ['Контролировать опасные факторы (газ, баллоны, электричество)', true]]],
  ['d7', 'Оспанов Т. (DEMO)', 'road_accident', 'ДТП на трассе', 'easy', [88, 92, 90, 75, 70, 85], 0, 0, 14, '2026-09-17T10:00:00Z', 21, [['Защитить личный состав', true], ['Обеспечить безопасность места ДТП', true], ['Спасти людей', true], ['Организовать медицинскую помощь', true], ['Поддерживать связь и докладывать', true]]],
  ['d8', 'Иванова Е. (DEMO)', 'flood', 'Паводок в поселке', 'medium', [74, 80, 66, 70, 62, 78], 1, 0, 31, '2026-09-18T07:45:00Z', 40, [['Защитить личный состав', true], ['Спасти людей', true], ['Оповестить и эвакуировать жителей', true], ['Обесточить подтопленные улицы', false], ['Поддерживать связь и докладывать', true]]],
  ['d9', 'Сейткали А. (DEMO)', 'collapse', 'Обрушение подъезда жилого дома', 'hard', [58, 42, 60, 55, 50, 64], 2, 2, 49, '2026-09-19T12:20:00Z', 35, [['Защитить личный состав', false], ['Раскрепить неустойчивые конструкции', false], ['Спасти людей', true], ['Отключить газ', true], ['Поддерживать связь и докладывать', true]]],
  ['d10', 'Жумабекова А. (DEMO)', 'steppe_fire', 'Степной пожар у населенного пункта', 'expert', [86, 88, 82, 84, 90, 80], 0, 0, 17, '2026-09-21T05:55:00Z', 38, [['Защитить личный состав', true], ['Эвакуировать аул до подхода огня', true], ['Вывести людей с чабанской точки', true], ['Не допустить выхода огня к аулу', true], ['Взаимодействие: ЦУКС, акимат, полиция', false]]],
];

const gradeKeyOf = (s: number): SimDebrief['gradeKey'] => (s >= 85 ? 'excellent' : s >= 70 ? 'good' : s >= 50 ? 'satisfactory' : 'retrain');
const GRADE_RU = { excellent: 'Отлично', good: 'Хорошо', satisfactory: 'Удовлетворительно', retrain: 'Требуется повторная тренировка' };

export const DEMO_SESSIONS: SimSession[] = SPECS.map(([id, trainee, scenario, title, difficulty, cats, mistakes, violations, avg, date, simMin, objs]) => {
  const score = Math.max(0, Math.min(100, Math.round(cats.reduce((a, b) => a + b, 0) / 6) - violations * 6 - mistakes * 3 - objs.filter((o) => !o[1]).length * 3 + (violations ? 0 : 5)));
  const gradeKey = gradeKeyOf(score);
  const n = 8 + (cats[0] % 5);
  const verdicts: SimVerdict[] = [...Array(n)].map((_, i) => (i < violations ? 'violation' : i < violations + mistakes ? 'mistake' : i % 4 === 3 ? 'acceptable' : 'correct'));
  return {
    id: `demo-${id}`, trainee, scenario, scenarioTitle: title, seed: 1000 + cats[0], score, grade: GRADE_RU[gradeKey], gradeKey,
    outcomeLevel: violations > 1 ? 'failed' : score >= 70 ? 'success' : 'partial',
    outcome: violations > 1 ? 'Травмирован личный состав.' : score >= 70 ? 'Задача выполнена.' : 'Истекло время учебного эпизода.',
    categories: CAT_KEYS.map((key, i) => ({ key, label: CAT_RU[i], score: cats[i], note: '' })),
    totals: { decisions: n, correct: verdicts.filter((v) => v === 'correct').length, acceptable: verdicts.filter((v) => v === 'acceptable').length, mistakes, violations, unclear: 0 },
    mistakes: mistakes ? ['DEMO: тактическая ошибка (вымышленная запись)'] : [],
    safetyViolations: violations ? ['DEMO: нарушение требований безопасности (вымышленная запись)'] : [],
    decisions: verdicts.map((v, i) => ({ t: 2 + i * Math.round(simMin / n), input: `DEMO-решение ${i + 1}`, verdict: v, seconds: Math.max(5, avg + ((i * 7) % 15) - 7) })),
    simMinutes: simMin, realSeconds: n * avg + 120, completedAt: date, demo: true, difficulty, avgDecisionSec: avg,
    objectives: objs.map(([label, achieved], i) => ({ id: `o${i}`, label, achieved, note: '' })),
    recommendations: ['DEMO: повторить сценарий на более высоком уровне сложности.'], lang: 'ru',
  };
});

export function loadSessions(): SimSession[] {
  try { const raw = localStorage.getItem(KEY); return raw ? (JSON.parse(raw) as SimSession[]) : []; } catch { return []; }
}
export function allSessions(): SimSession[] { return [...loadSessions(), ...DEMO_SESSIONS]; }

export function saveSession(state: SimState, d: SimDebrief, realSeconds: number, lang: Lang): SimSession {
  const s: SimSession = {
    id: `${state.id}-${Date.now().toString(36)}`, trainee: state.trainee?.trim() || '—', scenario: state.type, scenarioTitle: state.title, seed: state.seed,
    score: d.score, grade: d.grade, gradeKey: d.gradeKey, outcomeLevel: d.outcomeLevel, outcome: d.outcome, categories: d.categories, totals: d.totals,
    mistakes: d.mistakes, safetyViolations: d.safetyViolations,
    decisions: state.decisions.map((x) => ({ t: x.t, input: x.input, verdict: x.verdict, seconds: x.realSeconds })),
    simMinutes: state.clock, realSeconds: Math.round(realSeconds), completedAt: new Date().toISOString(), demo: false,
    difficulty: state.difficulty, avgDecisionSec: d.timing.avgSeconds, objectives: d.objectives, recommendations: d.recommendations, lang,
  };
  try { localStorage.setItem(KEY, JSON.stringify([s, ...loadSessions()].slice(0, 200))); } catch { /* storage недоступен */ }
  return s;
}

export function clearSessions() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

/** Идентификатор учебного отчета: TR-ГГГГММДД-XXXXXX (не является номером документа МЧС) */
export function reportId(s: SimSession): string {
  let h = 2166136261;
  for (const c of s.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return `TR-${s.completedAt.slice(0, 10).replace(/-/g, '')}-${(h >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(0, 6)}`;
}
