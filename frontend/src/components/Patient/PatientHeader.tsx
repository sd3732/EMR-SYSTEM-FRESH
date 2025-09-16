import { User, Phone, Mail, MapPin, Shield, Calendar, AlertCircle, MessageSquare } from 'lucide-react';
import { usePatientProfileStore } from '../../stores/usePatientProfileStore';
import { format, differenceInYears } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { NavigationService } from '../../services/navigationService';

export const PatientHeader = () => {
  const { currentPatient, allergies } = usePatientProfileStore();
  const navigate = useNavigate();

  if (!currentPatient) return null;

  const age = differenceInYears(new Date(), new Date(currentPatient.date_of_birth));
  const hasAllergies = allergies.length > 0;
  const severeAllergies = allergies.filter(a => a.severity === 'severe');

  return (
    <div className="bg-white border-b">
      <div className="px-6 py-4">
        <div className="flex items-start justify-between">
          {/* Patient Info Section */}
          <div className="flex items-start space-x-4">
            {/* Avatar */}
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white text-2xl font-bold shadow-lg">
              {currentPatient.first_name[0]}{currentPatient.last_name[0]}
            </div>

            {/* Patient Details */}
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">
                  {currentPatient.first_name} {currentPatient.last_name}
                </h1>
                {hasAllergies && (
                  <div className="flex items-center gap-1">
                    {severeAllergies.length > 0 && (
                      <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full flex items-center gap-1">
                        <AlertCircle size={12} />
                        {severeAllergies.length} Severe Allergies
                      </span>
                    )}
                    {allergies.length > severeAllergies.length && (
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full">
                        {allergies.length - severeAllergies.length} Other Allergies
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <Calendar size={14} />
                  <span>DOB: {format(new Date(currentPatient.date_of_birth), 'MM/dd/yyyy')} ({age} years)</span>
                </div>
                <div className="flex items-center gap-2">
                  <User size={14} />
                  <span>MRN: {currentPatient.mrn}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone size={14} />
                  <span>{currentPatient.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail size={14} />
                  <span>{currentPatient.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin size={14} />
                  <span>{currentPatient.city}, {currentPatient.state}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield size={14} />
                  <span>{currentPatient.insurance_provider}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => NavigationService.startNewEncounter(currentPatient.id)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium"
              title="Start new encounter for this patient"
            >
              <User size={16} />
              Start Encounter
            </button>
            <button
              onClick={() => NavigationService.scheduleFromProfile(currentPatient.id)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              title="Schedule new appointment"
            >
              <Calendar size={16} />
              Schedule Appointment
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              title="Return to dashboard"
            >
              <MessageSquare size={16} />
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};