// File: frontend/src/contexts/NetworkContext.tsx
// Purpose: Provide current Bitcoin network (mainnet/testnet) aligned with backend.
// Behavior: Reads default from env (NEXT_PUBLIC_BTC_NETWORK) and auto-syncs to backend /status network. No client-side switcher.
// Styling: N/A (context only). Safe for SSR with null checks.

"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { env } from "@/config/env";

type BtcNetwork = "mainnet" | "testnet";

type NetworkContextValue = {
  network: BtcNetwork;
  isDev: boolean;
};

const NetworkContext = createContext<NetworkContextValue | undefined>(undefined);

export const NetworkProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isDev = (process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV) !== "production";
  const defaultNetwork: BtcNetwork = (env.btcNetwork ?? "mainnet") as BtcNetwork;
  const [network, setNetworkState] = useState<BtcNetwork>(defaultNetwork);

  // Sync with backend network (source of truth) to avoid env vs switcher conflicts
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        const res = await fetch(`${env.apiUrl}/status`, { cache: 'no-store' });
        if (!res?.ok) return;
        const data = await res.json().catch(() => null) as any;
        const serverNet = data?.network === 'testnet' ? 'testnet' : (data?.network === 'mainnet' ? 'mainnet' : null);
        if (!serverNet) return;
        if (!cancelled) {
          if (serverNet !== network) {
            // Align to server network
            setNetworkState(serverNet);
          }
        }
      } catch {}
    };
    sync();
    return () => { cancelled = true; };
  // Intentionally avoid depending on `network` to prevent re-runs after we set from server
  }, [isDev]);

  const value = useMemo<NetworkContextValue>(() => ({ network, isDev }), [network, isDev]);

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
};

export function useBtcNetwork() {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useBtcNetwork must be used within a NetworkProvider");
  return ctx;
}
