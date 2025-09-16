import { useState } from 'react';
import { Clock, User, AlertCircle, Calendar, UserCheck, Stethoscope } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { QueuePatient } from '../../types/queue';
import { format, differenceInMinutes } from 'date-fns';
import { QuickVitalsModal } from './QuickVitalsModal';

interface QueuePatientCardProps {
  patient: QueuePatient;
  onStatusChange: (status: QueuePatient['status'], room?: string, vitals?: any) => void;
  onSelect: () => void;
}

export const QueuePatientCard = ({ patient, onStatusChange, onSelect }: QueuePatientCardProps) => {
  const navigate = useNavigate();
  const waitTime = differenceInMinutes(new Date(), new Date(patient.arrival_time));
  const [showVitalsModal, setShowVitalsModal] = useState(false);

  const priorityColors = {
    'emergent': 'bg-red-100 border-red-500 text-red-900',
    'urgent': 'bg-orange-100 border-orange-500 text-orange-900',
    'less-urgent': 'bg-yellow-100 border-yellow-500 text-yellow-900',
    'non-urgent': 'bg-green-100 border-green-500 text-green-900',
  };

  const statusColors = {
    'waiting': 'bg-gray-100',
    'triaged': 'bg-blue-100',
    'roomed': 'bg-purple-100',
    'with-provider': 'bg-green-100',
    'checkout': 'bg-yellow-100',
    'discharged': 'bg-gray-300',
  };

  const handleStartEncounter = () => {
    navigate(`/encounter/${patient.patient_id}?appointment_id=${patient.id}`);
  };

  const handleViewPatient = () => {
    navigate(`/patients/${patient.patient_id}`);
  };

  const handleVitalsSave = async (vitals: any, roomNumber: string) => {
    await onStatusChange('roomed', roomNumber, vitals);
    setShowVitalsModal(false);
  };

  const handleRoomWithoutVitals = async (roomNumber: string) => {
    await onStatusChange('roomed', roomNumber);
    setShowVitalsModal(false);
  };

  return (
    <div
      className={`p-4 rounded-lg border-2 ${priorityColors[patient.triage_priority]} cursor-pointer hover:shadow-lg transition-all`}
      onClick={onSelect}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <h3 className="font-semibold text-sm">{patient.patient_name}</h3>
          <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
            <User size={12} />
            <span>{patient.age}y {patient.gender}</span>
            {patient.room_number && (
              <>
                <span>•</span>
                <span>Room {patient.room_number}</span>
              </>
            )}
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[patient.status]}`}>
          {patient.status.replace('-', ' ')}
        </span>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium">CC: {patient.chief_complaint}</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 text-xs text-gray-600">
            <Clock size={12} />
            <span>{waitTime} min</span>
          </div>

          {patient.vital_signs_complete && (
            <span className="text-xs text-green-600">✓ Vitals</span>
          )}
        </div>
      </div>

      {waitTime > 60 && patient.status === 'waiting' && (
        <div className="mt-2 flex items-center gap-1 text-xs text-red-600">
          <AlertCircle size={12} />
          <span>Extended wait time</span>
        </div>
      )}

      {/* Quick Actions */}
      <div className="mt-3 flex gap-2 flex-wrap">
        {/* Status progression buttons */}
        {patient.status === 'waiting' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange('triaged');
            }}
            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Triage
          </button>
        )}
        {patient.status === 'triaged' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowVitalsModal(true);
            }}
            className="px-2 py-1 text-xs bg-purple-500 text-white rounded hover:bg-purple-600 flex items-center gap-1"
          >
            <Stethoscope size={12} />
            Room & Vitals
          </button>
        )}
        {patient.status === 'roomed' && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStatusChange('with-provider');
            }}
            className="px-2 py-1 text-xs bg-green-500 text-white rounded hover:bg-green-600"
          >
            Begin Exam
          </button>
        )}

        {/* Encounter start button - show for roomed and with-provider */}
        {(patient.status === 'roomed' || patient.status === 'with-provider') && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleStartEncounter();
            }}
            className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
            title="Start/Continue Encounter"
          >
            <Calendar size={12} />
            {patient.status === 'with-provider' ? 'Continue' : 'Start'} Encounter
          </button>
        )}

        {/* Always show patient profile button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleViewPatient();
          }}
          className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600 flex items-center gap-1"
          title="View Patient Profile"
        >
          <UserCheck size={12} />
          Profile
        </button>
      </div>

      {/* Quick Vitals Modal */}
      <QuickVitalsModal
        isOpen={showVitalsModal}
        onClose={() => setShowVitalsModal(false)}
        patientName={patient.patient_name}
        patientId={patient.patient_id}
        onSave={handleVitalsSave}
        onSkip={handleRoomWithoutVitals}
      />
    </div>
  );
};