// File: frontend/src/components/ResetDbButton.tsx
// Purpose: Dev-only utility to fully wipe and reseed the DB via backend endpoint.
// Behavior: POSTs to /api/auction/reseed[?mode=test|prod], shows loading and result message. Render only in non-production.
// Styling: TailwindCSS minimal controls.
// Null-safety: Guards around fetch and envs. No-ops if API unavailable.
import React, { useState } from 'react';

interface ResetDbButtonProps {
  apiUrl: string | null | undefined;
  className?: string;
}

const ResetDbButton: React.FC<ResetDbButtonProps> = ({ apiUrl, className }) => {
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mode, setMode] = useState<'test' | 'prod'>('test');

  const isDev = process.env.NODE_ENV !== 'production';
  if (!isDev) return null;

  const handleClick = async () => {
    setMsg(null);
    setErr(null);

    if (!apiUrl) {
      setErr('API URL not configured');
      return;
    }

    const confirmText =
      mode === 'prod'
        ? 'PROD-STYLE RESEED: This will WIPE Users, Auctions, and Pledges, then seed ONLY the production-style auction (no test users/pledges). Start=29 Aug 13:00 UTC, 72h. Continue?'
        : 'FULL DB RESEED (TEST): This will wipe Users, Auctions, and Pledges, then reseed demo users and pledges. Continue?';
    const ok = typeof window !== 'undefined' ? window.confirm(confirmText) : true;
    if (!ok) return;

    try {
      setPending(true);
      const controller = new AbortController();
      const timeoutMs = 15000; // 15s
      const t = setTimeout(() => controller.abort(), timeoutMs);
      const url = `${apiUrl}/api/auction/reseed?mode=${encodeURIComponent(mode)}`;
      const res = await fetch(url, { method: 'POST', signal: controller.signal });
      clearTimeout(t);
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        throw new Error(j?.message || 'Reset failed');
      }
      const j = await res.json().catch(() => null as any);
      setMsg(j?.message || 'Database wiped and reseeded');
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        setErr('Request timed out. Please try again.');
      } else {
        setErr(String(e?.message || 'Unexpected error'));
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <label className="text-xs text-gray-300" htmlFor="reseed-mode">
        Mode
      </label>
      <select
        id="reseed-mode"
        className="text-xs bg-zinc-800/60 border border-zinc-600/50 rounded px-2 py-1 text-gray-100"
        value={mode}
        onChange={(e) => setMode((e.target.value as 'test' | 'prod') ?? 'test')}
        disabled={pending}
        data-testid="select-reseed-mode"
      >
        <option value="test">test (24h demo)</option>
        <option value="prod">prod (29 Aug 13:00 UTC, 72h)</option>
      </select>

      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="text-xs px-3 py-1 rounded-md bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 disabled:opacity-50"
        data-testid="button-reset-db"
      >
        {pending ? 'Reseeding…' : 'Reseed DB'}
      </button>
      {msg && <span className="text-xs text-green-300">{msg}</span>}
      {err && <span className="text-xs text-red-300">{err}</span>}
    </div>
  );
};

export default ResetDbButton;
