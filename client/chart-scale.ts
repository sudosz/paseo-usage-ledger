const NICE_STEPS = [1, 2, 2.5, 5, 10];

function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const exponent = Math.floor(Math.log10(raw));
  const power = 10 ** exponent;
  const fraction = raw / power;
  const step = NICE_STEPS.find((candidate) => fraction <= candidate) ?? 10;
  return step * power;
}

/** A rounded top and evenly spaced ticks that always include zero. */
export function niceScale(maxValue: number, tickCount = 4): { max: number; ticks: number[] } {
  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    return { max: 1, ticks: [0, 0.25, 0.5, 0.75, 1] };
  }
  const step = niceStep(maxValue / Math.max(1, tickCount));
  const top = Math.ceil(maxValue / step) * step;
  const ticks: number[] = [];
  const count = Math.max(2, Math.round(top / step));
  for (let index = 0; index <= count; index++) ticks.push(roundTick(index * step));
  return { max: top, ticks };
}

function roundTick(value: number): number {
  if (value >= 100) return Math.round(value);
  if (value >= 1) return Math.round(value * 100) / 100;
  return Math.round(value * 1000) / 1000;
}

/**
 * Cosine interpolation between buckets. Linear segments between daily points
 * read as a polygon; easing only the join keeps the endpoints intact and costs
 * one cosine per sample.
 */
export function sampleCurve(values: readonly number[], samples: number): number[] {
  if (values.length === 0 || samples <= 0) return [];
  if (values.length === 1) return Array.from({ length: samples }, () => values[0]);
  return Array.from({ length: samples }, (_, index) => {
    const position = (index / Math.max(1, samples - 1)) * (values.length - 1);
    const left = Math.floor(position);
    const right = Math.min(values.length - 1, left + 1);
    const t = position - left;
    const eased = (1 - Math.cos(t * Math.PI)) / 2;
    return values[left] + (values[right] - values[left]) * eased;
  });
}

/** Deterministic PRNG for fixtures and the aggregation benchmark. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
