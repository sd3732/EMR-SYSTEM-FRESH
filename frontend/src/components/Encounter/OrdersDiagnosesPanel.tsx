import { useState } from 'react';
import { Plus, Search, Clock, CheckCircle, Package, FileText } from 'lucide-react';
import { useEncounterStore } from '../../stores/useEncounterStore';
import { MedicationPrescribing } from './MedicationPrescribing';
import { LabOrdering } from './LabOrdering';

export const OrdersDiagnosesPanel = () => {
  const [activeTab, setActiveTab] = useState('diagnoses');
  const { currentEncounter, updateAssessment } = useEncounterStore();

  const commonDiagnoses = [
    { code: 'J06.9', description: 'Acute upper respiratory infection' },
    { code: 'N39.0', description: 'Urinary tract infection' },
    { code: 'R50.9', description: 'Fever, unspecified' },
    { code: 'R05', description: 'Cough' },
    { code: 'M79.3', description: 'Myalgia' },
  ];

  const commonOrders = {
    labs: ['CBC', 'BMP', 'Urinalysis', 'Rapid Strep', 'Rapid Flu', 'COVID-19 PCR'],
    imaging: ['Chest X-ray', 'Abdominal X-ray', 'Ankle X-ray'],
    medications: ['Amoxicillin 500mg', 'Ibuprofen 600mg', 'Prednisone', 'Albuterol inhaler'],
  };

  return (
    <div className="h-full bg-white border-l flex flex-col">
      {/* Header */}
      <div className="p-4 border-b bg-gray-50">
        <h2 className="font-semibold text-sm">Clinical Support</h2>
      </div>

      {/* Tabs */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('diagnoses')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'diagnoses'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Diagnoses
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'orders'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Orders
        </button>
        <button
          onClick={() => setActiveTab('medications')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'medications'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Medications
        </button>
        <button
          onClick={() => setActiveTab('labs')}
          className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
            activeTab === 'labs'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Labs
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'diagnoses' && (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search ICD-10..."
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
              />
            </div>

            {/* Selected Diagnoses */}
            {currentEncounter?.assessment.diagnoses.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-gray-700 uppercase mb-2">Selected</h3>
                {currentEncounter.assessment.diagnoses.map((dx, idx) => (
                  <div key={idx} className="p-2 bg-blue-50 rounded mb-2 text-sm">
                    <p className="font-medium">{dx.description}</p>
                    <p className="text-xs text-gray-600">{dx.code}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Common Diagnoses */}
            <div>
              <h3 className="text-xs font-semibold text-gray-700 uppercase mb-2">Common</h3>
              {commonDiagnoses.map((dx) => (
                <button
                  key={dx.code}
                  onClick={() => {
                    updateAssessment({
                      diagnoses: [
                        ...(currentEncounter?.assessment.diagnoses || []),
                        { ...dx, primary: false }
                      ]
                    });
                  }}
                  className="w-full text-left p-2 hover:bg-gray-50 rounded text-sm"
                >
                  <p className="font-medium">{dx.description}</p>
                  <p className="text-xs text-gray-600">{dx.code}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="space-y-4">
            {/* Quick Order Sets */}
            <div>
              <h3 className="text-xs font-semibold text-gray-700 uppercase mb-2">Quick Orders</h3>

              {/* Labs */}
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-600 mb-1">Labs</p>
                <div className="flex flex-wrap gap-1">
                  {commonOrders.labs.map((lab) => (
                    <button
                      key={lab}
                      className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded hover:bg-green-200"
                    >
                      {lab}
                    </button>
                  ))}
                </div>
              </div>

              {/* Imaging */}
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-600 mb-1">Imaging</p>
                <div className="flex flex-wrap gap-1">
                  {commonOrders.imaging.map((img) => (
                    <button
                      key={img}
                      className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded hover:bg-purple-200"
                    >
                      {img}
                    </button>
                  ))}
                </div>
              </div>

              {/* Medications */}
              <div>
                <p className="text-xs font-medium text-gray-600 mb-1">Medications</p>
                <div className="flex flex-wrap gap-1">
                  {commonOrders.medications.map((med) => (
                    <button
                      key={med}
                      className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded hover:bg-blue-200"
                    >
                      {med}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Selected Orders */}
            <div>
              <h3 className="text-xs font-semibold text-gray-700 uppercase mb-2">Today's Orders</h3>
              {currentEncounter?.assessment.orders.length > 0 ? (
                currentEncounter.assessment.orders.map((order, idx) => (
                  <div key={idx} className="p-2 bg-gray-50 rounded mb-2 text-sm">
                    <p className="font-medium">{order.description}</p>
                    <p className="text-xs text-gray-600">{order.type} - {order.priority}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">No orders placed</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'medications' && (
          <MedicationPrescribing
            onPrescribe={(med) => {
              updateAssessment({
                orders: [
                  ...(currentEncounter?.assessment.orders || []),
                  {
                    type: 'medication',
                    description: `${med.medication.name} ${med.dosage} ${med.frequency}`,
                    priority: 'routine'
                  }
                ]
              });
            }}
          />
        )}

        {activeTab === 'labs' && (
          <LabOrdering
            patientId={currentEncounter?.patient_id || 0}
            onOrderLab={(lab) => {
              updateAssessment({
                orders: [
                  ...(currentEncounter?.assessment.orders || []),
                  {
                    type: 'lab',
                    description: `Lab Order: ${lab.tests?.map((t: any) => t.test_name).join(', ')}`,
                    priority: lab.priority
                  }
                ]
              });
            }}
          />
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t">
        <button className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium">
          <Plus size={16} className="inline mr-1" />
          Add {activeTab === 'diagnoses' ? 'Diagnosis' : 'Order'}
        </button>
      </div>
    </div>
  );
};