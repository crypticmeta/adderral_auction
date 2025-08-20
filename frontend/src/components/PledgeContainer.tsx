// Container component that combines PledgeInterface and PledgeQueue
// Purpose: Orchestrates pledge form and queue; derives wallet connection/address.
// Testing mode: Reads test wallet from localStorage (testWallet/testWalletConnected) to supply a wallet address when adapter is not connected.
import React, { useState, useEffect } from 'react';
import { useWalletAddress } from 'bitcoin-wallet-adapter';
import PledgeQueue from './PledgeQueue';
import { useWebSocket } from '@/hooks/use-websocket';
import type { AuctionState } from '@shared/types/auction';
import PledgeInterface from './PledgeInterface';

interface PledgeContainerProps {
  isWalletConnected: boolean;
  walletAddress?: string;
}

const PledgeContainer: React.FC<PledgeContainerProps> = ({ isWalletConnected, walletAddress = '' }) => {
  const [activeTab, setActiveTab] = useState<'form' | 'queue'>('form');
  const { auctionState } = useWebSocket();
  const [auctionId, setAuctionId] = useState<string>('');
  const wallet = useWalletAddress();
  const isTesting = process.env.NEXT_PUBLIC_TESTING === 'true';
  const [testingConnected, setTestingConnected] = useState(false);
  const [testingAddress, setTestingAddress] = useState<string>('');

  // Testing mode: hydrate localStorage test wallet address
  useEffect(() => {
    if (typeof window === 'undefined' || !isTesting) return;
    const pull = () => {
      try {
        const flag = localStorage.getItem('testWalletConnected');
        setTestingConnected(flag === 'true');
        const raw = localStorage.getItem('testWallet');
        if (raw) {
          try {
            const obj = JSON.parse(raw) as any;
            const addr = obj?.cardinal || obj?.cardinal_address || '';
            setTestingAddress(typeof addr === 'string' ? addr : '');
          } catch {
            setTestingAddress('');
          }
        } else {
          setTestingAddress('');
        }
      } catch {
        setTestingConnected(false);
        setTestingAddress('');
      }
    };
    pull();

    const onConnect = () => pull();
    const onDisconnect = () => { setTestingConnected(false); setTestingAddress(''); };
    const onStorage = (e: StorageEvent) => {
      if (!e) return;
      if (e.key === 'testWallet' || e.key === 'testWalletConnected') pull();
    };
    window.addEventListener('test-wallet-connected', onConnect as EventListener);
    window.addEventListener('test-wallet-disconnected', onDisconnect as EventListener);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('test-wallet-connected', onConnect as EventListener);
      window.removeEventListener('test-wallet-disconnected', onDisconnect as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, [isTesting]);

  // Set auction ID when auction status changes
  useEffect(() => {
    if (auctionState?.isActive && typeof auctionState.id === 'string' && auctionState.id) {
      setAuctionId(auctionState.id);
    } else {
      setAuctionId('');
    }
  }, [auctionState]);

  const state: AuctionState | null = auctionState;
  const minPledge = state?.minPledge ?? (state?.config?.minPledgeBTC ? parseFloat(state.config.minPledgeBTC) : undefined);
  const maxPledge = state?.maxPledge ?? (state?.config?.maxPledgeBTC ? parseFloat(state.config.maxPledgeBTC) : undefined);
  const currentPrice = state?.currentPrice ?? 0;
  const priceError = Boolean(state?.priceError);
  const isAuctionActive = Boolean(state?.isActive);

  // Prefer adapter connection over upstream prop
  const adapterConnected = wallet?.connected ?? false;
  const finalIsWalletConnected = isWalletConnected || adapterConnected || (isTesting && testingConnected);
  const finalAddress = (wallet?.cardinal_address && wallet?.cardinal_address.length > 0)
    ? wallet.cardinal_address
    : (isTesting && testingAddress ? testingAddress : (walletAddress || ''));

  // When wallet disconnects, remove guestId so a fresh guest is created next time
  useEffect(() => {
    const disconnected = !adapterConnected && (!isTesting || (isTesting && !testingConnected));
    if (disconnected) {
      try { if (typeof window !== 'undefined') localStorage.removeItem('guestId'); } catch { /* noop */ }
    }
  }, [adapterConnected, isTesting, testingConnected]);

  return (
    <div className="glass-card p-6 rounded-3xl">
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-700 mb-6">
        <button
          onClick={() => setActiveTab('form')}
          className={`px-4 py-3 font-medium text-sm ${activeTab === 'form'
            ? 'text-adderrels-500 border-b-2 border-adderrels-500'
            : 'text-gray-400 hover:text-gray-300'
            }`}
        >
          Make a Pledge
        </button>
        <button
          onClick={() => setActiveTab('queue')}
          className={`px-4 py-3 font-medium text-sm ${activeTab === 'queue'
            ? 'text-adderrels-500 border-b-2 border-adderrels-500'
            : 'text-gray-400 hover:text-gray-300'
            }`}
        >
          Pledge Queue
        </button>
      </div>

      {/* Warning banners */}
      {priceError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/40 text-red-300 px-4 py-3 rounded-xl text-sm">
          Live BTC price is currently unavailable. Pledging is temporarily disabled.
        </div>
      )}

      {/* Tab Content */}
      <div className="mt-4">
        {activeTab === 'form' ? (
          <PledgeInterface
            minPledge={Number(minPledge ?? 0)}
            maxPledge={Number(maxPledge ?? 0)}
            currentPrice={Number(currentPrice ?? 0)}
            isWalletConnected={finalIsWalletConnected}
            walletAddress={finalAddress}
          />
        ) : (
          auctionId ? <PledgeQueue auctionId={auctionId} /> : (
            <div className="text-center py-8 text-gray-400">
              No active auction found
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default PledgeContainer;
