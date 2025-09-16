import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE_URL = 'http://localhost:3000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle responses and errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    } else if (error.response?.status >= 500) {
      toast.error('Server error. Please try again.');
    }
    return Promise.reject(error);
  }
);

// Patient Services
export const patientService = {
  getAll: () => api.get('/patients'),
  getById: (id: number) => api.get(`/patients/${id}`),
  create: (data: any) => api.post('/patients', data),
  update: (id: number, data: any) => api.put(`/patients/${id}`, data),
  search: (query: string) => api.get(`/patients/search?q=${query}`),
  getVitals: (id: number) => api.get(`/patients/${id}/vitals`),
  getMedications: (id: number) => api.get(`/patients/${id}/medications`),
  getAllergies: (id: number) => api.get(`/patients/${id}/allergies`),
};

// Appointment Services
export const appointmentService = {
  getToday: () => api.get('/appointments/today'),
  getByDate: (date: string) => api.get(`/appointments?date=${date}`),
  create: (data: any) => api.post('/appointments', data),
  updateStatus: (id: number, status: string, room?: string) =>
    api.patch(`/appointments/${id}`, { status, room_number: room }),
  updateTriage: (id: number, priority: string) =>
    api.patch(`/appointments/${id}/triage`, { priority }),
};

// Encounter Services
export const encounterService = {
  getAll: () => api.get('/encounters'),
  getById: (id: number) => api.get(`/encounters/${id}`),
  create: (data: any) => api.post('/encounters', data),
  update: (id: number, data: any) => api.put(`/encounters/${id}`, data),
  getTemplates: () => api.get('/encounters/templates'),
  saveTemplate: (data: any) => api.post('/encounters/templates', data),
};

// Queue Management (Urgent Care Specific)
export const queueService = {
  getQueue: () => api.get('/queue'),
  checkIn: (patientId: number, chiefComplaint: string) =>
    api.post('/queue/checkin', { patient_id: patientId, chief_complaint: chiefComplaint }),
  updateWaitTime: () => api.post('/queue/update-wait-times'),
};

export default api;