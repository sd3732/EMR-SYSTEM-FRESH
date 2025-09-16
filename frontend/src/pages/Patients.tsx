import { Link } from 'react-router-dom';

export default function Patients() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
        <Link
          to="/patients/new"
          className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors"
        >
          Add Patient
        </Link>
      </div>

      <div className="bg-white shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="text-center py-12">
            <div className="text-gray-400 text-lg mb-2">No patients found</div>
            <div className="text-gray-500 text-sm">
              Patient management functionality will be implemented in subsequent phases.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}