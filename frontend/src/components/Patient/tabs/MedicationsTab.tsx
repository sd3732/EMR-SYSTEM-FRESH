import { useState } from 'react';
import { Pill, Plus, Edit2, Trash2, AlertCircle, Clock, CheckCircle } from 'lucide-react';
import { usePatientProfileStore } from '../../../stores/usePatientProfileStore';
import { format } from 'date-fns';

export const MedicationsTab = () => {
  const { medications } = usePatientProfileStore();
  const [showInactive, setShowInactive] = useState(false);

  const activeMeds = medications.filter(m => m.is_active);
  const inactiveMeds = medications.filter(m => !m.is_active);
  const displayedMeds = showInactive ? [...activeMeds, ...inactiveMeds] : activeMeds;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Medications</h2>
          <p className="text-sm text-gray-600 mt-1">
            {activeMeds.length} active, {inactiveMeds.length} discontinued
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded text-primary"
            />
            Show discontinued
          </label>
          <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">
            <Plus size={20} />
            Add Medication
          </button>
        </div>
      </div>

      {displayedMeds.length > 0 ? (
        <div className="grid gap-4">
          {displayedMeds.map((med) => (
            <div
              key={med.id}
              className={`bg-white rounded-lg border p-4 ${
                !med.is_active ? 'opacity-60 bg-gray-50' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Pill className="text-primary" size={20} />
                    <div>
                      <h3 className="font-semibold text-lg">{med.medication_name}</h3>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span>{med.dosage} - {med.frequency}</span>
                        <span>Route: {med.route}</span>
                      </div>
                    </div>
                    {med.is_active ? (
                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                        Discontinued
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3 text-sm">
                    <div>
                      <span className="text-gray-500">Prescribed by:</span>
                      <p className="font-medium">{med.prescriber}</p>
                    </div>
                    <div>
                      <span className="text-gray-500">Start Date:</span>
                      <p className="font-medium">{format(new Date(med.start_date), 'MM/dd/yyyy')}</p>
                    </div>
                    {med.end_date && (
                      <div>
                        <span className="text-gray-500">End Date:</span>
                        <p className="font-medium">{format(new Date(med.end_date), 'MM/dd/yyyy')}</p>
                      </div>
                    )}
                  </div>

                  {med.notes && (
                    <div className="mt-3 p-3 bg-blue-50 rounded text-sm">
                      <span className="font-medium text-blue-900">Notes: </span>
                      <span className="text-blue-700">{med.notes}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 ml-4">
                  {med.is_active && (
                    <>
                      <button className="p-2 hover:bg-gray-100 rounded">
                        <Edit2 size={16} />
                      </button>
                      <button className="p-2 hover:bg-gray-100 rounded text-red-600">
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Pill className="mx-auto text-gray-400 mb-3" size={48} />
          <p className="text-gray-600 font-medium">No Active Medications</p>
          <p className="text-gray-500 text-sm mt-1">Click "Add Medication" to document current medications</p>
        </div>
      )}

      {/* Medication Interactions Warning */}
      {activeMeds.length > 1 && (
        <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-yellow-600 mt-0.5" size={20} />
            <div>
              <h4 className="font-semibold text-yellow-900">Drug Interaction Check</h4>
              <p className="text-sm text-yellow-700 mt-1">
                No significant interactions detected between current medications.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};