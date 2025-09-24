/**
 * COMPLETE PHI ENDPOINTS INVENTORY
 * CRITICAL: Every endpoint that accesses PHI must be documented here
 * Missing even ONE endpoint from audit logging is a HIPAA violation
 */

export const PHI_ENDPOINTS = [
  // ================================
  // PATIENTS - Core PHI Entity
  // ================================
  { method: 'GET', path: '/api/patients', phi: ['list', 'search'], description: 'List/search patients' },
  { method: 'GET', path: '/api/patients/:id', phi: ['full_demographics', 'identifiers', 'contacts'], description: 'Get patient details' },
  { method: 'POST', path: '/api/patients', phi: ['create_demographics'], description: 'Create new patient' },
  { method: 'PUT', path: '/api/patients/:id', phi: ['update_demographics'], description: 'Update patient info' },
  { method: 'DELETE', path: '/api/patients/:id', phi: ['delete_patient'], description: 'Delete patient (rare)' },
  { method: 'GET', path: '/api/patients/:id/summary', phi: ['full_medical_summary'], description: 'Patient medical summary' },
  { method: 'GET', path: '/api/patients/:id/encounters', phi: ['encounter_history'], description: 'Patient encounter history' },
  { method: 'GET', path: '/api/patients/:id/medications', phi: ['medication_history'], description: 'Patient medication history' },
  { method: 'GET', path: '/api/patients/:id/allergies', phi: ['allergy_history'], description: 'Patient allergy history' },
  { method: 'GET', path: '/api/patients/:id/vitals', phi: ['vital_signs_history'], description: 'Patient vitals history' },
  { method: 'GET', path: '/api/patients/:id/labs', phi: ['lab_results_history'], description: 'Patient lab history' },

  // ================================
  // ENCOUNTERS - Clinical Visits
  // ================================
  { method: 'GET', path: '/api/encounters', phi: ['encounter_list'], description: 'List encounters' },
  { method: 'GET', path: '/api/encounters/:id', phi: ['encounter_details', 'clinical_notes'], description: 'Get encounter details' },
  { method: 'POST', path: '/api/encounters', phi: ['create_encounter'], description: 'Create new encounter' },
  { method: 'PUT', path: '/api/encounters/:id', phi: ['update_encounter'], description: 'Update encounter' },
  { method: 'DELETE', path: '/api/encounters/:id', phi: ['delete_encounter'], description: 'Delete encounter' },
  { method: 'POST', path: '/api/encounters/:id/vitals', phi: ['record_vitals'], description: 'Record encounter vitals' },
  { method: 'PUT', path: '/api/encounters/:id/vitals', phi: ['update_vitals'], description: 'Update encounter vitals' },
  { method: 'POST', path: '/api/encounters/:id/medications', phi: ['prescribe_medication'], description: 'Add encounter medications' },
  { method: 'GET', path: '/api/encounters/:id/notes', phi: ['clinical_notes'], description: 'Get encounter notes' },
  { method: 'POST', path: '/api/encounters/:id/notes', phi: ['create_clinical_notes'], description: 'Create clinical notes' },
  { method: 'PUT', path: '/api/encounters/:id/notes', phi: ['update_clinical_notes'], description: 'Update clinical notes' },

  // ================================
  // VITALS - Biometric Data
  // ================================
  { method: 'GET', path: '/api/vitals', phi: ['vital_signs_search'], description: 'Search vitals' },
  { method: 'GET', path: '/api/vitals/:id', phi: ['vital_signs_details'], description: 'Get specific vital signs' },
  { method: 'POST', path: '/api/vitals', phi: ['record_vital_signs'], description: 'Record new vital signs' },
  { method: 'PUT', path: '/api/vitals/:id', phi: ['update_vital_signs'], description: 'Update vital signs' },
  { method: 'DELETE', path: '/api/vitals/:id', phi: ['delete_vital_signs'], description: 'Delete vital signs' },
  { method: 'GET', path: '/api/vitals/patient/:patientId', phi: ['patient_vitals_history'], description: 'Get patient vitals history' },

  // ================================
  // MEDICATIONS & PRESCRIPTIONS
  // ================================
  { method: 'GET', path: '/api/medications', phi: ['medication_search'], description: 'Search medications (may include patient context)' },
  { method: 'GET', path: '/api/medications/:id', phi: ['medication_details'], description: 'Get medication details' },
  { method: 'GET', path: '/api/prescriptions', phi: ['prescription_list'], description: 'List prescriptions' },
  { method: 'GET', path: '/api/prescriptions/:id', phi: ['prescription_details'], description: 'Get prescription details' },
  { method: 'POST', path: '/api/prescriptions', phi: ['create_prescription'], description: 'Create new prescription' },
  { method: 'PUT', path: '/api/prescriptions/:id', phi: ['update_prescription'], description: 'Update prescription' },
  { method: 'DELETE', path: '/api/prescriptions/:id', phi: ['delete_prescription'], description: 'Delete prescription' },
  { method: 'POST', path: '/api/prescriptions/:id/refill', phi: ['refill_prescription'], description: 'Process refill' },
  { method: 'POST', path: '/api/prescriptions/:id/discontinue', phi: ['discontinue_prescription'], description: 'Discontinue prescription' },
  { method: 'GET', path: '/api/prescriptions/patient/:patientId', phi: ['patient_prescription_history'], description: 'Get patient prescriptions' },

  // ================================
  // ALLERGIES
  // ================================
  { method: 'GET', path: '/api/allergies', phi: ['allergy_search'], description: 'Search patient allergies' },
  { method: 'GET', path: '/api/allergies/:id', phi: ['allergy_details'], description: 'Get specific allergy' },
  { method: 'POST', path: '/api/allergies', phi: ['record_allergy'], description: 'Record new allergy' },
  { method: 'PUT', path: '/api/allergies/:id', phi: ['update_allergy'], description: 'Update allergy information' },
  { method: 'DELETE', path: '/api/allergies/:id', phi: ['delete_allergy'], description: 'Remove allergy record' },
  { method: 'GET', path: '/api/allergies/patient/:patientId', phi: ['patient_allergy_history'], description: 'Get patient allergies' },

  // ================================
  // LAB ORDERS & RESULTS
  // ================================
  { method: 'GET', path: '/api/lab-orders', phi: ['lab_order_list'], description: 'List lab orders' },
  { method: 'GET', path: '/api/lab-orders/:id', phi: ['lab_order_details'], description: 'Get lab order details' },
  { method: 'POST', path: '/api/lab-orders', phi: ['create_lab_order'], description: 'Create new lab order' },
  { method: 'PUT', path: '/api/lab-orders/:id', phi: ['update_lab_order'], description: 'Update lab order' },
  { method: 'DELETE', path: '/api/lab-orders/:id', phi: ['cancel_lab_order'], description: 'Cancel lab order' },
  { method: 'POST', path: '/api/lab-orders/:id/collect', phi: ['specimen_collection'], description: 'Record specimen collection' },
  { method: 'POST', path: '/api/lab-orders/:id/result', phi: ['record_lab_result'], description: 'Record lab result' },
  { method: 'GET', path: '/api/lab-orders/patient/:patientId', phi: ['patient_lab_history'], description: 'Get patient lab orders' },
  { method: 'GET', path: '/api/lab-results', phi: ['lab_result_search'], description: 'Search lab results' },
  { method: 'GET', path: '/api/lab-results/:id', phi: ['lab_result_details'], description: 'Get specific lab result' },
  { method: 'PUT', path: '/api/lab-results/:id', phi: ['update_lab_result'], description: 'Update lab result' },
  { method: 'GET', path: '/api/lab-results/patient/:patientId', phi: ['patient_lab_results'], description: 'Get patient lab results' },

  // ================================
  // CLINICAL NOTES
  // ================================
  { method: 'GET', path: '/api/clinical-notes', phi: ['clinical_notes_search'], description: 'Search clinical notes' },
  { method: 'GET', path: '/api/clinical-notes/:id', phi: ['clinical_note_content'], description: 'Get clinical note content' },
  { method: 'POST', path: '/api/clinical-notes', phi: ['create_clinical_note'], description: 'Create clinical note' },
  { method: 'PUT', path: '/api/clinical-notes/:id', phi: ['update_clinical_note'], description: 'Update clinical note' },
  { method: 'DELETE', path: '/api/clinical-notes/:id', phi: ['delete_clinical_note'], description: 'Delete clinical note' },
  { method: 'POST', path: '/api/clinical-notes/:id/finalize', phi: ['finalize_clinical_note'], description: 'Finalize clinical note' },
  { method: 'GET', path: '/api/clinical-notes/encounter/:encounterId', phi: ['encounter_clinical_notes'], description: 'Get encounter notes' },
  { method: 'GET', path: '/api/clinical-notes/patient/:patientId', phi: ['patient_clinical_notes'], description: 'Get patient notes' },

  // ================================
  // MEDICAL HISTORY
  // ================================
  { method: 'GET', path: '/api/medical-history', phi: ['medical_history_search'], description: 'Search medical history' },
  { method: 'GET', path: '/api/medical-history/:id', phi: ['medical_history_details'], description: 'Get medical history entry' },
  { method: 'POST', path: '/api/medical-history', phi: ['record_medical_history'], description: 'Record medical history' },
  { method: 'PUT', path: '/api/medical-history/:id', phi: ['update_medical_history'], description: 'Update medical history' },
  { method: 'DELETE', path: '/api/medical-history/:id', phi: ['delete_medical_history'], description: 'Delete medical history' },
  { method: 'GET', path: '/api/medical-history/patient/:patientId', phi: ['patient_medical_history'], description: 'Get patient medical history' },

  // ================================
  // FAMILY HISTORY
  // ================================
  { method: 'GET', path: '/api/family-history', phi: ['family_history_search'], description: 'Search family history' },
  { method: 'GET', path: '/api/family-history/:id', phi: ['family_history_details'], description: 'Get family history entry' },
  { method: 'POST', path: '/api/family-history', phi: ['record_family_history'], description: 'Record family history' },
  { method: 'PUT', path: '/api/family-history/:id', phi: ['update_family_history'], description: 'Update family history' },
  { method: 'DELETE', path: '/api/family-history/:id', phi: ['delete_family_history'], description: 'Delete family history' },
  { method: 'GET', path: '/api/family-history/patient/:patientId', phi: ['patient_family_history'], description: 'Get patient family history' },

  // ================================
  // DISCHARGE SUMMARIES
  // ================================
  { method: 'GET', path: '/api/discharge-summaries', phi: ['discharge_summary_search'], description: 'Search discharge summaries' },
  { method: 'GET', path: '/api/discharge-summaries/:id', phi: ['discharge_summary_content'], description: 'Get discharge summary' },
  { method: 'POST', path: '/api/discharge-summaries', phi: ['create_discharge_summary'], description: 'Create discharge summary' },
  { method: 'PUT', path: '/api/discharge-summaries/:id', phi: ['update_discharge_summary'], description: 'Update discharge summary' },
  { method: 'DELETE', path: '/api/discharge-summaries/:id', phi: ['delete_discharge_summary'], description: 'Delete discharge summary' },
  { method: 'GET', path: '/api/discharge-summaries/patient/:patientId', phi: ['patient_discharge_summaries'], description: 'Get patient discharge summaries' },

  // ================================
  // INSURANCE INFORMATION
  // ================================
  { method: 'GET', path: '/api/insurance', phi: ['insurance_search'], description: 'Search insurance records' },
  { method: 'GET', path: '/api/insurance/:id', phi: ['insurance_details'], description: 'Get insurance details' },
  { method: 'POST', path: '/api/insurance', phi: ['create_insurance_record'], description: 'Create insurance record' },
  { method: 'PUT', path: '/api/insurance/:id', phi: ['update_insurance_record'], description: 'Update insurance record' },
  { method: 'DELETE', path: '/api/insurance/:id', phi: ['delete_insurance_record'], description: 'Delete insurance record' },
  { method: 'GET', path: '/api/insurance/patient/:patientId', phi: ['patient_insurance_history'], description: 'Get patient insurance' },
  { method: 'POST', path: '/api/insurance/:id/verify', phi: ['verify_insurance'], description: 'Verify insurance coverage' },

  // ================================
  // APPOINTMENTS (PHI-adjacent)
  // ================================
  { method: 'GET', path: '/api/appointments', phi: ['appointment_schedule'], description: 'View appointment schedule' },
  { method: 'GET', path: '/api/appointments/:id', phi: ['appointment_details'], description: 'Get appointment details' },
  { method: 'POST', path: '/api/appointments', phi: ['schedule_appointment'], description: 'Schedule appointment' },
  { method: 'PUT', path: '/api/appointments/:id', phi: ['update_appointment'], description: 'Update appointment' },
  { method: 'DELETE', path: '/api/appointments/:id', phi: ['cancel_appointment'], description: 'Cancel appointment' },
  { method: 'GET', path: '/api/appointments/patient/:patientId', phi: ['patient_appointment_history'], description: 'Get patient appointments' },

  // ================================
  // BULK/EXPORT OPERATIONS
  // ================================
  { method: 'POST', path: '/api/patients/bulk-export', phi: ['bulk_patient_export'], description: 'Bulk export patients' },
  { method: 'POST', path: '/api/encounters/bulk-export', phi: ['bulk_encounter_export'], description: 'Bulk export encounters' },
  { method: 'POST', path: '/api/lab-results/bulk-export', phi: ['bulk_lab_export'], description: 'Bulk export lab results' },
  { method: 'GET', path: '/api/reports/patient-summary/:patientId', phi: ['patient_summary_report'], description: 'Generate patient summary report' },
  { method: 'GET', path: '/api/reports/encounter-summary/:encounterId', phi: ['encounter_summary_report'], description: 'Generate encounter summary report' },

  // ================================
  // SEARCH OPERATIONS (Cross-PHI)
  // ================================
  { method: 'GET', path: '/api/search/patients', phi: ['global_patient_search'], description: 'Global patient search' },
  { method: 'GET', path: '/api/search/medical-records', phi: ['medical_record_search'], description: 'Search across medical records' },
  { method: 'GET', path: '/api/search/lab-results', phi: ['lab_result_search'], description: 'Search lab results' },
  { method: 'GET', path: '/api/search/medications', phi: ['medication_search'], description: 'Search patient medications' }
];

/**
 * PHI TABLES AND SENSITIVITY LEVELS
 * Used to determine audit requirements and access controls
 */
export const PHI_TABLES = {
  // HIGHEST SENSITIVITY - Direct Patient Identifiers
  patients: {
    sensitivity: 'CRITICAL',
    identifiers: ['mrn', 'first_name', 'last_name', 'dob', 'ssn'],
    phi_fields: ['phone', 'email', 'address', 'emergency_contact_name', 'emergency_contact_phone']
  },

  // HIGH SENSITIVITY - Clinical Data
  encounters: {
    sensitivity: 'HIGH',
    phi_fields: ['reason', 'notes', 'hpi', 'chief_complaint', 'ros']
  },

  vitals: {
    sensitivity: 'HIGH',
    phi_fields: ['height_cm', 'weight_kg', 'systolic', 'diastolic', 'pulse', 'temp_c', 'spo2']
  },

  clinical_notes: {
    sensitivity: 'HIGH',
    phi_fields: ['subjective', 'objective', 'assessment', 'plan']
  },

  // MODERATE SENSITIVITY - Treatment Data
  prescriptions: {
    sensitivity: 'MODERATE',
    phi_fields: ['prescribed_name', 'dose', 'instructions', 'indication', 'notes']
  },

  allergies: {
    sensitivity: 'MODERATE',
    phi_fields: ['substance', 'reaction', 'severity']
  },

  lab_orders: {
    sensitivity: 'MODERATE',
    phi_fields: ['clinical_indication', 'diagnosis_codes', 'notes']
  },

  // PROTECTED - Administrative/Financial
  insurance: {
    sensitivity: 'PROTECTED',
    phi_fields: ['policy_number', 'group_number', 'subscriber_id']
  }
};

/**
 * AUDIT REQUIREMENTS BY ENDPOINT TYPE
 */
export const AUDIT_REQUIREMENTS = {
  // Always audit these actions
  CRITICAL_ACTIONS: ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'EXPORT', 'PRINT', 'SEARCH'],

  // Require additional justification
  HIGH_RISK_ACTIONS: ['BULK_EXPORT', 'DELETE', 'EMERGENCY_ACCESS'],

  // Endpoints that must never skip audit
  NEVER_SKIP_AUDIT: [
    '/api/patients',
    '/api/encounters',
    '/api/clinical-notes',
    '/api/lab-results',
    '/api/prescriptions'
  ]
};

/**
 * Get PHI endpoints that match a specific pattern
 */
export function getEndpointsByPattern(pattern) {
  return PHI_ENDPOINTS.filter(endpoint =>
    new RegExp(pattern).test(endpoint.path)
  );
}

/**
 * Check if an endpoint requires PHI audit logging
 */
export function requiresAuditLogging(method, path) {
  return PHI_ENDPOINTS.some(endpoint =>
    endpoint.method === method &&
    (endpoint.path === path || matchesRoutePattern(endpoint.path, path))
  );
}

/**
 * Helper to match route patterns with actual paths
 */
function matchesRoutePattern(pattern, actualPath) {
  const regex = pattern.replace(/:[\w]+/g, '[^/]+');
  return new RegExp(`^${regex}$`).test(actualPath);
}

/**
 * Get the sensitivity level for a table/resource
 */
export function getResourceSensitivity(resourceType) {
  return PHI_TABLES[resourceType]?.sensitivity || 'MODERATE';
}

export default PHI_ENDPOINTS;