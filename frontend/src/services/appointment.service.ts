import axios from 'axios';
import { mockService } from './mockService';

// Check if we should use mock mode
const USE_MOCK_DATA = localStorage.getItem('USE_MOCK_DATA') !== 'false'; // Default to true

const API_BASE_URL = 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface AppointmentRequest {
  patient_id: number;
  provider_id: number;
  start?: string;
  end?: string;
  scheduled_time?: string;
  duration?: number;
  visit_type?: string;
  chief_complaint?: string;
  notes?: string;
  room?: string;
}

export interface AppointmentFilters {
  start?: string;
  end?: string;
  provider_ids?: string;
  patient_id?: number;
}

// Service exports with mock fallback
export const appointmentService = {
  getAppointments: (filters: AppointmentFilters = {}) =>
    USE_MOCK_DATA ? mockService.getAppointments(filters) :
    (async () => {
      try {
        const params = new URLSearchParams();
        if (filters.start) params.append('start', filters.start);
        if (filters.end) params.append('end', filters.end);
        if (filters.provider_ids) params.append('provider_ids', filters.provider_ids);
        if (filters.patient_id) params.append('patient_id', filters.patient_id.toString());

        const response = await api.get(`/appointments?${params.toString()}`);
        return response.data;
      } catch (error) {
        console.error('Error fetching appointments:', error);
        throw error;
      }
    })(),

  createAppointment: (data: AppointmentRequest) =>
    USE_MOCK_DATA ? mockService.createAppointment(data) :
    (async () => {
      try {
        const response = await api.post('/appointments', data);
        return response.data;
      } catch (error) {
        console.error('Error creating appointment:', error);
        throw error;
      }
    })(),

  updateAppointment: (id: number, data: Partial<AppointmentRequest>) =>
    USE_MOCK_DATA ? mockService.updateAppointment(id.toString(), data) :
    (async () => {
      try {
        const response = await api.put(`/appointments/${id}`, data);
        return response.data;
      } catch (error) {
        console.error('Error updating appointment:', error);
        throw error;
      }
    })(),

  deleteAppointment: (id: number) =>
    USE_MOCK_DATA ? mockService.deleteAppointment(id.toString()) :
    (async () => {
      try {
        const response = await api.delete(`/appointments/${id}`);
        return response.data;
      } catch (error) {
        console.error('Error deleting appointment:', error);
        throw error;
      }
    })(),

  updateStatus: (id: string, status: string) =>
    USE_MOCK_DATA ? mockService.updateAppointmentStatus(id, status) :
    (async () => {
      try {
        const response = await api.patch(`/appointments/${id}/status`, { status });
        return response.data;
      } catch (error) {
        console.error('Error updating appointment status:', error);
        throw error;
      }
    })(),

  startEncounter: (appointmentId: number) =>
    USE_MOCK_DATA ? mockService.startEncounter(appointmentId.toString()) :
    (async () => {
      try {
        const response = await api.post(`/appointments/${appointmentId}/start-encounter`);
        return response.data;
      } catch (error) {
        console.error('Error starting encounter:', error);
        throw error;
      }
    })(),

  getProviders: () =>
    USE_MOCK_DATA ? mockService.getProviders() :
    (async () => {
      try {
        const response = await api.get('/providers');
        return response.data;
      } catch (error) {
        console.error('Error fetching providers:', error);
        throw error;
      }
    })(),

  getPatients: (search?: string) =>
    USE_MOCK_DATA ? mockService.getPatients(search) :
    (async () => {
      try {
        const params = search ? `?search=${encodeURIComponent(search)}` : '';
        const response = await api.get(`/patients${params}`);
        return response.data;
      } catch (error) {
        console.error('Error fetching patients:', error);
        throw error;
      }
    })()
};

export const patientService = {
  getPatients: () =>
    USE_MOCK_DATA ? mockService.getPatients() :
    (async () => {
      try {
        const response = await api.get('/patients');
        return response.data;
      } catch (error) {
        console.error('Error fetching patients:', error);
        throw error;
      }
    })(),

  searchPatients: (term: string) =>
    USE_MOCK_DATA ? mockService.searchPatients(term) :
    (async () => {
      try {
        const response = await api.get(`/patients/search?q=${encodeURIComponent(term)}`);
        return response.data;
      } catch (error) {
        console.error('Error searching patients:', error);
        throw error;
      }
    })(),

  getPatient: (id: string) =>
    USE_MOCK_DATA ? mockService.getPatient(id) :
    (async () => {
      try {
        const response = await api.get(`/patients/${id}`);
        return response.data;
      } catch (error) {
        console.error('Error fetching patient:', error);
        throw error;
      }
    })(),

  getVitals: (patientId: string) =>
    USE_MOCK_DATA ? mockService.getPatientVitals(patientId) :
    (async () => {
      try {
        const response = await api.get(`/patients/${patientId}/vitals`);
        return response.data;
      } catch (error) {
        console.error('Error fetching patient vitals:', error);
        throw error;
      }
    })(),

  registerPatient: (data: any) =>
    USE_MOCK_DATA ? mockService.registerPatient(data) :
    (async () => {
      try {
        const response = await api.post('/patients', data);
        return response.data;
      } catch (error) {
        console.error('Error registering patient:', error);
        throw error;
      }
    })()
};

export const providerService = {
  getProviders: () =>
    USE_MOCK_DATA ? mockService.getProviders() :
    (async () => {
      try {
        const response = await api.get('/providers');
        return response.data;
      } catch (error) {
        console.error('Error fetching providers:', error);
        throw error;
      }
    })()
};

export const queueService = {
  getQueue: () =>
    USE_MOCK_DATA ? mockService.getQueuePatients() :
    (async () => {
      try {
        const response = await api.get('/queue');
        return response.data;
      } catch (error) {
        console.error('Error fetching queue:', error);
        throw error;
      }
    })(),

  getMetrics: () =>
    USE_MOCK_DATA ? mockService.getMetrics() :
    (async () => {
      try {
        const response = await api.get('/queue/metrics');
        return response.data;
      } catch (error) {
        console.error('Error fetching metrics:', error);
        throw error;
      }
    })(),

  updateStatus: (id: string, status: string) =>
    USE_MOCK_DATA ? mockService.updateQueueStatus(id, status) :
    (async () => {
      try {
        const response = await api.patch(`/queue/${id}/status`, { status });
        return response.data;
      } catch (error) {
        console.error('Error updating queue status:', error);
        throw error;
      }
    })()
};

export const encounterService = {
  getEncounters: (filters?: any) =>
    USE_MOCK_DATA ? mockService.getEncounters(filters) :
    (async () => {
      try {
        const params = new URLSearchParams();
        if (filters?.status) params.append('status', filters.status);
        if (filters?.patient_id) params.append('patient_id', filters.patient_id.toString());
        if (filters?.date_range?.start) params.append('start_date', filters.date_range.start);
        if (filters?.date_range?.end) params.append('end_date', filters.date_range.end);

        const response = await api.get(`/encounters?${params.toString()}`);
        return response.data;
      } catch (error) {
        console.error('Error fetching encounters:', error);
        throw error;
      }
    })(),

  getEncounter: (id: string) =>
    USE_MOCK_DATA ? mockService.getEncounter(id) :
    (async () => {
      try {
        const response = await api.get(`/encounters/${id}`);
        return response.data;
      } catch (error) {
        console.error('Error fetching encounter:', error);
        throw error;
      }
    })(),

  createEncounter: (data: any) =>
    USE_MOCK_DATA ? mockService.createEncounter(data) :
    (async () => {
      try {
        const response = await api.post('/encounters', data);
        return response.data;
      } catch (error) {
        console.error('Error creating encounter:', error);
        throw error;
      }
    })(),

  updateEncounter: (id: string, data: any) =>
    USE_MOCK_DATA ? mockService.updateEncounter(id, data) :
    (async () => {
      try {
        const response = await api.patch(`/encounters/${id}`, data);
        return response.data;
      } catch (error) {
        console.error('Error updating encounter:', error);
        throw error;
      }
    })(),

  startEncounter: (appointmentId: string) =>
    USE_MOCK_DATA ? mockService.startEncounter(appointmentId) :
    (async () => {
      try {
        const response = await api.post(`/appointments/${appointmentId}/start-encounter`);
        return response.data;
      } catch (error) {
        console.error('Error starting encounter:', error);
        throw error;
      }
    })()
};

export default api;