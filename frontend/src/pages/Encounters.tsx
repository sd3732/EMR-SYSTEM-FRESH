import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import {
  Search,
  Filter,
  Calendar,
  User,
  Clock,
  CheckCircle,
  AlertCircle,
  FileText,
  Eye,
  Plus
} from 'lucide-react';
import { encounterService } from '../services/appointment.service';
import { NavigationService } from '../services/navigationService';
import toast from 'react-hot-toast';

interface Encounter {
  id: number;
  patient_id: number;
  patient_name: string;
  patient: any;
  provider_id: number;
  provider_name: string;
  encounter_date: string;
  start_time: string;
  end_time: string;
  status: 'in-progress' | 'completed' | 'cancelled';
  chief_complaint: string;
  diagnosis?: string;
  visit_type: string;
  room?: string;
  duration_minutes: number;
  vitals?: any;
  notes?: string;
}

export default function Encounters() {
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState({
    start: format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'), // Last 7 days
    end: format(new Date(), 'yyyy-MM-dd')
  });

  useEffect(() => {
    loadEncounters();
  }, [statusFilter, dateRange]);

  const loadEncounters = async () => {
    setLoading(true);
    try {
      const filters = {
        status: statusFilter,
        date_range: {
          start: dateRange.start,
          end: dateRange.end
        }
      };

      const response = await encounterService.getEncounters(filters);
      setEncounters(response.data);
    } catch (error) {
      console.error('Failed to load encounters:', error);
      toast.error('Failed to load encounters');
    } finally {
      setLoading(false);
    }
  };

  const filteredEncounters = encounters.filter(encounter => {
    if (!searchTerm) return true;

    const search = searchTerm.toLowerCase();
    return (
      encounter.patient_name.toLowerCase().includes(search) ||
      encounter.chief_complaint.toLowerCase().includes(search) ||
      encounter.diagnosis?.toLowerCase().includes(search) ||
      encounter.provider_name.toLowerCase().includes(search)
    );
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={16} className="text-green-600" />;
      case 'in-progress':
        return <Clock size={16} className="text-blue-600" />;
      case 'cancelled':
        return <AlertCircle size={16} className="text-gray-600" />;
      default:
        return <Clock size={16} className="text-gray-600" />;
    }
  };

  const handleViewEncounter = (encounterId: number) => {
    // Navigate to the 5-stage encounter workflow
    const encounter = encounters.find(e => e.id === encounterId);
    if (encounter) {
      window.location.href = `/encounter/${encounter.patient_id}?encounter_id=${encounterId}`;
    }
  };

  const handleViewPatient = (patientId: number) => {
    NavigationService.openPatientChart(patientId);
  };

  const handleCreateEncounter = () => {
    // Navigate to dashboard to start new encounter from queue
    window.location.href = '/';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Loading encounters...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Encounters</h1>
          <p className="text-gray-600 mt-1">Manage and review patient encounters</p>
        </div>
        <button
          onClick={handleCreateEncounter}
          className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <Plus size={16} />
          Start from Queue
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search size={20} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="text"
              placeholder="Search encounters..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <div className="relative">
            <Filter size={20} className="absolute left-3 top-3 text-gray-400" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent appearance-none"
            >
              <option value="all">All Status</option>
              <option value="in-progress">In Progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          {/* Date Range */}
          <div className="relative">
            <Calendar size={20} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div className="relative">
            <Calendar size={20} className="absolute left-3 top-3 text-gray-400" />
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </div>
      </div>

      {/* Encounters List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          {filteredEncounters.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No encounters found</h3>
              <p className="mt-1 text-sm text-gray-500">
                {searchTerm || statusFilter !== 'all'
                  ? 'Try adjusting your search or filters.'
                  : 'Get started by creating a new encounter.'
                }
              </p>
            </div>
          ) : (
            <div className="overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Patient
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date & Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Chief Complaint
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Provider
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Duration
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredEncounters.map((encounter) => (
                    <tr key={encounter.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-10 w-10">
                            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="h-5 w-5 text-primary" />
                            </div>
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900">
                              {encounter.patient_name}
                            </div>
                            <div className="text-sm text-gray-500">
                              {encounter.patient?.mrn || `ID: ${encounter.patient_id}`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {format(new Date(encounter.encounter_date), 'MMM dd, yyyy')}
                        </div>
                        <div className="text-sm text-gray-500">
                          {encounter.start_time} - {encounter.end_time}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {encounter.chief_complaint}
                        </div>
                        {encounter.diagnosis && (
                          <div className="text-sm text-gray-500 mt-1">
                            Dx: {encounter.diagnosis}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {encounter.provider_name}
                        </div>
                        <div className="text-sm text-gray-500">
                          {encounter.visit_type}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(encounter.status)}`}>
                          {getStatusIcon(encounter.status)}
                          {encounter.status.replace('-', ' ')}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {encounter.duration_minutes} min
                        {encounter.room && (
                          <div className="text-xs text-gray-500">
                            {encounter.room}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                        <button
                          onClick={() => handleViewEncounter(encounter.id)}
                          className="text-primary hover:text-primary/80 inline-flex items-center gap-1"
                          title="View Encounter Details"
                        >
                          <Eye size={14} />
                          View
                        </button>
                        <button
                          onClick={() => handleViewPatient(encounter.patient_id)}
                          className="text-gray-600 hover:text-gray-800 inline-flex items-center gap-1"
                          title="View Patient Profile"
                        >
                          <User size={14} />
                          Patient
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Completed</p>
              <p className="text-2xl font-semibold text-gray-900">
                {filteredEncounters.filter(e => e.status === 'completed').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Clock className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">In Progress</p>
              <p className="text-2xl font-semibold text-gray-900">
                {filteredEncounters.filter(e => e.status === 'in-progress').length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <Calendar className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Total Today</p>
              <p className="text-2xl font-semibold text-gray-900">
                {filteredEncounters.filter(e =>
                  format(new Date(e.encounter_date), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                ).length}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <User className="h-8 w-8 text-orange-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-500">Avg Duration</p>
              <p className="text-2xl font-semibold text-gray-900">
                {filteredEncounters.length > 0
                  ? Math.round(filteredEncounters.reduce((acc, e) => acc + e.duration_minutes, 0) / filteredEncounters.length)
                  : 0
                } min
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}