/**
 * Детерминированный движок AI-помощника (DEMO MODE / mock-режим backend).
 * Разбирает сообщение, извлекает ФАКТЫ, строит ДОПУЩЕНИЯ и РЕКОМЕНДАЦИИ
 * в 9-разделной структуре. Нормативные ссылки — только из RAG-индекса.
 * В live-режиме тот же контракт заполняет LLM (см. server/src/prompts.ts).
 */
import type { AssistantResponse, Statement, ThreatLevel } from '../contracts.js';
import { NOT_CONNECTED, type Hit, toCitation } from './rag.js';
import { norm } from './text.js';

const F = (text: string): Statement => ({ kind: 'fact', text });
const A = (text: string): Statement => ({ kind: 'assumption', text });
const R = (text: string): Statement => ({ kind: 'recommendation', text });

const NUM_WORDS: [string, number][] = [
  ['одно', 1], ['двух', 2], ['трех', 3], ['четырех', 4], ['пяти', 5], ['шести', 6], ['семи', 7],
  ['восьми', 8], ['девяти', 9], ['десяти', 10], ['двенадцати', 12], ['четырнадцати', 14], ['шестнадцати', 16],
];
const ORD_WORDS: [string, number][] = [
  ['перв', 1], ['втор', 2], ['трет', 3], ['четв', 4], ['пят', 5], ['шест', 6], ['седьм', 7], ['восьм', 8], ['девят', 9], ['десят', 10],
];
const CITIES = ['Астана', 'Алматы', 'Шымкент', 'Караганда', 'Актобе', 'Тараз', 'Павлодар', 'Усть-Каменогорск', 'Семей', 'Атырау',
  'Костанай', 'Кызылорда', 'Уральск', 'Петропавловск', 'Актау', 'Туркестан', 'Кокшетау', 'Талдыкорган', 'Экибастуз', 'Жезказган'];

export interface ExtractedFacts {
  raw: string;
  fireFloor: number | null;
  floors: number | null;
  peopleCount: number | null;
  peopleMentioned: boolean;
  children: boolean;
  trapped: boolean;
  smoke: 'none' | 'some' | 'heavy';
  windMs: number | null;
  strongWind: boolean;
  night: boolean;
  temperature: number | null;
  chemical: string | null;
  vehicles: string[];
  areaText: string | null;
  waterRise: string | null;
  city: string | null;
  gas: boolean;
  power: boolean;
  list: string[];
}

export function extractFacts(message: string): ExtractedFacts {
  const t = norm(message);
  const list: string[] = [];

  let fireFloor: number | null = null;
  const fm = t.match(/(\d{1,2}|[а-я]+)[-\s]*(?:м|й|ом|ем)?\s+этаж(?!н)/);
  if (fm) {
    const tok = fm[1];
    fireFloor = /^\d+$/.test(tok) ? Number(tok) : ORD_WORDS.find(([w]) => tok.startsWith(w))?.[1] ?? null;
  }
  let floors: number | null = null;
  const fl = t.match(/(\d{1,2})[-\s]*этажн/) ?? t.match(/([а-я]+)этажн/);
  if (fl) floors = /^\d+$/.test(fl[1]) ? Number(fl[1]) : NUM_WORDS.find(([w]) => fl[1].startsWith(w))?.[1] ?? null;
  if (/многоэтаж/.test(t) && !floors) floors = null;

  const pm = t.match(/(\d{1,3})\s*(человек|чел\.?|людей|детей|пострадавш|пассажир|жител)/);
  const peopleCount = pm ? Number(pm[1]) : null;
  const peopleMentioned = peopleCount !== null || /(люди|людей|человек|дети|ребен|пострадав|жильц|жител|пассажир|заблокир|остал)/.test(t);
  const children = /(дет|ребен|школ|детсад)/.test(t);
  const trapped = /(зажат|заблокир|не может выбраться|под завал|отрезан)/.test(t);
  const smoke = /(сильн[а-яa-z0-9]* задым|густ[а-яa-z0-9]* дым|плотн[а-яa-z0-9]* дым)/.test(t) ? 'heavy' : /(задым|дым)/.test(t) ? 'some' : 'none';
  const wm = t.match(/(\d{1,2})\s*м\/с/);
  const windMs = wm ? Number(wm[1]) : null;
  const strongWind = (windMs !== null && windMs >= 10) || /(сильн[а-яa-z0-9]* ветер|порыв|штормов)/.test(t);
  const night = /(ноч|темн|вечер)/.test(t);
  const tm = t.match(/([-−+]?\d{1,2})\s*°?\s*c\b|([-−]\d{1,2})\s*градус/);
  const temperature = tm ? Number((tm[1] ?? tm[2]).replace('−', '-')) : null;
  const chem = t.match(/(аммиак|хлор|кислот|щелоч|бензин|дизел|пропан|метан|сероводород|ртут)/);
  const vehicles = [...new Set((t.match(/(автобус|грузовик|фур|легков[а-яa-z0-9]*|автомобил[а-яa-z0-9]*|бензовоз|поезд)/g) ?? []))];
  const am = message.match(/(\d+[.,]?\d*)\s*(га|м²|м2|кв\.?\s*м|км²)/i);
  const wr = message.match(/[+]?\s*(\d{1,3})\s*см/i);
  const city = CITIES.find((c) => t.includes(norm(c).slice(0, Math.max(5, c.length - 2)))) ?? null;
  const gas = /(газ(?!ет)|газов)/.test(t) && !/(газоанализ)/.test(t);
  const power = /(провод|лэп|электр|трансформ|подстанц)/.test(t);

  if (city) list.push(`Населенный пункт: ${city}`);
  if (floors) list.push(`Этажность здания: ${floors}`);
  if (fireFloor) list.push(`Этаж очага / события: ${fireFloor}-й`);
  if (smoke !== 'none') list.push(smoke === 'heavy' ? 'Сильное задымление' : 'Задымление');
  if (peopleCount !== null) list.push(`Количество людей: ${peopleCount}`);
  else if (peopleMentioned) list.push('Упомянуто возможное нахождение людей (количество не указано)');
  if (children) list.push('Упомянуты дети');
  if (trapped) list.push('Люди блокированы / зажаты');
  if (windMs !== null) list.push(`Ветер: ${windMs} м/с`);
  else if (strongWind) list.push('Сильный ветер (скорость не указана)');
  if (night) list.push('Темное время суток');
  if (temperature !== null) list.push(`Температура воздуха: ${temperature} °C`);
  if (chem) list.push(`Вещество: ${chem[1]}`);
  if (vehicles.length) list.push(`Транспорт: ${vehicles.join(', ')}`);
  if (am) list.push(`Площадь / масштаб: ${am[1]} ${am[2]}`);
  if (wr) list.push(`Подъем уровня воды: ${wr[1]} см`);
  if (gas) list.push('Упомянут газ');
  if (power) list.push('Упомянуты электросети / провода');

  return {
    raw: message, fireFloor, floors, peopleCount, peopleMentioned, children, trapped, smoke, windMs, strongWind,
    night, temperature, chemical: chem ? chem[1] : null, vehicles, areaText: am ? `${am[1]} ${am[2]}` : null,
    waterRise: wr ? `${wr[1]} см` : null, city, gas, power, list,
  };
}

const up = (l: ThreatLevel): ThreatLevel => (l === 'low' ? 'medium' : l === 'medium' ? 'high' : 'critical');
const has = (t: string, re: RegExp) => re.test(norm(t));

type Core = Omit<AssistantResponse, 'regulations' | 'facts'> & { ragQuery: string };

function buildingFire(f: ExtractedFacts): Core {
  const floor = f.fireFloor;
  const above = floor ? `${floor}-го этажа и выше` : 'этажа пожара и вышележащих этажей';
  let level: ThreatLevel = f.smoke === 'heavy' ? 'high' : 'medium';
  if (f.peopleMentioned) level = up(level);
  if (f.children || (f.floors ?? 0) >= 9) level = up(level);
  const tall = (f.floors ?? 0) >= 6;
  const gdzs = Math.max(2, Math.ceil(((f.peopleCount ?? 3) + (f.smoke === 'heavy' ? 3 : 0)) / 3));
  return {
    scenario: 'building-fire',
    ragQuery: 'пожар многоэтажное здание спасение людей задымление ГДЗС',
    classification: { category: 'Пожар', subtype: `Пожар в здании${f.floors ? ` (${f.floors} эт.)` : ''}`, confidence: 0.9 },
    threat: {
      level,
      rationale: [
        ...(f.smoke !== 'none' ? [F(f.smoke === 'heavy' ? 'Сообщено о сильном задымлении.' : 'Сообщено о задымлении.')] : []),
        ...(f.peopleMentioned ? [F('Сообщено о возможном нахождении людей в здании.')] : []),
        ...(f.strongWind ? [F('Сообщено о сильном ветре — возможен переброс огня по фасаду.')] : []),
        A('Уровень угрозы оценен по правилу: задымление + люди в здании повышают уровень на ступень.'),
      ],
    },
    hazards: [
      ...(f.smoke !== 'none' ? [F('Задымление путей эвакуации и лестничных клеток (сообщено).')] : [A('Задымление лестничных клеток вероятно при развитии пожара.')]),
      A(`Распространение огня на ${above} через оконные проемы, вентканалы и пустоты.`),
      A('Отравление продуктами горения (CO, HCN) у людей, оставшихся в квартирах.'),
      A('Вспышка / обратная тяга при вскрытии закрытых помещений.'),
      ...(f.gas ? [F('Упомянут газ — угроза взрыва газовоздушной смеси.')] : [A('Возможна угроза от бытового газа — наличие газификации не указано.')]),
      A('Поражение электрическим током до обесточивания здания.'),
    ],
    victims: [
      ...(f.peopleCount !== null ? [F(`Указано людей: ${f.peopleCount}.`)] : []),
      ...(f.peopleMentioned && f.peopleCount === null ? [F('Указано, что в здании могут находиться люди; количество не сообщено.')] : []),
      ...(f.children ? [F('Среди людей упомянуты дети — приоритет спасения.')] : []),
      A(`Наиболее вероятное нахождение людей — квартиры ${above}, лестничные площадки, балконы.`),
      A('Возможны пострадавшие с отравлением продуктами горения; число уточняется разведкой.'),
    ],
    resources: [
      { kind: 'truck', title: 'Пожарные автомобили', value: tall ? '3 АЦ + АЛ-50' : '2–3 АЦ + АЛ-30', note: 'Автолестница — для спасения с балконов и окон', basis: 'recommendation' },
      { kind: 'breathing', title: 'Звенья ГДЗС', value: `${gdzs} звена (≥ ${gdzs * 3} СИЗОД)`, note: 'Плюс резервное звено у поста безопасности', basis: 'recommendation' },
      { kind: 'drone', title: 'БПЛА с тепловизором', value: '1 ед.', note: 'Осмотр фасада и кровли, поиск людей у окон', basis: 'recommendation' },
      { kind: 'medical', title: 'Медицинская помощь', value: f.peopleMentioned ? '2 бригады СМП' : '1 бригада СМП', note: 'Пункт сбора пострадавших вне зоны задымления', basis: 'recommendation' },
      { kind: 'personnel', title: 'Дополнительный личный состав', value: '1 отделение', note: 'Спасение и эвакуация по этажам', basis: 'recommendation' },
      { kind: 'special', title: 'Дымососы / вентиляторы', value: '2 ед.', note: 'Только после подачи стволов на тушение', basis: 'recommendation' },
    ],
    actions: [
      { step: 1, priority: 'immediate', text: 'Разведка: место и площадь горения, люди на этаже пожара и выше, пути распространения дыма; опрос жильцов.' },
      { step: 2, priority: 'immediate', text: `Спасение людей с ${above}: незадымляемые пути, автолестница, спасательные устройства; работа звеньями ГДЗС.` },
      { step: 3, priority: 'immediate', text: 'Выставить пост безопасности, вести учет времени работы звеньев в СИЗОД.' },
      { step: 4, priority: 'high', text: 'Установить АЦ на водоисточник, подать стволы на этаж пожара и на защиту вышележащего этажа.' },
      { step: 5, priority: 'high', text: 'Обесточить подъезд; через аварийную службу перекрыть газ.' },
      { step: 6, priority: 'high', text: 'Дымоудаление — только после подачи ствола; защитить лестничную клетку от задымления.' },
      { step: 7, priority: 'normal', text: 'Развернуть пункт сбора пострадавших, передать людей СМП, доложить обстановку в ЦУКС.' },
    ],
    safety: [
      R('Вход в задымленную зону — только звеном ГДЗС не менее 3 человек, с постом безопасности и связью.'),
      R('Двери закрытых помещений вскрывать под прикрытием ствола — угроза вспышки.'),
      R('Не начинать вентиляцию до подачи стволов на тушение.'),
      R('Контролировать давление в баллонах СИЗОД, своевременно выводить звенья.'),
      ...(f.strongWind ? [R('При сильном ветре учитывать ограничения работы автолестницы по ветровой нагрузке.')] : []),
    ],
    missingInfo: [
      ...(!f.floors ? [{ question: 'Сколько этажей в здании?', why: 'Определяет тип автолестницы и число звеньев ГДЗС.' }] : []),
      ...(!f.fireFloor ? [{ question: 'На каком этаже очаг?', why: 'Определяет направление спасения и защиты вышележащих этажей.' }] : []),
      ...(f.peopleCount === null ? [{ question: 'Сколько людей может находиться в здании и где?', why: 'Определяет решающее направление и потребность в звеньях.' }] : []),
      { question: 'Газифицировано ли здание?', why: 'Требуется для оценки угрозы взрыва и порядка отключения.' },
      { question: 'Есть ли работающий гидрант / водоисточник рядом?', why: 'Определяет схему водоснабжения.' },
      ...(!f.city ? [{ question: 'Точный адрес и подъезды к зданию?', why: 'Нужен для расстановки техники и автолестницы.' }] : []),
    ],
  };
}

function wildfire(f: ExtractedFacts): Core {
  const level: ThreatLevel = f.strongWind || /посел|село|дома|аул/.test(norm(f.raw)) ? 'critical' : 'high';
  return {
    scenario: 'wildfire',
    ragQuery: 'степной природный пожар ветер население эвакуация',
    classification: { category: 'Пожар', subtype: 'Природный (степной / ландшафтный) пожар', confidence: 0.86 },
    threat: {
      level,
      rationale: [
        ...(f.windMs ? [F(`Ветер ${f.windMs} м/с (сообщено).`)] : f.strongWind ? [F('Сообщено о сильном ветре.')] : []),
        ...(f.areaText ? [F(`Площадь: ${f.areaText}.`)] : []),
        A('Скорость распространения кромки при ветре > 10 м/с может превышать 1–3 км/ч.'),
      ],
    },
    hazards: [
      A('Переход огня на населенные пункты, фермы, хозяйственные объекты по направлению ветра.'),
      A('Резкая смена направления ветра — угроза окружения расчетов огнем.'),
      A('Задымление автодорог, снижение видимости.'),
      ...(f.power ? [F('Упомянуты ЛЭП / провода в зоне пожара.')] : [A('Возможны ЛЭП в зоне пожара — требуется уточнение.')]),
    ],
    victims: [
      ...(f.peopleMentioned ? [F('Упомянуты люди в зоне угрозы.')] : []),
      A('Прямых пострадавших обычно нет; угроза — жителям ближайших н. п. и чабанских точек.'),
    ],
    resources: [
      { kind: 'truck', title: 'АЦ повышенной проходимости', value: '4 ед.', note: 'Тушение кромки с флангов', basis: 'recommendation' },
      { kind: 'special', title: 'Техника для опашки', value: '2 трактора / грейдер', note: 'Минерализованные полосы', basis: 'recommendation' },
      { kind: 'drone', title: 'БПЛА', value: '2 ед.', note: 'Контур пожара каждые 30 мин', basis: 'recommendation' },
      { kind: 'personnel', title: 'Дополнительный личный состав', value: '15–20 чел.', note: 'Ранцевые огнетушители, воздуходувки', basis: 'recommendation' },
      { kind: 'medical', title: 'Медицинская помощь', value: '1 бригада', note: 'Дежурство у штаба', basis: 'recommendation' },
    ],
    actions: [
      { step: 1, priority: 'immediate', text: 'Разведка с БПЛА: контур, фронт, фланги, скорость и направление распространения.' },
      { step: 2, priority: 'immediate', text: 'Определить пути отхода и точки сбора, довести до каждого расчета.' },
      { step: 3, priority: 'immediate', text: 'Главное направление — защита населенного пункта по ходу огня.' },
      { step: 4, priority: 'high', text: 'Тушение кромки с флангов к фронту; прокладка минерализованных полос техникой.' },
      { step: 5, priority: 'high', text: 'Организовать подвоз воды и дозаправку техники.' },
      { step: 6, priority: 'normal', text: 'Совместно с акиматом подготовить оповещение и возможную эвакуацию.' },
    ],
    safety: [
      R('Не атаковать фронт огня с подветренной стороны без подготовленных путей отхода.'),
      R('Непрерывно контролировать метеоданные; при смене ветра немедленно отвести расчеты.'),
      R('Не работать под ЛЭП в дыму до подтверждения отключения.'),
      R('Ротация личного состава, питьевой режим.'),
    ],
    missingInfo: [
      ...(!f.windMs ? [{ question: 'Скорость и направление ветра?', why: 'Определяет главное направление и скорость распространения.' }] : []),
      ...(!f.areaText ? [{ question: 'Площадь и длина кромки?', why: 'Нужны для расчета сил.' }] : []),
      { question: 'Расстояние до ближайшего населенного пункта?', why: 'Определяет срочность эвакуации.' },
      { question: 'Есть ли водоисточники и подъездные пути?', why: 'Определяет схему подвоза воды.' },
    ],
  };
}

function flood(f: ExtractedFacts): Core {
  return {
    scenario: 'flood',
    ragQuery: 'паводок подтопление эвакуация работы на воде жилеты',
    classification: { category: 'Природная ЧС', subtype: 'Паводок / подтопление', confidence: 0.88 },
    threat: {
      level: f.peopleMentioned ? 'critical' : 'high',
      rationale: [
        ...(f.waterRise ? [F(`Подъем уровня воды: ${f.waterRise} (сообщено).`)] : []),
        ...(f.peopleMentioned ? [F('Сообщено о людях в зоне подтопления.')] : []),
        A('При сохранении тенденции возможно подтопление соседних участков.'),
      ],
    },
    hazards: [
      A('Дальнейший подъем воды и изоляция людей в домах.'),
      A('Размыв дорог и дамб, отрезание подъездов.'),
      A('Поражение током в подтопленных зданиях.'),
      A('Переохлаждение, утопление при работе на течении.'),
    ],
    victims: [
      ...(f.peopleCount !== null ? [F(`Указано людей: ${f.peopleCount}.`)] : []),
      ...(f.children ? [F('Упомянуты дети.')] : []),
      A('Вероятно нахождение маломобильных жителей в подтопленных домах — нужен подворный обход.'),
    ],
    resources: [
      { kind: 'special', title: 'Лодки / плавсредства', value: '2–4 ед.', note: 'С лодочными расчетами', basis: 'recommendation' },
      { kind: 'truck', title: 'Насосная техника', value: '2 ед.', note: 'Откачка, мотопомпы', basis: 'recommendation' },
      { kind: 'drone', title: 'БПЛА', value: '1–2 ед.', note: 'Мониторинг уровня и поиск людей', basis: 'recommendation' },
      { kind: 'personnel', title: 'Дополнительный личный состав', value: '20+ чел.', note: 'Подсыпка дамб, эвакуация', basis: 'recommendation' },
      { kind: 'medical', title: 'Медицинская помощь', value: '1 бригада', note: 'В пункте временного размещения', basis: 'recommendation' },
    ],
    actions: [
      { step: 1, priority: 'immediate', text: 'Разведка зоны подтопления (включая БПЛА), определение домов с людьми.' },
      { step: 2, priority: 'immediate', text: 'Спасение и эвакуация на плавсредствах: дети, пожилые, маломобильные — в первую очередь.' },
      { step: 3, priority: 'immediate', text: 'Обесточить подтопленные участки через энергоснабжающую организацию.' },
      { step: 4, priority: 'high', text: 'Укрепление и подсыпка дамб, откачка воды.' },
      { step: 5, priority: 'high', text: 'Развернуть пункт временного размещения совместно с акиматом.' },
      { step: 6, priority: 'normal', text: 'Постоянный мониторинг уровня воды, доклады в ЦУКС.' },
    ],
    safety: [
      R('Работа на воде — только в спасательных жилетах и со страховкой.'),
      R('Не входить в подтопленные здания до подтверждения отключения электроэнергии.'),
      R('Не переходить вброд без проверки глубины и скорости течения.'),
      ...(f.temperature !== null && f.temperature < 5 ? [F(`Температура ${f.temperature} °C — высокий риск переохлаждения; организовать обогрев.`)] : [R('Организовать обогрев и сухую одежду для л/с и пострадавших.')]),
    ],
    missingInfo: [
      ...(!f.waterRise ? [{ question: 'Скорость подъема уровня воды?', why: 'Определяет время на эвакуацию.' }] : []),
      { question: 'Сколько домов и жителей в зоне подтопления?', why: 'Определяет число лодочных расчетов.' },
      { question: 'Есть ли подъездные пути и где развернуть ПВР?', why: 'Логистика эвакуации.' },
    ],
  };
}

function roadAccident(f: ExtractedFacts): Core {
  const bus = f.vehicles.some((v) => v.startsWith('автобус'));
  const level: ThreatLevel = bus || f.trapped || /горит|возгор/.test(norm(f.raw)) ? 'high' : 'medium';
  return {
    scenario: 'road-accident',
    ragQuery: 'ДТП деблокирование стабилизация аккумулятор ограждение',
    classification: { category: 'Техногенная ЧС', subtype: bus ? 'ДТП с автобусом (возможно массовые пострадавшие)' : 'Дорожно-транспортное происшествие', confidence: 0.87 },
    threat: {
      level,
      rationale: [
        ...(f.vehicles.length ? [F(`Транспорт: ${f.vehicles.join(', ')}.`)] : []),
        ...(f.trapped ? [F('Сообщено о зажатых / блокированных людях.')] : []),
        A('Угроза вторичного ДТП и возгорания при разливе топлива.'),
      ],
    },
    hazards: [
      A('Вторичное столкновение с проезжающим транспортом.'),
      A('Возгорание ТС, разлив топлива.'),
      A('Самопроизвольное срабатывание подушек безопасности при резке.'),
      ...(f.night ? [F('Темное время суток — ограниченная видимость.')] : []),
    ],
    victims: [
      ...(f.peopleCount !== null ? [F(`Указано пострадавших / людей: ${f.peopleCount}.`)] : []),
      ...(f.trapped ? [F('Есть блокированные пострадавшие — требуется деблокирование.')] : [A('Возможны пострадавшие, зажатые в деформированных ТС.')]),
      ...(bus ? [A('При ДТП с автобусом вероятны массовые пострадавшие — нужна медицинская сортировка.')] : []),
    ],
    resources: [
      { kind: 'truck', title: 'АЦ + АСА', value: bus ? '2 АЦ + 2 АСА' : '1 АЦ + 1 АСА', note: 'Прикрытие и гидравлический инструмент', basis: 'recommendation' },
      { kind: 'medical', title: 'Медицинская помощь', value: bus ? '4+ бригады СМП' : '2 бригады СМП', note: 'Сортировка при массовых пострадавших', basis: 'recommendation' },
      { kind: 'personnel', title: 'Дополнительный личный состав', value: '1 отделение', note: 'Деблокирование, переноска', basis: 'recommendation' },
      { kind: 'special', title: 'Сорбент', value: '50 кг', note: 'Для разлива топлива', basis: 'recommendation' },
    ],
    actions: [
      { step: 1, priority: 'immediate', text: 'Оградить место, выставить пост безопасности, совместно с полицией ограничить движение.' },
      { step: 2, priority: 'immediate', text: 'Разведка: количество ТС и пострадавших, утечка топлива, угроза возгорания.' },
      { step: 3, priority: 'immediate', text: 'Стабилизировать ТС, отключить АКБ.' },
      { step: 4, priority: 'high', text: 'Деблокирование гидравлическим инструментом с обеспечением доступа медиков.' },
      { step: 5, priority: 'high', text: 'АЦ со стволом наготове, засыпать разлитое топливо сорбентом.' },
      { step: 6, priority: 'normal', text: 'Передача пострадавших СМП, доклад в ЦУКС.' },
    ],
    safety: [
      R('Работать в светоотражающих жилетах, знаки и конусы на достаточном удалении.'),
      R('Учитывать зоны раскрытия несработавших подушек безопасности.'),
      R('Исключить источники зажигания при разливе топлива.'),
    ],
    missingInfo: [
      ...(f.peopleCount === null ? [{ question: 'Сколько пострадавших и в каком состоянии?', why: 'Определяет число бригад СМП.' }] : []),
      { question: 'Есть ли утечка топлива / признаки возгорания?', why: 'Определяет меры пожарной безопасности.' },
      { question: 'Тип ТС (электромобиль, газобаллонное оборудование)?', why: 'Особые меры при деблокировании.' },
    ],
  };
}

function hazmat(f: ExtractedFacts): Core {
  return {
    scenario: 'hazmat',
    ragQuery: 'АХОВ аммиак хлор утечка химическая разведка оцепление наветренная',
    classification: { category: 'Техногенная ЧС', subtype: `Авария с опасным веществом${f.chemical ? ` (${f.chemical})` : ''}`, confidence: 0.84 },
    threat: {
      level: 'critical',
      rationale: [
        ...(f.chemical ? [F(`Вещество: ${f.chemical} (сообщено).`)] : [A('Вещество не установлено — принимается наихудший вариант.')]),
        ...(f.windMs ? [F(`Ветер ${f.windMs} м/с.`)] : []),
        A('Токсическое облако распространяется по ветру.'),
      ],
    },
    hazards: [
      A('Токсическое поражение персонала и населения по направлению ветра.'),
      A('Взрыв / пожар при горючих веществах.'),
      A('Заражение техники и личного состава.'),
    ],
    victims: [
      ...(f.peopleCount !== null ? [F(`Указано людей: ${f.peopleCount}.`)] : []),
      A('Возможны пострадавшие с признаками отравления среди персонала и в зоне облака.'),
    ],
    resources: [
      { kind: 'personnel', title: 'Отделение РХБЗ', value: '1', note: 'Химразведка и дегазация', basis: 'recommendation' },
      { kind: 'breathing', title: 'Изолирующие СИЗОД + костюмы химзащиты', value: '8 комплектов', note: 'По типу вещества', basis: 'recommendation' },
      { kind: 'truck', title: 'АЦ для водяных завес', value: '2', note: 'Для растворимых веществ', basis: 'recommendation' },
      { kind: 'drone', title: 'БПЛА', value: '1', note: 'Дистанционная разведка облака', basis: 'recommendation' },
      { kind: 'medical', title: 'Медицинская помощь', value: '2 бригады', note: 'Токсикологическая помощь', basis: 'recommendation' },
    ],
    actions: [
      { step: 1, priority: 'immediate', text: 'Подъезд и работа только с наветренной стороны; определить зону оцепления.' },
      { step: 2, priority: 'immediate', text: 'Химическая разведка: вещество, источник, направление распространения.' },
      { step: 3, priority: 'immediate', text: 'Вывод людей из опасной зоны перпендикулярно направлению ветра, оповещение.' },
      { step: 4, priority: 'high', text: 'Работа в средствах химзащиты с ограничением времени.' },
      { step: 5, priority: 'high', text: 'Водяные завесы для осаждения облака (для растворимых веществ).' },
      { step: 6, priority: 'normal', text: 'Пункт дегазации л/с и техники, медицинская помощь пострадавшим.' },
    ],
    safety: [
      R('Запрещено находиться с подветренной стороны без средств химзащиты.'),
      R('При смене ветра немедленно перенести штаб и пункты сбора.'),
      R('Ограничивать время работы в изолирующих костюмах, особенно при жаре.'),
    ],
    missingInfo: [
      ...(!f.chemical ? [{ question: 'Какое вещество и в каком количестве?', why: 'Определяет СИЗ, зону и способы нейтрализации.' }] : []),
      ...(!f.windMs ? [{ question: 'Направление и скорость ветра?', why: 'Определяет зону заражения и пути эвакуации.' }] : []),
      { question: 'Расстояние до жилой застройки?', why: 'Определяет масштаб оповещения.' },
    ],
  };
}

function collapse(f: ExtractedFacts): Core {
  return {
    scenario: 'collapse',
    ragQuery: 'обрушение завал устойчивость конструкций поиск пострадавших',
    classification: { category: 'Техногенная ЧС', subtype: 'Обрушение здания / конструкций', confidence: 0.85 },
    threat: {
      level: f.peopleMentioned || f.trapped ? 'critical' : 'high',
      rationale: [
        ...(f.trapped ? [F('Сообщено о людях под завалом / блокированных.')] : []),
        A('Угроза повторного обрушения неустойчивых конструкций.'),
      ],
    },
    hazards: [
      A('Повторное обрушение конструкций.'),
      ...(f.gas ? [F('Упомянут газ — угроза взрыва.')] : [A('Повреждение газовых и электрических коммуникаций.')]),
      A('Пыль, ограниченная видимость, травмы л/с.'),
    ],
    victims: [
      ...(f.peopleCount !== null ? [F(`Указано людей: ${f.peopleCount}.`)] : []),
      A('Вероятны пострадавшие в пустотах завала; время критично (первые часы).'),
    ],
    resources: [
      { kind: 'personnel', title: 'Поисково-спасательная группа', value: '2 отделения', note: 'Разбор завала вручную', basis: 'recommendation' },
      { kind: 'special', title: 'Кинологи / приборы поиска', value: '2 расчета + акустика', note: 'Поиск в пустотах', basis: 'recommendation' },
      { kind: 'special', title: 'Средства крепления', value: 'Комплект', note: 'Упоры, клинья, подпорки', basis: 'recommendation' },
      { kind: 'medical', title: 'Медицинская помощь', value: '2 бригады', note: 'Синдром длительного сдавления', basis: 'recommendation' },
      { kind: 'truck', title: 'Тяжелая техника', value: 'По решению', note: 'Только после поиска и маркировки мест', basis: 'recommendation' },
    ],
    actions: [
      { step: 1, priority: 'immediate', text: 'Оценить устойчивость конструкций, выставить наблюдателя, определить сигнал отхода.' },
      { step: 2, priority: 'immediate', text: 'Отключить газ, электричество, воду.' },
      { step: 3, priority: 'immediate', text: 'Поиск пострадавших: опрос, кинологи, акустика, «минута тишины».' },
      { step: 4, priority: 'high', text: 'Крепление конструкций, разбор завала вручную в местах нахождения людей.' },
      { step: 5, priority: 'high', text: 'Медицинская помощь с учетом синдрома длительного сдавления.' },
      { step: 6, priority: 'normal', text: 'Тяжелая техника — после маркировки мест нахождения людей.' },
    ],
    safety: [
      R('Не входить под неустойчивые конструкции без крепления и наблюдателя.'),
      R('Не применять тяжелую технику до завершения поиска.'),
      R('Использовать каски, респираторы, страховку.'),
    ],
    missingInfo: [
      { question: 'Сколько людей могло находиться в здании?', why: 'Определяет объем поиска.' },
      { question: 'Тип конструкции и этажность?', why: 'Оценка пустот и устойчивости.' },
      { question: 'Отключены ли газ и электричество?', why: 'Безопасность работ.' },
    ],
  };
}

function generic(f: ExtractedFacts): Core {
  return {
    scenario: 'generic',
    ragQuery: 'разведка безопасность ликвидация ЧС',
    classification: { category: 'Не определена', subtype: 'Тип происшествия требует уточнения', confidence: 0.3 },
    threat: { level: f.peopleMentioned ? 'high' : 'medium', rationale: [A('Недостаточно данных; уровень угрозы оценен предварительно.')] },
    hazards: [A('Возможная угроза жизни людей — характер опасности не установлен.')],
    victims: f.peopleMentioned ? [F('Упомянуты люди в зоне происшествия.')] : [A('Сведения о пострадавших отсутствуют.')],
    resources: [
      { kind: 'truck', title: 'Дежурные силы', value: 'По решению', note: 'После разведки', basis: 'recommendation' },
      { kind: 'drone', title: 'БПЛА', value: 'Рекомендуется', note: 'Разведка обстановки', basis: 'recommendation' },
    ],
    actions: [
      { step: 1, priority: 'immediate', text: 'Уточнить характер происшествия, адрес, число людей в зоне опасности.' },
      { step: 2, priority: 'immediate', text: 'Провести разведку и определить решающее направление.' },
      { step: 3, priority: 'high', text: 'Обеспечить безопасность л/с, оградить опасную зону.' },
      { step: 4, priority: 'normal', text: 'Запросить силы, доложить в ЦУКС.' },
    ],
    safety: [R('Не входить в зону неизвестной опасности без разведки и СИЗ.')],
    missingInfo: [
      { question: 'Что произошло (пожар, ДТП, паводок, обрушение, утечка)?', why: 'Без этого невозможна классификация.' },
      { question: 'Где и сколько людей в опасности?', why: 'Определяет приоритет спасения.' },
    ],
  };
}

export function classify(message: string): (f: ExtractedFacts) => Core {
  const t = norm(message);
  if (has(t, /(утечк|аммиак|хлор|химич|ахов|выброс|опасн[а-яa-z0-9]* вещ|ртут)/)) return hazmat;
  if (has(t, /(обрушен|завал|рухнул|разрушен)/)) return collapse;
  if (has(t, /(паводок|наводн|подтоп|затоп|разлив рек|уровень воды|затор)/)) return flood;
  if (has(t, /(пожар|горит|возгора|огонь|пламя|задым|дым)/)) {
    return has(t, /(степ|лес|поле|камыш|ландшафт|трав|сухост)/) ? wildfire : buildingFire;
  }
  if (has(t, /(дтп|столкнов|автомоб|машин|автобус|трасс|опрокин|фур|грузовик)/)) return roadAccident;
  return generic;
}

/** Поисковый запрос к нормативной базе для данного сообщения */
export function assistantRagQuery(message: string): string {
  return `${classify(message)(extractFacts(message)).ragQuery} ${message}`;
}

/**
 * @param hits — фрагменты нормативной базы, найденные по assistantRagQuery(message)
 *               (браузер: локальный индекс; сервер: векторное хранилище). Уже отфильтрованы по порогу.
 */
export function runAssistant(message: string, hits: Hit[]): AssistantResponse {
  const f = extractFacts(message);
  const core = classify(message)(f);
  const citations = hits.slice(0, 3).map((h) => toCitation(h.chunk, h.score));
  const officialConnected = citations.some((c) => c.official);
  const { ragQuery: _q, ...rest } = core;
  void _q;
  return {
    ...rest,
    facts: f.list.length ? f.list : ['Сообщение не содержит конкретных параметров (этаж, количество людей, ветер и т. п.).'],
    regulations: {
      officialConnected,
      citations,
      message: officialConnected
        ? 'Ниже — фрагменты загруженных официальных документов. Сверяйте с первоисточником.'
        : `${NOT_CONNECTED}${citations.length ? ' Показаны фрагменты демонстрационных документов (условные тексты) — только для иллюстрации работы поиска.' : ''}`,
    },
  };
}
