// ResetDbButton.tsx
// Purpose: Dev-only utility to fully wipe and reseed the DB via backend endpoint.
// Behavior: POSTs to /api/auction/reseed, shows loading and result message. Render only in non-production.
// Styling: TailwindCSS minimal secondary button.
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

  const isDev = process.env.NODE_ENV !== 'production';
  if (!isDev) return null;

  const handleClick = async () => {
    setMsg(null);
    setErr(null);

    if (!apiUrl) {
      setErr('API URL not configured');
      return;
    }

    const ok = typeof window !== 'undefined' ? window.confirm('FULL DB RESEED? This will wipe Users, Auctions, and Pledges, then reseed demo data. Dev only.') : true;
    if (!ok) return;

    try {
      setPending(true);
      const res = await fetch(`${apiUrl}/api/auction/reseed`, { method: 'POST' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({} as any));
        throw new Error(j?.message || 'Reset failed');
      }
      const j = await res.json().catch(() => null as any);
      setMsg(j?.message || 'Database wiped and reseeded');
    } catch (e: any) {
      setErr(String(e?.message || 'Unexpected error'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
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
