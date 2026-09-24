/**
 * Демо-движок анализа изображений.
 *  • fire / smoke   — ЦВЕТОВАЯ ЭВРИСТИКА по пикселям (реальный расчет в браузере, не нейросеть)
 *  • остальные классы — СИМУЛЯЦИЯ (детерминированно от содержимого файла), помечены basis: 'simulated'
 * В live-режиме результат формирует модель компьютерного зрения на backend.
 */
import type { CategoryAssessment, Detection, HazardCategory, ImageAnalysisResult, ImageStats, ThreatLevel } from '../contracts.js';
import { L, fill, tx, type L3, type Lang } from '../i18n.js';
import { rng } from './text.js';

export const HAZARD_META: Record<HazardCategory, { label: L3; emoji: string; color: string; advice: L3; why: L3 }> = {
  fire: { label: L('Огонь', 'Өрт (ашық жалын)', 'Fire'), emoji: '🔥', color: '#D92D20',
    advice: L('Подать стволы на тушение, определить границы горения.', 'Сөндіруге оқпандар беру, жану шекарасын анықтау.', 'Deploy hose lines, establish the fire perimeter.'),
    why: L('Открытое горение быстро распространяется и отрезает пути эвакуации.', 'Ашық жану тез таралып, эвакуация жолдарын кесіп тастайды.', 'Open burning spreads quickly and cuts off escape routes.') },
  smoke: { label: L('Задымление', 'Түтін', 'Smoke'), emoji: '💨', color: '#667085',
    advice: L('Работать звеньями ГДЗС, выставить пост безопасности.', 'ГТҚҚ буындарымен жұмыс істеу, қауіпсіздік бекетін қою.', 'Work in breathing-apparatus teams, set up an entry control point.'),
    why: L('Продукты горения — главная причина гибели при пожарах; дым скрывает людей и очаг.', 'Жану өнімдері — өрттегі өлімнің басты себебі; түтін адамдар мен ошақты жасырады.', 'Smoke is the leading cause of fire deaths and hides both people and the seat of the fire.') },
  people: { label: L('Люди', 'Адамдар', 'People'), emoji: '👥', color: '#1D63D8',
    advice: L('Подтвердить наличие людей разведкой, организовать спасение.', 'Барлау арқылы адамдардың бар-жоғын растау, құтқаруды ұйымдастыру.', 'Confirm occupants by reconnaissance and organise rescue.'),
    why: L('Спасение людей — первоочередная задача; определяет расстановку сил.', 'Адамдарды құтқару — бірінші кезектегі міндет; күштерді орналастыруды айқындайды.', 'Saving lives is the first priority and drives the deployment of forces.') },
  vehicles: { label: L('Транспортные средства', 'Көлік құралдары', 'Vehicles'), emoji: '🚗', color: '#E08A00',
    advice: L('Проверить утечку топлива, стабилизировать ТС.', 'Жанармайдың ағуын тексеру, көлікті тұрақтандыру.', 'Check for fuel leaks and stabilise vehicles.'),
    why: L('Топливо и баллоны ТС — риск возгорания и взрыва.', 'Көліктің жанармайы мен баллондары — тұтану және жарылыс қаупі.', 'Vehicle fuel and gas cylinders pose fire and explosion risks.') },
  structural: { label: L('Повреждение конструкций', 'Құрылымдардың зақымдануы', 'Structural damage'), emoji: '🏚️', color: '#B54708',
    advice: L('Оценить устойчивость, выставить наблюдателя.', 'Орнықтылығын бағалау, бақылаушы қою.', 'Assess stability and post a safety observer.'),
    why: L('Угроза обрушения для личного состава и людей внутри.', 'Жеке құрам мен ішіндегі адамдар үшін опырылу қаупі.', 'Collapse threat to crews and people inside.') },
  electrical: { label: L('Электрическая опасность', 'Электр қаупі', 'Electrical hazard'), emoji: '⚡', color: '#7A3FD1',
    advice: L('Обесточить объект до начала работ.', 'Жұмыс басталғанға дейін нысанды ток көзінен ажырату.', 'De-energise the site before work begins.'),
    why: L('Поражение током при подаче воды и работе у проводов.', 'Су беру және сымдардың жанында жұмыс істеу кезінде ток соғу қаупі.', 'Risk of electrocution when applying water or working near cables.') },
  hazmat: { label: L('Опасные вещества', 'Қауіпті заттар', 'Hazardous materials'), emoji: '☣️', color: '#0E9384',
    advice: L('Химразведка, работа с наветренной стороны в СИЗ.', 'Химиялық барлау, жел жақтан ЖҚҚ-мен жұмыс.', 'Chemical reconnaissance; work upwind in PPE.'),
    why: L('Токсичное воздействие на людей и личный состав, расширение зоны ЧС.', 'Адамдар мен жеке құрамға уытты әсер, ТЖ аймағының кеңеюі.', 'Toxic exposure for people and crews; the affected zone may grow.') },
  blocked_exit: { label: L('Заблокированный выход', 'Бөгелген шығу жолы', 'Blocked exit'), emoji: '🚪', color: '#C11574',
    advice: L('Определить альтернативные пути эвакуации.', 'Балама эвакуация жолдарын анықтау.', 'Identify alternative escape routes.'),
    why: L('Люди могут оказаться отрезанными; нужен альтернативный путь спасения.', 'Адамдар оқшауланып қалуы мүмкін; баламалы құтқару жолы қажет.', 'People may be trapped; an alternative rescue route is needed.') },
};
export const HAZARD_ORDER: HazardCategory[] = ['fire', 'smoke', 'people', 'vehicles', 'structural', 'electrical', 'hazmat', 'blocked_exit'];

const sevFrom = (c: number): ThreatLevel => (c >= 85 ? 'critical' : c >= 70 ? 'high' : c >= 50 ? 'medium' : 'low');

export function visionFromStats(stats: ImageStats, engineLabel: string, lang: Lang = 'ru'): ImageAnalysisResult {
  const r = rng(stats.seed);
  const t = (v: L3) => tx(lang, v);
  const detections: Detection[] = [];
  const categories: CategoryAssessment[] = [];
  const box = (c: { x: number; y: number; spreadX: number; spreadY: number }) => {
    const w = Math.min(90, Math.max(12, c.spreadX * 2.4));
    const h = Math.min(90, Math.max(12, c.spreadY * 2.4));
    return { x: Math.max(0, Math.min(100 - w, c.x - w / 2)), y: Math.max(0, Math.min(100 - h, c.y - h / 2)), w, h };
  };

  // 1–2. Эвристика: огонь и дым
  const fireConf = Math.round(Math.min(97, stats.firePixels * 900 + (stats.firePixels > 0.01 ? 35 : 0)));
  const fireStatus = stats.firePixels > 0.03 ? 'detected' : stats.firePixels > 0.004 ? 'possible' : 'not_detected';
  if (stats.fireCentroid && stats.firePixels > 0.004) {
    detections.push({ id: 'h-fire', category: 'fire', label: t(HAZARD_META.fire.label), confidence: fireConf, box: box(stats.fireCentroid),
      severity: sevFrom(fireConf), basis: 'heuristic', status: fireStatus === 'detected' ? 'detected' : 'possible', uncertainty: 15, why: t(HAZARD_META.fire.why),
      note: fill(t(L('Доля пикселей «пламени»: {v}%', '«Жалын» пиксельдерінің үлесі: {v}%', 'Share of "flame" pixels: {v}%')), { v: (stats.firePixels * 100).toFixed(1) }) });
  }
  categories.push({ category: 'fire', basis: 'heuristic', confidence: fireConf, status: fireStatus });

  const smokeConf = Math.round(Math.min(95, stats.smokePixels * 220));
  const smokeStatus = stats.smokePixels > 0.3 ? 'detected' : stats.smokePixels > 0.12 ? 'possible' : 'not_detected';
  if (stats.smokeCentroid && stats.smokePixels > 0.12) {
    detections.push({ id: 'h-smoke', category: 'smoke', label: t(HAZARD_META.smoke.label), confidence: smokeConf, box: box(stats.smokeCentroid),
      severity: sevFrom(smokeConf), basis: 'heuristic', status: smokeStatus === 'detected' ? 'detected' : 'possible', uncertainty: 20, why: t(HAZARD_META.smoke.why),
      note: fill(t(L('Доля серых малонасыщенных пикселей: {v}%', 'Сұр, аз қаныққан пиксельдердің үлесі: {v}%', 'Share of grey low-saturation pixels: {v}%')), { v: (stats.smokePixels * 100).toFixed(0) }) });
  }
  categories.push({ category: 'smoke', basis: 'heuristic', confidence: smokeConf, status: smokeStatus });

  // 3–8. Симуляция
  const fireScene = stats.firePixels > 0.01 || stats.smokePixels > 0.25;
  const simProb: Record<Exclude<HazardCategory, 'fire' | 'smoke'>, number> = {
    people: 0.55, vehicles: 0.4, structural: fireScene ? 0.6 : 0.3, electrical: fireScene ? 0.45 : 0.25, hazmat: 0.15, blocked_exit: fireScene ? 0.35 : 0.15,
  };
  (Object.keys(simProb) as (keyof typeof simProb)[]).forEach((cat, i) => {
    const hit = r.chance(simProb[cat]);
    const conf = hit ? r.int(48, 82) : r.int(8, 30);
    categories.push({ category: cat, basis: 'simulated', confidence: conf, status: hit ? 'possible' : 'unknown' });
    if (hit) {
      const w = r.int(12, 28); const h = r.int(14, 32);
      detections.push({ id: `s-${cat}-${i}`, category: cat, label: t(HAZARD_META[cat].label), confidence: conf,
        box: { x: r.int(2, 98 - w), y: r.int(20, 98 - h), w, h }, severity: sevFrom(conf - 10), basis: 'simulated', status: 'possible', uncertainty: null,
        why: t(HAZARD_META[cat].why),
        note: t(L('СИМУЛЯЦИЯ: в демо-режиме этот класс не распознается, область и уверенность смоделированы.', 'СИМУЛЯЦИЯ: демо режимінде бұл класс танылмайды, аймақ пен сенімділік модельденген.', 'SIMULATED: this class is not recognised in demo mode; the area and confidence are simulated.')) });
    }
  });

  const heur = detections.filter((d) => d.basis === 'heuristic');
  const overall: ThreatLevel = stats.firePixels > 0.05 ? 'critical' : stats.firePixels > 0.01 || stats.smokePixels > 0.3 ? 'high'
    : stats.smokePixels > 0.12 ? 'medium' : 'low';
  const recommendations = [...new Set([...detections].sort((a, b) => b.confidence - a.confidence).map((d) => t(HAZARD_META[d.category].advice)))].slice(0, 5);
  if (!recommendations.length) recommendations.push(t(L('Явных признаков опасности по цветовой эвристике не обнаружено; оценку выполняет специалист на месте.', 'Түс эвристикасы бойынша айқын қауіп белгілері табылмады; бағалауды орындағы маман жүргізеді.', 'The colour heuristic found no clear signs of danger; an on-scene specialist must assess.')));

  return {
    model: engineLabel,
    processedAt: new Date().toISOString(),
    image: { width: stats.width, height: stats.height, sizeKb: stats.sizeKb },
    detections,
    categories,
    overall,
    summary: heur.length
      ? fill(t(L('По цветовой эвристике обнаружены признаки: {v}. Остальные классы в демо-режиме смоделированы.', 'Түс эвристикасы бойынша белгілер анықталды: {v}. Қалған кластар демо режимінде модельденген.', 'The colour heuristic found signs of: {v}. All other classes are simulated in demo mode.')), { v: heur.map((d) => d.label.toLowerCase()).join(', ') })
      : t(L('Цветовая эвристика не выявила выраженных признаков огня или дыма. Остальные классы в демо-режиме смоделированы.', 'Түс эвристикасы өрт немесе түтіннің айқын белгілерін анықтаған жоқ. Қалған кластар демо режимінде модельденген.', 'The colour heuristic found no clear signs of fire or smoke. All other classes are simulated in demo mode.')),
    recommendations,
    limitations: [
      t(L('ДЕМО: огонь и дым определяются по цвету пикселей, а не нейросетью — возможны ложные срабатывания (закат, красные объекты, туман).', 'ДЕМО: от пен түтін нейрожелімен емес, пиксель түсі бойынша анықталады — жалған іске қосылу мүмкін (күн батуы, қызыл заттар, тұман).', 'DEMO: fire and smoke are detected from pixel colour, not a neural network — false positives are possible (sunsets, red objects, fog).')),
      t(L('Классы «люди», «транспорт», «конструкции», «электричество», «опасные вещества», «заблокированный выход» в демо-режиме СИМУЛИРУЮТСЯ.', '«Адамдар», «көлік», «құрылымдар», «электр», «қауіпті заттар», «бөгелген шығу жолы» кластары демо режимінде МОДЕЛЬДЕНЕДІ.', 'The classes "people", "vehicles", "structures", "electrical", "hazmat" and "blocked exit" are SIMULATED in demo mode.')),
      t(L('Результат не является основанием для принятия оперативных решений.', 'Нәтиже жедел шешім қабылдауға негіз болып табылмайды.', 'The result is not a basis for operational decisions.')),
    ],
  };
}
