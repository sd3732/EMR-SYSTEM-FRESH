import { create } from 'zustand';
import type { DashboardStats, Appointment } from '@/types';

interface DashboardStore {
  stats: DashboardStats | null;
  waitingPatients: Appointment[];
  recentActivity: any[];
  isLoading: boolean;
  lastUpdated: Date | null;

  setStats: (stats: DashboardStats) => void;
  setWaitingPatients: (patients: Appointment[]) => void;
  setRecentActivity: (activity: any[]) => void;
  setLoading: (loading: boolean) => void;
  updateLastUpdated: () => void;
  clearData: () => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
  stats: null,
  waitingPatients: [],
  recentActivity: [],
  isLoading: false,
  lastUpdated: null,

  setStats: (stats) =>
    set({ stats }),

  setWaitingPatients: (patients) =>
    set({ waitingPatients: patients }),

  setRecentActivity: (activity) =>
    set({ recentActivity: activity }),

  setLoading: (loading) =>
    set({ isLoading: loading }),

  updateLastUpdated: () =>
    set({ lastUpdated: new Date() }),

  clearData: () =>
    set({
      stats: null,
      waitingPatients: [],
      recentActivity: [],
      isLoading: false,
      lastUpdated: null,
    }),
}));