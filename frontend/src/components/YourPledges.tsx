// YourPledges component lists pledges made by the current user for the active auction
// Component: YourPledges
// Fetches user-scoped pledges and renders status/position with null-safety.
import React, { useEffect, useState } from 'react';
import type { PledgeItem } from '@shared/types/common';

interface YourPledgesProps {
  auctionId: string;
}

const YourPledges: React.FC<YourPledgesProps> = ({ auctionId }) => {
  const [userPledges, setUserPledges] = useState<PledgeItem[]>([]);
  const [error, setError] = useState<string>('');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

  useEffect(() => {
    const fetchUserPledges = async () => {
      try {
        if (!auctionId) return;
        const token = (typeof window !== 'undefined') ? localStorage.getItem('guestToken') : null;
        const userId = (typeof window !== 'undefined') ? localStorage.getItem('userId') : null;
        if (!token || !userId) { setUserPledges([]); return; }

        const res = await fetch(`${apiUrl}/api/pledges/user/${userId}/auction/${auctionId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) {
          throw new Error(`Failed to fetch user pledges (${res.status})`);
        }
        const data = await res.json();
        setUserPledges(Array.isArray(data) ? data : []);
      } catch (e: any) {
        setError(e?.message || 'Failed to fetch your pledges');
      }
    };

    fetchUserPledges();
  }, [auctionId, apiUrl]);

  return (
    <div className="bg-gradient-to-br from-dark-800/50 to-dark-700/50 backdrop-blur-md border border-primary-500/30 rounded-xl p-6 transition-all hover:border-primary-500/60 hover:shadow-glow-md">
      <h2 className="text-2xl font-semibold mb-2 text-white">Your Pledges</h2>

      {error && (
        <div className="bg-gradient-to-r from-red-600/20 to-red-700/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="mb-6">
        {userPledges.length === 0 ? (
          <div className="text-center py-6 text-gray-400">No pledges yet</div>
        ) : (
          <div className="space-y-2">
            {userPledges.map((pledge) => (
              <div
                key={pledge.id}
                className={`p-3 rounded-lg border ${pledge.processed ? 'bg-green-600/10 border-green-500/30 text-green-400' : 'bg-blue-600/10 border-blue-500/30 text-blue-400'}`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-semibold">{((pledge?.satsAmount ?? 0) / 1e8).toFixed(8)} BTC</span>
                    <div className="text-xs mt-1">
                      {pledge?.processed ? (
                        <span className="flex items-center">
                          <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Processed
                        </span>
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
                  {!pledge?.processed && (
                    <div className="text-right">
                      <div className="text-xs text-gray-400">Position</div>
                      <div className="font-bold">{pledge?.queuePosition ?? '—'}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default YourPledges;
