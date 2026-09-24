import { memo, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { RegionRisk, RiskKind } from '../types';
import { useApp } from '../context';
import { regionById } from '../../shared/geo/kz';
import { createMap, useBaseLayer } from './mapBase';
import MapOffline from './MapOffline';

export const riskColor = (v: number) => (v >= 80 ? '#912018' : v >= 60 ? '#D92D20' : v >= 40 ? '#F79009' : v >= 20 ? '#FDB022' : '#12B76A');
/** Для темного фона (режим презентации): более светлые оттенки ради контраста */
export const riskColorOnDark = (v: number) => (v >= 80 ? '#FF6B5E' : v >= 60 ? '#F97066' : v >= 40 ? '#FDB022' : v >= 20 ? '#FEC84B' : '#32D583');
export type RiskLevelKey = 'risk.l5' | 'risk.l4' | 'risk.l3' | 'risk.l2' | 'risk.l1';
export const riskLevelKey = (v: number): RiskLevelKey => (v >= 80 ? 'risk.l5' : v >= 60 ? 'risk.l4' : v >= 40 ? 'risk.l3' : v >= 20 ? 'risk.l2' : 'risk.l1');

/** Интерактивная карта рисков: круги по регионам, цвет и размер — индекс выбранного вида риска. */
function RiskMap({ regions, kind, selectedId, onSelect, className = '' }: { regions: RegionRisk[]; kind: RiskKind; selectedId: string | null; onSelect: (id: string) => void; className?: string }) {
  const { settings, lang, t } = useApp();
  const ref = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const selRef = useRef(onSelect);
  selRef.current = onSelect;
  const offline = useBaseLayer(map, settings.mapStyle);

  useEffect(() => {
    if (!ref.current) return;
    const m = createMap(ref.current);
    layerRef.current = L.layerGroup().addTo(m);
    setMap(m);
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(ref.current);
    return () => { ro.disconnect(); m.remove(); setMap(null); };
  }, []);

  useEffect(() => {
    const g = layerRef.current;
    if (!g || !map) return;
    g.clearLayers();
    for (const r of regions) {
      const v = r.risks[kind];
      const sel = r.id === selectedId;
      const name = regionById(r.id)?.name[lang] ?? r.region;
      L.circleMarker([r.lat, r.lng], { radius: 8 + v / 5, color: sel ? '#0A1A33' : '#ffffff', weight: sel ? 3 : 1.5, fillColor: riskColor(v), fillOpacity: 0.72 })
        .bindTooltip(`<strong>${name}</strong><br/>${v} — ${t(riskLevelKey(v))}`, { direction: 'top' })
        .on('click', () => selRef.current(r.id))
        .addTo(g);
    }
  }, [regions, kind, selectedId, map, lang, t]);

  return (
    <div className={`relative ${className}`}>
      <div ref={ref} className="absolute inset-0 z-0" aria-label={t('map.aria')} />
      <MapOffline show={offline} />
    </div>
  );
}
export default memo(RiskMap);
