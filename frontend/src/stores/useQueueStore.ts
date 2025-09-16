import { create } from 'zustand';
import type { QueuePatient, DashboardMetrics } from '../types/queue';

interface QueueState {
  queue: QueuePatient[];
  metrics: DashboardMetrics | null;
  selectedPatient: QueuePatient | null;

  // Actions
  setQueue: (queue: QueuePatient[]) => void;
  setMetrics: (metrics: DashboardMetrics) => void;
  updatePatientStatus: (patientId: number, status: QueuePatient['status'], room?: string) => void;
  updatePatientTriage: (patientId: number, priority: QueuePatient['triage_priority']) => void;
  selectPatient: (patient: QueuePatient | null) => void;
  addToQueue: (patient: QueuePatient) => void;
  removeFromQueue: (patientId: number) => void;
  reorderQueue: (startIndex: number, endIndex: number) => void;
}

export const useQueueStore = create<QueueState>((set) => ({
  queue: [],
  metrics: null,
  selectedPatient: null,

  setQueue: (queue) => set({ queue }),
  setMetrics: (metrics) => set({ metrics }),

  updatePatientStatus: (patientId, status, room) =>
    set((state) => ({
      queue: state.queue.map((patient) =>
        patient.id === patientId
          ? { ...patient, status, room_number: room || patient.room_number }
          : patient
      ),
    })),

  updatePatientTriage: (patientId, priority) =>
    set((state) => ({
      queue: state.queue.map((patient) =>
        patient.id === patientId
          ? { ...patient, triage_priority: priority, triage_time: new Date().toISOString() }
          : patient
      ),
    })),

  selectPatient: (patient) => set({ selectedPatient: patient }),

  addToQueue: (patient) =>
    set((state) => ({ queue: [...state.queue, patient] })),

  removeFromQueue: (patientId) =>
    set((state) => ({
      queue: state.queue.filter((p) => p.id !== patientId),
    })),

  reorderQueue: (startIndex, endIndex) =>
    set((state) => {
      const result = Array.from(state.queue);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      return { queue: result };
    }),
}));