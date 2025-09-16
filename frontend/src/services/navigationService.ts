import { encounterService } from './appointment.service';

export class NavigationService {
  // From Schedule - Navigate to patient profile
  static viewPatientFromAppointment = (patientId: string | number) => {
    window.location.href = `/patients/${patientId}`;
  };

  // From Dashboard Queue - Start encounter with patient context
  static startEncounterFromQueue = (patient: any) => {
    const encounterId = patient.encounter_id || Date.now(); // Mock encounter ID for now
    window.location.href = `/encounter/${patient.patient_id}?appointment_id=${patient.id}&encounter_id=${encounterId}`;
  };

  // From Patient Profile - Start new encounter
  static startNewEncounter = (patientId: string | number) => {
    const encounterId = Date.now(); // Mock encounter ID
    window.location.href = `/encounter/${patientId}?encounter_id=${encounterId}&new=true`;
  };

  // From Patient Profile - Schedule new appointment
  static scheduleFromProfile = (patientId: string | number) => {
    window.location.href = `/schedule?patient_id=${patientId}`;
  };

  // From Encounter - Return to dashboard queue
  static returnToQueue = () => {
    window.location.href = '/';
  };

  // From Encounter - Navigate to patient profile
  static viewPatientFromEncounter = (patientId: string | number) => {
    window.location.href = `/patients/${patientId}`;
  };

  // From Schedule - Navigate to queue
  static viewQueueFromSchedule = () => {
    window.location.href = '/';
  };

  // Generic patient chart navigation
  static openPatientChart = (patientId: string | number) => {
    window.location.href = `/patients/${patientId}`;
  };

  // Navigation with URL state preservation
  static navigateWithState = (path: string, state?: Record<string, any>) => {
    const url = new URL(path, window.location.origin);
    if (state) {
      Object.entries(state).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
      });
    }
    window.location.href = url.toString();
  };

  // Extract URL parameters for context
  static getUrlParams = (): Record<string, string> => {
    const params = new URLSearchParams(window.location.search);
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  };

  // Check if navigation came from specific source
  static getNavigationContext = () => {
    const params = this.getUrlParams();
    return {
      appointmentId: params.appointment_id,
      encounterId: params.encounter_id,
      fromQueue: Boolean(params.from_queue),
      fromSchedule: Boolean(params.from_schedule),
      isNew: Boolean(params.new),
      patientId: params.patient_id
    };
  };

  // Create encounter and navigate (integrates with backend when available)
  static async createAndStartEncounter(patientId: string | number, appointmentId?: string | number) {
    try {
      // If we have an appointment ID, start encounter from appointment
      if (appointmentId) {
        const response = await encounterService.startEncounter(appointmentId.toString());
        const encounterId = response.data.id;
        window.location.href = `/encounter/${patientId}?encounter_id=${encounterId}&appointment_id=${appointmentId}`;
      } else {
        // Create new encounter
        const encounterId = Date.now(); // Mock for now - replace with API call
        window.location.href = `/encounter/${patientId}?encounter_id=${encounterId}&new=true`;
      }
    } catch (error) {
      console.error('Failed to start encounter:', error);
      // Fallback to mock navigation
      const encounterId = Date.now();
      window.location.href = `/encounter/${patientId}?encounter_id=${encounterId}&appointment_id=${appointmentId || ''}`;
    }
  }

  // Navigation breadcrumbs helper
  static getBreadcrumbs = (currentPath: string) => {
    const pathSegments = currentPath.split('/').filter(Boolean);
    const breadcrumbs: Array<{ label: string; path: string }> = [
      { label: 'Dashboard', path: '/' }
    ];

    if (pathSegments[0] === 'patients') {
      breadcrumbs.push({ label: 'Patients', path: '/patients' });
      if (pathSegments[1]) {
        breadcrumbs.push({ label: 'Patient Profile', path: `/patients/${pathSegments[1]}` });
      }
    } else if (pathSegments[0] === 'schedule') {
      breadcrumbs.push({ label: 'Schedule', path: '/schedule' });
    } else if (pathSegments[0] === 'encounter') {
      breadcrumbs.push({ label: 'Encounter', path: currentPath });
    }

    return breadcrumbs;
  };

  // Quick actions for common workflows
  static quickActions = {
    // Schedule → Patient → Encounter flow
    scheduleToPatientToEncounter: (patientId: string | number) => {
      window.location.href = `/patients/${patientId}?from=schedule`;
    },

    // Queue → Encounter → Back to Queue flow
    queueToEncounterToQueue: (patient: any) => {
      const encounterId = Date.now();
      window.location.href = `/encounter/${patient.patient_id}?encounter_id=${encounterId}&appointment_id=${patient.id}&return_to=queue`;
    },

    // Patient → Schedule → Back to Patient flow
    patientToScheduleToPatient: (patientId: string | number) => {
      window.location.href = `/schedule?patient_id=${patientId}&return_to=patient`;
    }
  };
}

// Convenience exports
export const navigate = NavigationService;
export default NavigationService;