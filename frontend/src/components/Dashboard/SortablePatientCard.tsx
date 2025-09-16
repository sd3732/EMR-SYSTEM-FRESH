import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { QueuePatientCard } from './QueuePatientCard';
import type { QueuePatient } from '../../types/queue';

interface SortablePatientCardProps {
  patient: QueuePatient;
  onStatusChange: (status: QueuePatient['status'], room?: string, vitals?: any) => void;
  onSelect: () => void;
}

export const SortablePatientCard = ({ patient, onStatusChange, onSelect }: SortablePatientCardProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: patient.id.toString() });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <QueuePatientCard
        patient={patient}
        onStatusChange={onStatusChange}
        onSelect={onSelect}
      />
    </div>
  );
};