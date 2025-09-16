import { Shield, Calendar, CheckCircle, AlertCircle, Clock, ChevronRight } from 'lucide-react';
import { format, addMonths, isPast } from 'date-fns';

export const PreventiveCareTab = () => {
  const preventiveCareItems = [
    {
      id: 1,
      name: 'Annual Physical Exam',
      category: 'screening',
      lastCompleted: '2024-01-10',
      frequency: 'Yearly',
      nextDue: '2025-01-10',
      status: 'upcoming',
      provider: 'Primary Care',
    },
    {
      id: 2,
      name: 'Flu Vaccine',
      category: 'immunization',
      lastCompleted: '2023-10-15',
      frequency: 'Yearly',
      nextDue: '2024-10-15',
      status: 'due',
      provider: 'Any Provider',
    },
    {
      id: 3,
      name: 'Colonoscopy',
      category: 'screening',
      lastCompleted: '2019-06-20',
      frequency: 'Every 10 years',
      nextDue: '2029-06-20',
      status: 'completed',
      provider: 'Gastroenterology',
    },
    {
      id: 4,
      name: 'Blood Pressure Check',
      category: 'screening',
      lastCompleted: '2024-03-15',
      frequency: 'Every 3 months',
      nextDue: '2024-06-15',
      status: 'upcoming',
      provider: 'Primary Care',
    },
    {
      id: 5,
      name: 'Cholesterol Screening',
      category: 'screening',
      lastCompleted: '2023-08-20',
      frequency: 'Every 5 years',
      nextDue: '2024-08-20',
      status: 'overdue',
      provider: 'Primary Care',
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600 bg-green-50';
      case 'upcoming': return 'text-blue-600 bg-blue-50';
      case 'due': return 'text-yellow-600 bg-yellow-50';
      case 'overdue': return 'text-red-600 bg-red-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle size={16} />;
      case 'upcoming': return <Clock size={16} />;
      case 'due': return <AlertCircle size={16} />;
      case 'overdue': return <AlertCircle size={16} />;
      default: return null;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'immunization': return '💉';
      case 'screening': return '🔍';
      case 'counseling': return '💬';
      default: return '📋';
    }
  };

  const overdueCount = preventiveCareItems.filter(item => item.status === 'overdue').length;
  const dueCount = preventiveCareItems.filter(item => item.status === 'due').length;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Preventive Care</h2>
          <p className="text-sm text-gray-600 mt-1">
            Track and manage preventive health measures
          </p>
        </div>
        <button className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">
          Schedule Appointment
        </button>
      </div>

      {/* Alert Banner */}
      {(overdueCount > 0 || dueCount > 0) && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-3">
            <Shield className="text-yellow-600" size={24} />
            <div>
              <p className="font-semibold text-yellow-900">Preventive Care Needed</p>
              <p className="text-sm text-yellow-700 mt-1">
                {overdueCount > 0 && `${overdueCount} overdue`}
                {overdueCount > 0 && dueCount > 0 && ', '}
                {dueCount > 0 && `${dueCount} due soon`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Preventive Care Items */}
      <div className="space-y-4">
        {preventiveCareItems.map((item) => (
          <div key={item.id} className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="text-2xl">{getCategoryIcon(item.category)}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold">{item.name}</h3>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${getStatusColor(item.status)}`}>
                      {getStatusIcon(item.status)}
                      {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2 text-sm text-gray-600">
                    <div>
                      <span className="text-gray-500">Frequency:</span> {item.frequency}
                    </div>
                    <div>
                      <span className="text-gray-500">Last Done:</span> {format(new Date(item.lastCompleted), 'MM/dd/yyyy')}
                    </div>
                    <div>
                      <span className="text-gray-500">Next Due:</span> {format(new Date(item.nextDue), 'MM/dd/yyyy')}
                    </div>
                    <div>
                      <span className="text-gray-500">Provider:</span> {item.provider}
                    </div>
                  </div>
                </div>
              </div>
              <button className="p-2 hover:bg-gray-100 rounded">
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Recommendations */}
      <div className="mt-6 bg-blue-50 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-3">Recommended Screenings Based on Age & Risk Factors</h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start gap-2">
            <CheckCircle size={16} className="mt-0.5 text-blue-600" />
            <span>Annual blood pressure screening (age 40+)</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle size={16} className="mt-0.5 text-blue-600" />
            <span>Cholesterol check every 5 years (age 40+)</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle size={16} className="mt-0.5 text-blue-600" />
            <span>Diabetes screening every 3 years (age 45+)</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle size={16} className="mt-0.5 text-blue-600" />
            <span>Annual flu vaccine (all ages)</span>
          </li>
        </ul>
      </div>
    </div>
  );
};