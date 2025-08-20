// PledgeQueue component for displaying pledge queue status
// Component: PledgeQueue
// Shows recent pledge activity with user avatars (random via DiceBear),
// truncated usernames from addresses, real-time queue updates, and
// estimated ADDERRELS allocations per pledge based on current auction totals.
import React, { useState, useEffect } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';

interface PledgeQueueProps {
  auctionId: string;
}

interface QueuedPledge {
  id: string;
  userId: string;
  btcAmount: number;
  timestamp: string;
  position?: number; // legacy client
  queuePosition?: number; // from API enrich
  processed: boolean;
  needsRefund: boolean;
  user?: {
    cardinal_address?: string | null;
    ordinal_address?: string | null;
  };
}

const PledgeQueue: React.FC<PledgeQueueProps> = ({ auctionId }) => {
  const [queuedPledges, setQueuedPledges] = useState<QueuedPledge[]>([]);
  const [userPledges, setUserPledges] = useState<QueuedPledge[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [maxPledgeInfo, setMaxPledgeInfo] = useState<{
    minPledge: number;
    maxPledge: number;
    currentBTCPrice: number;
    minPledgeUSD: number;
    maxPledgeUSD: number;
  } | null>(null);
  
  const { socket, isAuthenticated, auctionState } = useWebSocket();

  const getUsername = (p: QueuedPledge): string => {
    const addr = p?.user?.ordinal_address || p?.user?.cardinal_address || p?.userId || '';
    if (!addr) return 'guest';
    const s = String(addr);
    if (s.length <= 10) return s;
    return `${s.slice(0, 6)}...${s.slice(-4)}`;
  };

  const getAvatar = (p: QueuedPledge): string => {
    const seed = p?.user?.ordinal_address || p?.user?.cardinal_address || p?.userId || p.id;
    return `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(String(seed))}`;
  };

  const formatNumber = (n: number | null | undefined, maxFrac = 6): string => {
    if (n == null || Number.isNaN(n)) return '—';
    return Number(n).toLocaleString(undefined, { maximumFractionDigits: maxFrac });
  };

  const estimateAllocation = (btcAmount: number): number | null => {
    const totalTokensStr = auctionState?.config?.totalTokens;
    const totalRaisedBTC = auctionState?.totalRaised;
    if (!totalTokensStr || typeof totalRaisedBTC !== 'number' || !(totalRaisedBTC > 0)) return null;
    const totalTokens = Number(totalTokensStr);
    if (!(totalTokens > 0)) return null;
    // tokens = (totalTokens / totalRaisedBTC) * pledgeBTC
    return (totalTokens / totalRaisedBTC) * btcAmount;
  };
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
  
  // Fetch max pledge info
  useEffect(() => {
    const fetchMaxPledgeInfo = async () => {
      try {
        const response = await fetch(`${apiUrl}/api/pledges/max-pledge/${auctionId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch max pledge info');
        }
        const data = await response.json();
        setMaxPledgeInfo(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch max pledge info');
      }
    };
    
    fetchMaxPledgeInfo();

    // Subscribe to real-time events and refetch limits immediately
    if (socket && isAuthenticated) {
      const refetchLimits = () => fetchMaxPledgeInfo();
      socket.on('pledge:queue:update', refetchLimits);
      socket.on('pledge_created', refetchLimits);
      socket.on('pledge:processed', refetchLimits);
    }

    return () => {
      if (socket) {
        socket.off('pledge:queue:update');
        socket.off('pledge_created');
        socket.off('pledge:processed');
      }
    };
  }, [auctionId, apiUrl, socket, isAuthenticated]);
  
  // Fetch pledges in queue
  useEffect(() => {
    const fetchPledges = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`${apiUrl}/api/pledges/auction/${auctionId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch pledges');
        }
        const data = await response.json();
        setQueuedPledges(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch pledges');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchPledges();
    
    // Set up WebSocket listeners for real-time queue updates
    if (socket && isAuthenticated) {
      socket.on('pledge_created', (data: any) => {
        if (data.auctionId === auctionId) {
          fetchPledges();
        }
      });
      
      socket.on('pledge:processed', (data: any) => {
        if (data.auctionId === auctionId) {
          fetchPledges();
        }
      });
      
      socket.on('pledge:queue:update', (_data: any) => {
        fetchPledges();
      });
    }
    
    return () => {
      if (socket) {
        socket.off('pledge_created');
        socket.off('pledge:processed');
        socket.off('pledge:queue:update');
      }
    };
  }, [auctionId, apiUrl, socket, isAuthenticated]);
  
  // Fetch user pledges
  useEffect(() => {
    const fetchUserPledges = async () => {
      try {
        const token = localStorage.getItem('guestToken');
        if (!token) return;
        
        const userId = localStorage.getItem('userId');
        if (!userId) return;
        
        const response = await fetch(`${apiUrl}/api/pledges/user/${userId}/auction/${auctionId}`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response.ok) {
          throw new Error('Failed to fetch user pledges');
        }
        
        const data = await response.json();
        setUserPledges(data);
      } catch (err) {
        console.error('Error fetching user pledges:', err);
      }
    };
    
    fetchUserPledges();
  }, [auctionId, apiUrl]);
  
  if (isLoading) {
    return (
      <div className="bg-gradient-to-br from-dark-800/50 to-dark-700/50 backdrop-blur-md border border-primary-500/30 rounded-xl p-6 transition-all hover:border-primary-500/60 hover:shadow-glow-md">
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
          <span className="ml-3 text-gray-300">Loading pledge queue...</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-gradient-to-br from-dark-800/50 to-dark-700/50 backdrop-blur-md border border-primary-500/30 rounded-xl p-6 transition-all hover:border-primary-500/60 hover:shadow-glow-md">
      <h2 className="text-2xl font-semibold mb-2 text-white">Pledge Queue</h2>
      
      {error ? (
        <div className="bg-gradient-to-r from-red-600/20 to-red-700/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      ) : (
        !maxPledgeInfo && (
          <div className="bg-dark-900/40 border border-white/5 text-gray-400 px-4 py-2 rounded-lg mb-4 text-xs">
            Attempting to load pledge limits...
          </div>
        )
      )}
      
      {maxPledgeInfo && (
        <div className="bg-gradient-to-r from-blue-600/20 to-blue-700/20 border border-blue-500/30 text-blue-400 px-4 py-3 rounded-lg mb-4">
          <h3 className="font-semibold mb-2">Current Pledge Limits</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-400">Min Pledge:</span>
              <span className="ml-2">{maxPledgeInfo.minPledge} BTC</span>
            </div>
            <div>
              <span className="text-gray-400">Max Pledge:</span>
              <span className="ml-2">{maxPledgeInfo.maxPledge} BTC</span>
            </div>
            <div>
              <span className="text-gray-400">BTC Price:</span>
              <span className="ml-2">{maxPledgeInfo.currentBTCPrice ? `$${maxPledgeInfo.currentBTCPrice.toLocaleString()}` : '—'}</span>
            </div>
          </div>
        </div>
      )}
      
      {userPledges.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3 text-white">Your Pledges</h3>
          <div className="space-y-2">
            {userPledges.map((pledge) => (
              <div 
                key={pledge.id}
                className={`p-3 rounded-lg border ${
                  pledge.processed 
                    ? pledge.needsRefund 
                      ? 'bg-amber-600/10 border-amber-500/30 text-amber-400' 
                      : 'bg-green-600/10 border-green-500/30 text-green-400'
                    : 'bg-blue-600/10 border-blue-500/30 text-blue-400'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-semibold">{pledge.btcAmount} BTC</span>
                    <div className="text-xs mt-1">
                      {pledge.processed ? (
                        pledge.needsRefund ? (
                          <span className="flex items-center">
                            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
                            </svg>
                            Needs Refund
                          </span>
                        ) : (
                          <span className="flex items-center">
                            <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Processed
                          </span>
                        )
                      ) : (
                        <span className="flex items-center">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                          </svg>
                          In Queue
                        </span>
                      )}
                    </div>
                  </div>
                  {!pledge.processed && (
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Position</div>
                      <div className="font-bold">{pledge.position}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <div>
        <h3 className="text-lg font-semibold mb-3 text-white">Recent Pledges</h3>
        {queuedPledges.length === 0 ? (
          <div className="text-center py-6 text-gray-400">
            No pledges in the queue yet
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-700">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-dark-900/50">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">User</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Position</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Amount
                  </th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Allocation</th>
                  <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-dark-800/30 divide-y divide-gray-700">
                {queuedPledges.slice(0, 10).map((pledge) => (
                  <tr key={pledge.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-3">
                        <img src={getAvatar(pledge)} alt="avatar" className="w-7 h-7 rounded-full bg-dark-900/50 border border-white/10" />
                        <span className="text-gray-200">{getUsername(pledge)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">{pledge.processed ? '—' : (pledge.queuePosition ?? pledge.position ?? '—')}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className="font-medium text-gray-200">{formatNumber(pledge.btcAmount)} BTC</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      <span className="text-gray-300">{formatNumber(estimateAllocation(pledge.btcAmount) ?? null, 2)} ADDERRELS</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm">
                      {pledge.processed ? (
                        pledge.needsRefund ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                            Needs Refund
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            Processed
                          </span>
                        )
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          In Queue
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PledgeQueue;
