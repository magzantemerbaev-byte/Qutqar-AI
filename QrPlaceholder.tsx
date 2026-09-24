import { memo } from 'react';

/**
 * QR-подобная ЗАГЛУШКА: детерминированный узор из ID отчета (с угловыми «искателями»).
 * Это не настоящий QR-код и не сканируется — в рабочей версии заменяется генератором QR (например, пакетом qrcode).
 */
function QrPlaceholder({ value, size = 96, label }: { value: string; size?: number; label: string }) {
  const N = 25;
  let h = 2166136261;
  const bits: boolean[] = [];
  for (let i = 0; i < N * N; i++) {
    h = Math.imul(h ^ value.charCodeAt(i % value.length) ^ i, 16777619) >>> 0;
    bits.push(((h >>> 7) & 1) === 1);
  }
  const finder = (x: number, y: number) => {
    const inBox = (ox: number, oy: number) => x >= ox && x < ox + 7 && y >= oy && y < oy + 7;
    for (const [ox, oy] of [[0, 0], [N - 7, 0], [0, N - 7]]) {
      if (inBox(ox, oy)) { const dx = x - ox, dy = y - oy; return dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4) ? 1 : 0; }
    }
    return -1;
  };
  const cells: JSX.Element[] = [];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const f = finder(x, y);
    if (f === 1 || (f === -1 && bits[y * N + x])) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
  }
  return (
    <figure className="inline-flex flex-col items-center gap-1">
      <svg viewBox={`-2 -2 ${N + 4} ${N + 4}`} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges">
        <rect x="-2" y="-2" width={N + 4} height={N + 4} fill="#fff" /><g fill="#0A1A33">{cells}</g>
      </svg>
      <figcaption className="max-w-[140px] text-center text-[9px] leading-tight text-slate-500">{label}</figcaption>
    </figure>
  );
}
export default memo(QrPlaceholder);
