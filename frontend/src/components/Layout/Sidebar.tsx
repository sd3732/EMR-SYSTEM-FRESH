import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/utils/helpers';
import { NAV_ITEMS } from '@/utils/constants';
import * as Icons from 'lucide-react';

export default function Sidebar() {
  const location = useLocation();

  const getIcon = (iconName: string) => {
    const IconComponent = Icons[iconName as keyof typeof Icons] as any;
    return IconComponent ? <IconComponent className="w-5 h-5" /> : null;
  };

  return (
    <div className="flex flex-col w-64 bg-white shadow-lg">
      {/* Logo */}
      <div className="flex items-center justify-center h-16 px-4 border-b border-gray-200">
        <h1 className="text-xl font-bold text-primary">EMR System</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.href;

          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                isActive
                  ? 'bg-primary text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              )}
            >
              {getIcon(item.icon)}
              <span className="ml-3">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User Info */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
            <span className="text-white text-sm font-semibold">Dr</span>
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-gray-700">Dr. Smith</p>
            <p className="text-xs text-gray-500">Provider</p>
          </div>
        </div>
      </div>
    </div>
  );
}