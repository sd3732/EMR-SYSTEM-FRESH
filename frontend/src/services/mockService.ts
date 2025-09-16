import {
  mockPatients,
  mockProviders,
  mockAppointments,
  getQueueItems,
  getMockMetrics,
  addMockAppointment,
  updateMockAppointmentStatus,
  updateMockAppointment,
  deleteMockAppointment,
  getAppointmentsByDateRange,
  mockVitals,
  mockAllergies,
  mockMedications,
  getMockEncounters,
  addMockEncounter,
  updateMockEncounter,
  getMockEncounterById
} from '../utils/mockDataStore';

class MockService {
  // Dashboard/Queue related
  getQueuePatients() {
    return Promise.resolve({ data: getQueueItems() });
  }

  getMetrics() {
    return Promise.resolve({ data: getMockMetrics() });
  }

  updateQueueStatus(id: string, status: string) {
    const updated = updateMockAppointmentStatus(parseInt(id), status);
    return Promise.resolve({ data: updated });
  }

  // Appointments
  getAppointments(params?: any) {
    let filtered = [...mockAppointments];

    if (params?.start && params?.end) {
      // Filter by date range
      filtered = getAppointmentsByDateRange(params.start, params.end);
    } else if (params?.start_date && params?.end_date) {
      // Alternative date format
      filtered = getAppointmentsByDateRange(params.start_date, params.end_date);
    }

    if (params?.patient_id) {
      filtered = filtered.filter(apt => apt.patient_id === parseInt(params.patient_id));
    }

    if (params?.provider_ids) {
      const providerIds = params.provider_ids.split(',').map((id: string) => parseInt(id));
      filtered = filtered.filter(apt => providerIds.includes(apt.provider_id));
    }

    return Promise.resolve({ data: filtered });
  }

  createAppointment(data: any) {
    const newAppointment = addMockAppointment(data);
    return Promise.resolve({ data: newAppointment });
  }

  updateAppointment(id: string, data: any) {
    const updated = updateMockAppointment(parseInt(id), data);
    if (updated) {
      return Promise.resolve({ data: updated });
    }
    return Promise.reject(new Error('Appointment not found'));
  }

  deleteAppointment(id: string) {
    const deleted = deleteMockAppointment(parseInt(id));
    if (deleted) {
      return Promise.resolve({ data: { success: true } });
    }
    return Promise.reject(new Error('Appointment not found'));
  }

  updateAppointmentStatus(id: string, status: string) {
    const updated = updateMockAppointmentStatus(parseInt(id), status);
    return Promise.resolve({ data: updated });
  }

  // Patients
  getPatients(search?: string) {
    let filtered = [...mockPatients];

    if (search) {
      filtered = mockPatients.filter(p =>
        p.first_name.toLowerCase().includes(search.toLowerCase()) ||
        p.last_name.toLowerCase().includes(search.toLowerCase()) ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.mrn.toLowerCase().includes(search.toLowerCase())
      );
    }

    return Promise.resolve({ data: filtered });
  }

  searchPatients(term: string) {
    const filtered = mockPatients.filter(p =>
      p.first_name.toLowerCase().includes(term.toLowerCase()) ||
      p.last_name.toLowerCase().includes(term.toLowerCase()) ||
      p.name.toLowerCase().includes(term.toLowerCase()) ||
      p.mrn.toLowerCase().includes(term.toLowerCase())
    );
    return Promise.resolve({ data: filtered });
  }

  getPatient(id: string) {
    const patient = mockPatients.find(p => p.id === parseInt(id));
    if (patient) {
      return Promise.resolve({
        data: {
          ...patient,
          vitals: mockVitals[parseInt(id)] || [],
          allergies: mockAllergies[parseInt(id)] || [],
          medications: mockMedications[parseInt(id)] || [],
          appointments: mockAppointments.filter(a => a.patient_id === parseInt(id))
        }
      });
    }
    return Promise.reject(new Error('Patient not found'));
  }

  // Providers
  getProviders() {
    return Promise.resolve({ data: mockProviders });
  }

  // Vitals
  getPatientVitals(patientId: string) {
    return Promise.resolve({ data: mockVitals[parseInt(patientId)] || [] });
  }

  // Encounters
  getEncounters(filters?: any) {
    const encounters = getMockEncounters(filters);
    return Promise.resolve({ data: encounters });
  }

  getEncounter(id: string) {
    const encounter = getMockEncounterById(parseInt(id));
    if (encounter) {
      return Promise.resolve({ data: encounter });
    }
    return Promise.reject(new Error('Encounter not found'));
  }

  createEncounter(data: any) {
    const encounter = addMockEncounter(data);
    return Promise.resolve({ data: encounter });
  }

  updateEncounter(id: string, data: any) {
    const encounter = updateMockEncounter(parseInt(id), data);
    if (encounter) {
      return Promise.resolve({ data: encounter });
    }
    return Promise.reject(new Error('Encounter not found'));
  }

  startEncounter(appointmentId: string) {
    const appointment = mockAppointments.find(a => a.id === parseInt(appointmentId));
    if (appointment) {
      appointment.status = 'with-provider';
      return Promise.resolve({
        data: {
          id: Date.now(),
          appointment_id: appointmentId,
          patient_id: appointment.patient_id,
          provider_id: appointment.provider_id,
          start_time: new Date().toISOString(),
          chief_complaint: appointment.chief_complaint,
          patient: appointment.patient,
          provider: mockProviders.find(p => p.id === appointment.provider_id)
        }
      });
    }
    return Promise.reject(new Error('Appointment not found'));
  }

  // Registration (for new walk-ins)
  registerPatient(data: any) {
    const newPatient = {
      id: mockPatients.length + 1,
      first_name: data.first_name,
      last_name: data.last_name,
      name: `${data.first_name} ${data.last_name}`,
      mrn: `MRN${String(mockPatients.length + 1).padStart(3, '0')}`,
      date_of_birth: data.date_of_birth,
      dob: data.date_of_birth,
      phone: data.phone,
      email: data.email || '',
      insurance: data.insurance || '',
      primary_provider: data.primary_provider || ''
    };

    mockPatients.push(newPatient);

    // If this is a walk-in, create an appointment
    if (data.is_walkin) {
      const appointment = {
        patient_id: newPatient.id,
        provider_id: data.provider_id || 1,
        scheduled_time: new Date().toISOString(),
        duration: 30,
        visit_type: 'walk-in',
        chief_complaint: data.chief_complaint || 'Walk-in visit',
        notes: data.notes || '',
        room: ''
      };

      addMockAppointment(appointment);
    }

    return Promise.resolve({ data: newPatient });
  }

  // Chart/Medical Records
  getPatientChart(patientId: string) {
    const patient = mockPatients.find(p => p.id === parseInt(patientId));
    if (patient) {
      return Promise.resolve({
        data: {
          patient,
          vitals: mockVitals[parseInt(patientId)] || [],
          allergies: mockAllergies[parseInt(patientId)] || [],
          medications: mockMedications[parseInt(patientId)] || [],
          appointments: mockAppointments.filter(a => a.patient_id === parseInt(patientId)),
          encounters: [], // Could be expanded later
          lab_results: [], // Could be expanded later
          immunizations: [] // Could be expanded later
        }
      });
    }
    return Promise.reject(new Error('Patient not found'));
  }
}

export const mockService = new MockService();