import type { UmamiPageviewPoint, Anomaly } from '../types.js';

export function detectAnomalies(series: UmamiPageviewPoint[], threshold = 2.0): Anomaly[] {
  if (series.length < 7) return [];

  const values = series.map(p => p.y);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const std = Math.sqrt(variance);

  if (std === 0) return [];

  return series
    .map(point => {
      const zScore = (point.y - mean) / std;
      if (Math.abs(zScore) < threshold) return null;
      return {
        date: point.x,
        value: point.y,
        expected: Math.round(mean),
        zScore: Math.round(zScore * 10) / 10,
        direction: zScore > 0 ? ('spike' as const) : ('drop' as const),
      };
    })
    .filter((a): a is Anomaly => a !== null)
    .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));
}
