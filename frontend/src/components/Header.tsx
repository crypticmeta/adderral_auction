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
import type { WalletDetails } from '@shared/types/common';
import { env } from '../config/env';
import { useBtcNetwork } from '@/contexts/NetworkContext';

export default function Header() {
  const { network } = useBtcNetwork();
  const isTesting = env.testing;
  const [testConnected, setTestConnected] = useState(false);
  // Wallet balance (confirmed) from adapter; show only when connected
  const { balance, btcPrice } = useWalletBalance();
  const hasConnectedBalance = typeof balance?.confirmed === 'number' && Number.isFinite(balance.confirmed);
  const confirmedBtc = hasConnectedBalance ? balance!.confirmed : undefined;
  const btcStr = typeof confirmedBtc === 'number' ? confirmedBtc.toFixed(8) : null;
  const usdApprox = typeof confirmedBtc === 'number' && Number.isFinite(btcPrice || NaN)
    ? (confirmedBtc * (btcPrice as number))
    : null;

  // Helpers: trim trailing zeros and switch to sats for very small balances
  const trimZeros = (s: string) => s.replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, '').replace(/\.$/, '');
  const toFixedTrim = (v: number, max: number) => trimZeros(v.toLocaleString(undefined, { maximumFractionDigits: max, minimumFractionDigits: 0 }));
  const sats = typeof confirmedBtc === 'number' ? Math.round(confirmedBtc * 1e8) : null;
  const showAsSats = typeof sats === 'number' && sats < 1_000_000; // < 0.01 BTC

  // Track testing connection status for UX feedback
  useEffect(() => {
    if (typeof window === 'undefined' || !isTesting) return;
    try {
      const flag = localStorage.getItem('testWalletConnected');
      setTestConnected(flag === 'true');
    } catch (_) { }
    const update = () => {
      try {
        const flag2 = localStorage.getItem('testWalletConnected');
        setTestConnected(flag2 === 'true');
      } catch (_) { }
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

    // Persist test wallet locally and create a backing test user in DB
    try {
      localStorage.setItem('testWallet', JSON.stringify(walletObj));
      // Create or upsert a test user in backend so pledges pass user existence checks
      try {
        const payload = {
          wallet: walletObj?.wallet ?? 'TestWallet',
          cardinal: walletObj?.cardinal ?? '',
          ordinal: walletObj?.ordinal ?? '',
          cardinalPubkey: walletObj?.cardinalPubkey ?? '',
          ordinalPubkey: walletObj?.ordinalPubkey ?? '',
          network: (network || 'mainnet'),
        };
        const res = await fetch(`${env.apiUrl}/api/testing/create-test-user`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json().catch(() => null) as any;
          const userId = data?.user?.id as string | undefined;
          if (userId && typeof userId === 'string') {
            // We reuse 'guestId' storage key as the client identity knob for sockets/pledges
            localStorage.setItem('guestId', userId);
            console.log('[TestConnect] Created test user in DB:', userId);
          } else {
            console.warn('[TestConnect] create-test-user: missing user.id in response');
          }
        } else {
          console.warn('[TestConnect] create-test-user failed with status', res.status);
        }
      } catch (e) {
        console.warn('[TestConnect] Failed to call create-test-user endpoint', e);
      }

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
          <Link href="/" className="flex items-center gap-3 group">
            <Image
              src="/adderrel.png"
              width={28}
              height={28}
              alt="Adderrels"
              className="rounded-sm shadow-sm group-hover:scale-[1.02] transition-transform"
            />
            <span className="text-sm sm:text-base font-semibold tracking-wide">
              Adderrels Auction
            </span>
            <span className="hidden sm:inline-flex items-center rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-white/80">
              {network}
              {env.testing ? <span className="ml-1 text-yellow-300">TEST</span> : null}
            </span>
          </Link>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {/* Wallet balance badge (hidden in testing mode and when no wallet connected) */}
            {!isTesting && hasConnectedBalance && (
              <div
                className="hidden sm:flex items-center rounded-full border border-white/15 bg-white/5 backdrop-blur px-3 py-1.5 text-[11px] text-gray-100 shadow-sm"
                role="status"
                aria-live="polite"
                aria-label={showAsSats
                  ? `Wallet balance ${sats?.toLocaleString()} sats${btcStr ? `, ${trimZeros(btcStr)} BTC` : ''}`
                  : `Wallet balance ${trimZeros(toFixedTrim(confirmedBtc as number, (confirmedBtc as number) >= 1 ? 4 : 6))} BTC${usdApprox != null ? `, approximately $${usdApprox.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : ''}`}
                title={usdApprox != null ? `≈ $${usdApprox.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : undefined}
              >
                <span className="text-primary-200 font-semibold mr-2 tracking-wide">Balance:</span>
                {showAsSats ? (
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono tabular-nums font-medium">{sats?.toLocaleString()} sats</span>
                    {btcStr && (
                      <span className="text-[10px] text-gray-400 font-mono">{trimZeros(btcStr)} BTC</span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono tabular-nums font-medium">
                      {toFixedTrim(confirmedBtc as number, (confirmedBtc as number) >= 1 ? 4 : 6)} BTC
                    </span>
                    {usdApprox != null && (
                      <span className="text-gray-400">≈ ${usdApprox.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    )}
                  </div>
                )}
              </div>
            )}
            {!isTesting ? (
              <ConnectMultiButton
                icon="/adderrel.png"
                connectionMessage="Connect your wallet to participate in the auction."
              // buttonClassname="bg-adderrels-500 text-white hover:bg-adderrels-500/90 transition-colors rounded-md px-3 py-2 text-sm font-medium"
              // supportedWallets={["Unisat", "Xverse", "Leather", "Okx", "Magiceden"]}
              // balance={hasConnectedBalance ? (confirmedBtc as number) : undefined}
              />
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTestConnect}
                  disabled={testConnected}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${testConnected
                    ? 'bg-green-600 text-white cursor-default'
                    : 'bg-purple-600 text-white hover:bg-purple-500'
                    }`}
                  aria-label={testConnected ? 'Testing wallet connected' : 'Connect testing wallet'}
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
                      aria-label="Disconnect testing wallet"
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
