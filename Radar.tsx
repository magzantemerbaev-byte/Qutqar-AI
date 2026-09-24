import { memo } from 'react';

/** Лепестковая диаграмма учебной оценки по 6 категориям */
function Radar({ cats, size = 220, aria }: { cats: { key: string; label: string; score: number }[]; size?: number; aria: string }) {
  const c = size / 2, R = size / 2 - 28, n = cats.length;
  const pt = (i: number, v: number) => { const a = (Math.PI * 2 * i) / n - Math.PI / 2; return [c + Math.cos(a) * R * (v / 100), c + Math.sin(a) * R * (v / 100)]; };
  return (
    <svg viewBox={`-56 -6 ${size + 112} ${size + 12}`} className="mx-auto h-auto w-full max-w-[340px]" role="img" aria-label={aria}>
      {[25, 50, 75, 100].map((l) => <polygon key={l} points={cats.map((_, i) => pt(i, l).join(',')).join(' ')} fill="none" stroke="#e2e8f0" />)}
      {cats.map((_, i) => { const [x, y] = pt(i, 100); return <line key={i} x1={c} y1={c} x2={x} y2={y} stroke="#e2e8f0" />; })}
      <polygon points={cats.map((k, i) => pt(i, k.score).join(',')).join(' ')} fill="rgba(217,45,32,.22)" stroke="#D92D20" strokeWidth="2" />
      {cats.map((k, i) => { const [x, y] = pt(i, 124); return <text key={k.key} x={x} y={y} fontSize="8.5" textAnchor="middle" dominantBaseline="middle" fill="#334155" fontWeight={600}>{k.label.split(' ')[0]} {k.score}</text>; })}
    </svg>
  );
}
export default memo(Radar);
