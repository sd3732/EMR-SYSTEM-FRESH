import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Save, X, CheckCircle, ArrowLeft, User } from 'lucide-react';
import { PatientContextPanel } from './PatientContextPanel';
import { OrdersDiagnosesPanel } from './OrdersDiagnosesPanel';
import { StageNavigation } from './StageNavigation';
import { ReviewStage } from './stages/ReviewStage';
import { HPIStage } from './stages/HPIStage';
import { ROSStage } from './stages/ROSStage';
import { PEStage } from './stages/PEStage';
import { AssessmentStage } from './stages/AssessmentStage';
import { useEncounterStore } from '../../stores/useEncounterStore';
import { usePatientProfileStore } from '../../stores/usePatientProfileStore';
import { NavigationService } from '../../services/navigationService';
import { patientService } from '../../services/appointment.service';
import toast from 'react-hot-toast';

const EncounterLayout = () => {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [patientContext, setPatientContext] = useState<any>(null);
  const [navigationContext, setNavigationContext] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const {
    currentStage,
    currentEncounter,
    initializeEncounter,
    saveEncounter,
    completeEncounter,
    isSaving,
    lastSaved
  } = useEncounterStore();
  const { loadPatientProfile } = usePatientProfileStore();

  useEffect(() => {
    if (patientId) {
      loadPatientAndContext();
    }
  }, [patientId]);

  const loadPatientAndContext = async () => {
    setLoading(true);
    try {
      // Get navigation context from URL
      const navContext = NavigationService.getNavigationContext();
      setNavigationContext(navContext);

      // Load comprehensive patient data
      const response = await patientService.getPatient(patientId!);
      const patient = response.data;

      setPatientContext({
        ...patient,
        currentAllergies: patient.allergies || [],
        currentMedications: patient.medications || [],
        activeProblems: patient.problems || [],
        recentVitals: patient.vitals?.[0] || null,
        appointmentId: navContext.appointmentId,
        encounterId: navContext.encounterId,
        isNewEncounter: navContext.isNew
      });

      // Initialize encounter with context
      loadPatientProfile(parseInt(patientId!));
      initializeEncounter(parseInt(patientId!));

      toast.success(`Encounter loaded for ${patient.first_name} ${patient.last_name}`);
    } catch (error) {
      console.error('Failed to load patient context:', error);
      toast.error('Failed to load patient information');
    } finally {
      setLoading(false);
    }
  };

  const handleReturnToSource = () => {
    if (navigationContext?.return_to === 'queue') {
      NavigationService.returnToQueue();
    } else if (navigationContext?.return_to === 'patient') {
      NavigationService.viewPatientFromEncounter(patientId!);
    } else {
      // Default return to dashboard
      NavigationService.returnToQueue();
    }
  };

  const handleViewPatientProfile = () => {
    NavigationService.viewPatientFromEncounter(patientId!);
  };

  const renderStage = () => {
    switch (currentStage) {
      case 'review':
        return <ReviewStage />;
      case 'hpi':
        return <HPIStage />;
      case 'ros':
        return <ROSStage />;
      case 'pe':
        return <PEStage />;
      case 'assessment':
        return <AssessmentStage />;
      default:
        return <ReviewStage />;
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading patient encounter...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Enhanced Header with Patient Context */}
      <div className="bg-white border-b px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Navigation breadcrumb */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleReturnToSource}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 text-sm"
                title="Return to previous page"
              >
                <ArrowLeft size={16} />
                {navigationContext?.return_to === 'queue' ? 'Queue' : 'Dashboard'}
              </button>
              <span className="text-gray-400">/</span>
              <span className="text-sm font-medium">Encounter</span>
            </div>

            {/* Patient info */}
            {patientContext && (
              <div className="flex items-center gap-3 ml-4 pl-4 border-l">
                <div>
                  <h1 className="text-lg font-semibold">
                    {patientContext.first_name} {patientContext.last_name}
                  </h1>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>MRN: {patientContext.mrn}</span>
                    <span>DOB: {patientContext.date_of_birth}</span>
                    {navigationContext?.appointmentId && (
                      <span>Appt: {navigationContext.appointmentId}</span>
                    )}
                    {patientContext.isNewEncounter && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded">New Encounter</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Last saved indicator */}
            {lastSaved && (
              <span className="text-xs text-gray-500 ml-auto">
                Last saved: {lastSaved.toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* View Patient Profile */}
            <button
              onClick={handleViewPatientProfile}
              className="flex items-center gap-2 px-3 py-2 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              title="View Patient Profile"
            >
              <User size={16} />
              Profile
            </button>

            <button
              onClick={() => saveEncounter()}
              disabled={isSaving}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
            >
              <Save size={16} />
              {isSaving ? 'Saving...' : 'Save'}
            </button>

            <button
              onClick={() => completeEncounter()}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <CheckCircle size={16} />
              Complete & Return
            </button>

            <button
              onClick={handleReturnToSource}
              className="p-2 text-gray-500 hover:text-gray-700"
              title="Return to previous page"
            >
              <X size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Stage Navigation */}
      <StageNavigation />

      {/* Three Column Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Patient Context */}
        <div className="w-80 flex-shrink-0">
          <PatientContextPanel />
        </div>

        {/* Center: Stage Content */}
        <div className="flex-1 overflow-y-auto bg-white">
          {renderStage()}
        </div>

        {/* Right: Orders & Diagnoses */}
        <div className="w-80 flex-shrink-0">
          <OrdersDiagnosesPanel />
        </div>
      </div>
    </div>
  );
};

export default EncounterLayout;