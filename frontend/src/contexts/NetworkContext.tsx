// File: frontend/src/contexts/NetworkContext.tsx
// Purpose: Provide current Bitcoin network (mainnet/testnet) with dev-only switching and persistence.
// Behavior: Reads default from env (NEXT_PUBLIC_BTC_NETWORK). Persists overrides in localStorage under 'btc-network'.
// Styling: N/A (context only). Safe for SSR with null checks.

"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { env } from "@/config/env";

type BtcNetwork = "mainnet" | "testnet";

type NetworkContextValue = {
  network: BtcNetwork;
  setNetwork: (n: BtcNetwork) => void;
  isDev: boolean;
};

const NetworkContext = createContext<NetworkContextValue | undefined>(undefined);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isDev = (process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV) !== "production";
  const defaultNetwork: BtcNetwork = (env.btcNetwork ?? "mainnet") as BtcNetwork;
  const [network, setNetworkState] = useState<BtcNetwork>(defaultNetwork);

  // Load from localStorage on mount (dev only)
  useEffect(() => {
    if (typeof window === "undefined" || !isDev) return;
    try {
      const stored = window.localStorage.getItem("btc-network");
      if (stored === "mainnet" || stored === "testnet") {
        setNetworkState(stored);
      }
    } catch (_) {}
  }, [isDev]);

  const setNetwork = useCallback((n: BtcNetwork) => {
    setNetworkState((prev) => {
      const next = n ?? prev;
      if (typeof window !== "undefined" && isDev) {
        try {
          window.localStorage.setItem("btc-network", next);
          window.dispatchEvent(new CustomEvent("btc-network-changed", { detail: { network: next } }));
        } catch (_) {}
      }
      return next;
    });
  }, [isDev]);

  const value = useMemo<NetworkContextValue>(() => ({ network, setNetwork, isDev }), [network, setNetwork, isDev]);

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
};

export function useBtcNetwork() {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useBtcNetwork must be used within a NetworkProvider");
  return ctx;
}
