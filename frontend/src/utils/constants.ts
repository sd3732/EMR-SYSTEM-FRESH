// API Configuration
export const API_BASE_URL = '/api';

// Routes
export const ROUTES = {
  DASHBOARD: '/',
  PATIENTS: '/patients',
  PATIENT_DETAIL: '/patients/:id',
  NEW_PATIENT: '/patients/new',
  ENCOUNTERS: '/encounters',
  ENCOUNTER_DETAIL: '/encounters/:id',
  NEW_ENCOUNTER: '/encounters/new',
  TEMPLATES: '/templates',
  SETTINGS: '/settings',
  REPORTS: '/reports',
} as const;

// Patient Status Configuration
export const PATIENT_STATUS_CONFIG = {
  waiting: {
    label: 'Waiting',
    color: 'bg-yellow-100 text-yellow-800',
    priority: 1,
  },
  triaged: {
    label: 'Triaged',
    color: 'bg-blue-100 text-blue-800',
    priority: 2,
  },
  roomed: {
    label: 'Roomed',
    color: 'bg-purple-100 text-purple-800',
    priority: 3,
  },
  'with-provider': {
    label: 'With Provider',
    color: 'bg-orange-100 text-orange-800',
    priority: 4,
  },
  checkout: {
    label: 'Checkout',
    color: 'bg-green-100 text-green-800',
    priority: 5,
  },
  discharged: {
    label: 'Discharged',
    color: 'bg-gray-100 text-gray-800',
    priority: 6,
  },
} as const;

// Triage Priority Configuration
export const TRIAGE_PRIORITY_CONFIG = {
  emergent: {
    label: 'Emergent',
    color: 'bg-red-100 text-red-800 border-red-200',
    priority: 1,
    icon: '🚨',
  },
  urgent: {
    label: 'Urgent',
    color: 'bg-orange-100 text-orange-800 border-orange-200',
    priority: 2,
    icon: '⚠️',
  },
  'less-urgent': {
    label: 'Less Urgent',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    priority: 3,
    icon: '⏰',
  },
  'non-urgent': {
    label: 'Non-Urgent',
    color: 'bg-green-100 text-green-800 border-green-200',
    priority: 4,
    icon: '📋',
  },
} as const;

// Visit Types
export const VISIT_TYPES = {
  'walk-in': 'Walk-in',
  scheduled: 'Scheduled',
  'follow-up': 'Follow-up',
  physical: 'Physical',
  urgent: 'Urgent Care',
} as const;

// Provider Roles
export const PROVIDER_ROLES = {
  md: 'MD',
  do: 'DO',
  np: 'Nurse Practitioner',
  pa: 'Physician Assistant',
  rn: 'Registered Nurse',
  ma: 'Medical Assistant',
} as const;

// Encounter Stages
export const ENCOUNTER_STAGES = {
  review: 'Chart Review',
  hpi: 'History of Present Illness',
  ros: 'Review of Systems',
  pe: 'Physical Exam',
  assessment: 'Assessment & Plan',
} as const;

// Template Categories
export const TEMPLATE_CATEGORIES = {
  uri: 'Upper Respiratory Infection',
  uti: 'Urinary Tract Infection',
  laceration: 'Laceration',
  sprain: 'Sprain/Strain',
  physical: 'Physical Exam',
  covid: 'COVID-19',
  custom: 'Custom',
} as const;

// Navigation Items
export const NAV_ITEMS = [
  {
    label: 'Dashboard',
    href: ROUTES.DASHBOARD,
    icon: 'LayoutDashboard',
  },
  {
    label: 'Patients',
    href: ROUTES.PATIENTS,
    icon: 'Users',
  },
  {
    label: 'Encounters',
    href: ROUTES.ENCOUNTERS,
    icon: 'FileText',
  },
  {
    label: 'Templates',
    href: ROUTES.TEMPLATES,
    icon: 'BookOpen',
  },
  {
    label: 'Reports',
    href: ROUTES.REPORTS,
    icon: 'BarChart3',
  },
  {
    label: 'Settings',
    href: ROUTES.SETTINGS,
    icon: 'Settings',
  },
] as const;

// Vital Signs Normal Ranges
export const VITAL_RANGES = {
  bp_systolic: { min: 90, max: 140, unit: 'mmHg' },
  bp_diastolic: { min: 60, max: 90, unit: 'mmHg' },
  heart_rate: { min: 60, max: 100, unit: 'bpm' },
  temperature: { min: 97.0, max: 99.5, unit: '°F' },
  respiratory_rate: { min: 12, max: 20, unit: '/min' },
  oxygen_saturation: { min: 95, max: 100, unit: '%' },
  pain_scale: { min: 0, max: 10, unit: '/10' },
} as const;