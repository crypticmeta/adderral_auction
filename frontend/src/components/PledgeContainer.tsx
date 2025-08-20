// Container component that combines PledgeInterface and PledgeQueue
import React, { useState, useEffect } from 'react';
import PledgeQueue from './PledgeQueue';
import { useWebSocket } from '@/hooks/use-websocket';
import { AuctionState } from '@/types/auction';
import PledgeInterface from './PledgeInterface';

interface PledgeContainerProps {
  isWalletConnected: boolean;
  walletAddress?: string;
}

const PledgeContainer: React.FC<PledgeContainerProps> = ({ isWalletConnected, walletAddress = '' }) => {
  const [activeTab, setActiveTab] = useState<'form' | 'queue'>('form');
  const { auctionState } = useWebSocket();
  const [auctionId, setAuctionId] = useState<string>('');

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
            isWalletConnected={isWalletConnected && !priceError && isAuctionActive}
            walletAddress={walletAddress}
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
