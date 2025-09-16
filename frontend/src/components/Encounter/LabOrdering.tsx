import { useState } from 'react';
import { FlaskConical, Plus, Clock, AlertCircle } from 'lucide-react';
import labOrderService from '../../services/labOrders.service';
import toast from 'react-hot-toast';

export const LabOrdering = ({ patientId, onOrderLab }: { patientId: number; onOrderLab: (lab: any) => void }) => {
  const [selectedTests, setSelectedTests] = useState<string[]>([]);
  const [priority, setPriority] = useState<'routine' | 'urgent' | 'stat'>('routine');
  const [clinicalIndication, setClinicalIndication] = useState('');
  const [showPanels, setShowPanels] = useState(true);

  const commonPanels = labOrderService.getCommonPanels();

  const urgentCareTests = [
    { id: 'strep', name: 'Rapid Strep Test', tat: '15 min' },
    { id: 'flu', name: 'Influenza A/B', tat: '15 min' },
    { id: 'covid', name: 'COVID-19 Rapid', tat: '15 min' },
    { id: 'ua', name: 'Urinalysis', tat: '10 min' },
    { id: 'upt', name: 'Urine Pregnancy Test', tat: '5 min' },
    { id: 'glucose', name: 'Fingerstick Glucose', tat: '2 min' },
    { id: 'mono', name: 'Mono Test', tat: '10 min' }
  ];

  const handleSelectPanel = (panel: any) => {
    setSelectedTests([...selectedTests, ...panel.tests]);
    toast.success(`Added ${panel.name} panel`);
  };

  const handleSelectTest = (test: any) => {
    if (selectedTests.includes(test.name)) {
      setSelectedTests(selectedTests.filter(t => t !== test.name));
    } else {
      setSelectedTests([...selectedTests, test.name]);
    }
  };

  const handleOrderLabs = async () => {
    if (selectedTests.length === 0) {
      toast.error('Please select at least one test');
      return;
    }

    const order = {
      patient_id: patientId,
      provider_id: 1, // Would get from current user
      tests: selectedTests.map(test => ({
        test_name: test,
        loinc_code: '', // Would be populated from test database
      })),
      priority,
      clinical_indication: clinicalIndication,
      order_date: new Date().toISOString()
    };

    try {
      const result = await labOrderService.createLabOrder(order);
      onOrderLab(result);
      toast.success('Lab order placed successfully');
      resetForm();
    } catch (error) {
      toast.error('Failed to place lab order');
    }
  };

  const resetForm = () => {
    setSelectedTests([]);
    setPriority('routine');
    setClinicalIndication('');
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <FlaskConical className="text-primary" size={20} />
        Order Labs
      </h3>

      {/* Priority Selection */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-700 mb-2">Priority</label>
        <div className="flex gap-2">
          {(['routine', 'urgent', 'stat'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p)}
              className={`px-3 py-1 text-sm rounded-lg capitalize transition-colors ${
                priority === p
                  ? p === 'stat' ? 'bg-red-100 text-red-700' :
                    p === 'urgent' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setShowPanels(true)}
          className={`px-3 py-1 text-sm rounded ${
            showPanels ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700'
          }`}
        >
          Common Panels
        </button>
        <button
          onClick={() => setShowPanels(false)}
          className={`px-3 py-1 text-sm rounded ${
            !showPanels ? 'bg-primary text-white' : 'bg-gray-100 text-gray-700'
          }`}
        >
          Rapid Tests
        </button>
      </div>

      {/* Test Selection */}
      {showPanels ? (
        <div className="grid grid-cols-2 gap-2 mb-4">
          {commonPanels.map((panel) => (
            <button
              key={panel.id}
              onClick={() => handleSelectPanel(panel)}
              className="p-2 text-left border rounded hover:bg-gray-50"
            >
              <p className="font-medium text-sm">{panel.name}</p>
              <p className="text-xs text-gray-600">{panel.tests.length} tests</p>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {urgentCareTests.map((test) => {
            const isSelected = selectedTests.includes(test.name);
            return (
              <button
                key={test.id}
                onClick={() => handleSelectTest(test)}
                className={`w-full p-2 text-left border rounded flex items-center justify-between ${
                  isSelected ? 'bg-blue-50 border-blue-300' : 'hover:bg-gray-50'
                }`}
              >
                <div>
                  <p className="font-medium text-sm">{test.name}</p>
                  <p className="text-xs text-gray-600 flex items-center gap-1">
                    <Clock size={10} />
                    Results in {test.tat}
                  </p>
                </div>
                {isSelected && <Plus className="text-primary rotate-45" size={16} />}
              </button>
            );
          })}
        </div>
      )}

      {/* Selected Tests */}
      {selectedTests.length > 0 && (
        <div className="mb-4 p-2 bg-blue-50 rounded">
          <p className="text-xs font-medium text-blue-900 mb-1">Selected Tests ({selectedTests.length})</p>
          <div className="flex flex-wrap gap-1">
            {selectedTests.map((test) => (
              <span key={test} className="px-2 py-1 bg-white text-xs rounded">
                {test}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Clinical Indication */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-gray-700 mb-1">Clinical Indication</label>
        <input
          type="text"
          value={clinicalIndication}
          onChange={(e) => setClinicalIndication(e.target.value)}
          placeholder="e.g., Rule out strep throat"
          className="w-full px-2 py-1 border rounded text-sm"
        />
      </div>

      {/* Order Button */}
      <button
        onClick={handleOrderLabs}
        disabled={selectedTests.length === 0}
        className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
      >
        Place Lab Order ({selectedTests.length} tests)
      </button>
    </div>
  );
};