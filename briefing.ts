/**
 * AI OPERATIONAL BRIEFING — структурированный брифинг по происшествию.
 * Факты берутся ТОЛЬКО из структурированных данных (происшествие, метео, план сил) — source: 'data'.
 * Выводы правил помечаются 'derived', пробелы — 'unknown'. Модель (LIVE) может добавить
 * связный текст (narrative), но backend отбрасывает его, если в нем есть числа, которых нет в данных.
 */
import type { BriefItem, DeploymentPlan, MapObject, ObjectType, OperationalBriefing, ThreatLevel, WeatherObs } from '../contracts.js';
import { L, fill, tx, type L3, type Lang } from '../i18n.js';
import { UNIT_KIND_LABEL } from './resources.js';

const d = (text: string): BriefItem => ({ text, source: 'data' });
const r = (text: string): BriefItem => ({ text, source: 'derived' });
const u = (text: string): BriefItem => ({ text, source: 'unknown' });

/** Локализованное поле демо-данных (если перевода нет — исходное значение) */
export function locField<K extends 'title' | 'description' | 'status' | 'region'>(o: MapObject, k: K, lang: Lang): string {
  return (o.tr?.[lang]?.[k] as string | undefined) ?? (o[k] as string | undefined) ?? '';
}
export const locDetails = (o: MapObject, lang: Lang) => o.detailsTr?.[lang] ?? o.details ?? [];

const THREATS: Record<ObjectType, L3[]> = {
  fire: [
    L('Распространение горения на соседние помещения и конструкции', 'Жанудың көрші үй-жайлар мен құрылымдарға таралуы', 'Fire spread to adjacent rooms and structures'),
    L('Задымление путей эвакуации, отравление продуктами горения', 'Эвакуация жолдарының түтінденуі, жану өнімдерімен улану', 'Smoke-logged escape routes, smoke poisoning'),
    L('Обрушение конструкций при длительном горении', 'Ұзақ жанғанда құрылымдардың опырылуы', 'Structural collapse during prolonged burning'),
  ],
  flood: [
    L('Дальнейший подъем уровня воды', 'Су деңгейінің одан әрі көтерілуі', 'Further rise of the water level'),
    L('Переохлаждение людей, находящихся в воде или без отопления', 'Суда немесе жылусыз қалған адамдардың тоңуы', 'Hypothermia of people in water or without heating'),
    L('Поражение током в подтопленных строениях', 'Су басқан ғимараттарда электр тогының соғуы', 'Electric shock in flooded buildings'),
  ],
  accident: [
    L('Возгорание при разливе топлива', 'Жанармай төгілгенде тұтану', 'Ignition of spilled fuel'),
    L('Наезд попутного транспорта на место работ', 'Ілеспе көліктің жұмыс орнына соғылуы', 'Passing traffic striking the work area'),
    L('Ухудшение состояния зажатых пострадавших', 'Қысылып қалған зардап шеккендердің жағдайының нашарлауы', 'Deterioration of trapped casualties'),
  ],
  hazard: [
    L('Распространение облака опасного вещества по ветру', 'Қауіпті зат бұлтының жел бағытымен таралуы', 'Downwind spread of the hazardous plume'),
    L('Поражение людей без средств защиты', 'Қорғаныс құралдарынсыз адамдардың зақымдануы', 'Exposure of unprotected people'),
    L('Вторичные аварии: пожар, разрушение емкостей', 'Қайталама апаттар: өрт, ыдыстардың бұзылуы', 'Secondary incidents: fire, container failure'),
  ],
  unit: [], hospital: [], water: [],
};
const PRIORITIES: Record<ObjectType, L3[]> = {
  fire: [
    L('Спасение и эвакуация людей из зоны задымления', 'Түтін аймағынан адамдарды құтқару және көшіру', 'Rescue and evacuation of people from the smoke zone'),
    L('Локализация горения на решающем направлении', 'Шешуші бағытта жануды оқшаулау', 'Contain the fire on the decisive direction'),
    L('Безопасность личного состава: ГДЗС, пути отхода', 'Жеке құрамның қауіпсіздігі: ГТҚҚ, шегіну жолдары', 'Crew safety: breathing apparatus, escape routes'),
    L('Бесперебойное водоснабжение', 'Үздіксіз сумен жабдықтау', 'Uninterrupted water supply'),
  ],
  flood: [
    L('Спасение людей из подтопленных домов', 'Су басқан үйлерден адамдарды құтқару', 'Rescue people from flooded houses'),
    L('Оповещение и эвакуация в пункты временного размещения', 'Хабарлау және уақытша орналастыру пункттеріне көшіру', 'Warning and evacuation to temporary shelters'),
    L('Обесточивание подтопленных улиц', 'Су басқан көшелерді ток көзінен ажырату', 'De-energize flooded streets'),
    L('Мониторинг уровня воды и состояния дамб', 'Су деңгейі мен бөгеттердің жай-күйін бақылау', 'Monitor water level and dams'),
  ],
  accident: [
    L('Безопасность места работ: ограждение, регулирование движения', 'Жұмыс орнының қауіпсіздігі: қоршау, қозғалысты реттеу', 'Scene safety: cordon and traffic control'),
    L('Стабилизация ТС и деблокирование пострадавших', 'Көлікті тұрақтандыру және зардап шеккендерді бұғаттан шығару', 'Vehicle stabilisation and extrication'),
    L('Медицинская сортировка и передача СМП', 'Медициналық сұрыптау және ЖМК-ға тапсыру', 'Medical triage and handover to ambulance'),
  ],
  hazard: [
    L('Определение вещества и зоны заражения', 'Затты және зақымдану аймағын анықтау', 'Identify the substance and hazard zone'),
    L('Работа только в средствах защиты, с наветренной стороны', 'Тек қорғаныс құралдарында, жел жақтан жұмыс істеу', 'Work only in protective gear, from upwind'),
    L('Оповещение и защита населения по направлению ветра', 'Жел бағытындағы халықты хабарлау және қорғау', 'Warn and protect the population downwind'),
    L('Устранение источника утечки', 'Ағу көзін жою', 'Stop the source of the leak'),
  ],
  unit: [], hospital: [], water: [],
};
const QUESTIONS: Record<ObjectType, L3[]> = {
  fire: [
    L('Подтверждено ли наличие людей в здании и где именно?', 'Ғимаратта адамдар бар екені расталды ма және нақты қай жерде?', 'Is the presence of people in the building confirmed, and where exactly?'),
    L('Какие пути эвакуации свободны от дыма?', 'Қандай эвакуация жолдары түтінсіз?', 'Which escape routes are free of smoke?'),
    L('Отключены ли электро- и газоснабжение?', 'Электр және газбен жабдықтау ажыратылды ма?', 'Have electricity and gas been shut off?'),
  ],
  flood: [
    L('Сколько домов с людьми, не вышедшими на связь?', 'Байланысқа шықпаған адамдары бар қанша үй бар?', 'How many houses have occupants who have not made contact?'),
    L('Каков прогноз уровня воды на ближайшие 6–12 часов (по данным официальной гидрослужбы)?', 'Алдағы 6–12 сағатқа су деңгейінің болжамы қандай (ресми гидрологиялық қызмет деректері бойынша)?', 'What is the water level forecast for the next 6–12 hours (per the official hydrological service)?'),
    L('Готовы ли пункты временного размещения?', 'Уақытша орналастыру пункттері дайын ба?', 'Are temporary shelters ready?'),
  ],
  accident: [
    L('Сколько пострадавших и сколько из них зажаты?', 'Қанша зардап шеккен бар және олардың қаншасы қысылып қалған?', 'How many casualties are there and how many are trapped?'),
    L('Есть ли разлив топлива или газобаллонное оборудование?', 'Жанармай төгілді ме немесе газ баллонды жабдық бар ма?', 'Is there a fuel spill or LPG equipment?'),
    L('Перекрыто ли движение и кем?', 'Қозғалыс жабылды ма және кім жапты?', 'Has traffic been stopped, and by whom?'),
  ],
  hazard: [
    L('Какое вещество и в каком количестве вышло?', 'Қандай зат және қанша мөлшерде шықты?', 'Which substance was released and in what quantity?'),
    L('Выведен ли персонал и есть ли пострадавшие?', 'Персонал шығарылды ма және зардап шеккендер бар ма?', 'Has staff been evacuated and are there casualties?'),
    L('Какие жилые кварталы находятся по направлению ветра?', 'Жел бағытында қандай тұрғын кварталдар орналасқан?', 'Which residential areas lie downwind?'),
  ],
  unit: [], hospital: [], water: [],
};

/** Природный (ландшафтный) пожар: степь, лес, камыш */
const WILD_THREATS: L3[] = [
  L('Быстрое распространение фронта огня по ветру', 'Өрт шебінің жел бойымен жылдам таралуы', 'Rapid downwind spread of the fire front'),
  L('Угроза населенным пунктам, дачам и объектам на пути огня', 'Өрт жолындағы елді мекендерге, саяжайларға және нысандарға қауіп', 'Threat to settlements, dachas and facilities in the fire path'),
  L('Окружение личного состава огнем при смене ветра', 'Жел ауысқанда жеке құрамды өрттің қоршап алуы', 'Crews encircled by fire if the wind shifts'),
  L('Задымление дорог и снижение видимости', 'Жолдардың түтіндеуі және көрінудің нашарлауы', 'Smoke over roads and reduced visibility'),
];
const WILD_PRIORITIES: L3[] = [
  L('Защита людей и населенных пунктов на пути огня, своевременная эвакуация', 'Өрт жолындағы адамдар мен елді мекендерді қорғау, уақытылы көшіру', 'Protect people and settlements in the fire path; evacuate in time'),
  L('Безопасность личного состава: пути отхода, наблюдатель, связь', 'Жеке құрам қауіпсіздігі: шегіну жолдары, бақылаушы, байланыс', 'Crew safety: escape routes, lookout, communications'),
  L('Локализация: тушение кромки с флангов, минерализованные полосы', 'Оқшаулау: жиекті қапталдан сөндіру, минералданған жолақтар', 'Containment: flank attack on the edge, firebreaks'),
  L('Водоснабжение и подвоз воды', 'Сумен жабдықтау және су тасымалдау', 'Water supply and water shuttle'),
];
const WILD_QUESTIONS: L3[] = [
  L('Какие населенные пункты и объекты находятся по направлению распространения?', 'Таралу бағытында қандай елді мекендер мен нысандар бар?', 'Which settlements and facilities lie in the direction of spread?'),
  L('Есть ли люди в зоне пожара (туристы, чабаны, дачники)?', 'Өрт аймағында адамдар бар ма (туристер, шопандар, саяжайшылар)?', 'Are there people in the fire zone (tourists, herders, dacha residents)?'),
  L('Какой прогноз ветра на ближайшие часы (по данным официальной метеослужбы)?', 'Алдағы сағаттарға жел болжамы қандай (ресми метеоқызмет деректері бойынша)?', 'What is the wind forecast for the coming hours (per the official weather service)?'),
];
export const isWildfire = (inc: MapObject) => inc.type === 'fire' && /(степ|лес|бор\b|бору|камыш|сухост|растительн|\bга\b)/i.test(`${inc.title} ${inc.description} ${(inc.details ?? []).map((d) => d.value).join(' ')}`);

const T = {
  where: L('Место: {v}', 'Орны: {v}', 'Location: {v}'),
  when: L('Время сообщения: {v}', 'Хабарлама уақыты: {v}', 'Time reported: {v}'),
  status: L('Текущий статус: {v}', 'Ағымдағы мәртебе: {v}', 'Current status: {v}'),
  known: L('Известно о людях: {v}', 'Адамдар туралы белгілі: {v}', 'People reported: {v}'),
  atRisk: L('В зоне опасности: {v}', 'Қауіпті аймақта: {v}', 'In the danger zone: {v}'),
  evac: L('Эвакуировано: {v}', 'Көшірілді: {v}', 'Evacuated: {v}'),
  injured: L('Пострадавших: {v}', 'Зардап шеккендер: {v}', 'Injured: {v}'),
  peopleUnknown: L('Число пострадавших и людей в зоне ЧС не подтверждено.', 'Зардап шеккендер мен ТЖ аймағындағы адамдар саны расталмаған.', 'The number of casualties and people in the affected area is not confirmed.'),
  temp: L('Температура воздуха: {v} °C', 'Ауа температурасы: {v} °C', 'Air temperature: {v} °C'),
  wind: L('Ветер: {dir}, {v} м/с', 'Жел: {dir}, {v} м/с', 'Wind: {dir}, {v} m/s'),
  hum: L('Влажность: {v} %', 'Ылғалдылық: {v} %', 'Humidity: {v} %'),
  precip: L('Осадки: {v}', 'Жауын-шашын: {v}', 'Precipitation: {v}'),
  wsrc: L('Источник метеоданных: {v}', 'Метеодеректер көзі: {v}', 'Weather source: {v}'),
  noWeather: L('Метеоданные для этого района не подключены — уточнить у официальной метеослужбы.', 'Бұл аудан үшін метеодеректер қосылмаған — ресми метеоқызметтен нақтылау қажет.', 'No weather data connected for this area — confirm with the official weather service.'),
  windSpread: L('Ветер свыше 10 м/с ускоряет распространение огня и дыма.', '10 м/с-тан жоғары жел от пен түтіннің таралуын жылдамдатады.', 'Wind above 10 m/s accelerates the spread of fire and smoke.'),
  cold: L('Отрицательная температура: риск переохлаждения людей и личного состава.', 'Теріс температура: адамдар мен жеке құрамның тоңу қаупі.', 'Sub-zero temperature: risk of hypothermia for people and crews.'),
  dry: L('Низкая влажность: высокая пожарная опасность растительности.', 'Төмен ылғалдылық: өсімдіктердің өрт қаупі жоғары.', 'Low humidity: high wildfire danger.'),
  plan: L('Предложено к направлению (DEMO): {v}', 'Жіберуге ұсынылған (DEMO): {v}', 'Suggested for dispatch (DEMO): {v}'),
  eta: L('Ожидаемое прибытие последней единицы: ≈ {v} мин', 'Соңғы бірліктің күтілетін келуі: ≈ {v} мин', 'Expected arrival of the last unit: ≈ {v} min'),
  short: L('Не хватает: {v}', 'Жетіспейді: {v}', 'Shortage: {v}'),
  noPlan: L('Данные о свободных силах не подключены.', 'Бос күштер туралы деректер қосылмаған.', 'No data on available forces is connected.'),
  report: L('Доклад в ЦУКС и оперативному дежурному о развитии обстановки', 'Жағдайдың дамуы туралы ДЖБО-ға және жедел кезекшіге баяндау', 'Report developments to the crisis centre and duty officer'),
  gapPeople: L('Точное число людей в зоне ЧС', 'ТЖ аймағындағы адамдардың нақты саны', 'Exact number of people in the affected area'),
  gapWeather: L('Фактическая погода на месте', 'Орындағы нақты ауа райы', 'Actual on-scene weather'),
  gapSubstance: L('Вид и количество опасного вещества', 'Қауіпті заттың түрі мен мөлшері', 'Type and quantity of the hazardous substance'),
  gapStructure: L('Состояние несущих конструкций', 'Көтергіш құрылымдардың жай-күйі', 'Condition of load-bearing structures'),
  gapWater: L('Ближайшие исправные водоисточники', 'Жақын маңдағы жарамды су көздері', 'Nearest serviceable water sources'),
  gapForces: L('Какие силы уже направлены и их фактическое время прибытия', 'Қандай күштер жіберілді және олардың нақты келу уақыты', 'Which forces are already dispatched and their actual arrival time'),
  qWeather: L('Какие метеоусловия подтверждены на месте?', 'Орында қандай метеожағдайлар расталды?', 'Which weather conditions are confirmed on scene?'),
};

export interface BriefingInput { incident: MapObject; weather?: WeatherObs | null; plan?: DeploymentPlan | null; lang?: Lang }

export function briefingEngine({ incident: inc, weather, plan, lang = 'ru' }: BriefingInput): OperationalBriefing {
  const f = (v: L3, p: Record<string, string | number> = {}) => fill(tx(lang, v), p);
  const threat: ThreatLevel = inc.threat ?? 'medium';

  const situation: BriefItem[] = [
    d(`${locField(inc, 'title', lang)}. ${locField(inc, 'description', lang)}`),
    d(f(T.where, { v: locField(inc, 'region', lang) })),
    ...(inc.time ? [d(f(T.when, { v: inc.time }))] : []),
    ...(inc.status ? [d(f(T.status, { v: locField(inc, 'status', lang) }))] : []),
    ...locDetails(inc, lang).map((x) => d(`${x.label}: ${x.value}`)),
  ];

  const w = weather ?? null;
  const wild = isWildfire(inc);
  const threats: BriefItem[] = (wild ? WILD_THREATS : THREATS[inc.type]).map((x) => r(tx(lang, x)));
  if (w && w.windMs >= 10) threats.push(r(tx(lang, T.windSpread)));
  if (w && w.temp < 0) threats.push(r(tx(lang, T.cold)));
  if (w && w.humidity < 25 && inc.type === 'fire') threats.push(r(tx(lang, T.dry)));

  const p = inc.people ?? {};
  const people: BriefItem[] = [];
  if (p.known != null) people.push(d(f(T.known, { v: p.known })));
  if (p.atRisk != null) people.push(d(f(T.atRisk, { v: p.atRisk })));
  if (p.evacuated != null) people.push(d(f(T.evac, { v: p.evacuated })));
  if (p.injured != null) people.push(d(f(T.injured, { v: p.injured })));
  if (!people.length) people.push(u(tx(lang, T.peopleUnknown)));

  const weatherItems: BriefItem[] = w
    ? [d(f(T.temp, { v: w.temp })), d(f(T.wind, { dir: w.windDir, v: w.windMs })), d(f(T.hum, { v: w.humidity })), d(f(T.precip, { v: w.precip })), d(f(T.wsrc, { v: w.source }))]
    : [u(tx(lang, T.noWeather))];

  const resources: BriefItem[] = [];
  if (plan && plan.suggestions.length) {
    const byKind = new Map<string, number>();
    plan.suggestions.forEach((s) => byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + 1));
    resources.push(d(f(T.plan, { v: [...byKind].map(([k, n]) => `${tx(lang, UNIT_KIND_LABEL[k as keyof typeof UNIT_KIND_LABEL])} × ${n}`).join(', ') })));
    resources.push(d(f(T.eta, { v: plan.maxEtaMin })));
    if (plan.shortages.length) resources.push(r(f(T.short, { v: plan.shortages.map((s) => `${tx(lang, UNIT_KIND_LABEL[s.kind])} × ${s.missing}`).join(', ') })));
  } else resources.push(u(tx(lang, T.noPlan)));

  const priorities = [...(wild ? WILD_PRIORITIES : PRIORITIES[inc.type]).map((x) => r(tx(lang, x)))];
  if (threat === 'high' || threat === 'critical') priorities.push(r(tx(lang, T.report)));

  const gaps: BriefItem[] = [];
  if (!inc.people || p.atRisk == null) gaps.push(u(tx(lang, T.gapPeople)));
  if (!w) gaps.push(u(tx(lang, T.gapWeather)));
  if (inc.type === 'hazard') gaps.push(u(tx(lang, T.gapSubstance)));
  if (inc.type === 'fire') { if (!wild) gaps.push(u(tx(lang, T.gapStructure))); gaps.push(u(tx(lang, T.gapWater))); }
  gaps.push(u(tx(lang, T.gapForces)));

  const questions = (wild ? WILD_QUESTIONS : QUESTIONS[inc.type]).map((x) => r(tx(lang, x)));
  if (!w) questions.push(r(tx(lang, T.qWeather)));

  return {
    incidentId: inc.id, title: locField(inc, 'title', lang), generatedAt: new Date().toISOString(), threat,
    situation, threats, people, weather: weatherItems, resources, priorities, gaps, questions,
  };
}

/** Числа, которые разрешено использовать модели в narrative (все числа из структурированных данных) */
export function briefingNumbers(b: OperationalBriefing): Set<string> {
  const all = [b.situation, b.people, b.weather, b.resources].flat().map((i) => i.text).join(' ');
  return new Set(all.match(/\d+(?:[.,]\d+)?/g) ?? []);
}
