import { User, Edit2, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface AppointmentCardProps {
  appointment: {
    id: number;
    patient_id?: number;
    patient_name: string;
    visit_type?: string;
    chief_complaint?: string;
    status: string;
    start: string;
    end: string;
    notes?: string;
    provider_name?: string;
  };
  getStatusColor: (status: string) => string;
  onClick: (e: React.MouseEvent) => void;
}

export const AppointmentCard = ({ appointment, getStatusColor, onClick }: AppointmentCardProps) => {
  const navigate = useNavigate();

  const handleViewPatient = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (appointment.patient_id) {
      navigate(`/patients/${appointment.patient_id}`);
    }
  };

  const handleStartEncounter = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (appointment.patient_id && appointment.status === 'arrived') {
      navigate(`/encounter/${appointment.patient_id}?appointment_id=${appointment.id}`);
    }
  };

  return (
    <div
      className={`p-2 rounded-md border text-xs mb-1 group hover:shadow-sm transition-shadow ${getStatusColor(appointment.status)}`}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 cursor-pointer" onClick={onClick}>
          <div className="font-semibold truncate">
            {appointment.patient_name}
          </div>
          <div className="text-xs opacity-75 truncate">
            {appointment.visit_type}
            {appointment.provider_name && ` • ${appointment.provider_name.replace('Dr. ', '')}`}
          </div>
          {appointment.chief_complaint && (
            <div className="text-xs italic truncate">
              {appointment.chief_complaint}
            </div>
          )}
        </div>

        {/* Action buttons - show on hover */}
        <div className="flex flex-col space-y-1 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
          <button
            onClick={handleViewPatient}
            className="p-1 hover:bg-white/50 rounded transition-colors"
            title="View Patient Profile"
          >
            <User className="w-3 h-3" />
          </button>

          {appointment.status === 'arrived' && (
            <button
              onClick={handleStartEncounter}
              className="p-1 hover:bg-green-200 rounded transition-colors"
              title="Start Encounter"
            >
              <Calendar className="w-3 h-3" />
            </button>
          )}

          <button
            onClick={onClick}
            className="p-1 hover:bg-white/50 rounded transition-colors"
            title="Edit Appointment"
          >
            <Edit2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};