import React, { useState, useEffect } from 'react';
import { db, auth } from '../services/firebase';
import { ref, onValue, set, update, remove } from 'firebase/database';
import { 
  ChevronLeft, ChevronRight, Plus, Trash2, 
  Check, X, Activity, Briefcase, User, DollarSign,
  LayoutGrid, Calendar as CalendarIcon, Grid, Clock,
  BrainCircuit, Sparkles
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { GoogleGenAI } from "@google/genai";

// --- Types ---

interface Habit {
  id: string;
  title: string;
  category: string;
  createdAt: number;
  showOnCalendar?: boolean;
  time?: string; // HH:MM
}

// Map of DateString (YYYY-MM-DD) -> Array of Completed Habit IDs
interface HabitLog {
  [date: string]: string[];
}

type ViewMode = 'week' | 'month' | 'year';

// --- Constants ---

const CATEGORIES = [
  { id: 'personal', label: 'Personal', icon: User },
  { id: 'work', label: 'Work', icon: Briefcase },
  { id: 'finance', label: 'Finance', icon: DollarSign },
  { id: 'health', label: 'Health', icon: Activity },
];

const WEEK_DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// --- Helpers ---

const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

const formatDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// --- Component ---

export const HabitApp: React.FC = () => {
  const { authStatus, addLog } = useOS();

  // State
  const [view, setView] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date()); // Navigation cursor
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date()); // Inspector cursor
  
  const [habits, setHabits] = useState<Habit[]>([]);
  const [logs, setLogs] = useState<HabitLog>({});
  
  // AI State
  const [aiCoachMsg, setAiCoachMsg] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Form State
  const [newHabitTitle, setNewHabitTitle] = useState('');
  const [newHabitCategory, setNewHabitCategory] = useState('personal');
  const [newHabitShowCalendar, setNewHabitShowCalendar] = useState(false);
  const [newHabitTime, setNewHabitTime] = useState('09:00');
  const [isAddingHabit, setIsAddingHabit] = useState(false);

  // --- Data Sync ---

  useEffect(() => {
    if (authStatus === 'connected' && auth.currentUser) {
      const userId = auth.currentUser.uid;
      
      // Load Habits
      const habitsRef = ref(db, `users/${userId}/habits`);
      const unsubHabits = onValue(habitsRef, (snap) => {
        const data = snap.val();
        setHabits(data ? Object.values(data) : []);
      });

      // Load Logs
      const logsRef = ref(db, `users/${userId}/habit_logs`);
      const unsubLogs = onValue(logsRef, (snap) => {
        setLogs(snap.val() || {});
      });

      return () => {
        unsubHabits();
        unsubLogs();
      };
    } else {
        // Local Storage Fallback
        const localHabits = localStorage.getItem('nd_os_habits');
        if (localHabits) setHabits(JSON.parse(localHabits));
        
        const localLogs = localStorage.getItem('nd_os_habit_logs');
        if (localLogs) setLogs(JSON.parse(localLogs));
    }
  }, [authStatus]);

  // --- Actions ---

  const addHabit = () => {
    if (!newHabitTitle.trim()) return;
    
    const newHabit: Habit = {
      id: `h_${Date.now()}`,
      title: newHabitTitle,
      category: newHabitCategory,
      createdAt: Date.now(),
      showOnCalendar: newHabitShowCalendar,
      time: newHabitShowCalendar ? newHabitTime : undefined
    };

    const updatedHabits = [...habits, newHabit];
    setHabits(updatedHabits);
    
    // Reset Form
    setNewHabitTitle('');
    setNewHabitShowCalendar(false);
    setNewHabitTime('09:00');
    setIsAddingHabit(false);

    const isCloud = authStatus === 'connected' && !!auth.currentUser;

    if (isCloud && auth.currentUser) {
      set(ref(db, `users/${auth.currentUser.uid}/habits/${newHabit.id}`), newHabit);
    } else {
      localStorage.setItem('nd_os_habits', JSON.stringify(updatedHabits));
    }

    addLog({ source: 'Habits', message: `Added habit: "${newHabit.title}"`, type: 'info', isCloud });
  };

  const deleteHabit = (id: string) => {
    const habitToDelete = habits.find(h => h.id === id);
    const updatedHabits = habits.filter(h => h.id !== id);
    setHabits(updatedHabits);
    
    const isCloud = authStatus === 'connected' && !!auth.currentUser;

    if (isCloud && auth.currentUser) {
      remove(ref(db, `users/${auth.currentUser.uid}/habits/${id}`));
    } else {
      localStorage.setItem('nd_os_habits', JSON.stringify(updatedHabits));
    }

    addLog({ source: 'Habits', message: `Deleted habit: "${habitToDelete?.title || 'Habit'}"`, type: 'warning', isCloud });
  };

  const toggleHabitForDate = (habitId: string, date: Date) => {
    const key = formatDateKey(date);
    const currentDayLogs = logs[key] || [];
    const isCompleted = currentDayLogs.includes(habitId);
    
    let newDayLogs;
    if (isCompleted) {
      newDayLogs = currentDayLogs.filter(id => id !== habitId);
    } else {
      newDayLogs = [...currentDayLogs, habitId];
    }

    const newLogs = { ...logs, [key]: newDayLogs };
    setLogs(newLogs);

    const isCloud = authStatus === 'connected' && !!auth.currentUser;

    if (isCloud && auth.currentUser) {
      update(ref(db, `users/${auth.currentUser.uid}/habit_logs`), { [key]: newDayLogs });
    } else {
      localStorage.setItem('nd_os_habit_logs', JSON.stringify(newLogs));
    }

    // Find habit title for log
    const habitTitle = habits.find(h => h.id === habitId)?.title || 'Unknown';
    if (!isCompleted) {
        addLog({ source: 'Habits', message: `Completed: "${habitTitle}"`, type: 'success', isCloud });
    }
  };

  // --- AI Coach ---
  const getAiCoaching = async () => {
      const apiKey = localStorage.getItem('nd_os_api_key') || process.env.API_KEY;
      if (!apiKey) {
          setAiCoachMsg("API Key Missing. Configure in Settings.");
          return;
      }

      setIsAiLoading(true);
      try {
          const ai = new GoogleGenAI({ apiKey });
          
          // Prepare data
          const recentLogs = Object.entries(logs)
              .sort(([a], [b]) => b.localeCompare(a)) // Descending dates
              .slice(0, 14); // Last 2 weeks
          
          const prompt = `
            Act as a strict but motivating habit coach.
            Habits: ${JSON.stringify(habits.map(h => h.title))}
            Recent History (Date: Completed Habit IDs): ${JSON.stringify(recentLogs)}
            
            Analyze the user's consistency.
            1. Identify one bad pattern (e.g., skipping weekends).
            2. Identify one win.
            3. Give a short, punchy directive for tomorrow.
            Keep it under 100 words. Robotic tone.
          `;

          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt
          });

          setAiCoachMsg(response.text || "Analysis failed.");
      } catch (e) {
          setAiCoachMsg("Neural Link Error.");
      } finally {
          setIsAiLoading(false);
      }
  };

  // --- Calculations ---

  const getProgress = (date: Date) => {
    if (habits.length === 0) return 0;
    const key = formatDateKey(date);
    const completedCount = (logs[key] || []).length;
    // Filter habits created before or on this date ideally, but for simplicity use current list
    return Math.min(1, completedCount / habits.length);
  };

  const getDayColor = (progress: number) => {
    if (progress === 0) return 'bg-nd-black text-nd-gray border-nd-gray';
    
    if (progress === 1) return 'bg-nd-white text-nd-black border-nd-white';
    
    // Intermediate steps (Monochrome gradient)
    if (progress < 0.25) return 'bg-[#262626] text-white border-[#262626]';
    if (progress < 0.5) return 'bg-[#404040] text-white border-[#404040]';
    if (progress < 0.75) return 'bg-[#737373] text-black border-[#737373]';
    return 'bg-[#a3a3a3] text-black border-[#a3a3a3]';
  };

  // --- Renderers ---

  const renderDayCell = (day: number | null, monthOffset = 0, small = false) => {
    if (day === null) return <div className="aspect-square bg-transparent" />;
    
    const date = new Date(currentDate.getFullYear(), currentDate.getMonth() + monthOffset, day);
    const progress = getProgress(date);
    const isSelected = selectedDate && formatDateKey(selectedDate) === formatDateKey(date);
    const isToday = formatDateKey(new Date()) === formatDateKey(date);
    const styles = getDayColor(progress);

    return (
      <div 
        onClick={() => setSelectedDate(date)}
        className={`aspect-square border flex flex-col items-center justify-center cursor-pointer transition-all duration-200 relative group
          ${styles} 
          ${isSelected ? 'ring-2 ring-nd-red ring-offset-2 ring-offset-black z-10' : 'border-opacity-20'}
          ${small ? 'text-[8px] border-0' : ''}
        `}
      >
        <span className={`font-mono ${small ? 'hidden' : 'text-sm'}`}>{day}</span>
        {isToday && !small && <div className="w-1 h-1 bg-nd-red rounded-full mt-1"></div>}
        
        {/* Tooltip for progress */}
        {!small && (
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <span className="text-xs font-mono text-white">{Math.round(progress * 100)}%</span>
            </div>
        )}
      </div>
    );
  };

  const renderMonthGrid = (year: number, month: number, small = false) => {
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const days = [];
    
    // Padding
    for (let i = 0; i < firstDay; i++) days.push(null);
    // Days
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    return (
      <div className={`grid grid-cols-7 ${small ? 'gap-0.5' : 'gap-1'}`}>
        {!small && WEEK_DAYS.map(d => (
          <div key={d} className="text-center text-[10px] text-nd-gray font-mono py-2">{d}</div>
        ))}
        {days.map((d, i) => (
          <React.Fragment key={i}>
             {renderDayCell(d, month - currentDate.getMonth(), small)}
          </React.Fragment>
        ))}
      </div>
    );
  };

  return (
    <div className="flex h-full bg-nd-black text-nd-white font-sans overflow-hidden divide-x divide-nd-gray">
      
      {/* 1. Main Calendar Area */}
      <div className="flex-1 flex flex-col min-w-0">
        
        {/* Header */}
        <div className="h-[60px] border-b border-nd-gray flex items-center justify-between px-6 bg-nd-black">
           <div className="flex items-center gap-4">
              <div className="flex items-center bg-nd-gray/10 rounded-sm overflow-hidden border border-nd-gray/30">
                 <button onClick={() => setView('month')} className={`p-2 ${view === 'month' ? 'bg-nd-white text-nd-black' : 'text-nd-gray hover:text-nd-white'}`}><LayoutGrid size={16}/></button>
                 <button onClick={() => setView('year')} className={`p-2 ${view === 'year' ? 'bg-nd-white text-nd-black' : 'text-nd-gray hover:text-nd-white'}`}><Grid size={16}/></button>
              </div>
              <h2 className="text-xl font-bold font-mono tracking-tight">
                 {view === 'year' ? currentDate.getFullYear() : currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
              </h2>
           </div>

           <div className="flex items-center gap-2">
             <button onClick={() => {
                const d = new Date(currentDate);
                if (view === 'year') d.setFullYear(d.getFullYear() - 1);
                else d.setMonth(d.getMonth() - 1);
                setCurrentDate(d);
             }} className="p-2 hover:bg-nd-gray/20 rounded-full"><ChevronLeft size={20}/></button>
             <button onClick={() => setCurrentDate(new Date())} className="text-xs font-mono px-3 py-1 border border-nd-gray hover:bg-nd-gray/20">TODAY</button>
             <button onClick={() => {
                const d = new Date(currentDate);
                if (view === 'year') d.setFullYear(d.getFullYear() + 1);
                else d.setMonth(d.getMonth() + 1);
                setCurrentDate(d);
             }} className="p-2 hover:bg-nd-gray/20 rounded-full"><ChevronRight size={20}/></button>
           </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 relative">
          
          {view === 'month' && (
             <div className="h-full max-w-4xl mx-auto">
                {renderMonthGrid(currentDate.getFullYear(), currentDate.getMonth())}
             </div>
          )}

          {view === 'year' && (
            <div className="grid grid-cols-3 md:grid-cols-4 gap-6 pb-10">
               {Array.from({ length: 12 }).map((_, i) => (
                 <div key={i} className="flex flex-col gap-2">
                    <span className="text-xs font-mono text-nd-gray uppercase">{new Date(currentDate.getFullYear(), i).toLocaleString('default', { month: 'long' })}</span>
                    {renderMonthGrid(currentDate.getFullYear(), i, true)}
                 </div>
               ))}
            </div>
          )}

        </div>
      </div>

      {/* 2. Inspector / Habit Manager */}
      <div className={`w-[320px] bg-nd-black flex flex-col border-l border-nd-gray z-20 absolute inset-y-0 right-0 transform transition-transform duration-300 md:static ${selectedDate ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}>
         
         {/* Sidebar Header */}
         <div className="h-[60px] border-b border-nd-gray flex items-center justify-between px-6 bg-nd-black">
             <div className="flex flex-col">
                <span className="text-[10px] text-nd-gray font-mono uppercase tracking-widest">DAILY LOG</span>
                <span className="text-lg font-bold">
                  {selectedDate ? selectedDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'Select a date'}
                </span>
             </div>
             
             {/* AI Coach Button */}
             {selectedDate && (
                 <div className="flex gap-2">
                     <button 
                        onClick={getAiCoaching}
                        disabled={isAiLoading}
                        className="p-2 hover:bg-nd-gray/20 rounded-full text-nd-red disabled:opacity-50"
                        title="AI Coach"
                     >
                        {isAiLoading ? <Sparkles size={18} className="animate-spin" /> : <BrainCircuit size={18} />}
                     </button>
                     <button onClick={() => setSelectedDate(null)} className="md:hidden p-2"><X size={18}/></button>
                 </div>
             )}
         </div>

         {/* AI Coach Message */}
         {aiCoachMsg && (
             <div className="p-4 bg-nd-gray/10 border-b border-nd-gray text-xs font-mono leading-relaxed relative animate-in slide-in-from-top-2">
                 <button onClick={() => setAiCoachMsg(null)} className="absolute top-2 right-2 text-nd-gray hover:text-white"><X size={12}/></button>
                 <strong className="text-nd-red uppercase block mb-1">Coach Insight:</strong>
                 {aiCoachMsg}
             </div>
         )}

         {/* Habit Checklist */}
         <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {!selectedDate ? (
                <div className="flex flex-col items-center justify-center h-full text-nd-gray opacity-50">
                    <CalendarIcon size={32} />
                    <span className="text-xs font-mono mt-2">SELECT DATE</span>
                </div>
            ) : habits.length === 0 ? (
                <div className="text-center p-8 text-nd-gray">
                   <p className="text-sm">No habits defined.</p>
                   <p className="text-xs mt-2">Add your first habit below.</p>
                </div>
            ) : (
                habits.map(habit => {
                    const isCompleted = (logs[formatDateKey(selectedDate)] || []).includes(habit.id);
                    const CatIcon = CATEGORIES.find(c => c.id === habit.category)?.icon || Activity;
                    
                    return (
                        <div key={habit.id} className="group flex items-center gap-3 p-3 border border-nd-gray/20 hover:border-nd-gray transition-colors bg-nd-gray/5">
                            <button
                                onClick={() => toggleHabitForDate(habit.id, selectedDate)}
                                className={`w-5 h-5 border flex-shrink-0 flex items-center justify-center transition-colors ${
                                    isCompleted ? 'bg-nd-white border-nd-white text-nd-black' : 'border-nd-gray hover:border-nd-white'
                                }`}
                            >
                                {isCompleted && <Check size={14} strokeWidth={3} />}
                            </button>
                            
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm truncate ${isCompleted ? 'line-through text-nd-gray' : 'text-nd-white'}`}>{habit.title}</p>
                                <div className="flex items-center gap-2 text-[10px] text-nd-gray uppercase mt-0.5">
                                    <span className="flex items-center gap-1"><CatIcon size={10} /> {habit.category}</span>
                                    {habit.showOnCalendar && habit.time && <span className="flex items-center gap-1 border-l border-nd-gray/50 pl-2"><Clock size={10} /> {habit.time}</span>}
                                </div>
                            </div>

                            <button onClick={() => deleteHabit(habit.id)} className="opacity-0 group-hover:opacity-100 text-nd-gray hover:text-nd-red p-1">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    );
                })
            )}
         </div>

         {/* Add Habit Form */}
         <div className="p-4 border-t border-nd-gray bg-nd-black">
             {isAddingHabit ? (
                 <div className="flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2">
                     <input 
                       autoFocus
                       value={newHabitTitle}
                       onChange={(e) => setNewHabitTitle(e.target.value)}
                       placeholder="Habit name..."
                       className="bg-transparent border-b border-nd-gray focus:border-nd-white outline-none py-1 text-sm text-nd-white placeholder-nd-gray"
                     />
                     
                     <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                         {CATEGORIES.map(cat => (
                             <button
                               key={cat.id}
                               onClick={() => setNewHabitCategory(cat.id)}
                               className={`flex items-center gap-1 px-2 py-1 text-[10px] border whitespace-nowrap transition-colors ${
                                   newHabitCategory === cat.id 
                                     ? 'bg-nd-white text-nd-black border-nd-white'
                                     : 'text-nd-gray border-nd-gray hover:border-nd-white'
                               }`}
                             >
                                 <cat.icon size={10} />
                                 {cat.label}
                             </button>
                         ))}
                     </div>

                     {/* Calendar Integration */}
                     <div className="flex items-center justify-between border border-nd-gray/30 p-2 rounded bg-nd-gray/5">
                        <label className="flex items-center gap-2 text-[10px] text-nd-gray cursor-pointer hover:text-nd-white">
                            <input 
                                type="checkbox" 
                                checked={newHabitShowCalendar} 
                                onChange={e => setNewHabitShowCalendar(e.target.checked)}
                                className="accent-nd-white w-3 h-3 cursor-pointer"
                            />
                            Show on Calendar
                        </label>
                        {newHabitShowCalendar && (
                            <input 
                                type="time" 
                                value={newHabitTime}
                                onChange={e => setNewHabitTime(e.target.value)}
                                className="bg-transparent text-[10px] text-nd-white outline-none font-mono border-b border-nd-gray focus:border-nd-white"
                            />
                        )}
                     </div>

                     <div className="flex gap-2 mt-1">
                         <button onClick={addHabit} className="flex-1 bg-nd-white text-nd-black py-1.5 text-xs font-bold hover:bg-nd-white/90">ADD</button>
                         <button onClick={() => setIsAddingHabit(false)} className="px-3 py-1.5 border border-nd-gray text-xs hover:bg-nd-gray/20">CANCEL</button>
                     </div>
                 </div>
             ) : (
                 <button 
                   onClick={() => setIsAddingHabit(true)}
                   className="w-full py-3 flex items-center justify-center gap-2 border border-dashed border-nd-gray text-nd-gray hover:text-nd-white hover:border-nd-white transition-all text-xs font-mono uppercase tracking-widest"
                 >
                     <Plus size={14} /> New Habit
                 </button>
             )}
         </div>

      </div>

    </div>
  );
};