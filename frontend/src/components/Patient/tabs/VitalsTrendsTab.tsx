import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Activity, TrendingUp, Calendar, Download } from 'lucide-react';
import { format } from 'date-fns';

export const VitalsTrendsTab = () => {
  const [selectedRange, setSelectedRange] = useState('6m');
  const [selectedVital, setSelectedVital] = useState('all');

  // Mock vitals data - replace with API call
  const vitalsData = [
    { date: '2024-01-01', bp_systolic: 120, bp_diastolic: 80, heart_rate: 72, temperature: 98.6, weight: 175, oxygen: 98 },
    { date: '2024-01-15', bp_systolic: 118, bp_diastolic: 78, heart_rate: 70, temperature: 98.4, weight: 174, oxygen: 99 },
    { date: '2024-02-01', bp_systolic: 122, bp_diastolic: 82, heart_rate: 75, temperature: 98.7, weight: 176, oxygen: 98 },
    { date: '2024-02-15', bp_systolic: 125, bp_diastolic: 83, heart_rate: 73, temperature: 98.5, weight: 175, oxygen: 97 },
    { date: '2024-03-01', bp_systolic: 119, bp_diastolic: 79, heart_rate: 71, temperature: 98.6, weight: 173, oxygen: 99 },
    { date: '2024-03-15', bp_systolic: 121, bp_diastolic: 81, heart_rate: 74, temperature: 98.8, weight: 174, oxygen: 98 },
  ].map(v => ({
    ...v,
    date: format(new Date(v.date), 'MMM dd'),
  }));

  const timeRanges = [
    { value: '1m', label: '1 Month' },
    { value: '3m', label: '3 Months' },
    { value: '6m', label: '6 Months' },
    { value: '1y', label: '1 Year' },
    { value: 'all', label: 'All Time' },
  ];

  const vitalTypes = [
    { value: 'all', label: 'All Vitals' },
    { value: 'bp', label: 'Blood Pressure' },
    { value: 'hr', label: 'Heart Rate' },
    { value: 'temp', label: 'Temperature' },
    { value: 'weight', label: 'Weight' },
    { value: 'oxygen', label: 'O₂ Saturation' },
  ];

  const latestVitals = vitalsData[vitalsData.length - 1];

  return (
    <div className="p-6 space-y-6">
      {/* Header Controls */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">Vitals Trends</h2>
        <div className="flex items-center gap-4">
          {/* Time Range Selector */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {timeRanges.map((range) => (
              <button
                key={range.value}
                onClick={() => setSelectedRange(range.value)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  selectedRange === range.value
                    ? 'bg-white text-primary shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>

          {/* Download Button */}
          <button className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
            <Download size={16} />
            Export
          </button>
        </div>
      </div>

      {/* Current Vitals Summary */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-600 mb-1">Blood Pressure</div>
          <div className="text-xl font-bold text-gray-900">
            {latestVitals.bp_systolic}/{latestVitals.bp_diastolic}
          </div>
          <div className="text-xs text-gray-500 mt-1">mmHg</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-600 mb-1">Heart Rate</div>
          <div className="text-xl font-bold text-gray-900">{latestVitals.heart_rate}</div>
          <div className="text-xs text-gray-500 mt-1">bpm</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-600 mb-1">Temperature</div>
          <div className="text-xl font-bold text-gray-900">{latestVitals.temperature}</div>
          <div className="text-xs text-gray-500 mt-1">°F</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-600 mb-1">Weight</div>
          <div className="text-xl font-bold text-gray-900">{latestVitals.weight}</div>
          <div className="text-xs text-gray-500 mt-1">lbs</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-600 mb-1">O₂ Saturation</div>
          <div className="text-xl font-bold text-gray-900">{latestVitals.oxygen}</div>
          <div className="text-xs text-gray-500 mt-1">%</div>
        </div>
        <div className="bg-white rounded-lg border p-4">
          <div className="text-sm text-gray-600 mb-1">BMI</div>
          <div className="text-xl font-bold text-gray-900">26.4</div>
          <div className="text-xs text-gray-500 mt-1">kg/m²</div>
        </div>
      </div>

      {/* Vital Type Selector */}
      <div className="flex gap-2">
        {vitalTypes.map((type) => (
          <button
            key={type.value}
            onClick={() => setSelectedVital(type.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedVital === type.value
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {type.label}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Blood Pressure Chart */}
        {(selectedVital === 'all' || selectedVital === 'bp') && (
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Blood Pressure</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={vitalsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[60, 140]} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="bp_systolic"
                  stroke="#ef4444"
                  name="Systolic"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="bp_diastolic"
                  stroke="#3b82f6"
                  name="Diastolic"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Heart Rate Chart */}
        {(selectedVital === 'all' || selectedVital === 'hr') && (
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Heart Rate</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={vitalsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[50, 100]} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="heart_rate"
                  stroke="#10b981"
                  name="Heart Rate (bpm)"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Weight Chart */}
        {(selectedVital === 'all' || selectedVital === 'weight') && (
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Weight</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={vitalsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[170, 180]} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="weight"
                  stroke="#8b5cf6"
                  name="Weight (lbs)"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* O2 Saturation Chart */}
        {(selectedVital === 'all' || selectedVital === 'oxygen') && (
          <div className="bg-white rounded-lg border p-4">
            <h3 className="font-semibold text-gray-900 mb-4">Oxygen Saturation</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={vitalsData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[94, 100]} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="oxygen"
                  stroke="#06b6d4"
                  name="O₂ Saturation (%)"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};