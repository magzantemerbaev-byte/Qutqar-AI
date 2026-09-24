/**
 * DEMO-метеоданные по регионам (вымышленные значения для демонстрации брифинга).
 * В LIVE-режиме приходят из оперативного источника (OperationalSnapshot.weather) — например, от официальной метеослужбы.
 */
import type { WeatherObs } from '../types';

const W = (temp: number, windMs: number, windDir: string, humidity: number, precip: string): WeatherObs => ({ temp, windMs, windDir, humidity, precip, source: 'DEMO' });
export const DEMO_WEATHER: Record<string, WeatherObs> = {
  kar: W(27, 12, 'ЮЗ / SW', 18, '—'), ala: W(21, 3, 'С / N', 44, '—'), sko: W(4, 6, 'СЗ / NW', 81, 'дождь / rain'),
  akm: W(9, 7, 'З / W', 76, 'дождь / rain'), pav: W(15, 5, 'З / W', 52, '—'), akt: W(2, 4, 'В / E', 70, '—'),
  aba: W(24, 9, 'СЗ / NW', 22, '—'), zhm: W(26, 4, 'В / E', 30, '—'), shy: W(28, 2, 'С / N', 28, '—'),
  ast: W(14, 11, 'ЮЗ / SW', 48, '—'), uly: W(25, 8, 'З / W', 20, '—'), kos: W(12, 6, 'СЗ / NW', 55, '—'),
};
