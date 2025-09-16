import { useState, useEffect, useRef } from 'react';
import { X, Calendar, Clock, Search } from 'lucide-react';
import { format, parseISO, addMinutes } from 'date-fns';
import { appointmentService } from '../../services/appointment.service';
import toast from 'react-hot-toast';

interface AppointmentModalProps {
  selectedDate: Date;
  selectedTimeSlot?: { time: string; hour: number; minute: number } | null;
  appointment?: any | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const AppointmentModal = ({
  selectedDate,
  selectedTimeSlot,
  appointment,
  onClose,
  onSuccess
}: AppointmentModalProps) => {
  const [formData, setFormData] = useState({
    patient_id: '',
    provider_id: '',
    scheduled_time: '',
    duration: 15,
    visit_type: 'walk-in',
    chief_complaint: '',
    notes: '',
    room: ''
  });

  const [patients, setPatients] = useState([]);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [patientSearch, setPatientSearch] = useState('');
  const [filteredPatients, setFilteredPatients] = useState([]);
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const visitTypes = [
    { value: 'walk-in', label: 'Walk-in' },
    { value: 'follow-up', label: 'Follow-up' },
    { value: 'physical', label: 'Physical Exam' },
    { value: 'urgent', label: 'Urgent Care' },
    { value: 'consultation', label: 'Consultation' }
  ];

  const durations = [15, 30, 45, 60];

  // Initialize form with appointment data if editing
  useEffect(() => {
    if (appointment) {
      const startDate = parseISO(appointment.start);
      setFormData({
        patient_id: appointment.patient_id?.toString() || '',
        provider_id: appointment.provider_id?.toString() || '',
        scheduled_time: appointment.start,
        duration: Math.round((parseISO(appointment.end).getTime() - startDate.getTime()) / (1000 * 60)),
        visit_type: appointment.visit_type || appointment.type || 'walk-in',
        chief_complaint: appointment.chief_complaint || '',
        notes: appointment.notes || '',
        room: appointment.room || ''
      });
      // Set patient search field to the patient name if editing
      if (appointment.patient_name) {
        setPatientSearch(appointment.patient_name);
      }
    }
  }, [appointment]);

  // Set initial time if creating new appointment
  useEffect(() => {
    if (selectedDate && selectedTimeSlot && !appointment) {
      const dateTime = new Date(selectedDate);
      dateTime.setHours(selectedTimeSlot.hour, selectedTimeSlot.minute);
      setFormData(prev => ({
        ...prev,
        scheduled_time: dateTime.toISOString()
      }));
    }
  }, [selectedDate, selectedTimeSlot, appointment]);

  // Load patients and providers
  useEffect(() => {
    loadInitialData();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowPatientDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      // Load providers from API
      const providersResponse = await appointmentService.getProviders();
      setProviders(providersResponse.data || [
        { id: 1, name: 'Dr. Sarah Wilson', specialty: 'Family Medicine' },
        { id: 2, name: 'Dr. Michael Chen', specialty: 'Internal Medicine' },
        { id: 3, name: 'Dr. Emily Rodriguez', specialty: 'Pediatrics' }
      ]);

      // Load initial patients for dropdown
      const patientsResponse = await appointmentService.getPatients();
      const patientData = patientsResponse.data || [
        { id: 1, name: 'John Smith', phone: '(555) 123-4567', mrn: 'MRN-000001', dob: '1978-05-15' },
        { id: 2, name: 'Mary Johnson', phone: '(555) 234-5678', mrn: 'MRN-000002', dob: '1995-08-22' },
        { id: 3, name: 'Robert Davis', phone: '(555) 345-6789', mrn: 'MRN-000003', dob: '1961-12-10' },
        { id: 4, name: 'Jennifer Wilson', phone: '(555) 456-7890', mrn: 'MRN-000004', dob: '1989-03-18' },
        { id: 5, name: 'Michael Brown', phone: '(555) 567-8901', mrn: 'MRN-000005', dob: '1972-11-25' }
      ];
      setPatients(patientData);
      setFilteredPatients(patientData);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.patient_id) {
      toast.error('Please select a patient');
      return;
    }

    if (!formData.provider_id) {
      toast.error('Please select a provider');
      return;
    }

    setLoading(true);
    try {
      // Create end time based on scheduled_time and duration
      const startDateTime = new Date(formData.scheduled_time);
      const endDateTime = addMinutes(startDateTime, formData.duration);

      const appointmentData = {
        patient_id: parseInt(formData.patient_id),
        provider_id: parseInt(formData.provider_id),
        start: startDateTime.toISOString(),
        end: endDateTime.toISOString(),
        visit_type: formData.visit_type,
        chief_complaint: formData.chief_complaint,
        notes: formData.notes,
        room: formData.room
      };

      if (appointment) {
        await appointmentService.updateAppointment(appointment.id, appointmentData);
      } else {
        await appointmentService.createAppointment(appointmentData);
      }
      onSuccess();
    } catch (error) {
      toast.error('Failed to save appointment');
    } finally {
      setLoading(false);
    }
  };

  const handlePatientSearch = (searchTerm: string) => {
    setPatientSearch(searchTerm);
    if (searchTerm.trim() === '') {
      setFilteredPatients(patients);
      setShowPatientDropdown(false);
    } else {
      const filtered = patients.filter(patient =>
        patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        patient.phone.includes(searchTerm) ||
        patient.mrn.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredPatients(filtered);
      setShowPatientDropdown(true);
    }
  };

  const handlePatientSelect = (patient: any) => {
    setFormData({ ...formData, patient_id: patient.id.toString() });
    setPatientSearch(patient.name);
    setShowPatientDropdown(false);
  };



  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-gray-900/50" onClick={onClose} />

      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            {appointment ? 'Edit Appointment' : 'Schedule Appointment'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Patient Selection */}
          <div className="relative" ref={dropdownRef}>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Patient *
            </label>
            <div className="relative">
              <input
                type="text"
                value={patientSearch}
                onChange={(e) => handlePatientSearch(e.target.value)}
                onFocus={() => setShowPatientDropdown(patientSearch.length > 0)}
                placeholder="Search by name or MRN"
                className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-primary"
                required
              />
              <Search className="absolute right-3 top-2.5 w-5 h-5 text-gray-400" />
            </div>
            {showPatientDropdown && filteredPatients.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {filteredPatients.map((patient) => (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => handlePatientSelect(patient)}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50 border-b last:border-0"
                  >
                    <div className="font-medium">
                      {patient.name}
                    </div>
                    <div className="text-sm text-gray-500">
                      MRN: {patient.mrn} | DOB: {patient.dob ? format(new Date(patient.dob), 'MM/dd/yyyy') : 'N/A'}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {showPatientDropdown && filteredPatients.length === 0 && patientSearch.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-3 text-gray-500 text-sm">
                No patients found matching "{patientSearch}"
              </div>
            )}
          </div>

          {/* Provider Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Provider
            </label>
            <select
              value={formData.provider_id}
              onChange={(e) => setFormData(prev => ({ ...prev, provider_id: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
            >
              <option value="">Select provider</option>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  Dr. {provider.name}
                </option>
              ))}
            </select>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date
              </label>
              <div className="flex items-center px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
                <Calendar className="w-5 h-5 text-gray-500 mr-2" />
                <span>{format(selectedDate || new Date(), 'MMM d, yyyy')}</span>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time
              </label>
              <div className="flex items-center px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
                <Clock className="w-5 h-5 text-gray-500 mr-2" />
                <span>{selectedTimeSlot ? selectedTimeSlot.time : '--:--'}</span>
              </div>
            </div>
          </div>

          {/* Visit Type and Duration */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Visit Type
              </label>
              <select
                value={formData.visit_type}
                onChange={(e) => setFormData(prev => ({ ...prev, visit_type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
              >
                {visitTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Duration (minutes)
              </label>
              <select
                value={formData.duration}
                onChange={(e) => setFormData(prev => ({ ...prev, duration: parseInt(e.target.value) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
              >
                {durations.map((duration) => (
                  <option key={duration} value={duration}>
                    {duration} minutes
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Chief Complaint */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Chief Complaint
            </label>
            <input
              type="text"
              value={formData.chief_complaint}
              onChange={(e) => setFormData(prev => ({ ...prev, chief_complaint: e.target.value }))}
              placeholder="e.g., Sore throat, Follow-up visit"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Room Assignment */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Room (Optional)
            </label>
            <input
              type="text"
              value={formData.room}
              onChange={(e) => setFormData(prev => ({ ...prev, room: e.target.value }))}
              placeholder="e.g., Room 1, Room A"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary"
              placeholder="Additional notes..."
            />
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Saving...' : appointment ? 'Update' : 'Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};