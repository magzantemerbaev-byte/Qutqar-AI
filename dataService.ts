/**
 * Оперативные данные для дашборда, карты, брифинга, Resource Manager и режима презентации.
 * DEMO MODE → вымышленные данные (src/data), работают без сети.
 * LIVE → GET /api/data/situation. При неподключенном источнике возвращается connected:false —
 * демо-данные НЕ подставляются.
 */
import { useCallback, useEffect, useState } from 'react';
import type { OperationalSnapshot } from '../types';
import { INCIDENTS, RESOURCES } from '../data/mapObjects';
import { DEMO_ALERTS, DEMO_REGIONS } from '../data/risk';
import { DEMO_UNITS } from '../data/units';
import { DEMO_WEATHER } from '../data/weather';
import { useApp } from '../context';
import { API_BASE } from './aiService';

export const DEMO_SNAPSHOT: OperationalSnapshot = {
  connected: true,
  source: 'DEMO',
  incidents: INCIDENTS,
  resources: RESOURCES,
  unitsAtWork: DEMO_UNITS.filter((u) => u.assignment).map((u) => ({ name: u.callsign, task: u.assignment!, status: u.status })),
  stats: {
    active: INCIDENTS.length,
    fires: INCIDENTS.filter((i) => i.type === 'fire').length,
    rescues: INCIDENTS.filter((i) => i.type === 'accident' || i.type === 'flood').length,
    units: DEMO_UNITS.filter((u) => u.status === 'on_scene' || u.status === 'en_route').length,
  },
  risk: { regions: DEMO_REGIONS, alerts: DEMO_ALERTS, updatedAt: '2026-09-23T01:00:00Z' },
  units: DEMO_UNITS,
  weather: DEMO_WEATHER,
};

export function useSnapshot() {
  const { settings } = useApp();
  const [snapshot, setSnapshot] = useState<OperationalSnapshot | null>(settings.demoMode ? DEMO_SNAPSHOT : null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!settings.demoMode);

  const load = useCallback(async () => {
    if (settings.demoMode) { setSnapshot(DEMO_SNAPSHOT); setError(null); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${API_BASE}/api/data/situation`);
      const j = (await r.json()) as OperationalSnapshot & { error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setSnapshot(j);
    } catch (e) {
      setSnapshot(null);
      setError(e instanceof TypeError ? 'backend' : (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [settings.demoMode]);

  useEffect(() => { void load(); }, [load]);
  return { snapshot, error, loading, reload: load, demo: settings.demoMode };
}
