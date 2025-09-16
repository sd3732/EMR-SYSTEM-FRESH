import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MainLayout from './components/Layout/MainLayout';
import { ToastProvider } from './components/common/ToastProvider';
import PatientProfile from './pages/PatientProfile';
import EncounterLayout from './components/Encounter/EncounterLayout';
import Schedule from './pages/Schedule';
import Encounters from './pages/Encounters';
import { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { MetricsCards } from './components/Dashboard/MetricsCards';
import { QueueBoard } from './components/Dashboard/QueueBoard';
import { QuickRegistration } from './components/Dashboard/QuickRegistration';
import { useQueueStore } from './stores/useQueueStore';

const Dashboard = () => {
  const [showRegistration, setShowRegistration] = useState(false);
  const { setQueue, setMetrics } = useQueueStore();

  // Load initial data from centralized mock service
  useEffect(() => {
    fetchDashboardData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(interval);
  }, [setQueue, setMetrics]);

  const fetchDashboardData = async () => {
    try {
      // Import services here to avoid circular dependencies
      const { queueService } = await import('./services/appointment.service');

      // Get queue patients and metrics from centralized mock data
      const [queueResponse, metricsResponse] = await Promise.all([
        queueService.getQueue(),
        queueService.getMetrics()
      ]);

      setQueue(queueResponse.data);
      setMetrics(metricsResponse.data);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
      // Fallback to original mock data if needed
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Urgent Care Dashboard</h1>
        <button
          onClick={() => setShowRegistration(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
        >
          <Plus size={20} />
          New Walk-in
        </button>
      </div>

      <MetricsCards />
      <QueueBoard />

      <QuickRegistration
        isOpen={showRegistration}
        onClose={() => setShowRegistration(false)}
      />
    </div>
  );
};

const Patients = () => {
  const navigate = useNavigate();

  const mockPatients = [
    { id: 1, name: 'John Doe', mrn: 'MRN-000001', age: 45, lastVisit: '2024-01-15' },
    { id: 2, name: 'Jane Smith', mrn: 'MRN-000002', age: 32, lastVisit: '2024-01-10' },
    { id: 3, name: 'Robert Johnson', mrn: 'MRN-000003', age: 67, lastVisit: '2024-01-08' },
  ];

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Patients</h1>
      <div className="bg-white rounded-lg shadow">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Patient
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                MRN
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Age
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Visit
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {mockPatients.map((patient) => (
              <tr key={patient.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{patient.name}</div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {patient.mrn}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {patient.age}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {patient.lastVisit}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm">
                  <button
                    onClick={() => navigate(`/patients/${patient.id}`)}
                    className="text-primary hover:text-primary/80"
                  >
                    View Profile
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};



const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <ToastProvider />
        <Routes>
          <Route path="/" element={<MainLayout><Dashboard /></MainLayout>} />
          <Route path="/patients" element={<MainLayout><Patients /></MainLayout>} />
          <Route path="/patients/:patientId" element={<MainLayout><PatientProfile /></MainLayout>} />
          <Route path="/encounter/:patientId" element={<EncounterLayout />} />
          <Route path="/schedule" element={<MainLayout><Schedule /></MainLayout>} />
          <Route path="/encounters" element={<MainLayout><Encounters /></MainLayout>} />
          <Route path="/reports" element={<MainLayout><div className="p-6">Reports</div></MainLayout>} />
          <Route path="/settings" element={<MainLayout><div className="p-6">Settings</div></MainLayout>} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;