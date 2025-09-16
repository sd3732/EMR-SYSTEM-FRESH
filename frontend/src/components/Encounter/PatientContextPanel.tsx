import { useState } from 'react';
import { AlertCircle, Pill, Stethoscope, Shield, Activity, Clock, FileText } from 'lucide-react';
import { usePatientProfileStore } from '../../stores/usePatientProfileStore';

export const PatientContextPanel = () => {
  const { currentPatient, allergies, medications, problems, vitals } = usePatientProfileStore();
  const [activeTab, setActiveTab] = useState('problems');

  const tabs = [
    { id: 'problems', label: 'Problems', icon: FileText },
    { id: 'allergies', label: 'Allergies', icon: AlertCircle },
    { id: 'meds', label: 'Meds', icon: Pill },
    { id: 'vaccines', label: 'Vaccines', icon: Shield },
    { id: 'vitals', label: 'Vitals', icon: Activity },
    { id: 'history', label: 'History', icon: Clock },
    { id: 'quality', label: 'Quality', icon: Stethoscope },
  ];

  if (!currentPatient) return null;

  return (
    <div className="h-full bg-white border-r flex flex-col">
      {/* Patient Header */}
      <div className="p-4 border-b bg-gray-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
            {currentPatient.first_name[0]}{currentPatient.last_name[0]}
          </div>
          <div>
            <p className="font-semibold text-sm">{currentPatient.first_name} {currentPatient.last_name}</p>
            <p className="text-xs text-gray-600">MRN: {currentPatient.mrn} | Age: 45</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap border-b">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1 px-3 py-2 text-xs font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-primary border-b-2 border-primary'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'problems' && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-700 uppercase mb-2">Active Problems</h3>
            {problems?.filter(p => p.status === 'active').map((problem) => (
              <div key={problem.id} className="text-sm p-2 bg-gray-50 rounded">
                <p className="font-medium">{problem.problem_name}</p>
                <p className="text-xs text-gray-600">{problem.icd10_code}</p>
              </div>
            )) || <p className="text-sm text-gray-500">No active problems</p>}
          </div>
        )}

        {activeTab === 'allergies' && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-700 uppercase mb-2">Allergies</h3>
            {allergies?.map((allergy) => (
              <div key={allergy.id} className={`text-sm p-2 rounded ${
                allergy.severity === 'severe' ? 'bg-red-50 border border-red-200' : 'bg-yellow-50 border border-yellow-200'
              }`}>
                <p className="font-medium">{allergy.allergen}</p>
                <p className="text-xs">{allergy.reaction} ({allergy.severity})</p>
              </div>
            )) || <p className="text-sm text-gray-500">NKDA</p>}
          </div>
        )}

        {activeTab === 'meds' && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-700 uppercase mb-2">Current Medications</h3>
            {medications?.filter(m => m.is_active).map((med) => (
              <div key={med.id} className="text-sm p-2 bg-blue-50 rounded">
                <p className="font-medium">{med.medication_name}</p>
                <p className="text-xs text-gray-600">{med.dosage} - {med.frequency}</p>
              </div>
            )) || <p className="text-sm text-gray-500">No current medications</p>}
          </div>
        )}

        {activeTab === 'vitals' && (
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-gray-700 uppercase mb-2">Today's Vitals</h3>
            <div className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">BP:</span>
                <span className="font-medium">120/80</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">HR:</span>
                <span className="font-medium">72 bpm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Temp:</span>
                <span className="font-medium">98.6°F</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">O₂:</span>
                <span className="font-medium">98%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};