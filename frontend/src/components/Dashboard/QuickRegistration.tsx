import { useState } from 'react';
import { X, User, AlertCircle } from 'lucide-react';
import { useQueueStore } from '../../stores/useQueueStore';
import { patientService } from '../../services/appointment.service';
import toast from 'react-hot-toast';

interface QuickRegistrationProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QuickRegistration = ({ isOpen, onClose }: QuickRegistrationProps) => {
  const { addToQueue } = useQueueStore();
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    age: '',
    date_of_birth: '',
    gender: 'male',
    phone: '',
    chief_complaint: '',
    triage_priority: 'non-urgent' as const,
  });
  const [loading, setLoading] = useState(false);

  const chiefComplaints = [
    'Fever', 'Cough', 'Sore Throat', 'Abdominal Pain',
    'Chest Pain', 'Shortness of Breath', 'Injury/Trauma',
    'Headache', 'Back Pain', 'Urinary Symptoms', 'Rash',
    'Vomiting/Nausea', 'Dizziness', 'Other'
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const registrationData = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        date_of_birth: formData.date_of_birth,
        phone: formData.phone,
        gender: formData.gender,
        is_walkin: true,
        chief_complaint: formData.chief_complaint,
        provider_id: 1, // Default provider
        notes: `Walk-in patient - Triage Priority: ${formData.triage_priority}`
      };

      await patientService.registerPatient(registrationData);
      toast.success('Patient registered and added to queue');
      onClose();

      // Reset form
      setFormData({
        first_name: '',
        last_name: '',
        age: '',
        date_of_birth: '',
        gender: 'male',
        phone: '',
        chief_complaint: '',
        triage_priority: 'non-urgent',
      });

      // Refresh dashboard data
      window.location.reload();
    } catch (error) {
      console.error('Failed to register patient:', error);
      toast.error('Failed to register patient');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold">Quick Walk-in Registration</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                First Name
              </label>
              <input
                type="text"
                required
                value={formData.first_name}
                onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="First name"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Last Name
              </label>
              <input
                type="text"
                required
                value={formData.last_name}
                onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="Last name"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date of Birth
              </label>
              <input
                type="date"
                required
                value={formData.date_of_birth}
                onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Gender
              </label>
              <select
                value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone Number
            </label>
            <input
              type="tel"
              required
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="(555) 123-4567"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Chief Complaint
            </label>
            <select
              required
              value={formData.chief_complaint}
              onChange={(e) => setFormData({ ...formData, chief_complaint: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            >
              <option value="">Select complaint</option>
              {chiefComplaints.map((complaint) => (
                <option key={complaint} value={complaint}>
                  {complaint}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Initial Priority
            </label>
            <div className="grid grid-cols-2 gap-2">
              {['emergent', 'urgent', 'less-urgent', 'non-urgent'].map((priority) => (
                <button
                  key={priority}
                  type="button"
                  onClick={() => setFormData({ ...formData, triage_priority: priority as 'emergent' | 'urgent' | 'less-urgent' | 'non-urgent' })}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${formData.triage_priority === priority
                      ? priority === 'emergent' ? 'bg-red-500 text-white' :
                        priority === 'urgent' ? 'bg-orange-500 text-white' :
                          priority === 'less-urgent' ? 'bg-yellow-500 text-white' :
                            'bg-green-500 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  {priority.charAt(0).toUpperCase() + priority.slice(1).replace('-', ' ')}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Registering...' : 'Register & Add to Queue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};