// File: format.ts - Shared number formatting helpers for USD, BTC, and generic compact values

export function clampNumber(value: number, min = 0, max = Number.POSITIVE_INFINITY): number {
  if (!Number.isFinite(value)) return 0;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function formatNumberCompact(value: number, maximumFractionDigits = 2): string {
  const n = clampNumber(value);
  return new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits,
  }).format(n);
}

export function formatUSD(value: number, maximumFractionDigits = 2): string {
  const n = clampNumber(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits,
  }).format(n);
}

export function formatUSDCompact(value: number, maximumFractionDigits = 2): string {
  const n = clampNumber(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits,
  }).format(n);
}

export function formatBTC(value: number, minFrac = 3, maxFrac = 8): string {
  const n = clampNumber(value);
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: minFrac,
    maximumFractionDigits: maxFrac,
  }).format(n);
}
