import { useState } from 'react';
import { Search, Plus, FileText, Calendar, Briefcase, Send } from 'lucide-react';
import { useEncounterStore } from '../../../stores/useEncounterStore';
import { useNavigate } from 'react-router-dom';
import { DischargeInstructions } from '../DischargeInstructions';

export const AssessmentStage = () => {
  const navigate = useNavigate();
  const { currentEncounter, updateAssessment, completeEncounter, setStage } = useEncounterStore();
  const [workExcuse, setWorkExcuse] = useState(false);
  const [followUpDays, setFollowUpDays] = useState('');

  const commonPlans = {
    uri: 'Rest, hydration, symptomatic care. Return if symptoms worsen or persist beyond 7-10 days.',
    uti: 'Complete antibiotic course. Increase fluid intake. Follow up if symptoms persist after 48 hours.',
    sprain: 'RICE protocol. NSAIDs as directed. Follow up in 1 week if not improving.',
    laceration: 'Keep wound clean and dry. Watch for signs of infection. Follow up for suture removal in 7-10 days.',
  };

  const dischargeInstructions = {
    general: [
      'Return to ED for: severe shortness of breath, chest pain, high fever >103°F, or worsening symptoms',
      'Follow up with primary care provider as directed',
      'Take medications as prescribed',
      'Rest and stay hydrated'
    ],
    covid: [
      'Isolate for at least 5 days',
      'Wear a mask around others for 10 days',
      'Monitor symptoms and seek care if difficulty breathing',
      'Stay hydrated and rest'
    ]
  };

  const handleComplete = async () => {
    await completeEncounter();
    navigate(`/patients/${currentEncounter?.patient_id}`);
  };

  return (
    <div className="p-6 max-w-5xl">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Assessment & Plan</h2>

      {/* Diagnoses Section */}
      <div className="mb-6">
        <h3 className="font-semibold text-gray-900 mb-3">Diagnoses</h3>
        <div className="bg-white border rounded-lg p-4">
          {currentEncounter?.assessment.diagnoses.map((dx, idx) => (
            <div key={idx} className="flex items-center justify-between p-2 bg-blue-50 rounded mb-2">
              <div>
                <span className="font-medium">{dx.description}</span>
                <span className="text-sm text-gray-600 ml-2">({dx.code})</span>
              </div>
              {dx.primary && (
                <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded">Primary</span>
              )}
            </div>
          ))}
          {currentEncounter?.assessment.diagnoses.length === 0 && (
            <p className="text-gray-500 text-sm">No diagnoses added. Use the panel on the right to add diagnoses.</p>
          )}
        </div>
      </div>

      {/* Treatment Plan */}
      <div className="mb-6">
        <h3 className="font-semibold text-gray-900 mb-3">Treatment Plan</h3>
        <textarea
          value={currentEncounter?.assessment.plan || ''}
          onChange={(e) => updateAssessment({ plan: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
          rows={4}
          placeholder="Document treatment plan..."
        />
        <div className="flex gap-2 mt-2">
          {Object.entries(commonPlans).map(([key, plan]) => (
            <button
              key={key}
              onClick={() => updateAssessment({ plan })}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              {key.toUpperCase()} Template
            </button>
          ))}
        </div>
      </div>

      {/* Orders Section */}
      <div className="mb-6">
        <h3 className="font-semibold text-gray-900 mb-3">Orders</h3>
        <div className="bg-white border rounded-lg p-4">
          {currentEncounter?.assessment.orders.map((order, idx) => (
            <div key={idx} className="flex items-center justify-between p-2 bg-green-50 rounded mb-2">
              <span className="text-sm">{order.description}</span>
              <span className={`px-2 py-1 text-xs rounded ${
                order.priority === 'stat' ? 'bg-red-100 text-red-700' :
                order.priority === 'urgent' ? 'bg-yellow-100 text-yellow-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {order.priority}
              </span>
            </div>
          ))}
          {currentEncounter?.assessment.orders.length === 0 && (
            <p className="text-gray-500 text-sm">No orders placed. Use the panel on the right to add orders.</p>
          )}
        </div>
      </div>

      {/* Follow-up Instructions */}
      <div className="mb-6">
        <h3 className="font-semibold text-gray-900 mb-3">Follow-up Instructions</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Calendar size={16} className="inline mr-1" />
              Follow-up Timeframe
            </label>
            <select
              value={followUpDays}
              onChange={(e) => {
                setFollowUpDays(e.target.value);
                updateAssessment({
                  follow_up: `Follow up with primary care provider in ${e.target.value}`
                });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Select...</option>
              <option value="1-2 days">1-2 days</option>
              <option value="3-5 days">3-5 days</option>
              <option value="1 week">1 week</option>
              <option value="2 weeks">2 weeks</option>
              <option value="1 month">1 month</option>
              <option value="as needed">As needed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Send size={16} className="inline mr-1" />
              Referrals
            </label>
            <select className="w-full px-3 py-2 border border-gray-300 rounded-lg">
              <option value="">None needed</option>
              <option value="cardiology">Cardiology</option>
              <option value="orthopedics">Orthopedics</option>
              <option value="neurology">Neurology</option>
              <option value="gastroenterology">Gastroenterology</option>
              <option value="pulmonology">Pulmonology</option>
            </select>
          </div>
        </div>
      </div>

      {/* Patient Education */}
      <div className="mb-6">
        <h3 className="font-semibold text-gray-900 mb-3">Patient Education</h3>
        <textarea
          value={currentEncounter?.assessment.patient_education || ''}
          onChange={(e) => updateAssessment({ patient_education: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
          rows={3}
          placeholder="Document patient education provided..."
        />
      </div>

      {/* Work/School Excuse */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
          <input
            type="checkbox"
            id="workExcuse"
            checked={workExcuse}
            onChange={(e) => {
              setWorkExcuse(e.target.checked);
              updateAssessment({
                work_excuse: {
                  needed: e.target.checked,
                  start_date: new Date().toISOString().split('T')[0],
                  end_date: '',
                  restrictions: ''
                }
              });
            }}
            className="rounded text-primary"
          />
          <label htmlFor="workExcuse" className="font-semibold text-gray-900">
            <Briefcase size={16} className="inline mr-1" />
            Work/School Excuse Needed
          </label>
        </div>

        {workExcuse && (
          <div className="ml-6 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  defaultValue={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Restrictions</label>
              <input
                type="text"
                placeholder="e.g., Light duty only, No lifting >10 lbs"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>
        )}
      </div>

      {/* Discharge Instructions Generator */}
      <div className="mb-6">
        <DischargeInstructions
          diagnosis={currentEncounter?.assessment.diagnoses[0]?.description || ''}
          medications={currentEncounter?.assessment.orders?.filter(o => o.type === 'medication') || []}
          onSave={(instructions) => {
            updateAssessment({ discharge_instructions: instructions });
          }}
        />
      </div>

      {/* Complete Encounter */}
      <div className="flex justify-between items-center p-4 bg-green-50 rounded-lg">
        <div>
          <p className="font-semibold text-green-900">Ready to Complete Encounter?</p>
          <p className="text-sm text-green-700">Make sure all sections are documented.</p>
        </div>
        <button
          onClick={handleComplete}
          className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
        >
          Complete & Sign
        </button>
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button
          onClick={() => setStage('pe')}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          Previous: Physical Exam
        </button>
      </div>
    </div>
  );
};