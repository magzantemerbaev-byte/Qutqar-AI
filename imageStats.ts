import type { ImageStats } from '../types';

/**
 * Цветовая эвристика по пикселям (выполняется в браузере, без нейросети):
 *  • «пламя» — яркие насыщенные красно-оранжево-желтые пиксели
 *  • «дым»   — серые малонасыщенные пиксели средней яркости
 * Используется в DEMO MODE и передается на backend для mock-режима.
 */
export async function computeImageStats(file: File): Promise<ImageStats> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error('Не удалось прочитать изображение'));
      i.src = url;
    });
    const W = 160;
    const H = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * W));
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('Canvas недоступен');
    ctx.drawImage(img, 0, 0, W, H);
    const px = ctx.getImageData(0, 0, W, H).data;
    let fire = 0, smoke = 0, bright = 0, seed = 2166136261;
    const fs: [number, number][] = []; const ss: [number, number][] = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const l = max / 255; const sat = max ? (max - min) / max : 0;
      bright += l;
      if (r > 170 && r >= g && g >= b * 0.9 && r - b > 80 && sat > 0.45 && g > 40) { fire++; fs.push([x, y]); }
      else if (sat < 0.16 && l > 0.3 && l < 0.88) { smoke++; ss.push([x, y]); }
      if ((x + y) % 7 === 0) seed = Math.imul(seed ^ (r + g * 3 + b * 7), 16777619) >>> 0;
    }
    const n = W * H;
    const centroid = (pts: [number, number][]) => {
      if (pts.length < 5) return null;
      const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
      const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
      const sx = Math.sqrt(pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0) / pts.length);
      const sy = Math.sqrt(pts.reduce((a, p) => a + (p[1] - my) ** 2, 0) / pts.length);
      return { x: (mx / W) * 100, y: (my / H) * 100, spreadX: (sx / W) * 100, spreadY: (sy / H) * 100 };
    };
    return {
      width: img.naturalWidth, height: img.naturalHeight, sizeKb: Math.round(file.size / 1024),
      firePixels: fire / n, smokePixels: smoke / n, brightness: bright / n,
      fireCentroid: centroid(fs), smokeCentroid: centroid(ss), seed: seed >>> 0,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
