// Auction progress component showing time remaining and an animated, shimmering progress bar that reacts to live pledges
import React, { useEffect, useRef, useState } from 'react';
import { CountdownTimer } from './countdown-timer';

interface TimeRemaining {
  hours: number;
  minutes: number;
  seconds: number;
}

interface AuctionProgressProps {
  timeRemaining: TimeRemaining;
  totalRaised: number; // in BTC
  // Optional: hard cap in BTC to mirror demo component API
  hardCap?: number;
  // Synchronized timing fields (ms since epoch)
  endTimeMs?: number;
  serverTimeMs?: number;

  // Back-compat fields (may be undefined when using demo-like API)
  refundedBTC?: number;
  currentMarketCap?: number; // in USD
  ceilingMarketCap?: number; // in USD
  ceilingReached?: boolean;

  progressPercentage: number;
  currentPrice: number; // token price in USD (or unit)
}

export function AuctionProgress({
  timeRemaining,
  totalRaised,
  hardCap,
  endTimeMs,
  serverTimeMs,
  refundedBTC = 0,
  currentMarketCap,
  ceilingMarketCap,
  ceilingReached = false,
  progressPercentage,
  currentPrice,
}: AuctionProgressProps) {
  const hasHardCap = typeof hardCap === 'number' && !Number.isNaN(hardCap);
  const hasCapsUSD = typeof ceilingMarketCap === 'number' && !Number.isNaN(ceilingMarketCap);

  // Animate on progress increase (live pledges)
  const [bump, setBump] = useState(false);
  const prevPctRef = useRef<number>(0);
  const clampedPct = Math.max(0, Math.min(100, progressPercentage ?? 0));

  useEffect(() => {
    const prev = prevPctRef.current;
    if (clampedPct > prev + 0.05) {
      setBump(true);
      const t = setTimeout(() => setBump(false), 450);
      return () => clearTimeout(t);
    }
    // Always update
    prevPctRef.current = clampedPct;
  }, [clampedPct]);

  return (
    <div className="glass-card p-8 rounded-3xl">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-2xl font-bold">Auction Progress</h3>
        <div className="w-8 h-8 bg-gradient-to-r from-acorn-500 to-acorn-600 rounded-full p-1.5">
          <img src="/acorn.png" alt="Progress" className="w-full h-full object-contain" />
        </div>
      </div>

      {/* Countdown Timer */}
      <div className="mb-8">
        <p className="text-gray-400 mb-4">Time Remaining</p>
        <CountdownTimer timeRemaining={timeRemaining} endTimeMs={endTimeMs} serverTimeMs={serverTimeMs} />
      </div>

      {/* Progress Bar (demo style prioritized) */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2">
          {hasHardCap ? (
            <>
              <span className="text-gray-400">BTC Raised</span>
              <span className="text-acorn-400 font-semibold" data-testid="text-raised-amount">
                {(totalRaised ?? 0).toFixed(3)} / {hardCap!.toFixed(3)} BTC
              </span>
            </>
          ) : (
            <>
              <span className="text-gray-400">Market Cap Progress</span>
              <span className="text-acorn-400 font-semibold" data-testid="text-market-cap-amount">
                ${
                  (currentMarketCap ?? 0) > 0
                    ? ((currentMarketCap as number) / 1_000_000).toFixed(2)
                    : '0.00'
                }M / ${
                  hasCapsUSD ? ((ceilingMarketCap as number) / 1_000_000).toFixed(2) : '0.00'
                }M
              </span>
            </>
          )}
        </div>

        <div
          className="relative w-full h-4 rounded-full overflow-hidden bg-dark-800/80 border border-white/5"
          aria-label="Auction progress"
          role="progressbar"
          aria-valuenow={Number.isFinite(clampedPct) ? Number(clampedPct.toFixed(1)) : 0}
          aria-valuemin={0}
          aria-valuemax={100}
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
              className={`absolute inset-0 ${
                ceilingReached
                  ? 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-600'
                  : 'bg-gradient-to-r from-acorn-500 via-acorn-400 to-acorn-600'
              } gradient-animate progress-glow`}
            />
            {/* Shimmer overlay (only over filled portion) */}
            <div className="absolute inset-0 progress-shimmer" aria-hidden="true" />
          </div>
        </div>

        <div className="flex justify-between text-xs text-gray-500 mt-2">
          <span>{hasHardCap ? '0 BTC' : '$0'}</span>
          <span data-testid="text-progress-percentage">
            {(progressPercentage ?? 0).toFixed(1)}% Complete
            {ceilingReached && <span className="text-amber-400 ml-1">(Ceiling Reached)</span>}
          </span>
          <span>
            {hasHardCap
              ? `${hardCap!.toFixed(3)} BTC`
              : hasCapsUSD
              ? `$${((ceilingMarketCap as number) / 1_000_000).toFixed(2)}M`
              : '$0'}
          </span>
        </div>

        {/* BTC Raised line (kept for back-compat and refunds) */}
        <div className="flex justify-between text-sm mt-4 mb-2">
          <span className="text-gray-400">BTC Raised</span>
          <span className="text-acorn-400 font-semibold" data-testid="text-raised-amount">
            {(totalRaised ?? 0).toFixed(3)} BTC
            {typeof refundedBTC === 'number' && refundedBTC > 0 && (
              <span className="text-amber-400 text-xs ml-2">({refundedBTC.toFixed(3)} BTC refunded)</span>
            )}
          </span>
        </div>
      </div>

      {/* Current Price */}
      <div className="bg-gradient-to-r from-acorn-500/10 to-acorn-600/10 border border-acorn-500/30 p-4 rounded-xl">
        <p className="text-gray-400 text-sm mb-1">Current Token Price</p>
        <p className="text-2xl font-bold text-acorn-400" data-testid="text-current-price">
          ${typeof currentPrice === 'number' && !Number.isNaN(currentPrice) ? currentPrice.toFixed(6) : '0.000000'} ACORN
        </p>
      </div>
    </div>
  );
}
