import {
  Home, FileText, Activity, Calendar, AlertTriangle,
  Pill, Shield, FileCheck, Clock, FlaskConical, Clipboard
} from 'lucide-react';
import { usePatientProfileStore } from '../../stores/usePatientProfileStore';

export const PatientTabs = () => {
  const { activeTab, setActiveTab } = usePatientProfileStore();

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Home },
    { id: 'info', label: 'Patient Info', icon: FileText },
    { id: 'vitals', label: 'Vitals Trends', icon: Activity },
    { id: 'visits', label: 'Visits', icon: Calendar },
    { id: 'allergies', label: 'Allergies', icon: AlertTriangle },
    { id: 'medications', label: 'Medications', icon: Pill },
    { id: 'preventive', label: 'Preventive Care', icon: Shield },
    { id: 'discharge', label: 'Discharge Summaries', icon: FileCheck },
    { id: 'history', label: 'Medical History', icon: Clock },
    { id: 'orders', label: 'Orders', icon: Clipboard },
    { id: 'labs', label: 'Labs', icon: FlaskConical },
  ];

  return (
    <div className="bg-white border-b sticky top-0 z-10">
      <div className="px-6">
        <nav className="flex space-x-6 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
};