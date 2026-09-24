/**
 * After-action analysis (AAR): разбор текста донесения / отчета о происшествии.
 * Работает на правилах: временные метки → хронология, ключевые слова → решения,
 * задержки, риски, ресурсы, проблемы связи. Каждый вывод ссылается на строку-доказательство.
 * Это АНАЛИТИЧЕСКАЯ ПОМОЩЬ, а не официальное расследование.
 */
import type { AarFinding, AarTimelineItem, AfterActionReport, PastIncident } from '../contracts.js';
import { norm } from './text.js';

export const AAR_LABEL = 'Аналитическая помощь. Не является официальным расследованием или служебной проверкой.';

const CATS: { cat: string; re: RegExp }[] = [
  { cat: 'Вызов', re: /(поступ[а-яa-z0-9]* (вызов|сообщ|звон)|вызов|сообщение о)/ },
  { cat: 'Выезд', re: /(выезд|выехал|выдвинул)/ },
  { cat: 'Прибытие', re: /(прибы|прибыт|на место)/ },
  { cat: 'Разведка', re: /(развед|обследов|осмотр)/ },
  { cat: 'Развертывание', re: /(разверн|развертыв|подан[а-яa-z0-9]* ствол|подача ствол|установ[а-яa-z0-9]* на (гидрант|водоисточ))/ },
  { cat: 'Спасение', re: /(спас|эвакуир|вывед|деблок|извлеч)/ },
  { cat: 'Запрос сил', re: /(запрос|вызван[а-яa-z0-9]* дополн|повышен[а-яa-z0-9]* номер|подкрепл|привлечен)/ },
  { cat: 'Локализация', re: /(локализ)/ },
  { cat: 'Ликвидация', re: /(ликвидир|ликвидац|потушен)/ },
];
const DECISION = /(принят[а-яa-z0-9]* решени|ртп|руководител[а-яa-z0-9]*|решил|приказ|направ[а-яa-z0-9]*|организов[а-яa-z0-9]*|подать|отвести|запросил)/;
const DELAY = /(задерж|опозд|долго|ожидан|не удалось|неисправ|затор|пробк|не смогл|спустя|позже|отсутств)/;
const COMMS = /(связ|рация|радиостанц|не отвеч|не доложил|помех|не слыш|ретранслят|телефон|доклад[а-яa-z0-9]* (с опозд|не))/;
const RISK = /(угроз|обрушен|взрыв|задымл|ток(?![а-я])|электр|газ|отравл|травм|вспышк|окружен|течени|лед|сильн[а-яa-z0-9]* ветер)/;
const RES = /(\d+)\s*(ац|ал|аса|анр|апт|бпла|лодк[а-яa-z0-9]*|отделени[а-яa-z0-9]*|расчет[а-яa-z0-9]*|ед\.?|единиц[а-яa-z0-9]* техники|чел\.?|человек|дасв|сизод|звен[а-яa-z0-9]* гдзс|бригад[а-яa-z0-9]* смп|дымосос[а-яa-z0-9]*|мотопомп[а-яa-z0-9]*)/g;

function toMin(h: number, m: number) { return h * 60 + m; }

export function analyzeReportText(input: { title: string; text: string; source: string }): AfterActionReport {
  const lines = input.text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const timeline: AarTimelineItem[] = [];
  const keyDecisions: AarFinding[] = [];
  const delays: AarFinding[] = [];
  const risks: AarFinding[] = [];
  const communication: AarFinding[] = [];
  const resources: { item: string; count: string; evidence: string }[] = [];
  const dataQuality: string[] = [];
  let dayOffset = 0;
  let lastMin = -1;

  lines.forEach((line, i) => {
    const ln = norm(line);
    const ref = `строка ${i + 1}`;
    const tm = line.match(/(?:^|\D)([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/);
    if (tm) {
      let m = toMin(Number(tm[1]), Number(tm[2])) + dayOffset;
      if (lastMin >= 0 && m < lastMin - 360) { dayOffset += 1440; m += 1440; }
      lastMin = m;
      const text = line.replace(tm[0], ' ').replace(/^[\s—–:-]+/, '').trim();
      const cat = CATS.find((c) => c.re.test(norm(text)))?.cat ?? 'Событие';
      timeline.push({ time: `${tm[1].padStart(2, '0')}:${tm[2]}`, minute: m, text, category: cat, line: i + 1 });
    }
    if (DECISION.test(ln)) keyDecisions.push({ text: line, kind: 'fact', evidence: ref });
    if (DELAY.test(ln)) delays.push({ text: line, kind: 'fact', evidence: ref });
    if (RISK.test(ln)) risks.push({ text: line, kind: 'fact', evidence: ref });
    if (COMMS.test(ln)) communication.push({ text: line, kind: 'fact', evidence: ref });
    if (!/(спас|обнаруж|пострадав|жител|погиб|отравл|жильц)/.test(ln)) for (const m of ln.matchAll(RES)) {
      resources.push({ item: m[2].replace(/\.$/, ''), count: m[1], evidence: ref });
    }
  });

  timeline.sort((a, b) => a.minute - b.minute);
  const first = (cat: string) => timeline.find((x) => x.category === cat);
  const call = first('Вызов') ?? timeline[0];
  const arrival = first('Прибытие');
  const departure = first('Выезд');
  const deploy = first('Развертывание');
  const loc = first('Локализация');
  const liq = first('Ликвидация');
  const metrics: { label: string; value: string }[] = [];
  const fmt = (m: number) => (m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60} мин`);

  if (call && departure) {
    const d = departure.minute - call.minute;
    metrics.push({ label: 'Вызов → выезд', value: fmt(d) });
    if (d > 3) delays.push({ text: `Сбор и выезд заняли ${d} мин (ориентир для анализа — до 3 мин).`, kind: 'assumption', evidence: `строки ${call.line}, ${departure.line}` });
  }
  if (call && arrival) {
    const d = arrival.minute - call.minute;
    metrics.push({ label: 'Вызов → прибытие', value: fmt(d) });
    if (d > 10) delays.push({ text: `Прибытие через ${d} мин после вызова — выше условного ориентира 10 мин для городской застройки.`, kind: 'assumption', evidence: `строки ${call.line}, ${arrival.line}` });
  }
  if (arrival && deploy) {
    const d = deploy.minute - arrival.minute;
    metrics.push({ label: 'Прибытие → развертывание', value: fmt(d) });
    if (d > 8) delays.push({ text: `Развертывание заняло ${d} мин после прибытия.`, kind: 'assumption', evidence: `строки ${arrival.line}, ${deploy.line}` });
  }
  if (call && loc) metrics.push({ label: 'Вызов → локализация', value: fmt(loc.minute - call.minute) });
  if (call && liq) metrics.push({ label: 'Вызов → ликвидация', value: fmt(liq.minute - call.minute) });
  for (let k = 1; k < timeline.length; k++) {
    const gap = timeline[k].minute - timeline[k - 1].minute;
    if (gap >= 25 && !['Локализация', 'Ликвидация'].includes(timeline[k].category)) {
      delays.push({ text: `Интервал ${gap} мин без зафиксированных событий (${timeline[k - 1].time}–${timeline[k].time}) — проверить полноту журнала.`, kind: 'assumption', evidence: `строки ${timeline[k - 1].line}–${timeline[k].line}` });
    }
  }

  if (!timeline.length) dataQuality.push('Не найдено временных меток (ЧЧ:ММ) — хронология не построена.');
  if (!arrival) dataQuality.push('Не зафиксировано время прибытия первого подразделения.');
  if (!first('Разведка')) dataQuality.push('Не зафиксировано проведение разведки.');
  if (!resources.length) dataQuality.push('Не удалось извлечь состав сил и средств (количество + тип техники).');
  if (!communication.length) dataQuality.push('Сведения о работе связи отсутствуют — это не означает отсутствия проблем.');

  const resourceNotes: AarFinding[] = [];
  const total = (re: RegExp) => resources.filter((r) => re.test(r.item)).reduce((s, r) => s + Number(r.count), 0);
  const people = total(/^(чел|человек)/);
  const units = total(/^(ац|ал|аса|анр|апт|ед|единиц)/);
  if (people) resourceNotes.push({ text: `Упомянуто личного состава: до ${people} чел.`, kind: 'fact' });
  if (units) resourceNotes.push({ text: `Упомянуто единиц основной техники: ${units}.`, kind: 'fact' });
  if (first('Запрос сил')) resourceNotes.push({ text: `Дополнительные силы запрошены в ${first('Запрос сил')!.time}. Оцените, можно ли было запросить их раньше по данным разведки.`, kind: 'assumption' });
  if (/(дрон|бпла)/.test(norm(input.text))) resourceNotes.push({ text: 'Применялся БПЛА — зафиксируйте, как данные БПЛА повлияли на решения.', kind: 'recommendation' });

  const lessons: AarFinding[] = [];
  if (delays.some((d) => /развертыв/.test(d.text))) lessons.push({ kind: 'recommendation', text: 'Отработать развертывание от резервных водоисточников и схемы подвоза воды.' });
  if (delays.some((d) => /неисправ|гидрант/.test(norm(d.text)))) lessons.push({ kind: 'recommendation', text: 'Актуализировать данные о состоянии водоисточников в районе выезда.' });
  if (communication.length) lessons.push({ kind: 'recommendation', text: 'Провести тренировку по радиообмену и резервным каналам связи; назначить связного при штабе.' });
  if (risks.some((r) => /задымл|гдзс|сизод/.test(norm(r.text)))) lessons.push({ kind: 'recommendation', text: 'Тренировки звеньев ГДЗС в задымленных помещениях сложной планировки.' });
  if (risks.some((r) => /обрушен/.test(norm(r.text)))) lessons.push({ kind: 'recommendation', text: 'Закрепить порядок оценки устойчивости конструкций и сигналы отхода.' });
  if (!first('Разведка')) lessons.push({ kind: 'recommendation', text: 'Фиксировать в журнале время и результаты разведки — это ключевой элемент анализа.' });
  lessons.push({ kind: 'recommendation', text: 'Разобрать выводы на занятии с личным составом, закрепить ответственных за устранение замечаний.' });

  const summary = timeline.length
    ? `Проанализировано ${lines.length} строк, выделено ${timeline.length} событий с временными метками (${timeline[0].time}–${timeline[timeline.length - 1].time}). Найдено: решений — ${keyDecisions.length}, признаков задержек — ${delays.length}, рисков — ${risks.length}, упоминаний о связи — ${communication.length}.`
    : `Проанализировано ${lines.length} строк. Временные метки не найдены — выводы ограничены.`;

  return {
    title: input.title, source: input.source, label: AAR_LABEL, summary, timeline,
    keyDecisions: keyDecisions.slice(0, 10), delays, risks: risks.slice(0, 10), resources: resources.slice(0, 20),
    resourceNotes, communication, lessons, metrics, dataQuality,
  };
}

/** Превращает структурированный архивный кейс в текст донесения для единого конвейера анализа. */
export function pastIncidentToText(inc: PastIncident): string {
  const t = (iso: string) => iso.slice(11, 16);
  const tl = inc.timeline;
  return [
    `${inc.title}. ${inc.location}. ${inc.date}.`,
    `${t(tl.call)} Поступил вызов: ${inc.description}`,
    `${t(tl.departure)} Выезд дежурного караула.`,
    `${t(tl.arrival)} Прибытие первого подразделения на место, начата разведка.`,
    ...inc.facts.map((f) => `Выявлено: ${f}.`),
    `${t(tl.deployment)} Развертывание сил, подача стволов / начало работ.`,
    `Привлечено ${inc.responders} чел., ${inc.vehicles} ед. техники: ${inc.equipment.join(', ')}.`,
    `${t(tl.localization)} Локализация.`,
    `${t(tl.liquidation)} Ликвидация. Спасено ${inc.victims.rescued} чел., пострадали ${inc.victims.injured}, погибших ${inc.victims.dead}.`,
    `Погода: ${inc.weather}. Площадь: ${inc.area}.`,
  ].join('\n');
}

export const SAMPLE_REPORT = `Донесение (учебное, вымышленное). Пожар в 5-этажном жилом доме, г. Кокшетау.
21:14 Поступил вызов от жильца: задымление подъезда №2, горит квартира на 4 этаже.
21:16 Выезд караула ПЧ-2: 2 АЦ, 1 АЛ-30, 11 человек.
21:27 Прибытие на место. Затор на подъезде к дому, автолестницу установить не удалось сразу.
21:29 РТП принял решение провести разведку звеном ГДЗС, выставлен пост безопасности.
21:33 Обнаружены 3 человека на 5 этаже, путь по лестнице задымлен.
21:35 Направлено второе звено ГДЗС на спасение людей через лестничную клетку.
21:38 Гидрант у дома неисправен, АЦ установлена на гидрант в 400 м, рукавная линия.
21:44 Подан ствол на тушение в квартиру 4 этажа, второй ствол на защиту 5 этажа.
21:47 Спасены 3 человека, переданы бригаде СМП. Один с признаками отравления.
21:50 Связь с постом безопасности нестабильна, радиостанция звена не отвечала 4 минуты.
21:52 Запрошены дополнительные силы: 1 АЦ, 4 человек.
22:05 Пожар локализован на площади 30 м².
22:31 Пожар ликвидирован.
Выводы РТП: задержка установки автолестницы из-за припаркованных автомобилей.`;
