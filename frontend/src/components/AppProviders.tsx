// File: AppProviders.tsx - Client wrapper providing Network, DebugLog, WebSocket and Wallet providers
"use client";

import React from "react";
import { DebugLogProvider } from "@/contexts/DebugLogContext";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import WalletProvider from "@/contexts/WalletProvider";
import DebugWindow from "@/components/DebugWindow";
import { NetworkProvider } from "@/contexts/NetworkContext";
import { env } from "@/config/env";

const AppProviders: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isDev = (process.env.NEXT_PUBLIC_APP_ENV ?? process.env.NODE_ENV) !== "production";
  const showDebug = isDev || !!env.testing;

  return (
    <NetworkProvider>
      <DebugLogProvider>
        <WebSocketProvider>
          <WalletProvider
            customAuthOptions={{
              network: 'mainnet',
              appDetails: { name: 'Adderrels Auction', icon: '/adderrel.png' },
            }}
          >
            {children}
          </WalletProvider>
        </WebSocketProvider>
        {showDebug ? <DebugWindow /> : null}
      </DebugLogProvider>
    </NetworkProvider>
  );
};

export default AppProviders;
