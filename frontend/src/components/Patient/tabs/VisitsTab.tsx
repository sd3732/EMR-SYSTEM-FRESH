import { useState } from 'react';
import { Calendar, ChevronRight, FileText, User, Clock, MapPin } from 'lucide-react';
import { format } from 'date-fns';

export const VisitsTab = () => {
  const [expandedVisit, setExpandedVisit] = useState<number | null>(null);

  // Mock encounters data
  const encounters = [
    {
      id: 1,
      date: '2024-03-15',
      type: 'Urgent Care Visit',
      chief_complaint: 'Sore throat and fever',
      provider: 'Dr. Sarah Johnson',
      location: 'Main Campus',
      diagnoses: ['Streptococcal pharyngitis', 'Fever'],
      notes: 'Patient presented with 3-day history of sore throat and fever. Rapid strep test positive.',
      vitals: { bp: '120/80', hr: 88, temp: 101.2, weight: 175 },
      orders: ['Rapid Strep Test', 'Amoxicillin 500mg'],
    },
    {
      id: 2,
      date: '2024-02-01',
      type: 'Follow-up Visit',
      chief_complaint: 'Hypertension follow-up',
      provider: 'Dr. Michael Chen',
      location: 'Main Campus',
      diagnoses: ['Essential hypertension'],
      notes: 'Blood pressure well controlled on current medication. Continue current regimen.',
      vitals: { bp: '118/78', hr: 72, temp: 98.6, weight: 174 },
      orders: ['Basic Metabolic Panel', 'Lipid Panel'],
    },
    {
      id: 3,
      date: '2024-01-10',
      type: 'Annual Physical',
      chief_complaint: 'Annual wellness exam',
      provider: 'Dr. Sarah Johnson',
      location: 'Main Campus',
      diagnoses: ['Health maintenance', 'Vitamin D deficiency'],
      notes: 'Comprehensive physical exam completed. Overall health good.',
      vitals: { bp: '122/82', hr: 70, temp: 98.4, weight: 176 },
      orders: ['Complete Blood Count', 'Comprehensive Metabolic Panel', 'Vitamin D supplement'],
    },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Visit History</h2>
        <div className="flex items-center gap-3">
          <select className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option>All Visit Types</option>
            <option>Urgent Care</option>
            <option>Follow-up</option>
            <option>Physical</option>
          </select>
          <select className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
            <option>Last 6 Months</option>
            <option>Last Year</option>
            <option>All Time</option>
          </select>
        </div>
      </div>

      <div className="space-y-4">
        {encounters.map((encounter) => (
          <div key={encounter.id} className="bg-white rounded-lg border overflow-hidden">
            <div
              className="p-4 cursor-pointer hover:bg-gray-50"
              onClick={() => setExpandedVisit(expandedVisit === encounter.id ? null : encounter.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Calendar className="text-primary" size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">{encounter.type}</h3>
                      <span className="text-sm text-gray-500">
                        {format(new Date(encounter.date), 'MMMM d, yyyy')}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      CC: {encounter.chief_complaint}
                    </p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <User size={12} />
                        {encounter.provider}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin size={12} />
                        {encounter.location}
                      </span>
                    </div>
                  </div>
                </div>
                <ChevronRight
                  className={`text-gray-400 transition-transform ${
                    expandedVisit === encounter.id ? 'rotate-90' : ''
                  }`}
                  size={20}
                />
              </div>
            </div>

            {expandedVisit === encounter.id && (
              <div className="border-t bg-gray-50 p-4 space-y-4">
                {/* Vitals */}
                <div>
                  <h4 className="font-medium text-sm text-gray-700 mb-2">Vital Signs</h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="bg-white p-2 rounded">
                      <span className="text-gray-500">BP:</span> {encounter.vitals.bp}
                    </div>
                    <div className="bg-white p-2 rounded">
                      <span className="text-gray-500">HR:</span> {encounter.vitals.hr} bpm
                    </div>
                    <div className="bg-white p-2 rounded">
                      <span className="text-gray-500">Temp:</span> {encounter.vitals.temp}°F
                    </div>
                    <div className="bg-white p-2 rounded">
                      <span className="text-gray-500">Weight:</span> {encounter.vitals.weight} lbs
                    </div>
                  </div>
                </div>

                {/* Diagnoses */}
                <div>
                  <h4 className="font-medium text-sm text-gray-700 mb-2">Diagnoses</h4>
                  <div className="flex flex-wrap gap-2">
                    {encounter.diagnoses.map((dx, idx) => (
                      <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full">
                        {dx}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Orders */}
                <div>
                  <h4 className="font-medium text-sm text-gray-700 mb-2">Orders</h4>
                  <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                    {encounter.orders.map((order, idx) => (
                      <li key={idx}>{order}</li>
                    ))}
                  </ul>
                </div>

                {/* Notes */}
                <div>
                  <h4 className="font-medium text-sm text-gray-700 mb-2">Visit Notes</h4>
                  <p className="text-sm text-gray-600 bg-white p-3 rounded">
                    {encounter.notes}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button className="px-4 py-2 text-sm bg-primary text-white rounded-lg hover:bg-primary/90">
                    View Full Note
                  </button>
                  <button className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-white">
                    Download Summary
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};