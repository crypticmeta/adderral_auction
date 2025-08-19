// File: DebugLogContext.tsx - Collects and exposes WebSocket debug logs across the app
"use client";

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";

export type DebugDirection = "in" | "out" | "sys" | "err";

export interface DebugEntry {
  id: string;
  ts: number; // epoch ms
  dir: DebugDirection;
  event: string;
  payload?: unknown;
}

interface DebugLogContextType {
  entries: DebugEntry[];
  addEntry: (dir: DebugDirection, event: string, payload?: unknown) => void;
  clear: () => void;
  copyAllToClipboard: () => Promise<void>;
}

const DebugLogContext = createContext<DebugLogContextType | undefined>(undefined);

export const useDebugLog = (): DebugLogContextType => {
  const ctx = useContext(DebugLogContext);
  if (!ctx) throw new Error("useDebugLog must be used within DebugLogProvider");
  return ctx;
};

export const DebugLogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [entries, setEntries] = useState<DebugEntry[]>([]);
  const counterRef = useRef(0);

  const addEntry = useCallback((dir: DebugDirection, event: string, payload?: unknown) => {
    // null checks
    const e = String(event ?? "unknown");
    const id = `${Date.now()}_${counterRef.current++}`;
    setEntries(prev => [
      ...prev,
      { id, ts: Date.now(), dir, event: e, payload },
    ]);
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  const copyAllToClipboard = useCallback(async () => {
    const text = JSON.stringify(entries, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }, [entries]);

  const value = useMemo(() => ({ entries, addEntry, clear, copyAllToClipboard }), [entries, addEntry, clear, copyAllToClipboard]);

  return (
    <DebugLogContext.Provider value={value}>
      {children}
    </DebugLogContext.Provider>
  );
};
