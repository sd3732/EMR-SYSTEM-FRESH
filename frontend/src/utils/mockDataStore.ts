import { format, addMinutes, startOfDay, setHours, setMinutes } from 'date-fns';

// Initial mock patients
export const mockPatients = [
  {
    id: 1,
    first_name: 'Alice',
    last_name: 'Anderson',
    name: 'Alice Anderson',
    mrn: 'MRN001',
    date_of_birth: '1985-03-15',
    dob: '1985-03-15',
    phone: '555-0101',
    email: 'alice@email.com',
    insurance: 'Blue Cross',
    primary_provider: 'Dr. Smith'
  },
  {
    id: 2,
    first_name: 'Bob',
    last_name: 'Brown',
    name: 'Bob Brown',
    mrn: 'MRN002',
    date_of_birth: '1990-07-22',
    dob: '1990-07-22',
    phone: '555-0102',
    email: 'bob@email.com',
    insurance: 'Aetna',
    primary_provider: 'Dr. Doe'
  },
  {
    id: 3,
    first_name: 'Carol',
    last_name: 'Davis',
    name: 'Carol Davis',
    mrn: 'MRN003',
    date_of_birth: '1978-11-30',
    dob: '1978-11-30',
    phone: '555-0103',
    email: 'carol@email.com',
    insurance: 'United Healthcare',
    primary_provider: 'Dr. Johnson'
  },
  {
    id: 4,
    first_name: 'David',
    last_name: 'Evans',
    name: 'David Evans',
    mrn: 'MRN004',
    date_of_birth: '2000-05-18',
    dob: '2000-05-18',
    phone: '555-0104',
    email: 'david@email.com',
    insurance: 'Cigna',
    primary_provider: 'Dr. Smith'
  },
  {
    id: 5,
    first_name: 'Emma',
    last_name: 'Wilson',
    name: 'Emma Wilson',
    mrn: 'MRN005',
    date_of_birth: '1995-09-10',
    dob: '1995-09-10',
    phone: '555-0105',
    email: 'emma@email.com',
    insurance: 'Kaiser',
    primary_provider: 'Dr. Williams'
  },
  {
    id: 6,
    first_name: 'Frank',
    last_name: 'Miller',
    name: 'Frank Miller',
    mrn: 'MRN006',
    date_of_birth: '1982-02-28',
    dob: '1982-02-28',
    phone: '555-0106',
    email: 'frank@email.com',
    insurance: 'Blue Cross',
    primary_provider: 'Dr. Smith'
  }
];

export const mockProviders = [
  { id: 1, first_name: 'John', last_name: 'Smith', name: 'John Smith', specialty: 'Family Medicine' },
  { id: 2, first_name: 'Jane', last_name: 'Doe', name: 'Jane Doe', specialty: 'Internal Medicine' },
  { id: 3, first_name: 'Robert', last_name: 'Johnson', name: 'Robert Johnson', specialty: 'Urgent Care' },
  { id: 4, first_name: 'Emily', last_name: 'Williams', name: 'Emily Williams', specialty: 'Pediatrics' }
];

// Mock appointments that will show in both schedule and queue
const today = startOfDay(new Date());

export let mockAppointments = [
  {
    id: 1,
    patient_id: 1,
    patient_name: 'Alice Anderson',
    patient: mockPatients[0],
    provider_id: 1,
    provider_name: 'Dr. John Smith',
    start: setMinutes(setHours(today, 9), 0).toISOString(),
    end: setMinutes(setHours(today, 9), 30).toISOString(),
    scheduled_time: setMinutes(setHours(today, 9), 0).toISOString(),
    arrival_time: setMinutes(setHours(today, 8), 50).toISOString(),
    check_in_time: setMinutes(setHours(today, 8), 50).toISOString(),
    duration: 30,
    visit_type: 'follow-up',
    chief_complaint: 'Headache follow-up',
    status: 'roomed',
    room: 'Room 1',
    room_number: '1',
    triage_priority: 'less-urgent',
    wait_time_minutes: 10,
    estimated_wait: 5,
    vital_signs_complete: true,
    notes: 'Patient requested morning appointment',
    age: 40,
    gender: 'female'
  },
  {
    id: 2,
    patient_id: 2,
    patient_name: 'Bob Brown',
    patient: mockPatients[1],
    provider_id: 2,
    provider_name: 'Dr. Jane Doe',
    start: setMinutes(setHours(today, 9), 30).toISOString(),
    end: setMinutes(setHours(today, 9), 45).toISOString(),
    scheduled_time: setMinutes(setHours(today, 9), 30).toISOString(),
    arrival_time: setMinutes(setHours(today, 9), 15).toISOString(),
    check_in_time: setMinutes(setHours(today, 9), 15).toISOString(),
    duration: 15,
    visit_type: 'walk-in',
    chief_complaint: 'Sore throat',
    status: 'triaged',
    room: null,
    room_number: null,
    triage_priority: 'urgent',
    wait_time_minutes: 15,
    estimated_wait: 20,
    vital_signs_complete: false,
    notes: 'Walk-in patient, elevated temp 101.2',
    age: 35,
    gender: 'male'
  },
  {
    id: 3,
    patient_id: 3,
    patient_name: 'Carol Davis',
    patient: mockPatients[2],
    provider_id: 1,
    provider_name: 'Dr. John Smith',
    start: setMinutes(setHours(today, 10), 0).toISOString(),
    end: setMinutes(setHours(today, 10), 45).toISOString(),
    scheduled_time: setMinutes(setHours(today, 10), 0).toISOString(),
    arrival_time: null,
    check_in_time: null,
    duration: 45,
    visit_type: 'physical',
    chief_complaint: 'Annual physical exam',
    status: 'booked',
    room: null,
    room_number: null,
    triage_priority: 'non-urgent',
    wait_time_minutes: 0,
    estimated_wait: 0,
    vital_signs_complete: false,
    notes: 'Fasting labs ordered',
    age: 47,
    gender: 'female'
  },
  {
    id: 4,
    patient_id: 4,
    patient_name: 'David Evans',
    patient: mockPatients[3],
    provider_id: 3,
    provider_name: 'Dr. Robert Johnson',
    start: setMinutes(setHours(today, 10), 30).toISOString(),
    end: setMinutes(setHours(today, 11), 0).toISOString(),
    scheduled_time: setMinutes(setHours(today, 10), 30).toISOString(),
    arrival_time: setMinutes(setHours(today, 10), 20).toISOString(),
    check_in_time: setMinutes(setHours(today, 10), 20).toISOString(),
    duration: 30,
    visit_type: 'urgent',
    chief_complaint: 'Chest pain',
    status: 'waiting',
    room: null,
    room_number: null,
    triage_priority: 'emergent',
    wait_time_minutes: 10,
    estimated_wait: 15,
    vital_signs_complete: true,
    notes: 'EKG ordered, vitals stable',
    age: 25,
    gender: 'male'
  },
  {
    id: 5,
    patient_id: 5,
    patient_name: 'Emma Wilson',
    patient: mockPatients[4],
    provider_id: 4,
    provider_name: 'Dr. Emily Williams',
    start: setMinutes(setHours(today, 11), 0).toISOString(),
    end: setMinutes(setHours(today, 11), 15).toISOString(),
    scheduled_time: setMinutes(setHours(today, 11), 0).toISOString(),
    arrival_time: null,
    check_in_time: null,
    duration: 15,
    visit_type: 'consultation',
    chief_complaint: 'Skin rash consultation',
    status: 'booked',
    room: null,
    room_number: null,
    triage_priority: 'less-urgent',
    wait_time_minutes: 0,
    estimated_wait: 0,
    vital_signs_complete: false,
    notes: 'Dermatology referral needed',
    age: 30,
    gender: 'female'
  }
];

// Queue items (subset of appointments that are checked in)
export const getQueueItems = () => {
  return mockAppointments.filter(apt =>
    ['waiting', 'triaged', 'roomed', 'with-provider'].includes(apt.status)
  ).map(apt => ({
    ...apt,
    waitTime: apt.wait_time_minutes,
    triagePriority: apt.triage_priority,
    wait_time: apt.wait_time_minutes
  }));
};

// Mock vitals for patients
export const mockVitals = {
  1: [
    { date: '2025-09-01', bp_systolic: 120, bp_diastolic: 80, heart_rate: 72, temperature: 98.6, weight: 150, oxygen_saturation: 98 },
    { date: '2025-08-01', bp_systolic: 118, bp_diastolic: 78, heart_rate: 70, temperature: 98.4, weight: 148, oxygen_saturation: 99 },
    { date: '2025-07-01', bp_systolic: 122, bp_diastolic: 82, heart_rate: 74, temperature: 98.7, weight: 152, oxygen_saturation: 98 }
  ],
  2: [
    { date: '2025-09-15', bp_systolic: 130, bp_diastolic: 85, heart_rate: 78, temperature: 101.2, weight: 180, oxygen_saturation: 97 }
  ],
  4: [
    { date: '2025-09-15', bp_systolic: 125, bp_diastolic: 82, heart_rate: 85, temperature: 98.9, weight: 170, oxygen_saturation: 99 }
  ]
};

// Mock allergies
export const mockAllergies = {
  1: [
    { id: 1, allergen: 'Penicillin', reaction: 'Hives', severity: 'moderate' },
    { id: 2, allergen: 'Peanuts', reaction: 'Anaphylaxis', severity: 'severe' }
  ],
  2: [
    { id: 3, allergen: 'Sulfa drugs', reaction: 'Rash', severity: 'mild' }
  ],
  4: [
    { id: 4, allergen: 'Shellfish', reaction: 'Swelling', severity: 'moderate' }
  ]
};

// Mock medications
export const mockMedications = {
  1: [
    { id: 1, name: 'Lisinopril', dosage: '10mg daily', status: 'active', prescriber: 'Dr. Smith' },
    { id: 2, name: 'Metformin', dosage: '500mg twice daily', status: 'active', prescriber: 'Dr. Smith' }
  ],
  2: [
    { id: 3, name: 'Atorvastatin', dosage: '20mg daily', status: 'active', prescriber: 'Dr. Doe' }
  ],
  4: [
    { id: 4, name: 'Albuterol', dosage: '2 puffs as needed', status: 'active', prescriber: 'Dr. Johnson' }
  ]
};

// Mock queue metrics
export const getMockMetrics = () => {
  const queueItems = getQueueItems();
  const waitingPatients = queueItems.filter(p => p.status === 'waiting');
  const roomedPatients = queueItems.filter(p => p.status === 'roomed');
  const totalAppointments = mockAppointments.length;
  const totalCheckedIn = queueItems.length;

  return {
    total_waiting: waitingPatients.length,
    average_wait_time: waitingPatients.length > 0
      ? Math.round(waitingPatients.reduce((acc, p) => acc + (p.wait_time_minutes || 0), 0) / waitingPatients.length)
      : 0,
    longest_wait_time: waitingPatients.length > 0
      ? Math.max(...waitingPatients.map(p => p.wait_time_minutes || 0))
      : 0,
    total_in_treatment: roomedPatients.length,
    total_discharged_today: 2,
    provider_count: mockProviders.length,
    available_rooms: 12 - roomedPatients.length,
    total_rooms: 12,
    total_patients: totalAppointments,
    patients_checked_in: totalCheckedIn
  };
};

// Functions to manipulate mock data
export const addMockAppointment = (appointment: any) => {
  const patient = mockPatients.find(p => p.id === appointment.patient_id);
  const provider = mockProviders.find(p => p.id === appointment.provider_id);

  const newAppointment = {
    ...appointment,
    id: mockAppointments.length + 1,
    patient_name: patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown Patient',
    provider_name: provider ? `Dr. ${provider.first_name} ${provider.last_name}` : 'Unknown Provider',
    patient,
    provider,
    start: appointment.scheduled_time,
    end: addMinutes(new Date(appointment.scheduled_time), appointment.duration).toISOString(),
    status: 'booked',
    wait_time_minutes: 0,
    triage_priority: 'non-urgent',
    arrival_time: null,
    check_in_time: null,
    vital_signs_complete: false,
    estimated_wait: 0,
    age: patient ? new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear() : 0,
    gender: patient?.gender || 'unknown'
  };

  mockAppointments.push(newAppointment);
  return newAppointment;
};

export const updateMockAppointmentStatus = (id: number, status: string) => {
  const appointment = mockAppointments.find(apt => apt.id === id);
  if (appointment) {
    appointment.status = status;

    // Update related fields based on status
    if (status === 'arrived' || status === 'waiting') {
      appointment.arrival_time = new Date().toISOString();
      appointment.check_in_time = new Date().toISOString();
      appointment.wait_time_minutes = 0;
    } else if (status === 'roomed') {
      appointment.room_number = appointment.room_number || '3';
      appointment.room = appointment.room || 'Room 3';
    } else if (status === 'fulfilled') {
      appointment.wait_time_minutes = 0;
    }
  }
  return appointment;
};

export const updateMockAppointment = (id: number, data: any) => {
  const index = mockAppointments.findIndex(apt => apt.id === id);
  if (index !== -1) {
    const patient = mockPatients.find(p => p.id === data.patient_id);
    const provider = mockProviders.find(p => p.id === data.provider_id);

    mockAppointments[index] = {
      ...mockAppointments[index],
      ...data,
      patient_name: patient ? `${patient.first_name} ${patient.last_name}` : mockAppointments[index].patient_name,
      provider_name: provider ? `Dr. ${provider.first_name} ${provider.last_name}` : mockAppointments[index].provider_name,
      start: data.scheduled_time || mockAppointments[index].start,
      end: data.scheduled_time ? addMinutes(new Date(data.scheduled_time), data.duration || 30).toISOString() : mockAppointments[index].end,
      patient,
      provider
    };

    return mockAppointments[index];
  }
  return null;
};

export const deleteMockAppointment = (id: number) => {
  const index = mockAppointments.findIndex(apt => apt.id === id);
  if (index !== -1) {
    mockAppointments.splice(index, 1);
    return true;
  }
  return false;
};

export const getMockPatientById = (id: number) => {
  return mockPatients.find(p => p.id === id);
};

export const getAppointmentsByDateRange = (start: string, end: string) => {
  return mockAppointments.filter(apt => {
    const aptDate = new Date(apt.scheduled_time);
    const startDate = new Date(start);
    const endDate = new Date(end);
    return aptDate >= startDate && aptDate <= endDate;
  });
};

// Mock encounters data
export let mockEncounters = [
  {
    id: 1,
    patient_id: 1,
    patient_name: 'Alice Anderson',
    patient: mockPatients[0],
    provider_id: 1,
    provider_name: 'Dr. John Smith',
    appointment_id: 1,
    encounter_date: '2025-09-15',
    start_time: '09:00',
    end_time: '09:30',
    status: 'completed',
    chief_complaint: 'Flu-like symptoms',
    diagnosis: 'Viral upper respiratory infection',
    treatment_plan: 'Rest, fluids, symptomatic treatment',
    visit_type: 'urgent-care',
    room: 'Room 1',
    duration_minutes: 30,
    created_at: '2025-09-15T09:00:00Z',
    updated_at: '2025-09-15T09:30:00Z',
    vitals: {
      blood_pressure: '120/80',
      heart_rate: 72,
      temperature: 100.4,
      respiratory_rate: 18,
      oxygen_saturation: 98,
      weight: 150,
      height: '5\'6"',
      pain_scale: 3
    },
    notes: 'Patient presented with 2-day history of fever, cough, and fatigue. Physical exam unremarkable except for mild throat erythema.'
  },
  {
    id: 2,
    patient_id: 2,
    patient_name: 'Bob Brown',
    patient: mockPatients[1],
    provider_id: 2,
    provider_name: 'Dr. Jane Doe',
    appointment_id: 2,
    encounter_date: '2025-09-15',
    start_time: '10:00',
    end_time: '10:45',
    status: 'in-progress',
    chief_complaint: 'Ankle sprain',
    diagnosis: 'Lateral ankle sprain, Grade I',
    treatment_plan: 'RICE protocol, NSAIDs, follow-up in 1 week',
    visit_type: 'urgent-care',
    room: 'Room 2',
    duration_minutes: 45,
    created_at: '2025-09-15T10:00:00Z',
    updated_at: '2025-09-15T10:30:00Z',
    vitals: {
      blood_pressure: '130/85',
      heart_rate: 78,
      temperature: 98.6,
      respiratory_rate: 16,
      oxygen_saturation: 99,
      weight: 180,
      height: '5\'10"',
      pain_scale: 6
    },
    notes: 'Patient twisted ankle while jogging yesterday. Mild swelling and tenderness over lateral malleolus. X-ray negative for fracture.'
  },
  {
    id: 3,
    patient_id: 4,
    patient_name: 'David Evans',
    patient: mockPatients[3],
    provider_id: 3,
    provider_name: 'Dr. Robert Johnson',
    appointment_id: 4,
    encounter_date: '2025-09-14',
    start_time: '14:30',
    end_time: '15:00',
    status: 'completed',
    chief_complaint: 'Sore throat',
    diagnosis: 'Viral pharyngitis',
    treatment_plan: 'Supportive care, throat lozenges, return if worsening',
    visit_type: 'urgent-care',
    room: 'Room 4',
    duration_minutes: 30,
    created_at: '2025-09-14T14:30:00Z',
    updated_at: '2025-09-14T15:00:00Z',
    vitals: {
      blood_pressure: '125/82',
      heart_rate: 85,
      temperature: 99.2,
      respiratory_rate: 18,
      oxygen_saturation: 99,
      weight: 170,
      height: '5\'8"',
      pain_scale: 4
    },
    notes: 'Young adult with 3-day history of sore throat. Throat mildly erythematous, no exudate. Rapid strep negative.'
  },
  {
    id: 4,
    patient_id: 3,
    patient_name: 'Carol Davis',
    patient: mockPatients[2],
    provider_id: 1,
    provider_name: 'Dr. John Smith',
    appointment_id: null,
    encounter_date: '2025-09-13',
    start_time: '16:15',
    end_time: '17:00',
    status: 'completed',
    chief_complaint: 'Migraine headache',
    diagnosis: 'Migraine without aura',
    treatment_plan: 'NSAIDs, rest in dark room, follow-up with PCP',
    visit_type: 'urgent-care',
    room: 'Room 3',
    duration_minutes: 45,
    created_at: '2025-09-13T16:15:00Z',
    updated_at: '2025-09-13T17:00:00Z',
    vitals: {
      blood_pressure: '140/90',
      heart_rate: 88,
      temperature: 98.4,
      respiratory_rate: 20,
      oxygen_saturation: 98,
      weight: 145,
      height: '5\'4"',
      pain_scale: 8
    },
    notes: 'Patient with history of migraines presenting with severe throbbing headache. Neurological exam normal. Responded well to treatment.'
  },
  {
    id: 5,
    patient_id: 1,
    patient_name: 'Alice Anderson',
    patient: mockPatients[0],
    provider_id: 2,
    provider_name: 'Dr. Jane Doe',
    appointment_id: null,
    encounter_date: '2025-09-10',
    start_time: '11:30',
    end_time: '12:15',
    status: 'completed',
    chief_complaint: 'Cut on hand',
    diagnosis: 'Laceration, left hand',
    treatment_plan: 'Wound cleaning, sutures placed, tetanus update, wound care instructions',
    visit_type: 'urgent-care',
    room: 'Room 1',
    duration_minutes: 45,
    created_at: '2025-09-10T11:30:00Z',
    updated_at: '2025-09-10T12:15:00Z',
    vitals: {
      blood_pressure: '118/78',
      heart_rate: 70,
      temperature: 98.4,
      respiratory_rate: 16,
      oxygen_saturation: 99,
      weight: 148,
      height: '5\'6"',
      pain_scale: 5
    },
    notes: 'Patient cut hand on glass while cooking. 3cm laceration on left palm. Wound cleaned and sutured with 4-0 nylon. Tetanus up to date.'
  }
];

// Functions for encounters
export const getMockEncounters = (filters?: { status?: string; patient_id?: number; date_range?: { start: string; end: string } }) => {
  let filtered = [...mockEncounters];

  if (filters?.status && filters.status !== 'all') {
    filtered = filtered.filter(enc => enc.status === filters.status);
  }

  if (filters?.patient_id) {
    filtered = filtered.filter(enc => enc.patient_id === filters.patient_id);
  }

  if (filters?.date_range) {
    const startDate = new Date(filters.date_range.start);
    const endDate = new Date(filters.date_range.end);
    filtered = filtered.filter(enc => {
      const encDate = new Date(enc.encounter_date);
      return encDate >= startDate && encDate <= endDate;
    });
  }

  // Sort by date descending (most recent first)
  return filtered.sort((a, b) => new Date(b.encounter_date).getTime() - new Date(a.encounter_date).getTime());
};

export const addMockEncounter = (encounter: any) => {
  const patient = mockPatients.find(p => p.id === encounter.patient_id);
  const provider = mockProviders.find(p => p.id === encounter.provider_id);

  const newEncounter = {
    ...encounter,
    id: mockEncounters.length + 1,
    patient_name: patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown Patient',
    provider_name: provider ? `Dr. ${provider.first_name} ${provider.last_name}` : 'Unknown Provider',
    patient,
    provider: { ...provider, name: provider ? `${provider.first_name} ${provider.last_name}` : 'Unknown Provider' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  mockEncounters.push(newEncounter);
  return newEncounter;
};

export const updateMockEncounter = (id: number, data: any) => {
  const index = mockEncounters.findIndex(enc => enc.id === id);
  if (index !== -1) {
    mockEncounters[index] = {
      ...mockEncounters[index],
      ...data,
      updated_at: new Date().toISOString()
    };
    return mockEncounters[index];
  }
  return null;
};

export const getMockEncounterById = (id: number) => {
  return mockEncounters.find(enc => enc.id === id);
};