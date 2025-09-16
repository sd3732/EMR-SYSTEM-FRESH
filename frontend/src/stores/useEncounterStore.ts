import { create } from 'zustand';
import type { EncounterData, EncounterTemplate } from '../types/encounter';

interface EncounterState {
  currentEncounter: EncounterData | null;
  currentStage: EncounterData['current_stage'];
  templates: EncounterTemplate[];
  selectedTemplate: EncounterTemplate | null;
  isSaving: boolean;
  lastSaved: Date | null;

  // Actions
  initializeEncounter: (patientId: number) => void;
  loadEncounter: (encounterId: number) => Promise<void>;
  setStage: (stage: EncounterData['current_stage']) => void;
  updateReview: (data: Partial<EncounterData['review']>) => void;
  updateHPI: (data: Partial<EncounterData['hpi']>) => void;
  updateROS: (data: Partial<EncounterData['ros']>) => void;
  updatePE: (data: Partial<EncounterData['pe']>) => void;
  updateAssessment: (data: Partial<EncounterData['assessment']>) => void;
  applyTemplate: (templateId: string) => void;
  saveEncounter: () => Promise<void>;
  completeEncounter: () => Promise<void>;
}

export const useEncounterStore = create<EncounterState>((set, get) => ({
  currentEncounter: null,
  currentStage: 'review',
  templates: [
    {
      id: 'uri',
      name: 'Upper Respiratory Infection',
      chief_complaint: 'Cough, congestion, sore throat',
      category: 'uri',
      hpi_template: 'Patient presents with _ day history of upper respiratory symptoms including _.',
      ros_defaults: {
        constitutional: 'Positive for fever, chills',
        ears_nose_throat: 'Positive for nasal congestion, sore throat',
        respiratory: 'Positive for cough',
      },
      common_diagnoses: [
        { code: 'J06.9', description: 'Acute upper respiratory infection, unspecified' }
      ],
      common_orders: ['Rapid Strep Test', 'Rapid Flu Test'],
    },
    {
      id: 'uti',
      name: 'Urinary Tract Infection',
      chief_complaint: 'Dysuria, frequency, urgency',
      category: 'uti',
      hpi_template: 'Patient presents with _ day history of urinary symptoms including _.',
      ros_defaults: {
        genitourinary: 'Positive for dysuria, frequency, urgency',
        constitutional: 'Denies fever',
      },
      common_diagnoses: [
        { code: 'N39.0', description: 'Urinary tract infection, site not specified' }
      ],
      common_orders: ['Urinalysis', 'Urine Culture'],
    },
  ],
  selectedTemplate: null,
  isSaving: false,
  lastSaved: null,

  initializeEncounter: (patientId) => {
    const newEncounter: EncounterData = {
      id: Date.now(),
      patient_id: patientId,
      provider_id: 1, // Would get from current user
      encounter_date: new Date().toISOString(),
      status: 'in-progress',
      current_stage: 'review',
      review: {
        chief_complaint: '',
        reason_for_visit: '',
      },
      hpi: {},
      ros: {},
      pe: {},
      assessment: {
        diagnoses: [],
        orders: [],
        plan: '',
      },
    };
    set({ currentEncounter: newEncounter, currentStage: 'review' });
  },

  loadEncounter: async (encounterId) => {
    // Mock implementation - replace with API call
    set({ isSaving: true });
    // Simulate API call
    setTimeout(() => {
      set({ isSaving: false });
    }, 1000);
  },

  setStage: (stage) => {
    set({ currentStage: stage });
    if (get().currentEncounter) {
      set(state => ({
        currentEncounter: {
          ...state.currentEncounter!,
          current_stage: stage,
        }
      }));
    }
  },

  updateReview: (data) => {
    set(state => ({
      currentEncounter: state.currentEncounter ? {
        ...state.currentEncounter,
        review: { ...state.currentEncounter.review, ...data }
      } : null
    }));
  },

  updateHPI: (data) => {
    set(state => ({
      currentEncounter: state.currentEncounter ? {
        ...state.currentEncounter,
        hpi: { ...state.currentEncounter.hpi, ...data }
      } : null
    }));
  },

  updateROS: (data) => {
    set(state => ({
      currentEncounter: state.currentEncounter ? {
        ...state.currentEncounter,
        ros: { ...state.currentEncounter.ros, ...data }
      } : null
    }));
  },

  updatePE: (data) => {
    set(state => ({
      currentEncounter: state.currentEncounter ? {
        ...state.currentEncounter,
        pe: { ...state.currentEncounter.pe, ...data }
      } : null
    }));
  },

  updateAssessment: (data) => {
    set(state => ({
      currentEncounter: state.currentEncounter ? {
        ...state.currentEncounter,
        assessment: { ...state.currentEncounter.assessment, ...data }
      } : null
    }));
  },

  applyTemplate: (templateId) => {
    const template = get().templates.find(t => t.id === templateId);
    if (template && get().currentEncounter) {
      set(state => ({
        selectedTemplate: template,
        currentEncounter: {
          ...state.currentEncounter!,
          review: {
            ...state.currentEncounter!.review,
            chief_complaint: template.chief_complaint,
            template_id: template.id,
          },
          ros: template.ros_defaults ? { ...template.ros_defaults } : state.currentEncounter!.ros,
          pe: template.pe_defaults ? { ...template.pe_defaults } : state.currentEncounter!.pe,
        }
      }));
    }
  },

  saveEncounter: async () => {
    set({ isSaving: true });
    // Simulate API call
    setTimeout(() => {
      set({ isSaving: false, lastSaved: new Date() });
    }, 1000);
  },

  completeEncounter: async () => {
    set({ isSaving: true });
    // Simulate API call
    setTimeout(() => {
      set(state => ({
        currentEncounter: state.currentEncounter ? {
          ...state.currentEncounter,
          status: 'complete'
        } : null,
        isSaving: false
      }));
    }, 1000);
  },
}));