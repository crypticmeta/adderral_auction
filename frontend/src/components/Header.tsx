/**
 * Header component
 * Purpose: Top navigation bar with app branding and wallet connect.
 * Styling: Tailwind, adderrels theme accents.
 * Null-safety: Defensive checks around window usage if extended; no props required now.
 * Testing mode: If NEXT_PUBLIC_TESTING === 'true', hides multiwallet and shows a Test Connect button that stores a random wallet in localStorage.
 */
'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ConnectMultiButton, useWalletBalance } from 'bitcoin-wallet-adapter';
import { useEffect, useState } from 'react';
import ResetDbButton from './ResetDbButton';
import type { WalletDetails } from '@shared/types/common';

export default function Header() {
  const isTesting = process.env.NEXT_PUBLIC_TESTING === 'true';
  const [testConnected, setTestConnected] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  // Wallet balance (confirmed) from adapter; null-safe defaults
  const { balance, btcPrice } = useWalletBalance();
  const confirmedBtc = (balance?.confirmed ?? 0);
  const confirmedBtcStr = Number.isFinite(confirmedBtc) ? confirmedBtc.toFixed(8) : '0.00000000';
  const usdStr = btcPrice && Number.isFinite(btcPrice)
    ? `≈ $${(confirmedBtc * btcPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}`
    : '';

  // Track testing connection status for UX feedback
  useEffect(() => {
    if (typeof window === 'undefined' || !isTesting) return;
    try {
      const flag = localStorage.getItem('testWalletConnected');
      setTestConnected(flag === 'true');
    } catch (_) {}
    const update = () => {
      try {
        const flag2 = localStorage.getItem('testWalletConnected');
        setTestConnected(flag2 === 'true');
      } catch (_) {}
    };
    const onStorage = (e: StorageEvent) => {
      if (!e) return;
      if (e.key === 'testWalletConnected' || e.key === 'testWallet') update();
    };
    window.addEventListener('test-wallet-connected', update as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('test-wallet-connected', update as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [isTesting]);

  const handleTestConnect = async () => {
    if (typeof window === 'undefined') return;
    console.log('[TestConnect] Clicked');
    const sampleWallets: WalletDetails[] = [
      {
        wallet: 'Unisat',
        ordinal: 'bc1pkddf9em6k82spy0ysxdqp5t5puuwdkn6prhcqvhf6vf8tcc686lq4uy0ca',
        cardinal: 'bc1pkddf9em6k82spy0ysxdqp5t5puuwdkn6prhcqvhf6vf8tcc686lq4uy0ca',
        ordinalPubkey: '03f921e0623f8ae983d1c68e0df012c704b68953839fbda43a7a3850d384c0cf18',
        cardinalPubkey: '03f921e0623f8ae983d1c68e0df012c704b68953839fbda43a7a3850d384c0cf18',
        connected: true,
      },
      {
        wallet: 'Xverse',
        ordinal: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        cardinal: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
        ordinalPubkey: '02f1b2c3d4e5f60708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
        cardinalPubkey: '02f1b2c3d4e5f60708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20',
        connected: true,
      },
      {
        wallet: 'Leather',
        ordinal: 'bc1p5cyxnuxmeuwuvkwfem96l6l2wzzk2y8e3n4u0g',
        cardinal: 'bc1p5cyxnuxmeuwuvkwfem96l6l2wzzk2y8e3n4u0g',
        ordinalPubkey: '030303030303030303030303030303030303030303030303030303030303030303',
        cardinalPubkey: '030303030303030303030303030303030303030303030303030303030303030303',
        connected: true,
      },
    ];

    // Try to fetch from /wallets.json (testing dataset)
    let walletObj: WalletDetails | null = null;
    try {
      console.log('[TestConnect] Fetching /wallets.json');
      const res = await fetch('/wallets.json', { cache: 'no-store' });
      console.log('[TestConnect] /wallets.json status', res.status);
      if (res.ok) {
        const data = await res.json().catch(() => null) as any;
        const wallets = Array.isArray(data?.wallets) ? data.wallets : [];
        console.log('[TestConnect] wallets.json count', wallets.length);
        if (wallets.length > 0) {
          const w = wallets[Math.floor(Math.random() * wallets.length)];
          if (w) {
            walletObj = {
              wallet: w.wallet ?? 'TestWallet',
              ordinal: w.ordinal_address ?? w.ordinal ?? '',
              cardinal: w.cardinal_address ?? w.cardinal ?? '',
              ordinalPubkey: w.ordinal_pubkey ?? w.ordinalPubkey ?? '',
              cardinalPubkey: w.cardinal_pubkey ?? w.cardinalPubkey ?? '',
              connected: true,
            } as WalletDetails;
            console.log('[TestConnect] Selected wallet from file', walletObj.wallet);
          }
        }
      }
    } catch (e) {
      console.warn('[TestConnect] Failed to fetch /wallets.json, falling back', e);
    }

    // Fallback to hardcoded sample wallets
    if (!walletObj) {
      walletObj = sampleWallets[Math.floor(Math.random() * sampleWallets.length)] ?? sampleWallets[0];
      console.log('[TestConnect] Selected fallback wallet', walletObj.wallet);
    }

    try {
      localStorage.setItem('testWallet', JSON.stringify(walletObj));
      localStorage.setItem('testWalletConnected', 'true');
      console.log('[TestConnect] localStorage set: testWalletConnected=true');
      // Notify app of test connection change in same tab
      window.dispatchEvent(new Event('test-wallet-connected'));
      console.log('[TestConnect] Dispatched event: test-wallet-connected');
    } catch (e) { console.error('[TestConnect] Failed to write localStorage', e); }
  };

  // Disconnect testing wallet: clear localStorage and notify listeners
  const handleTestDisconnect = () => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.removeItem('testWallet');
      localStorage.removeItem('testWalletConnected');
      // Also clear guest identity so next connection creates a fresh guest
      localStorage.removeItem('guestId');
      setTestConnected(false);
      console.log('[TestConnect] Disconnected and cleared localStorage');
      window.dispatchEvent(new Event('test-wallet-disconnected'));
    } catch (e) {
      console.error('[TestConnect] Failed to clear localStorage', e);
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-white/10 bg-dark-900/70 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-24 items-center justify-between">
          {/* Brand */}
          <Link href="/" className="flex items-center gap-3">
            {/* If the image is missing, fallback to text via alt */}
            <Image
              src="/adderrel.png"
              alt="Adderrels"
              width={28}
              height={28}
              className="rounded-md"
            />
            <span className="text-sm sm:text-base font-semibold tracking-wide">
              Adderrels Auction
            </span>
          </Link>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {/* Wallet balance badge (hidden in testing mode) */}
            {!isTesting && (
              <div
                className="hidden sm:flex items-center gap-2 rounded-md border border-primary-500/30 bg-dark-800/60 px-3 py-1.5 text-xs text-gray-200"
                role="status"
                aria-live="polite"
                aria-label={`Wallet balance ${confirmedBtcStr} BTC${usdStr ? `, ${usdStr}` : ''}`}
              >
                <span className="text-primary-300 font-semibold">Balance:</span>
                <span className="tabular-nums">{confirmedBtcStr} BTC</span>
                {usdStr && <span className="text-gray-400">{usdStr}</span>}
              </div>
            )}
            {/* Dev-only reseed button */}
            <ResetDbButton apiUrl={apiUrl} />
            {!isTesting ? (
              <ConnectMultiButton
                icon="/adderrel.png"
                network="mainnet"
                connectionMessage="Connect your wallet to participate in the auction."
                buttonClassname="bg-adderrels-500 text-white hover:bg-adderrels-500/90 transition-colors rounded-md px-3 py-2 text-sm font-medium"
              />
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestConnect}
                  disabled={testConnected}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    testConnected
                      ? 'bg-green-600 text-white cursor-default'
                      : 'bg-purple-600 text-white hover:bg-purple-500'
                  }`}
                >
                  {testConnected ? 'Connected' : 'Test Connect'}
                </button>
                {testConnected && (
                  <>
                    <span className="text-xs px-2 py-1 rounded-md bg-green-500/15 text-green-400 border border-green-600/40">Testing</span>
                    <button
                      type="button"
                      onClick={handleTestDisconnect}
                      className="rounded-md px-3 py-2 text-xs font-medium bg-gray-700 text-gray-200 hover:bg-gray-600"
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
