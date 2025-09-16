import { useQuery } from '@tanstack/react-query';
import { dashboardApi } from '@/services/api';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => dashboardApi.getStats(),
    select: (data) => data.data.data,
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

export function useWaitingPatients() {
  return useQuery({
    queryKey: ['dashboard', 'waiting'],
    queryFn: () => dashboardApi.getWaitingPatients(),
    select: (data) => data.data.data,
    refetchInterval: 15000, // Refetch every 15 seconds
  });
}

export function useRecentActivity() {
  return useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: () => dashboardApi.getRecentActivity(),
    select: (data) => data.data.data,
    refetchInterval: 60000, // Refetch every minute
  });
}