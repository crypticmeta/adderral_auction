// Auction progress component showing time remaining and a stacked (confirmed + pending) animated progress bar that reacts to live pledges
import React, { useEffect, useRef, useState } from 'react';
import { CountdownTimer } from './countdown-timer';
import { AuctionProgressProps } from '@shared/types/auction';
import { formatBTC, formatUSD, formatUSDCompact, clampNumber } from '@/lib/format';

export function AuctionProgress({
  timeRemaining,
  totalRaised,
  hardCap,
  startTimeMs,
  endTimeMs,
  serverTimeMs,
  currentMarketCap,
  ceilingMarketCap,
  ceilingReached = false,
  progressPercentage,
  currentPrice,
  auctionId,
}: AuctionProgressProps) {
  // Formatting helpers
  const clamp = (v: number, min: number, max: number) => (Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : 0);

  const hasHardCap = typeof hardCap === 'number' && !Number.isNaN(hardCap);
  const hasCapsUSD = typeof ceilingMarketCap === 'number' && !Number.isNaN(ceilingMarketCap);

  // Animate on progress increase (live pledges)
  const [bump, setBump] = useState(false);
  const prevPctRef = useRef<number>(0);
  const clampedPct = clamp(progressPercentage ?? 0, 0, 100);
  const displayPct = clamp(Number(clampedPct.toFixed(1)), 0, 100);

  const BUMP_THRESHOLD = 0.05; // percent points
  const BUMP_DURATION_MS = 450;

  useEffect(() => {
    const prev = prevPctRef.current;
    if (clampedPct > prev + BUMP_THRESHOLD) {
      setBump(true);
      const t = setTimeout(() => setBump(false), BUMP_DURATION_MS);
      return () => {
        clearTimeout(t);
        prevPctRef.current = clampedPct;
      };
    }
    // Always update reference
    prevPctRef.current = clampedPct;
  }, [clampedPct]);

  // Pending/Projected overlay percent (stacked segment)
  const [projectedPct, setProjectedPct] = useState<number | null>(null);
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || '').trim() || 'http://localhost:5000';
  useEffect(() => {
    let active = true;
    const fetchProjected = async () => {
      if (!auctionId) {
        setProjectedPct(null);
        return;
      }
      try {
        const res = await fetch(`${apiUrl}/api/pledges/max/${auctionId}`);
        if (!res.ok) return;
        const data = await res.json();
        const pct = typeof data?.projectedPercent === 'number' ? data.projectedPercent : null;
        if (!active) return;
        setProjectedPct(pct);
      } catch (_) {
        if (!active) return;
        setProjectedPct(null);
      }
    };
    // initial + refresh when progress moves
    fetchProjected();
    const t = setTimeout(fetchProjected, 1200);
    return () => { active = false; clearTimeout(t); };
  }, [auctionId, clampedPct, apiUrl]);

  const nowMs = typeof serverTimeMs === 'number' ? (serverTimeMs as number) : (typeof window !== 'undefined' ? Date.now() : 0);
  const preStart = typeof startTimeMs === 'number' ? nowMs < (startTimeMs as number) : false;

  return (
    <div className="glass-card p-8 rounded-3xl">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold">Auction Progress</h3>
      </div>

      {/* Countdown Timer */}
      <div className="mb-8">
        <p className="text-gray-400 mb-4">{preStart ? 'Starts In' : 'Time Remaining'}</p>
        <CountdownTimer timeRemaining={timeRemaining} startTimeMs={startTimeMs} endTimeMs={endTimeMs} serverTimeMs={serverTimeMs} />
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        {preStart ? (
          <div className="text-center text-gray-500 text-sm py-10 border border-dashed border-gray-700 rounded-xl">
            Progress will appear when the auction starts.
          </div>
        ) : (
          <>
            <div className="flex justify-between text-sm mb-2">
              {hasHardCap ? (
                <>
                  <span className="text-gray-400">BTC Raised</span>
                  <span className="text-adderrels-400 font-semibold" data-testid="text-raised-amount">
                    {formatBTC(clampNumber(totalRaised ?? 0))} / {hardCap && hardCap > 0 ? `${formatBTC(hardCap)} BTC` : 'No cap'}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-gray-400">Market Cap Progress</span>
                  <span
                    className="text-adderrels-400 font-semibold"
                    data-testid="text-market-cap-amount"
                    title={`${formatUSD(currentMarketCap ?? 0)} / ${hasCapsUSD && ceilingMarketCap && ceilingMarketCap > 0 ? formatUSD(ceilingMarketCap) : '—'}`}
                  >
                    {currentMarketCap && currentMarketCap > 0
                      ? `${formatUSDCompact(currentMarketCap)}`
                      : formatUSD(0)}
                    {' / '}
                    {hasCapsUSD && ceilingMarketCap && ceilingMarketCap > 0
                      ? `${formatUSDCompact(ceilingMarketCap)}`
                      : '—'}
                  </span>
                </>
              )}
            </div>

            <div
              className="relative w-full h-4 rounded-full overflow-hidden bg-dark-800/80 border border-white/5"
              aria-label="Auction progress"
              role="progressbar"
              aria-valuenow={displayPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuetext={`${displayPct}% complete${ceilingReached ? ', ceiling reached' : ''}`}
            >
              {/* Rail subtle gradient for depth */}
              <div className="absolute inset-0 opacity-60 pointer-events-none"
                aria-hidden="true"
                style={{
                  background:
                    'linear-gradient(90deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02) 20%, rgba(255,255,255,0.06) 40%)',
                }}
              />

              {/* Fill with animated gradient */}
              <div
                className={`relative h-full transition-[width] duration-500 ease-out ${bump ? 'animate-bump' : ''}`}
                style={{ width: `${clampedPct}%` }}
                data-testid="progress-bar"
              >
                <div
                  className={`absolute inset-0 ${ceilingReached
                    ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600'
                    : 'bg-gradient-to-r from-adderrels-500 via-adderrels-400 to-adderrels-600'
                    } gradient-animate progress-glow`}
                />
                {/* Shimmer overlay (only over filled portion) */}
                <div className="absolute inset-0 progress-shimmer" aria-hidden="true" />
              </div>

              {/* Pending overlay segment from confirmed -> projected */}
              {typeof projectedPct === 'number' && projectedPct > clampedPct && (
                <div
                  className="absolute top-0 left-0 h-full pointer-events-none"
                  style={{ width: `${Math.min(100, Math.max(projectedPct, clampedPct))}%` }}
                  aria-hidden="true"
                >
                  {/* base transparent to keep rail */}
                  <div className="absolute inset-0" />
                  {/* overlay only beyond confirmed width */}
                  <div
                    className="absolute top-0 h-full bg-gradient-to-r from-amber-500/40 via-amber-400/30 to-amber-600/40 border-l border-amber-400/40"
                    style={{ left: `${clampedPct}%`, right: 0 }}
                  />
                  {/* subtle diagonal stripes indicating pending */}
                  <div
                    className="absolute top-0 h-full opacity-30"
                    style={{
                      left: `${clampedPct}%`,
                      right: 0,
                      backgroundImage: 'repeating-linear-gradient(45deg, rgba(251,191,36,0.25) 0, rgba(251,191,36,0.25) 6px, transparent 6px, transparent 12px)'
                    }}
                  />
                </div>
              )}
            </div>

            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>{hasHardCap ? '0 BTC' : formatUSD(0)}</span>
              <span data-testid="text-progress-percentage">
                {displayPct}% Confirmed
                {typeof projectedPct === 'number' && projectedPct > clampedPct && (
                  <span className="ml-1 text-amber-400">({Math.min(100, Number(projectedPct.toFixed(1)))}% projected)</span>
                )}
                {ceilingReached && <span className="text-amber-400 ml-1">(Ceiling Reached)</span>}
              </span>
              <span>
                {hasHardCap
                  ? hardCap && hardCap > 0 ? `${formatBTC(hardCap)} BTC` : 'No cap'
                  : hasCapsUSD && ceilingMarketCap && ceilingMarketCap > 0
                    ? `${formatUSDCompact(ceilingMarketCap as number)}`
                    : '—'}
              </span>
            </div>
            {/* BTC Raised line (UI only; refunds are handled offline and not shown) */}
            <div className="flex justify-between text-sm mt-4 mb-2">
              <span className="text-gray-400">BTC Raised</span>
              <span className="text-adderrels-400 font-semibold" data-testid="text-raised-amount">
                {formatBTC(clampNumber(totalRaised ?? 0))} BTC
              </span>
            </div>
          </>
        )}
      </div>

      {/* Current Price */}
      {!preStart && (
        <div className="bg-gradient-to-r from-adderrels-500/10 to-adderrels-600/10 border border-adderrels-500/30 p-4 rounded-xl">
          <p className="text-gray-400 text-sm mb-1">Current Token Price</p>
          <p className="text-2xl font-bold text-adderrels-400" data-testid="text-current-price">
            ${Number.isFinite(currentPrice) ? Number(currentPrice).toFixed(6) : '0.000000'} ADDERRELS
          </p>
        </div>
      )}
    </div>
  );
}
