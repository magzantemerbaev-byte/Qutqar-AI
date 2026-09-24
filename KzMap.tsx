import { memo, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { MapObject, ResourceUnit } from '../types';
import { TYPE_META, INCIDENT_TYPES } from '../data/meta';
import { useApp } from '../context';
import { tx } from '../../shared/i18n';
import { locField } from '../../shared/engine/briefing';
import { UNIT_KIND_EMOJI, UNIT_KIND_LABEL } from '../../shared/engine/resources';
import { createMap, KZ_BOUNDS, useBaseLayer } from './mapBase';
import MapOffline from './MapOffline';

export { KZ_BOUNDS, TILES } from './mapBase';

type Line = [[number, number], [number, number]];
interface Props {
  objects: MapObject[];
  units?: ResourceUnit[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
  flyToSelected?: boolean;
  lines?: Line[];
  resetKey?: number;
  /** крупные маркеры для режима презентации */
  large?: boolean;
}

/** Карта РК (Leaflet). Маркеры строятся через divIcon; при отсутствии сети остается контур РК. */
function KzMap({ objects, units, selectedId, onSelect, className = '', flyToSelected, lines, resetKey, large }: Props) {
  const { settings, lang, t } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<L.Map | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const linesRef = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const offline = useBaseLayer(map, settings.mapStyle);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const m = createMap(el);
    linesRef.current = L.layerGroup().addTo(m);
    markersRef.current = L.layerGroup().addTo(m);
    setMap(m);
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el);
    return () => { ro.disconnect(); m.remove(); setMap(null); };
  }, []);

  useEffect(() => {
    const group = markersRef.current;
    if (!group || !map) return;
    group.clearLayers();
    const size = large ? 44 : 34;
    for (const o of objects) {
      const meta = TYPE_META[o.type];
      const selected = o.id === selectedId;
      const incident = INCIDENT_TYPES.includes(o.type);
      const icon = L.divIcon({
        className: '',
        html: `<div class="kz-marker ${incident ? 'is-incident' : ''} ${selected ? 'is-selected' : ''} ${large ? 'is-large' : ''}" style="background:${meta.color};color:${meta.color}"><span>${meta.emoji}</span></div>`,
        iconSize: [size, size], iconAnchor: [size / 2, size / 2],
      });
      const title = locField(o, 'title', lang);
      const marker = L.marker([o.lat, o.lng], { icon, zIndexOffset: selected ? 1000 : incident ? 500 : 0, keyboard: true, title });
      marker.bindTooltip(`<strong>${title}</strong><br/>${locField(o, 'region', lang)}`, { direction: 'top', offset: [0, -size / 2] });
      marker.on('click', () => onSelectRef.current?.(o.id));
      marker.addTo(group);
    }
    units?.forEach((u) => {
      const tone = u.status === 'available' ? '#12B76A' : u.status === 'maintenance' ? '#98A2B3' : '#F79009';
      L.circleMarker([u.lat, u.lng], { radius: 5, color: '#fff', weight: 1.5, fillColor: tone, fillOpacity: 0.95 })
        .bindTooltip(`${UNIT_KIND_EMOJI[u.kind]} <strong>${u.callsign}</strong><br/>${tx(lang, UNIT_KIND_LABEL[u.kind])}`, { direction: 'top' })
        .addTo(group);
    });
  }, [objects, units, selectedId, lang, large, map]);

  useEffect(() => {
    const group = linesRef.current;
    if (!group) return;
    group.clearLayers();
    lines?.forEach((l) => L.polyline(l, { color: '#0F2444', weight: 2, dashArray: '6 6', opacity: 0.8 }).addTo(group));
  }, [lines, map]);

  useEffect(() => {
    if (!map || !flyToSelected || !selectedId) return;
    const o = objects.find((x) => x.id === selectedId);
    if (o) map.flyTo([o.lat, o.lng], Math.max(map.getZoom(), 7), { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, flyToSelected, map]);

  useEffect(() => {
    if (resetKey === undefined || !map) return;
    map.fitBounds(KZ_BOUNDS);
  }, [resetKey, map]);

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="absolute inset-0 z-0" aria-label={t('map.aria')} />
      <MapOffline show={offline} />
    </div>
  );
}
export default memo(KzMap);
