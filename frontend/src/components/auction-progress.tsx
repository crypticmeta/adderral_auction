// Auction progress component showing time remaining and an animated, shimmering progress bar that reacts to live pledges
import React, { useEffect, useRef, useState } from 'react';
import { CountdownTimer } from './countdown-timer';
import { AuctionProgressProps } from '../types/auction';

export function AuctionProgress({
  timeRemaining,
  totalRaised,
  hardCap,
  endTimeMs,
  serverTimeMs,
  currentMarketCap,
  ceilingMarketCap,
  ceilingReached = false,
  progressPercentage,
  currentPrice,
}: AuctionProgressProps) {
  // Formatting helpers
  const usdFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
  const btcFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 8 });
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

  return (
    <div className="glass-card p-8 rounded-3xl">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold">Auction Progress</h3>
      </div>

      {/* Countdown Timer */}
      <div className="mb-8">
        <p className="text-gray-400 mb-4">Time Remaining</p>
        <CountdownTimer timeRemaining={timeRemaining} endTimeMs={endTimeMs} serverTimeMs={serverTimeMs} />
      </div>

      {/* Progress Bar */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2">
          {hasHardCap ? (
            <>
              <span className="text-gray-400">BTC Raised</span>
              <span className="text-adderrels-400 font-semibold" data-testid="text-raised-amount">
                {btcFmt.format(clamp(totalRaised ?? 0, 0, Number.POSITIVE_INFINITY))} / {hardCap && hardCap > 0 ? `${btcFmt.format(hardCap)} BTC` : 'No cap'}
              </span>
            </>
          ) : (
            <>
              <span className="text-gray-400">Market Cap Progress</span>
              <span className="text-adderrels-400 font-semibold" data-testid="text-market-cap-amount">
                {currentMarketCap && currentMarketCap > 0
                  ? `${usdFmt.format(currentMarketCap / 1)} (${(currentMarketCap / 1_000_000).toFixed(2)}M)`
                  : usdFmt.format(0)}
                {' / '}
                {hasCapsUSD && ceilingMarketCap && ceilingMarketCap > 0
                  ? `${usdFmt.format(ceilingMarketCap / 1)} (${(ceilingMarketCap / 1_000_000).toFixed(2)}M)`
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
        </div>

        <div className="flex justify-between text-xs text-gray-500 mt-2">
          <span>{hasHardCap ? '0 BTC' : usdFmt.format(0)}</span>
          <span data-testid="text-progress-percentage">
            {displayPct}% Complete
            {ceilingReached && <span className="text-amber-400 ml-1">(Ceiling Reached)</span>}
          </span>
          <span>
            {hasHardCap
              ? hardCap && hardCap > 0 ? `${btcFmt.format(hardCap)} BTC` : 'No cap'
              : hasCapsUSD && ceilingMarketCap && ceilingMarketCap > 0
                ? `$${((ceilingMarketCap as number) / 1_000_000).toFixed(2)}M`
                : '—'}
          </span>
        </div>
        {/* BTC Raised line (UI only; refunds are handled offline and not shown) */}
        <div className="flex justify-between text-sm mt-4 mb-2">
          <span className="text-gray-400">BTC Raised</span>
          <span className="text-adderrels-400 font-semibold" data-testid="text-raised-amount">
            {btcFmt.format(clamp(totalRaised ?? 0, 0, Number.POSITIVE_INFINITY))} BTC
          </span>
        </div>
      </div>

      {/* Current Price */}
      <div className="bg-gradient-to-r from-adderrels-500/10 to-adderrels-600/10 border border-adderrels-500/30 p-4 rounded-xl">
        <p className="text-gray-400 text-sm mb-1">Current Token Price</p>
        <p className="text-2xl font-bold text-adderrels-400" data-testid="text-current-price">
          ${Number.isFinite(currentPrice) ? Number(currentPrice).toFixed(6) : '0.000000'} ADDERRELS
        </p>
      </div>
    </div>
  );
}
