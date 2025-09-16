import { AlertCircle, Pill, Calendar, Activity, FileText, Shield } from 'lucide-react';
import { usePatientProfileStore } from '../../../stores/usePatientProfileStore';
import { format } from 'date-fns';

export const OverviewTab = () => {
  const { currentPatient, allergies, medications, problems, vitals, encounters, preventiveCare } = usePatientProfileStore();

  // Get most recent vitals
  const recentVitals = vitals[0] || null;
  const activeProblems = problems?.filter(p => p.status === 'active') || [];
  const activeMedications = medications?.filter(m => m.is_active) || [];
  const recentEncounters = encounters?.slice(0, 3) || [];
  const duePreventiveCare = preventiveCare?.filter(p => p.status === 'due' || p.status === 'overdue') || [];

  return (
    <div className="p-6 space-y-6">
      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Recent Vitals */}
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Recent Vitals</h3>
            <Activity className="text-gray-400" size={20} />
          </div>
          {recentVitals ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">BP:</span>
                <span className="font-medium">120/80 mmHg</span>
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
                <span className="text-gray-600">Weight:</span>
                <span className="font-medium">175 lbs</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No recent vitals recorded</p>
          )}
        </div>

        {/* Active Problems */}
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Active Problems</h3>
            <FileText className="text-gray-400" size={20} />
          </div>
          {activeProblems.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {activeProblems.slice(0, 4).map((problem) => (
                <li key={problem.id} className="flex items-start gap-2">
                  <span className="text-gray-400 mt-1">•</span>
                  <div>
                    <span className="font-medium">{problem.problem_name}</span>
                    <span className="text-gray-500 text-xs block">{problem.icd10_code}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">No active problems</p>
          )}
        </div>

        {/* Care Gaps */}
        <div className="bg-white rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Care Gaps</h3>
            <Shield className="text-gray-400" size={20} />
          </div>
          {duePreventiveCare.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {duePreventiveCare.slice(0, 4).map((item) => (
                <li key={item.id} className="flex items-start gap-2">
                  <span className={`inline-block w-2 h-2 rounded-full mt-1.5 ${
                    item.status === 'overdue' ? 'bg-red-500' : 'bg-yellow-500'
                  }`}></span>
                  <div>
                    <span className="font-medium">{item.name}</span>
                    <span className="text-gray-500 text-xs block">
                      {item.status === 'overdue' ? 'Overdue' : `Due: ${item.due_date}`}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-500">No care gaps identified</p>
          )}
        </div>
      </div>

      {/* Allergies Alert */}
      {allergies.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-red-600 mt-0.5" size={20} />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 mb-2">Allergies</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {allergies.map((allergy) => (
                  <div key={allergy.id} className="text-sm">
                    <span className="font-medium text-red-800">{allergy.allergen}</span>
                    <span className="text-red-600"> - {allergy.reaction}</span>
                    <span className={`ml-2 px-2 py-0.5 rounded text-xs font-medium ${
                      allergy.severity === 'severe' ? 'bg-red-200 text-red-800' :
                      allergy.severity === 'moderate' ? 'bg-orange-200 text-orange-800' :
                      'bg-yellow-200 text-yellow-800'
                    }`}>
                      {allergy.severity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Current Medications and Recent Visits */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Current Medications */}
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Current Medications</h3>
              <Pill className="text-gray-400" size={20} />
            </div>
          </div>
          <div className="p-4">
            {activeMedications.length > 0 ? (
              <ul className="space-y-3">
                {activeMedications.slice(0, 5).map((med) => (
                  <li key={med.id} className="text-sm">
                    <div className="font-medium">{med.medication_name}</div>
                    <div className="text-gray-600">
                      {med.dosage} - {med.frequency}
                    </div>
                    <div className="text-gray-500 text-xs">
                      Prescribed by {med.prescriber}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No current medications</p>
            )}
          </div>
        </div>

        {/* Recent Encounters */}
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Recent Visits</h3>
              <Calendar className="text-gray-400" size={20} />
            </div>
          </div>
          <div className="p-4">
            {recentEncounters.length > 0 ? (
              <ul className="space-y-3">
                {recentEncounters.map((encounter) => (
                  <li key={encounter.id} className="text-sm">
                    <div className="flex justify-between">
                      <span className="font-medium">{encounter.chief_complaint}</span>
                      <span className="text-gray-500">
                        {format(new Date(encounter.encounter_date), 'MM/dd/yy')}
                      </span>
                    </div>
                    <div className="text-gray-600">
                      {encounter.provider_name} - {encounter.encounter_type}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">No recent visits</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};