import { useState } from 'react';
import { MapPin, Zap, TrendingUp, Clock, Calendar, AlertCircle, Plus } from 'lucide-react';
import { useEncounterStore } from '../../../stores/useEncounterStore';

export const HPIStage = () => {
  const { currentEncounter, updateHPI, setStage } = useEncounterStore();
  const [narrative, setNarrative] = useState(currentEncounter?.hpi.narrative || '');

  // HPI Elements (OLDCARTS)
  const elements = {
    onset: currentEncounter?.hpi.duration || '',
    location: currentEncounter?.hpi.location || '',
    duration: currentEncounter?.hpi.duration || '',
    character: currentEncounter?.hpi.quality || '',
    alleviating: currentEncounter?.hpi.modifying_factors || '',
    radiation: '',
    timing: currentEncounter?.hpi.timing || '',
    severity: currentEncounter?.hpi.severity || 5,
  };

  const associatedSymptoms = [
    'Fever', 'Chills', 'Nausea', 'Vomiting', 'Diarrhea', 'Fatigue',
    'Headache', 'Dizziness', 'Shortness of breath', 'Chest pain',
    'Abdominal pain', 'Back pain', 'Joint pain', 'Rash'
  ];

  const severityDescriptions = [
    { value: 0, label: 'No pain' },
    { value: 2, label: 'Mild' },
    { value: 4, label: 'Moderate' },
    { value: 6, label: 'Severe' },
    { value: 8, label: 'Very severe' },
    { value: 10, label: 'Worst possible' },
  ];

  const generateNarrative = () => {
    const chief = currentEncounter?.review.chief_complaint || 'symptoms';
    const onset = elements.onset || 'recently';
    const location = elements.location ? `in the ${elements.location}` : '';
    const character = elements.character ? `, described as ${elements.character}` : '';
    const severity = `with a severity of ${elements.severity}/10`;

    const generated = `Patient presents with ${chief} that began ${onset} ${location}${character}, ${severity}. `;
    setNarrative(generated);
    updateHPI({ narrative: generated });
  };

  return (
    <div className="p-6 max-w-4xl">
      <h2 className="text-xl font-bold text-gray-900 mb-6">History of Present Illness</h2>

      {/* Quick Narrative Builder */}
      <div className="mb-6 p-4 bg-blue-50 rounded-lg">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-blue-900">HPI Narrative</h3>
          <button
            onClick={generateNarrative}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Generate from Elements
          </button>
        </div>
        <textarea
          value={narrative}
          onChange={(e) => {
            setNarrative(e.target.value);
            updateHPI({ narrative: e.target.value });
          }}
          className="w-full px-3 py-2 border border-blue-200 rounded-lg focus:ring-2 focus:ring-primary"
          rows={4}
          placeholder="Document the history of present illness..."
        />
      </div>

      {/* HPI Elements Grid */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* Onset/Duration */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Clock size={16} className="inline mr-1" />
            Onset/Duration
          </label>
          <input
            type="text"
            value={elements.onset}
            onChange={(e) => updateHPI({ duration: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
            placeholder="e.g., 3 days ago, gradual onset"
          />
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <MapPin size={16} className="inline mr-1" />
            Location
          </label>
          <input
            type="text"
            value={elements.location}
            onChange={(e) => updateHPI({ location: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
            placeholder="e.g., chest, abdomen, head"
          />
        </div>

        {/* Character/Quality */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Zap size={16} className="inline mr-1" />
            Character/Quality
          </label>
          <select
            value={elements.character}
            onChange={(e) => updateHPI({ quality: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
          >
            <option value="">Select...</option>
            <option value="sharp">Sharp</option>
            <option value="dull">Dull</option>
            <option value="burning">Burning</option>
            <option value="throbbing">Throbbing</option>
            <option value="cramping">Cramping</option>
            <option value="aching">Aching</option>
            <option value="pressure">Pressure</option>
            <option value="stabbing">Stabbing</option>
          </select>
        </div>

        {/* Timing */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Calendar size={16} className="inline mr-1" />
            Timing
          </label>
          <select
            value={elements.timing}
            onChange={(e) => updateHPI({ timing: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
          >
            <option value="">Select...</option>
            <option value="constant">Constant</option>
            <option value="intermittent">Intermittent</option>
            <option value="waxing_waning">Waxing and waning</option>
            <option value="worse_morning">Worse in morning</option>
            <option value="worse_evening">Worse in evening</option>
            <option value="worse_night">Worse at night</option>
            <option value="with_activity">With activity</option>
            <option value="at_rest">At rest</option>
          </select>
        </div>

        {/* Context */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Context (What brings it on?)
          </label>
          <input
            type="text"
            value={currentEncounter?.hpi.context || ''}
            onChange={(e) => updateHPI({ context: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
            placeholder="e.g., with exertion, after eating"
          />
        </div>

        {/* Modifying Factors */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Alleviating/Aggravating Factors
          </label>
          <input
            type="text"
            value={elements.alleviating}
            onChange={(e) => updateHPI({ modifying_factors: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
            placeholder="e.g., rest helps, ibuprofen helps"
          />
        </div>
      </div>

      {/* Severity Scale */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <TrendingUp size={16} className="inline mr-1" />
          Severity (Pain Scale)
        </label>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">0</span>
          <input
            type="range"
            min="0"
            max="10"
            value={elements.severity}
            onChange={(e) => updateHPI({ severity: parseInt(e.target.value) })}
            className="flex-1"
          />
          <span className="text-sm text-gray-600">10</span>
          <span className="ml-3 px-3 py-1 bg-primary text-white rounded-lg font-bold min-w-[3rem] text-center">
            {elements.severity}
          </span>
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-500">
          {severityDescriptions.map((desc) => (
            <span key={desc.value} className="text-center">
              {desc.label}
            </span>
          ))}
        </div>
      </div>

      {/* Associated Symptoms */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <Plus size={16} className="inline mr-1" />
          Associated Symptoms
        </label>
        <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
          {associatedSymptoms.map((symptom) => {
            const isSelected = currentEncounter?.hpi.associated_symptoms?.includes(symptom);
            return (
              <button
                key={symptom}
                onClick={() => {
                  const current = currentEncounter?.hpi.associated_symptoms || [];
                  const updated = isSelected
                    ? current.filter(s => s !== symptom)
                    : [...current, symptom];
                  updateHPI({ associated_symptoms: updated });
                }}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  isSelected
                    ? 'bg-primary text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {symptom}
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => setStage('review')}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          Previous: Review
        </button>
        <button
          onClick={() => setStage('ros')}
          className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
        >
          Next: ROS
        </button>
      </div>
    </div>
  );
};