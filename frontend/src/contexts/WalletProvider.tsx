// WalletProvider.tsx - Provides Bitcoin wallet connection functionality using bitcoin-wallet-adapter
"use client";

import React, { ReactNode } from 'react';
import { WalletProvider as BitcoinWalletProvider } from 'bitcoin-wallet-adapter';

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
  // Defaults with existing icon path; allow overrides via props
  const defaults = {
    network: 'mainnet' as const,
    appDetails: {
      name: "Adderrels Auction",
      icon: "/adderrel.png",
    },
  } as const;

  const merged = {
    ...defaults,
    ...(customAuthOptions || {}),
    appDetails: {
      ...defaults.appDetails,
      ...(customAuthOptions?.appDetails || {}),
    },
  } satisfies {
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
