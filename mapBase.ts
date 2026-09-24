import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { MapStyle } from '../context';
import { KZ_OUTLINE } from '../../shared/geo/kz';

/**
 * Общая подложка карт QUTQAR AI.
 *  • Публичные тайлы CARTO/OSM без ключа, либо собственный тайл-сервер (VITE_MAP_TILE_URL).
 *  • Офлайн: если тайлы не загружаются, карта не «ломается» — остается схематичный контур РК
 *    и все объекты; интерфейс показывает плашку офлайн-режима.
 */
export const TILES: Record<MapStyle, { url: string; attribution: string }> = {
  light: { url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', attribution: '&copy; OpenStreetMap contributors &copy; CARTO' },
  osm: { url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; OpenStreetMap contributors' },
  dark: { url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', attribution: '&copy; OpenStreetMap contributors &copy; CARTO' },
};
export const KZ_BOUNDS = L.latLngBounds([40.6, 46.5], [55.4, 87.3]);

export function createMap(el: HTMLElement): L.Map {
  const map = L.map(el, { minZoom: 4, maxBounds: KZ_BOUNDS.pad(0.6), worldCopyJump: false, preferCanvas: true, zoomSnap: 0.5 });
  map.fitBounds(KZ_BOUNDS);
  L.polygon(KZ_OUTLINE, { color: '#1F4270', weight: 1.5, opacity: 0.55, fillColor: '#1F4270', fillOpacity: 0.04, interactive: false, dashArray: '4 3' }).addTo(map);
  return map;
}

/** Подключает подложку и следит за ее доступностью. Возвращает offline=true, если тайлы недоступны. */
export function useBaseLayer(map: L.Map | null, style: MapStyle): boolean {
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && !navigator.onLine);
  const tileRef = useRef<L.TileLayer | null>(null);
  useEffect(() => {
    if (!map) return;
    const custom = import.meta.env.VITE_MAP_TILE_URL;
    const cfg = custom ? { url: custom, attribution: 'Custom tiles' } : TILES[style];
    if (tileRef.current) map.removeLayer(tileRef.current);
    let loaded = 0, failed = 0;
    const layer = L.tileLayer(cfg.url, { attribution: cfg.attribution, maxZoom: 18 });
    layer.on('tileload', () => { loaded++; setOffline(false); });
    layer.on('tileerror', () => { failed++; if (failed >= 3 && loaded === 0) setOffline(true); });
    layer.addTo(map);
    tileRef.current = layer;
    // Тайлы могут не падать с ошибкой, а «висеть» (нет DNS/прокси) — тогда считаем подложку недоступной по таймауту
    const timer = window.setTimeout(() => { if (loaded === 0) setOffline(true); }, 6000);
    const goOff = () => setOffline(true);
    window.addEventListener('offline', goOff);
    return () => { window.clearTimeout(timer); window.removeEventListener('offline', goOff); layer.off(); };
  }, [map, style]);
  return offline;
}
