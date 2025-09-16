import { useState } from 'react';
import { Calendar, FileText, Clock, AlertCircle } from 'lucide-react';
import { useEncounterStore } from '../../../stores/useEncounterStore';

export const ReviewStage = () => {
  const { currentEncounter, updateReview, templates, applyTemplate } = useEncounterStore();
  const [showTemplates, setShowTemplates] = useState(false);

  return (
    <div className="p-6 max-w-4xl">
      <h2 className="text-xl font-bold text-gray-900 mb-6">Review</h2>

      {/* Chief Complaint */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Chief Complaint <span className="text-red-500">*</span>
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={currentEncounter?.review.chief_complaint || ''}
            onChange={(e) => updateReview({ chief_complaint: e.target.value })}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            placeholder="Enter chief complaint..."
          />
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <FileText size={20} />
          </button>
        </div>
      </div>

      {/* Template Selector */}
      {showTemplates && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium text-sm text-gray-700 mb-3">Quick Templates</h3>
          <div className="grid grid-cols-2 gap-2">
            {templates.map((template) => (
              <button
                key={template.id}
                onClick={() => {
                  applyTemplate(template.id);
                  setShowTemplates(false);
                }}
                className="text-left p-3 bg-white rounded hover:bg-primary hover:text-white transition-colors"
              >
                <p className="font-medium text-sm">{template.name}</p>
                <p className="text-xs opacity-75">{template.chief_complaint}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Reason for Visit */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Reason for Visit
        </label>
        <textarea
          value={currentEncounter?.review.reason_for_visit || ''}
          onChange={(e) => updateReview({ reason_for_visit: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          rows={3}
          placeholder="Describe the reason for today's visit..."
        />
      </div>

      {/* Onset & Duration */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Calendar size={16} className="inline mr-1" />
            Onset Date
          </label>
          <input
            type="date"
            value={currentEncounter?.review.onset_date || ''}
            onChange={(e) => updateReview({ onset_date: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Clock size={16} className="inline mr-1" />
            Duration
          </label>
          <select
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            <option>Less than 24 hours</option>
            <option>1-3 days</option>
            <option>4-7 days</option>
            <option>1-2 weeks</option>
            <option>More than 2 weeks</option>
          </select>
        </div>
      </div>

      {/* Interval History */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Interval History
        </label>
        <textarea
          value={currentEncounter?.review.interval_history || ''}
          onChange={(e) => updateReview({ interval_history: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
          rows={4}
          placeholder="Any changes since last visit? New symptoms, medications, or concerns..."
        />
      </div>

      {/* Quick Actions */}
      <div className="flex justify-between items-center p-4 bg-blue-50 rounded-lg">
        <div className="flex items-center gap-2">
          <AlertCircle className="text-blue-600" size={20} />
          <p className="text-sm text-blue-900">
            Remember to verify allergies and current medications
          </p>
        </div>
        <button className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90">
          Next: HPI
        </button>
      </div>
    </div>
  );
};