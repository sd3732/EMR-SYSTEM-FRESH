export interface QueuePatient {
  id: number;
  patient_id: number;
  patient_name: string;
  age: number;
  gender: string;
  chief_complaint: string;
  arrival_time: string;
  check_in_time: string;
  triage_time?: string;
  room_time?: string;
  provider_time?: string;
  wait_time_minutes: number;
  triage_priority: 'emergent' | 'urgent' | 'less-urgent' | 'non-urgent';
  status: 'waiting' | 'triaged' | 'roomed' | 'with-provider' | 'checkout' | 'discharged';
  room_number?: string;
  provider_id?: number;
  provider_name?: string;
  vital_signs_complete: boolean;
  triage_notes?: string;
  estimated_wait?: number;
}

export interface TriageAssessment {
  patient_id: number;
  priority: 'emergent' | 'urgent' | 'less-urgent' | 'non-urgent';
  chief_complaint: string;
  pain_scale?: number;
  vital_signs?: {
    bp_systolic: number;
    bp_diastolic: number;
    heart_rate: number;
    temperature: number;
    respiratory_rate: number;
    oxygen_saturation: number;
  };
  notes: string;
  assessed_by: number;
  assessed_at: string;
}

export interface DashboardMetrics {
  total_waiting: number;
  average_wait_time: number;
  longest_wait_time: number;
  total_in_treatment: number;
  total_discharged_today: number;
  provider_count: number;
  available_rooms: number;
  total_rooms: number;
}