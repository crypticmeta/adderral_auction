// File: DebugWindow.tsx - Floating debug window to view/copy WebSocket events and expose dev/testing controls
"use client";

import React, { useMemo, useState } from "react";
import { useDebugLog } from "@/contexts/DebugLogContext";
import { env } from "@/config/env";
import { http } from "@/lib/http";
import { useBtcNetwork } from "@/contexts/NetworkContext";
import ResetDbButton from "@/components/ResetDbButton";

const DirBadge: React.FC<{ dir: "in" | "out" | "sys" | "err" }> = ({ dir }) => {
  const styles = useMemo(() => {
    switch (dir) {
      case "in":
        return "bg-green-600/20 text-green-300 border border-green-600/40";
      case "out":
        return "bg-blue-600/20 text-blue-300 border border-blue-600/40";
      case "sys":
        return "bg-zinc-600/20 text-zinc-300 border border-zinc-600/40";
      case "err":
        return "bg-red-600/20 text-red-300 border border-red-600/40";
      default:
        return "bg-zinc-600/20 text-zinc-300 border border-zinc-600/40";
    }
  }, [dir]);
  return <span className={`px-1.5 py-0.5 rounded text-xs ${styles}`}>{dir}</span>;
};

const DebugWindow: React.FC = () => {
  const { entries, clear, copyAllToClipboard } = useDebugLog();
  const [collapsed, setCollapsed] = useState(false);
  const isTesting = !!env.testing;
  const isDev = (process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV) !== "production";
  const { network } = useBtcNetwork();

  // Testing controls state
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [users, setUsers] = useState<number>(10);
  const [pledges, setPledges] = useState<number>(25);
  const [targetPercent, setTargetPercent] = useState<number>(80);
  const [processQueue, setProcessQueue] = useState<boolean>(true);

  const onCopy = async () => {
    await copyAllToClipboard();
  };

  const safeNumber = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const onResetPledges = async () => {
    if (!isTesting) return;
    setMsg(null);
    setErr(null);
    try {
      setPending(true);
      await http.post('/api/testing/reset-pledges');
      setMsg('Pledges reset successfully');
    } catch (e: any) {
      setErr(String(e?.message || 'Failed to reset pledges'));
    } finally {
      setPending(false);
    }
  };

  const onSeedRandom = async () => {
    if (!isTesting) return;
    setMsg(null);
    setErr(null);
    try {
      setPending(true);
      const payload = {
        users: Math.max(1, safeNumber(users, 10)),
        pledges: Math.max(1, safeNumber(pledges, 25)),
        targetPercent: Math.min(110, Math.max(0, safeNumber(targetPercent, 80))),
        process: !!processQueue,
      };
      const res = await http.post('/api/testing/seed-random', payload);
      const j = res?.data ?? null;
      setMsg(j?.message || 'Seeded random data');
    } catch (e: any) {
      setErr(String(e?.message || 'Failed to seed data'));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[460px] max-w-[95vw] text-sm">
      <div className="rounded-md overflow-hidden shadow-lg bg-neutral-900/90 backdrop-blur border border-neutral-700">
        <div className="flex items-center justify-between px-3 py-2 bg-neutral-800/70 border-b border-neutral-700">
          <div className="flex items-center gap-2">
            <span className="font-semibold">WS Debug</span>
            <span className="text-xs text-neutral-400">{entries.length} events</span>
            <span className="text-[10px] text-neutral-400 ml-2">net: {network}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCopy}
              className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs"
            >
              Copy all
            </button>
            <button
              type="button"
              onClick={() => clear()}
              className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setCollapsed(v => !v)}
              className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs"
            >
              {collapsed ? "Expand" : "Collapse"}
            </button>
          </div>
        </div>
        {(isDev || isTesting) && (
          <div className="px-3 py-2 bg-neutral-900/70 border-b border-neutral-800 space-y-2">
            {/* Reseed DB (dev helper) */}
            {isDev && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-neutral-400">DB</span>
                <ResetDbButton apiUrl={env.apiUrl} />
              </div>
            )}

            {/* Testing-only controls */}
            {isTesting && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-yellow-400">Testing</span>
                  <button
                    type="button"
                    onClick={onResetPledges}
                    disabled={pending}
                    className="px-2 py-1 rounded bg-yellow-700/30 hover:bg-yellow-700/40 text-xs text-yellow-300 border border-yellow-700/40 disabled:opacity-50"
                  >
                    Reset pledges
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-neutral-400">users</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={200}
                    value={users}
                    onChange={(e) => setUsers(safeNumber(e.target.value, 10))}
                    className="w-16 rounded-md bg-neutral-800/60 border border-neutral-700 px-2 py-1 text-xs text-neutral-100"
                  />
                  <label className="text-xs text-neutral-400">pledges</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={1000}
                    value={pledges}
                    onChange={(e) => setPledges(safeNumber(e.target.value, 25))}
                    className="w-16 rounded-md bg-neutral-800/60 border border-neutral-700 px-2 py-1 text-xs text-neutral-100"
                  />
                  <label className="text-xs text-neutral-400">target %</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={110}
                    value={targetPercent}
                    onChange={(e) => setTargetPercent(safeNumber(e.target.value, 80))}
                    className="w-16 rounded-md bg-neutral-800/60 border border-neutral-700 px-2 py-1 text-xs text-neutral-100"
                  />
                  <label className="text-xs text-neutral-400 flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={processQueue}
                      onChange={(e) => setProcessQueue(!!e.target.checked)}
                      className="accent-yellow-500"
                    />
                    process
                  </label>
                  <button
                    type="button"
                    onClick={onSeedRandom}
                    disabled={pending}
                    className="px-2 py-1 rounded bg-yellow-700/30 hover:bg-yellow-700/40 text-xs text-yellow-300 border border-yellow-700/40 disabled:opacity-50"
                  >
                    Seed random
                  </button>
                </div>
                {(msg || err) && (
                  <div className="text-xs">
                    {msg && <span className="text-green-300">{msg}</span>}
                    {err && <span className="text-red-300">{err}</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {!collapsed && (
          <div className="max-h-72 overflow-auto p-2 space-y-1">
            {entries.length === 0 ? (
              <div className="text-neutral-400 text-xs">No events yet</div>
            ) : (
              entries.slice(-200).map(e => (
                <div key={e.id} className="flex items-start gap-2">
                  <DirBadge dir={e.dir} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-neutral-300">
                      <span className="text-[10px] tabular-nums">
                        {new Date(e.ts).toLocaleTimeString?.() ?? e.ts}
                      </span>
                      <span className="font-medium">{e.event}</span>
                    </div>
                    {e.payload != null && (
                      <pre className="whitespace-pre-wrap break-words text-xs text-neutral-400 bg-neutral-800/60 p-2 rounded border border-neutral-700">
                        {(() => {
                          try {
                            return JSON.stringify(e.payload, null, 2);
                          } catch {
                            return String(e.payload);
                          }
                        })()}
                      </pre>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default DebugWindow;
