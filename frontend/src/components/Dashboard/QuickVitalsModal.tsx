import { useState } from 'react';
import { X, Thermometer, Heart, Activity, Droplets, Weight, Ruler, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

interface VitalsData {
  systolic_bp: string;
  diastolic_bp: string;
  heart_rate: string;
  temperature: string;
  respiratory_rate: string;
  oxygen_saturation: string;
  weight: string;
  height: string;
  pain_scale: string;
}

interface QuickVitalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  patientName: string;
  patientId: number;
  onSave: (vitals: VitalsData, roomNumber: string) => void;
  onSkip: (roomNumber: string) => void;
}

export const QuickVitalsModal = ({
  isOpen,
  onClose,
  patientName,
  patientId,
  onSave,
  onSkip
}: QuickVitalsModalProps) => {
  const [vitals, setVitals] = useState<VitalsData>({
    systolic_bp: '',
    diastolic_bp: '',
    heart_rate: '',
    temperature: '',
    respiratory_rate: '',
    oxygen_saturation: '',
    weight: '',
    height: '',
    pain_scale: '0'
  });

  const [roomNumber, setRoomNumber] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleInputChange = (field: keyof VitalsData, value: string) => {
    setVitals(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    if (!roomNumber.trim()) {
      toast.error('Room number is required');
      return;
    }

    // Validate required vitals
    const requiredFields = ['systolic_bp', 'diastolic_bp', 'heart_rate', 'temperature'];
    const missingFields = requiredFields.filter(field => !vitals[field as keyof VitalsData]);

    if (missingFields.length > 0) {
      toast.error('Please fill in blood pressure, heart rate, and temperature');
      return;
    }

    setSaving(true);
    try {
      await onSave(vitals, roomNumber.trim());
      toast.success('Vitals saved and patient roomed successfully');
      onClose();
    } catch (error) {
      toast.error('Failed to save vitals');
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (!roomNumber.trim()) {
      toast.error('Room number is required');
      return;
    }

    setSaving(true);
    try {
      await onSkip(roomNumber.trim());
      toast.success('Patient roomed without vitals');
      onClose();
    } catch (error) {
      toast.error('Failed to room patient');
    } finally {
      setSaving(false);
    }
  };

  const getBPStatus = () => {
    const systolic = parseInt(vitals.systolic_bp);
    const diastolic = parseInt(vitals.diastolic_bp);

    if (!systolic || !diastolic) return null;

    if (systolic >= 140 || diastolic >= 90) {
      return { status: 'high', color: 'text-red-600', message: 'Elevated BP' };
    } else if (systolic < 90 || diastolic < 60) {
      return { status: 'low', color: 'text-yellow-600', message: 'Low BP' };
    } else {
      return { status: 'normal', color: 'text-green-600', message: 'Normal BP' };
    }
  };

  const getHeartRateStatus = () => {
    const hr = parseInt(vitals.heart_rate);
    if (!hr) return null;

    if (hr > 100) {
      return { status: 'high', color: 'text-red-600', message: 'Tachycardia' };
    } else if (hr < 60) {
      return { status: 'low', color: 'text-yellow-600', message: 'Bradycardia' };
    } else {
      return { status: 'normal', color: 'text-green-600', message: 'Normal HR' };
    }
  };

  const getTempStatus = () => {
    const temp = parseFloat(vitals.temperature);
    if (!temp) return null;

    if (temp >= 100.4) {
      return { status: 'high', color: 'text-red-600', message: 'Fever' };
    } else if (temp < 97.0) {
      return { status: 'low', color: 'text-blue-600', message: 'Hypothermia' };
    } else {
      return { status: 'normal', color: 'text-green-600', message: 'Normal' };
    }
  };

  const bpStatus = getBPStatus();
  const hrStatus = getHeartRateStatus();
  const tempStatus = getTempStatus();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Quick Vitals & Room Assignment</h3>
            <p className="text-sm text-gray-600 mt-1">Patient: {patientName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {/* Room Assignment */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <strong>Room Number *</strong>
            </label>
            <input
              type="text"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              placeholder="Enter room number (e.g., 101, A2)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
              required
            />
          </div>

          {/* Vital Signs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Blood Pressure */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
                <Droplets size={16} className="text-red-500" />
                Blood Pressure *
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={vitals.systolic_bp}
                  onChange={(e) => handleInputChange('systolic_bp', e.target.value)}
                  placeholder="Systolic"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                  min="50"
                  max="250"
                />
                <span className="text-gray-500">/</span>
                <input
                  type="number"
                  value={vitals.diastolic_bp}
                  onChange={(e) => handleInputChange('diastolic_bp', e.target.value)}
                  placeholder="Diastolic"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                  min="30"
                  max="150"
                />
                <span className="text-xs text-gray-500">mmHg</span>
              </div>
              {bpStatus && (
                <p className={`text-xs ${bpStatus.color} flex items-center gap-1`}>
                  <AlertCircle size={12} />
                  {bpStatus.message}
                </p>
              )}
            </div>

            {/* Heart Rate */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
                <Heart size={16} className="text-pink-500" />
                Heart Rate *
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={vitals.heart_rate}
                  onChange={(e) => handleInputChange('heart_rate', e.target.value)}
                  placeholder="BPM"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                  min="30"
                  max="200"
                />
                <span className="text-xs text-gray-500">bpm</span>
              </div>
              {hrStatus && (
                <p className={`text-xs ${hrStatus.color} flex items-center gap-1`}>
                  <AlertCircle size={12} />
                  {hrStatus.message}
                </p>
              )}
            </div>

            {/* Temperature */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
                <Thermometer size={16} className="text-orange-500" />
                Temperature *
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  step="0.1"
                  value={vitals.temperature}
                  onChange={(e) => handleInputChange('temperature', e.target.value)}
                  placeholder="98.6"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                  min="95"
                  max="110"
                />
                <span className="text-xs text-gray-500">°F</span>
              </div>
              {tempStatus && (
                <p className={`text-xs ${tempStatus.color} flex items-center gap-1`}>
                  <AlertCircle size={12} />
                  {tempStatus.message}
                </p>
              )}
            </div>

            {/* Respiratory Rate */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
                <Activity size={16} className="text-blue-500" />
                Respiratory Rate
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={vitals.respiratory_rate}
                  onChange={(e) => handleInputChange('respiratory_rate', e.target.value)}
                  placeholder="16"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                  min="8"
                  max="40"
                />
                <span className="text-xs text-gray-500">/min</span>
              </div>
            </div>

            {/* Oxygen Saturation */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
                <Droplets size={16} className="text-blue-600" />
                O₂ Saturation
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  value={vitals.oxygen_saturation}
                  onChange={(e) => handleInputChange('oxygen_saturation', e.target.value)}
                  placeholder="98"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                  min="70"
                  max="100"
                />
                <span className="text-xs text-gray-500">%</span>
              </div>
            </div>

            {/* Weight */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
                <Weight size={16} className="text-purple-500" />
                Weight
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number"
                  step="0.1"
                  value={vitals.weight}
                  onChange={(e) => handleInputChange('weight', e.target.value)}
                  placeholder="150"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
                />
                <span className="text-xs text-gray-500">lbs</span>
              </div>
            </div>

            {/* Height */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
                <Ruler size={16} className="text-green-500" />
                Height
              </label>
              <input
                type="text"
                value={vitals.height}
                onChange={(e) => handleInputChange('height', e.target.value)}
                placeholder="5'6&quot; or 66 in"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            {/* Pain Scale */}
            <div className="space-y-2 md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
                <AlertCircle size={16} className="text-yellow-500" />
                Pain Scale (0-10)
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="0"
                  max="10"
                  value={vitals.pain_scale}
                  onChange={(e) => handleInputChange('pain_scale', e.target.value)}
                  className="flex-1"
                />
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-primary">{vitals.pain_scale}</span>
                  <span className="text-xs text-gray-500">
                    {vitals.pain_scale === '0' ? 'No pain' :
                     parseInt(vitals.pain_scale) <= 3 ? 'Mild' :
                     parseInt(vitals.pain_scale) <= 6 ? 'Moderate' : 'Severe'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-900 mb-2">Instructions:</h4>
            <ul className="text-xs text-gray-600 space-y-1">
              <li>• Required fields marked with * must be completed to save vitals</li>
              <li>• You can room the patient without vitals by clicking "Room Without Vitals"</li>
              <li>• Abnormal values will be highlighted with status indicators</li>
              <li>• All vitals will be recorded in the patient's chart</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            disabled={saving}
          >
            Cancel
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={handleSkip}
              className="px-4 py-2 text-gray-700 bg-yellow-100 border border-yellow-300 rounded-lg hover:bg-yellow-200 transition-colors"
              disabled={saving}
            >
              Room Without Vitals
            </button>

            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Vitals & Room Patient'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};