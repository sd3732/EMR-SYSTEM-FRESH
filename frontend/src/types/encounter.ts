export interface EncounterData {
  id: number;
  patient_id: number;
  provider_id: number;
  encounter_date: string;
  status: 'in-progress' | 'complete' | 'signed';
  current_stage: 'review' | 'hpi' | 'ros' | 'pe' | 'assessment';

  // Stage Data
  review: {
    chief_complaint: string;
    reason_for_visit: string;
    template_id?: string;
    onset_date?: string;
    interval_history?: string;
  };

  hpi: {
    location?: string;
    quality?: string;
    severity?: number;
    duration?: string;
    timing?: string;
    context?: string;
    modifying_factors?: string;
    associated_symptoms?: string[];
    narrative?: string;
  };

  ros: {
    constitutional?: string;
    eyes?: string;
    ears_nose_throat?: string;
    cardiovascular?: string;
    respiratory?: string;
    gastrointestinal?: string;
    genitourinary?: string;
    musculoskeletal?: string;
    integumentary?: string;
    neurological?: string;
    psychiatric?: string;
    endocrine?: string;
    hematologic?: string;
    allergic?: string;
  };

  pe: {
    general?: string;
    vital_signs?: {
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
    };
    heent?: string;
    neck?: string;
    respiratory?: string;
    cardiovascular?: string;
    abdomen?: string;
    genitourinary?: string;
    musculoskeletal?: string;
    skin?: string;
    neurologic?: string;
    psychiatric?: string;
  };

  assessment: {
    diagnoses: Array<{
      code: string;
      description: string;
      primary: boolean;
    }>;
    orders: Array<{
      type: 'lab' | 'imaging' | 'medication' | 'procedure';
      description: string;
      priority: 'routine' | 'urgent' | 'stat';
    }>;
    plan: string;
    follow_up?: string;
    patient_education?: string;
    work_excuse?: {
      needed: boolean;
      start_date?: string;
      end_date?: string;
      restrictions?: string;
    };
    referrals?: Array<{
      specialty: string;
      reason: string;
      urgent: boolean;
    }>;
  };
}

export interface EncounterTemplate {
  id: string;
  name: string;
  chief_complaint: string;
  category: 'uri' | 'uti' | 'laceration' | 'sprain' | 'physical' | 'covid' | 'abdominal' | 'custom';
  hpi_template?: string;
  ros_defaults?: Partial<EncounterData['ros']>;
  pe_defaults?: Partial<EncounterData['pe']>;
  assessment_template?: string;
  common_orders?: string[];
  common_diagnoses?: Array<{code: string; description: string}>;
  discharge_instructions?: string;
}