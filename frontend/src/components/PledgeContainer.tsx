// Container component that combines PledgeForm and PledgeQueue
import React, { useState, useEffect } from 'react';
import PledgeForm from './PledgeForm';
import PledgeQueue from './PledgeQueue';
import { useWebSocket } from '../contexts/WebSocketContext';

interface PledgeContainerProps {
  isWalletConnected: boolean;
}

const PledgeContainer: React.FC<PledgeContainerProps> = ({ isWalletConnected }) => {
  const [activeTab, setActiveTab] = useState<'form' | 'queue'>('form');
  const { auctionStatus } = useWebSocket();
  const [auctionId, setAuctionId] = useState<string>('');

  // Set auction ID when auction status changes
  useEffect(() => {
    if (auctionStatus?.isActive) {
      // In a real app, we would get the actual auction ID from the auction status
      setAuctionId('active-auction-id');
    }
  }, [auctionStatus]);

  return (
    <div className="glass-card p-6 rounded-3xl">
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-700 mb-6">
        <button
          onClick={() => setActiveTab('form')}
          className={`px-4 py-3 font-medium text-sm ${
            activeTab === 'form'
              ? 'text-acorn-500 border-b-2 border-acorn-500'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          Make a Pledge
        </button>
        <button
          onClick={() => setActiveTab('queue')}
          className={`px-4 py-3 font-medium text-sm ${
            activeTab === 'queue'
              ? 'text-acorn-500 border-b-2 border-acorn-500'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          Pledge Queue
        </button>
      </div>

      {/* Tab Content */}
      <div className="mt-4">
        {activeTab === 'form' ? (
          <PledgeForm isWalletConnected={isWalletConnected} />
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
