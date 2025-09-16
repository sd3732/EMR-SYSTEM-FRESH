import { useState } from 'react';
import { FileText, Printer, Download, AlertCircle } from 'lucide-react';

interface DischargeTemplate {
  diagnosis: string;
  instructions: string[];
  medications: string[];
  followUp: string;
  returnPrecautions: string[];
}

export const DischargeInstructions = ({
  diagnosis,
  medications = [],
  onSave
}: {
  diagnosis: string;
  medications: any[];
  onSave: (instructions: any) => void;
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [customInstructions, setCustomInstructions] = useState('');
  const [includeWorkNote, setIncludeWorkNote] = useState(false);
  const [workDays, setWorkDays] = useState('1');

  const templates: Record<string, DischargeTemplate> = {
    uri: {
      diagnosis: 'Upper Respiratory Infection',
      instructions: [
        'Rest and get plenty of sleep',
        'Drink lots of fluids (water, warm tea, soup)',
        'Use throat lozenges or gargle with warm salt water for throat pain',
        'Take acetaminophen or ibuprofen for fever and pain as directed',
        'Cover your mouth when coughing or sneezing',
        'Wash your hands frequently'
      ],
      medications: [
        'Take all medications as prescribed',
        'Complete the full course of antibiotics even if feeling better'
      ],
      followUp: 'Follow up with your primary care doctor in 3-5 days if not improving',
      returnPrecautions: [
        'Difficulty breathing or shortness of breath',
        'Chest pain',
        'High fever over 103°F that doesn\'t respond to medication',
        'Severe headache or neck stiffness',
        'Confusion or difficulty staying awake',
        'Symptoms worsening after initial improvement'
      ]
    },
    uti: {
      diagnosis: 'Urinary Tract Infection',
      instructions: [
        'Drink plenty of water to help flush bacteria from your urinary system',
        'Avoid coffee, alcohol, and spicy foods which can irritate your bladder',
        'Use a heating pad on your abdomen to minimize discomfort',
        'Urinate frequently and completely empty your bladder',
        'Wipe from front to back after using the bathroom'
      ],
      medications: [
        'Take antibiotics exactly as prescribed',
        'Complete the entire course even if symptoms improve',
        'You may take phenazopyridine (Pyridium) for urinary pain if prescribed'
      ],
      followUp: 'Follow up with your primary care doctor in 2-3 days if symptoms persist',
      returnPrecautions: [
        'Fever over 101°F',
        'Back or side pain',
        'Nausea and vomiting',
        'Blood in urine',
        'Symptoms not improving after 48 hours of antibiotics'
      ]
    },
    sprain: {
      diagnosis: 'Sprain/Strain',
      instructions: [
        'Rest: Avoid activities that cause pain',
        'Ice: Apply ice for 20 minutes every 2-3 hours for first 48 hours',
        'Compression: Use elastic bandage if provided',
        'Elevation: Keep injured area raised above heart level when possible',
        'Take pain medication as directed',
        'Gradually return to activity as pain improves'
      ],
      medications: [
        'Take ibuprofen or naproxen as directed for pain and swelling',
        'Do not exceed maximum daily dose'
      ],
      followUp: 'Follow up with orthopedics or primary care in 1 week if not improving',
      returnPrecautions: [
        'Severe pain not controlled by medication',
        'Numbness or tingling',
        'Skin color changes (blue or gray)',
        'Inability to bear weight or use the injured area',
        'Signs of infection (increasing redness, warmth, fever)'
      ]
    }
  };

  const generateInstructions = () => {
    const template = templates[selectedTemplate];
    if (!template) return;

    const instructions = {
      diagnosis: template.diagnosis,
      homeInstructions: template.instructions,
      medicationInstructions: [
        ...template.medications,
        ...medications.map(m => `${m.name}: ${m.instructions}`)
      ],
      followUp: template.followUp,
      returnPrecautions: template.returnPrecautions,
      customInstructions: customInstructions,
      workNote: includeWorkNote ? {
        days: workDays,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + parseInt(workDays) * 24 * 60 * 60 * 1000).toISOString()
      } : null
    };

    onSave(instructions);
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <FileText className="text-primary" size={20} />
        Discharge Instructions
      </h3>

      {/* Template Selection */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-700 mb-2">Select Template</label>
        <div className="grid grid-cols-3 gap-2">
          {Object.keys(templates).map((key) => (
            <button
              key={key}
              onClick={() => setSelectedTemplate(key)}
              className={`p-2 text-sm rounded-lg capitalize transition-colors ${
                selectedTemplate === key
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      {/* Template Preview */}
      {selectedTemplate && templates[selectedTemplate] && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <h4 className="font-medium text-sm mb-2">{templates[selectedTemplate].diagnosis}</h4>

          <div className="space-y-2">
            <div>
              <p className="text-xs font-medium text-gray-700">Home Care:</p>
              <ul className="text-xs text-gray-600 ml-4 list-disc">
                {templates[selectedTemplate].instructions.slice(0, 3).map((inst, idx) => (
                  <li key={idx}>{inst}</li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-xs font-medium text-gray-700">Return if:</p>
              <ul className="text-xs text-gray-600 ml-4 list-disc">
                {templates[selectedTemplate].returnPrecautions.slice(0, 2).map((prec, idx) => (
                  <li key={idx}>{prec}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Custom Instructions */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-700 mb-1">Additional Instructions</label>
        <textarea
          value={customInstructions}
          onChange={(e) => setCustomInstructions(e.target.value)}
          placeholder="Add any specific instructions..."
          className="w-full px-2 py-1 border rounded text-sm"
          rows={3}
        />
      </div>

      {/* Work Note */}
      <div className="mb-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={includeWorkNote}
            onChange={(e) => setIncludeWorkNote(e.target.checked)}
            className="rounded text-primary"
          />
          Include work/school excuse
        </label>
        {includeWorkNote && (
          <div className="mt-2 ml-6">
            <label className="block text-xs font-medium text-gray-700 mb-1">Days off:</label>
            <select
              value={workDays}
              onChange={(e) => setWorkDays(e.target.value)}
              className="px-2 py-1 border rounded text-sm"
            >
              <option value="1">1 day</option>
              <option value="2">2 days</option>
              <option value="3">3 days</option>
              <option value="5">5 days</option>
              <option value="7">1 week</option>
            </select>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={generateInstructions}
          disabled={!selectedTemplate}
          className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm font-medium"
        >
          Generate Instructions
        </button>
        <button className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          <Printer size={16} />
        </button>
        <button className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50">
          <Download size={16} />
        </button>
      </div>
    </div>
  );
};