import type { SimScene } from '../types';
import { useApp } from '../context';

/**
 * Схема обстановки для симулятора. Координаты сцены 0..100 формирует движок
 * (shared/engine/simulator.ts → scene()), поэтому карта меняется вместе с обстановкой.
 * Это учебная схема, а не картографическая подложка.
 */
const ZONE: Record<SimScene['zones'][number]['kind'], string> = {
  fire: 'url(#g-fire)', smoke: '#94a3b8', water: '#3b82f6', cloud: '#a3e635', debris: '#92400e', burned: '#1f2937',
};
const MARK: Record<SimScene['markers'][number]['kind'], { emoji: string; fill: string }> = {
  unit: { emoji: '🚒', fill: '#0F2444' }, village: { emoji: '🏘️', fill: '#334155' }, victims: { emoji: '🧍', fill: '#1D63D8' },
  hazard: { emoji: '⚠️', fill: '#7A3FD1' }, hq: { emoji: '🚩', fill: '#0F766E' }, water: { emoji: '💧', fill: '#0891B2' },
  drone: { emoji: '🛸', fill: '#0F2444' }, medical: { emoji: '🚑', fill: '#be123c' },
};
const RING = { ok: '#10b981', warn: '#F79009', danger: '#D92D20' };
const LINE: Record<SimScene['lines'][number]['kind'], { stroke: string; width: number; dash?: string }> = {
  road: { stroke: '#64748b', width: 2.4 }, lep: { stroke: '#a855f7', width: 0.8, dash: '2 1.5' }, firebreak: { stroke: '#b45309', width: 1.6, dash: '3 1' },
  cordon: { stroke: '#ef4444', width: 1.2, dash: '1.5 1' }, building: { stroke: '#cbd5e1', width: 1.2 }, river: { stroke: '#38bdf8', width: 2.2 }, dam: { stroke: '#a16207', width: 1.8 },
};

export default function SceneMap({ scene, className = '', compact = false }: { scene: SimScene; className?: string; compact?: boolean }) {
  const { t } = useApp();
  const Y = (y: number) => y * 0.75; // viewBox 100×75
  return (
    <div className={`relative overflow-hidden rounded-md bg-[#0b1a2e] ring-1 ring-white/10 ${className}`}>
      <svg viewBox="0 0 100 75" className="block h-full w-full" role="img" aria-label={t('sim.scheme')}>
        <defs>
          <radialGradient id="g-fire"><stop offset="0%" stopColor="#fde047" /><stop offset="45%" stopColor="#f97316" /><stop offset="100%" stopColor="#b91c1c" stopOpacity="0.2" /></radialGradient>
          <pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0H0V10" fill="none" stroke="#1e3a5f" strokeWidth="0.2" /></pattern>
        </defs>
        <rect width="100" height="75" fill="url(#grid)" />
        {scene.zones.map((z, i) => (
          <ellipse key={`z${i}`} cx={z.x} cy={Y(z.y)} rx={z.rx} ry={z.ry * 0.75} fill={ZONE[z.kind]} opacity={z.opacity}
            className={z.kind === 'fire' ? 'animate-pulse-soft' : undefined} style={{ transition: 'all .8s ease' }} />
        ))}
        {scene.lines.map((l, i) => {
          const st = LINE[l.kind];
          const pts = l.points.map(([x, y]) => `${x},${Y(y)}`).join(' ');
          const [lx, ly] = l.points[Math.floor(l.points.length / 2)];
          return (
            <g key={`l${i}`}>
              <polyline points={pts} fill="none" stroke={st.stroke} strokeWidth={st.width} strokeDasharray={st.dash} strokeLinejoin="round" />
              {l.label && !compact && <text x={lx + 1.2} y={Y(ly) - 1} fontSize="2.4" fill={st.stroke} fontWeight={600}>{l.label}</text>}
            </g>
          );
        })}
        {scene.markers.map((m, i) => {
          const f = MARK[m.kind];
          return (
            <g key={`m${i}`} transform={`translate(${m.x} ${Y(m.y)})`} style={{ transition: 'transform .8s ease' }}>
              <title>{m.label}</title>
              <circle r="2.9" fill={f.fill} stroke={m.state ? RING[m.state] : '#e2e8f0'} strokeWidth={m.state === 'danger' ? 0.9 : 0.5}
                className={m.state === 'danger' ? 'animate-pulse-soft' : undefined} />
              <text textAnchor="middle" dominantBaseline="central" fontSize="3">{f.emoji}</text>
              {!compact && (
                <text x={m.x > 70 ? -3.8 : 3.8} y="0.9" textAnchor={m.x > 70 ? 'end' : 'start'} fontSize="2.3" fill="#e2e8f0" stroke="#0b1a2e" strokeWidth="0.6" paintOrder="stroke" fontWeight={600}>{m.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      {scene.wind && (
        <div className="absolute right-2 top-2 flex items-center gap-1.5 rounded bg-navy-950/80 px-2 py-1 text-[11px] font-semibold text-slate-100 ring-1 ring-white/10">
          <svg viewBox="0 0 20 20" className="h-4 w-4 transition-transform duration-700" style={{ transform: `rotate(${scene.wind.deg}deg)` }} aria-hidden>
            <path d="M10 2 L15 11 H11.5 V18 H8.5 V11 H5 Z" fill="#38bdf8" />
          </svg>
          {scene.wind.label}
        </div>
      )}
      <div className="absolute bottom-1.5 left-2 text-[10px] font-semibold text-slate-400">{t('sim.scheme')} · DEMO / TRAINING</div>
    </div>
  );
}
