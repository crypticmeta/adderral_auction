"use client";
// EnvironmentGuard.tsx
// Purpose: Fetch backend status and block UI with an error overlay if frontend/backend envs mismatch.
// Notes: Uses public env from config/env.ts. Null-safe and SSR-safe.

import React, { useEffect, useMemo, useState } from 'react';
import { env } from '@/config/env';

type BackendStatus = {
  network: 'mainnet' | 'testnet' | string;
  testing: boolean;
  nodeEnv?: string;
};

export default function EnvironmentGuard() {
  const [backend, setBackend] = useState<BackendStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let aborted = false;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);

    async function run() {
      try {
        const res = await fetch(`${env.apiUrl}/api/status`, { signal: ctrl.signal, cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as BackendStatus;
        if (!aborted) setBackend(json);
      } catch (e: any) {
        if (!aborted) setError(e?.message ?? 'Failed to reach backend status');
      } finally {
        clearTimeout(timer);
      }
    }
    // Only run in browser
    if (typeof window !== 'undefined') run();
    return () => {
      aborted = true;
      clearTimeout(timer);
      ctrl.abort();
    };
  }, []);

  const mismatch = useMemo(() => {
    if (!backend) return false;
    const netMismatch = (backend.network ?? '').toLowerCase() !== env.btcNetwork;
    const testMismatch = Boolean(backend.testing) !== Boolean(env.testing);
    return netMismatch || testMismatch;
  }, [backend]);

  if (!backend && !error) return null; // don't flash overlay until we know

  if (error) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 text-white p-6">
        <div className="max-w-lg w-full rounded-xl border border-red-500/30 bg-red-950/30 p-5">
          <h2 className="text-xl font-semibold text-red-300">Backend status unavailable</h2>
          <p className="mt-2 text-sm text-red-200">{error}</p>
          <p className="mt-2 text-xs text-white/70">API: {env.apiUrl}</p>
        </div>
      </div>
    );
  }

  if (mismatch && backend) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 text-white p-6">
        <div className="max-w-2xl w-full rounded-xl border border-yellow-500/30 bg-yellow-900/20 p-6">
          <h2 className="text-2xl font-bold text-yellow-300">Environment mismatch detected</h2>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div className="rounded-lg border border-white/10 p-3">
              <div className="text-white/70">Frontend</div>
              <div className="mt-1 font-mono">network: {env.btcNetwork}</div>
              <div className="font-mono">testing: {String(env.testing)}</div>
            </div>
            <div className="rounded-lg border border-white/10 p-3">
              <div className="text-white/70">Backend</div>
              <div className="mt-1 font-mono">network: {String(backend.network)}</div>
              <div className="font-mono">testing: {String(backend.testing)}</div>
            </div>
          </div>
          <p className="mt-4 text-white/80">
            Both frontend and backend must be on the same network and testing mode. Update env vars and restart.
          </p>
        </div>
      </div>
    );
  }

  return null;
}
