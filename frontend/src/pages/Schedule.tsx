import { useState, useEffect } from 'react';
import { Calendar, Clock, Plus, User, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, addWeeks, subWeeks, parseISO, isToday } from 'date-fns';
import { useAppStore } from '../stores/useAppStore';
import toast from 'react-hot-toast';

// Import components we'll create
import { AppointmentCard } from '../components/Schedule/AppointmentCard';
import { AppointmentModal } from '../components/Schedule/AppointmentModal';
import { appointmentService } from '../services/appointment.service';

const Schedule = () => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date()));
  const [appointments, setAppointments] = useState([]);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [selectedTimeSlot, setSelectedTimeSlot] = useState(null);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [loading, setLoading] = useState(false);
  const [viewType, setViewType] = useState('week'); // 'day', 'week', 'month'

  // Time slots from 8 AM to 6 PM in 15-minute intervals
  const timeSlots = [];
  for (let hour = 8; hour < 18; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      timeSlots.push({
        time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
        hour,
        minute
      });
    }
  }

  // Fetch appointments for current week
  useEffect(() => {
    fetchAppointments();
  }, [weekStart]);

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const startDate = format(weekStart, 'yyyy-MM-dd\'T\'HH:mm:ss.SSSxxx');
      const endDate = format(endOfWeek(weekStart), 'yyyy-MM-dd\'T\'23:59:59.999xxx');

      const response = await appointmentService.getAppointments({
        start: startDate,
        end: endDate
      });

      setAppointments(response.data || []);
    } catch (error) {
      console.error('Failed to load appointments:', error);
      toast.error('Failed to load appointments');
    } finally {
      setLoading(false);
    }
  };

  const weekDays = eachDayOfInterval({
    start: weekStart,
    end: endOfWeek(weekStart)
  });

  const getAppointmentsForSlot = (day, timeSlot) => {
    return appointments.filter(apt => {
      try {
        const aptDate = parseISO(apt.start);
        return isSameDay(aptDate, day) &&
               format(aptDate, 'HH:mm') === timeSlot.time;
      } catch (error) {
        console.warn('Invalid appointment date:', apt.start);
        return false;
      }
    });
  };

  const handleSlotClick = (day, timeSlot) => {
    setSelectedDate(day);
    setSelectedTimeSlot(timeSlot);
    setSelectedAppointment(null);
    setShowAppointmentModal(true);
  };

  const handleAppointmentClick = (appointment) => {
    setSelectedAppointment(appointment);
    setSelectedDate(parseISO(appointment.start));
    setSelectedTimeSlot(null);
    setShowAppointmentModal(true);
  };

  const getStatusColor = (status) => {
    const colors = {
      'booked': 'bg-blue-100 text-blue-800 border-blue-200',
      'arrived': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'fulfilled': 'bg-green-100 text-green-800 border-green-200',
      'cancelled': 'bg-red-100 text-red-800 border-red-200',
      'noshow': 'bg-gray-100 text-gray-600 border-gray-200'
    };
    return colors[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Calendar className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold text-gray-900">Schedule</h1>
          </div>

          <div className="flex items-center space-x-4">
            {/* View Type Selector */}
            <div className="flex rounded-lg border border-gray-200">
              {['Day', 'Week', 'Month'].map((view) => (
                <button
                  key={view}
                  onClick={() => setViewType(view.toLowerCase())}
                  className={`px-4 py-2 text-sm font-medium ${
                    viewType === view.toLowerCase()
                      ? 'bg-primary text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  } ${
                    view === 'Day' ? 'rounded-l-lg' : view === 'Month' ? 'rounded-r-lg' : ''
                  }`}
                >
                  {view}
                </button>
              ))}
            </div>

            {/* Week Navigation */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setWeekStart(subWeeks(weekStart, 1))}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-sm font-medium px-3">
                {format(weekStart, 'MMM d')} - {format(endOfWeek(weekStart), 'MMM d, yyyy')}
              </span>
              <button
                onClick={() => setWeekStart(addWeeks(weekStart, 1))}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={() => setWeekStart(startOfWeek(new Date()))}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Today
            </button>

            <button
              onClick={() => {
                setSelectedAppointment(null);
                setSelectedTimeSlot(null);
                setShowAppointmentModal(true);
              }}
              className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Appointment
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="flex-1 overflow-auto bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="min-w-[1200px]">
            {/* Day Headers */}
            <div className="grid grid-cols-8 bg-white border-b sticky top-0 z-10">
              <div className="p-3 text-xs font-medium text-gray-500 border-r">TIME</div>
              {weekDays.map((day) => (
                <div
                  key={day.toISOString()}
                  className={`p-3 text-center border-r ${
                    isToday(day) ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="text-xs font-medium text-gray-500">
                    {format(day, 'EEE')}
                  </div>
                  <div className={`text-lg font-semibold ${
                    isToday(day) ? 'text-primary' : 'text-gray-900'
                  }`}>
                    {format(day, 'd')}
                  </div>
                </div>
              ))}
            </div>

            {/* Time Slots */}
            <div className="bg-white">
              {timeSlots.map((slot) => (
                <div key={slot.time} className="grid grid-cols-8 border-b">
                  <div className="p-2 text-xs font-medium text-gray-500 border-r bg-gray-50">
                    {slot.time}
                  </div>
                  {weekDays.map((day) => {
                    const slotAppointments = getAppointmentsForSlot(day, slot);
                    return (
                      <div
                        key={`${day}-${slot.time}`}
                        className="relative p-1 border-r min-h-[60px] hover:bg-gray-50 cursor-pointer"
                        onClick={() => handleSlotClick(day, slot)}
                      >
                        {slotAppointments.map((apt, index) => (
                          <AppointmentCard
                            key={apt.id}
                            appointment={apt}
                            getStatusColor={getStatusColor}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAppointmentClick(apt);
                            }}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Appointment Modal */}
      {showAppointmentModal && (
        <AppointmentModal
          selectedDate={selectedDate}
          selectedTimeSlot={selectedTimeSlot}
          appointment={selectedAppointment}
          onClose={() => {
            setShowAppointmentModal(false);
            setSelectedTimeSlot(null);
            setSelectedAppointment(null);
          }}
          onSuccess={() => {
            fetchAppointments();
            setShowAppointmentModal(false);
            setSelectedTimeSlot(null);
            setSelectedAppointment(null);
            toast.success(selectedAppointment ? 'Appointment updated successfully' : 'Appointment scheduled successfully');
          }}
        />
      )}
    </div>
  );
};

export default Schedule;