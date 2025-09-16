import { useState } from 'react';
import { Activity, Heart, Stethoscope, Eye, Brain, User } from 'lucide-react';
import { useEncounterStore } from '../../../stores/useEncounterStore';

export const PEStage = () => {
  const { currentEncounter, updatePE, setStage } = useEncounterStore();
  const [vitalsEntered, setVitalsEntered] = useState(false);

  const examSystems = [
    {
      id: 'general',
      name: 'General',
      icon: User,
      normalFindings: 'Alert and oriented, no acute distress, well-appearing',
      abnormalOptions: ['Ill-appearing', 'Lethargic', 'Anxious', 'Diaphoretic']
    },
    {
      id: 'heent',
      name: 'HEENT',
      icon: Eye,
      normalFindings: 'NCAT, PERRL, TMs clear, oropharynx clear',
      abnormalOptions: ['Conjunctival injection', 'Pharyngeal erythema', 'Lymphadenopathy', 'Sinus tenderness']
    },
    {
      id: 'neck',
      name: 'Neck',
      icon: User,
      normalFindings: 'Supple, no lymphadenopathy, no thyromegaly',
      abnormalOptions: ['Lymphadenopathy', 'Neck stiffness', 'JVD', 'Thyromegaly']
    },
    {
      id: 'respiratory',
      name: 'Respiratory',
      icon: Stethoscope,
      normalFindings: 'Clear to auscultation bilaterally, no wheezes/rales/rhonchi',
      abnormalOptions: ['Wheezes', 'Rales', 'Rhonchi', 'Decreased breath sounds', 'Tachypnea']
    },
    {
      id: 'cardiovascular',
      name: 'Cardiovascular',
      icon: Heart,
      normalFindings: 'RRR, no murmurs/rubs/gallops, 2+ pulses',
      abnormalOptions: ['Tachycardia', 'Bradycardia', 'Irregular rhythm', 'Murmur', 'Edema']
    },
    {
      id: 'abdomen',
      name: 'Abdomen',
      icon: User,
      normalFindings: 'Soft, non-tender, non-distended, normal bowel sounds',
      abnormalOptions: ['Tenderness', 'Distension', 'Guarding', 'Rebound', 'Masses']
    },
    {
      id: 'musculoskeletal',
      name: 'Musculoskeletal',
      icon: User,
      normalFindings: 'Full ROM, no swelling or deformity, normal strength',
      abnormalOptions: ['Limited ROM', 'Joint effusion', 'Tenderness', 'Weakness', 'Deformity']
    },
    {
      id: 'skin',
      name: 'Skin',
      icon: User,
      normalFindings: 'Warm, dry, intact, no rashes or lesions',
      abnormalOptions: ['Rash', 'Erythema', 'Lesions', 'Diaphoresis', 'Pallor']
    },
    {
      id: 'neurologic',
      name: 'Neurologic',
      icon: Brain,
      normalFindings: 'Alert, oriented x3, CN II-XII intact, normal strength and sensation',
      abnormalOptions: ['Altered mental status', 'Focal weakness', 'Sensory deficit', 'Abnormal reflexes']
    }
  ];

  const handleVitalsUpdate = (field: string, value: any) => {
    updatePE({
      vital_signs: {
        ...currentEncounter?.pe.vital_signs,
        [field]: value
      } as any
    });
    setVitalsEntered(true);
  };

  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Physical Examination</h2>

      {/* Vital Signs */}
      <div className="bg-blue-50 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-blue-900 mb-4 flex items-center gap-2">
          <Activity size={20} />
          Vital Signs
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">BP (mmHg)</label>
            <div className="flex gap-1">
              <input
                type="number"
                placeholder="120"
                value={currentEncounter?.pe.vital_signs?.bp_systolic || ''}
                onChange={(e) => handleVitalsUpdate('bp_systolic', parseInt(e.target.value))}
                className="w-20 px-2 py-1 border rounded"
              />
              <span className="self-center">/</span>
              <input
                type="number"
                placeholder="80"
                value={currentEncounter?.pe.vital_signs?.bp_diastolic || ''}
                onChange={(e) => handleVitalsUpdate('bp_diastolic', parseInt(e.target.value))}
                className="w-20 px-2 py-1 border rounded"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">HR (bpm)</label>
            <input
              type="number"
              placeholder="72"
              value={currentEncounter?.pe.vital_signs?.heart_rate || ''}
              onChange={(e) => handleVitalsUpdate('heart_rate', parseInt(e.target.value))}
              className="w-full px-2 py-1 border rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Temp (°F)</label>
            <input
              type="number"
              step="0.1"
              placeholder="98.6"
              value={currentEncounter?.pe.vital_signs?.temperature || ''}
              onChange={(e) => handleVitalsUpdate('temperature', parseFloat(e.target.value))}
              className="w-full px-2 py-1 border rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">RR (bpm)</label>
            <input
              type="number"
              placeholder="16"
              value={currentEncounter?.pe.vital_signs?.respiratory_rate || ''}
              onChange={(e) => handleVitalsUpdate('respiratory_rate', parseInt(e.target.value))}
              className="w-full px-2 py-1 border rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">O₂ Sat (%)</label>
            <input
              type="number"
              placeholder="98"
              value={currentEncounter?.pe.vital_signs?.oxygen_saturation || ''}
              onChange={(e) => handleVitalsUpdate('oxygen_saturation', parseInt(e.target.value))}
              className="w-full px-2 py-1 border rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Weight (lbs)</label>
            <input
              type="number"
              placeholder="175"
              value={currentEncounter?.pe.vital_signs?.weight || ''}
              onChange={(e) => handleVitalsUpdate('weight', parseInt(e.target.value))}
              className="w-full px-2 py-1 border rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Height (in)</label>
            <input
              type="number"
              placeholder="70"
              value={currentEncounter?.pe.vital_signs?.height || ''}
              onChange={(e) => handleVitalsUpdate('height', parseInt(e.target.value))}
              className="w-full px-2 py-1 border rounded"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pain (0-10)</label>
            <input
              type="number"
              min="0"
              max="10"
              placeholder="0"
              value={currentEncounter?.pe.vital_signs?.pain_scale || ''}
              onChange={(e) => handleVitalsUpdate('pain_scale', parseInt(e.target.value))}
              className="w-full px-2 py-1 border rounded"
            />
          </div>
        </div>
      </div>

      {/* System Examinations */}
      <div className="space-y-3">
        {examSystems.map((system) => {
          const Icon = system.icon;
          const currentValue = (currentEncounter?.pe?.[system.id as keyof typeof currentEncounter.pe] as string) || '';
          const isNormal = currentValue === system.normalFindings || currentValue === 'Normal' || currentValue === '';

          return (
            <div key={system.id} className="bg-white border rounded-lg p-4">
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Icon size={18} className="text-gray-600" />
                  <h3 className="font-semibold">{system.name}</h3>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => updatePE({ [system.id]: system.normalFindings })}
                    className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                      isNormal
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-green-50'
                    }`}
                  >
                    Normal
                  </button>
                  <button
                    onClick={() => updatePE({ [system.id]: 'Abnormal - ' })}
                    className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                      !isNormal && currentValue
                        ? 'bg-red-100 text-red-700'
                        : 'bg-gray-100 text-gray-600 hover:bg-red-50'
                    }`}
                  >
                    Abnormal
                  </button>
                </div>
              </div>

              {/* Quick Abnormal Options */}
              {!isNormal && (
                <div className="mb-2">
                  <div className="flex flex-wrap gap-1">
                    {system.abnormalOptions.map((option) => (
                      <button
                        key={option}
                        onClick={() => {
                          const current = currentValue || 'Abnormal - ';
                          updatePE({ [system.id]: current.includes(option) ? current : `${current} ${option},` });
                        }}
                        className="px-2 py-1 text-xs bg-red-50 text-red-700 rounded hover:bg-red-100"
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Findings Text */}
              <textarea
                value={currentValue || ''}
                onChange={(e) => updatePE({ [system.id]: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded focus:ring-1 focus:ring-primary"
                rows={2}
                placeholder={isNormal ? system.normalFindings : 'Document findings...'}
              />
            </div>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button
          onClick={() => setStage('ros')}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          Previous: ROS
        </button>
        <button
          onClick={() => setStage('assessment')}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
        >
          Next: Assessment & Plan
        </button>
      </div>
    </div>
  );
};