import { ReactNode, useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Calendar,
  ClipboardList,
  Activity,
  Settings,
  Bell,
  ChevronLeft,
  ChevronRight,
  Clock,
  AlertCircle,
  Database
} from 'lucide-react';
import { useAppStore } from '../../stores/useAppStore';
import { format } from 'date-fns';

interface MainLayoutProps {
  children: ReactNode;
}

const MainLayout = ({ children }: MainLayoutProps) => {
  const location = useLocation();
  const { sidebarOpen, toggleSidebar, waitingQueue } = useAppStore();
  const [useMockData, setUseMockData] = useState(true);

  useEffect(() => {
    // Initialize mock data setting from localStorage
    const savedSetting = localStorage.getItem('USE_MOCK_DATA');
    setUseMockData(savedSetting !== 'false');
  }, []);

  const toggleMockData = () => {
    const newValue = !useMockData;
    setUseMockData(newValue);
    localStorage.setItem('USE_MOCK_DATA', newValue.toString());
    window.location.reload(); // Reload to apply changes
  };

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Patients', href: '/patients', icon: Users },
    { name: 'Schedule', href: '/schedule', icon: Calendar },
    { name: 'Encounters', href: '/encounters', icon: ClipboardList },
    { name: 'Reports', href: '/reports', icon: Activity },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const urgentCount = waitingQueue.filter(p => p.triage_priority === 'urgent').length;
  const waitingCount = waitingQueue.filter(p => p.status === 'waiting').length;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-64' : 'w-20'} bg-white shadow-lg transition-all duration-300 flex flex-col`}>
        {/* Logo Section */}
        <div className="flex h-16 items-center justify-between px-4 bg-gradient-to-r from-primary to-primary/80">
          <h1 className={`${sidebarOpen ? 'block' : 'hidden'} text-white font-bold text-xl`}>
            UrgentCare EMR
          </h1>
          <button
            onClick={toggleSidebar}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
          >
            {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
          </button>
        </div>

        {/* Quick Stats (Urgent Care Specific) */}
        {sidebarOpen && (
          <div className="px-4 py-3 bg-gray-50 border-b">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Waiting:</span>
              <span className="font-semibold text-primary">{waitingCount}</span>
            </div>
            {urgentCount > 0 && (
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-red-600">Urgent:</span>
                <span className="font-semibold text-red-600">{urgentCount}</span>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 px-4 py-4">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex items-center px-3 py-2.5 mb-1 rounded-lg transition-all ${isActive
                    ? 'bg-primary text-white shadow-md'
                    : 'text-gray-700 hover:bg-gray-100'
                  }`}
              >
                <Icon size={20} />
                {sidebarOpen && (
                  <span className="ml-3">{item.name}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Section */}
        <div className="border-t p-4">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white font-semibold">
              DR
            </div>
            {sidebarOpen && (
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700">Dr. Smith</p>
                <p className="text-xs text-gray-500">Provider</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="bg-white shadow-sm h-16 flex items-center justify-between px-6">
          <div className="flex items-center space-x-4">
            <h2 className="text-xl font-semibold text-gray-800">
              {navigation.find(n => n.href === location.pathname)?.name || 'Urgent Care EMR'}
            </h2>
            {/* Current Date/Time for Urgent Care */}
            <div className="flex items-center text-sm text-gray-500">
              <Clock size={16} className="mr-1" />
              {format(new Date(), 'EEEE, MMM d, yyyy h:mm a')}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            {/* Mock Data Indicator */}
            {useMockData && (
              <div className="flex items-center bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm">
                <Database size={16} className="mr-1" />
                Demo Mode
              </div>
            )}

            {/* Urgent Alert Indicator */}
            {urgentCount > 0 && (
              <div className="flex items-center bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm">
                <AlertCircle size={16} className="mr-1" />
                {urgentCount} Urgent
              </div>
            )}

            {/* Data Source Toggle */}
            <button
              onClick={toggleMockData}
              className="px-3 py-1 text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              title={useMockData ? 'Switch to Live Data' : 'Switch to Demo Data'}
            >
              {useMockData ? 'Switch to Live' : 'Switch to Demo'}
            </button>

            {/* Notifications */}
            <button className="relative text-gray-600 hover:text-gray-800">
              <Bell size={20} />
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></span>
            </button>

            {/* Quick Actions */}
            <button className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 text-sm font-medium">
              New Walk-in
            </button>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default MainLayout;