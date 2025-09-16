export interface PatientAllergy {
  id: number;
  allergen: string;
  type: 'drug' | 'food' | 'environmental';
  severity: 'mild' | 'moderate' | 'severe';
  reaction: string;
  onset_date: string;
  notes?: string;
}

export interface PatientMedication {
  id: number;
  medication_name: string;
  dosage: string;
  frequency: string;
  route: string;
  start_date: string;
  end_date?: string;
  prescriber: string;
  is_active: boolean;
  notes?: string;
}

export interface PatientProblem {
  id: number;
  problem_name: string;
  icd10_code: string;
  status: 'active' | 'resolved' | 'chronic';
  onset_date: string;
  resolved_date?: string;
  notes?: string;
}

export interface PatientVaccine {
  id: number;
  vaccine_name: string;
  date_administered: string;
  lot_number?: string;
  site?: string;
  administered_by: string;
  next_due?: string;
}

export interface PatientEncounter {
  id: number;
  encounter_date: string;
  chief_complaint: string;
  provider_name: string;
  encounter_type: string;
  diagnoses: string[];
  status: 'complete' | 'in-progress' | 'signed';
  notes?: string;
}

export interface PreventiveCareItem {
  id: string;
  name: string;
  category: 'screening' | 'immunization' | 'counseling';
  due_date: string;
  last_completed?: string;
  status: 'due' | 'overdue' | 'upcoming' | 'completed';
  frequency: string;
}

export interface PatientInsurance {
  id: number;
  insurance_type: 'primary' | 'secondary';
  provider_name: string;
  policy_number: string;
  group_number?: string;
  subscriber_name: string;
  subscriber_dob: string;
  effective_date: string;
  expiration_date?: string;
}