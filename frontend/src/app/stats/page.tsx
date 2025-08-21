// /stats page
// Purpose: Public stats view showing total BTC pledged in the last 24h, 48h, and 72h.
// Behavior: Server component fetches from backend `/api/pledges/stats` (no auth). Null-safe rendering.
// Styling: TailwindCSS with project theme cards and typography.

import React from 'react';
import DevCutBanner from '@/components/DevCutBanner';
import { env } from '@/config/env';

interface PledgeStatsResponse {
  scope: { type: 'active_auction' | 'all'; auctionId?: string };
  totals: { last24h: number; last48h: number; last72h: number };
  generatedAt: string;
}

async function getStats(): Promise<PledgeStatsResponse | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) return null;

  try {
    const res = await fetch(`${apiUrl}/api/pledges/stats`, { next: { revalidate: 30 } });
    if (!res.ok) return null;
    const json = (await res.json()) as PledgeStatsResponse;
    return json;
  } catch {
    return null;
  }
}

function StatCard({ label, valueBTC }: { label: string; valueBTC: number }) {
  const display = Number.isFinite(valueBTC) ? valueBTC.toFixed(3) : '0.000';
  return (
    <div className="glass-card rounded-2xl p-6 border border-white/10 hover:border-adderrels-500/40 transition-colors">
      <p className="text-sm text-gray-400 mb-2">{label}</p>
      <p className="text-3xl font-semibold text-white">
        {display} <span className="text-gray-400 text-base">BTC</span>
      </p>
    </div>
  );
}

export default async function StatsPage() {
  const stats = await getStats();
  const totals = stats?.totals ?? { last24h: 0, last48h: 0, last72h: 0 };
  const generatedAt = stats?.generatedAt ?? null;
  const isDev = env.appEnv === 'development' || env.testing;

  return (
    <main className="container mx-auto px-4 py-10">
      <header className="mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-adderrels-400 to-adderrels-600 bg-clip-text text-transparent">
          Pledge Stats
        </h1>
        <p className="text-gray-400 mt-2">Totals pledged in disjoint 24h windows.</p>
        {generatedAt && (
          <p className="text-xs text-gray-500 mt-1">Updated: {new Date(generatedAt).toLocaleString()}</p>
        )}
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="0–24h" valueBTC={totals.last24h ?? 0} />
        <StatCard label="24–48h" valueBTC={totals.last48h ?? 0} />
        <StatCard label="48–72h" valueBTC={totals.last72h ?? 0} />
      </section>

      {isDev && (
        <DevCutBanner last24hBTC={totals.last24h ?? 0} generatedAt={generatedAt} />
      )}

      {!stats && (
        <div className="mt-6 text-sm text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
          Could not load stats from the server. Please try again later.
        </div>
      )}
    </main>
  );
}
