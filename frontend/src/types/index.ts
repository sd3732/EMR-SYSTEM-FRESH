// Patient Types
export interface Patient {
  id: number;
  mrn: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'male' | 'female' | 'other';
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  insurance_provider?: string;
  insurance_id?: string;
  emergency_contact?: string;
  emergency_phone?: string;
  preferred_language?: string;
  created_at: string;
  updated_at: string;
}

// Urgent Care Specific Types
export type TriagePriority = 'emergent' | 'urgent' | 'less-urgent' | 'non-urgent';
export type PatientStatus = 'waiting' | 'triaged' | 'roomed' | 'with-provider' | 'checkout' | 'discharged';

export interface Appointment {
  id: number;
  patient_id: number;
  provider_id: number;
  patient_name: string;
  scheduled_time: string;
  arrival_time?: string;
  duration: number;
  visit_type: 'walk-in' | 'scheduled' | 'follow-up' | 'physical' | 'urgent';
  status: PatientStatus;
  triage_priority?: TriagePriority;
  chief_complaint?: string;
  room_number?: string;
  wait_time_minutes?: number;
  notes?: string;
}

// Encounter Types
export interface Encounter {
  id: number;
  patient_id: number;
  provider_id: number;
  encounter_date: string;
  chief_complaint: string;
  status: 'in-progress' | 'complete' | 'signed';
  stage?: 'review' | 'hpi' | 'ros' | 'pe' | 'assessment';
  template_used?: string;
  created_at: string;
  updated_at: string;
}

// Vital Signs
export interface Vitals {
  id: number;
  patient_id: number;
  encounter_id?: number;
  bp_systolic: number;
  bp_diastolic: number;
  heart_rate: number;
  temperature: number;
  respiratory_rate: number;
  oxygen_saturation: number;
  weight?: number;
  height?: number;
  bmi?: number;
  pain_scale?: number;
  recorded_at: string;
  recorded_by: number;
}

// Template System
export interface EncounterTemplate {
  id: string;
  name: string;
  category: 'uri' | 'uti' | 'laceration' | 'sprain' | 'physical' | 'covid' | 'custom';
  is_favorite: boolean;
  chief_complaint: string;
  hpi_template: string;
  ros_defaults: Record<string, string>;
  pe_defaults: Record<string, string>;
  assessment_template: string;
  common_orders: string[];
  discharge_instructions: string;
  created_by: number;
  is_shared: boolean;
}

// Provider Types
export interface Provider {
  id: number;
  name: string;
  role: 'md' | 'do' | 'np' | 'pa' | 'rn' | 'ma';
  specialty?: string;
  available: boolean;
  current_patient_count: number;
}

// API Response Types
export interface ApiResponse<T> {
  data: T;
  message: string;
  success: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Navigation Types
export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
  children?: NavItem[];
}

// Auth Types
export interface User {
  id: number;
  username: string;
  email: string;
  role: 'admin' | 'provider' | 'nurse' | 'staff';
  first_name: string;
  last_name: string;
  avatar?: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
}

// Dashboard Types
export interface DashboardStats {
  total_patients: number;
  waiting_patients: number;
  in_progress_encounters: number;
  average_wait_time: number;
  rooms_occupied: number;
  total_rooms: number;
}

// Form Types
export interface PatientFormData {
  first_name: string;
  last_name: string;
  date_of_birth: string;
  gender: 'male' | 'female' | 'other';
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  insurance_provider?: string;
  insurance_id?: string;
  emergency_contact?: string;
  emergency_phone?: string;
}

export interface VitalsFormData {
  bp_systolic: number;
  bp_diastolic: number;
  heart_rate: number;
  temperature: number;
  respiratory_rate: number;
  oxygen_saturation: number;
  weight?: number;
  height?: number;
  pain_scale?: number;
}