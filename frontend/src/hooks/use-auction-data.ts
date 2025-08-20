// Hook for fetching and managing auction data
import { useQuery, useMutation } from '@tanstack/react-query';
import http from '@/lib/http';
import type { AuctionState, PledgeData } from '@shared/types/auction';

// Use relative paths with safe http wrapper to avoid SSRF/credential leakage

export const useAuctionData = () => {
  return useQuery({
    queryKey: ['auctionData'],
    queryFn: async () => {
      const response = await http.get<AuctionState>('/auction/status');
      return response.data as AuctionState;
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
