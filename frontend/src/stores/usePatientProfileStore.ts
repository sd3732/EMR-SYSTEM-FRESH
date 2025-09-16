import { create } from 'zustand';
import type { Patient } from '../types';
import type {
  PatientAllergy,
  PatientMedication,
  PatientProblem,
  PatientVaccine,
  PatientEncounter,
  PreventiveCareItem,
  PatientInsurance
} from '../types/patient-profile';

interface PatientProfileState {
  currentPatient: Patient | null;
  allergies: PatientAllergy[];
  medications: PatientMedication[];
  problems: PatientProblem[];
  vaccines: PatientVaccine[];
  encounters: PatientEncounter[];
  vitals: any[];
  preventiveCare: PreventiveCareItem[];
  insurance: PatientInsurance[];
  activeTab: string;
  isLoading: boolean;

  // Actions
  setCurrentPatient: (patient: Patient) => void;
  setAllergies: (allergies: PatientAllergy[]) => void;
  setMedications: (medications: PatientMedication[]) => void;
  setProblems: (problems: PatientProblem[]) => void;
  setVaccines: (vaccines: PatientVaccine[]) => void;
  setEncounters: (encounters: PatientEncounter[]) => void;
  setVitals: (vitals: any[]) => void;
  setPreventiveCare: (items: PreventiveCareItem[]) => void;
  setInsurance: (insurance: PatientInsurance[]) => void;
  setActiveTab: (tab: string) => void;
  setIsLoading: (loading: boolean) => void;
  loadPatientProfile: (patientId: number) => Promise<void>;
}

export const usePatientProfileStore = create<PatientProfileState>((set) => ({
  currentPatient: null,
  allergies: [],
  medications: [],
  problems: [],
  vaccines: [],
  encounters: [],
  vitals: [],
  preventiveCare: [],
  insurance: [],
  activeTab: 'overview',
  isLoading: false,

  setCurrentPatient: (patient) => set({ currentPatient: patient }),
  setAllergies: (allergies) => set({ allergies }),
  setMedications: (medications) => set({ medications }),
  setProblems: (problems) => set({ problems }),
  setVaccines: (vaccines) => set({ vaccines }),
  setEncounters: (encounters) => set({ encounters }),
  setVitals: (vitals) => set({ vitals }),
  setPreventiveCare: (items) => set({ preventiveCare: items }),
  setInsurance: (insurance) => set({ insurance }),
  setActiveTab: (tab) => set({ activeTab: tab }),
  setIsLoading: (loading) => set({ isLoading: loading }),

  loadPatientProfile: async (patientId: number) => {
    set({ isLoading: true });

    // Mock data for now - replace with actual API calls
    const mockPatient: Patient = {
      id: patientId,
      mrn: 'MRN-' + patientId.toString().padStart(6, '0'),
      first_name: 'John',
      last_name: 'Doe',
      date_of_birth: '1978-05-15',
      gender: 'male',
      phone: '555-0123',
      email: 'john.doe@email.com',
      address: '123 Main Street',
      city: 'Springfield',
      state: 'IL',
      zip: '62701',
      insurance_provider: 'Blue Cross Blue Shield',
      insurance_id: 'BCBS123456',
      emergency_contact: 'Jane Doe',
      emergency_phone: '555-0124',
      preferred_language: 'English',
      created_at: '2023-01-15',
      updated_at: '2024-01-15',
    };

    const mockAllergies: PatientAllergy[] = [
      {
        id: 1,
        allergen: 'Penicillin',
        type: 'drug',
        severity: 'severe',
        reaction: 'Anaphylaxis',
        onset_date: '2015-03-20',
        notes: 'Confirmed by allergist'
      },
      {
        id: 2,
        allergen: 'Peanuts',
        type: 'food',
        severity: 'moderate',
        reaction: 'Hives, swelling',
        onset_date: '2010-06-15',
      }
    ];

    const mockMedications: PatientMedication[] = [
      {
        id: 1,
        medication_name: 'Lisinopril',
        dosage: '10mg',
        frequency: 'Once daily',
        route: 'Oral',
        start_date: '2023-06-01',
        prescriber: 'Dr. Smith',
        is_active: true,
        notes: 'For hypertension'
      },
      {
        id: 2,
        medication_name: 'Metformin',
        dosage: '500mg',
        frequency: 'Twice daily',
        route: 'Oral',
        start_date: '2023-08-15',
        prescriber: 'Dr. Johnson',
        is_active: true,
        notes: 'For type 2 diabetes'
      }
    ];

    set({
      currentPatient: mockPatient,
      allergies: mockAllergies,
      medications: mockMedications,
      isLoading: false
    });
  },
}));