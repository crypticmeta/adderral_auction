/**
 * TestingBanner component
 * Purpose: Show a global testing-mode banner across the app.
 * Styling: Tailwind, subtle gradient with border; responsive and accessible.
 * Null-safety: No external props; uses env on consumer side to gate rendering.
 */
'use client';

import React from 'react';

export default function TestingBanner() {
  return (
    <div
      className="w-full mb-4"
      role="status"
      aria-live="polite"
      aria-label="Application is running in testing mode"
    >
      <div className="flex items-center justify-center gap-2 rounded-md border border-yellow-500/40 bg-yellow-500/10 px-4 py-2 text-yellow-300 text-sm">
        <span className="inline-flex h-2 w-2 rounded-full bg-yellow-400 animate-pulse" aria-hidden="true" />
        <span className="font-semibold tracking-wide">Testing Mode</span>
        <span className="text-yellow-400/80">— Sandbox environment. Balances and data may be simulated.</span>
      </div>
    </div>
  );
}
