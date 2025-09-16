import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { PatientHeader } from '../components/Patient/PatientHeader';
import { PatientTabs } from '../components/Patient/PatientTabs';
import { OverviewTab } from '../components/Patient/tabs/OverviewTab';
import { PatientInfoTab } from '../components/Patient/tabs/PatientInfoTab';
import { VitalsTrendsTab } from '../components/Patient/tabs/VitalsTrendsTab';
import { VisitsTab } from '../components/Patient/tabs/VisitsTab';
import { AllergiesTab } from '../components/Patient/tabs/AllergiesTab';
import { MedicationsTab } from '../components/Patient/tabs/MedicationsTab';
import { PreventiveCareTab } from '../components/Patient/tabs/PreventiveCareTab';
import { usePatientProfileStore } from '../stores/usePatientProfileStore';

const PatientProfile = () => {
  const { patientId } = useParams();
  const { activeTab, isLoading, loadPatientProfile } = usePatientProfileStore();

  useEffect(() => {
    if (patientId) {
      loadPatientProfile(parseInt(patientId));
    }
  }, [patientId, loadPatientProfile]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading patient profile...</p>
        </div>
      </div>
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab />;
      case 'info':
        return <PatientInfoTab />;
      case 'vitals':
        return <VitalsTrendsTab />;
      case 'visits':
        return <VisitsTab />;
      case 'allergies':
        return <AllergiesTab />;
      case 'medications':
        return <MedicationsTab />;
      case 'preventive':
        return <PreventiveCareTab />;
      case 'discharge':
        return <div className="p-6">Discharge Summaries tab - Coming in Phase 4</div>;
      case 'history':
        return <div className="p-6">Medical History tab - Coming in Phase 4</div>;
      case 'orders':
        return <div className="p-6">Orders tab - Coming in Phase 4</div>;
      case 'labs':
        return <div className="p-6">Labs tab - Coming in Phase 4</div>;
      default:
        return <OverviewTab />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <PatientHeader />
      <PatientTabs />
      <div className="max-w-7xl mx-auto">
        {renderTabContent()}
      </div>
    </div>
  );
};

export default PatientProfile;