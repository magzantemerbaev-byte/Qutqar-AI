/**
 * DEMO-силы и средства для Resource Manager: по одному условному подразделению в каждом
 * административном центре РК. Состав, позывные и статусы ВЫМЫШЛЕНЫ и генерируются детерминированно.
 * В LIVE-режиме список приходит из оперативного источника (OperationalSnapshot.units).
 */
import type { ResourceUnit, UnitKind, UnitStatus } from '../types';
import { KZ_CITIES, KZ_REGIONS } from '../../shared/geo/kz';

const PREFIX: Record<UnitKind, string> = { fire_engine: 'FE', rescue: 'RV', drone: 'UAV', tanker: 'WT', ambulance: 'AMB', ladder: 'AL' };
const CREW: Record<UnitKind, number> = { fire_engine: 6, rescue: 5, drone: 2, tanker: 2, ambulance: 3, ladder: 3 };
const BIG = new Set(['ast', 'ala', 'shy', 'krg']);

// Назначения на демо-происшествия (согласованы с data/mapObjects.ts)
const ASSIGNED: Record<string, { status: UnitStatus; incident: string }> = {
  'FE-KRG-1': { status: 'on_scene', incident: 'inc-001' }, 'UAV-KRG-1': { status: 'on_scene', incident: 'inc-001' },
  'FE-ALA-1': { status: 'on_scene', incident: 'inc-002' }, 'FE-ALA-2': { status: 'on_scene', incident: 'inc-002' }, 'AL-ALA-1': { status: 'on_scene', incident: 'inc-002' },
  'RV-PTR-1': { status: 'on_scene', incident: 'inc-003' }, 'RV-KOK-1': { status: 'en_route', incident: 'inc-004' },
  'FE-PVL-1': { status: 'on_scene', incident: 'inc-005' }, 'RV-PVL-1': { status: 'on_scene', incident: 'inc-005' },
  'FE-SEM-1': { status: 'on_scene', incident: 'inc-007' }, 'WT-SEM-1': { status: 'en_route', incident: 'inc-007' },
  'FE-TARAZ-1': { status: 'en_route', incident: 'inc-008' }, 'RV-SHY-1': { status: 'on_scene', incident: 'inc-009' },
  'AMB-KOK-1': { status: 'en_route', incident: 'inc-010' },
};

function hash(s: string) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }

export const DEMO_UNITS: ResourceUnit[] = KZ_CITIES.filter((c) => c.admin).flatMap((c) => {
  const code = c.id.toUpperCase();
  const kinds: UnitKind[] = ['fire_engine', 'fire_engine', 'rescue', 'ambulance', 'ambulance', 'tanker', 'drone', ...(BIG.has(c.id) ? (['fire_engine', 'ladder', 'rescue'] as UnitKind[]) : [])];
  const count: Partial<Record<UnitKind, number>> = {};
  const dep = KZ_REGIONS.find((r) => r.id === c.region)!;
  return kinds.map((kind, i) => {
    const n = (count[kind] = (count[kind] ?? 0) + 1);
    const callsign = `${PREFIX[kind]}-${code}-${n}`;
    const h = hash(callsign);
    const a = ASSIGNED[callsign];
    const status: UnitStatus = a ? a.status : h % 11 === 0 ? 'maintenance' : h % 7 === 0 ? 'returning' : 'available';
    const jitter = ((h % 100) / 100 - 0.5) * 0.04;
    return { id: `unit-${c.id}-${i}`, callsign, kind, status, department: `dep-${dep.id}`, city: c.id, lat: c.lat + jitter, lng: c.lng - jitter, crew: CREW[kind], assignment: a?.incident };
  });
});
