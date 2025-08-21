"use client";
// DevCutBanner.tsx
// Purpose: In dev/testing only, show countdown to end of current 24h window and a 5% developer cut for the last 24h total (BTC + USD).
// Inputs: last24hBTC (number), generatedAt (ISO string | null)
// Behavior: Ticks every second. Uses /api/status for btcUsd. Null-safe.

import React, { useEffect, useMemo, useState } from 'react';
import { env } from '@/config/env';

export default function DevCutBanner({ last24hBTC, generatedAt }: { last24hBTC: number; generatedAt: string | null }) {
  const isDevMode = env.appEnv === 'development' || env.testing;
  const [btcUsd, setBtcUsd] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());

  useEffect(() => {
    if (!isDevMode) return;
    let aborted = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    fetch(`${env.apiUrl}/api/status`, { signal: ctrl.signal, cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((j) => { if (!aborted) setBtcUsd(typeof j?.btcUsd === 'number' ? j.btcUsd : null); })
      .catch(() => { if (!aborted) setBtcUsd(null); })
      .finally(() => clearTimeout(timer));
    return () => { aborted = true; ctrl.abort(); clearTimeout(timer); };
  }, [isDevMode]);

  useEffect(() => {
    if (!isDevMode) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [isDevMode]);

  const nextBoundary = useMemo(() => {
    // Base on generatedAt if provided; else current time
    const base = generatedAt ? new Date(generatedAt).getTime() : now;
    const dayMs = 24 * 60 * 60 * 1000;
    const next = Math.ceil(base / dayMs) * dayMs; // UTC epoch boundary
    return next;
  }, [generatedAt, now]);

  const remaining = Math.max(0, nextBoundary - now);
  const hrs = Math.floor(remaining / (1000 * 60 * 60));
  const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((remaining % (1000 * 60)) / 1000);

  const devCutBtc = (Number.isFinite(last24hBTC) ? last24hBTC : 0) * 0.05;
  const devCutUsd = btcUsd != null ? devCutBtc * btcUsd : null;

  if (!isDevMode) return null;

  return (
    <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="text-sm text-amber-300 font-semibold">Developer Cut (5%)</div>
          <div className="text-white/90 text-lg font-mono">
            {devCutBtc.toFixed(6)} BTC {devCutUsd != null && (<span className="text-white/70 text-sm">(≈ ${devCutUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })})</span>)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-white/60">Time left in current 24h window</div>
          <div className="font-mono text-white text-lg tabular-nums">{String(hrs).padStart(2,'0')}:{String(mins).padStart(2,'0')}:{String(secs).padStart(2,'0')}</div>
        </div>
      </div>
    </div>
  );
}
