// File: frontend/src/hooks/use-auction-data.ts
// Purpose: Fetch auction status via REST with network-awareness; falls back to latest ended auction on server.
import { useQuery, useMutation } from '@tanstack/react-query';
import http from '@/lib/http';
import type { AuctionState, PledgeData } from '@shared/types/auction';
import { useBtcNetwork } from '@/contexts/NetworkContext';

// Use relative paths with safe http wrapper to avoid SSRF/credential leakage

export const useAuctionData = () => {
  const { network } = useBtcNetwork();
  return useQuery({
    queryKey: ['auctionData', network],
    queryFn: async () => {
      const netParam = network === 'testnet' ? 'testnet' : 'mainnet';
      const response = await http.get<AuctionState>(`/auction/status`, {
        params: { network: netParam },
      });
      // Null-safety: ensure object shape
      return (response?.data ?? null) as AuctionState;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000,
  });
};

export const usePledgeMutation = () => {
  return useMutation({
    mutationFn: async (pledgeData: PledgeData) => {
      const response = await http.post('/auction/pledge', pledgeData);
      return response.data;
    }
  });
};
