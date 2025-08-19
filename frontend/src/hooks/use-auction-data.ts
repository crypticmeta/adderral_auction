// Hook for fetching and managing auction data
import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { AuctionState, PledgeData } from '@/types/auction';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export const useAuctionData = () => {
  return useQuery({
    queryKey: ['auctionData'],
    queryFn: async () => {
      const response = await axios.get(`${API_URL}/auction/status`);
      return response.data as AuctionState;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
    staleTime: 10000,
  });
};

export const usePledgeMutation = () => {
  return useMutation({
    mutationFn: async (pledgeData: PledgeData) => {
      const response = await axios.post(`${API_URL}/auction/pledge`, pledgeData);
      return response.data;
    }
  });
};
