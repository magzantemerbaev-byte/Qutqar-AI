/**
 * DEMO-оптимизация сил и средств (Resource Manager).
 * Детерминированный алгоритм: требования по типу/уровню происшествия →
 * ближайшие ДОСТУПНЫЕ единицы (гаверсинус × коэффициент дорожной сети) → расчет времени прибытия.
 * Это учебная рекомендация, НЕ оперативная команда и не замена решения диспетчера / РТП.
 */
import type { DeploymentPlan, MapObject, ResourceUnit, UnitKind } from '../contracts.js';
import { L, tx, type L3, type Lang } from '../i18n.js';

export const UNIT_KIND_LABEL: Record<UnitKind, L3> = {
  fire_engine: L('Пожарная автоцистерна', 'Өрт сөндіру автоцистернасы', 'Fire engine'),
  rescue: L('Аварийно-спасательный автомобиль', 'Авариялық-құтқару көлігі', 'Rescue vehicle'),
  drone: L('БПЛА', 'ҰҰА (дрон)', 'Drone (UAV)'),
  tanker: L('Автоцистерна-водовоз', 'Су тасымалдайтын цистерна', 'Water tanker'),
  ambulance: L('Бригада СМП', 'ЖМК бригадасы', 'Ambulance'),
  ladder: L('Автолестница', 'Автосатыны', 'Aerial ladder'),
};
export const UNIT_KIND_EMOJI: Record<UnitKind, string> = { fire_engine: '🚒', rescue: '🛠️', drone: '🛸', tanker: '💧', ambulance: '🚑', ladder: '🪜' };

const ROAD_FACTOR = 1.3;          // допущение: дорожное расстояние ≈ 1,3 × по прямой
const MAX_RADIUS_KM = 300;        // дальше — считаем недоступным для первого эшелона
const FUEL_KZT_PER_KM = 110;      // условная ставка DEMO (≈ 35 л/100 км), туда и обратно
export const REMOTE_ETA_MIN = 60; // позже — дальний резерв, а не первый эшелон

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function etaMinutes(roadKm: number, kind: UnitKind): number {
  if (kind === 'drone') return Math.round(4 + roadKm / (roadKm > 40 ? 70 : 50) * 60); // доставка расчета БПЛА
  const speed = roadKm <= 25 ? 40 : 70;
  return Math.round(2 + (roadKm / speed) * 60);
}

interface Req { kind: UnitKind; count: number; reason: L3 }
/** Требования к силам по типу и уровню угрозы (учебные правила, не норматив) */
function requirementsL3(inc: MapObject): Req[] {
  const hi = inc.threat === 'high' || inc.threat === 'critical';
  const crit = inc.threat === 'critical';
  const txt = `${inc.title} ${inc.description}`.toLowerCase();
  const urban = Boolean(inc.city) || /г\.|город|дом|здан|квартир/.test(`${inc.region} ${txt}`);
  const req: Req[] = [];
  const add = (kind: UnitKind, count: number, reason: L3) => { if (count > 0) req.push({ kind, count, reason }); };
  switch (inc.type) {
    case 'fire':
      add('fire_engine', 2 + (hi ? 1 : 0) + (crit ? 1 : 0), L('Подача стволов и резерв воды на месте', 'Оқпандар беру және орындағы су қоры', 'Hose lines and on-scene water reserve'));
      if (urban && /этаж|дом|здан/.test(txt)) add('ladder', 1, L('Работа на высоте, спасение с этажей', 'Биіктікте жұмыс, қабаттардан құтқару', 'Work at height, rescue from upper floors'));
      if (!urban || /степ|лес|камыш|га\b/.test(txt)) add('tanker', 1 + (hi ? 1 : 0), L('Удаленность от водоисточников', 'Су көздерінен алыс орналасу', 'Distance from water sources'));
      if (hi) add('drone', 1, L('Разведка контура и направления огня', 'Өрт контуры мен бағытын барлау', 'Reconnaissance of fire perimeter and direction'));
      add('ambulance', 1, L('Медицинское обеспечение личного состава и пострадавших', 'Жеке құрам мен зардап шеккендерді медициналық қамтамасыз ету', 'Medical cover for crews and casualties'));
      break;
    case 'flood':
      add('rescue', 2 + (hi ? 1 : 0), L('Работа на воде, эвакуация жителей', 'Суда жұмыс істеу, тұрғындарды көшіру', 'Water operations, evacuation of residents'));
      add('drone', 1, L('Мониторинг зоны подтопления', 'Су басу аймағын бақылау', 'Monitoring the flooded area'));
      add('ambulance', 1, L('Переохлаждение, медицинская сортировка', 'Суық тию, медициналық сұрыптау', 'Hypothermia, medical triage'));
      break;
    case 'accident':
      add('rescue', 1 + (crit ? 1 : 0), L('Деблокирование пострадавших', 'Зардап шеккендерді бұғаттан шығару', 'Extrication of casualties'));
      add('fire_engine', 1, L('Пожарная страховка при разливе топлива', 'Жанармай төгілгенде өрттен сақтандыру', 'Fire cover in case of fuel spill'));
      add('ambulance', Math.max(1, Math.min(3, inc.people?.injured ?? (hi ? 2 : 1))), L('Помощь пострадавшим на месте', 'Зардап шеккендерге орнында көмек', 'On-scene casualty care'));
      break;
    case 'hazard':
      add('fire_engine', 2, L('Водяные завесы, охлаждение емкостей', 'Су перделері, ыдыстарды салқындату', 'Water curtains, cooling of containers'));
      add('rescue', 1 + (hi ? 1 : 0), L('Работа в средствах химзащиты, химразведка', 'Химиялық қорғаныс құралдарында жұмыс, химиялық барлау', 'Work in chemical protective gear, chemical reconnaissance'));
      add('drone', 1, L('Контроль направления облака', 'Бұлт бағытын бақылау', 'Tracking the plume direction'));
      add('ambulance', 1 + (hi ? 1 : 0), L('Помощь пострадавшим от воздействия вещества', 'Заттың әсерінен зардап шеккендерге көмек', 'Care for persons exposed to the substance'));
      break;
    default:
      add('rescue', 1, L('Уточнение обстановки', 'Жағдайды нақтылау', 'Situation assessment'));
  }
  return req;
}
export const requirements = (inc: MapObject, lang: Lang = 'ru'): DeploymentPlan['requirements'] =>
  requirementsL3(inc).map((r) => ({ kind: r.kind, count: r.count, reason: tx(lang, r.reason) }));

export function optimizeDeployment(inc: MapObject, units: ResourceUnit[], lang: Lang = 'ru'): DeploymentPlan {
  const reqL = requirementsL3(inc);
  const used = new Set<string>();
  const suggestions: DeploymentPlan['suggestions'] = [];
  const shortages: DeploymentPlan['shortages'] = [];
  for (const r of reqL) {
    const cands = units
      .filter((u) => u.kind === r.kind && u.status === 'available' && !used.has(u.id))
      .map((u) => ({ u, road: distanceKm(inc, u) * ROAD_FACTOR }))
      .filter((c) => c.road <= MAX_RADIUS_KM)
      .sort((a, b) => a.road - b.road || a.u.id.localeCompare(b.u.id));
    const picked = cands.slice(0, r.count);
    for (const c of picked) {
      used.add(c.u.id);
      const eta = etaMinutes(c.road, c.u.kind);
      suggestions.push({ unitId: c.u.id, callsign: c.u.callsign, kind: c.u.kind, city: c.u.city, distanceKm: Math.round(c.road), etaMin: eta, crew: c.u.crew, remote: eta > REMOTE_ETA_MIN });
    }
    if (picked.length < r.count) shortages.push({ kind: r.kind, missing: r.count - picked.length });
  }
  const totalKm = suggestions.filter((s) => s.kind !== 'drone').reduce((a, s) => a + s.distanceKm * 2, 0);
  return {
    incidentId: inc.id,
    requirements: reqL.map((r) => ({ kind: r.kind, count: r.count, reason: tx(lang, r.reason) })),
    suggestions,
    shortages,
    totalCrew: suggestions.reduce((a, s) => a + s.crew, 0),
    maxEtaMin: suggestions.reduce((a, s) => Math.max(a, s.etaMin), 0),
    fuelCostKzt: Math.round(totalKm * FUEL_KZT_PER_KM / 100) * 100,
    assumptions: [
      tx(lang, L(`Дорожное расстояние = ${ROAD_FACTOR} × расстояние по прямой; скорость 40 км/ч в городе и 70 км/ч вне города; +2 мин на выезд.`,
        `Жол қашықтығы = ${ROAD_FACTOR} × түзу қашықтық; жылдамдық қалада 40 км/сағ, қаладан тыс 70 км/сағ; шығуға +2 мин.`,
        `Road distance = ${ROAD_FACTOR} × straight-line distance; speed 40 km/h urban, 70 km/h outside cities; +2 min turnout.`)),
      tx(lang, L(`Учитываются только единицы со статусом «доступна» в радиусе ${MAX_RADIUS_KM} км.`, `Тек ${MAX_RADIUS_KM} км радиустағы «қолжетімді» бірліктер ескеріледі.`, `Only units with status "available" within ${MAX_RADIUS_KM} km are considered.`)),
      tx(lang, L(`Единицы с прибытием позже ${REMOTE_ETA_MIN} мин помечены как дальний резерв: нужны местные силы (в DEMO-данных есть только областные центры).`, `${REMOTE_ETA_MIN} минуттан кейін келетін бірліктер алыс резерв ретінде белгіленген: жергілікті күштер қажет (DEMO-деректерде тек облыс орталықтары бар).`, `Units arriving after ${REMOTE_ETA_MIN} min are marked as remote reserve: local forces are needed (DEMO data only includes regional centres).`)),
      tx(lang, L(`Расходы на топливо — условная ставка ${FUEL_KZT_PER_KM} ₸/км (туда и обратно), DEMO.`, `Жанармай шығыны — шартты мөлшерлеме ${FUEL_KZT_PER_KM} ₸/км (бару-қайту), DEMO.`, `Fuel cost uses a notional DEMO rate of ${FUEL_KZT_PER_KM} ₸/km (round trip).`)),
      tx(lang, L('Требования к силам — учебные правила прототипа, а не нормативы МЧС РК.', 'Күштерге қойылатын талаптар — прототиптің оқу ережелері, ҚР ТЖМ нормативтері емес.', 'Force requirements are prototype training rules, not MChS RK standards.')),
    ],
  };
}
