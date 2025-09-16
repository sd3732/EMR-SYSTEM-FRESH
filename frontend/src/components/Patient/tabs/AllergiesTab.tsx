import { AlertCircle, Plus, Edit2, Trash2 } from 'lucide-react';
import { usePatientProfileStore } from '../../../stores/usePatientProfileStore';
import { format } from 'date-fns';

export const AllergiesTab = () => {
  const { allergies } = usePatientProfileStore();

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'severe': return 'bg-red-100 text-red-800 border-red-200';
      case 'moderate': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'mild': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'drug': return '💊';
      case 'food': return '🍽️';
      case 'environmental': return '🌿';
      default: return '⚠️';
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Allergies & Adverse Reactions</h2>
        <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">
          <Plus size={20} />
          Add Allergy
        </button>
      </div>

      {allergies.length > 0 ? (
        <div className="grid gap-4">
          {allergies.map((allergy) => (
            <div
              key={allergy.id}
              className={`rounded-lg border-2 p-4 ${getSeverityColor(allergy.severity)}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-2xl">{getTypeIcon(allergy.type)}</span>
                    <div>
                      <h3 className="font-semibold text-lg">{allergy.allergen}</h3>
                      <span className="text-sm capitalize">{allergy.type} Allergy</span>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                      allergy.severity === 'severe' ? 'bg-red-200' :
                      allergy.severity === 'moderate' ? 'bg-orange-200' :
                      'bg-yellow-200'
                    }`}>
                      {allergy.severity}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                    <div>
                      <span className="text-sm font-medium">Reaction:</span>
                      <p className="text-sm mt-1">{allergy.reaction}</p>
                    </div>
                    <div>
                      <span className="text-sm font-medium">Onset Date:</span>
                      <p className="text-sm mt-1">
                        {format(new Date(allergy.onset_date), 'MMMM d, yyyy')}
                      </p>
                    </div>
                    {allergy.notes && (
                      <div className="md:col-span-2">
                        <span className="text-sm font-medium">Notes:</span>
                        <p className="text-sm mt-1">{allergy.notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 ml-4">
                  <button className="p-2 hover:bg-white/50 rounded">
                    <Edit2 size={16} />
                  </button>
                  <button className="p-2 hover:bg-white/50 rounded">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <AlertCircle className="mx-auto text-gray-400 mb-3" size={48} />
          <p className="text-gray-600 font-medium">No Known Allergies</p>
          <p className="text-gray-500 text-sm mt-1">Click "Add Allergy" to document patient allergies</p>
        </div>
      )}
    </div>
  );
};