import { Check, ChevronRight } from 'lucide-react';
import { useEncounterStore } from '../../stores/useEncounterStore';

export const StageNavigation = () => {
  const { currentStage, setStage, currentEncounter } = useEncounterStore();

  const stages = [
    { id: 'review', label: 'Review', number: 1 },
    { id: 'hpi', label: 'HPI', number: 2 },
    { id: 'ros', label: 'ROS', number: 3 },
    { id: 'pe', label: 'PE', number: 4 },
    { id: 'assessment', label: 'Assessment', number: 5 },
  ];

  const getStageStatus = (stageId: string) => {
    const stageIndex = stages.findIndex(s => s.id === stageId);
    const currentIndex = stages.findIndex(s => s.id === currentStage);

    if (stageIndex < currentIndex) return 'completed';
    if (stageIndex === currentIndex) return 'current';
    return 'upcoming';
  };

  return (
    <div className="bg-white border-b px-6 py-4">
      <div className="flex items-center justify-between">
        {stages.map((stage, index) => (
          <div key={stage.id} className="flex items-center">
            <button
              onClick={() => setStage(stage.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                getStageStatus(stage.id) === 'current'
                  ? 'bg-primary text-white shadow-md'
                  : getStageStatus(stage.id) === 'completed'
                  ? 'bg-green-100 text-green-800 hover:bg-green-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {getStageStatus(stage.id) === 'completed' ? (
                <Check size={16} />
              ) : (
                <span className="w-5 h-5 flex items-center justify-center text-xs font-bold">
                  {stage.number}
                </span>
              )}
              <span className="font-medium">{stage.label}</span>
            </button>
            {index < stages.length - 1 && (
              <ChevronRight className="mx-2 text-gray-400" size={20} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};