import { Clock, Users, Activity, TrendingUp, AlertCircle, Home } from 'lucide-react';
import { useQueueStore } from '../../stores/useQueueStore';

export const MetricsCards = () => {
  const { metrics, queue } = useQueueStore();

  const urgentCount = queue.filter(p => p.triage_priority === 'urgent' || p.triage_priority === 'emergent').length;
  const waitingCount = queue.filter(p => p.status === 'waiting' || p.status === 'triaged').length;

  const cards = [
    {
      title: 'Waiting',
      value: waitingCount,
      subtitle: `Avg wait: ${metrics?.average_wait_time || 0} min`,
      icon: Clock,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      title: 'In Treatment',
      value: metrics?.total_in_treatment || 0,
      subtitle: `${metrics?.provider_count || 0} providers active`,
      icon: Activity,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
    },
    {
      title: 'Urgent/Emergent',
      value: urgentCount,
      subtitle: urgentCount > 0 ? 'Requires immediate attention' : 'No urgent cases',
      icon: AlertCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
    },
    {
      title: 'Rooms Available',
      value: `${metrics?.available_rooms || 0}/${metrics?.total_rooms || 12}`,
      subtitle: 'Treatment rooms',
      icon: Home,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
    },
    {
      title: 'Seen Today',
      value: metrics?.total_discharged_today || 0,
      subtitle: 'Completed visits',
      icon: TrendingUp,
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.title}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-gray-600 uppercase tracking-wider">
                  {card.title}
                </p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{card.value}</p>
                <p className="mt-1 text-xs text-gray-500">{card.subtitle}</p>
              </div>
              <div className={`${card.bgColor} p-2 rounded-lg`}>
                <Icon className={`w-5 h-5 ${card.color}`} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};