// WalletProvider.tsx - Provides Bitcoin wallet connection functionality using bitcoin-wallet-adapter
"use client";

import React, { ReactNode } from 'react';
import { WalletProvider as BitcoinWalletProvider } from 'bitcoin-wallet-adapter';
import { useBtcNetwork } from '@/contexts/NetworkContext';

interface WalletProviderProps {
  children: ReactNode;
  // Optional customization per bitcoin-wallet-adapter docs
  customAuthOptions?: {
    network?: 'mainnet' | 'testnet';
    appDetails?: {
      name?: string;
      icon?: string;
    };
  };
}

export const WalletProvider: React.FC<WalletProviderProps> = ({ children, customAuthOptions }) => {
  const { network } = useBtcNetwork();

  // Merge app details, but always take network from context
  const merged = {
    network,
    appDetails: {
      name: "Adderrels Auction",
      icon: "/adderrel.png",
      ...(customAuthOptions?.appDetails || {}),
    },
  } as {
    network: 'mainnet' | 'testnet';
    appDetails: { name: string; icon: string };
  };

  return (
    <BitcoinWalletProvider customAuthOptions={merged}>
      {children}
    </BitcoinWalletProvider>
  );
};

export default WalletProvider;
