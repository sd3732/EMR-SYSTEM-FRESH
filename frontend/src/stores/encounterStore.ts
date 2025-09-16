import { create } from 'zustand';
import type { Encounter, EncounterTemplate } from '@/types';

interface EncounterStore {
  currentEncounter: Encounter | null;
  selectedTemplate: EncounterTemplate | null;
  stage: 'review' | 'hpi' | 'ros' | 'pe' | 'assessment';
  isDirty: boolean;
  autoSaveEnabled: boolean;

  setCurrentEncounter: (encounter: Encounter | null) => void;
  setSelectedTemplate: (template: EncounterTemplate | null) => void;
  setStage: (stage: EncounterStore['stage']) => void;
  setDirty: (dirty: boolean) => void;
  setAutoSave: (enabled: boolean) => void;
  resetEncounter: () => void;
}

export const useEncounterStore = create<EncounterStore>((set) => ({
  currentEncounter: null,
  selectedTemplate: null,
  stage: 'review',
  isDirty: false,
  autoSaveEnabled: true,

  setCurrentEncounter: (encounter) =>
    set({ currentEncounter: encounter }),

  setSelectedTemplate: (template) =>
    set({ selectedTemplate: template }),

  setStage: (stage) =>
    set({ stage }),

  setDirty: (dirty) =>
    set({ isDirty: dirty }),

  setAutoSave: (enabled) =>
    set({ autoSaveEnabled: enabled }),

  resetEncounter: () =>
    set({
      currentEncounter: null,
      selectedTemplate: null,
      stage: 'review',
      isDirty: false,
    }),
}));