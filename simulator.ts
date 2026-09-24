/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  AI EMERGENCY SIMULATOR — движок сценариев
 *
 *  Архитектура «правила оценивают — модель рассказывает»:
 *   • Этот модуль — детерминированная модель обстановки: переменные (развитие
 *     пожара, задымление, уровень воды, риск для л/с, состояние пострадавших),
 *     скрытые факты (неисправный гидрант, утечка топлива, газ), отложенные события
 *     и правила оценки решений. Оценка обучаемого всегда воспроизводима.
 *   • В live-режиме backend передает состояние LLM только для художественного
 *     описания обстановки (server/src/routes/ai.ts → /api/ai/simulate).
 *
 *  Время: каждое решение занимает модельные минуты; кроме того, интерфейс сдвигает
 *  модельное время, пока обучаемый думает (tickState), — обстановка ухудшается.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import type { SimCommand, SimDebrief, SimDecision, SimDifficulty, SimEventKind, SimGauge, SimObjective, SimScenarioType, SimScene, SimState, SimVerdict } from '../contracts.js';
import { L, fill, tx, type L3, type Lang, type Txt } from '../i18n.js';
import { clamp, norm, rng } from './text.js';

/* ───────────── Распознавание команд ───────────── */

interface ActionDef { id: string; label: L3; re: RegExp; minutes: number }
const A = (id: string, label: L3, re: RegExp, minutes: number): ActionDef => ({ id, label, re, minutes });
export const ACTIONS: ActionDef[] = [
  A('recon', L('Разведка', 'Барлау', 'Reconnaissance'), /(развед|обследов|осмотр|уточн[а-яa-z0-9]* обстанов|опрос|оцен[а-яa-z0-9]* (обстанов|устойчив|конструкц)|барлау|reconn|\brecon\b|survey the)/, 3),
  A('gdzs', L('Звенья ГДЗС / пост безопасности', 'ГТҚҚ буындары / қауіпсіздік бекеті', 'BA teams / entry control'), /(гдзс|сизод|дыхательн|пост[а-яa-z0-9]* безопасн|противогаз|гтққ|тыныс алу|breathing apparatus|\bscba\b|entry control)/, 2),
  A('protect', L('Защита соседних помещений / этажей', 'Көрші үй-жайларды / қабаттарды қорғау', 'Protect exposures'), /(вышележащ|выше[а-яa-z0-9]* этаж|на защит|защит[а-яa-z0-9]* (этаж|верх|соседн|склад)|көршіні қорға|көрші|protect (the )?(adjacent|exposure|neighbo))/, 3),
  A('water', L('Подача стволов / тушение', 'Оқпандар беру / сөндіру', 'Hose lines / extinguishing'), /(ствол|тушени|потуш|подать вод|подач[а-яa-z0-9]* вод|рукавн|атак[а-яa-z0-9]* (огн|оча)|оқпан|сөндір|hose line|extinguish)/, 3),
  A('water_supply', L('Водоснабжение', 'Сумен жабдықтау', 'Water supply'), /(гидрант|водоисточ|установ[а-яa-z0-9]* на вод|подвоз|магистрал|водоем|цистерн|перекачк|су көз|су тасы|hydrant|water supply|relay|shuttle)/, 3),
  A('rescue', L('Спасение людей', 'Адамдарды құтқару', 'Rescue people'), /(спас(?!ательн)|извлеч|вынест|вывест[а-яa-z0-9]* (пострадав|люд|жил|рабоч|персон|чабан)|эвакуир[а-яa-z0-9]* (пострадав|люд|жил)|поиск[а-яa-z0-9]* рабоч|құтқар|rescue)/, 4),
  A('extricate', L('Деблокирование', 'Бұғаттан шығару', 'Extrication'), /(деблок|гидравлич|кусач|разжим|разрез|резк|extricat)/, 5),
  A('evacuate', L('Эвакуация / оповещение населения', 'Халықты көшіру / хабарлау', 'Evacuate / warn the public'), /(эвакуац|эвакуир[а-яa-z0-9]* (жител|насел|аул|посел|квартал|жильц|территор|предприят)|оповещ|оповест|отселен|пвр|пункт временн|көшір|хабарла|evacuat|warn)/, 3),
  A('vent', L('Вентиляция / дымоудаление', 'Желдету / түтін шығару', 'Ventilation'), /(вентил|дымоудал|вскры[а-яa-z0-9]* окн|разби[а-яa-z0-9]* окн|дымосос|открыть окн|проветр|желдет|ventilat)/, 2),
  A('power_off', L('Отключение электричества / газа / АКБ', 'Электр / газ / АКБ ажырату', 'Isolate power / gas / battery'), /(обесточ|отключ[а-яa-z0-9]* (электр|газ|питан|ток|аккум|акб|лэп)|электроснабж|газоснабж|аккумулятор|акб|перекры[а-яa-z0-9]* газ|ток көзінен|ажырат|isolate power|de-?energi|power off|cut (the )?power)/, 2),
  A('gas_off', L('Перекрытие газа на ГРП', 'ГРП-да газды жабу', 'Shut off gas at the regulator station'), /(грп|газорегулятор|gas regulat)/, 2),
  A('ladder', L('Автолестница', 'Автосатыны', 'Aerial ladder'), /(автолестниц|ал-\d|подъемник|коленчат|автосаты|aerial ladder)/, 4),
  A('medical', L('Медицинская помощь', 'Медициналық көмек', 'Medical support'), /(скор|медик|медицин|смп|врач|сортиров|первую помощ|пмп|жмк|ambulance|medical|triage)/, 1),
  A('reinforce', L('Запрос дополнительных сил', 'Қосымша күштер сұрау', 'Request reinforcements'), /(дополнительн[а-яa-z0-9]* (сил|лодк|расчет|техник|отделен|ац|групп)|подкреплен|вызва[а-яa-z0-9]* (еще|доп)|повышен[а-яa-z0-9]* номер|запрос[а-яa-z0-9]* (сил|помощ|техник|отделен|кинолог|лодк|второ)|резерв|қосымша күш|reinforce|additional (units|forces|crews))/, 1),
  A('cordon', L('Ограждение / оцепление', 'Қоршау / оқшаулау', 'Cordon / traffic control'), /(оцеп|огради|огражд|перекры[а-яa-z0-9]* (движ|дорог|трасс)|конус|знак аварийн|регулирован|зон[а-яa-z0-9]* (оцеп|безопасн)|қоршау|cordon|close the road|traffic control)/, 2),
  A('drone', L('БПЛА', 'ҰҰА (дрон)', 'Drone'), /(бпла|дрон|квадрокоптер|беспилот|тепловизор|ұұа|drone|\buav\b|thermal camera)/, 2),
  A('stabilize', L('Стабилизация / крепление', 'Тұрақтандыру / бекіту', 'Stabilisation / shoring'), /(стабилиз|упор|клин|подпорк|крепл|раскреп|тұрақтандыр|stabili[sz]|shoring)/, 3),
  A('fuel', L('Работа с разливом топлива', 'Төгілген жанармаймен жұмыс', 'Fuel spill control'), /(топлив|сорбент|засып|fuel spill|absorbent)/, 2),
  A('foam', L('Пенная атака', 'Көбікпен шабуыл', 'Foam attack'), /(пенн|пеной|пену|пенообраз|гпс|көбік|foam)/, 3),
  A('cool', L('Охлаждение баллонов / емкостей', 'Баллондарды / ыдыстарды салқындату', 'Cool cylinders / containers'), /(охлажд|охлад|орош|салқында|cool(ing)? (the )?(cylinder|tank|container))/, 3),
  A('contact', L('Связь с ответственным лицом, списки персонала', 'Жауапты тұлғамен байланыс, персонал тізімі', 'Liaise with site manager, staff roster'), /(ответственн[а-яa-z0-9]* лиц|представител[а-яa-z0-9]* (объект|предприят|администрац)|спис[а-яa-z0-9]* (персонал|работ|смен)|свер[а-яa-z0-9]* спис|главн[а-яa-z0-9]* инженер|жауапты тұлға|тізім|site manager|responsible person|roster)/, 2),
  A('attack_in', L('Внутренняя атака', 'Ішкі шабуыл', 'Interior attack'), /(внутрь|внутрен[а-яa-z0-9]* (атак|тушен)|в цех|в здание|ішкі шабуыл|interior attack|offensive attack)/, 3),
  A('withdraw', L('Вывод л/с, переход к наружному тушению', 'Жеке құрамды шығару, сыртқы сөндіруге көшу', 'Withdraw crews, go defensive'), /(вывести (личн|л\/с|расчет|звень|подраздел)|вывод[а-яa-z0-9]* (личн|л\/с|расчет|звень)|отвести расчет|наружн[а-яa-z0-9]* тушен|оборонит|сыртқы сөндір|withdraw|defensive)/, 2),
  A('boats', L('Плавсредства', 'Жүзу құралдары', 'Boats'), /(лодк|плавсредств|катер|понтон|қайық|boat)/, 3),
  A('life_vests', L('Спасательные жилеты / страховка', 'Құтқару кеудешелері / сақтандыру', 'Life vests / safety lines'), /(жилет|страховк|страховочн|кеудеше|life (vest|jacket))/, 1),
  A('sandbags', L('Укрепление дамбы', 'Бөгетті нығайту', 'Reinforce the dam'), /(мешк|дамб|обвалов|насып|подсып|бөгет|sandbag|levee)/, 5),
  A('firebreak', L('Минерализованная полоса', 'Минералданған жолақ', 'Firebreak'), /(минерализ|опашк|полос|трактор|плуг|грейдер|минералдан|firebreak|plough|plow)/, 5),
  A('backfire', L('Встречный пал / отжиг', 'Қарсы өрт / күйдіру', 'Backfire / burn-out'), /(встречн[а-яa-z0-9]* пал|отжиг|қарсы өрт|backfire|burn-?out)/, 4),
  A('rotation', L('Ротация л/с, питьевой режим', 'Жеке құрам ротациясы, ауыз су режимі', 'Crew rotation, hydration'), /(ротац|питьев|смен[а-яa-z0-9]* (расчет|л\/с|личн)|отдых|ауысым|rotation|rehydrat)/, 1),
  A('tactic', L('Изменение тактики', 'Тактиканы өзгерту', 'Change of tactics'), /(изменить тактик|смен[а-яa-z0-9]* тактик|перегруппир|переставить сил|перенацел|тактиканы өзгерт|change (of )?tactic|regroup)/, 3),
  A('flank', L('Тушение кромки с флангов', 'Жиекті қапталдан сөндіру', 'Flank attack on the fire edge'), /(фланг|кромк|с тыла|қапта|flank)/, 4),
  A('front', L('Атака фронта', 'Алдыңғы шепке шабуыл', 'Frontal attack'), /(фронт[а-яa-z0-9]* (огн|пожар)|в лоб|атак[а-яa-z0-9]* фронт|на фронт|алдыңғы шеп|frontal|head-on)/, 4),
  A('escape', L('Пути отхода / наблюдатель', 'Шегіну жолдары / бақылаушы', 'Escape routes / lookout'), /(отход|точк[а-яa-z0-9]* сбор|наблюдател|сигнал[а-яa-z0-9]* (отход|опасн)|шегіну|escape route|lookout)/, 1),
  A('search', L('Поиск пострадавших', 'Зардап шеккендерді іздеу', 'Search for victims'), /(поиск(?![а-яa-z0-9]* рабоч)|кинолог|собак|акустич|тишин|іздеу|search)/, 4),
  A('heavy', L('Тяжелая техника', 'Ауыр техника', 'Heavy machinery'), /(кран|экскаватор|бульдоз|тяжел[а-яa-z0-9]* техн|разбор[а-яa-z0-9]* техник|heavy machin|crane)/, 5),
  A('chem_recon', L('Химическая разведка', 'Химиялық барлау', 'Chemical reconnaissance'), /(химразвед|хим[а-яa-z0-9]* развед|газоанализ|индикац|концентрац|определ[а-яa-z0-9]* веществ|химиялық барлау|gas detect|air monitor|chemical recon)/, 3),
  A('ppe_chem', L('Средства химзащиты', 'Химиялық қорғаныс құралдары', 'Chemical protective suits'), /(костюм|химзащит|защиты кожи|изолирующ|химиялық қорғаныс|chemical suit|hazmat suit)/, 2),
  A('upwind', L('Подход с наветренной стороны', 'Жел жақтан жақындау', 'Approach from upwind'), /(наветрен|против ветра|жел жақтан|upwind)/, 1),
  A('downwind', L('Подход с подветренной стороны', 'Желдің ығынан жақындау', 'Approach from downwind'), /(подветрен|по ветру|ығынан|downwind)/, 1),
  A('curtain', L('Водяная завеса', 'Су пердесі', 'Water curtain'), /(завес|су перде|water curtain)/, 3),
  A('seal', L('Устранение утечки', 'Ағуды жою', 'Stop the leak'), /(заглуш|перекры[а-яa-z0-9]* (утечк|задвиж|вентил|кран)|задвижк|устран[а-яa-z0-9]* утечк|бандаж|ағуды жою|stop the leak|seal the)/, 4),
  A('decon', L('Дегазация / обработка', 'Газсыздандыру / өңдеу', 'Decontamination'), /(дегаз|дезактив|санобработ|обработк[а-яa-z0-9]* (л\/с|личн|техник)|газсыздандыр|decontam)/, 3),
  A('hq', L('Доклад / штаб / связь', 'Баяндау / штаб / байланыс', 'Report / HQ / comms'), /(доклад|доложи|цукс|штаб|связ(?![а-яa-z0-9]* с ответ)|руководител|баянда|report to|command post|\bhq\b)/, 1),
  A('wait', L('Ожидание', 'Күту', 'Wait'), /(ожида|ждать|ждем|ничего не|бездейств|күт|\bwait\b)/, 3),
];
export const actionById = (id: string) => ACTIONS.find((a) => a.id === id);

export function parseActions(input: string): ActionDef[] {
  const t = norm(input);
  let out = ACTIONS.filter((a) => a.re.test(t));
  // «защита вышележащего этажа» — это тоже подача ствола: не дублируем «water»
  if (out.some((a) => a.id === 'protect')) out = out.filter((a) => a.id !== 'water' || /(очаг|этаж пожар|на тушени|в квартир)/.test(t));
  // «внутренняя атака» и «пенная атака» уже включают подачу стволов
  if (out.some((a) => a.id === 'attack_in' || a.id === 'foam')) out = out.filter((a) => a.id !== 'water');
  // «перекрыть газ на ГРП» — отдельное действие; «обесточить» остается, только если сказано явно
  if (out.some((a) => a.id === 'gas_off') && !/(обесточ|электр|ажырат|power)/.test(t)) out = out.filter((a) => a.id !== 'power_off');
  // «вывести личный состав» — не спасение людей
  if (out.some((a) => a.id === 'withdraw')) out = out.filter((a) => a.id !== 'rescue');
  // «запросить дополнительные лодки / кинологов» — это запрос сил, а не их применение
  if (out.some((a) => a.id === 'reinforce') && /(дополнительн|запрос)/.test(t)) out = out.filter((a) => !['boats', 'search'].includes(a.id));
  return out;
}

/* ───────────── Базовые помощники ───────────── */

interface Outcome { verdict: SimVerdict; feedback: Txt; tactical?: boolean }
const ok = (feedback: Txt, tactical = true): Outcome => ({ verdict: 'correct', feedback, tactical });
const meh = (feedback: Txt): Outcome => ({ verdict: 'acceptable', feedback });
const bad = (feedback: Txt): Outcome => ({ verdict: 'mistake', feedback });
const viol = (feedback: Txt): Outcome => ({ verdict: 'violation', feedback });

function log(s: SimState, kind: SimEventKind, text: Txt) {
  s.log.push({ id: s.nextEventId++, t: s.clock, kind, text: tx(s.lang, text) });
}
function once(s: SimState, key: string): boolean {
  if (s.flags[`once:${key}`]) return false;
  s.flags[`once:${key}`] = true;
  return true;
}
function schedule(s: SimState, inMin: number, id: string) { s.pending.push({ at: s.clock + inMin, id }) }
function rescue(s: SimState, n: number): number {
  const k = Math.max(0, Math.min(n, s.victims.atRisk));
  s.victims.atRisk -= k;
  s.victims.rescued += k;
  return k;
}
function loseVictim(s: SimState, text: Txt) {
  if (s.victims.atRisk <= 0) return;
  s.victims.atRisk -= 1;
  s.victims.lost += 1;
  log(s, 'escalation', text);
}
function injureCrew(s: SimState, text: Txt) {
  s.crewInjured += 1;
  log(s, 'violation', text);
}
function commit(s: SimState, name: string, n: number) {
  const r = s.resources.find((x) => x.name === name);
  if (r) r.committed = Math.min(r.total, r.committed + n);
}
function addRes(s: SimState, name: string, n: number, label?: string) {
  const r = s.resources.find((x) => x.name === name);
  if (r) r.total += n; else s.resources.push({ name, label, total: n, committed: 0 });
}

/** Кнопка действия: строка на русском (действия распознаются из текста) или L3 + явные действия */
type Cmd = string | { label: L3; actions: string[] };
type Created = Omit<SimState, 'id' | 'seed' | 'type' | 'log' | 'decisions' | 'pending' | 'nextEventId' | 'status' | 'clock' | 'crewInjured' | 'suggestions' | 'gauges' | 'situation' | 'scene' | 'trainee' | 'lang' | 'difficulty' | 'objectives' | 'localized'>;

interface ScenarioDef {
  type: SimScenarioType;
  title: string;
  create(seed: number, lang: Lang): Created;
  scene(s: SimState): SimScene;
  evaluate(s: SimState, action: string, input: string): Outcome | null;
  minute(s: SimState): void;
  onEvent(s: SimState, id: string): void;
  gauges(s: SimState): SimGauge[];
  situation(s: SimState): string;
  commands: Cmd[];
  resolved(s: SimState): Txt | null;   // успех
  failed(s: SimState): Txt | null;     // провал
}

/* ═════════════ 1. Пожар в здании ═════════════ */
const buildingFire: ScenarioDef = {
  type: 'building_fire',
  title: 'Пожар в жилом здании',
  create(seed) {
    const r = rng(seed);
    const floors = r.pick([3, 5, 5, 9, 9, 12]);
    const fireFloor = Math.max(1, Math.min(floors - 1, r.int(2, Math.max(2, floors - 1))));
    const total = r.int(2, 6);
    const wind = r.chance(0.55);
    const night = r.chance(0.4);
    const city = r.pick(['Кокшетау', 'Караганда', 'Павлодар', 'Астана', 'Семей']);
    return {
      title: `Пожар в ${floors}-этажном жилом доме`,
      briefing: `Поступило сообщение о пожаре в ${floors}-этажном жилом доме, г. ${city} (учебный сценарий). Горит квартира на ${fireFloor}-м этаже. Сильное задымление подъезда. На верхних этажах могут находиться люди.${wind ? ' На улице сильный ветер, порывы до 15 м/с.' : ' Ветер слабый.'}${night ? ' Время 02:40, темно, большинство жильцов спит.' : ' Время 14:20.'} Вы — РТП первого прибывшего подразделения.`,
      brief: {
        place: `г. ${city}, жилой ${floors}-этажный дом, подъезд № 2 (учебный адрес)`,
        time: night ? '02:40, темное время суток' : '14:20, дневное время',
        weather: wind ? 'Ветер сильный, порывы до 15 м/с; +8 °C' : 'Ветер слабый; +12 °C',
        people: 'Со слов заявителя — люди на верхних этажах, число не установлено',
        hazards: ['Сильное задымление лестничной клетки', `Очаг на ${fireFloor}-м этаже — угроза вышележащим этажам`, 'Возможна газификация дома', ...(floors > 9 ? ['Высота выше досягаемости АЛ-30'] : [])],
        forces: ['2 АЦ', '1 АЛ-30', '2 звена ГДЗС (6 СИЗОД)', '11 человек личного состава', 'Резерв — по запросу, ≈ 8 мин'],
      },
      conditions: [
        { label: 'Этажность', value: `${floors}` }, { label: 'Этаж очага', value: `${fireFloor}` },
        { label: 'Ветер', value: wind ? 'сильный, порывы 15 м/с' : 'слабый' }, { label: 'Время суток', value: night ? 'ночь' : 'день' },
        { label: 'Люди', value: 'уточняются' },
      ],
      timeLimit: 60,
      victims: { total, known: 0, atRisk: total, rescued: 0, lost: 0, revealed: false },
      vars: { floors, fireFloor, spread: 28, smoke: 58, crewRisk: 6, tank: 9, health: 100, wind: wind ? 1 : 0, night: night ? 1 : 0 },
      flags: { hydrantBroken: r.chance(0.45), gas: r.chance(0.6) },
      resources: [{ name: 'АЦ', total: 2, committed: 0 }, { name: 'АЛ-30', total: 1, committed: 0 }, { name: 'Звенья ГДЗС', total: 2, committed: 0 }, { name: 'Личный состав', total: 11, committed: 0 }],
    };
  },
  evaluate(s, a, input) {
    const v = s.vars; const f = s.flags;
    switch (a) {
      case 'recon': {
        if (f.recon) return meh('Разведка продолжается непрерывно — это верно, но новых сведений нет.');
        f.recon = true; s.victims.revealed = true; s.victims.known = s.victims.total;
        log(s, 'report', `Разведка: на ${v.fireFloor + 1}–${Math.min(v.floors, v.fireFloor + 3)} этажах находятся ${s.victims.total} чел., лестничная клетка задымлена. ${f.hydrantBroken ? 'Гидрант у дома неисправен — ближайший исправный в 350 м.' : 'Гидрант у дома исправен.'} ${f.gas ? 'Дом газифицирован.' : 'Дом не газифицирован.'}`);
        return ok(f.gdzs ? 'Разведка звеном ГДЗС — установлены люди и обстановка.' : 'Разведка проведена. Учтите: работа в задымлении — только звеньями ГДЗС.');
      }
      case 'gdzs':
        if (f.gdzs) return meh('Звенья ГДЗС уже работают.');
        f.gdzs = true; v.crewRisk = clamp(v.crewRisk - 8); commit(s, 'Звенья ГДЗС', 2);
        return ok('Сформированы звенья ГДЗС, выставлен пост безопасности, начат учет времени работы в СИЗОД.');
      case 'rescue': {
        if (s.victims.atRisk === 0) return meh('Людей в опасности не осталось — силы лучше направить на тушение.');
        if (!f.gdzs && v.smoke > 40) {
          v.crewRisk = clamp(v.crewRisk + 35); rescue(s, 1);
          return viol('Личный состав направлен в задымленную зону без СИЗОД и поста безопасности. Один человек выведен, но спасатели получили риск отравления.');
        }
        const n = (f.recon ? 2 : 1) + (f.reinforced ? 1 : 0);
        const k = rescue(s, n);
        log(s, 'improvement', `Выведено ${k} чел. по лестничной клетке.`);
        return f.recon ? ok(`Спасение по разведанному маршруту: выведено ${k} чел.`) : meh(`Спасение без разведки — поиск вслепую, выведен ${k} чел.`);
      }
      case 'ladder': {
        if (f.ladder) return meh('Автолестница уже установлена.');
        f.ladder = true; commit(s, 'АЛ-30', 1);
        if (v.fireFloor + 1 > 9) return meh('АЛ-30 не достает выше 9-го этажа: спасение с верхних этажей только по лестничной клетке.');
        const k = f.recon ? rescue(s, 1) : 0;
        if (k) log(s, 'improvement', 'С балкона по автолестнице спасен 1 человек.');
        if (v.wind) return meh(`Автолестница установлена${k ? ', спасен 1 человек' : ''}. Сильный ветер — соблюдайте ограничения по ветровой нагрузке.`);
        return ok(`Автолестница установлена${k ? ', с балкона спасен 1 человек' : ''}.`);
      }
      case 'water_supply':
        if (f.waterSupply || f.waterPending) return meh('Водоснабжение уже организуется.');
        if (f.hydrantBroken && !f.recon) {
          f.waterPending = true; schedule(s, 7, 'water_ready');
          log(s, 'escalation', 'АЦ подъехала к гидранту у дома — гидрант неисправен. Прокладка магистральной линии к гидранту в 350 м.');
          return meh('Установка без разведки водоисточника: гидрант оказался неисправен, потеряно время.');
        }
        f.waterPending = true; schedule(s, f.hydrantBroken ? 4 : 2, 'water_ready'); commit(s, 'АЦ', 1);
        return ok(f.hydrantBroken ? 'АЦ установлена на исправный гидрант по данным разведки.' : 'АЦ установлена на гидрант.');
      case 'water': {
        if (f.attack) return meh('Ствол уже работает на тушение.');
        f.attack = true; commit(s, 'Личный состав', 3);
        const warn = !f.power ? ' Здание не обесточено — риск поражения током при подаче воды.' : '';
        if (!f.power) v.crewRisk = clamp(v.crewRisk + 6);
        if (!f.waterSupply && !f.waterPending) return meh(`Ствол подан от цистерны: запас воды ≈ ${v.tank} мин без установки на водоисточник.${warn}`);
        return warn ? meh(`Ствол подан на этаж пожара.${warn}`) : ok('Ствол подан на этаж пожара.');
      }
      case 'protect':
        if (f.protect) return meh('Защита вышележащего этажа уже организована.');
        f.protect = true; commit(s, 'Личный состав', 2);
        return v.spread > 30 ? ok('Ствол подан на защиту вышележащего этажа — распространение по вертикали сдерживается.') : meh('Защита верхнего этажа организована заблаговременно.');
      case 'vent':
        if (!f.attack) {
          v.spread = clamp(v.spread + 22); v.smoke = clamp(v.smoke + 8); v.crewRisk = clamp(v.crewRisk + 15);
          log(s, 'escalation', 'Вскрытие окон до подачи ствола: приток воздуха — вспышка в квартире очага, пламя вышло на лестничную площадку.');
          return bad('Вентиляция до подачи ствола на тушение привела к резкому развитию пожара.');
        }
        if (f.vent) return meh('Дымоудаление уже работает.');
        f.vent = true;
        return ok('Дымоудаление после подачи ствола — задымление лестничной клетки снижается.');
      case 'power_off':
        if (f.power) return meh('Здание уже обесточено.');
        f.power = true;
        return ok(`Подъезд обесточен${f.gas || /газ/.test(norm(input)) ? ', аварийная служба перекрывает газ' : ''}.`, false);
      case 'medical':
        if (f.medical) return meh('Бригады СМП уже на месте.');
        f.medical = true;
        return s.victims.rescued + s.victims.known > 0 ? ok('Пункт сбора пострадавших развернут, бригады СМП на месте.', false) : meh('СМП вызвана заблаговременно.');
      case 'reinforce':
        if (f.reinforce) return meh('Дополнительные силы уже в пути.');
        f.reinforce = true; schedule(s, 8, 'reinforce_arrive');
        return s.victims.total >= 3 || v.spread >= 40 || v.floors >= 9 ? ok('Запрошены дополнительные силы — прибытие через ≈ 8 мин.') : meh('Дополнительные силы запрошены.');
      case 'evacuate':
        if (f.evac) return meh('Оповещение жильцов уже ведется.');
        f.evac = true; v.health = Math.min(100, v.health + 10);
        return ok('Жильцы соседних подъездов оповещены; оставшимся в квартирах дана команда закрыть двери и ждать спасателей.', false);
      case 'drone':
        if (f.drone) return meh('БПЛА уже в воздухе.');
        f.drone = true;
        if (!s.victims.revealed) { s.victims.revealed = true; s.victims.known = s.victims.total; log(s, 'report', `БПЛА с тепловизором: у окон верхних этажей ${s.victims.total} чел.`); }
        return v.night || v.floors >= 9 ? ok('БПЛА с тепловизором ведет осмотр фасада.') : meh('БПЛА осматривает фасад.');
      case 'hq':
        return once(s, 'hq') ? ok('Обстановка доложена в ЦУКС.', false) : meh('Доклад уже был.');
      case 'cordon':
        return meh('Территория у подъезда ограждена.');
      case 'wait':
        return s.victims.atRisk > 0 ? bad('Бездействие при людях в опасности.') : meh('Наблюдение за обстановкой.');
      default: return null;
    }
  },
  minute(s) {
    const v = s.vars; const f = s.flags;
    const waterOk = f.attack && (f.waterSupply || v.tank > 0);
    if (f.attack && !f.waterSupply) {
      v.tank = Math.max(0, v.tank - 1);
      if (v.tank === 0 && once(s, 'tank')) log(s, 'escalation', 'В цистерне закончилась вода — подача ствола прекращена. Нужна установка на водоисточник.');
    }
    let rate = waterOk ? -(f.reinforced ? 6 : 4) : 1.6 + v.wind * 0.8;
    if (rate > 0 && f.protect) rate *= 0.5;
    v.spread = clamp(v.spread + rate);
    v.smoke = clamp(v.smoke + (f.vent ? -3 : v.spread > 20 ? 1.2 : -0.5) + (waterOk ? -0.5 : 0));
    if (f.gdzs) v.crewRisk = clamp(v.crewRisk - 0.5);
    if (s.victims.atRisk > 0) {
      v.health -= v.smoke > 60 ? 3 : 1.5;
      if (v.health <= 40 && once(s, 'phones')) log(s, 'radio', `Диспетчер: жильцы с ${v.fireFloor + 1}-го этажа перестали отвечать по телефону.`);
      if (v.health <= 0) { v.health = 55; loseVictim(s, 'Один из жильцов верхнего этажа погиб от отравления продуктами горения.'); }
    }
    if (v.spread > 50 && once(s, 'facade')) log(s, 'escalation', `Огонь вышел через окно и по фасаду перекинулся на ${v.fireFloor + 1}-й этаж.`);
    if (v.spread > 75 && once(s, 'floor')) { v.crewRisk = clamp(v.crewRisk + 10); log(s, 'escalation', 'Угроза обрушения перекрытия в квартире очага.'); }
    if (f.gas && !f.power && v.spread > 60 && once(s, 'gas')) { v.crewRisk = clamp(v.crewRisk + 25); log(s, 'escalation', 'Хлопок газовоздушной смеси в квартире очага — газ не перекрыт.'); }
    if (v.crewRisk >= 100 && once(s, 'crew')) injureCrew(s, 'Травмирован спасатель: отравление продуктами горения.');
  },
  onEvent(s, id) {
    if (id === 'water_ready') { s.flags.waterSupply = true; s.flags.waterPending = false; log(s, 'improvement', 'АЦ установлена на водоисточник — бесперебойная подача воды.'); }
    if (id === 'reinforce_arrive') { s.flags.reinforced = true; addRes(s, 'АЦ', 2); addRes(s, 'Звенья ГДЗС', 2); addRes(s, 'Личный состав', 10); log(s, 'improvement', 'Прибыли дополнительные силы: 2 АЦ, 10 человек.'); }
  },
  gauges: (s) => [
    { key: 'spread', label: 'Развитие пожара', value: s.vars.spread },
    { key: 'smoke', label: 'Задымление', value: s.vars.smoke },
    { key: 'crew', label: 'Риск для л/с', value: s.vars.crewRisk },
  ],
  situation(s) {
    const v = s.vars; const f = s.flags;
    const fire = v.spread > 75 ? 'Пожар развился в полную силу, горит лестничная площадка и квартиры выше' : v.spread > 45 ? 'Интенсивное горение, пламя выходит из окон' : v.spread > 15 ? 'Горит квартира очага' : 'Горение локализовано, идет проливка';
    const smoke = v.smoke > 70 ? 'подъезд полностью задымлен' : v.smoke > 40 ? 'сильное задымление лестничной клетки' : 'задымление снижается';
    const ppl = s.victims.atRisk === 0 ? 'Все люди выведены.' : s.victims.revealed ? `В опасности остаются ${s.victims.atRisk} чел.` : 'Сведения о людях не подтверждены.';
    const water = f.attack ? (f.waterSupply ? 'Ствол работает от водоисточника.' : v.tank > 0 ? `Ствол работает от цистерны (≈ ${v.tank} мин воды).` : 'Подача воды прекращена.') : 'Стволы не поданы.';
    return `${fire}; ${smoke}. ${ppl} ${water}`;
  },
  scene(s) {
    const v = s.vars; const f = s.flags;
    const fy = 90 - (v.fireFloor / v.floors) * 70;
    return {
      wind: v.wind ? { deg: 60, label: 'порывы 15 м/с' } : undefined,
      zones: [
        { kind: 'fire', x: 40, y: fy, rx: 6 + v.spread / 8, ry: 3 + v.spread / 20, opacity: Math.max(0.15, v.spread / 100) },
        { kind: 'smoke', x: 44, y: Math.max(12, fy - 14), rx: 8 + v.smoke / 10, ry: 6 + v.smoke / 12, opacity: v.smoke / 170 },
      ],
      lines: [{ kind: 'building', points: [[25, 90], [25, 20], [60, 20], [60, 90]], label: `${v.floors} эт.` }, { kind: 'road', points: [[2, 94], [98, 94]] }],
      markers: [
        ...(s.victims.atRisk > 0 ? [{ kind: 'victims' as const, x: 52, y: Math.max(22, fy - 10), label: s.victims.revealed ? `${s.victims.atRisk} чел. в опасности` : 'Люди?', state: 'danger' as const }] : []),
        { kind: 'unit', x: 75, y: 86, label: f.attack ? 'АЦ-1: ствол на этаж' : 'АЦ-1' },
        ...(f.ladder ? [{ kind: 'unit' as const, x: 66, y: 60, label: 'АЛ-30' }] : []),
        ...(f.waterSupply ? [{ kind: 'water' as const, x: 90, y: 80, label: 'Гидрант' }] : f.hydrantBroken && f.recon ? [{ kind: 'hazard' as const, x: 88, y: 80, label: 'Гидрант неисправен', state: 'warn' as const }] : []),
        ...(f.gdzs ? [{ kind: 'hq' as const, x: 18, y: 86, label: 'Пост безопасности' }] : []),
        ...(f.medical ? [{ kind: 'medical' as const, x: 8, y: 70, label: 'СМП' }] : []),
      ],
    };
  },
  commands: ['Провести разведку звеном ГДЗС', 'Установить АЦ на гидрант', 'Подать ствол на этаж пожара', 'Подать ствол на защиту вышележащего этажа',
    'Спасать людей по лестнице звеном ГДЗС', 'Установить автолестницу к балконам', 'Вскрыть окна для дымоудаления', 'Обесточить подъезд и перекрыть газ',
    'Вызвать скорую помощь', 'Запросить дополнительные силы', 'Поднять БПЛА с тепловизором', 'Доложить в ЦУКС'],
  resolved: (s) => (s.vars.spread <= 12 && s.victims.atRisk === 0 ? 'Пожар локализован, все люди выведены из здания.' : null),
  failed: (s) => (s.vars.spread >= 100 ? 'Пожар охватил верхние этажи здания.' : s.crewInjured > 0 ? 'Травмирован личный состав.' : null),
};

/* ═════════════ 2. ДТП ═════════════ */
const roadAccident: ScenarioDef = {
  type: 'road_accident',
  title: 'ДТП на трассе',
  create(seed) {
    const r = rng(seed);
    const bus = r.chance(0.35);
    const trapped = bus ? 2 : r.int(1, 2);
    const walking = bus ? r.int(7, 12) : r.int(1, 2);
    const night = r.chance(0.5);
    return {
      title: bus ? 'ДТП с пассажирским автобусом' : 'ДТП: столкновение двух автомобилей',
      briefing: `Трасса Астана — Щучинск, 64-й км (учебный сценарий). ${bus ? 'Столкновение пассажирского автобуса с легковым автомобилем.' : 'Лобовое столкновение двух легковых автомобилей.'} Сообщают о зажатых людях. Мокрое покрытие, интенсивное движение.${night ? ' Темное время суток.' : ''} Вы прибыли первыми: АЦ и АСА, 8 человек.`,
      brief: {
        place: 'Трасса Астана — Щучинск, 64-й км (учебный)',
        time: night ? '23:15, темное время суток' : '17:30, час пик',
        weather: 'Дождь, мокрое покрытие, +6 °C',
        people: bus ? 'В автобусе до 15 пассажиров; о зажатых сообщают очевидцы' : 'Сообщают о зажатых людях, число не уточнено',
        hazards: ['Интенсивный поток машин', 'Возможна утечка топлива', 'Несработавшие подушки безопасности'],
        forces: ['1 АЦ', '1 АСА с гидроинструментом', '8 человек', 'СМП и дополнительные силы — по запросу'],
      },
      conditions: [{ label: 'Дорога', value: 'мокрое покрытие' }, { label: 'Трафик', value: 'интенсивный' }, { label: 'Время', value: night ? 'ночь' : 'день' }, { label: 'Пострадавшие', value: 'уточняются' }],
      timeLimit: 45,
      victims: { total: trapped + walking, known: 0, atRisk: trapped + walking, rescued: 0, lost: 0, revealed: false },
      vars: { trapped, walking, secondary: 25, fireRisk: 15, crewRisk: 5, health: 100, bus: bus ? 1 : 0 },
      flags: { fuelLeak: r.chance(0.6) },
      resources: [{ name: 'АЦ', total: 1, committed: 0 }, { name: 'АСА (гидроинструмент)', total: 1, committed: 0 }, { name: 'Личный состав', total: 8, committed: 0 }],
    };
  },
  evaluate(s, a) {
    const v = s.vars; const f = s.flags;
    switch (a) {
      case 'cordon':
        if (f.cordon) return meh('Место уже ограждено.');
        f.cordon = true; v.secondary = 0;
        return ok('Место ДТП ограждено, выставлен пост безопасности, полиция ограничивает движение.');
      case 'recon':
        if (f.recon) return meh('Разведка ведется.');
        f.recon = true; s.victims.revealed = true; s.victims.known = s.victims.total;
        log(s, 'report', `Разведка: зажато ${v.trapped} чел., еще ${v.walking} пострадавших ${v.bus ? 'в салоне автобуса' : 'в автомобилях'}. ${f.fuelLeak ? 'Под легковым автомобилем растекается топливо.' : 'Утечки топлива нет.'}`);
        return ok('Разведка выполнена: установлены пострадавшие и угрозы.');
      case 'stabilize':
        if (f.stab) return meh('ТС уже стабилизированы.');
        f.stab = true;
        return ok('Транспортные средства стабилизированы упорами и клиньями.');
      case 'power_off':
        if (f.power) return meh('АКБ уже отключены.');
        f.power = true;
        return ok('Отключены аккумуляторные батареи.', false);
      case 'extricate': {
        if (v.trapped <= 0) return meh('Зажатых пострадавших не осталось.');
        if (!f.stab) { v.crewRisk = clamp(v.crewRisk + 15); v.health -= 12; return viol('Деблокирование без стабилизации ТС: автомобиль сместился, пострадавшему причинена дополнительная травма.'); }
        if (f.fuelLeak && !f.fuel && !f.cover) { f.cutSpark = true; v.fireRisk = clamp(v.fireRisk + 40); return bad('Резка при разливе топлива без прикрытия ствола и сорбента — высокий риск возгорания.'); }
        const n = f.reinforced ? 2 : 1;
        const k = Math.min(n, v.trapped); v.trapped -= k; rescue(s, k); commit(s, 'АСА (гидроинструмент)', 1);
        log(s, 'improvement', `Деблокировано ${k} чел., переданы медикам.`);
        return f.power ? ok(`Деблокировано ${k} чел.`) : meh(`Деблокировано ${k} чел. АКБ не отключена — риск срабатывания подушек безопасности.`);
      }
      case 'fuel':
        if (f.fuel) return meh('Разлив уже обработан.');
        f.fuel = true; v.fireRisk = 0;
        return f.fuelLeak ? ok('Разлитое топливо засыпано сорбентом.') : meh('Сорбент применен профилактически.');
      case 'water':
        if (f.cover) return meh('Ствол уже наготове.');
        f.cover = true;
        return f.fuelLeak ? ok('Ствол поставлен наготове для прикрытия работ.') : meh('Ствол наготове.');
      case 'medical': {
        if (f.medical) return meh('Медики уже работают.');
        f.medical = true;
        const k = Math.min(v.walking, s.victims.atRisk); v.walking -= k; rescue(s, k);
        return ok(v.bus ? `Организована медицинская сортировка, ${k} пострадавших переданы СМП.` : `${k} пострадавших переданы СМП.`);
      }
      case 'rescue': {
        const k = Math.min(v.walking, 3); v.walking -= k; rescue(s, k);
        return k ? ok(`Из ТС выведено ${k} пострадавших без деблокирования.`) : meh('Незажатых пострадавших не осталось.');
      }
      case 'reinforce':
        if (f.reinforce) return meh('Силы уже запрошены.');
        f.reinforce = true; schedule(s, 7, 'reinforce_arrive');
        return v.bus ? ok('Запрошены дополнительные силы и бригады СМП — массовые пострадавшие.') : meh('Дополнительные силы запрошены.');
      case 'gdzs': return meh('Пост безопасности выставлен.');
      case 'drone': return meh('БПЛА показывает затор на подъездах.');
      case 'hq': return once(s, 'hq') ? ok('Обстановка доложена в ЦУКС.', false) : meh('Доклад уже был.');
      case 'wait': return bad('Бездействие: у зажатых пострадавших уходит «золотой час».');
      default: return null;
    }
  },
  minute(s) {
    const v = s.vars; const f = s.flags;
    if (!f.cordon) {
      v.secondary = clamp(v.secondary + 9);
      if (v.secondary >= 70 && once(s, 'secondary')) { v.crewRisk = clamp(v.crewRisk + 55); log(s, 'escalation', 'Проезжающий автомобиль не заметил место ДТП и задел АЦ. Спасатель отброшен на обочину.'); }
    }
    if (f.fuelLeak && !f.fuel) {
      v.fireRisk = clamp(v.fireRisk + (f.cutSpark ? 20 : 3));
      if (v.fireRisk >= 85 && once(s, 'carfire')) {
        if (f.cover) log(s, 'info', 'Вспышка топлива под автомобилем — сразу ликвидирована стволом.');
        else { v.health -= 35; v.crewRisk = clamp(v.crewRisk + 20); log(s, 'escalation', 'Возгорание разлитого топлива под легковым автомобилем! Пламя у салона с зажатым пострадавшим.'); }
      }
    }
    if (v.trapped > 0) {
      v.health -= f.medical ? 1.2 : 2.2;
      if (v.health <= 0) { v.health = 60; v.trapped -= 1; loseVictim(s, 'Зажатый пострадавший скончался до деблокирования.'); }
    }
    if (v.walking > 0 && !f.medical && s.clock > 15 && once(s, 'walking')) log(s, 'radio', 'Пострадавшие в автобусе жалуются на ухудшение состояния, нужны медики.');
    if (v.crewRisk >= 100 && once(s, 'crew')) injureCrew(s, 'Травмирован спасатель на месте ДТП.');
  },
  onEvent(s, id) {
    if (id === 'reinforce_arrive') { s.flags.reinforced = true; addRes(s, 'АСА (гидроинструмент)', 1); addRes(s, 'Личный состав', 6); log(s, 'improvement', 'Прибыли АСА и 2 бригады СМП.'); if (!s.flags.medical) { s.flags.medical = true; const k = Math.min(s.vars.walking, s.victims.atRisk); s.vars.walking -= k; rescue(s, k); } }
  },
  gauges: (s) => [
    { key: 'secondary', label: 'Риск вторичного ДТП', value: s.vars.secondary },
    { key: 'fire', label: 'Риск возгорания', value: s.vars.fireRisk },
    { key: 'health', label: 'Состояние зажатых', value: clamp(s.vars.health), invert: true },
    { key: 'crew', label: 'Риск для л/с', value: s.vars.crewRisk },
  ],
  situation(s) {
    const v = s.vars;
    return `${v.trapped > 0 ? `Зажато ${v.trapped} чел., состояние ${v.health > 60 ? 'стабильное' : v.health > 30 ? 'ухудшается' : 'критическое'}.` : 'Зажатых пострадавших нет.'} ${v.walking > 0 ? `Еще ${v.walking} пострадавших ждут помощи.` : ''} ${s.flags.cordon ? 'Место ограждено.' : 'Поток машин проходит в метре от места работ.'} ${s.flags.fuelLeak && !s.flags.fuel && s.flags.recon ? 'Топливо растекается.' : ''}`.replace(/\s+/g, ' ').trim();
  },
  scene(s) {
    const v = s.vars; const f = s.flags;
    return {
      zones: [
        ...(v.fireRisk >= 85 && !f.cover ? [{ kind: 'fire' as const, x: 46, y: 50, rx: 8, ry: 5, opacity: 0.8 }] : []),
        ...(f.fuelLeak && !f.fuel && f.recon ? [{ kind: 'water' as const, x: 48, y: 56, rx: 9, ry: 3, opacity: 0.4 }] : []),
      ],
      lines: [{ kind: 'road', points: [[0, 45], [100, 45]] }, { kind: 'road', points: [[0, 58], [100, 58]] }, ...(f.cordon ? [{ kind: 'cordon' as const, points: [[20, 40], [20, 62]] as [number, number][] }, { kind: 'cordon' as const, points: [[80, 40], [80, 62]] as [number, number][] }] : [])],
      markers: [
        { kind: 'victims', x: 45, y: 50, label: v.trapped > 0 ? `Зажато: ${v.trapped}` : 'Деблокировано', state: v.trapped > 0 ? 'danger' : 'ok' },
        ...(v.walking > 0 ? [{ kind: 'victims' as const, x: 58, y: 50, label: `Пострадавшие: ${v.walking}`, state: 'warn' as const }] : []),
        { kind: 'unit', x: 28, y: 52, label: 'АСА' }, { kind: 'unit', x: 70, y: 52, label: f.cover ? 'АЦ (ствол наготове)' : 'АЦ' },
        ...(f.medical ? [{ kind: 'medical' as const, x: 60, y: 70, label: 'СМП' }] : []),
        ...(!f.cordon ? [{ kind: 'hazard' as const, x: 10, y: 50, label: 'Поток машин', state: 'danger' as const }] : []),
      ],
    };
  },
  commands: ['Оградить место ДТП и выставить пост безопасности', 'Провести разведку', 'Стабилизировать автомобили', 'Отключить АКБ', 'Деблокировать пострадавшего гидроинструментом',
    'Засыпать топливо сорбентом', 'Поставить ствол наготове', 'Организовать медицинскую сортировку', 'Запросить дополнительные силы', 'Доложить в ЦУКС'],
  resolved: (s) => (s.victims.atRisk === 0 ? 'Все пострадавшие деблокированы и переданы медикам.' : null),
  failed: (s) => (s.crewInjured > 0 ? 'Травмирован личный состав.' : null),
};

/* ═════════════ 3. Паводок ═════════════ */
const flood: ScenarioDef = {
  type: 'flood',
  title: 'Паводок, подтопление поселка',
  create(seed) {
    const r = rng(seed);
    const people = r.int(7, 12);
    return {
      title: 'Паводок: подтопление жилого сектора',
      briefing: `Акмолинская обл., пос. на берегу р. Есиль (учебный сценарий). Резкий подъем воды после ночного снеготаяния: подтоплены улицы нижней части поселка. Жители звонят с крыш и чердаков. Температура воздуха +2 °C, вода ледяная. У вас 2 лодки, 1 АЦ, 12 человек. Дамба на северной окраине ${r.chance(0.6) ? 'имеет размывы' : 'пока держится'}.`,
      brief: {
        place: 'Акмолинская обл., поселок на р. Есиль, нижние улицы (учебный)',
        time: '06:10, рассвет',
        weather: '+2 °C, вода ледяная, рост уровня ≈ 4 см/ч',
        people: 'Жители звонят с крыш и чердаков; число не установлено',
        hazards: ['Сильное течение на отдельных улицах', 'Электроснабжение не отключено', 'Риск переохлаждения', 'Размывы дамбы'],
        forces: ['2 лодки', '1 АЦ / мотопомпы', '12 человек', 'Дополнительные лодочные расчеты — по запросу'],
      },
      conditions: [{ label: 'Воздух', value: '+2 °C' }, { label: 'Рост воды', value: '≈ 4 см/ч' }, { label: 'Жители', value: 'уточняются' }, { label: 'Электроснабжение', value: 'не отключено' }],
      timeLimit: 70,
      victims: { total: people, known: 0, atRisk: people, rescued: 0, lost: 0, revealed: false },
      vars: { level: 35, crewRisk: 5, health: 100, breachAt: r.int(14, 22) },
      flags: { weakDam: r.chance(0.6) },
      resources: [{ name: 'Лодки', total: 2, committed: 0 }, { name: 'АЦ / мотопомпы', total: 1, committed: 0 }, { name: 'Личный состав', total: 12, committed: 0 }],
    };
  },
  evaluate(s, a) {
    const v = s.vars; const f = s.flags;
    switch (a) {
      case 'recon': case 'drone':
        if (s.victims.revealed) return meh('Обстановка уже уточнена.');
        s.victims.revealed = true; s.victims.known = s.victims.total;
        log(s, 'report', `Разведка${a === 'drone' ? ' с БПЛА' : ''}: в ${Math.ceil(s.victims.total / 2)} домах ${s.victims.total} чел., из них пожилые и 2 ребенка. Течение на ул. Береговой сильное.`);
        return ok('Установлены дома с людьми и опасные участки течения.');
      case 'life_vests':
        if (f.vests) return meh('Жилеты уже надеты.');
        f.vests = true; v.crewRisk = clamp(v.crewRisk - 5);
        return ok('Весь личный состав в спасательных жилетах, со страховочными концами.', false);
      case 'boats':
        if (f.boats) return meh('Лодки уже на воде.');
        if (!f.vests) { v.crewRisk = clamp(v.crewRisk + 25); f.boats = true; return viol('Лодочные расчеты вышли на воду без спасательных жилетов.'); }
        f.boats = true; commit(s, 'Лодки', 2);
        return ok('Лодочные расчеты спущены на воду.');
      case 'rescue': case 'evacuate': {
        if (a === 'evacuate' && !f.alert) { f.alert = true; v.health = Math.min(100, v.health + 5); return ok('Организовано оповещение и развернут ПВР в школе на возвышенности.', false); }
        if (s.victims.atRisk === 0) return meh('Все жители эвакуированы.');
        if (!f.boats && v.level > 40) { v.crewRisk = clamp(v.crewRisk + 20); return (f.vests ? bad : viol)('Попытка эвакуации вброд при сильном течении без плавсредств' + (f.vests ? '.' : ' и без жилетов.')); }
        if (!f.power) { v.crewRisk = clamp(v.crewRisk + 20); rescue(s, 1); return viol('Вход в подтопленный дом без отключения электроэнергии. Спасен 1 человек, но л/с подвергался риску поражения током.'); }
        const k = rescue(s, (s.victims.revealed ? 3 : 2) + (f.reinforced ? 2 : 0));
        log(s, 'improvement', `Лодочные расчеты эвакуировали ${k} чел.`);
        return s.victims.revealed ? ok(`Эвакуировано ${k} чел. (в первую очередь дети и пожилые).`) : meh(`Эвакуировано ${k} чел. без разведки — порядок не приоритизирован.`);
      }
      case 'power_off':
        if (f.power) return meh('Участок уже обесточен.');
        f.power = true;
        return ok('Энергоснабжающая организация обесточила подтопленные улицы.');
      case 'sandbags':
        if (f.dam) return meh('Работы на дамбе продолжаются.');
        f.dam = true; commit(s, 'Личный состав', 5);
        return f.weakDam ? ok('Размывы дамбы укреплены мешками с песком.') : meh('Дамба подсыпана профилактически.');
      case 'reinforce':
        if (f.reinforce) return meh('Силы уже в пути.');
        f.reinforce = true; schedule(s, 10, 'reinforce_arrive');
        return ok('Запрошены дополнительные лодочные расчеты.');
      case 'medical':
        if (f.medical) return meh('Медики уже в ПВР.');
        f.medical = true;
        return ok('Медики и обогрев в ПВР — профилактика переохлаждения.', false);
      case 'water': case 'water_supply':
        return meh('Мотопомпы откачивают воду — на спасение людей это не влияет.');
      case 'hq': return once(s, 'hq') ? ok('Доклад в ЦУКС и акимат.', false) : meh('Доклад уже был.');
      case 'wait': return bad('Ожидание при растущей воде.');
      default: return null;
    }
  },
  minute(s) {
    const v = s.vars; const f = s.flags;
    v.level = clamp(v.level + (f.dam ? 0.5 : 1.2));
    if (f.weakDam && !f.dam && s.clock >= v.breachAt && once(s, 'breach')) { v.level = clamp(v.level + 18); log(s, 'escalation', 'Прорыв дамбы на северной окраине! Уровень воды резко вырос.'); }
    if (v.level > 60 && once(s, 'road')) log(s, 'escalation', 'Размыта дорога к нижним улицам — доступ только на лодках.');
    if (v.level > 80 && once(s, 'windows')) log(s, 'escalation', 'Вода поднялась до окон первых этажей.');
    if (s.victims.atRisk > 0 && v.level > 45) {
      v.health -= f.alert ? 1.4 : 2;
      if (v.health <= 50 && once(s, 'cold')) log(s, 'radio', 'Жительница с чердака: «У отца переохлаждение, он не может двигаться».');
      if (v.health <= 0) { v.health = 55; loseVictim(s, 'Пожилой житель погиб от переохлаждения до прибытия лодки.'); }
    }
    if (v.crewRisk >= 100 && once(s, 'crew')) injureCrew(s, 'Спасатель унесен течением, извлечен с переохлаждением.');
  },
  onEvent(s, id) {
    if (id === 'reinforce_arrive') { s.flags.reinforced = true; addRes(s, 'Лодки', 2); addRes(s, 'Личный состав', 10); log(s, 'improvement', 'Прибыли 2 дополнительных лодочных расчета.'); }
  },
  gauges: (s) => [
    { key: 'level', label: 'Уровень воды', value: s.vars.level },
    { key: 'health', label: 'Состояние жителей', value: clamp(s.vars.health), invert: true },
    { key: 'crew', label: 'Риск для л/с', value: s.vars.crewRisk },
  ],
  situation(s) {
    const v = s.vars;
    return `${v.level > 75 ? 'Вода у окон, течение сильное.' : v.level > 50 ? 'Улицы затоплены по пояс, течение усиливается.' : 'Вода продолжает прибывать.'} ${s.victims.atRisk ? `В домах остаются ${s.victims.revealed ? s.victims.atRisk : 'неустановленное число'} чел.` : 'Все жители эвакуированы.'} ${s.flags.power ? '' : 'Подтопленные улицы не обесточены.'}`.trim();
  },
  scene(s) {
    const v = s.vars; const f = s.flags;
    return {
      zones: [{ kind: 'water', x: 50, y: 70, rx: 50, ry: 10 + v.level / 3, opacity: 0.45 }],
      lines: [{ kind: 'river', points: [[0, 92], [40, 88], [100, 95]], label: 'р. Есиль' }, { kind: 'dam', points: [[10, 30], [90, 30]], label: f.dam ? 'Дамба (укреплена)' : 'Дамба' }],
      markers: [
        ...(s.victims.atRisk > 0 ? [{ kind: 'victims' as const, x: 35, y: 62, label: s.victims.revealed ? `${s.victims.atRisk} чел. на крышах` : 'Жители?', state: 'danger' as const }] : []),
        { kind: 'village', x: 60, y: 60, label: 'Нижние улицы', state: v.level > 60 ? 'danger' : 'warn' },
        { kind: 'hq', x: 50, y: 14, label: f.alert ? 'ПВР (школа)' : 'Штаб' },
        ...(f.boats ? [{ kind: 'unit' as const, x: 45, y: 72, label: 'Лодки' }] : []),
        ...(!f.power ? [{ kind: 'hazard' as const, x: 72, y: 66, label: 'Сеть под напряжением', state: 'warn' as const }] : []),
      ],
    };
  },
  commands: ['Провести разведку с БПЛА', 'Надеть спасательные жилеты на весь л/с', 'Спустить лодки на воду', 'Обесточить подтопленные улицы', 'Эвакуировать людей на лодках',
    'Укрепить дамбу мешками с песком', 'Развернуть ПВР и оповестить жителей', 'Запросить дополнительные лодки', 'Эвакуировать людей вброд', 'Доложить в ЦУКС'],
  resolved: (s) => (s.victims.atRisk === 0 ? 'Все жители эвакуированы из зоны подтопления.' : null),
  failed: (s) => (s.crewInjured > 0 ? 'Травмирован личный состав.' : null),
};

/* ═════════════ 4. Обрушение здания ═════════════ */
const collapse: ScenarioDef = {
  type: 'collapse',
  title: 'Обрушение здания',
  create(seed) {
    const r = rng(seed);
    const trapped = r.int(3, 5);
    return {
      title: 'Частичное обрушение жилого дома',
      briefing: `г. Караганда (учебный сценарий). После хлопка обрушилась часть подъезда 5-этажного кирпичного дома. Под завалом могут находиться люди. Запах газа. Уцелевшие стены имеют трещины. У вас поисково-спасательная группа: 10 человек, АСА, комплект упоров.`,
      brief: {
        place: 'г. Караганда, 5-этажный кирпичный дом, подъезд № 3 (учебный)',
        time: '07:25, утро',
        weather: '+4 °C, без осадков',
        people: 'Со слов жильцов — в квартирах 1–3 этажей оставались люди',
        hazards: ['Запах газа', 'Трещины в уцелевших стенах', 'Угроза повторного обрушения', 'Пыль, ограниченная видимость'],
        forces: ['Поисково-спасательная группа, 10 человек', '1 АСА', 'Комплект упоров и клиньев', 'Кинологи — по запросу'],
      },
      conditions: [{ label: 'Здание', value: '5 эт., кирпич' }, { label: 'Запах газа', value: 'есть' }, { label: 'Трещины в стенах', value: 'да' }, { label: 'Под завалом', value: 'уточняется' }],
      timeLimit: 70,
      victims: { total: trapped, known: 0, atRisk: trapped, rescued: 0, lost: 0, revealed: false },
      vars: { stability: 35, located: 0, crewRisk: 8, health: 100, aftershock: r.int(12, 20) },
      flags: {},
      resources: [{ name: 'Спасатели', total: 10, committed: 0 }, { name: 'АСА', total: 1, committed: 0 }, { name: 'Кинологические расчеты', total: 0, committed: 0 }],
    };
  },
  evaluate(s, a) {
    const v = s.vars; const f = s.flags;
    switch (a) {
      case 'recon':
        if (f.recon) return meh('Оценка ведется.');
        f.recon = true;
        log(s, 'report', 'Оценка: уцелевшая стена лестничной клетки с наклоном, возможно повторное обрушение. Жильцы сообщают, что в квартирах 1–3 этажей оставались люди.');
        return ok('Проведена оценка обстановки и устойчивости конструкций.');
      case 'power_off':
        if (f.power) return meh('Коммуникации уже отключены.');
        f.power = true;
        return ok('Газ, электричество и вода отключены.');
      case 'stabilize':
        if (f.stab) return meh('Крепление выполнено.');
        f.stab = true; v.stability = clamp(v.stability + 40);
        return ok('Опасная стена раскреплена упорами, установлены подпорки.');
      case 'escape':
        if (f.observer) return meh('Наблюдатель уже выставлен.');
        f.observer = true; v.crewRisk = clamp(v.crewRisk - 8);
        return ok('Выставлен наблюдатель, определены сигнал и пути отхода.', false);
      case 'search': {
        if (v.located >= s.victims.total) return meh('Все места нахождения людей установлены.');
        const k = Math.min(2, s.victims.total - v.located); v.located += k; s.victims.revealed = true; s.victims.known = Math.max(s.victims.known, v.located);
        log(s, 'report', `Поиск (акустика / «минута тишины»): установлено местонахождение еще ${k} чел.`);
        return ok(`Найдено ${k} мест нахождения пострадавших, места промаркированы.`);
      }
      case 'rescue': case 'extricate': {
        if (s.victims.atRisk === 0) return meh('Все пострадавшие извлечены.');
        if (!f.stab) { v.crewRisk = clamp(v.crewRisk + 30); return viol('Работы под неустойчивыми конструкциями без крепления.'); }
        const available = v.located - s.victims.rescued - s.victims.lost;
        if (available <= 0) return bad('Разбор завала вслепую: место нахождения людей не установлено.');
        const k = rescue(s, Math.min(available, f.reinforced ? 2 : 1));
        log(s, 'improvement', `Из завала извлечено ${k} чел.`);
        return ok(`Извлечено ${k} чел.${f.medical ? '' : ' Нужны медики: синдром длительного сдавления.'}`);
      }
      case 'heavy':
        if (v.located < s.victims.total) { v.health -= 25; return bad('Тяжелая техника до завершения поиска — возможно травмирование людей под завалом.'); }
        return meh('Тяжелая техника разбирает завал после маркировки мест нахождения людей.');
      case 'medical':
        if (f.medical) return meh('Медики уже на месте.');
        f.medical = true; v.health = Math.min(100, v.health + 10);
        return ok('Медики готовы к оказанию помощи при синдроме длительного сдавления.', false);
      case 'reinforce':
        if (f.reinforce) return meh('Силы уже в пути.');
        f.reinforce = true; schedule(s, 9, 'reinforce_arrive');
        return ok('Запрошены кинологи и дополнительная группа.');
      case 'drone': return meh('БПЛА показывает общий вид завала.');
      case 'hq': return once(s, 'hq') ? ok('Доклад в ЦУКС.', false) : meh('Доклад уже был.');
      case 'wait': return bad('Потеря времени: в первые часы выживаемость под завалом максимальна.');
      default: return null;
    }
  },
  minute(s) {
    const v = s.vars; const f = s.flags;
    if (s.victims.atRisk > 0) {
      v.health -= 1.3;
      if (v.health <= 0) { v.health = 60; loseVictim(s, 'Под завалом перестал отвечать один из пострадавших.'); }
    }
    if (!f.power && s.clock >= 8 && once(s, 'gas')) { v.crewRisk = clamp(v.crewRisk + 20); log(s, 'escalation', 'Усилился запах газа в зоне работ — газ не отключен.'); }
    if (s.clock >= v.aftershock && once(s, 'aftershock')) {
      if (f.stab) log(s, 'info', 'Повторное обрушение части перекрытия — крепление удержало стену, л/с не пострадал.');
      else { v.crewRisk = clamp(v.crewRisk + (f.observer ? 30 : 60)); log(s, 'escalation', 'Повторное обрушение! Незакрепленная стена рухнула в зону работ.'); }
    }
    if (v.crewRisk >= 100 && once(s, 'crew')) injureCrew(s, 'Спасатель травмирован при повторном обрушении.');
  },
  onEvent(s, id) {
    if (id === 'reinforce_arrive') { s.flags.reinforced = true; addRes(s, 'Кинологические расчеты', 2); addRes(s, 'Спасатели', 8); log(s, 'improvement', 'Прибыли 2 кинологических расчета и группа спасателей.'); s.vars.located = Math.min(s.victims.total, s.vars.located + 1); }
  },
  gauges: (s) => [
    { key: 'stability', label: 'Устойчивость конструкций', value: s.vars.stability, invert: true },
    { key: 'health', label: 'Состояние пострадавших', value: clamp(s.vars.health), invert: true },
    { key: 'crew', label: 'Риск для л/с', value: s.vars.crewRisk },
  ],
  situation(s) {
    const v = s.vars;
    return `${s.flags.stab ? 'Опасная стена раскреплена.' : 'Уцелевшая стена с наклоном, возможно повторное обрушение.'} Найдено мест нахождения людей: ${v.located}. Извлечено: ${s.victims.rescued}. ${s.flags.power ? '' : 'Газ не отключен.'}`.trim();
  },
  scene(s) {
    const v = s.vars; const f = s.flags;
    return {
      zones: [{ kind: 'debris', x: 50, y: 70, rx: 18, ry: 12, opacity: 0.7 }, { kind: 'smoke', x: 52, y: 52, rx: 16, ry: 8, opacity: 0.2 }],
      lines: [{ kind: 'building', points: [[20, 85], [20, 25], [38, 25], [38, 60]] }, { kind: 'building', points: [[62, 50], [62, 25], [80, 25], [80, 85]], label: f.stab ? 'стена раскреплена' : 'трещины' }],
      markers: [
        ...Array.from({ length: Math.max(0, v.located - s.victims.rescued - s.victims.lost) }, (_, i) => ({ kind: 'victims' as const, x: 42 + i * 8, y: 72, label: 'Найден', state: 'danger' as const })),
        { kind: 'unit', x: 10, y: 90, label: 'АСА' },
        ...(f.observer ? [{ kind: 'hq' as const, x: 90, y: 90, label: 'Наблюдатель' }] : []),
        ...(!f.power ? [{ kind: 'hazard' as const, x: 30, y: 50, label: 'Запах газа', state: 'danger' as const }] : []),
        ...(f.medical ? [{ kind: 'medical' as const, x: 90, y: 60, label: 'СМП' }] : []),
      ],
    };
  },
  commands: ['Оценить устойчивость конструкций', 'Отключить газ и электричество', 'Раскрепить стену упорами', 'Выставить наблюдателя и определить пути отхода',
    'Провести поиск: минута тишины и акустика', 'Извлекать пострадавших вручную', 'Подогнать экскаватор для разбора завала', 'Вызвать медиков', 'Запросить кинологов', 'Доложить в ЦУКС'],
  resolved: (s) => (s.victims.atRisk === 0 ? 'Все пострадавшие извлечены из-под завала.' : null),
  failed: (s) => (s.crewInjured > 0 ? 'Травмирован личный состав.' : null),
};

/* ═════════════ 5. Степной пожар (полный сценарий, RU/KZ/EN) ═════════════
 * Скрытые факты: чабанская точка с людьми на пути огня, неисправность АЦ-3 (seed),
 * время смены ветра. События: переход через дорогу, задымление трассы (ДТП),
 * провис ЛЭП, нехватка воды, тепловое истощение л/с, смена ветра, выход к аулу.
 */
const steppeFire: ScenarioDef = {
  type: 'steppe_fire',
  title: 'Степной пожар',
  create(seed, lang) {
    const r = rng(seed);
    const dist = r.int(42, 52) / 10;
    const chaban = r.int(3, 5);
    const km = dist.toFixed(1).replace('.', lang === 'en' ? '.' : ',');
    const t = (v: L3) => tx(lang, v);
    return {
      title: t(L('Степной пожар у населенного пункта', 'Елді мекен маңындағы дала өрті', 'Steppe fire near a village')),
      briefing: fill(t(L(
        'Горит сухая степная растительность на площади ≈ 60 га. Юго-западный ветер 12 м/с, порывы до 17. Фронт огня движется к аулу (≈ 180 жителей), до окраины {km} км. Вдоль кромки проходит ЛЭП 10 кВ, в 2 км восточнее — трасса. Сил мало: 3 АЦ повышенной проходимости и 14 человек. Вы — РТП.',
        'Шамамен 60 га аумақта құрғақ дала өсімдігі жанып жатыр. Оңтүстік-батыс желі 12 м/с, екпіні 17 м/с-қа дейін. Өрт шебі ауылға (≈ 180 тұрғын) қарай жылжуда, шетіне дейін {km} км. Жиек бойымен 10 кВ ЭБЖ өтеді, 2 км шығыста — трасса. Күш аз: жүрісі жоғары 3 АЦ және 14 адам. Сіз — өрт сөндіру басшысысыз (ӨСБ).',
        'Dry steppe vegetation is burning over ≈ 60 ha. South-westerly wind 12 m/s, gusting to 17. The fire front is moving towards a village (≈ 180 residents), {km} km from its edge. A 10 kV power line runs along the fire edge; a highway lies 2 km to the east. Forces are limited: 3 off-road engines and 14 personnel. You are the incident commander.')), { km }),
      brief: {
        place: t(L('Карагандинская обл., степь у аула Жанаталап (вымышленный, учебный)', 'Қарағанды облысы, Жаңаталап ауылы маңындағы дала (ойдан шығарылған, оқу)', 'Karaganda Region, steppe near the village of Zhanatalap (fictional, training)')),
        time: t(L('15:40, сентябрь; до заката ≈ 3 ч', '15:40, қыркүйек; күн батқанға дейін ≈ 3 сағ', '15:40, September; ≈ 3 h until sunset')),
        weather: t(L('+27 °C, влажность 18 %, ветер ЮЗ 12 м/с, порывы до 17 м/с; метеослужба не исключает смену ветра', '+27 °C, ылғалдылық 18 %, жел ОБ 12 м/с, екпіні 17 м/с-қа дейін; метеоқызмет желдің ауысуын жоққа шығармайды', '+27 °C, humidity 18 %, wind SW 12 m/s, gusts to 17 m/s; forecasters do not rule out a wind shift')),
        people: t(L('Аул ≈ 180 жителей; сведения о людях в степи отсутствуют', 'Ауыл ≈ 180 тұрғын; даладағы адамдар туралы мәлімет жоқ', 'Village ≈ 180 residents; no information about people in the steppe')),
        hazards: [
          t(L('Сухая трава и камыш — высокая скорость распространения', 'Құрғақ шөп пен қамыс — таралу жылдамдығы жоғары', 'Dry grass and reeds — rapid rate of spread')),
          t(L('ЛЭП 10 кВ вдоль кромки', 'Жиек бойындағы 10 кВ ЭБЖ', '10 kV power line along the fire edge')),
          t(L('Трасса с интенсивным движением в зоне задымления', 'Түтін аймағындағы қозғалысы қарқынды трасса', 'Busy highway in the smoke zone')),
          t(L('Возможная смена направления ветра', 'Жел бағытының ауысуы мүмкін', 'Possible change of wind direction')),
        ],
        forces: [
          t(L('3 АЦ повышенной проходимости (по 3–5 т воды)', 'Жүрісі жоғары 3 АЦ (әрқайсысы 3–5 т су)', '3 off-road engines (3–5 t of water each)')),
          t(L('14 человек личного состава', 'Жеке құрам — 14 адам', '14 personnel')),
          t(L('1 БПЛА', '1 ҰҰА', '1 drone')),
          t(L('Трактор с плугом — по запросу через акимат', 'Соқалы трактор — әкімдік арқылы сұрау бойынша', 'Tractor with plough — on request via the akimat')),
          t(L('Резерв области — по запросу, прибытие ≈ 10 мин', 'Облыс резерві — сұрау бойынша, келуі ≈ 10 мин', 'Regional reserve — on request, arrival ≈ 10 min')),
        ],
      },
      conditions: [
        { label: t(L('Ветер', 'Жел', 'Wind')), value: t(L('ЮЗ 12 м/с, порывы 17', 'ОБ 12 м/с, екпіні 17', 'SW 12 m/s, gusts 17')) },
        { label: t(L('До аула', 'Ауылға дейін', 'To village')), value: `${km} km` },
        { label: t(L('Площадь', 'Аумақ', 'Area')), value: '≈ 60 ha' },
        { label: t(L('ЛЭП', 'ЭБЖ', 'Power line')), value: t(L('под напряжением', 'кернеулі', 'energised')) },
      ],
      timeLimit: 60,
      victims: { total: 180 + chaban, known: 180, atRisk: 180 + chaban, rescued: 0, lost: 0, revealed: false },
      vars: { vill: 180, distance: dist, start: dist, contain: 0, crewRisk: 8, windShift: r.int(13, 19), speed: 0.12, water: 100, heat: 0, chaban, chabanSafe: 0, windDeg: 45 },
      flags: { truckFault: r.chance(0.5) },
      resources: [
        { name: 'АЦ', label: t(L('АЦ', 'АЦ', 'Engines')), total: 3, committed: 0 },
        { name: 'Личный состав', label: t(L('Личный состав', 'Жеке құрам', 'Personnel')), total: 14, committed: 0 },
        { name: 'БПЛА', label: t(L('БПЛА', 'ҰҰА', 'Drone')), total: 1, committed: 0 },
        { name: 'Техника для опашки', label: t(L('Техника для опашки', 'Жер жыртатын техника', 'Ploughing machinery')), total: 0, committed: 0 },
      ],
    };
  },
  evaluate(s, a) {
    const v = s.vars; const f = s.flags;
    const progress = v.start - v.distance;
    switch (a) {
      case 'recon': case 'drone': {
        if (f.recon) return meh(L('Разведка ведется непрерывно, контур обновлен.', 'Барлау үздіксіз жүргізілуде, контур жаңартылды.', 'Reconnaissance is continuous; the perimeter has been updated.'));
        f.recon = true; commit(s, 'БПЛА', 1);
        log(s, 'report', fill(tx(s.lang, L(
          'БПЛА: фронт шириной 1,8 км, правый фланг выходит к грунтовой дороге. В 1,5 км по ходу огня — чабанская точка, у кошары {n} человека и скот. У аула вдоль ручья — сухой камыш.',
          'ҰҰА: шептің ені 1,8 км, оң қапталы қара жолға шығып келеді. Өрт жолында 1,5 км жерде — шопан қонысы, қорада {n} адам және мал бар. Ауыл маңында бұлақ бойында — құрғақ қамыс.',
          'Drone: the front is 1.8 km wide; the right flank is reaching a dirt road. 1.5 km ahead of the fire is a shepherd camp with {n} people and livestock at the pen. Dry reeds line the stream by the village.')), { n: v.chaban }));
        s.victims.revealed = true; s.victims.known = s.victims.total;
        return a === 'drone'
          ? ok(L('БПЛА поднят: обнаружены люди на чабанской точке, уточнены фронт и фланги.', 'ҰҰА көтерілді: шопан қонысында адамдар табылды, шеп пен қапталдар нақтыланды.', 'Drone launched: people found at the shepherd camp; front and flanks confirmed.'))
          : ok(L('Разведка: определены фронт, фланги, люди на чабанской точке.', 'Барлау: шеп, қапталдар және шопан қонысындағы адамдар анықталды.', 'Reconnaissance: front, flanks and people at the shepherd camp identified.'));
      }
      case 'rescue': {
        if (v.chabanSafe) return meh(L('Люди с чабанской точки уже выведены.', 'Шопан қонысындағы адамдар шығарылып қойған.', 'The people at the shepherd camp have already been evacuated.'));
        if (!s.victims.revealed) return bad(L('Спасательная группа направлена без разведки — куда именно, неизвестно.', 'Құтқару тобы барлаусыз жіберілді — нақты қайда екені белгісіз.', 'A rescue team was sent without reconnaissance — nobody knows where to.'));
        if (progress >= 1.4) { v.crewRisk = clamp(v.crewRisk + 20); }
        v.chabanSafe = 1; rescue(s, v.chaban); commit(s, 'АЦ', 1);
        log(s, 'improvement', fill(tx(s.lang, L('Люди с чабанской точки ({n} чел.) вывезены за минерализованную дорогу.', 'Шопан қонысындағы адамдар ({n} адам) минералданған жолдан әрі шығарылды.', 'The people from the shepherd camp ({n}) were taken beyond the dirt road.')), { n: v.chaban }));
        return progress >= 1.4
          ? meh(L('Люди выведены, но огонь уже подошел вплотную — расчет рисковал.', 'Адамдар шығарылды, бірақ өрт жақын келіп қалған еді — есеп тәуекелге барды.', 'People were evacuated, but the fire was already close — the crew took a risk.'))
          : ok(L('Люди с чабанской точки выведены до подхода огня.', 'Шопан қонысындағы адамдар өрт жеткенге дейін шығарылды.', 'People at the shepherd camp were evacuated before the fire arrived.'));
      }
      case 'escape':
        if (f.escape) return meh(L('Пути отхода уже определены.', 'Шегіну жолдары анықталып қойған.', 'Escape routes are already set.'));
        f.escape = true; v.crewRisk = clamp(v.crewRisk - 6);
        return ok(L('Определены пути отхода на выгоревшую площадь и точки сбора, доведены до всех расчетов.', 'Күйген аумаққа шегіну жолдары мен жиналу нүктелері анықталып, барлық есептерге жеткізілді.', 'Escape routes into the burnt area and assembly points are set and briefed to all crews.'));
      case 'flank':
        if (f.flank) { v.contain = clamp(v.contain + 5); return meh(L('Расчеты продолжают работу на флангах.', 'Есептер қапталдарда жұмысты жалғастыруда.', 'Crews continue working the flanks.')); }
        f.flank = true; v.contain = clamp(v.contain + 14); commit(s, 'АЦ', 2); commit(s, 'Личный состав', 8);
        if (!f.escape) { v.crewRisk = clamp(v.crewRisk + 12); return meh(L('Тушение кромки с флангов начато, но пути отхода не определены.', 'Жиекті қапталдан сөндіру басталды, бірақ шегіну жолдары анықталмаған.', 'Flank attack started, but escape routes have not been set.')); }
        return ok(L('Расчеты гасят кромку от тыла к фронту по флангам, сужая фронт.', 'Есептер жиекті тылдан шепке қарай қапталдар бойымен сөндіріп, шепті тарылтуда.', 'Crews work the flanks from the rear towards the head, narrowing the front.'));
      case 'front':
        v.crewRisk = clamp(v.crewRisk + 25);
        return f.escape
          ? bad(L('Атака фронта при ветре 12 м/с неэффективна: огонь обходит АЦ, вода расходуется впустую.', '12 м/с желде шепке шабуыл тиімсіз: өрт АЦ-ны айналып өтеді, су бекер жұмсалады.', 'A frontal attack in a 12 m/s wind is ineffective: the fire outflanks the engines and water is wasted.'))
          : viol(L('Атака фронта с подветренной стороны без путей отхода — угроза окружения огнем.', 'Шегіну жолдарынсыз желдің ығынан шепке шабуыл — өрттің қоршап алу қаупі.', 'Frontal attack from downwind without escape routes — risk of being encircled by fire.'));
      case 'firebreak':
        if (!f.plough) { f.plough = true; schedule(s, 4, 'plough_arrive'); return ok(L('Через акимат вызван трактор с плугом — прокладка минерализованной полосы перед аулом начнется через ≈ 4 мин.', 'Әкімдік арқылы соқалы трактор шақырылды — ауыл алдында минералданған жолақ салу ≈ 4 минуттан кейін басталады.', 'A tractor with a plough has been called via the akimat — a firebreak in front of the village will start in ≈ 4 min.')); }
        if (f.firebreak) { v.contain = clamp(v.contain + 6); return meh(L('Минерализованная полоса расширяется.', 'Минералданған жолақ кеңейтілуде.', 'The firebreak is being widened.')); }
        return meh(L('Трактор еще в пути.', 'Трактор әлі жолда.', 'The tractor is still en route.'));
      case 'backfire':
        if (!f.firebreak || !f.recon) {
          v.crewRisk = clamp(v.crewRisk + 20); v.contain = clamp(v.contain - 8);
          log(s, 'escalation', L('Отжиг без опорной полосы: огонь от пала ушел по ветру и создал второй очаг.', 'Тірек жолағынсыз күйдіру: өрт жел бойымен кетіп, екінші ошақ пайда болды.', 'Burn-out without an anchor line: the fire ran with the wind and created a second fire.'));
          return viol(L('Встречный пал без опорной минерализованной полосы и разведки при сильном ветре.', 'Күшті желде тірек минералданған жолақсыз және барлаусыз қарсы өрт.', 'Backfire without an anchoring firebreak or reconnaissance in strong wind.'));
        }
        if (f.backfire) return meh(L('Отжиг уже выполнен.', 'Күйдіру орындалып қойған.', 'The burn-out is already done.'));
        f.backfire = true; v.contain = clamp(v.contain + 25); v.speed *= 0.6;
        return ok(L('Отжиг от минерализованной полосы под контролем расчетов — перед аулом создана выгоревшая полоса.', 'Есептердің бақылауымен минералданған жолақтан күйдіру — ауыл алдында күйген жолақ жасалды.', 'Controlled burn-out from the firebreak — a burnt buffer strip now protects the village.'));
      case 'evacuate':
        if (f.evac) return meh(L('Эвакуация уже идет.', 'Эвакуация жүріп жатыр.', 'Evacuation is already under way.'));
        f.evac = true; schedule(s, 12, 'evac_done');
        return ok(L('Совместно с акиматом: оповещение и эвакуация жителей аула в школу соседнего села.', 'Әкімдікпен бірлесіп: ауыл тұрғындарын хабарлау және көрші ауылдың мектебіне көшіру.', 'Together with the akimat: warning and evacuation of residents to the school in the neighbouring village.'));
      case 'water_supply':
        if (f.supply) return meh(L('Подвоз воды уже организован.', 'Су тасымалдау ұйымдастырылып қойған.', 'Water shuttle is already organised.'));
        f.supply = true; v.water = Math.max(v.water, 60);
        return ok(L('Организован подвоз воды (водовозка акимата) и дозаправка у ручья.', 'Су тасымалдау (әкімдік су тасығышы) және бұлақ жанында толтыру ұйымдастырылды.', 'Water shuttle organised (akimat tanker) with refilling at the stream.'));
      case 'water':
        v.contain = clamp(v.contain + 4); v.water = Math.max(0, v.water - 10);
        return meh(L('Стволы работают по кромке; расход воды растет.', 'Оқпандар жиек бойымен жұмыс істеуде; су шығыны өсуде.', 'Hose lines are working the edge; water use is rising.'));
      case 'power_off':
        if (f.power) return meh(L('ЛЭП уже отключена.', 'ЭБЖ ажыратылып қойған.', 'The power line is already off.'));
        f.power = true;
        return ok(L('Через диспетчера электросетей ЛЭП 10 кВ отключена и заземлена.', 'Электр желілерінің диспетчері арқылы 10 кВ ЭБЖ ажыратылып, жерге қосылды.', 'Through the grid dispatcher the 10 kV line has been de-energised and earthed.'));
      case 'cordon':
        if (f.cordon) return meh(L('Трасса уже перекрыта.', 'Трасса жабылып қойған.', 'The highway is already closed.'));
        f.cordon = true;
        return ok(L('Совместно с полицией перекрыт участок трассы в зоне задымления, организован объезд.', 'Полициямен бірлесіп түтін аймағындағы трасса учаскесі жабылып, айналма жол ұйымдастырылды.', 'With the police, the smoke-affected stretch of highway has been closed and a detour set up.'));
      case 'rotation':
        if (f.rotation) return meh(L('Ротация уже организована.', 'Ротация ұйымдастырылып қойған.', 'Rotation is already organised.'));
        f.rotation = true; v.heat = Math.max(0, v.heat - 30);
        return ok(L('Организована ротация расчетов и питьевой режим.', 'Есептердің ротациясы және ауыз су режимі ұйымдастырылды.', 'Crew rotation and hydration have been organised.'), false);
      case 'tactic':
        if (!f.shifted) return meh(L('Тактика скорректирована, но обстановка пока этого не требовала.', 'Тактика түзетілді, бірақ жағдай әзірге мұны талап етпеді.', 'Tactics adjusted, although the situation did not yet require it.'));
        if (f.regroup) return meh(L('Силы уже перегруппированы.', 'Күштер қайта топтастырылып қойған.', 'Forces are already regrouped.'));
        f.regroup = true; v.speed /= 1.3; v.contain = clamp(v.contain + 6);
        return ok(L('После смены ветра силы перегруппированы на новое направление распространения.', 'Жел ауысқаннан кейін күштер таралудың жаңа бағытына қайта топтастырылды.', 'After the wind shift, forces were regrouped onto the new direction of spread.'));
      case 'medical':
        if (f.medical) return meh(L('Бригада СМП уже у штаба.', 'ЖМК бригадасы штабтың жанында.', 'An ambulance crew is already at the command post.'));
        f.medical = true;
        return f.roadCrash || s.crewInjured
          ? ok(L('Бригады СМП направлены к пострадавшим.', 'ЖМК бригадалары зардап шеккендерге жіберілді.', 'Ambulance crews have been sent to the casualties.'))
          : meh(L('Бригада СМП дежурит у штаба.', 'ЖМК бригадасы штаб жанында кезекшілікте.', 'An ambulance crew is on standby at the command post.'));
      case 'reinforce':
        if (f.reinforce) return meh(L('Силы уже в пути.', 'Күштер жолда.', 'Forces are already en route.'));
        f.reinforce = true; schedule(s, 10, 'reinforce_arrive');
        return ok(L('Запрошены дополнительные АЦ из резерва области и добровольная пожарная дружина.', 'Облыс резервінен қосымша АЦ және ерікті өрт сөндіру жасағы сұралды.', 'Additional engines from the regional reserve and a volunteer fire brigade have been requested.'));
      case 'hq':
        return once(s, 'hq')
          ? ok(L('Обстановка доложена в ЦУКС, запрошена координация с акиматом и полицией.', 'Жағдай ДЖБО-ға баяндалды, әкімдікпен және полициямен үйлестіру сұралды.', 'Situation reported to the crisis centre; coordination with the akimat and police requested.'), false)
          : meh(L('Доклад уже был — докладывайте при изменении обстановки.', 'Баяндама болды — жағдай өзгергенде баяндаңыз.', 'You have already reported — report again when the situation changes.'));
      case 'wait': return bad(L('Бездействие: фронт приближается к аулу.', 'Әрекетсіздік: шеп ауылға жақындап келеді.', 'Inaction: the front is approaching the village.'));
      default: return null;
    }
  },
  minute(s) {
    const v = s.vars; const f = s.flags;
    v.distance = Math.max(0, v.distance - v.speed * (1 - v.contain / 110));
    const progress = v.start - v.distance;
    if (f.flank) {
      v.water = Math.max(0, v.water - (f.supply ? 1 : 4));
      if (v.water > 0) v.contain = clamp(v.contain + 1.3 + (f.reinforced ? 1.4 : 0) + (f.firebreak ? 0.6 : 0));
      else if (once(s, 'nowater')) { v.contain = clamp(v.contain - 10); log(s, 'escalation', L('Два АЦ израсходовали воду и ушли на дозаправку за 6 км — кромка на левом фланге снова разгорается.', 'Екі АЦ суды жұмсап, 6 км жерге толтыруға кетті — сол қапталдағы жиек қайта өршуде.', 'Two engines ran out of water and left to refill 6 km away — the left flank is flaring up again.')); }
      v.heat += f.rotation ? 0.5 : 2;
    }
    if (f.truckFault && s.clock >= 7 && once(s, 'truck')) { const r = s.resources.find((x) => x.name === 'АЦ'); if (r) r.total -= 1; log(s, 'escalation', L('АЦ-3 застряла в балке, выведена из работы. Сил стало меньше.', 'АЦ-3 сайда батып қалды, жұмыстан шығарылды. Күш азайды.', 'Engine 3 is stuck in a gully and out of action. Fewer forces remain.')); }
    if (s.clock >= 3 && !f.recon && once(s, 'witness')) log(s, 'radio', L('Очевидцы: огонь перешел грунтовую дорогу, дым тянет в сторону трассы.', 'Куәгерлер: өрт қара жолдан өтті, түтін трассаға қарай тартуда.', 'Witnesses: the fire has crossed a dirt road; smoke is drifting towards the highway.'));
    if (progress >= 0.8 && !v.chabanSafe && once(s, 'call112')) {
      s.victims.revealed = true; s.victims.known = s.victims.total;
      log(s, 'radio', fill(tx(s.lang, L('Звонок 112: на чабанской точке у урочища остались {n} человека, машина не заводится.', '112 қоңырауы: шатқал маңындағы шопан қонысында {n} адам қалды, көлік оталмайды.', '112 call: {n} people are stuck at the shepherd camp by the gully; their vehicle will not start.')), { n: v.chaban }));
    }
    if (progress >= 1.6 && !v.chabanSafe && once(s, 'chaban')) {
      loseVictim(s, L('Огонь прошел через чабанскую точку: люди не были выведены вовремя, один человек погиб.', 'Өрт шопан қонысы арқылы өтті: адамдар уақытында шығарылмады, бір адам қаза тапты.', 'The fire swept through the shepherd camp: people were not evacuated in time; one person died.'));
      v.chabanSafe = 1; rescue(s, v.chaban - 1);
      log(s, 'info', fill(tx(s.lang, L('Остальные {n} чел. с чабанской точки выбрались сами с ожогами.', 'Шопан қонысындағы қалған {n} адам күйік алып, өздері шықты.', 'The remaining {n} people from the camp escaped on their own with burns.')), { n: v.chaban - 1 }));
    }
    if (s.clock >= 10 && !f.cordon && once(s, 'road')) { f.roadCrash = true; s.victims.total += 2; s.victims.atRisk += 2; log(s, 'escalation', L('Дым накрыл трассу: столкновение двух автомобилей, 2 пострадавших. Трасса не была перекрыта.', 'Түтін трассаны жапты: екі көлік соқтығысты, 2 зардап шеккен. Трасса жабылмаған еді.', 'Smoke covered the highway: two cars collided, 2 casualties. The road had not been closed.')); }
    if (f.roadCrash && f.medical && once(s, 'roadMed')) { rescue(s, 2); log(s, 'improvement', L('Пострадавшие в ДТП на трассе переданы бригаде СМП.', 'Трассадағы ЖКО зардап шеккендері ЖМК бригадасына тапсырылды.', 'The highway crash casualties have been handed over to an ambulance crew.')); }
    if (s.clock >= v.windShift && once(s, 'shift')) {
      f.shifted = true; v.speed *= 1.3; v.windDeg = 90;
      if (f.escape) log(s, 'info', L('Ветер сменился на западный, 15 м/с. Расчеты отошли по заранее определенным путям.', 'Жел батысқа ауысты, 15 м/с. Есептер алдын ала анықталған жолдармен шегінді.', 'The wind has shifted to westerly, 15 m/s. Crews withdrew along the pre-planned routes.'));
      else { v.crewRisk = clamp(v.crewRisk + 50); log(s, 'escalation', L('Резкая смена ветра! Огонь обходит расчет на правом фланге, АЦ отходит через горящую траву.', 'Жел күрт ауысты! Өрт оң қапталдағы есепті айналып өтуде, АЦ жанып жатқан шөп арқылы шегінуде.', 'Sudden wind shift! The fire is outflanking the crew on the right flank; the engine is retreating through burning grass.')); }
    }
    if (!f.power && f.flank && s.clock > 16 && once(s, 'lep')) { v.crewRisk = clamp(v.crewRisk + 15); log(s, 'escalation', L('Провисание провода ЛЭП над кромкой в дыму — расчет в 20 м от провода. ЛЭП не отключена.', 'Түтін ішінде жиек үстінде ЭБЖ сымы салбырап тұр — есеп сымнан 20 м жерде. ЭБЖ ажыратылмаған.', 'A power line wire is sagging over the fire edge in the smoke — a crew is 20 m away. The line is still live.')); }
    if (!f.firebreak && progress >= 2.4 && once(s, 'spot')) { v.contain = clamp(v.contain - 12); log(s, 'escalation', L('Искры перебросили огонь через грунтовую дорогу — новый очаг в камыше у ручья.', 'Ұшқындар өртті қара жолдан асырып жіберді — бұлақ жанындағы қамыста жаңа ошақ.', 'Embers carried the fire across the dirt road — a new fire in the reeds by the stream.')); }
    if (v.heat >= 40 && once(s, 'heat')) { v.crewRisk = clamp(v.crewRisk + 18); log(s, 'escalation', L('Тепловое истощение у пожарного второго расчета: ротация и питьевой режим не организованы.', 'Екінші есептің өрт сөндірушісінде жылу әлсіздігі: ротация және ауыз су режимі ұйымдастырылмаған.', 'A firefighter in the second crew has heat exhaustion: no rotation or hydration was organised.')); }
    if (v.distance < 1.5 && once(s, 'near')) log(s, 'radio', L('Аким аула: «Огонь в полутора километрах, люди выходят на улицы!»', 'Ауыл әкімі: «Өрт бір жарым шақырым жерде, адамдар көшеге шығып жатыр!»', 'Village akim: "The fire is a kilometre and a half away, people are pouring into the streets!"'));
    if (v.distance <= 0 && once(s, 'village')) {
      if (f.evacDone) { log(s, 'escalation', L('Огонь вышел к окраине аула: сгорели хозпостройки, жители эвакуированы.', 'Өрт ауылдың шетіне шықты: шаруашылық құрылыстары өртенді, тұрғындар көшірілген.', 'The fire reached the edge of the village: outbuildings burned; residents had been evacuated.')); }
      else {
        for (let i = 0; i < 3; i++) loseVictim(s, L('Огонь вошел в аул: пострадали жители, не успевшие эвакуироваться.', 'Өрт ауылға кірді: көшіп үлгермеген тұрғындар зардап шекті.', 'The fire entered the village: residents who had not evacuated were harmed.'));
        rescue(s, v.vill - 3); v.vill = 0;
      }
    }
    if (v.crewRisk >= 100 && once(s, 'crew')) injureCrew(s, L('Расчет окружен огнем: ожоги у пожарного.', 'Есепті өрт қоршап алды: өрт сөндіруші күйік алды.', 'A crew was encircled by fire: a firefighter suffered burns.'));
  },
  onEvent(s, id) {
    if (id === 'evac_done' && s.vars.vill > 0) {
      s.flags.evacDone = true; rescue(s, s.vars.vill); s.vars.vill = 0;
      log(s, 'improvement', L('Жители аула эвакуированы в безопасный район.', 'Ауыл тұрғындары қауіпсіз ауданға көшірілді.', 'Village residents have been evacuated to a safe area.'));
    }
    if (id === 'plough_arrive') {
      s.flags.firebreak = true; s.vars.contain = clamp(s.vars.contain + 20); s.vars.speed *= 0.6;
      addRes(s, 'Техника для опашки', 1); commit(s, 'Техника для опашки', 1);
      log(s, 'improvement', L('Трактор прибыл: прокладывается минерализованная полоса 2,5 км перед аулом.', 'Трактор келді: ауыл алдында 2,5 км минералданған жолақ салынуда.', 'The tractor has arrived: a 2.5 km firebreak is being ploughed in front of the village.'));
    }
    if (id === 'reinforce_arrive') {
      s.flags.reinforced = true; addRes(s, 'АЦ', 3); addRes(s, 'Личный состав', 12);
      log(s, 'improvement', L('Прибыли 3 АЦ резерва и добровольная пожарная дружина (12 человек).', 'Резервтің 3 АЦ-сы және ерікті өрт сөндіру жасағы (12 адам) келді.', '3 reserve engines and a volunteer fire brigade (12 people) have arrived.'));
    }
  },
  gauges: (s) => [
    { key: 'contain', label: tx(s.lang, L('Локализация кромки', 'Жиекті оқшаулау', 'Edge contained')), value: s.vars.contain, invert: true },
    { key: 'distance', label: tx(s.lang, L('Близость фронта к аулу', 'Шептің ауылға жақындығы', 'Front proximity to village')), value: clamp(100 - (s.vars.distance / s.vars.start) * 100) },
    { key: 'water', label: tx(s.lang, L('Запас воды в АЦ', 'АЦ-дағы су қоры', 'Water in engines')), value: s.vars.water, invert: true },
    { key: 'crew', label: tx(s.lang, L('Риск для л/с', 'Жеке құрамға қауіп', 'Crew risk')), value: s.vars.crewRisk },
  ],
  situation(s) {
    const v = s.vars; const f = s.flags; const lg = s.lang;
    const eta = v.speed > 0 ? Math.round(v.distance / (v.speed * (1 - v.contain / 110) || 0.01)) : 0;
    const km = v.distance.toFixed(1).replace('.', lg === 'en' ? '.' : ',');
    const parts = [
      fill(tx(lg, L('Фронт в {km} км от аула', 'Шеп ауылдан {km} км жерде', 'The front is {km} km from the village')), { km }) + (v.distance > 0 ? fill(tx(lg, L(' (≈ {m} мин при текущей скорости).', ' (қазіргі жылдамдықпен ≈ {m} мин).', ' (≈ {m} min at the current rate).')), { m: eta }) : '.'),
      fill(tx(lg, L('Локализовано ≈ {p} % кромки.', 'Жиектің ≈ {p} %-ы оқшауланды.', '≈ {p} % of the edge contained.')), { p: Math.round(v.contain) }),
      f.shifted ? tx(lg, L('Ветер западный, 15 м/с.', 'Жел батыстан, 15 м/с.', 'Wind westerly, 15 m/s.')) : tx(lg, L('Ветер ЮЗ, 12 м/с.', 'Жел ОБ, 12 м/с.', 'Wind SW, 12 m/s.')),
      f.evacDone ? tx(lg, L('Жители аула эвакуированы.', 'Ауыл тұрғындары көшірілді.', 'Village residents evacuated.')) : f.evac ? tx(lg, L('Идет эвакуация аула.', 'Ауылды көшіру жүріп жатыр.', 'Village evacuation in progress.')) : tx(lg, L('Жители в ауле.', 'Тұрғындар ауылда.', 'Residents are in the village.')),
      f.power ? '' : tx(lg, L('ЛЭП под напряжением.', 'ЭБЖ кернеулі.', 'Power line live.')),
    ];
    return parts.filter(Boolean).join(' ');
  },
  commands: [
    { label: L('Направить подразделение на разведку', 'Бөлімшені барлауға жіберу', 'Send a unit on reconnaissance'), actions: ['recon'] },
    { label: L('Использовать БПЛА', 'ҰҰА қолдану', 'Launch the drone'), actions: ['drone'] },
    { label: L('Определить пути отхода и точки сбора', 'Шегіну жолдары мен жиналу нүктелерін анықтау', 'Set escape routes and assembly points'), actions: ['escape'] },
    { label: L('Тушить кромку с флангов', 'Жиекті қапталдан сөндіру', 'Attack the edge from the flanks'), actions: ['flank'] },
    { label: L('Атаковать фронт огня', 'Өрт шебіне шабуыл жасау', 'Attack the head of the fire'), actions: ['front'] },
    { label: L('Проложить минерализованную полосу трактором', 'Трактормен минералданған жолақ салу', 'Plough a firebreak with a tractor'), actions: ['firebreak'] },
    { label: L('Выполнить встречный пал', 'Қарсы өрт жасау', 'Carry out a backfire'), actions: ['backfire'] },
    { label: L('Организовать эвакуацию аула', 'Ауылды көшіруді ұйымдастыру', 'Organise evacuation of the village'), actions: ['evacuate'] },
    { label: L('Вывести людей с чабанской точки', 'Шопан қонысынан адамдарды шығару', 'Evacuate people from the shepherd camp'), actions: ['rescue'] },
    { label: L('Организовать подвоз воды', 'Су тасымалдауды ұйымдастыру', 'Organise a water shuttle'), actions: ['water_supply'] },
    { label: L('Запросить отключение ЛЭП', 'ЭБЖ-ны ажыратуды сұрау', 'Request power line shutdown'), actions: ['power_off'] },
    { label: L('Перекрыть трассу с полицией', 'Полициямен трассаны жабу', 'Close the highway with the police'), actions: ['cordon'] },
    { label: L('Организовать ротацию и питьевой режим', 'Ротация және ауыз су режимін ұйымдастыру', 'Organise crew rotation and hydration'), actions: ['rotation'] },
    { label: L('Запросить дополнительные силы', 'Қосымша күштер сұрау', 'Request reinforcements'), actions: ['reinforce'] },
    { label: L('Вызвать медицинскую помощь', 'Медициналық көмек шақыру', 'Call medical support'), actions: ['medical'] },
    { label: L('Доложить руководителю в ЦУКС', 'ДЖБО-дағы басшыға баяндау', 'Report to the crisis centre'), actions: ['hq'] },
    { label: L('Изменить тактику: перегруппировать силы', 'Тактиканы өзгерту: күштерді қайта топтастыру', 'Change tactics: regroup forces'), actions: ['tactic'] },
  ],
  resolved: (s) => (s.vars.contain >= 100
    ? (s.victims.lost === 0 ? L('Кромка локализована, аул и люди защищены.', 'Жиек оқшауланды, ауыл мен адамдар қорғалды.', 'The edge is contained; the village and people are protected.')
      : L('Пожар локализован, но есть погибшие.', 'Өрт оқшауланды, бірақ қаза тапқандар бар.', 'The fire is contained, but there were fatalities.'))
    : null),
  failed: (s) => (s.crewInjured > 0 ? L('Травмирован личный состав.', 'Жеке құрам жарақат алды.', 'Personnel were injured.')
    : s.vars.distance <= 0 && !s.flags.evacDone && s.victims.lost > 0 ? L('Огонь вошел в аул до эвакуации.', 'Өрт эвакуациядан бұрын ауылға кірді.', 'The fire entered the village before evacuation.') : null),
  scene(s) {
    const v = s.vars; const f = s.flags; const t = (x: L3) => tx(s.lang, x);
    const p = (v.start - v.distance) / v.start;
    const fy = 88 - p * 66;
    return {
      wind: { deg: v.windDeg, label: f.shifted ? t(L('З 15 м/с', 'Б 15 м/с', 'W 15 m/s')) : t(L('ЮЗ 12 м/с', 'ОБ 12 м/с', 'SW 12 m/s')) },
      zones: [
        { kind: 'burned', x: 40, y: Math.min(96, fy + 18), rx: 26, ry: Math.max(6, (96 - fy) / 1.6), opacity: 0.55 },
        { kind: 'fire', x: 40 + (f.shifted ? 8 : 0), y: fy, rx: Math.max(6, 24 * (1 - v.contain / 100)), ry: 5, opacity: 0.85 },
        { kind: 'smoke', x: 55 + (f.shifted ? 12 : 4), y: fy - 12, rx: 22, ry: 9, opacity: 0.35 },
      ],
      lines: [
        { kind: 'road', points: [[86, 2], [86, 98]], label: t(L('трасса', 'трасса', 'highway')) },
        { kind: 'lep', points: [[8, 95], [18, 55], [30, 10]], label: t(L('ЛЭП 10 кВ', 'ЭБЖ 10 кВ', '10 kV line')) },
        ...(f.firebreak ? [{ kind: 'firebreak' as const, points: [[20, 26], [66, 26]] as [number, number][], label: t(L('мин. полоса', 'мин. жолақ', 'firebreak')) }] : []),
        ...(f.cordon ? [{ kind: 'cordon' as const, points: [[82, 30], [90, 30]] as [number, number][] }] : []),
      ],
      markers: [
        { kind: 'village', x: 44, y: 12, label: t(L('Аул', 'Ауыл', 'Village')) + (f.evacDone ? t(L(' (эвакуирован)', ' (көшірілді)', ' (evacuated)')) : ''), state: f.evacDone ? 'ok' : v.distance < 1.5 ? 'danger' : 'warn' },
        ...(s.victims.revealed ? [{ kind: 'victims' as const, x: 58, y: 65, label: v.chabanSafe ? t(L('Чабанская точка (выведены)', 'Шопан қонысы (шығарылды)', 'Shepherd camp (evacuated)')) : fill(t(L('Чабанская точка: {n} чел.', 'Шопан қонысы: {n} адам', 'Shepherd camp: {n} people')), { n: v.chaban }), state: (v.chabanSafe ? 'ok' : 'danger') as 'ok' | 'danger' }] : []),
        { kind: 'hq', x: 10, y: 30, label: t(L('Штаб РТП', 'ӨСБ штабы', 'Command post')), state: 'ok' },
        ...(f.flank ? [{ kind: 'unit' as const, x: 16, y: fy + 4, label: t(L('АЦ-1 (левый фланг)', 'АЦ-1 (сол қапталы)', 'Engine 1 (left flank)')) }, { kind: 'unit' as const, x: 66, y: fy + 4, label: t(L('АЦ-2 (правый фланг)', 'АЦ-2 (оң қапталы)', 'Engine 2 (right flank)')) }] : [{ kind: 'unit' as const, x: 14, y: 36, label: t(L('АЦ на сборе', 'АЦ жиналу орнында', 'Engines at assembly')) }]),
        ...(f.recon ? [{ kind: 'drone' as const, x: 48, y: fy - 6, label: t(L('БПЛА', 'ҰҰА', 'Drone')) }] : []),
        ...(f.roadCrash ? [{ kind: 'hazard' as const, x: 86, y: 44, label: t(L('ДТП на трассе', 'Трассадағы ЖКО', 'Highway crash')), state: (f.medical ? 'ok' : 'danger') as 'ok' | 'danger' }] : []),
        ...(!f.power ? [{ kind: 'hazard' as const, x: 22, y: 45, label: t(L('ЛЭП под напряжением', 'ЭБЖ кернеулі', 'Live power line')), state: 'warn' as const }] : []),
      ],
    };
  },
};

/* ═════════════ 6. Опасное вещество ═════════════ */
const hazmat: ScenarioDef = {
  type: 'hazmat',
  title: 'Авария с опасным веществом',
  create(seed) {
    const r = rng(seed);
    const workers = r.int(4, 7);
    const sub = r.pick(['аммиак', 'хлор']);
    return {
      title: `Утечка: ${sub}`,
      briefing: `Промзона г. Павлодар (учебный сценарий). На холодильном складе / станции водоподготовки повреждена емкость, ${sub === 'аммиак' ? 'резкий запах аммиака' : 'желто-зеленое облако'}. В цехе остались рабочие. Ветер западный 5 м/с, в 1,2 км по ветру — жилой квартал. У вас 2 АЦ, отделение РХБЗ (6 человек), 4 костюма химзащиты.`,
      brief: {
        place: 'г. Павлодар, промзона, склад / станция водоподготовки (учебный)',
        time: '11:05, рабочая смена',
        weather: 'Ветер западный 5 м/с, +15 °C',
        people: 'В цехе остались рабочие, число уточняется; в 1,2 км по ветру — жилой квартал',
        hazards: [`Выброс: ${sub}`, 'Облако смещается к жилому кварталу', 'Работа без СИЗ недопустима'],
        forces: ['2 АЦ', 'Отделение РХБЗ, 6 человек', '4 костюма химзащиты', 'Второе отделение РХБЗ — по запросу'],
      },
      conditions: [{ label: 'Вещество', value: 'по данным объекта' }, { label: 'Ветер', value: 'З, 5 м/с' }, { label: 'Жилье по ветру', value: '1,2 км' }, { label: 'Рабочие в цехе', value: 'уточняется' }],
      timeLimit: 55,
      victims: { total: workers, known: 0, atRisk: workers, rescued: 0, lost: 0, revealed: false },
      vars: { cloud: 30, crewRisk: 6, health: 100, soluble: sub === 'аммиак' ? 1 : 0 },
      flags: {},
      resources: [{ name: 'АЦ', total: 2, committed: 0 }, { name: 'Костюмы химзащиты', total: 4, committed: 0 }, { name: 'Отделение РХБЗ', total: 6, committed: 0 }],
    };
  },
  evaluate(s, a, input) {
    const v = s.vars; const f = s.flags;
    const entering = ['rescue', 'seal', 'chem_recon'].includes(a);
    if (entering && !f.ppe) {
      v.crewRisk = clamp(v.crewRisk + 35);
      return viol('Вход в зону заражения без средств химической защиты.');
    }
    switch (a) {
      case 'upwind':
        if (f.upwind) return meh('Техника уже с наветренной стороны.');
        f.upwind = true;
        return ok('Техника и штаб развернуты с наветренной стороны.');
      case 'downwind':
        v.crewRisk = clamp(v.crewRisk + 30);
        return viol('Подъезд с подветренной стороны — техника и л/с в облаке.');
      case 'ppe_chem':
        if (f.ppe) return meh('Звено уже в костюмах.');
        f.ppe = true; commit(s, 'Костюмы химзащиты', 4);
        return ok('Звено РХБЗ в изолирующих СИЗОД и костюмах химзащиты.');
      case 'chem_recon': case 'recon':
        if (a === 'recon' && !f.ppe && !f.upwind) { v.crewRisk = clamp(v.crewRisk + 15); return bad('Разведка без химзащиты и без учета ветра — используйте химическую разведку в СИЗ.'); }
        if (f.recon) return meh('Химразведка продолжается.');
        f.recon = true; s.victims.revealed = true; s.victims.known = s.victims.total;
        log(s, 'report', `Химразведка: концентрация у емкости многократно выше допустимой, в цехе ${s.victims.total} рабочих, двое без сознания. Источник — фланцевое соединение, есть задвижка.`);
        return ok('Химразведка: установлены концентрация, источник и люди.');
      case 'cordon':
        if (f.zone) return meh('Зона уже оцеплена.');
        f.zone = true;
        return ok('Установлена зона оцепления, посты на въездах.', false);
      case 'evacuate':
        if (f.evac) return meh('Население уже оповещено.');
        if (/по ветру|по направлению ветра/.test(norm(input))) { f.evac = true; return bad('Эвакуация по направлению ветра выводит людей под облако — выводить перпендикулярно ветру.'); }
        f.evac = true;
        return ok('Оповещение жилого квартала, вывод людей перпендикулярно ветру.');
      case 'rescue': {
        if (s.victims.atRisk === 0) return meh('Все рабочие выведены.');
        const k = rescue(s, f.reinforced ? 3 : 2);
        log(s, 'improvement', `Звено РХБЗ вынесло ${k} рабочих.`);
        return ok(`Выведено ${k} пострадавших.`);
      }
      case 'curtain': case 'water':
        if (f.curtain) return meh('Водяные завесы уже работают.');
        f.curtain = true; commit(s, 'АЦ', 2);
        return v.soluble ? ok('Водяные завесы осаждают облако аммиака.') : meh('Водяные завесы частично снижают распространение хлора.');
      case 'seal':
        if (f.sealed) return meh('Утечка устранена.');
        if (!f.recon) return bad('Попытка устранить утечку без разведки источника.');
        f.sealed = true;
        return ok('Задвижка перекрыта — поступление вещества остановлено.');
      case 'decon':
        if (f.decon) return meh('Пункт обработки уже работает.');
        f.decon = true;
        return ok('Развернут пункт дегазации л/с и техники.', false);
      case 'medical':
        if (f.medical) return meh('Медики уже на месте.');
        f.medical = true; v.health = Math.min(100, v.health + 10);
        return ok('Токсикологические бригады развернуты вне зоны заражения.', false);
      case 'reinforce':
        if (f.reinforce) return meh('Силы уже в пути.');
        f.reinforce = true; schedule(s, 9, 'reinforce_arrive');
        return ok('Запрошено второе отделение РХБЗ.');
      case 'hq': return once(s, 'hq') ? ok('Доклад в ЦУКС, информирование акимата.', false) : meh('Доклад уже был.');
      case 'wait': return bad('Ожидание при продолжающейся утечке.');
      default: return null;
    }
  },
  minute(s) {
    const v = s.vars; const f = s.flags;
    v.cloud = clamp(v.cloud + (f.sealed ? -3 : 1.6) * (f.curtain && v.soluble ? 0.5 : 1));
    if (s.victims.atRisk > 0) {
      v.health -= 2;
      if (v.health <= 0) { v.health = 55; loseVictim(s, 'Рабочий в цехе погиб от отравления.'); }
    }
    if (v.cloud > 65 && !f.evac && once(s, 'residents')) log(s, 'escalation', 'Облако достигло жилого квартала — жители обращаются с признаками отравления.');
    if (!f.upwind && s.clock > 5 && once(s, 'wind')) { v.crewRisk = clamp(v.crewRisk + 12); log(s, 'escalation', 'Порыв ветра накрыл облаком место стоянки техники.'); }
    if (v.crewRisk >= 100 && once(s, 'crew')) injureCrew(s, 'Отравление спасателя.');
  },
  onEvent(s, id) {
    if (id === 'reinforce_arrive') { s.flags.reinforced = true; addRes(s, 'Костюмы химзащиты', 4); addRes(s, 'Отделение РХБЗ', 6); log(s, 'improvement', 'Прибыло второе отделение РХБЗ.'); }
  },
  gauges: (s) => [
    { key: 'cloud', label: 'Распространение облака', value: s.vars.cloud },
    { key: 'health', label: 'Состояние рабочих', value: clamp(s.vars.health), invert: true },
    { key: 'crew', label: 'Риск для л/с', value: s.vars.crewRisk },
  ],
  situation(s) {
    const v = s.vars;
    return `${s.flags.sealed ? 'Утечка перекрыта, облако рассеивается.' : `Утечка продолжается, облако ${v.cloud > 60 ? 'подходит к жилому кварталу' : 'смещается на восток'}.`} ${s.victims.atRisk ? `В цехе ${s.victims.revealed ? s.victims.atRisk : 'неустановленное число'} рабочих.` : 'Все рабочие выведены.'}`;
  },
  scene(s) {
    const v = s.vars; const f = s.flags;
    return {
      wind: { deg: 90, label: 'З 5 м/с' },
      zones: [{ kind: 'cloud', x: 35 + v.cloud / 3, y: 50, rx: 10 + v.cloud / 3, ry: 8 + v.cloud / 8, opacity: 0.45 }],
      lines: [{ kind: 'building', points: [[20, 35], [40, 35], [40, 65], [20, 65]], label: 'цех' }, ...(f.zone ? [{ kind: 'cordon' as const, points: [[10, 20], [10, 80]] as [number, number][] }] : [])],
      markers: [
        { kind: 'hazard', x: 30, y: 50, label: f.sealed ? 'Утечка перекрыта' : 'Источник утечки', state: f.sealed ? 'ok' : 'danger' },
        ...(s.victims.atRisk > 0 ? [{ kind: 'victims' as const, x: 34, y: 42, label: s.victims.revealed ? `Рабочие: ${s.victims.atRisk}` : 'Рабочие?', state: 'danger' as const }] : []),
        { kind: 'village', x: 92, y: 50, label: 'Жилой квартал', state: v.cloud > 65 && !f.evac ? 'danger' : f.evac ? 'ok' : 'warn' },
        { kind: 'unit', x: f.upwind ? 6 : 60, y: 60, label: f.upwind ? 'АЦ (наветренная)' : 'АЦ' },
        ...(f.curtain ? [{ kind: 'water' as const, x: 50, y: 40, label: 'Водяная завеса' }] : []),
        ...(f.decon ? [{ kind: 'medical' as const, x: 6, y: 30, label: 'Пункт дегазации' }] : []),
      ],
    };
  },
  commands: ['Развернуть технику с наветренной стороны', 'Надеть костюмы химзащиты', 'Провести химразведку', 'Оцепить опасную зону', 'Вывести рабочих из цеха',
    'Поставить водяные завесы', 'Перекрыть задвижку утечки', 'Оповестить и эвакуировать жилой квартал', 'Подъехать с подветренной стороны', 'Развернуть пункт дегазации'],
  resolved: (s) => (s.flags.sealed && s.victims.atRisk === 0 ? 'Утечка устранена, все рабочие выведены.' : null),
  failed: (s) => (s.crewInjured > 0 ? 'Травмирован личный состав.' : null),
};

/* ═════════════ 7. Пожар на промышленном объекте (полный сценарий, RU/KZ/EN) ═════════════
 * Вымышленный объект. Скрытые факты: число и место оставшихся рабочих, баллоны на сварочном
 * участке, неисправный гидрант. Ограничения: запас воды в АЦ и пенообразователя.
 * События: разлив горящих ЛКМ при подаче воды, взрыв баллона, прогиб и обрушение кровли,
 * загорание соседнего склада, пламя у ГРП, искрение щита, дым на жилой квартал.
 */
const industrialFire: ScenarioDef = {
  type: 'industrial_fire',
  title: 'Пожар на промышленном объекте',
  create(seed, lang) {
    const r = rng(seed);
    const t = (v: L3) => tx(lang, v);
    const missing = r.int(2, 4);
    const booth = r.chance(0.5) ? 1 : 0;           // 1 — покрасочная камера, 0 — бытовка на антресоли
    return {
      title: t(L('Пожар на промышленном объекте', 'Өнеркәсіп нысанындағы өрт', 'Industrial facility fire')),
      briefing: t(L(
        'Промзона областного центра (учебный объект, вымышленный). Горит производственный корпус 60×36 м с покрасочным участком и складом лакокрасочных материалов. Густой черный дым, внутри возможны опасные вещества. Персонал выходит через проходную, сколько людей осталось внутри — неизвестно. В 8 м — склад готовой продукции, у ограждения — газорегуляторный пункт. Водоснабжение ограничено: два гидранта на кольцевой сети и пруд-накопитель в 700 м. Силы: 3 АЦ, АЛ-30, 2 звена ГДЗС, 16 человек, 600 л пенообразователя. Вы — РТП.',
        'Облыс орталығының өнеркәсіп аймағы (оқу нысаны, ойдан шығарылған). Бояу учаскесі және лак-бояу материалдары қоймасы бар 60×36 м өндірістік корпус жанып жатыр. Қою қара түтін, ішінде қауіпті заттар болуы мүмкін. Персонал өткізу пункті арқылы шығуда, ішінде қанша адам қалғаны белгісіз. 8 м жерде — дайын өнім қоймасы, қоршау жанында — газ реттеу пункті. Сумен жабдықтау шектеулі: сақиналы желідегі екі гидрант және 700 м жердегі жинақтағыш тоған. Күштер: 3 АЦ, АС-30, 2 ГТҚҚ буыны, 16 адам, 600 л көбік түзгіш. Сіз — ӨСБ.',
        'Industrial zone of a regional centre (fictional training site). A 60×36 m production building with a paint shop and a paint-and-solvent store is on fire. Thick black smoke; hazardous materials may be present inside. Staff are leaving through the gatehouse; it is unknown how many remain inside. A finished-goods warehouse stands 8 m away, and a gas regulator station sits by the fence. Water is limited: two hydrants on a ring main and a storage pond 700 m away. Forces: 3 engines, a 30 m aerial ladder, 2 BA teams, 16 personnel and 600 L of foam concentrate. You are the incident commander.')),
      brief: {
        place: t(L('Промзона областного центра, учебный объект «Завод металлоконструкций» (вымышленный)', 'Облыс орталығының өнеркәсіп аймағы, «Металл конструкциялар зауыты» оқу нысаны (ойдан шығарылған)', 'Industrial zone of a regional centre, training site "Steel Structures Plant" (fictional)')),
        time: t(L('10:15, рабочая смена', '10:15, жұмыс ауысымы', '10:15, day shift')),
        weather: t(L('+18 °C, ветер западный 6 м/с — в сторону жилого квартала в 600 м', '+18 °C, батыс желі 6 м/с — 600 м жердегі тұрғын кварталға қарай', '+18 °C, westerly wind 6 m/s — towards a residential block 600 m away')),
        people: t(L('Смена ≈ 40 человек; сколько осталось внутри — не установлено', 'Ауысым ≈ 40 адам; ішінде қаншасы қалғаны анықталмаған', 'Shift ≈ 40 people; the number still inside is unknown')),
        hazards: [
          t(L('Горящие лакокрасочные материалы и растворители', 'Жанып жатқан лак-бояу материалдары мен еріткіштер', 'Burning paints and solvents')),
          t(L('Металлические фермы кровли без огнезащиты', 'Отқа қорғалмаған металл шатыр фермалары', 'Unprotected steel roof trusses')),
          t(L('Токсичные продукты горения, дым на жилой квартал', 'Уытты жану өнімдері, түтін тұрғын кварталға', 'Toxic combustion products; smoke drifting to housing')),
          t(L('Газорегуляторный пункт у ограждения', 'Қоршау жанындағы газ реттеу пункті', 'Gas regulator station by the fence')),
          t(L('Соседний склад в 8 м', '8 м жердегі көрші қойма', 'Adjacent warehouse 8 m away')),
        ],
        forces: [
          t(L('3 АЦ (по 3 т воды)', '3 АЦ (әрқайсысы 3 т су)', '3 engines (3 t of water each)')),
          t(L('АЛ-30', 'АС-30', '30 m aerial ladder')),
          t(L('2 звена ГДЗС (6 СИЗОД)', '2 ГТҚҚ буыны (6 ТОҚҚ)', '2 BA teams (6 sets)')),
          t(L('16 человек личного состава', 'Жеке құрам — 16 адам', '16 personnel')),
          t(L('600 л пенообразователя', '600 л көбік түзгіш', '600 L of foam concentrate')),
          t(L('Повышенный номер вызова — по запросу, ≈ 10 мин', 'Шақырудың жоғары нөмірі — сұрау бойынша, ≈ 10 мин', 'Higher alarm level — on request, ≈ 10 min')),
        ],
      },
      conditions: [
        { label: t(L('Площадь корпуса', 'Корпус аумағы', 'Building area')), value: '≈ 2 160 m²' },
        { label: t(L('Ветер', 'Жел', 'Wind')), value: t(L('З 6 м/с', 'Б 6 м/с', 'W 6 m/s')) },
        { label: t(L('Люди внутри', 'Ішіндегі адамдар', 'People inside')), value: t(L('не установлено', 'анықталмаған', 'unknown')) },
        { label: t(L('Пенообразователь', 'Көбік түзгіш', 'Foam')), value: '600 L' },
      ],
      timeLimit: 50,
      victims: { total: missing, known: 0, atRisk: missing, rescued: 0, lost: 0, revealed: false },
      vars: { spread: 22, smoke: 45, heat: 10, exposure: 0, water: 100, foam: 600, crewRisk: 10, contain: 0, deadline: booth ? 14 : 18, booth, missing },
      flags: { cylinders: r.chance(0.7), hydrantFault: r.chance(0.6) },
      resources: [
        { name: 'АЦ', label: t(L('АЦ', 'АЦ', 'Engines')), total: 3, committed: 0 },
        { name: 'АЛ', label: t(L('Автолестница', 'Автосатыны', 'Aerial ladder')), total: 1, committed: 0 },
        { name: 'ГДЗС', label: t(L('Звенья ГДЗС', 'ГТҚҚ буындары', 'BA teams')), total: 2, committed: 0 },
        { name: 'Личный состав', label: t(L('Личный состав', 'Жеке құрам', 'Personnel')), total: 16, committed: 0 },
        { name: 'Пена', label: t(L('Пенообразователь, ×100 л', 'Көбік түзгіш, ×100 л', 'Foam, ×100 L')), total: 6, committed: 0 },
      ],
    };
  },
  evaluate(s, a) {
    const v = s.vars; const f = s.flags;
    const where = v.booth ? L('в покрасочной камере', 'бояу камерасында', 'in the paint booth') : L('в бытовке на антресоли', 'антресольдегі тұрмыстық бөлмеде', 'in the mezzanine rest room');
    const reveal = () => { s.victims.revealed = true; s.victims.known = s.victims.total; f.located = true; };
    switch (a) {
      case 'recon':
        if (f.recon) return meh(L('Разведка продолжается, изменений нет.', 'Барлау жалғасуда, өзгеріс жоқ.', 'Reconnaissance continues; no changes.'));
        f.recon = true; if (f.cylinders) f.cylKnown = true;
        log(s, 'report', f.cylinders
          ? L('Разведка: горит покрасочный участок и склад ЛКМ; на сварочном посту у восточной стены — баллоны ацетилена и кислорода. Со стороны покрасочной камеры слышны крики.', 'Барлау: бояу учаскесі мен ЛБМ қоймасы жанып жатыр; шығыс қабырғадағы дәнекерлеу бекетінде — ацетилен және оттегі баллондары. Бояу камерасы жақтан айқай естіледі.', 'Recon: the paint shop and solvent store are burning; acetylene and oxygen cylinders are at the welding bay by the east wall. Shouting can be heard near the paint booth.')
          : L('Разведка: горит покрасочный участок и склад ЛКМ, пламя по кровле распространяется к востоку. Со стороны покрасочной камеры слышны крики.', 'Барлау: бояу учаскесі мен ЛБМ қоймасы жанып жатыр, жалын шатыр бойымен шығысқа таралуда. Бояу камерасы жақтан айқай естіледі.', 'Recon: the paint shop and solvent store are burning; flames are spreading east along the roof. Shouting can be heard near the paint booth.'));
        return ok(L('Разведка периметра выполнена: определены очаг, пути распространения и опасные зоны.', 'Периметр барланды: ошақ, таралу жолдары және қауіпті аймақтар анықталды.', 'Perimeter reconnaissance done: seat of fire, spread paths and danger zones identified.'));
      case 'contact':
        if (f.contact) return meh(L('Информация от ответственного лица уже получена.', 'Жауапты тұлғадан ақпарат алынып қойған.', 'Information from the site manager has already been obtained.'));
        f.contact = true; reveal(); if (f.cylinders) f.cylKnown = true; f.hydrantKnown = true;
        log(s, 'report', fill(tx(s.lang, L(
          'Главный инженер: по спискам не хватает {n} чел., последний раз их видели {where}. {cyl}{hyd}',
          'Бас инженер: тізім бойынша {n} адам жетіспейді, оларды соңғы рет {where} көрген. {cyl}{hyd}',
          'Chief engineer: {n} people are missing from the roster, last seen {where}. {cyl}{hyd}')), {
          n: v.missing, where: tx(s.lang, where),
          cyl: f.cylinders ? tx(s.lang, L('На сварочном посту — баллоны ацетилена. ', 'Дәнекерлеу бекетінде — ацетилен баллондары. ', 'There are acetylene cylinders at the welding bay. ')) : '',
          hyd: f.hydrantFault ? tx(s.lang, L('Гидрант П-2 на ремонте.', 'П-2 гидранты жөндеуде.', 'Hydrant H-2 is under repair.')) : tx(s.lang, L('Оба гидранта исправны.', 'Екі гидрант та жарамды.', 'Both hydrants are serviceable.')),
        }));
        return ok(L('Связь с ответственным лицом: сверены списки, получены сведения о людях, баллонах и водоснабжении.', 'Жауапты тұлғамен байланыс: тізімдер салыстырылды, адамдар, баллондар және сумен жабдықтау туралы мәлімет алынды.', 'Liaison with the site manager: roster checked; information on people, cylinders and water supply obtained.'));
      case 'drone':
        if (f.drone) return meh(L('БПЛА уже в воздухе.', 'ҰҰА ауада.', 'The drone is already airborne.'));
        f.drone = true; if (f.cylinders) f.cylKnown = true;
        log(s, 'report', L('Тепловизор БПЛА: максимальная температура кровли над покрасочным участком, дым сносит на жилой квартал.', 'ҰҰА жылу бейнелегіші: бояу учаскесінің үстіндегі шатырдың температурасы ең жоғары, түтін тұрғын кварталға ығысуда.', 'Drone thermal camera: roof temperature peaks over the paint shop; smoke is drifting over the residential block.'));
        return ok(L('БПЛА с тепловизором: уточнены зоны прогрева кровли и направление дыма.', 'Жылу бейнелегішті ҰҰА: шатырдың қызу аймақтары мен түтін бағыты нақтыланды.', 'Thermal drone: roof hot zones and smoke direction confirmed.'), false);
      case 'gdzs':
        if (f.gdzs) return meh(L('Звенья ГДЗС уже работают.', 'ГТҚҚ буындары жұмыс істеп жатыр.', 'BA teams are already working.'));
        f.gdzs = true; v.crewRisk = clamp(v.crewRisk - 5); commit(s, 'ГДЗС', 2); commit(s, 'Личный состав', 6);
        return ok(L('Сформированы 2 звена ГДЗС, выставлен пост безопасности у входа в корпус.', '2 ГТҚҚ буыны құрылды, корпусқа кіреберісте қауіпсіздік бекеті қойылды.', 'Two BA teams formed; an entry control point set up at the building entrance.'));
      case 'rescue':
        if (f.rescueSent) return meh(L('Звено уже ведет поиск.', 'Буын іздестіру жүргізуде.', 'A team is already searching.'));
        if (!f.gdzs) { v.crewRisk = clamp(v.crewRisk + 30); return viol(L('Направлять людей в задымленный корпус без СИЗОД и поста безопасности недопустимо.', 'Түтінге толы корпусқа адамдарды ТОҚҚ-сыз және қауіпсіздік бекетінсіз жіберуге болмайды.', 'Sending people into a smoke-filled building without breathing apparatus and entry control is not permitted.')); }
        if (!f.located) return bad(L('Звено ищет вслепую: место нахождения людей не установлено.', 'Буын соқыр іздеуде: адамдардың орны анықталмаған.', 'The team is searching blind: the location of the missing people is unknown.'));
        f.rescueSent = true; f.inside = true; schedule(s, 3, 'rescue_done'); commit(s, 'Личный состав', 3);
        return ok(fill(tx(s.lang, L('Звено ГДЗС со спасательной веревкой направлено {where}.', 'Құтқару арқаны бар ГТҚҚ буыны {where} жіберілді.', 'A BA team with a rescue line has been sent {where}.')), { where: tx(s.lang, where) }));
      case 'attack_in':
        if (!f.gdzs) { v.crewRisk = clamp(v.crewRisk + 25); return viol(L('Внутренняя атака без звеньев ГДЗС в плотном дыму.', 'Қою түтінде ГТҚҚ буындарынсыз ішкі шабуыл.', 'Interior attack in thick smoke without BA teams.')); }
        if (f.attack) return meh(L('Стволы уже работают внутри.', 'Оқпандар ішінде жұмыс істеуде.', 'Hose lines are already working inside.'));
        f.attack = true; f.inside = true; commit(s, 'АЦ', 1);
        if (!f.power) { v.crewRisk = clamp(v.crewRisk + 12); return meh(L('Стволы введены внутрь, но корпус не обесточен.', 'Оқпандар ішке енгізілді, бірақ корпус ток көзінен ажыратылмаған.', 'Hose lines are inside, but the building has not been de-energised.')); }
        return ok(L('Стволы введены внутрь корпуса по защищенному направлению.', 'Оқпандар корпус ішіне қорғалған бағыт бойынша енгізілді.', 'Hose lines advanced into the building along a protected route.'));
      case 'water':
        if (!f.waterMistake && !f.foamUsed) {
          f.waterMistake = true; v.spread = clamp(v.spread + 8); v.water = Math.max(0, v.water - 10);
          log(s, 'escalation', L('Компактные струи воды разбрызгали горящие растворители — пламя растеклось по полу покрасочного участка.', 'Тығыз су ағыны жанып жатқан еріткіштерді шашыратып жіберді — жалын бояу учаскесінің еденіне жайылды.', 'Solid water streams splashed the burning solvents — flames spread across the paint shop floor.'));
          return bad(L('Вода по горящим ЛКМ малоэффективна и разносит горение — нужна пена.', 'Жанып жатқан ЛБМ-ге су тиімсіз және жануды таратады — көбік қажет.', 'Water on burning paints and solvents is ineffective and spreads the fire — foam is needed.'));
        }
        f.outside = true;
        return meh(L('Стволы с улицы сдерживают распространение по периметру.', 'Сырттағы оқпандар периметр бойынша таралуды тежеуде.', 'Outside hose lines are holding the fire at the perimeter.'));
      case 'foam': {
        const res = s.resources.find((x) => x.name === 'Пена');
        const left = (res?.total ?? 0) - (res?.committed ?? 0);
        if (left <= 0) return meh(L('Пенообразователь закончился — нужен подвоз.', 'Көбік түзгіш таусылды — жеткізу қажет.', 'Foam concentrate has run out — a resupply is needed.'));
        if (v.water <= 0 && !f.supply) return bad(L('Пенная атака невозможна: в АЦ нет воды.', 'Көбік шабуылы мүмкін емес: АЦ-да су жоқ.', 'Foam attack impossible: the engines have no water.'));
        commit(s, 'Пена', 3); f.foamUsed = true; f.foamActive = true; v.contain = clamp(v.contain + 18); v.spread = clamp(v.spread - 10);
        return ok(L('Подана пена средней кратности на горящие ЛКМ — горение на покрасочном участке подавляется.', 'Жанып жатқан ЛБМ-ге орташа еселікті көбік берілді — бояу учаскесіндегі жану басылуда.', 'Medium-expansion foam applied to the burning paints — the fire in the paint shop is being suppressed.'));
      }
      case 'water_supply':
        if (f.supply) return meh(L('Водоснабжение уже организовано.', 'Сумен жабдықтау ұйымдастырылып қойған.', 'Water supply is already organised.'));
        if (f.hydrantFault && !f.hydrantKnown) { f.hydrantKnown = true; schedule(s, 2, 'hydrant_fail'); commit(s, 'АЦ', 1); return meh(L('АЦ-2 направлена на гидрант П-2…', 'АЦ-2 П-2 гидрантына жіберілді…', 'Engine 2 sent to hydrant H-2…')); }
        f.supply = true; v.water = Math.max(v.water, 70); commit(s, 'АЦ', 1);
        return f.hydrantFault
          ? ok(L('Организована перекачка из пруда-накопителя через АЦ-3 и гидрант П-1.', 'АЦ-3 және П-1 гидранты арқылы жинақтағыш тоғаннан айдау ұйымдастырылды.', 'Relay pumping organised from the storage pond via engine 3 and hydrant H-1.'))
          : ok(L('АЦ установлены на гидранты П-1 и П-2, магистральные линии проложены.', 'АЦ П-1 және П-2 гидранттарына орнатылды, магистральдық желілер тартылды.', 'Engines connected to hydrants H-1 and H-2; supply lines laid.'));
      case 'power_off':
        if (f.power) return meh(L('Корпус уже обесточен.', 'Корпус ток көзінен ажыратылған.', 'The building is already de-energised.'));
        f.power = true;
        return ok(L('Дежурный электрик обесточил корпус.', 'Кезекші электрик корпусты ток көзінен ажыратты.', 'The duty electrician has isolated power to the building.'));
      case 'gas_off':
        if (f.gas) return meh(L('Газ уже перекрыт.', 'Газ жабылып қойған.', 'Gas is already shut off.'));
        f.gas = true;
        return ok(L('Газ на ГРП перекрыт аварийной службой газового хозяйства.', 'ГРП-дағы газды газ шаруашылығының авариялық қызметі жапты.', 'Gas at the regulator station has been shut off by the gas utility emergency crew.'));
      case 'cool':
        if (!f.cylinders || !f.cylKnown) return meh(L('Охлаждение ведется, но баллоны на этом участке не выявлены.', 'Салқындату жүргізілуде, бірақ бұл учаскеде баллондар анықталмаған.', 'Cooling is under way, but no cylinders have been identified in this area.'));
        if (f.cool) return meh(L('Баллоны уже охлаждаются.', 'Баллондар салқындатылуда.', 'The cylinders are already being cooled.'));
        f.cool = true; commit(s, 'АЦ', 1);
        return ok(L('Лафетный ствол охлаждает баллоны ацетилена из-за укрытия.', 'Лафет оқпаны баспана артынан ацетилен баллондарын салқындатуда.', 'A monitor is cooling the acetylene cylinders from behind cover.'));
      case 'protect':
        if (f.protect) return meh(L('Склад уже защищается.', 'Қойма қорғалуда.', 'The warehouse is already being protected.'));
        f.protect = true; commit(s, 'АЦ', 1);
        return ok(L('Стволы поставлены на защиту соседнего склада, орошается стена.', 'Көрші қойманы қорғауға оқпандар қойылды, қабырға суарылуда.', 'Hose lines deployed to protect the adjacent warehouse; its wall is being wetted.'));
      case 'vent':
        v.spread = clamp(v.spread + 10); v.heat = clamp(v.heat + 8);
        log(s, 'escalation', L('Вскрытие кровли над горящими ЛКМ дало приток воздуха — пламя вырвалось наружу.', 'Жанып жатқан ЛБМ үстіндегі шатырды ашу ауа ағынын берді — жалын сыртқа шықты.', 'Opening the roof above the burning solvents fed the fire with air — flames burst through.'));
        return bad(L('Вскрытие кровли без согласования с тушением усиливает горение и опасно для л/с.', 'Сөндірумен келісілмеген шатырды ашу жануды күшейтеді және жеке құрам үшін қауіпті.', 'Opening the roof without coordinating with fire attack intensifies the fire and endangers crews.'));
      case 'withdraw':
        if (!f.inside) return meh(L('Внутри корпуса личного состава нет.', 'Корпус ішінде жеке құрам жоқ.', 'No crews are inside the building.'));
        if (s.victims.atRisk > 0 && f.rescueSent && !f.rescueDone && v.heat < 60) return bad(L('Преждевременно: звено еще выводит людей, а кровля пока держится.', 'Ерте: буын әлі адамдарды шығаруда, шатыр әзірге төтеп береді.', 'Premature: the team is still bringing people out and the roof is holding.'));
        f.inside = false; f.defensive = true; f.outside = true;
        return v.heat >= 55 ? ok(L('Личный состав выведен из корпуса, переход к наружному тушению лафетными стволами.', 'Жеке құрам корпустан шығарылды, лафет оқпандарымен сыртқы сөндіруге көшу.', 'Crews withdrawn from the building; switching to exterior attack with monitors.'))
          : meh(L('Расчеты выведены наружу; тушение изнутри прекращено.', 'Есептер сыртқа шығарылды; ішкі сөндіру тоқтатылды.', 'Crews withdrawn; interior attack stopped.'));
      case 'escape':
        if (f.observer) return meh(L('Наблюдатель уже выставлен.', 'Бақылаушы қойылған.', 'A lookout is already posted.'));
        f.observer = true; v.crewRisk = clamp(v.crewRisk - 5);
        return ok(L('Выставлен наблюдатель за кровлей, согласован сигнал отхода.', 'Шатырды бақылаушы қойылды, шегіну белгісі келісілді.', 'A lookout is watching the roof; the withdrawal signal is agreed.'), false);
      case 'chem_recon':
        if (f.chem) return meh(L('Химразведка ведется.', 'Химиялық барлау жүргізілуде.', 'Chemical reconnaissance is ongoing.'));
        f.chem = true;
        log(s, 'report', L('Газоанализ: превышение по оксиду углерода и парам растворителей в 300 м по ветру, у жилого квартала — на границе допустимого.', 'Газ талдауы: жел бағытында 300 м жерде көміртек оксиді мен еріткіш булары шектен асқан, тұрғын квартал жанында — рұқсат етілген шекте.', 'Gas monitoring: carbon monoxide and solvent vapours exceed limits 300 m downwind; at the residential block they are at the permissible threshold.'));
        return ok(L('Химразведка продуктов горения: определена зона опасных концентраций.', 'Жану өнімдерін химиялық барлау: қауіпті шоғырлану аймағы анықталды.', 'Chemical reconnaissance of the smoke: hazardous concentration zone identified.'), false);
      case 'evacuate':
        if (f.evac) return meh(L('Оповещение и эвакуация уже идут.', 'Хабарлау мен көшіру жүріп жатыр.', 'Warning and evacuation are already under way.'));
        f.evac = true;
        return ok(L('Совместно с полицией и акиматом: оповещение квартала по ветру, эвакуация персонала соседних предприятий.', 'Полиция және әкімдікпен бірлесіп: жел бағытындағы кварталды хабарлау, көрші кәсіпорындардың персоналын көшіру.', 'With the police and akimat: warning the downwind residential block and evacuating neighbouring businesses.'));
      case 'cordon':
        if (f.cordon) return meh(L('Оцепление уже выставлено.', 'Қоршау қойылған.', 'The cordon is already in place.'));
        f.cordon = true;
        return ok(L('Выставлено оцепление, организован въезд техники.', 'Қоршау қойылып, техниканың кіруі ұйымдастырылды.', 'Cordon established; access for appliances organised.'), false);
      case 'reinforce':
        if (f.reinforce) return meh(L('Силы уже в пути.', 'Күштер жолда.', 'Forces are already en route.'));
        f.reinforce = true; schedule(s, 10, 'reinforce_arrive');
        return ok(L('Запрошен повышенный номер вызова: 2 АЦ, автомобиль пенного тушения, звенья ГДЗС.', 'Шақырудың жоғары нөмірі сұралды: 2 АЦ, көбікпен сөндіру көлігі, ГТҚҚ буындары.', 'Higher alarm requested: 2 engines, a foam tender and BA teams.'));
      case 'medical':
        if (f.medical) return meh(L('Бригады СМП уже на месте.', 'ЖМК бригадалары орнында.', 'Ambulance crews are already on scene.'));
        f.medical = true;
        return s.victims.revealed || s.crewInjured ? ok(L('Бригады СМП развернуты у проходной.', 'ЖМК бригадалары өткізу пунктінің жанында орналастырылды.', 'Ambulance crews set up at the gatehouse.'))
          : meh(L('Бригада СМП дежурит у штаба.', 'ЖМК бригадасы штаб жанында кезекшілікте.', 'An ambulance crew is on standby at the command post.'));
      case 'hq':
        return once(s, 'hq') ? ok(L('Обстановка доложена в ЦУКС: пожар на объекте с возможными опасными веществами, есть пропавшие.', 'Жағдай ДЖБО-ға баяндалды: қауіпті заттар болуы мүмкін нысандағы өрт, хабарсыз кеткендер бар.', 'Reported to the crisis centre: fire at a site with possible hazardous materials; people are missing.'), false)
          : meh(L('Доклад уже был — докладывайте при изменении обстановки.', 'Баяндама болды — жағдай өзгергенде баяндаңыз.', 'You have already reported — report again when the situation changes.'));
      case 'tactic':
        if (f.roofWarn && f.inside) { f.inside = false; f.defensive = true; f.outside = true; return ok(L('Тактика изменена: переход к оборонительным действиям снаружи.', 'Тактика өзгертілді: сыртта қорғаныс әрекеттеріне көшу.', 'Tactics changed: switching to defensive operations from outside.')); }
        return meh(L('Тактика скорректирована.', 'Тактика түзетілді.', 'Tactics adjusted.'));
      case 'wait': return bad(L('Бездействие: горение распространяется по корпусу.', 'Әрекетсіздік: жану корпус бойынша таралуда.', 'Inaction: the fire is spreading through the building.'));
      default: return null;
    }
  },
  minute(s) {
    const v = s.vars; const f = s.flags;
    const attacking = (f.attack && f.inside) || f.foamActive || f.outside;
    // вода
    if (attacking) {
      v.water = Math.max(0, v.water - (f.supply ? 1 : 7));
      if (v.water <= 0 && once(s, 'nowater')) { f.foamActive = false; v.contain = clamp(v.contain - 10); log(s, 'escalation', L('В АЦ закончилась вода — стволы перекрыты, горение возобновилось.', 'АЦ-да су таусылды — оқпандар жабылды, жану қайта басталды.', 'The engines have run out of water — hose lines shut down and the fire flared up again.')); }
    }
    const wet = v.water > 0;
    // развитие горения и локализация
    const suppress = wet ? (f.foamActive ? 3.2 : 0) + (f.attack && f.inside ? 1.6 : 0) + (f.outside ? 0.9 : 0) + (f.reinforced ? 1.4 : 0) : 0;
    v.spread = clamp(v.spread + 1.2 - suppress);
    if (wet) v.contain = clamp(v.contain + (f.foamActive ? 4 : 0) + (f.attack && f.inside ? 2 : 0) + (f.outside ? 1 : 0) + (f.reinforced ? 2 : 0));
    if (f.foamActive) { const res = s.resources.find((x) => x.name === 'Пена'); if (res && res.committed >= res.total) { f.foamActive = false; log(s, 'info', L('Пенообразователь израсходован, пенная атака прекращена.', 'Көбік түзгіш жұмсалды, көбік шабуылы тоқтатылды.', 'Foam concentrate used up; foam attack stopped.')); } else if (res) res.committed = Math.min(res.total, res.committed + 0.3); }
    v.heat = clamp(v.heat + (1.2 + v.spread / 40) * (f.foamActive || v.contain > 60 ? 0.4 : 1));
    v.smoke = clamp(v.smoke + v.spread / 20 - (v.contain > 50 ? 2 : 0));
    v.exposure = clamp(v.exposure + (v.spread / 25) * (f.protect ? 0.15 : 1));
    // люди внутри
    if (s.victims.atRisk > 0 && !f.rescueSent && s.clock >= v.deadline && (s.clock - v.deadline) % 3 === 0 && once(s, `lost${s.clock}`)) {
      loseVictim(s, L('Рабочий, оставшийся в корпусе, погиб от отравления продуктами горения.', 'Корпуста қалған жұмысшы жану өнімдерімен уланып қаза тапты.', 'A worker left inside the building died from smoke inhalation.'));
    }
    if (s.clock >= 4 && !f.contact && !f.recon && once(s, 'guard')) log(s, 'radio', L('Охранник у проходной: «Кажется, кого-то нет — маляры не выходили!»', 'Өткізу пунктіндегі күзетші: «Біреу жоқ сияқты — сырлаушылар шыққан жоқ!»', 'Gate guard: "I think someone is missing — the painters haven\'t come out!"'));
    // баллоны
    if (f.cylinders && !f.cool && v.spread >= 55 && once(s, 'blast')) {
      v.crewRisk = clamp(v.crewRisk + 35); v.spread = clamp(v.spread + 12);
      if (f.inside) injureCrew(s, L('Взрыв баллона ацетилена на сварочном посту: травмирован пожарный внутри корпуса.', 'Дәнекерлеу бекетінде ацетилен баллоны жарылды: корпус ішіндегі өрт сөндіруші жарақат алды.', 'An acetylene cylinder exploded at the welding bay: a firefighter inside the building was injured.'));
      else log(s, 'escalation', L('Взрыв баллона ацетилена: разрушена часть восточной стены, горение усилилось.', 'Ацетилен баллоны жарылды: шығыс қабырғаның бір бөлігі қирады, жану күшейді.', 'An acetylene cylinder exploded: part of the east wall collapsed and the fire intensified.'));
    }
    // кровля
    if (v.heat >= 60 && once(s, 'roofWarn')) {
      f.roofWarn = true;
      log(s, f.observer || f.drone ? 'report' : 'escalation', f.observer || f.drone
        ? L('Наблюдатель: прогиб ферм покрытия над покрасочным участком! Подан сигнал отхода.', 'Бақылаушы: бояу учаскесінің үстіндегі жабын фермалары майысты! Шегіну белгісі берілді.', 'Lookout: the roof trusses over the paint shop are sagging! Withdrawal signal given.')
        : L('Треск и хлопки в кровле над покрасочным участком — признаки потери несущей способности ферм.', 'Бояу учаскесінің үстіндегі шатырда сықыр мен шарт-шұрт — фермалардың көтеру қабілетін жоғалту белгілері.', 'Cracking and bangs in the roof over the paint shop — signs the trusses are failing.'));
      if (f.observer) { f.inside = false; f.outside = true; }
    }
    if (v.heat >= 90 && once(s, 'roof')) {
      if (f.inside) injureCrew(s, L('Обрушение кровли над покрасочным участком: звено внутри корпуса попало под обрушение.', 'Бояу учаскесінің үстіндегі шатыр опырылды: корпус ішіндегі буын опырылымның астында қалды.', 'The roof over the paint shop collapsed: a team inside the building was caught.'));
      else { v.spread = clamp(v.spread + 6); log(s, 'escalation', L('Обрушение части кровли; личный состав находился снаружи и не пострадал.', 'Шатырдың бір бөлігі опырылды; жеке құрам сыртта болды, зардап шекпеді.', 'Part of the roof collapsed; crews were outside and unhurt.')); }
    }
    // соседний склад, газ, электричество, дым
    if (v.exposure >= 100 && once(s, 'warehouse')) { v.spread = clamp(v.spread + 15); v.contain = clamp(v.contain - 15); log(s, 'escalation', L('Загорелся соседний склад готовой продукции — площадь пожара увеличилась.', 'Көрші дайын өнім қоймасы тұтанды — өрт аумағы ұлғайды.', 'The adjacent finished-goods warehouse has caught fire — the fire area has grown.')); }
    if (!f.gas && v.exposure >= 60 && once(s, 'grp')) { v.crewRisk = clamp(v.crewRisk + 20); log(s, 'escalation', L('Пламя в 5 м от газорегуляторного пункта — газ не перекрыт.', 'Жалын газ реттеу пунктінен 5 м жерде — газ жабылмаған.', 'Flames are 5 m from the gas regulator station — the gas has not been shut off.')); }
    if (f.attack && !f.power && once(s, 'shield')) { v.crewRisk = clamp(v.crewRisk + 15); log(s, 'escalation', L('Искрение и короткое замыкание в электрощите рядом со стволом — корпус не обесточен.', 'Оқпан жанындағы электр қалқанында ұшқын және қысқа тұйықталу — корпус ток көзінен ажыратылмаған.', 'Sparking and a short circuit in a switchboard next to a hose line — the building is still energised.')); }
    if (s.clock >= 8 && !f.evac && once(s, 'plume')) log(s, 'escalation', L('Звонки 112 из жилого квартала: черный дым, жители жалуются на запах гари.', 'Тұрғын кварталдан 112 қоңыраулары: қара түтін, тұрғындар күйік иісіне шағымданады.', '112 calls from the residential block: black smoke, residents complain of the smell.'));
    if (v.crewRisk >= 100 && once(s, 'crew')) injureCrew(s, L('Критический риск реализовался: пожарный получил травму.', 'Сыни қауіп жүзеге асты: өрт сөндіруші жарақат алды.', 'The critical risk materialised: a firefighter was injured.'));
  },
  onEvent(s, id) {
    const f = s.flags;
    if (id === 'rescue_done') {
      f.rescueDone = true; f.inside = f.attack ? f.inside : false;
      const n = rescue(s, s.victims.atRisk);
      if (n) log(s, 'improvement', fill(tx(s.lang, L('Звено ГДЗС вывело {n} рабочих; переданы бригаде СМП.', 'ГТҚҚ буыны {n} жұмысшыны шығарды; ЖМК бригадасына тапсырылды.', 'The BA team brought out {n} workers; handed over to paramedics.')), { n }));
    }
    if (id === 'hydrant_fail') {
      log(s, 'escalation', L('Гидрант П-2 неисправен: давление в сети недостаточно. Нужна перекачка из пруда.', 'П-2 гидранты ақаулы: желідегі қысым жеткіліксіз. Тоғаннан айдау қажет.', 'Hydrant H-2 is faulty: network pressure is insufficient. Relay pumping from the pond is needed.'));
    }
    if (id === 'reinforce_arrive') {
      f.reinforced = true; addRes(s, 'АЦ', 2); addRes(s, 'ГДЗС', 2); addRes(s, 'Пена', 12); addRes(s, 'Личный состав', 10);
      log(s, 'improvement', L('Прибыли силы по повышенному номеру: 2 АЦ, автомобиль пенного тушения (1 200 л пенообразователя), 2 звена ГДЗС.', 'Жоғары нөмір бойынша күштер келді: 2 АЦ, көбікпен сөндіру көлігі (1 200 л көбік түзгіш), 2 ГТҚҚ буыны.', 'Higher-alarm forces arrived: 2 engines, a foam tender (1,200 L of concentrate) and 2 BA teams.'));
    }
  },
  gauges: (s) => [
    { key: 'contain', label: tx(s.lang, L('Локализация', 'Оқшаулау', 'Containment')), value: s.vars.contain, invert: true },
    { key: 'spread', label: tx(s.lang, L('Площадь горения', 'Жану аумағы', 'Fire area')), value: s.vars.spread },
    { key: 'heat', label: tx(s.lang, L('Прогрев кровли', 'Шатырдың қызуы', 'Roof heating')), value: s.vars.heat },
    { key: 'exposure', label: tx(s.lang, L('Угроза соседнему складу', 'Көрші қоймаға қауіп', 'Threat to warehouse')), value: s.vars.exposure },
    { key: 'water', label: tx(s.lang, L('Запас воды', 'Су қоры', 'Water reserve')), value: s.vars.water, invert: true },
    { key: 'crew', label: tx(s.lang, L('Риск для л/с', 'Жеке құрамға қауіп', 'Crew risk')), value: s.vars.crewRisk },
  ],
  situation(s) {
    const v = s.vars; const f = s.flags; const lg = s.lang;
    return [
      fill(tx(lg, L('Горит ≈ {a} % корпуса, локализовано ≈ {c} %.', 'Корпустың ≈ {a} %-ы жануда, ≈ {c} %-ы оқшауланды.', '≈ {a} % of the building is burning; ≈ {c} % contained.')), { a: Math.round(v.spread), c: Math.round(v.contain) }),
      v.heat >= 60 ? tx(lg, L('Кровля теряет несущую способность.', 'Шатыр көтеру қабілетін жоғалтуда.', 'The roof is losing load-bearing capacity.')) : '',
      s.victims.revealed && s.victims.atRisk > 0 ? fill(tx(lg, L('Внутри остаются {n} чел.', 'Ішінде {n} адам қалды.', '{n} people remain inside.')), { n: s.victims.atRisk }) : '',
      !s.victims.revealed ? tx(lg, L('Сколько людей внутри — неизвестно.', 'Ішінде қанша адам барын белгісіз.', 'Unknown how many people are inside.')) : '',
      f.supply ? '' : tx(lg, L('Водоснабжение не организовано.', 'Сумен жабдықтау ұйымдастырылмаған.', 'Water supply not established.')),
      f.inside ? tx(lg, L('Личный состав работает внутри.', 'Жеке құрам ішінде жұмыс істеуде.', 'Crews are working inside.')) : '',
    ].filter(Boolean).join(' ');
  },
  commands: [
    { label: L('Провести разведку периметра и корпуса', 'Периметр мен корпусты барлау', 'Reconnoitre the perimeter and building'), actions: ['recon'] },
    { label: L('Связаться с ответственным лицом, сверить списки персонала', 'Жауапты тұлғамен байланысып, персонал тізімін салыстыру', 'Contact the site manager, check the staff roster'), actions: ['contact'] },
    { label: L('Поднять БПЛА с тепловизором', 'Жылу бейнелегішті ҰҰА көтеру', 'Launch a thermal-imaging drone'), actions: ['drone'] },
    { label: L('Сформировать звенья ГДЗС, выставить пост безопасности', 'ГТҚҚ буындарын құру, қауіпсіздік бекетін қою', 'Form BA teams, set up entry control'), actions: ['gdzs'] },
    { label: L('Направить звено ГДЗС на поиск и спасение рабочих', 'ГТҚҚ буынын жұмысшыларды іздеу мен құтқаруға жіберу', 'Send a BA team to search for and rescue workers'), actions: ['rescue'] },
    { label: L('Ввести стволы внутрь корпуса', 'Оқпандарды корпус ішіне енгізу', 'Advance hose lines into the building'), actions: ['attack_in'] },
    { label: L('Подать пену на горящие ЛКМ', 'Жанып жатқан ЛБМ-ге көбік беру', 'Apply foam to the burning paints'), actions: ['foam'] },
    { label: L('Подать воду на очаг с улицы', 'Ошаққа сырттан су беру', 'Apply water to the fire from outside'), actions: ['water'] },
    { label: L('Организовать водоснабжение (гидранты / перекачка из пруда)', 'Сумен жабдықтауды ұйымдастыру (гидранттар / тоғаннан айдау)', 'Establish water supply (hydrants / relay from the pond)'), actions: ['water_supply'] },
    { label: L('Обесточить корпус', 'Корпусты ток көзінен ажырату', 'Isolate power to the building'), actions: ['power_off'] },
    { label: L('Перекрыть газ на ГРП', 'ГРП-да газды жабу', 'Shut off gas at the regulator station'), actions: ['gas_off'] },
    { label: L('Охлаждать баллоны на сварочном участке', 'Дәнекерлеу учаскесіндегі баллондарды салқындату', 'Cool the cylinders at the welding bay'), actions: ['cool'] },
    { label: L('Защищать соседний склад', 'Көрші қойманы қорғау', 'Protect the adjacent warehouse'), actions: ['protect'] },
    { label: L('Вскрыть кровлю для дымоудаления', 'Түтін шығару үшін шатырды ашу', 'Open the roof for ventilation'), actions: ['vent'] },
    { label: L('Вывести л/с из корпуса, перейти к наружному тушению', 'Жеке құрамды корпустан шығарып, сыртқы сөндіруге көшу', 'Withdraw crews and go defensive'), actions: ['withdraw'] },
    { label: L('Выставить наблюдателя за кровлей, сигнал отхода', 'Шатырды бақылаушы қою, шегіну белгісі', 'Post a roof lookout, agree a withdrawal signal'), actions: ['escape'] },
    { label: L('Провести химразведку продуктов горения', 'Жану өнімдерін химиялық барлау', 'Carry out chemical monitoring of the smoke'), actions: ['chem_recon'] },
    { label: L('Оповестить и эвакуировать квартал и соседние предприятия', 'Квартал мен көрші кәсіпорындарды хабарлап, көшіру', 'Warn and evacuate the block and neighbouring businesses'), actions: ['evacuate'] },
    { label: L('Установить зону оцепления', 'Қоршау аймағын белгілеу', 'Set up a cordon'), actions: ['cordon'] },
    { label: L('Запросить повышенный номер вызова и пенообразователь', 'Жоғары шақыру нөмірі мен көбік түзгішті сұрау', 'Request a higher alarm and foam concentrate'), actions: ['reinforce'] },
    { label: L('Вызвать бригады СМП', 'ЖМК бригадаларын шақыру', 'Call ambulance crews'), actions: ['medical'] },
    { label: L('Доложить руководителю в ЦУКС', 'ДЖБО-дағы басшыға баяндау', 'Report to the crisis centre'), actions: ['hq'] },
  ],
  resolved: (s) => (s.vars.contain >= 100 && (s.victims.atRisk === 0 || s.victims.revealed)
    ? (s.victims.lost === 0 ? L('Пожар локализован, все рабочие выведены.', 'Өрт оқшауланды, барлық жұмысшылар шығарылды.', 'The fire is contained and all workers are out.')
      : L('Пожар локализован, но есть погибшие.', 'Өрт оқшауланды, бірақ қаза тапқандар бар.', 'The fire is contained, but there were fatalities.'))
    : null),
  failed: (s) => (s.crewInjured > 0 ? L('Травмирован личный состав.', 'Жеке құрам жарақат алды.', 'Personnel were injured.') : null),
  scene(s) {
    const v = s.vars; const f = s.flags; const t = (x: L3) => tx(s.lang, x);
    return {
      wind: { deg: 90, label: t(L('З 6 м/с', 'Б 6 м/с', 'W 6 m/s')) },
      zones: [
        { kind: 'fire', x: 32 + v.spread / 12, y: 50, rx: 4 + v.spread / 6, ry: 3 + v.spread / 12, opacity: Math.max(0.2, 1 - v.contain / 110) },
        { kind: 'smoke', x: 60 + v.smoke / 8, y: 42, rx: 12 + v.smoke / 5, ry: 7 + v.smoke / 14, opacity: Math.min(0.55, v.smoke / 140) },
        ...(f.foamActive ? [{ kind: 'water' as const, x: 30, y: 54, rx: 8, ry: 4, opacity: 0.35 }] : []),
      ],
      lines: [
        { kind: 'building', points: [[14, 34], [52, 34], [52, 68], [14, 68], [14, 34]], label: t(L('корпус', 'корпус', 'building')) },
        { kind: 'building', points: [[56, 38], [70, 38], [70, 64], [56, 64], [56, 38]], label: v.exposure >= 100 ? t(L('склад (горит)', 'қойма (жануда)', 'warehouse (burning)')) : t(L('склад', 'қойма', 'warehouse')) },
        { kind: 'road', points: [[2, 88], [98, 88]] },
        ...(f.cordon ? [{ kind: 'cordon' as const, points: [[8, 26], [76, 26], [76, 80], [8, 80], [8, 26]] as [number, number][] }] : []),
      ],
      markers: [
        ...(s.victims.atRisk > 0 ? [{ kind: 'victims' as const, x: v.booth ? 22 : 44, y: 44, label: s.victims.revealed ? fill(t(L('Рабочие: {n}', 'Жұмысшылар: {n}', 'Workers: {n}')), { n: s.victims.atRisk }) : t(L('Люди?', 'Адамдар?', 'People?')), state: 'danger' as const }] : []),
        ...(f.cylKnown ? [{ kind: 'hazard' as const, x: 49, y: 60, label: t(L('Баллоны C₂H₂', 'C₂H₂ баллондары', 'C₂H₂ cylinders')), state: (f.cool ? 'ok' : 'danger') as 'ok' | 'danger' }] : []),
        { kind: 'hazard', x: 78, y: 70, label: t(L('ГРП', 'ГРП', 'Gas station')), state: f.gas ? 'ok' : v.exposure >= 60 ? 'danger' : 'warn' },
        { kind: 'village', x: 94, y: 30, label: t(L('Жилой квартал', 'Тұрғын квартал', 'Housing')), state: f.evac ? 'ok' : 'warn' },
        { kind: 'water', x: 6, y: 90, label: f.hydrantKnown && f.hydrantFault ? t(L('Пруд / П-2 неиспр.', 'Тоған / П-2 ақаулы', 'Pond / H-2 faulty')) : t(L('Пруд, гидранты', 'Тоған, гидранттар', 'Pond, hydrants')), state: f.supply ? 'ok' : 'warn' },
        { kind: 'unit', x: 30, y: 82, label: f.inside ? t(L('АЦ-1: стволы внутри', 'АЦ-1: оқпандар ішінде', 'E1: lines inside')) : t(L('АЦ-1', 'АЦ-1', 'E1')) },
        ...(f.protect ? [{ kind: 'unit' as const, x: 63, y: 76, label: t(L('АЦ: защита склада', 'АЦ: қойманы қорғау', 'Engine: warehouse')) }] : []),
        ...(f.gdzs ? [{ kind: 'hq' as const, x: 10, y: 74, label: t(L('Пост безопасности', 'Қауіпсіздік бекеті', 'Entry control')) }] : []),
        ...(f.drone ? [{ kind: 'drone' as const, x: 36, y: 22, label: t(L('БПЛА', 'ҰҰА', 'Drone')) }] : []),
        ...(f.medical ? [{ kind: 'medical' as const, x: 90, y: 84, label: t(L('СМП', 'ЖМК', 'EMS')) }] : []),
      ],
    };
  },
};

export const SCENARIOS: Record<SimScenarioType, ScenarioDef> = {
  building_fire: buildingFire, road_accident: roadAccident, flood, collapse, steppe_fire: steppeFire, hazmat, industrial_fire: industrialFire,
};

/* ───────────── Метаданные сценариев, сложность, учебные цели ───────────── */

export const DIFFICULTIES: SimDifficulty[] = ['easy', 'medium', 'hard', 'expert'];
export const DIFFICULTY_LABEL: Record<SimDifficulty, L3> = {
  easy: L('Легкий', 'Жеңіл', 'Easy'), medium: L('Средний', 'Орташа', 'Medium'), hard: L('Сложный', 'Күрделі', 'Hard'), expert: L('Эксперт', 'Сарапшы', 'Expert'),
};
/** Параметры уровня: темп развития обстановки, запас времени, силы, реальное время на модельную минуту */
export const DIFFICULTY_RULES: Record<SimDifficulty, { timeMul: number; tickMs: number; note: L3 }> = {
  easy: { timeMul: 1.3, tickMs: 20000, note: L('Обстановка развивается медленнее, больше времени на решение.', 'Жағдай баяу дамиды, шешім қабылдауға көбірек уақыт.', 'The situation develops more slowly; more time to decide.') },
  medium: { timeMul: 1, tickMs: 15000, note: L('Базовый темп: 15 с реального времени = 1 модельная минута.', 'Негізгі қарқын: 15 с нақты уақыт = 1 модельдік минут.', 'Base pace: 15 s real time = 1 simulated minute.') },
  hard: { timeMul: 0.9, tickMs: 12000, note: L('Опасные факторы нарастают быстрее; меньше времени.', 'Қауіпті факторлар тезірек өседі; уақыт аз.', 'Hazards escalate faster; less time.') },
  expert: { timeMul: 0.8, tickMs: 10000, note: L('Быстрое развитие обстановки и сокращенные силы на старте.', 'Жағдайдың жылдам дамуы және бастапқы күштердің азаюы.', 'Rapid escalation and reduced initial forces.') },
};

export interface ScenarioMeta {
  type: SimScenarioType; label: L3; emoji: string; hint: L3;
  difficulty: SimDifficulty; duration: L3; decisionPoints: number; skills: L3[]; featured?: boolean; localized: boolean;
}
const SK = {
  recon: L('Разведка', 'Барлау', 'Reconnaissance'), gdzs: L('Работа ГДЗС', 'ГТҚҚ жұмысы', 'Breathing apparatus'), rescue: L('Спасение людей', 'Адамдарды құтқару', 'Rescue'),
  water: L('Водоснабжение', 'Сумен жабдықтау', 'Water supply'), risk: L('Оценка рисков', 'Тәуекелді бағалау', 'Risk assessment'), res: L('Управление ресурсами', 'Ресурстарды басқару', 'Resource management'),
  coord: L('Взаимодействие служб', 'Қызметтердің өзара іс-қимылы', 'Inter-agency coordination'), safety: L('Безопасность л/с', 'Жеке құрам қауіпсіздігі', 'Crew safety'),
  road: L('Безопасность на дороге', 'Жолдағы қауіпсіздік', 'Road safety'), extr: L('Деблокирование', 'Бұғаттан шығару', 'Extrication'), triage: L('Медицинская сортировка', 'Медициналық сұрыптау', 'Medical triage'),
  boats: L('Работа на воде', 'Суда жұмыс', 'Water operations'), evac: L('Эвакуация', 'Көшіру', 'Evacuation'), elec: L('Электробезопасность', 'Электр қауіпсіздігі', 'Electrical safety'),
  struct: L('Оценка конструкций', 'Құрылымдарды бағалау', 'Structural assessment'), search: L('Поиск пострадавших', 'Зардап шеккендерді іздеу', 'Victim search'),
  chem: L('Химическая защита', 'Химиялық қорғаныс', 'Chemical protection'), zone: L('Зонирование', 'Аймақтарға бөлу', 'Zoning'), foam: L('Пенное тушение', 'Көбікпен сөндіру', 'Foam operations'),
};
export const SCENARIO_LIST: ScenarioMeta[] = [
  { type: 'industrial_fire', label: L('Пожар на промышленном объекте', 'Өнеркәсіп нысанындағы өрт', 'Industrial fire'), emoji: '🏭', hint: L('Дым, ЛКМ, баллоны, рабочие внутри, мало воды', 'Түтін, ЛБМ, баллондар, ішіндегі жұмысшылар, су аз', 'Smoke, solvents, cylinders, workers inside, little water'), difficulty: 'expert', duration: L('20–25 мин', '20–25 мин', '20–25 min'), decisionPoints: 22, skills: [SK.gdzs, SK.foam, SK.water, SK.risk, SK.safety], featured: true, localized: true },
  { type: 'steppe_fire', label: L('Степной пожар', 'Дала өрті', 'Steppe fire'), emoji: '🌾', hint: L('Сильный ветер, ЛЭП, фронт идет к аулу, мало техники', 'Күшті жел, ЭБЖ, шеп ауылға келе жатыр, техника аз', 'Strong wind, power line, front heading for a village, few engines'), difficulty: 'hard', duration: L('20–25 мин', '20–25 мин', '20–25 min'), decisionPoints: 17, skills: [SK.risk, SK.res, SK.coord, SK.safety], featured: true, localized: true },
  { type: 'building_fire', label: L('Пожар в здании', 'Ғимараттағы өрт', 'Building fire'), emoji: '🔥', hint: L('Жилой дом, задымление, люди на верхних этажах', 'Тұрғын үй, түтін, жоғарғы қабаттарда адамдар', 'Apartment block, smoke, people on upper floors'), difficulty: 'medium', duration: L('15–20 мин', '15–20 мин', '15–20 min'), decisionPoints: 12, skills: [SK.recon, SK.gdzs, SK.rescue, SK.water], localized: false },
  { type: 'flood', label: L('Паводок', 'Су тасқыны', 'Flood'), emoji: '🌊', hint: L('Поселок, ледяная вода, люди на чердаках', 'Кент, мұздай су, шатырдағы адамдар', 'Village, icy water, people in attics'), difficulty: 'medium', duration: L('15–20 мин', '15–20 мин', '15–20 min'), decisionPoints: 10, skills: [SK.boats, SK.evac, SK.elec], localized: false },
  { type: 'road_accident', label: L('ДТП', 'ЖКО', 'Road accident'), emoji: '🚗', hint: L('Трасса, зажатые пострадавшие, поток машин', 'Трасса, қысылған зардап шеккендер, көлік ағыны', 'Highway, trapped casualties, traffic'), difficulty: 'easy', duration: L('10–15 мин', '10–15 мин', '10–15 min'), decisionPoints: 10, skills: [SK.road, SK.extr, SK.triage], localized: false },
  { type: 'collapse', label: L('Обрушение здания', 'Ғимараттың опырылуы', 'Building collapse'), emoji: '🏢', hint: L('Завал, запах газа, неустойчивые стены', 'Үйінді, газ иісі, орнықсыз қабырғалар', 'Rubble, smell of gas, unstable walls'), difficulty: 'hard', duration: L('15–20 мин', '15–20 мин', '15–20 min'), decisionPoints: 10, skills: [SK.struct, SK.search, SK.safety], localized: false },
  { type: 'hazmat', label: L('Авария с опасным веществом', 'Қауіпті затпен апат', 'Hazardous materials release'), emoji: '☣️', hint: L('Утечка, облако, рабочие в цехе', 'Ағу, бұлт, цехтағы жұмысшылар', 'Leak, plume, workers in the plant'), difficulty: 'hard', duration: L('15–20 мин', '15–20 мин', '15–20 min'), decisionPoints: 10, skills: [SK.chem, SK.zone, SK.evac], localized: false },
];
export const scenarioMeta = (t: SimScenarioType) => SCENARIO_LIST.find((m) => m.type === t)!;

type Did = (...ids: string[]) => boolean;
interface ObjDef { id: string; label: L3; check: (s: SimState, did: Did) => boolean; hint: L3 }
const O = {
  personnel: { id: 'personnel', label: L('Защитить личный состав', 'Жеке құрамды қорғау', 'Protect personnel'), hint: L('Были травмы или нарушения требований безопасности.', 'Жарақаттар немесе қауіпсіздік талаптарын бұзу болды.', 'There were injuries or safety violations.'),
    check: (s: SimState) => s.crewInjured === 0 && !s.decisions.some((d) => d.verdict === 'violation') },
  rescue: { id: 'rescue', label: L('Спасти людей', 'Адамдарды құтқару', 'Rescue people'), hint: L('Есть погибшие или люди остались в зоне опасности.', 'Қаза тапқандар бар немесе адамдар қауіпті аймақта қалды.', 'There were fatalities or people left in danger.'),
    check: (s: SimState) => s.victims.lost === 0 && s.victims.atRisk === 0 },
  comms: { id: 'comms', label: L('Поддерживать связь и докладывать', 'Байланысты сақтау және баяндау', 'Maintain communication and report'), hint: L('Доклад в ЦУКС не выполнялся.', 'ДЖБО-ға баяндама жасалмады.', 'No report was made to the crisis centre.'),
    check: (_s: SimState, did: Did) => did('hq') },
};
const OBJECTIVES: Record<SimScenarioType, ObjDef[]> = {
  industrial_fire: [
    O.personnel,
    { id: 'workers', label: L('Найти и вывести рабочих', 'Жұмысшыларды тауып, шығару', 'Find and rescue the workers'), hint: L('Не все рабочие выведены живыми.', 'Барлық жұмысшылар тірі шығарылған жоқ.', 'Not all workers were brought out alive.'), check: (s) => s.victims.revealed && s.victims.lost === 0 && s.victims.atRisk === 0 },
    { id: 'spread', label: L('Не допустить распространения на соседний склад', 'Көрші қоймаға таралуына жол бермеу', 'Prevent spread to the adjacent warehouse'), hint: L('Соседний склад загорелся.', 'Көрші қойма тұтанды.', 'The adjacent warehouse caught fire.'), check: (s) => !s.flags['once:warehouse'] },
    { id: 'water', label: L('Обеспечить водоснабжение и пену', 'Сумен және көбікпен қамтамасыз ету', 'Secure water supply and foam'), hint: L('Вода закончилась или водоснабжение не организовано.', 'Су таусылды немесе сумен жабдықтау ұйымдастырылмады.', 'Water ran out or supply was not established.'), check: (s, did) => did('water_supply') && !s.flags['once:nowater'] && did('foam') },
    { id: 'hazmat', label: L('Контролировать опасные факторы (газ, баллоны, электричество)', 'Қауіпті факторларды бақылау (газ, баллондар, электр)', 'Control hazards (gas, cylinders, electricity)'), hint: L('Не перекрыт газ, не обесточен корпус или произошел взрыв баллона.', 'Газ жабылмады, корпус ажыратылмады немесе баллон жарылды.', 'Gas or power was not isolated, or a cylinder exploded.'), check: (s, did) => did('gas_off') && did('power_off') && !s.flags['once:blast'] },
  ],
  steppe_fire: [
    O.personnel,
    { id: 'village', label: L('Эвакуировать аул до подхода огня', 'Өрт жеткенге дейін ауылды көшіру', 'Evacuate the village before the fire arrives'), hint: L('Эвакуация аула не завершена.', 'Ауылды көшіру аяқталмады.', 'The village evacuation was not completed.'), check: (s) => Boolean(s.flags.evacDone) },
    { id: 'shepherd', label: L('Вывести людей с чабанской точки', 'Шопан қонысынан адамдарды шығару', 'Evacuate the shepherd camp'), hint: L('Люди с чабанской точки пострадали.', 'Шопан қонысындағы адамдар зардап шекті.', 'People at the shepherd camp came to harm.'), check: (s, did) => did('rescue') && s.victims.lost === 0 },
    { id: 'spread', label: L('Не допустить выхода огня к аулу', 'Өрттің ауылға шығуына жол бермеу', 'Keep the fire away from the village'), hint: L('Огонь дошел до окраины аула.', 'Өрт ауыл шетіне жетті.', 'The fire reached the village.'), check: (s) => s.vars.distance > 0 },
    { id: 'coord', label: L('Взаимодействие: ЦУКС, акимат, полиция', 'Өзара іс-қимыл: ДЖБО, әкімдік, полиция', 'Coordination: crisis centre, akimat, police'), hint: L('Не выполнены доклад или перекрытие трассы.', 'Баяндама немесе трассаны жабу орындалмады.', 'Report or highway closure not done.'), check: (_s, did) => did('hq') && did('cordon') },
  ],
  building_fire: [O.personnel, O.rescue,
    { id: 'water', label: L('Организовать водоснабжение', 'Сумен жабдықтауды ұйымдастыру', 'Establish water supply'), hint: L('АЦ не установлены на водоисточник.', 'АЦ су көзіне орнатылмады.', 'Engines were not connected to a water source.'), check: (_s, did) => did('water_supply') },
    { id: 'spread', label: L('Не допустить распространения огня вверх', 'Өрттің жоғары таралуына жол бермеу', 'Prevent vertical fire spread'), hint: L('Защита вышележащего этажа не организована.', 'Жоғарғы қабатты қорғау ұйымдастырылмады.', 'Upper floor protection was not organised.'), check: (_s, did) => did('protect') },
    O.comms],
  road_accident: [O.personnel,
    { id: 'scene', label: L('Обеспечить безопасность места ДТП', 'ЖКО орнының қауіпсіздігін қамтамасыз ету', 'Secure the scene'), hint: L('Ограждение не выставлено.', 'Қоршау қойылмады.', 'No cordon was set up.'), check: (_s, did) => did('cordon') },
    O.rescue,
    { id: 'medical', label: L('Организовать медицинскую помощь', 'Медициналық көмекті ұйымдастыру', 'Organise medical care'), hint: L('СМП не вызвана.', 'ЖМК шақырылмады.', 'No ambulance was called.'), check: (_s, did) => did('medical') },
    O.comms],
  flood: [O.personnel, O.rescue,
    { id: 'evac', label: L('Оповестить и эвакуировать жителей', 'Тұрғындарды хабарлап, көшіру', 'Warn and evacuate residents'), hint: L('Оповещение и ПВР не организованы.', 'Хабарлау және УОП ұйымдастырылмады.', 'Warning and shelters not organised.'), check: (_s, did) => did('evacuate') },
    { id: 'power', label: L('Обесточить подтопленные улицы', 'Су басқан көшелерді ажырату', 'De-energise flooded streets'), hint: L('Электроснабжение не отключено.', 'Электрмен жабдықтау ажыратылмады.', 'Power was not isolated.'), check: (_s, did) => did('power_off') },
    O.comms],
  collapse: [O.personnel,
    { id: 'stab', label: L('Раскрепить неустойчивые конструкции', 'Орнықсыз құрылымдарды бекіту', 'Shore unstable structures'), hint: L('Крепление не выполнено.', 'Бекіту орындалмады.', 'No shoring was done.'), check: (_s, did) => did('stabilize') },
    O.rescue,
    { id: 'gas', label: L('Отключить газ', 'Газды ажырату', 'Shut off gas'), hint: L('Газ не отключен.', 'Газ ажыратылмады.', 'Gas was not shut off.'), check: (_s, did) => did('power_off') },
    O.comms],
  hazmat: [O.personnel,
    { id: 'ppe', label: L('Работать в СИЗ с наветренной стороны', 'Жел жақтан ЖҚҚ-мен жұмыс істеу', 'Work upwind in PPE'), hint: L('Не соблюдены СИЗ или сторона подхода.', 'ЖҚҚ немесе жақындау жағы сақталмады.', 'PPE or approach direction was not respected.'), check: (_s, did) => did('ppe_chem') && did('upwind') },
    O.rescue,
    { id: 'evac', label: L('Защитить население по ветру', 'Жел бағытындағы халықты қорғау', 'Protect the downwind population'), hint: L('Оповещение квартала не выполнено.', 'Кварталды хабарлау орындалмады.', 'The downwind area was not warned.'), check: (_s, did) => did('evacuate') },
    { id: 'seal', label: L('Устранить источник утечки', 'Ағу көзін жою', 'Stop the leak'), hint: L('Утечка не устранена.', 'Ағу жойылмады.', 'The leak was not stopped.'), check: (_s, did) => did('seal') },
  ],
};
export const scenarioObjectives = (type: SimScenarioType, lang: Lang): SimObjective[] => OBJECTIVES[type].map((o) => ({ id: o.id, label: tx(lang, o.label) }));

/* ───────────── Публичный API движка ───────────── */

const clone = (s: SimState): SimState => JSON.parse(JSON.stringify(s)) as SimState;

function buildCommands(def: ScenarioDef, lang: Lang): SimCommand[] {
  return def.commands.map((c, i) => {
    if (typeof c !== 'string') return { key: `c${i}`, label: tx(lang, c.label), actions: c.actions };
    const ids = parseActions(c).map((a) => a.id);
    const label = lang === 'ru' ? c : ids.map((id) => tx(lang, actionById(id)!.label)).join(' + ') || c;
    return { key: `c${i}`, label, actions: ids };
  });
}

function refresh(s: SimState) {
  const def = SCENARIOS[s.type];
  s.gauges = def.gauges(s);
  s.situation = def.situation(s);
  s.scene = def.scene(s);
  if (!s.suggestions.length) s.suggestions = buildCommands(def, s.lang);
  if (s.status !== 'active') return;
  const fail = def.failed(s);
  if (fail) { s.status = 'failed'; s.statusReason = tx(s.lang, fail); log(s, 'escalation', fill(tx(s.lang, L('Эпизод завершен: {r}', 'Эпизод аяқталды: {r}', 'Episode ended: {r}')), { r: s.statusReason })); return; }
  const win = def.resolved(s);
  if (win) { s.status = 'success'; s.statusReason = tx(s.lang, win); log(s, 'improvement', fill(tx(s.lang, L('Задача выполнена: {r}', 'Міндет орындалды: {r}', 'Objective achieved: {r}')), { r: s.statusReason })); return; }
  if (s.clock >= s.timeLimit) { s.status = 'ended'; s.statusReason = tx(s.lang, L('Истекло время учебного эпизода.', 'Оқу эпизодының уақыты бітті.', 'The training episode time is up.')); log(s, 'info', s.statusReason); }
}

/** Темп развития опасных факторов зависит от уровня сложности (детерминированно) */
function hazardSteps(d: SimDifficulty, clock: number): number {
  if (d === 'easy') return clock % 4 === 0 ? 0 : 1;
  if (d === 'hard') return clock % 3 === 0 ? 2 : 1;
  if (d === 'expert') return clock % 2 === 0 ? 2 : 1;
  return 1;
}

function advance(s: SimState, minutes: number) {
  const def = SCENARIOS[s.type];
  for (let i = 0; i < minutes && s.status === 'active'; i++) {
    s.clock += 1;
    const due = s.pending.filter((p) => p.at <= s.clock);
    s.pending = s.pending.filter((p) => p.at > s.clock);
    due.forEach((p) => def.onEvent(s, p.id));
    for (let k = hazardSteps(s.difficulty, s.clock); k > 0 && s.status === 'active'; k--) def.minute(s);
    refresh(s);
  }
}

export interface StartOptions { trainee?: string; difficulty?: SimDifficulty; lang?: Lang }
export function startScenario(type: SimScenarioType, seed = Math.floor(Math.random() * 1e9), opts: StartOptions = {}): SimState {
  const def = SCENARIOS[type];
  const meta = scenarioMeta(type);
  const lang = opts.lang ?? 'ru';
  const difficulty = opts.difficulty ?? meta.difficulty;
  const base = def.create(seed, lang);
  const s: SimState = {
    ...base, id: `SIM-${type}-${seed.toString(36)}`, seed, type, trainee: opts.trainee, lang, difficulty, localized: meta.localized,
    objectives: scenarioObjectives(type, lang), status: 'active', clock: 0,
    crewInjured: 0, log: [], decisions: [], pending: [], nextEventId: 1, suggestions: [], gauges: [], situation: '',
    scene: { zones: [], lines: [], markers: [] },
  };
  s.timeLimit = Math.round(s.timeLimit * DIFFICULTY_RULES[difficulty].timeMul);
  if (difficulty === 'expert' && s.resources[0] && s.resources[0].total > 1) s.resources[0].total -= 1;
  log(s, 'radio', `${tx(lang, L('ЦУКС', 'ДЖБО', 'Crisis centre'))}: ${s.briefing}`);
  refresh(s);
  return s;
}

/** Время идет, пока обучаемый думает. Вызывается интерфейсом по таймеру. */
export function tickState(state: SimState, minutes = 1): SimState {
  if (state.status !== 'active') return state;
  const s = clone(state);
  advance(s, minutes);
  return s;
}

const GENERIC: Record<string, Outcome> = {
  tactic: meh(L('Тактика скорректирована; существенных изменений в обстановке нет.', 'Тактика түзетілді; жағдайда елеулі өзгеріс жоқ.', 'Tactics adjusted; no significant change in the situation.')),
  rotation: meh(L('Ротация личного состава организована.', 'Жеке құрам ротациясы ұйымдастырылды.', 'Crew rotation organised.')),
};

export function applyDecision(state: SimState, input: string, realSeconds: number, actionIds?: string[]): { state: SimState; decision: SimDecision } {
  const s = clone(state);
  const def = SCENARIOS[s.type];
  const acts = actionIds?.length ? actionIds.map(actionById).filter((a): a is ActionDef => Boolean(a)) : parseActions(input);
  const outcomes: { a: ActionDef; o: Outcome }[] = [];
  for (const a of acts) {
    const o = def.evaluate(s, a.id, input) ?? GENERIC[a.id]
      ?? bad(fill(tx(s.lang, L('{a}: не соответствует обстановке — отвлекает силы и время.', '{a}: жағдайға сәйкес келмейді — күш пен уақытты алаңдатады.', '{a}: does not fit the situation — it diverts forces and time.')), { a: tx(s.lang, a.label) }));
    outcomes.push({ a, o });
  }
  // Нарушение или ошибка в любой части команды определяют оценку; иначе — «верно», если есть верное действие.
  const vs = outcomes.map((x) => x.o.verdict);
  const verdict: SimVerdict = !outcomes.length ? 'unclear'
    : vs.includes('violation') ? 'violation' : vs.includes('mistake') ? 'mistake'
    : vs.includes('correct') ? 'correct' : 'acceptable';
  const decision: SimDecision = {
    id: s.decisions.length + 1, t: s.clock, realSeconds: Math.round(realSeconds), input: input.trim(),
    actions: outcomes.map((x) => tx(s.lang, x.a.label)),
    results: outcomes.map((x) => ({ id: x.a.id, label: tx(s.lang, x.a.label), verdict: x.o.verdict })),
    verdict,
    feedback: outcomes.length ? outcomes.map((x) => tx(s.lang, x.o.feedback)).join(' ')
      : tx(s.lang, L('Команда не распознана. Сформулируйте конкретное действие: что делать, какими силами, где.', 'Команда танылмады. Нақты әрекетті тұжырымдаңыз: не істеу, қандай күшпен, қайда.', 'Command not recognised. State a concrete action: what, with which forces, where.')),
    tactical: outcomes.some((x) => x.o.tactical && x.o.verdict === 'correct'),
  };
  s.decisions.push(decision);
  log(s, verdict === 'violation' ? 'violation' : 'decision', `${tx(s.lang, L('РТП', 'ӨСБ', 'IC'))}: «${decision.input}»`);
  const minutes = outcomes.length ? Math.max(...outcomes.map((x) => x.a.minutes)) : 1;
  advance(s, minutes);
  refresh(s);
  return { state: s, decision };
}

export function finishScenario(state: SimState): SimState {
  const s = clone(state);
  if (s.status === 'active') { s.status = 'ended'; s.statusReason = tx(s.lang, L('Эпизод завершен обучаемым.', 'Эпизодты тыңдаушы аяқтады.', 'Episode ended by the trainee.')); log(s, 'info', s.statusReason); }
  return s;
}

/* ───────────── Итоговая оценка (учебная, DEMO / TRAINING) ───────────── */

const CATEGORY_ACTIONS: { key: string; label: L3; ids: string[] }[] = [
  { key: 'tactical', label: L('Тактические решения', 'Тактикалық шешімдер', 'Tactical decisions'), ids: ['flank', 'firebreak', 'backfire', 'water', 'protect', 'rescue', 'extricate', 'boats', 'search', 'stabilize', 'seal', 'curtain', 'tactic', 'ladder', 'foam', 'attack_in', 'cool'] },
  { key: 'safety', label: L('Безопасность', 'Қауіпсіздік', 'Safety'), ids: ['gdzs', 'escape', 'power_off', 'gas_off', 'life_vests', 'ppe_chem', 'upwind', 'stabilize', 'rotation', 'cordon', 'withdraw'] },
  { key: 'speed', label: L('Скорость реагирования', 'Ден қою жылдамдығы', 'Response speed'), ids: [] },
  { key: 'resources', label: L('Управление ресурсами', 'Ресурстарды басқару', 'Resource management'), ids: ['reinforce', 'water_supply', 'rotation', 'sandbags', 'decon', 'heavy'] },
  { key: 'risk', label: L('Оценка рисков', 'Тәуекелді бағалау', 'Risk assessment'), ids: ['recon', 'drone', 'chem_recon', 'escape', 'power_off', 'search', 'contact'] },
  { key: 'interaction', label: L('Взаимодействие подразделений', 'Бөлімшелердің өзара іс-қимылы', 'Inter-unit coordination'), ids: ['hq', 'medical', 'evacuate', 'cordon', 'reinforce', 'contact'] },
];

const NEED: Record<SimScenarioType, [string, L3][]> = {
  building_fire: [['recon', L('Разведка звеном ГДЗС в начале работы', 'Жұмыс басында ГТҚҚ буынымен барлау', 'Reconnaissance by a BA team at the start')], ['gdzs', L('Звенья ГДЗС и пост безопасности', 'ГТҚҚ буындары және қауіпсіздік бекеті', 'BA teams and entry control')], ['water_supply', L('Установка АЦ на водоисточник', 'АЦ-ны су көзіне орнату', 'Connecting engines to a water source')], ['power_off', L('Обесточивание здания до подачи воды', 'Су берер алдында ғимаратты ажырату', 'Isolating power before applying water')], ['protect', L('Защита вышележащего этажа', 'Жоғарғы қабатты қорғау', 'Protecting the floor above')]],
  road_accident: [['cordon', L('Ограждение места ДТП', 'ЖКО орнын қоршау', 'Cordoning the scene')], ['stabilize', L('Стабилизация ТС до деблокирования', 'Бұғаттан шығарар алдында көлікті тұрақтандыру', 'Stabilising vehicles before extrication')], ['power_off', L('Отключение АКБ', 'АКБ-ны ажырату', 'Disconnecting the battery')], ['medical', L('Медицинская сортировка', 'Медициналық сұрыптау', 'Medical triage')], ['fuel', L('Обработка разлива топлива', 'Төгілген жанармайды өңдеу', 'Treating the fuel spill')]],
  flood: [['life_vests', L('Жилеты до выхода на воду', 'Суға шығар алдында кеудешелер', 'Life vests before going on the water')], ['power_off', L('Обесточивание подтопленных улиц', 'Су басқан көшелерді ажырату', 'De-energising flooded streets')], ['recon|drone', L('Разведка домов с людьми', 'Адамдар бар үйлерді барлау', 'Reconnaissance of occupied houses')], ['sandbags', L('Укрепление дамбы', 'Бөгетті нығайту', 'Reinforcing the dam')], ['evacuate', L('ПВР и оповещение', 'УОП және хабарлау', 'Shelters and public warning')]],
  collapse: [['stabilize', L('Крепление конструкций', 'Құрылымдарды бекіту', 'Shoring structures')], ['search', L('Поиск и маркировка мест нахождения людей', 'Адамдардың орнын іздеу және белгілеу', 'Search and marking of victim locations')], ['power_off', L('Отключение газа', 'Газды ажырату', 'Shutting off gas')], ['escape', L('Наблюдатель и сигнал отхода', 'Бақылаушы және шегіну белгісі', 'Lookout and withdrawal signal')], ['medical', L('Медики для синдрома сдавления', 'Қысылу синдромына дәрігерлер', 'Medics for crush syndrome')]],
  steppe_fire: [['recon|drone', L('Раннее применение БПЛА / разведки (чабанская точка!)', 'ҰҰА / барлауды ерте қолдану (шопан қонысы!)', 'Early drone / reconnaissance (shepherd camp!)')], ['escape', L('Пути отхода до начала тушения', 'Сөндіру басталғанға дейін шегіну жолдары', 'Escape routes before engaging')], ['firebreak', L('Минерализованная полоса перед аулом', 'Ауыл алдындағы минералданған жолақ', 'Firebreak in front of the village')], ['evacuate', L('Своевременная эвакуация аула', 'Ауылды уақытында көшіру', 'Timely village evacuation')], ['power_off', L('Отключение ЛЭП', 'ЭБЖ-ны ажырату', 'Power line shutdown')], ['cordon', L('Перекрытие трассы в зоне задымления', 'Түтін аймағындағы трассаны жабу', 'Closing the highway in the smoke')], ['water_supply', L('Подвоз воды', 'Су тасымалдау', 'Water shuttle')], ['rotation', L('Ротация и питьевой режим', 'Ротация және ауыз су режимі', 'Rotation and hydration')], ['rescue', L('Вывод людей с чабанской точки', 'Шопан қонысынан адамдарды шығару', 'Evacuating the shepherd camp')]],
  hazmat: [['upwind', L('Развертывание с наветренной стороны', 'Жел жақтан орналасу', 'Deploying upwind')], ['ppe_chem', L('Работа в средствах химзащиты', 'Химиялық қорғаныс құралдарында жұмыс', 'Working in chemical protective suits')], ['chem_recon', L('Химическая разведка', 'Химиялық барлау', 'Chemical reconnaissance')], ['seal', L('Устранение источника утечки', 'Ағу көзін жою', 'Stopping the leak')], ['evacuate', L('Оповещение жилого квартала', 'Тұрғын кварталды хабарлау', 'Warning the residential area')]],
  industrial_fire: [['contact', L('Связь с ответственным лицом и сверка списков персонала', 'Жауапты тұлғамен байланыс және персонал тізімін салыстыру', 'Liaising with the site manager and checking the roster')], ['gdzs', L('Звенья ГДЗС и пост безопасности до входа в корпус', 'Корпусқа кірер алдында ГТҚҚ буындары мен қауіпсіздік бекеті', 'BA teams and entry control before entering')], ['foam', L('Пенная атака по горящим ЛКМ', 'Жанып жатқан ЛБМ-ге көбік шабуылы', 'Foam attack on burning solvents')], ['water_supply', L('Водоснабжение с учетом неисправного гидранта', 'Ақаулы гидрантты ескере отырып сумен жабдықтау', 'Water supply accounting for the faulty hydrant')], ['cool', L('Охлаждение баллонов', 'Баллондарды салқындату', 'Cooling the cylinders')], ['gas_off', L('Перекрытие газа на ГРП', 'ГРП-да газды жабу', 'Shutting off gas at the station')], ['protect', L('Защита соседнего склада', 'Көрші қойманы қорғау', 'Protecting the adjacent warehouse')], ['escape', L('Наблюдатель за кровлей', 'Шатырды бақылаушы', 'Roof lookout')], ['evacuate', L('Оповещение квартала по ветру', 'Жел бағытындағы кварталды хабарлау', 'Warning the downwind block')]],
};

const TRAIN: Record<string, L3> = {
  tactical: L('Штабная тренировка: выбор решающего направления и расстановка сил.', 'Штабтық жаттығу: шешуші бағытты таңдау және күштерді орналастыру.', 'Staff exercise: choosing the decisive direction and deploying forces.'),
  safety: L('Занятие по охране труда: пути отхода, СИЗ, работа вблизи ЛЭП и в задымлении.', 'Еңбекті қорғау сабағы: шегіну жолдары, ЖҚҚ, ЭБЖ жанында және түтінде жұмыс.', 'Safety session: escape routes, PPE, working near power lines and in smoke.'),
  speed: L('Тренировка на время: принятие решения по первичной информации за 30 с.', 'Уақытқа жаттығу: бастапқы ақпарат бойынша 30 с ішінде шешім қабылдау.', 'Timed drill: making a decision on initial information within 30 s.'),
  resources: L('Расчет сил и средств: водоснабжение, резерв, ротация личного состава.', 'Күштер мен құралдарды есептеу: сумен жабдықтау, резерв, жеке құрам ротациясы.', 'Force calculation: water supply, reserves, crew rotation.'),
  risk: L('Практикум по разведке: БПЛА, опрос очевидцев, выявление скрытых угроз.', 'Барлау практикумы: ҰҰА, куәгерлерден сұрау, жасырын қауіптерді анықтау.', 'Reconnaissance workshop: drones, witness interviews, uncovering hidden threats.'),
  interaction: L('Командно-штабное учение с ЦУКС, акиматом, полицией и СМП.', 'ДЖБО, әкімдік, полиция және ЖМК-мен командалық-штабтық оқу-жаттығу.', 'Command-post exercise with the crisis centre, akimat, police and EMS.'),
};

export const GRADE_LABEL: Record<SimDebrief['gradeKey'], L3> = {
  excellent: L('Отлично', 'Өте жақсы', 'Excellent'), good: L('Хорошо', 'Жақсы', 'Good'),
  satisfactory: L('Удовлетворительно', 'Қанағаттанарлық', 'Satisfactory'), retrain: L('Требуется повторная тренировка', 'Қайта жаттығу қажет', 'Retraining required'),
};

export function debrief(s: SimState): SimDebrief {
  const lg = s.lang;
  const t = (v: L3) => tx(lg, v);
  const d = s.decisions;
  const count = (v: SimVerdict) => d.filter((x) => x.verdict === v).length;
  const totals = { decisions: d.length, correct: count('correct'), acceptable: count('acceptable'), mistakes: count('mistake'), violations: count('violation'), unclear: count('unclear') };
  const secs = d.map((x) => x.realSeconds);
  const avg = secs.length ? Math.round(secs.reduce((a, b) => a + b, 0) / secs.length) : 0;
  const escalations = s.log.filter((e) => e.kind === 'escalation');
  const results = d.flatMap((x) => (x.results ?? []).map((r) => ({ ...r, t: x.t })));
  const available = new Set(SCENARIOS[s.type].commands.flatMap((c) => (typeof c === 'string' ? parseActions(c).map((a) => a.id) : c.actions)));
  const goodIds = new Set(results.filter((r) => r.verdict === 'correct').map((r) => r.id));
  // Разведка и БПЛА — взаимозаменяемые способы разведки
  if (goodIds.has('drone') || goodIds.has('chem_recon') || goodIds.has('contact')) goodIds.add('recon');
  if (goodIds.has('recon')) goodIds.add('drone');
  const badIds = results.filter((r) => r.verdict === 'mistake' || r.verdict === 'violation').map((r) => r.id);
  const did: Did = (...ids) => ids.some((id) => goodIds.has(id) || results.some((r) => r.id === id && r.verdict === 'acceptable'));

  const categories = CATEGORY_ACTIONS.map((c) => {
    if (c.key === 'speed') {
      const base = !d.length ? 0 : avg <= 20 ? 100 : avg >= 120 ? 20 : Math.round(100 - ((avg - 20) / 100) * 80);
      const first = d[0]?.realSeconds ?? 0;
      const score = clamp(base - totals.unclear * 5 - (first > 60 ? 10 : 0));
      return { key: c.key, label: t(c.label), score, note: d.length ? fill(t(L('Среднее время решения {a} с, первое решение — {f} с.', 'Шешімнің орташа уақыты {a} с, алғашқы шешім — {f} с.', 'Average decision time {a} s; first decision {f} s.')), { a: avg, f: first }) : t(L('Решения не принимались.', 'Шешім қабылданбады.', 'No decisions were made.')) };
    }
    const rel = c.ids.filter((id) => available.has(id));
    const done = rel.filter((id) => goodIds.has(id)).length;
    const penalties = badIds.filter((id) => c.ids.includes(id)).length * 12
      + (c.key === 'safety' ? totals.violations * 20 + s.crewInjured * 30 : 0)
      + (c.key === 'risk' && d.length && !['recon', 'drone', 'chem_recon', 'contact'].some((id) => d.slice(0, 2).some((x) => x.results?.some((r) => r.id === id))) ? 15 : 0)
      + (c.key === 'tactical' ? s.victims.lost * 10 : 0);
    const score = rel.length ? clamp(Math.round(20 + (80 * done) / rel.length - penalties)) : 50;
    const missing = rel.filter((id) => !goodIds.has(id)).map((id) => tx(lg, actionById(id)!.label).toLowerCase());
    return { key: c.key, label: t(c.label), score, note: missing.length ? fill(t(L('Не выполнено: {v}.', 'Орындалмады: {v}.', 'Not done: {v}.')), { v: missing.slice(0, 3).join(', ') }) : t(L('Все ключевые действия выполнены.', 'Барлық негізгі әрекеттер орындалды.', 'All key actions completed.')) };
  });

  let score = Math.round(categories.reduce((a, c) => a + c.score, 0) / categories.length);
  const objectives = OBJECTIVES[s.type].map((o) => {
    const achieved = d.length > 0 && o.check(s, did);
    return { id: o.id, label: t(o.label), achieved, note: achieved ? t(L('Цель достигнута.', 'Мақсатқа қол жеткізілді.', 'Objective achieved.')) : t(o.hint) };
  });
  score += s.status === 'success' ? 10 : s.status === 'failed' ? -15 : s.status === 'ended' ? -8 : 0;
  score -= s.victims.lost * 8 + s.crewInjured * 15 + totals.violations * 6 + totals.mistakes * 3 + objectives.filter((o) => !o.achieved).length * 3;
  score = clamp(score);
  const gradeKey: SimDebrief['gradeKey'] = score >= 85 ? 'excellent' : score >= 70 ? 'good' : score >= 50 ? 'satisfactory' : 'retrain';
  const outcomeLevel = s.status === 'success' && s.victims.lost === 0 && s.crewInjured === 0 ? 'success' : s.status === 'failed' || s.victims.lost > 0 ? 'failed' : 'partial';

  const analysis: string[] = [];
  const first = d[0];
  if (first) {
    analysis.push(first.results?.some((r) => ['recon', 'drone', 'chem_recon', 'contact'].includes(r.id))
      ? t(L('Эпизод начат с разведки — решения опирались на фактическую обстановку.', 'Эпизод барлаудан басталды — шешімдер нақты жағдайға негізделді.', 'The episode began with reconnaissance — decisions were based on the actual situation.'))
      : fill(t(L('Первое решение — «{i}» — принято без предварительной разведки; часть решений опиралась на неподтвержденные данные.', 'Алғашқы шешім — «{i}» — алдын ала барлаусыз қабылданды; кейбір шешімдер расталмаған деректерге сүйенді.', 'The first decision — "{i}" — was made without prior reconnaissance; some decisions relied on unconfirmed data.')), { i: first.input }));
  }
  analysis.push(fill(t(L('Людей в опасности: {n}; спасено {r}, погибло {l}{left}.', 'Қауіптегі адамдар: {n}; құтқарылды {r}, қаза тапты {l}{left}.', 'People in danger: {n}; rescued {r}, died {l}{left}.')), {
    n: s.victims.total, r: s.victims.rescued, l: s.victims.lost,
    left: s.victims.atRisk ? fill(t(L(', не выведено к концу эпизода {a}', ', эпизод соңына дейін шығарылмады {a}', ', still not evacuated at the end: {a}')), { a: s.victims.atRisk }) : '',
  }));
  if (totals.violations) analysis.push(fill(t(L('Нарушений требований безопасности: {n}. В реальной обстановке каждое из них могло привести к травмированию личного состава.', 'Қауіпсіздік талаптарын бұзу: {n}. Нақты жағдайда әрқайсысы жеке құрамның жарақаттануына әкелуі мүмкін еді.', 'Safety violations: {n}. In a real incident, each could have injured personnel.')), { n: totals.violations }));
  if (escalations.length) analysis.push(fill(t(L('Обстановка ухудшалась {n} раз(а); часть эскалаций — следствие несвоевременных решений.', 'Жағдай {n} рет нашарлады; кейбір ушығулар кешіктірілген шешімдердің салдары.', 'The situation deteriorated {n} time(s); some escalations resulted from late decisions.')), { n: escalations.length }));
  analysis.push(fill(t(L('Среднее время на решение — {a} с (максимум {m} с).', 'Шешімге орташа уақыт — {a} с (ең көбі {m} с).', 'Average decision time — {a} s (maximum {m} s).')), { a: avg, m: secs.length ? Math.max(...secs) : 0 })
    + ' ' + (avg > 60 ? t(L('Пока обучаемый думал, обстановка развивалась.', 'Тыңдаушы ойланып тұрғанда жағдай дамып жатты.', 'The situation kept developing while the trainee deliberated.')) : t(L('Темп решений соответствует динамике обстановки.', 'Шешімдер қарқыны жағдай динамикасына сәйкес.', 'The decision pace matched the dynamics of the situation.'))));
  if (s.statusReason) analysis.push(fill(t(L('Итог: {r}', 'Қорытынды: {r}', 'Outcome: {r}')), { r: s.statusReason }));

  const missed = NEED[s.type].filter(([id]) => !id.split('|').some((x) => goodIds.has(x))).map(([, v]) => t(v));
  const weak = [...categories].sort((a, b) => a.score - b.score).slice(0, 2);
  const recommendations = weak.map((c) => `${c.label} (${c.score}): ${t(TRAIN[c.key])}`);
  if (totals.unclear) recommendations.push(t(L('Формулировать команды конкретно: кому, что, где, какими силами.', 'Командаларды нақты тұжырымдау: кімге, не, қайда, қандай күшпен.', 'Phrase commands concretely: who, what, where, with which forces.')));
  objectives.filter((o) => !o.achieved).slice(0, 2).forEach((o) => recommendations.push(fill(t(L('Отработать цель «{o}».', '«{o}» мақсатын пысықтау.', 'Practise the objective "{o}".')), { o: o.label })));
  recommendations.push(t(L('Повторить сценарий на другом варианте обстановки или более высоком уровне сложности.', 'Сценарийді басқа жағдай нұсқасында немесе жоғарырақ күрделілік деңгейінде қайталау.', 'Repeat the scenario with another situation variant or a higher difficulty level.')));

  const verdictText: Record<SimVerdict, L3> = {
    correct: L('верно', 'дұрыс', 'correct'), acceptable: L('допустимо', 'жол беріледі', 'acceptable'), mistake: L('ошибка', 'қате', 'mistake'),
    violation: L('нарушение', 'бұзушылық', 'violation'), unclear: L('не распознано', 'танылмады', 'not recognised'),
  };
  return {
    outcome: s.statusReason ?? t(L('Эпизод завершен.', 'Эпизод аяқталды.', 'Episode ended.')),
    outcomeLevel, score, grade: t(GRADE_LABEL[gradeKey]), gradeKey, objectives, totals,
    timing: { avgSeconds: avg, maxSeconds: secs.length ? Math.max(...secs) : 0, firstDecisionSeconds: first?.realSeconds ?? 0, simMinutes: s.clock },
    decisionTimes: d.map((x) => ({ t: x.t, seconds: x.realSeconds, verdict: x.verdict, input: x.input })),
    categories,
    missed,
    correctList: d.filter((x) => x.verdict === 'correct').map((x) => `${x.t}′ «${x.input}» — ${x.feedback}`),
    resourceUsage: s.resources.map((r) => ({ name: r.label ?? r.name, total: r.total, committed: Math.round(r.committed) })),
    timeline: [
      ...d.map((x) => ({ t: x.t, kind: 'decision' as const, text: `«${x.input}» — ${t(verdictText[x.verdict])}`, verdict: x.verdict })),
      ...s.log.filter((e) => e.kind === 'escalation' || e.kind === 'improvement' || e.kind === 'report').map((e) => ({ t: e.t, kind: e.kind, text: e.text })),
    ].sort((a, b) => a.t - b.t),
    safetyViolations: [...d.filter((x) => x.verdict === 'violation').map((x) => `${x.t}′ «${x.input}» — ${x.feedback}`), ...s.log.filter((e) => e.kind === 'violation' && !e.text.includes('«')).map((e) => `${e.t}′ — ${e.text}`)],
    tactical: d.filter((x) => x.tactical).map((x) => `${x.t}′ ${x.actions.join(', ')} — ${x.feedback}`),
    mistakes: [...d.filter((x) => x.verdict === 'mistake').map((x) => `${x.t}′ «${x.input}» — ${x.feedback}`), ...escalations.map((e) => `${e.t}′ — ${e.text}`)],
    analysis,
    recommendations,
  };
}

/** Текущая учебная оценка для индикатора во время симуляции */
export function liveScore(s: SimState): number {
  return debrief(s).score;
}
