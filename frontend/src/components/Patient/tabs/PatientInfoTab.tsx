import { User, Phone, Mail, MapPin, Calendar, Globe, Users, Heart, Building2, CreditCard } from 'lucide-react';
import { usePatientProfileStore } from '../../../stores/usePatientProfileStore';
import { format } from 'date-fns';

export const PatientInfoTab = () => {
  const { currentPatient, insurance } = usePatientProfileStore();

  if (!currentPatient) return null;

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-xl font-bold text-gray-900">Patient Information</h2>

      {/* Demographics Section */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Demographics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <User className="text-gray-400 mt-1" size={20} />
              <div>
                <p className="text-sm text-gray-600">Full Name</p>
                <p className="font-medium">{currentPatient.first_name} {currentPatient.last_name}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="text-gray-400 mt-1" size={20} />
              <div>
                <p className="text-sm text-gray-600">Date of Birth</p>
                <p className="font-medium">{format(new Date(currentPatient.date_of_birth), 'MMMM d, yyyy')}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <User className="text-gray-400 mt-1" size={20} />
              <div>
                <p className="text-sm text-gray-600">Gender</p>
                <p className="font-medium capitalize">{currentPatient.gender}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Globe className="text-gray-400 mt-1" size={20} />
              <div>
                <p className="text-sm text-gray-600">Preferred Language</p>
                <p className="font-medium">{currentPatient.preferred_language || 'English'}</p>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Phone className="text-gray-400 mt-1" size={20} />
              <div>
                <p className="text-sm text-gray-600">Phone Number</p>
                <p className="font-medium">{currentPatient.phone}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Mail className="text-gray-400 mt-1" size={20} />
              <div>
                <p className="text-sm text-gray-600">Email Address</p>
                <p className="font-medium">{currentPatient.email}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="text-gray-400 mt-1" size={20} />
              <div>
                <p className="text-sm text-gray-600">Address</p>
                <p className="font-medium">{currentPatient.address}</p>
                <p className="font-medium">{currentPatient.city}, {currentPatient.state} {currentPatient.zip}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Emergency Contact */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Emergency Contact</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex items-start gap-3">
            <Users className="text-gray-400 mt-1" size={20} />
            <div>
              <p className="text-sm text-gray-600">Contact Name</p>
              <p className="font-medium">{currentPatient.emergency_contact || 'Not specified'}</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Phone className="text-gray-400 mt-1" size={20} />
            <div>
              <p className="text-sm text-gray-600">Contact Phone</p>
              <p className="font-medium">{currentPatient.emergency_phone || 'Not specified'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Insurance Information */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Insurance Information</h3>
        <div className="space-y-4">
          {/* Primary Insurance */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <span className="font-medium text-blue-900">Primary Insurance</span>
              <CreditCard className="text-blue-600" size={20} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Provider</p>
                <p className="font-medium">{currentPatient.insurance_provider}</p>
              </div>
              <div>
                <p className="text-gray-600">Policy Number</p>
                <p className="font-medium">{currentPatient.insurance_id}</p>
              </div>
            </div>
          </div>

          {/* Secondary Insurance (if exists) */}
          {insurance?.find(i => i.insurance_type === 'secondary') && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <span className="font-medium text-gray-900">Secondary Insurance</span>
                <CreditCard className="text-gray-600" size={20} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-600">Provider</p>
                  <p className="font-medium">Medicare</p>
                </div>
                <div>
                  <p className="text-gray-600">Policy Number</p>
                  <p className="font-medium">1234567890A</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Additional Information */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="font-semibold text-gray-900 mb-4">Additional Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <p className="text-sm text-gray-600">Medical Record Number</p>
            <p className="font-medium">{currentPatient.mrn}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Account Created</p>
            <p className="font-medium">{format(new Date(currentPatient.created_at), 'MMMM d, yyyy')}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Last Updated</p>
            <p className="font-medium">{format(new Date(currentPatient.updated_at), 'MMMM d, yyyy')}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Primary Care Provider</p>
            <p className="font-medium">Dr. Sarah Johnson</p>
          </div>
        </div>
      </div>
    </div>
  );
};