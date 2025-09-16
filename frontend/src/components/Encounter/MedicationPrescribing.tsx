import { useState, useEffect } from 'react';
import { Search, AlertTriangle, Plus, X, Pill } from 'lucide-react';
import drugInteractionService from '../../services/drugInteraction.service';
import { usePatientProfileStore } from '../../stores/usePatientProfileStore';
import toast from 'react-hot-toast';

export const MedicationPrescribing = ({ onPrescribe }: { onPrescribe: (med: any) => void }) => {
  const { medications: patientMedications } = usePatientProfileStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedMed, setSelectedMed] = useState<any>(null);
  const [interactions, setInteractions] = useState<any[]>([]);
  const [prescription, setPrescription] = useState({
    dosage: '',
    frequency: '',
    duration: '',
    quantity: '',
    refills: '0',
    instructions: ''
  });

  useEffect(() => {
    if (searchTerm.length > 2) {
      searchMedications();
    }
  }, [searchTerm]);

  useEffect(() => {
    if (selectedMed) {
      checkInteractions();
    }
  }, [selectedMed]);

  const searchMedications = async () => {
    const results = await drugInteractionService.searchMedications(searchTerm);
    setSearchResults(results);
  };

  const checkInteractions = async () => {
    if (!selectedMed) return;

    const medsToCheck = [
      ...patientMedications.filter(m => m.is_active),
      { name: selectedMed.name, rxnorm_code: selectedMed.rxnorm_code }
    ];

    const interactions = await drugInteractionService.checkInteractions(medsToCheck as any);
    setInteractions(interactions);

    if (interactions.some(i => i.severity === 'severe')) {
      toast.error('Severe drug interaction detected!');
    } else if (interactions.some(i => i.severity === 'moderate')) {
      toast.warning('Moderate drug interaction detected');
    }
  };

  const handlePrescribe = async () => {
    if (!selectedMed) return;

    const rx = {
      medication: selectedMed,
      ...prescription,
      prescribed_date: new Date().toISOString()
    };

    try {
      await drugInteractionService.prescribeMedication(rx);
      onPrescribe(rx);
      toast.success('Prescription added successfully');
      resetForm();
    } catch (error) {
      toast.error('Failed to add prescription');
    }
  };

  const resetForm = () => {
    setSelectedMed(null);
    setSearchTerm('');
    setSearchResults([]);
    setInteractions([]);
    setPrescription({
      dosage: '',
      frequency: '',
      duration: '',
      quantity: '',
      refills: '0',
      instructions: ''
    });
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <Pill className="text-primary" size={20} />
        Prescribe Medication
      </h3>

      {/* Medication Search */}
      {!selectedMed ? (
        <div>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search medications..."
              className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
            />
          </div>

          {searchResults.length > 0 && (
            <div className="border rounded-lg max-h-48 overflow-y-auto">
              {searchResults.map((med) => (
                <button
                  key={med.id}
                  onClick={() => setSelectedMed(med)}
                  className="w-full text-left p-2 hover:bg-gray-50 border-b last:border-b-0"
                >
                  <p className="font-medium text-sm">{med.name}</p>
                  <p className="text-xs text-gray-600">{med.generic_name}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Selected Medication */}
          <div className="flex items-center justify-between mb-4 p-2 bg-blue-50 rounded">
            <div>
              <p className="font-medium">{selectedMed.name}</p>
              <p className="text-sm text-gray-600">{selectedMed.generic_name}</p>
            </div>
            <button onClick={resetForm} className="text-gray-500 hover:text-gray-700">
              <X size={20} />
            </button>
          </div>

          {/* Drug Interactions Warning */}
          {interactions.length > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="text-yellow-600 mt-0.5" size={16} />
                <div className="flex-1">
                  <p className="font-medium text-yellow-900 text-sm">Drug Interactions Detected</p>
                  {interactions.map((interaction, idx) => (
                    <div key={idx} className="mt-1">
                      <p className="text-xs text-yellow-800">
                        <span className={`font-medium ${
                          interaction.severity === 'severe' ? 'text-red-700' :
                          interaction.severity === 'moderate' ? 'text-yellow-700' :
                          'text-gray-700'
                        }`}>
                          {interaction.severity.toUpperCase()}:
                        </span> {interaction.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Prescription Details */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Dosage</label>
                <input
                  type="text"
                  value={prescription.dosage}
                  onChange={(e) => setPrescription({ ...prescription, dosage: e.target.value })}
                  placeholder="e.g., 500mg"
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Frequency</label>
                <select
                  value={prescription.frequency}
                  onChange={(e) => setPrescription({ ...prescription, frequency: e.target.value })}
                  className="w-full px-2 py-1 border rounded text-sm"
                >
                  <option value="">Select...</option>
                  <option value="once daily">Once daily</option>
                  <option value="twice daily">Twice daily</option>
                  <option value="three times daily">Three times daily</option>
                  <option value="four times daily">Four times daily</option>
                  <option value="every 4 hours">Every 4 hours</option>
                  <option value="every 6 hours">Every 6 hours</option>
                  <option value="as needed">As needed</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Duration</label>
                <input
                  type="text"
                  value={prescription.duration}
                  onChange={(e) => setPrescription({ ...prescription, duration: e.target.value })}
                  placeholder="e.g., 10 days"
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Quantity</label>
                <input
                  type="text"
                  value={prescription.quantity}
                  onChange={(e) => setPrescription({ ...prescription, quantity: e.target.value })}
                  placeholder="e.g., 20"
                  className="w-full px-2 py-1 border rounded text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Instructions</label>
              <textarea
                value={prescription.instructions}
                onChange={(e) => setPrescription({ ...prescription, instructions: e.target.value })}
                placeholder="Take with food..."
                className="w-full px-2 py-1 border rounded text-sm"
                rows={2}
              />
            </div>

            <button
              onClick={handlePrescribe}
              disabled={!prescription.dosage || !prescription.frequency}
              className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
            >
              Add Prescription
            </button>
          </div>
        </div>
      )}
    </div>
  );
};