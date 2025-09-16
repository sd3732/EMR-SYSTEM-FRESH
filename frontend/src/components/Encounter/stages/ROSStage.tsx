import { CheckCircle, XCircle, MinusCircle } from 'lucide-react';
import { useEncounterStore } from '../../../stores/useEncounterStore';

export const ROSStage = () => {
  const { currentEncounter, updateROS, setStage } = useEncounterStore();

  const systems = [
    {
      id: 'constitutional',
      name: 'Constitutional',
      symptoms: ['Fever', 'Chills', 'Weight loss', 'Weight gain', 'Fatigue', 'Night sweats']
    },
    {
      id: 'eyes',
      name: 'Eyes',
      symptoms: ['Vision changes', 'Eye pain', 'Discharge', 'Redness', 'Photophobia']
    },
    {
      id: 'ears_nose_throat',
      name: 'Ears, Nose, Throat',
      symptoms: ['Hearing loss', 'Ear pain', 'Nasal congestion', 'Sore throat', 'Sinus pressure']
    },
    {
      id: 'cardiovascular',
      name: 'Cardiovascular',
      symptoms: ['Chest pain', 'Palpitations', 'Shortness of breath', 'Edema', 'Orthopnea']
    },
    {
      id: 'respiratory',
      name: 'Respiratory',
      symptoms: ['Cough', 'Wheezing', 'Dyspnea', 'Hemoptysis', 'Pleuritic pain']
    },
    {
      id: 'gastrointestinal',
      name: 'Gastrointestinal',
      symptoms: ['Nausea', 'Vomiting', 'Diarrhea', 'Constipation', 'Abdominal pain', 'Blood in stool']
    },
    {
      id: 'genitourinary',
      name: 'Genitourinary',
      symptoms: ['Dysuria', 'Frequency', 'Urgency', 'Hematuria', 'Incontinence']
    },
    {
      id: 'musculoskeletal',
      name: 'Musculoskeletal',
      symptoms: ['Joint pain', 'Joint swelling', 'Back pain', 'Muscle weakness', 'Stiffness']
    },
    {
      id: 'integumentary',
      name: 'Integumentary/Skin',
      symptoms: ['Rash', 'Itching', 'Lesions', 'Hair loss', 'Nail changes']
    },
    {
      id: 'neurological',
      name: 'Neurological',
      symptoms: ['Headache', 'Dizziness', 'Syncope', 'Seizures', 'Numbness', 'Weakness']
    },
    {
      id: 'psychiatric',
      name: 'Psychiatric',
      symptoms: ['Depression', 'Anxiety', 'Insomnia', 'Mood changes', 'Hallucinations']
    },
    {
      id: 'endocrine',
      name: 'Endocrine',
      symptoms: ['Heat/cold intolerance', 'Excessive thirst', 'Excessive hunger', 'Polyuria']
    },
    {
      id: 'hematologic',
      name: 'Hematologic/Lymphatic',
      symptoms: ['Easy bruising', 'Bleeding', 'Lymph node swelling', 'Anemia symptoms']
    },
    {
      id: 'allergic',
      name: 'Allergic/Immunologic',
      symptoms: ['Seasonal allergies', 'Food allergies', 'Hives', 'Frequent infections']
    }
  ];

  const setSystemStatus = (systemId: string, status: string) => {
    updateROS({ [systemId]: status });
  };

  const markAllNegative = () => {
    const allNegative = systems.reduce((acc, system) => {
      acc[system.id] = 'Negative';
      return acc;
    }, {} as any);
    updateROS(allNegative);
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Review of Systems</h2>
        <button
          onClick={markAllNegative}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          Mark All Negative
        </button>
      </div>

      <div className="grid gap-4">
        {systems.map((system) => {
          const currentValue = currentEncounter?.ros?.[system.id as keyof typeof currentEncounter.ros] || '';

          return (
            <div key={system.id} className="bg-white border rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-gray-900">{system.name}</h3>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSystemStatus(system.id, 'Negative')}
                    className={`p-1.5 rounded transition-colors ${
                      currentValue === 'Negative'
                        ? 'bg-green-100 text-green-600'
                        : 'bg-gray-100 text-gray-400 hover:text-green-600'
                    }`}
                    title="Negative"
                  >
                    <CheckCircle size={18} />
                  </button>
                  <button
                    onClick={() => setSystemStatus(system.id, 'Positive')}
                    className={`p-1.5 rounded transition-colors ${
                      currentValue?.includes('Positive')
                        ? 'bg-red-100 text-red-600'
                        : 'bg-gray-100 text-gray-400 hover:text-red-600'
                    }`}
                    title="Positive"
                  >
                    <XCircle size={18} />
                  </button>
                  <button
                    onClick={() => setSystemStatus(system.id, 'Not assessed')}
                    className={`p-1.5 rounded transition-colors ${
                      currentValue === 'Not assessed'
                        ? 'bg-gray-300 text-gray-600'
                        : 'bg-gray-100 text-gray-400 hover:text-gray-600'
                    }`}
                    title="Not assessed"
                  >
                    <MinusCircle size={18} />
                  </button>
                </div>
              </div>

              {/* Symptom Checkboxes */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mb-3">
                {system.symptoms.map((symptom) => (
                  <label key={symptom} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={currentValue?.includes(symptom)}
                      onChange={(e) => {
                        const currentSymptoms = currentValue?.includes('Positive for')
                          ? currentValue
                          : 'Positive for ';
                        if (e.target.checked) {
                          setSystemStatus(system.id, currentSymptoms + symptom + ', ');
                        } else {
                          setSystemStatus(
                            system.id,
                            currentSymptoms.replace(symptom + ', ', '')
                          );
                        }
                      }}
                      className="rounded text-primary"
                    />
                    <span className="text-gray-700">{symptom}</span>
                  </label>
                ))}
              </div>

              {/* Additional Notes */}
              <input
                type="text"
                value={currentValue || ''}
                onChange={(e) => setSystemStatus(system.id, e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-primary"
                placeholder="Additional notes..."
              />
            </div>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button
          onClick={() => setStage('hpi')}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          Previous: HPI
        </button>
        <button
          onClick={() => setStage('pe')}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
        >
          Next: Physical Exam
        </button>
      </div>
    </div>
  );
};