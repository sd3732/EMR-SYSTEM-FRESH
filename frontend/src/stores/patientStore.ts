import { create } from 'zustand';
import type { Patient } from '@/types';

interface PatientStore {
  selectedPatient: Patient | null;
  searchQuery: string;
  filters: {
    status?: string;
    provider?: string;
    dateRange?: [string, string];
  };

  setSelectedPatient: (patient: Patient | null) => void;
  setSearchQuery: (query: string) => void;
  setFilters: (filters: Partial<PatientStore['filters']>) => void;
  clearFilters: () => void;
}

export const usePatientStore = create<PatientStore>((set) => ({
  selectedPatient: null,
  searchQuery: '',
  filters: {},

  setSelectedPatient: (patient) =>
    set({ selectedPatient: patient }),

  setSearchQuery: (query) =>
    set({ searchQuery: query }),

  setFilters: (newFilters) =>
    set((state) => ({
      filters: { ...state.filters, ...newFilters }
    })),

  clearFilters: () =>
    set({ filters: {} }),
}));