import { create } from 'zustand';
import type { Patient, Appointment, Provider } from '../types';

interface AppState {
  // User/Provider state
  currentUser: Provider | null;
  setCurrentUser: (user: Provider | null) => void;

  // Patient state
  currentPatient: Patient | null;
  setCurrentPatient: (patient: Patient | null) => void;
  patients: Patient[];
  setPatients: (patients: Patient[]) => void;

  // Appointment/Queue state
  appointments: Appointment[];
  setAppointments: (appointments: Appointment[]) => void;
  updateAppointmentStatus: (id: number, status: string, room?: string) => void;
  waitingQueue: Appointment[];
  setWaitingQueue: (queue: Appointment[]) => void;

  // UI state
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  selectedView: 'grid' | 'list' | 'queue';
  setSelectedView: (view: 'grid' | 'list' | 'queue') => void;
}

export const useAppStore = create<AppState>((set) => ({
  // User/Provider
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),

  // Patient
  currentPatient: null,
  setCurrentPatient: (patient) => set({ currentPatient: patient }),
  patients: [],
  setPatients: (patients) => set({ patients }),

  // Appointments/Queue
  appointments: [],
  setAppointments: (appointments) => set({ appointments }),
  updateAppointmentStatus: (id, status, room) =>
    set((state) => ({
      appointments: state.appointments.map((apt) =>
        apt.id === id ? { ...apt, status, room_number: room } : apt
      ),
      waitingQueue: state.waitingQueue.map((apt) =>
        apt.id === id ? { ...apt, status, room_number: room } : apt
      ),
    })),
  waitingQueue: [],
  setWaitingQueue: (queue) => set({ waitingQueue: queue }),

  // UI
  sidebarOpen: true,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  selectedView: 'queue',
  setSelectedView: (view) => set({ selectedView: view }),
}));