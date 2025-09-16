import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { QueuePatientCard } from './QueuePatientCard';
import { SortablePatientCard } from './SortablePatientCard';
import { useQueueStore } from '../../stores/useQueueStore';
import { queueService } from '../../services/appointment.service';
import { Users } from 'lucide-react';
import toast from 'react-hot-toast';

export const QueueBoard = () => {
  const { queue, updatePatientStatus, selectPatient, setQueue } = useQueueStore();
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const statuses = [
    { id: 'all', label: 'All Patients', color: 'bg-gray-100' },
    { id: 'waiting', label: 'Waiting', color: 'bg-yellow-100' },
    { id: 'triaged', label: 'Triaged', color: 'bg-blue-100' },
    { id: 'roomed', label: 'Roomed', color: 'bg-purple-100' },
    { id: 'with-provider', label: 'With Provider', color: 'bg-green-100' },
    { id: 'checkout', label: 'Checkout', color: 'bg-orange-100' },
  ];

  const filteredQueue = selectedStatus === 'all'
    ? queue
    : queue.filter(p => p.status === selectedStatus);

  // Group patients by status for column view
  const groupedPatients = {
    waiting: queue.filter(p => p.status === 'waiting'),
    triaged: queue.filter(p => p.status === 'triaged'),
    roomed: queue.filter(p => p.status === 'roomed'),
    'with-provider': queue.filter(p => p.status === 'with-provider'),
    checkout: queue.filter(p => p.status === 'checkout'),
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = queue.findIndex((p) => p.id.toString() === active.id);
      const newIndex = queue.findIndex((p) => p.id.toString() === over?.id);

      if (oldIndex !== -1 && newIndex !== -1) {
        const newQueue = arrayMove(queue, oldIndex, newIndex);
        setQueue(newQueue);
      }
    }
  };

  const handleStatusUpdate = async (patientId: string, newStatus: string, room?: string, vitals?: any) => {
    try {
      await queueService.updateStatus(patientId, newStatus);
      updatePatientStatus(parseInt(patientId), newStatus);

      // If vitals are provided, save them
      if (vitals) {
        // In a real app, you would save vitals to the vitals service
        console.log('Saving vitals for patient', patientId, vitals);
        toast.success(`Patient roomed with vitals recorded`);
      } else if (room && newStatus === 'roomed') {
        toast.success(`Patient assigned to ${room}`);
      } else {
        toast.success(`Status updated to ${newStatus.replace('-', ' ')}`);
      }
    } catch (error) {
      console.error('Failed to update patient status:', error);
      toast.error('Failed to update status');
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Patient Queue</h2>
          <div className="flex items-center gap-2">
            <Users className="text-gray-500" size={20} />
            <span className="text-sm text-gray-600">{queue.length} total</span>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto">
          {statuses.map((status) => (
            <button
              key={status.id}
              onClick={() => setSelectedStatus(status.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${selectedStatus === status.id
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              {status.label}
              <span className="ml-1">
                ({status.id === 'all' ? queue.length : groupedPatients[status.id as keyof typeof groupedPatients]?.length || 0})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Queue Display */}
      <div className="p-4">
        {selectedStatus === 'all' ? (
          // Column View for All Patients
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {Object.entries(groupedPatients).map(([status, patients]) => (
              <div key={status} className="space-y-2">
                <h3 className="text-xs font-semibold text-gray-600 uppercase">
                  {status.replace('-', ' ')} ({patients.length})
                </h3>
                <div className="space-y-2 min-h-[100px]">
                  {patients.map((patient) => (
                    <QueuePatientCard
                      key={patient.id}
                      patient={patient}
                      onStatusChange={(newStatus, room, vitals) =>
                        handleStatusUpdate(patient.id.toString(), newStatus, room, vitals)
                      }
                      onSelect={() => selectPatient(patient)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          // List View for Filtered Status with Drag and Drop
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={filteredQueue.map(p => p.id.toString())}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-3">
                {filteredQueue.length > 0 ? (
                  filteredQueue.map((patient) => (
                    <SortablePatientCard
                      key={patient.id}
                      patient={patient}
                      onStatusChange={(status, room, vitals) =>
                        handleStatusUpdate(patient.id.toString(), status, room, vitals)
                      }
                      onSelect={() => selectPatient(patient)}
                    />
                  ))
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    No patients in {selectedStatus.replace('-', ' ')} status
                  </div>
                )}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
};