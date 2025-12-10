import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../services/firebase';
import { ref, onValue, set, remove, update, push } from 'firebase/database';
import { 
  ChevronLeft, ChevronRight, Calendar as CalIcon, Clock, 
  Plus, MoreHorizontal, Trash2, CheckSquare, Activity, 
  AlignLeft, X, Move
} from 'lucide-react';
import { useOS } from '../context/OSContext';

// --- Types ---
type ViewMode = 'month' | 'week' | 'day';

interface CalendarEvent {
  id: string;
  title: string;
  start: number; // timestamp
  end: number;   // timestamp
  type: 'event' | 'timeblock' | 'habit';
  linkedTaskId?: string; // If this event is a time block for a specific task
  habitId?: string; // If this is a habit instance
  description?: string;
  color?: string; // Hex override
}

// Interfaces from other apps for read-only integration
interface Task {
  id: string;
  title: string;
  dueDate: string | null; // YYYY-MM-DD
  completed: boolean;
  priority: string;
}

interface Habit {
  id: string;
  title: string;
  category: string;
  showOnCalendar?: boolean;
  time?: string;
}

interface HabitOverride {
  start: number;
  end: number;
}

// --- Helpers ---
const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
const endOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59).getTime();
const formatDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const getHoursArray = () => Array.from({ length: 24 }, (_, i) => i);

export const CalendarApp: React.FC = () => {
  const { authStatus, addLog } = useOS();

  // --- State ---
  const [view, setView] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [habitOverrides, setHabitOverrides] = useState<Record<string, HabitOverride>>({});
  
  // Interaction State
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  // New Event Form State
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventStartStr, setNewEventStartStr] = useState('09:00');
  const [newEventEndStr, setNewEventEndStr] = useState('10:00');
  const [newEventDate, setNewEventDate] = useState(formatDateKey(new Date()));
  const [linkedTask, setLinkedTask] = useState<string>(''); // Task ID

  // Realtime Line
  const [now, setNow] = useState(new Date());

  // --- Data Sync ---
  useEffect(() => {
    // Clock Tick
    const timer = setInterval(() => setNow(new Date()), 60000); // Every minute

    if (authStatus === 'connected' && auth.currentUser) {
       const uid = auth.currentUser.uid;
       
       // Load Events
       const eventsRef = ref(db, `users/${uid}/calendar/events`);
       const unsubE = onValue(eventsRef, s => setEvents(s.val() ? Object.values(s.val()) : []));
       
       // Load Tasks (ReadOnly)
       const tasksRef = ref(db, `users/${uid}/tasks`);
       const unsubT = onValue(tasksRef, s => setTasks(s.val() ? Object.values(s.val()) : []));

       // Load Habits (ReadOnly)
       const habitsRef = ref(db, `users/${uid}/habits`);
       const unsubH = onValue(habitsRef, s => setHabits(s.val() ? Object.values(s.val()) : []));

       // Load Habit Overrides
       const overridesRef = ref(db, `users/${uid}/calendar/habit_overrides`);
       const unsubO = onValue(overridesRef, s => setHabitOverrides(s.val() || {}));

       return () => { clearInterval(timer); unsubE(); unsubT(); unsubH(); unsubO(); };
    } else {
       // Local Storage
       const le = localStorage.getItem('nd_os_calendar_events');
       if (le) setEvents(JSON.parse(le));
       const lt = localStorage.getItem('nd_os_tasks');
       if (lt) setTasks(JSON.parse(lt));
       const lh = localStorage.getItem('nd_os_habits');
       if (lh) setHabits(JSON.parse(lh));
       const lo = localStorage.getItem('nd_os_habit_overrides');
       if (lo) setHabitOverrides(JSON.parse(lo));
       
       return () => clearInterval(timer);
    }
  }, [authStatus]);

  // --- Actions ---

  const saveEvents = (newEvents: CalendarEvent[]) => {
      setEvents(newEvents);
      if (authStatus !== 'connected') {
          localStorage.setItem('nd_os_calendar_events', JSON.stringify(newEvents));
      }
  };

  const saveHabitOverride = (key: string, override: HabitOverride) => {
      const newOverrides = { ...habitOverrides, [key]: override };
      setHabitOverrides(newOverrides);
      
      if (authStatus === 'connected' && auth.currentUser) {
          update(ref(db, `users/${auth.currentUser.uid}/calendar/habit_overrides`), { [key]: override });
      } else {
          localStorage.setItem('nd_os_habit_overrides', JSON.stringify(newOverrides));
      }
  };

  const createEvent = () => {
      if (!newEventTitle) return;
      
      const startDateTime = new Date(`${newEventDate}T${newEventStartStr}`);
      const endDateTime = new Date(`${newEventDate}T${newEventEndStr}`);
      
      const newEvent: CalendarEvent = {
          id: `ev_${Date.now()}`,
          title: newEventTitle,
          start: startDateTime.getTime(),
          end: endDateTime.getTime(),
          type: linkedTask ? 'timeblock' : 'event',
          linkedTaskId: linkedTask || undefined
      };

      if (authStatus === 'connected' && auth.currentUser) {
          set(ref(db, `users/${auth.currentUser.uid}/calendar/events/${newEvent.id}`), newEvent);
      } else {
          saveEvents([...events, newEvent]);
      }

      setIsCreating(false);
      setNewEventTitle('');
      setLinkedTask('');
      addLog({ source: 'Calendar', message: 'Time Block Created', type: 'success', isCloud: authStatus === 'connected' });
  };

  const deleteEvent = (id: string) => {
      if (authStatus === 'connected' && auth.currentUser) {
          remove(ref(db, `users/${auth.currentUser.uid}/calendar/events/${id}`));
      } else {
          saveEvents(events.filter(e => e.id !== id));
      }
      setSelectedEventId(null);
  };

  const handleTimeSlotClick = (date: Date, hour: number) => {
      const dStr = formatDateKey(date);
      const sStr = `${String(hour).padStart(2, '0')}:00`;
      const eStr = `${String(hour + 1).padStart(2, '0')}:00`;
      
      setNewEventDate(dStr);
      setNewEventStartStr(sStr);
      setNewEventEndStr(eStr);
      setIsCreating(true);
  };

  // --- Drag & Drop Handlers ---

  const handleDragStart = (e: React.DragEvent, eventId: string, type: string, duration: number, habitId?: string) => {
      e.dataTransfer.setData('application/json', JSON.stringify({ eventId, type, duration, habitId }));
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, date: Date, hour: number) => {
      e.preventDefault();
      const data = e.dataTransfer.getData('application/json');
      if (!data) return;
      
      const { eventId, type, duration, habitId } = JSON.parse(data);
      
      // Calculate new start/end
      const newStart = new Date(date);
      newStart.setHours(hour, 0, 0, 0); // Snap to hour for simplicity, or calc based on offsetY for precision
      const newEnd = new Date(newStart.getTime() + duration);

      if (type === 'habit' && habitId) {
          // Create specific override for this day
          const dateKey = formatDateKey(date);
          const overrideKey = `${habitId}_${dateKey}`;
          
          saveHabitOverride(overrideKey, {
              start: newStart.getTime(),
              end: newEnd.getTime()
          });
          addLog({ source: 'Calendar', message: 'Habit Rescheduled', type: 'info', isCloud: false });
      } else {
          // Update regular event
          const event = events.find(ev => ev.id === eventId);
          if (event) {
              const updatedEvent = { ...event, start: newStart.getTime(), end: newEnd.getTime() };
              if (authStatus === 'connected' && auth.currentUser) {
                  update(ref(db, `users/${auth.currentUser.uid}/calendar/events/${eventId}`), updatedEvent);
              } else {
                  saveEvents(events.map(ev => ev.id === eventId ? updatedEvent : ev));
              }
          }
      }
  };

  // --- Computations ---

  const getDaysInView = () => {
      const days = [];
      const start = new Date(currentDate);
      
      if (view === 'day') {
          days.push(new Date(start));
      } else if (view === 'week') {
          const day = start.getDay();
          // Adjust for Sunday start
          start.setDate(start.getDate() - day); 
          for (let i = 0; i < 7; i++) {
              days.push(new Date(start));
              start.setDate(start.getDate() + 1);
          }
      }
      return days;
  };

  const daysInView = getDaysInView();

  const getEventsForDay = (date: Date) => {
      const s = startOfDay(date);
      const e = endOfDay(date);
      const dateKey = formatDateKey(date);
      
      // 1. Regular events
      const dayEvents = events.filter(ev => ev.start >= s && ev.start < e);

      // 2. Habits (Mapped to pseudo-events OR overrides)
      const habitEvents = habits
        .filter(h => h.showOnCalendar && h.time)
        .map(h => {
            const overrideKey = `${h.id}_${dateKey}`;
            const override = habitOverrides[overrideKey];

            let start, end;

            if (override) {
                // Use Override
                start = override.start;
                end = override.end;
            } else {
                // Use Default
                const [hours, mins] = h.time!.split(':').map(Number);
                const d = new Date(date);
                d.setHours(hours, mins, 0, 0);
                start = d.getTime();
                end = start + (30 * 60000); // 30 min default
            }

            return {
                id: `habit_${h.id}_${date.getTime()}`,
                title: h.title,
                start,
                end,
                type: 'habit',
                habitId: h.id
            } as CalendarEvent;
        });

      return [...dayEvents, ...habitEvents];
  };

  const getTasksForDay = (date: Date) => {
      const k = formatDateKey(date);
      return tasks.filter(t => t.dueDate === k && !t.completed);
  };

  const unscheduledTasks = tasks.filter(t => !t.dueDate && !t.completed);

  // --- Render ---

  return (
    <div className="flex h-full bg-nd-black text-nd-white font-sans overflow-hidden divide-x divide-nd-gray">
        
        {/* Sidebar */}
        <div className="w-[60px] md:w-[240px] bg-nd-black flex flex-col flex-shrink-0">
             <div className="p-4 border-b border-nd-gray h-[60px] flex items-center">
                 <button 
                    onClick={() => setIsCreating(true)}
                    className="w-full bg-nd-white text-nd-black py-2 rounded-md font-bold text-xs uppercase flex items-center justify-center gap-2 hover:bg-white/90"
                 >
                     <Plus size={16} /> <span className="hidden md:inline">Create</span>
                 </button>
             </div>

             <div className="p-4 border-b border-nd-gray hidden md:block">
                 <div className="text-[10px] text-nd-gray uppercase tracking-widest mb-2 font-mono">Mini Calendar</div>
                 {/* Simple Month Viz */}
                 <div className="grid grid-cols-7 gap-1 text-center text-xs">
                     {['S','M','T','W','T','F','S'].map(d => <div key={d} className="text-nd-gray font-mono">{d}</div>)}
                     {Array.from({length: 35}).map((_, i) => {
                         const d = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
                         d.setDate(d.getDate() - d.getDay() + i);
                         const isToday = formatDateKey(d) === formatDateKey(new Date());
                         const isCurrent = d.getMonth() === currentDate.getMonth();
                         return (
                             <div 
                                key={i} 
                                onClick={() => setCurrentDate(d)}
                                className={`
                                    p-1 cursor-pointer rounded-full hover:bg-nd-gray/20
                                    ${!isCurrent ? 'text-nd-gray opacity-30' : ''}
                                    ${isToday ? 'bg-nd-red text-white' : ''}
                                    ${formatDateKey(d) === formatDateKey(currentDate) && !isToday ? 'bg-nd-white text-nd-black' : ''}
                                `}
                             >
                                 {d.getDate()}
                             </div>
                         )
                     })}
                 </div>
             </div>

             <div className="flex-1 overflow-y-auto p-4 hidden md:flex flex-col gap-4">
                 <div>
                     <div className="flex items-center gap-2 mb-2">
                         <CheckSquare size={14} className="text-nd-gray" />
                         <span className="text-[10px] text-nd-gray uppercase tracking-widest">Task Backlog</span>
                     </div>
                     <div className="space-y-2">
                         {unscheduledTasks.length === 0 && <div className="text-xs text-nd-gray italic">No unscheduled tasks.</div>}
                         {unscheduledTasks.map(t => (
                             <div key={t.id} className="bg-nd-gray/10 p-2 rounded border border-transparent hover:border-nd-gray cursor-grab active:cursor-grabbing text-xs">
                                 {t.title}
                             </div>
                         ))}
                     </div>
                 </div>

                 <div>
                     <div className="flex items-center gap-2 mb-2">
                         <Activity size={14} className="text-nd-gray" />
                         <span className="text-[10px] text-nd-gray uppercase tracking-widest">Daily Habits</span>
                     </div>
                     <div className="space-y-2">
                         {habits.map(h => (
                             <div key={h.id} className="flex items-center gap-2 text-xs text-nd-gray">
                                 <div className="w-3 h-3 border border-nd-gray rounded-sm"></div>
                                 {h.title}
                             </div>
                         ))}
                     </div>
                 </div>
             </div>
        </div>

        {/* Main Calendar Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-nd-black relative">
            
            {/* Header */}
            <div className="h-[60px] border-b border-nd-gray flex items-center justify-between px-4 bg-nd-black shrink-0">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold font-mono tracking-tight">
                        {currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
                    </h2>
                    <div className="flex items-center gap-1 border border-nd-gray rounded-md p-0.5">
                        <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() - (view === 'week' ? 7 : 1)); setCurrentDate(d); }} className="p-1 hover:bg-nd-gray/20 rounded"><ChevronLeft size={16}/></button>
                        <button onClick={() => setCurrentDate(new Date())} className="px-2 text-xs font-bold">Today</button>
                        <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() + (view === 'week' ? 7 : 1)); setCurrentDate(d); }} className="p-1 hover:bg-nd-gray/20 rounded"><ChevronRight size={16}/></button>
                    </div>
                </div>

                <div className="flex bg-nd-gray/10 rounded-md p-0.5">
                    {(['day', 'week', 'month'] as ViewMode[]).map(v => (
                        <button 
                            key={v}
                            onClick={() => setView(v)}
                            className={`px-3 py-1 text-xs uppercase font-bold rounded-sm transition-colors ${view === v ? 'bg-nd-white text-nd-black' : 'text-nd-gray hover:text-nd-white'}`}
                        >
                            {v}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Grid */}
            <div className="flex-1 overflow-y-auto relative">
                
                {/* MONTH VIEW */}
                {view === 'month' && (
                    <div className="h-full grid grid-cols-7 grid-rows-5 divide-x divide-y divide-nd-gray/20">
                         <div className="col-span-7 flex items-center justify-center h-full text-nd-gray opacity-50">
                             Month view is optimized for overview. Switch to Week/Day for time blocking.
                         </div>
                    </div>
                )}

                {/* WEEK / DAY VIEW */}
                {(view === 'week' || view === 'day') && (
                    <div className="flex min-h-[1440px]"> {/* 24h * 60px */}
                        {/* Time Axis */}
                        <div className="w-14 flex-shrink-0 border-r border-nd-gray bg-nd-black text-xs text-nd-gray font-mono pt-10">
                            {getHoursArray().map(h => (
                                <div key={h} className="h-[60px] text-right pr-2 -mt-2.5">
                                    {h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h-12} PM`}
                                </div>
                            ))}
                        </div>

                        {/* Columns */}
                        <div className={`flex-1 grid ${view === 'week' ? 'grid-cols-7' : 'grid-cols-1'} divide-x divide-nd-gray/20`}>
                            {daysInView.map((day, i) => {
                                const isToday = formatDateKey(day) === formatDateKey(now);
                                const dayEvents = getEventsForDay(day);
                                const dayTasks = getTasksForDay(day);

                                return (
                                    <div key={i} className="relative group">
                                        {/* Day Header */}
                                        <div className="sticky top-0 z-10 bg-nd-black/95 backdrop-blur border-b border-nd-gray p-2 text-center h-10">
                                            <span className={`text-xs font-bold uppercase ${isToday ? 'text-nd-red' : 'text-nd-gray'}`}>
                                                {day.toLocaleDateString('default', { weekday: 'short' })} {day.getDate()}
                                            </span>
                                        </div>
                                        
                                        {/* All Day / Tasks Section */}
                                        {(dayTasks.length > 0 || view === 'day') && (
                                            <div className="border-b border-nd-gray/20 p-2 space-y-1 bg-nd-gray/5 min-h-[40px]">
                                                {dayTasks.map(t => (
                                                    <div key={t.id} className="text-[10px] bg-nd-white/10 text-nd-white px-1.5 py-0.5 rounded border border-nd-gray flex items-center gap-1">
                                                        <CheckSquare size={10} /> {t.title}
                                                    </div>
                                                ))}
                                                {/* Habits in Day View */}
                                                {view === 'day' && habits.map(h => (
                                                    <div key={h.id} className="text-[10px] text-nd-gray flex items-center gap-1 px-1">
                                                        <div className="w-2 h-2 border border-nd-gray"></div> {h.title}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Grid Cells */}
                                        <div className="relative">
                                            {/* Grid Lines */}
                                            {getHoursArray().map(h => (
                                                <div 
                                                    key={h} 
                                                    className="h-[60px] border-b border-nd-gray/10 hover:bg-nd-gray/5 cursor-crosshair"
                                                    onClick={() => handleTimeSlotClick(day, h)}
                                                    onDragOver={handleDragOver}
                                                    onDrop={(e) => handleDrop(e, day, h)}
                                                />
                                            ))}

                                            {/* Current Time Line */}
                                            {isToday && (
                                                <div 
                                                    className="absolute w-full border-t-2 border-nd-red z-20 pointer-events-none flex items-center"
                                                    style={{ top: `${(now.getHours() * 60 + now.getMinutes())}px` }}
                                                >
                                                    <div className="w-2 h-2 bg-nd-red rounded-full -ml-1"></div>
                                                </div>
                                            )}

                                            {/* Events */}
                                            {dayEvents.map(ev => {
                                                const startMin = new Date(ev.start).getHours() * 60 + new Date(ev.start).getMinutes();
                                                const duration = ev.end - ev.start;
                                                const durationMin = duration / 60000;
                                                const isOverride = ev.type === 'habit' && habitOverrides[`${ev.habitId}_${formatDateKey(day)}`];

                                                return (
                                                    <div
                                                        key={ev.id}
                                                        draggable="true"
                                                        onDragStart={(e) => handleDragStart(e, ev.id, ev.type, duration, ev.habitId)}
                                                        onClick={(e) => { 
                                                            if (ev.type === 'habit') return; 
                                                            e.stopPropagation(); 
                                                            setSelectedEventId(ev.id); 
                                                        }}
                                                        className={`absolute inset-x-1 rounded p-1 text-xs overflow-hidden cursor-pointer hover:brightness-110 transition-all z-10
                                                            ${ev.type === 'habit'
                                                                ? `${isOverride ? 'bg-nd-black border border-nd-white text-nd-white' : 'bg-nd-black border border-dashed border-nd-gray text-nd-gray'} hover:text-nd-white`
                                                                : ev.type === 'timeblock' 
                                                                    ? 'bg-nd-gray/20 border-l-2 border-nd-white text-nd-white' 
                                                                    : 'bg-nd-red/10 border-l-2 border-nd-red text-nd-red'}
                                                        `}
                                                        style={{
                                                            top: `${startMin}px`,
                                                            height: `${durationMin}px`,
                                                        }}
                                                    >
                                                        <div className="font-bold truncate flex items-center gap-1">
                                                            {ev.type === 'habit' && <Activity size={10} />}
                                                            {ev.title}
                                                        </div>
                                                        {durationMin > 30 && <div className="text-[10px] opacity-70">{new Date(ev.start).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* Create/Edit Modal */}
        {(isCreating || selectedEventId) && (
            <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-nd-black border border-nd-white w-full max-w-sm shadow-2xl p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="font-bold text-lg uppercase">{selectedEventId ? 'Edit Event' : 'Block Time'}</h3>
                        <button onClick={() => { setIsCreating(false); setSelectedEventId(null); }}><X size={20} className="text-nd-gray hover:text-nd-white"/></button>
                    </div>

                    {selectedEventId ? (
                        <div className="space-y-4">
                            {/* Edit View (Simplified: Just Delete for now) */}
                            <div className="p-4 bg-nd-gray/10 rounded text-sm text-nd-white">
                                {events.find(e => e.id === selectedEventId)?.title}
                            </div>
                            <button 
                                onClick={() => deleteEvent(selectedEventId)} 
                                className="w-full bg-nd-red text-white py-2 font-bold uppercase text-xs hover:bg-red-600"
                            >
                                Delete Event
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] uppercase text-nd-gray font-bold tracking-widest mb-1 block">Title</label>
                                <input 
                                    autoFocus
                                    value={newEventTitle}
                                    onChange={e => setNewEventTitle(e.target.value)}
                                    className="w-full bg-nd-gray/10 border border-nd-gray p-2 text-sm text-nd-white outline-none focus:border-nd-white"
                                    placeholder="Meeting, Deep Work, etc."
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] uppercase text-nd-gray font-bold tracking-widest mb-1 block">Start</label>
                                    <input type="time" value={newEventStartStr} onChange={e => setNewEventStartStr(e.target.value)} className="w-full bg-nd-gray/10 border border-nd-gray p-2 text-sm text-nd-white outline-none" />
                                </div>
                                <div>
                                    <label className="text-[10px] uppercase text-nd-gray font-bold tracking-widest mb-1 block">End</label>
                                    <input type="time" value={newEventEndStr} onChange={e => setNewEventEndStr(e.target.value)} className="w-full bg-nd-gray/10 border border-nd-gray p-2 text-sm text-nd-white outline-none" />
                                </div>
                            </div>
                            
                            {/* Task Linker */}
                            <div>
                                <label className="text-[10px] uppercase text-nd-gray font-bold tracking-widest mb-1 block">Link to Task (Optional)</label>
                                <select 
                                    value={linkedTask}
                                    onChange={e => { setLinkedTask(e.target.value); if(e.target.value) setNewEventTitle(tasks.find(t=>t.id===e.target.value)?.title || ''); }}
                                    className="w-full bg-nd-gray/10 border border-nd-gray p-2 text-sm text-nd-white outline-none focus:border-nd-white"
                                >
                                    <option value="">-- None --</option>
                                    {unscheduledTasks.map(t => (
                                        <option key={t.id} value={t.id}>{t.title}</option>
                                    ))}
                                </select>
                            </div>

                            <button 
                                onClick={createEvent}
                                className="w-full mt-4 bg-nd-white text-nd-black font-bold py-3 text-sm hover:bg-white/90 uppercase"
                            >
                                Confirm
                            </button>
                        </div>
                    )}
                </div>
            </div>
        )}
    </div>
  );
};