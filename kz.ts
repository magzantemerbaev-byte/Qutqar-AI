/**
 * Справочная география Республики Казахстан (административное деление после 2022 г.:
 * 17 областей и 3 города республиканского значения). Координаты — приблизительные центры.
 * Это справочные, а не оперативные данные: здесь нет контактов, статистики и сведений МЧС.
 */
import { L, type L3 } from '../i18n.js';

export interface KzRegion { id: string; name: L3; center: string; lat: number; lng: number }
export interface KzCity { id: string; name: L3; region: string; lat: number; lng: number; admin?: boolean }

export const KZ_REGIONS: KzRegion[] = [
  { id: 'ast', name: L('г. Астана', 'Астана қ.', 'Astana'), center: 'ast', lat: 51.17, lng: 71.45 },
  { id: 'ala', name: L('г. Алматы', 'Алматы қ.', 'Almaty'), center: 'ala', lat: 43.24, lng: 76.9 },
  { id: 'shy', name: L('г. Шымкент', 'Шымкент қ.', 'Shymkent'), center: 'shy', lat: 42.34, lng: 69.59 },
  { id: 'aba', name: L('Абайская обл.', 'Абай облысы', 'Abai Region'), center: 'sem', lat: 49.3, lng: 79.5 },
  { id: 'akm', name: L('Акмолинская обл.', 'Ақмола облысы', 'Akmola Region'), center: 'kok', lat: 52.3, lng: 69.9 },
  { id: 'akt', name: L('Актюбинская обл.', 'Ақтөбе облысы', 'Aktobe Region'), center: 'aktb', lat: 48.8, lng: 58.5 },
  { id: 'alr', name: L('Алматинская обл.', 'Алматы облысы', 'Almaty Region'), center: 'kon', lat: 44.0, lng: 77.3 },
  { id: 'atr', name: L('Атырауская обл.', 'Атырау облысы', 'Atyrau Region'), center: 'atyr', lat: 47.2, lng: 52.6 },
  { id: 'vko', name: L('Восточно-Казахстанская обл.', 'Шығыс Қазақстан облысы', 'East Kazakhstan Region'), center: 'ukg', lat: 49.4, lng: 83.9 },
  { id: 'zhm', name: L('Жамбылская обл.', 'Жамбыл облысы', 'Zhambyl Region'), center: 'taraz', lat: 44.2, lng: 72.4 },
  { id: 'zht', name: L('Жетысуская обл.', 'Жетісу облысы', 'Zhetysu Region'), center: 'tald', lat: 45.3, lng: 79.3 },
  { id: 'zko', name: L('Западно-Казахстанская обл.', 'Батыс Қазақстан облысы', 'West Kazakhstan Region'), center: 'ural', lat: 50.2, lng: 50.9 },
  { id: 'kar', name: L('Карагандинская обл.', 'Қарағанды облысы', 'Karaganda Region'), center: 'krg', lat: 48.9, lng: 74.3 },
  { id: 'kos', name: L('Костанайская обл.', 'Қостанай облысы', 'Kostanay Region'), center: 'kost', lat: 51.5, lng: 63.6 },
  { id: 'kyz', name: L('Кызылординская обл.', 'Қызылорда облысы', 'Kyzylorda Region'), center: 'kyzl', lat: 44.9, lng: 64.2 },
  { id: 'man', name: L('Мангистауская обл.', 'Маңғыстау облысы', 'Mangystau Region'), center: 'aktau', lat: 44.1, lng: 53.7 },
  { id: 'pav', name: L('Павлодарская обл.', 'Павлодар облысы', 'Pavlodar Region'), center: 'pvl', lat: 52.0, lng: 76.2 },
  { id: 'sko', name: L('Северо-Казахстанская обл.', 'Солтүстік Қазақстан облысы', 'North Kazakhstan Region'), center: 'ptr', lat: 54.2, lng: 69.4 },
  { id: 'tur', name: L('Туркестанская обл.', 'Түркістан облысы', 'Turkistan Region'), center: 'turk', lat: 42.9, lng: 68.6 },
  { id: 'uly', name: L('Улытауская обл.', 'Ұлытау облысы', 'Ulytau Region'), center: 'zhez', lat: 47.9, lng: 67.3 },
];

export const KZ_CITIES: KzCity[] = [
  { id: 'ast', name: L('Астана', 'Астана', 'Astana'), region: 'ast', lat: 51.169, lng: 71.449, admin: true },
  { id: 'ala', name: L('Алматы', 'Алматы', 'Almaty'), region: 'ala', lat: 43.238, lng: 76.946, admin: true },
  { id: 'shy', name: L('Шымкент', 'Шымкент', 'Shymkent'), region: 'shy', lat: 42.341, lng: 69.59, admin: true },
  { id: 'krg', name: L('Караганда', 'Қарағанды', 'Karaganda'), region: 'kar', lat: 49.806, lng: 73.085, admin: true },
  { id: 'kok', name: L('Кокшетау', 'Көкшетау', 'Kokshetau'), region: 'akm', lat: 53.283, lng: 69.396, admin: true },
  { id: 'pvl', name: L('Павлодар', 'Павлодар', 'Pavlodar'), region: 'pav', lat: 52.287, lng: 76.967, admin: true },
  { id: 'aktb', name: L('Актобе', 'Ақтөбе', 'Aktobe'), region: 'akt', lat: 50.283, lng: 57.167, admin: true },
  { id: 'sem', name: L('Семей', 'Семей', 'Semey'), region: 'aba', lat: 50.411, lng: 80.227, admin: true },
  { id: 'taraz', name: L('Тараз', 'Тараз', 'Taraz'), region: 'zhm', lat: 42.9, lng: 71.366, admin: true },
  { id: 'ukg', name: L('Усть-Каменогорск', 'Өскемен', 'Oskemen'), region: 'vko', lat: 49.948, lng: 82.628, admin: true },
  { id: 'atyr', name: L('Атырау', 'Атырау', 'Atyrau'), region: 'atr', lat: 47.094, lng: 51.924, admin: true },
  { id: 'aktau', name: L('Актау', 'Ақтау', 'Aktau'), region: 'man', lat: 43.651, lng: 51.197, admin: true },
  { id: 'ural', name: L('Уральск', 'Орал', 'Oral'), region: 'zko', lat: 51.227, lng: 51.387, admin: true },
  { id: 'kost', name: L('Костанай', 'Қостанай', 'Kostanay'), region: 'kos', lat: 53.214, lng: 63.625, admin: true },
  { id: 'ptr', name: L('Петропавловск', 'Петропавл', 'Petropavl'), region: 'sko', lat: 54.866, lng: 69.135, admin: true },
  { id: 'kyzl', name: L('Кызылорда', 'Қызылорда', 'Kyzylorda'), region: 'kyz', lat: 44.853, lng: 65.509, admin: true },
  { id: 'turk', name: L('Туркестан', 'Түркістан', 'Turkistan'), region: 'tur', lat: 43.297, lng: 68.252, admin: true },
  { id: 'tald', name: L('Талдыкорган', 'Талдықорған', 'Taldykorgan'), region: 'zht', lat: 45.017, lng: 78.382, admin: true },
  { id: 'kon', name: L('Конаев', 'Қонаев', 'Konaev'), region: 'alr', lat: 43.867, lng: 77.063, admin: true },
  { id: 'zhez', name: L('Жезказган', 'Жезқазған', 'Zhezkazgan'), region: 'uly', lat: 47.783, lng: 67.767, admin: true },
  { id: 'ekb', name: L('Экибастуз', 'Екібастұз', 'Ekibastuz'), region: 'pav', lat: 51.723, lng: 75.323 },
  { id: 'tem', name: L('Темиртау', 'Теміртау', 'Temirtau'), region: 'kar', lat: 50.054, lng: 72.964 },
  { id: 'shch', name: L('Щучинск', 'Щучинск', 'Shchuchinsk'), region: 'akm', lat: 52.936, lng: 70.189 },
  { id: 'rud', name: L('Рудный', 'Рудный', 'Rudny'), region: 'kos', lat: 52.959, lng: 63.117 },
];

export const regionById = (id: string) => KZ_REGIONS.find((r) => r.id === id);
export const cityById = (id: string) => KZ_CITIES.find((c) => c.id === id);

/** Условные региональные подразделения (DEMO): только название, без контактов и штатных сведений */
export const DEMO_DEPARTMENTS = KZ_REGIONS.map((r) => ({
  id: `dep-${r.id}`,
  region: r.id,
  city: r.center,
  name: L(
    `ДЧС: ${r.name.ru} (DEMO)`,
    `ТЖД: ${r.name.kz} (DEMO)`,
    `Emergency Department: ${r.name.en} (DEMO)`,
  ),
}));

/** Схематичный контур РК для офлайн-режима карты (упрощенный, ~70 точек; не для измерений) */
export const KZ_OUTLINE: [number, number][] = [
  [46.2, 49.2], [47.3, 46.8], [48.4, 46.6], [49.3, 46.8], [50.0, 47.4], [50.4, 48.3], [51.1, 48.6], [51.7, 49.4],
  [51.7, 50.8], [51.3, 52.4], [51.0, 53.6], [50.6, 55.0], [50.8, 56.5], [51.0, 57.6], [50.8, 58.6], [51.1, 59.9],
  [50.6, 61.4], [51.3, 61.6], [52.0, 60.4], [52.5, 60.9], [53.0, 61.6], [53.6, 61.1], [54.0, 62.2], [54.0, 64.8],
  [54.6, 65.4], [55.0, 68.2], [55.4, 69.1], [55.3, 70.8], [54.6, 71.2], [54.1, 71.1], [54.2, 73.6], [53.6, 73.4],
  [53.7, 75.4], [53.1, 77.8], [52.2, 78.9], [51.6, 79.9], [50.9, 80.7], [51.2, 81.8], [50.8, 83.3], [50.7, 84.3],
  [49.9, 85.3], [49.4, 86.8], [49.1, 87.3], [48.6, 85.8], [47.9, 85.6], [47.1, 85.2], [47.0, 83.0], [46.2, 82.6],
  [45.4, 82.5], [45.1, 80.1], [44.4, 80.3], [43.0, 80.4], [42.9, 79.0], [43.2, 76.3], [42.9, 74.4], [42.6, 71.9],
  [42.2, 70.9], [41.4, 70.4], [40.6, 68.7], [41.1, 67.9], [41.5, 66.7], [42.9, 66.0], [43.7, 65.3], [44.9, 62.4],
  [45.0, 58.6], [45.6, 56.0], [41.3, 56.0], [41.5, 53.8], [42.3, 52.6], [43.6, 51.4], [44.6, 50.3], [45.3, 51.9],
  [46.8, 51.7], [46.9, 49.9],
];
