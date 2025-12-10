import React, { useState, useEffect } from 'react';
import { WidgetInstance } from '../../types';
import { 
  Cloud, Clock, Quote, Activity, FileText, Calendar, 
  CheckSquare, Wallet, Check, ChevronRight, Calculator, 
  HardDrive, BrainCircuit, TrendingUp, TrendingDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { useOS } from '../../context/OSContext';
import { db, auth } from '../../services/firebase';
import { ref, onValue, update, set } from 'firebase/database';

// --- Types ---

interface WidgetProps {
  data: any;
  updateData: (newData: any) => void;
}

// --- Helper: Data Fetching Hook ---
function useWidgetData<T>(path: string, storageKey: string, defaultValue: T): [T, (val: T) => void] {
  const { authStatus } = useOS();
  const [data, setData] = useState<T>(defaultValue);

  useEffect(() => {
    if (authStatus === 'connected' && auth.currentUser) {
      const dbRef = ref(db, `users/${auth.currentUser.uid}/${path}`);
      const unsub = onValue(dbRef, (snap) => {
        const val = snap.val();
        if (val) {
            // Handle array vs object
            if (Array.isArray(defaultValue)) {
                setData(Object.values(val) as any);
            } else {
                setData(val);
            }
        } else {
            setData(defaultValue);
        }
      });
      return () => unsub();
    } else {
      const local = localStorage.getItem(storageKey);
      if (local) setData(JSON.parse(local));
    }
  }, [authStatus, path, storageKey]);

  const updateData = (newData: T) => {
      // Optimistic update
      setData(newData);
      
      if (authStatus === 'connected' && auth.currentUser) {
          // For simple widgets we might just overwrite the path or update specific items
      } else {
          localStorage.setItem(storageKey, JSON.stringify(newData));
      }
  };

  return [data, updateData];
}

// 1. Clock Widget
const ClockWidget: React.FC<WidgetProps> = () => {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center p-4 h-full w-full bg-nd-black/40 backdrop-blur-md border border-nd-gray rounded-2xl shadow-lg">
      <div className="text-4xl font-mono font-bold tracking-tighter text-nd-white">
        {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
      </div>
      <div className="text-xs text-nd-gray uppercase tracking-widest mt-1">
        {time.toLocaleDateString([], { weekday: 'long', day: 'numeric' })}
      </div>
    </div>
  );
};

// 2. Weather Widget (Mock)
const WeatherWidget: React.FC<WidgetProps> = () => {
  return (
    <div className="flex items-center justify-between p-4 h-full w-full bg-nd-black/40 backdrop-blur-md border border-nd-gray rounded-2xl shadow-lg">
       <div className="flex flex-col">
           <Cloud size={28} className="text-nd-white mb-2" />
           <span className="text-xs text-nd-gray uppercase tracking-widest">London</span>
       </div>
       <div className="text-right">
           <div className="text-3xl font-bold font-mono">18°</div>
           <div className="text-[10px] text-nd-gray">Cloudy</div>
       </div>
    </div>
  );
};

// 3. Note Widget
const NoteWidget: React.FC<WidgetProps> = ({ data, updateData }) => {
  return (
    <div className="flex flex-col h-full w-full bg-[#fdf6e3] text-[#657b83] rounded-sm shadow-md overflow-hidden relative rotate-1 hover:rotate-0 transition-transform duration-300">
        <div className="h-1 bg-yellow-400 w-full opacity-50"></div>
        <textarea 
            className="flex-1 bg-transparent p-3 text-sm font-mono outline-none resize-none placeholder-stone-400"
            placeholder="Scratchpad..."
            value={data?.text || ''}
            onChange={(e) => updateData({ text: e.target.value })}
            onMouseDown={(e) => e.stopPropagation()} // Allow text selection
        />
    </div>
  );
};

// 4. Quote Widget
const QuoteWidget: React.FC<WidgetProps> = () => {
  const [quote] = useState(() => {
      const quotes = [
          "Simplicity is the ultimate sophistication.",
          "Code is poetry.",
          "Focus on the signal, not the noise.",
          "Make it work, make it right, make it fast.",
          "Silence is golden."
      ];
      return quotes[Math.floor(Math.random() * quotes.length)];
  });

  return (
    <div className="flex flex-col justify-center h-full w-full p-6 bg-nd-black/40 backdrop-blur-md border border-nd-gray rounded-2xl text-center">
        <Quote size={16} className="text-nd-red mx-auto mb-2 opacity-80" />
        <p className="text-sm font-mono italic text-nd-white/90 leading-relaxed">"{quote}"</p>
    </div>
  );
};

// 5. Stats Widget
const StatsWidget: React.FC<WidgetProps> = () => {
    return (
        <div className="p-4 h-full w-full bg-nd-black/40 backdrop-blur-md border border-nd-gray rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-2 mb-2">
                <Activity size={14} className="text-nd-red" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-nd-gray">System</span>
            </div>
            <div className="space-y-3">
                <div>
                    <div className="flex justify-between text-[10px] text-nd-gray mb-1">
                        <span>CPU</span>
                        <span>12%</span>
                    </div>
                    <div className="h-1 bg-nd-gray/20 rounded-full overflow-hidden">
                        <div className="h-full bg-nd-white w-[12%]"></div>
                    </div>
                </div>
                <div>
                    <div className="flex justify-between text-[10px] text-nd-gray mb-1">
                        <span>RAM</span>
                        <span>48%</span>
                    </div>
                    <div className="h-1 bg-nd-gray/20 rounded-full overflow-hidden">
                        <div className="h-full bg-nd-white w-[48%]"></div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// 6. Calendar Widget
const CalendarWidget: React.FC<WidgetProps> = () => {
    const [events] = useWidgetData<any[]>('calendar/events', 'nd_os_calendar_events', []);
    const today = new Date();
    
    // Filter today's upcoming events
    const todaysEvents = events
        .filter(e => {
            const d = new Date(e.start);
            return d.getDate() === today.getDate() && 
                   d.getMonth() === today.getMonth() && 
                   d.getFullYear() === today.getFullYear() &&
                   e.end > Date.now();
        })
        .sort((a,b) => a.start - b.start)
        .slice(0, 3);

    return (
        <div className="p-4 h-full w-full bg-nd-black/40 backdrop-blur-md border border-nd-gray rounded-2xl flex flex-col">
            <div className="flex items-center justify-between mb-3 border-b border-nd-gray/30 pb-2">
                <div className="flex items-center gap-2 text-nd-gray">
                    <Calendar size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Today</span>
                </div>
                <div className="text-xs font-mono font-bold">{today.getDate()}</div>
            </div>
            <div className="flex-1 space-y-2 overflow-hidden">
                {todaysEvents.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[10px] text-nd-gray italic">No upcoming events</div>
                ) : (
                    todaysEvents.map(ev => (
                        <div key={ev.id} className="flex gap-2 items-center">
                            <div className="w-1 h-6 bg-nd-red rounded-full"></div>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold truncate">{ev.title}</div>
                                <div className="text-[10px] text-nd-gray font-mono">{new Date(ev.start).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

// 7. Tasks Widget
const TasksWidget: React.FC<WidgetProps> = () => {
    const { authStatus } = useOS();
    const [tasks, setTasks] = useWidgetData<any[]>('tasks', 'nd_os_tasks', []);
    
    // Get top 3 pending tasks
    const pendingTasks = tasks.filter(t => !t.completed).slice(0, 3);

    const toggleTask = (taskId: string) => {
        const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t);
        setTasks(updatedTasks);
        
        // Persist
        if (authStatus === 'connected' && auth.currentUser) {
            const task = updatedTasks.find(t => t.id === taskId);
            if(task) update(ref(db, `users/${auth.currentUser.uid}/tasks/${taskId}`), task);
        } else {
            localStorage.setItem('nd_os_tasks', JSON.stringify(updatedTasks));
        }
    };

    return (
        <div className="p-4 h-full w-full bg-nd-black/40 backdrop-blur-md border border-nd-gray rounded-2xl flex flex-col">
            <div className="flex items-center gap-2 mb-3 text-nd-gray border-b border-nd-gray/30 pb-2">
                <CheckSquare size={14} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Next Up</span>
            </div>
            <div className="flex-1 space-y-2">
                {pendingTasks.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[10px] text-nd-gray italic">All caught up!</div>
                ) : (
                    pendingTasks.map(task => (
                        <div key={task.id} className="flex items-center gap-2 group cursor-pointer" onClick={() => toggleTask(task.id)}>
                            <div className="w-3 h-3 border border-nd-gray rounded-sm group-hover:border-nd-white flex items-center justify-center">
                                {/* Empty box */}
                            </div>
                            <span className="text-xs truncate group-hover:text-nd-white transition-colors">{task.title}</span>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

// 8. Habits Widget
const HabitsWidget: React.FC<WidgetProps> = () => {
    const { authStatus } = useOS();
    const [habits] = useWidgetData<any[]>('habits', 'nd_os_habits', []);
    const [logs, setLogs] = useWidgetData<any>('habit_logs', 'nd_os_habit_logs', {});
    
    const todayKey = (() => {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    })();

    const displayHabits = habits.slice(0, 4);

    const toggleHabit = (id: string) => {
        const currentLogs = logs[todayKey] || [];
        const isDone = currentLogs.includes(id);
        const newLogs = isDone ? currentLogs.filter((i: string) => i !== id) : [...currentLogs, id];
        const updatedAllLogs = { ...logs, [todayKey]: newLogs };
        
        setLogs(updatedAllLogs);

        if (authStatus === 'connected' && auth.currentUser) {
            update(ref(db, `users/${auth.currentUser.uid}/habit_logs`), { [todayKey]: newLogs });
        } else {
            localStorage.setItem('nd_os_habit_logs', JSON.stringify(updatedAllLogs));
        }
    };

    return (
        <div className="p-4 h-full w-full bg-nd-black/40 backdrop-blur-md border border-nd-gray rounded-2xl flex flex-col">
            <div className="flex items-center gap-2 mb-3 text-nd-gray border-b border-nd-gray/30 pb-2">
                <Activity size={14} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Habits</span>
            </div>
            <div className="flex-1 space-y-2">
                {displayHabits.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[10px] text-nd-gray italic">No habits set</div>
                ) : (
                    displayHabits.map(habit => {
                        const isDone = (logs[todayKey] || []).includes(habit.id);
                        return (
                            <div key={habit.id} className="flex items-center justify-between group cursor-pointer" onClick={() => toggleHabit(habit.id)}>
                                <span className={`text-xs truncate transition-colors ${isDone ? 'text-nd-gray line-through' : 'text-nd-white'}`}>{habit.title}</span>
                                <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${isDone ? 'bg-nd-white border-nd-white text-nd-black' : 'border-nd-gray group-hover:border-nd-white'}`}>
                                    {isDone && <Check size={10} />}
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

// 9. Wallet Widget
const WalletWidget: React.FC<WidgetProps> = () => {
    const [accounts] = useWidgetData<any[]>('wallet/accounts', 'nd_os_wallet_accounts', []);
    
    const totalBalance = accounts.reduce((acc, a) => acc + (a.balance || 0), 0);

    return (
        <div className="p-5 h-full w-full bg-nd-black/40 backdrop-blur-md border border-nd-gray rounded-2xl flex flex-col justify-center">
            <div className="flex items-center gap-2 text-nd-gray mb-1">
                <Wallet size={16} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Net Worth</span>
            </div>
            <div className="text-3xl font-mono font-bold text-nd-white truncate">
                ${totalBalance.toLocaleString()}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-nd-gray mt-2">
                <span>{accounts.length} Active Accounts</span>
                <ChevronRight size={10} />
            </div>
        </div>
    );
};

// 10. Calculator Widget
const CalculatorWidget: React.FC<WidgetProps> = () => {
    const [input, setInput] = useState('');
    const [result, setResult] = useState('');

    const handleEval = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            try {
                // eslint-disable-next-line no-eval
                const res = eval(input.replace(/x/g, '*').replace(/[^-()\d/*+.]/g, ''));
                setResult(String(res));
            } catch (err) {
                setResult('Error');
            }
        }
    };

    return (
        <div className="p-4 h-full w-full bg-nd-black/40 backdrop-blur-md border border-nd-gray rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-2 text-nd-gray mb-2">
                <Calculator size={14} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Quick Calc</span>
            </div>
            <div className="text-right text-2xl font-mono font-bold text-nd-white truncate h-8">
                {result}
            </div>
            <input 
                className="w-full bg-nd-gray/10 border border-nd-gray rounded p-2 text-xs font-mono text-white outline-none focus:border-nd-white"
                placeholder="Type & Enter..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleEval}
                onMouseDown={e => e.stopPropagation()} 
            />
        </div>
    );
};

// 11. Storage Widget
const StorageWidget: React.FC<WidgetProps> = () => {
    const { fs } = useOS();
    const usedBytes = fs.reduce((acc, f) => acc + f.size, 0);
    const totalBytes = 64 * 1024 * 1024 * 1024; // 64GB Fake limit
    const percent = (usedBytes / totalBytes) * 100;

    return (
        <div className="p-4 h-full w-full bg-nd-black/40 backdrop-blur-md border border-nd-gray rounded-2xl flex flex-col justify-center gap-3">
            <div className="flex items-center gap-2 text-nd-gray">
                <HardDrive size={16} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Disk Usage</span>
            </div>
            <div className="flex items-end gap-1">
                <span className="text-2xl font-mono font-bold">{(usedBytes / (1024 * 1024)).toFixed(1)}</span>
                <span className="text-xs text-nd-gray mb-1">MB Used</span>
            </div>
            <div className="h-1.5 bg-nd-gray/20 rounded-full w-full overflow-hidden">
                <div className="h-full bg-nd-white" style={{ width: `${Math.max(1, percent)}%` }} />
            </div>
        </div>
    );
};

// 12. Focus Widget
const FocusWidget: React.FC<WidgetProps> = () => {
    // Read from localStorage/FB for simplicity in widget
    const [sessions] = useWidgetData<any[]>('focus_sessions', 'nd_os_focus_history', []);
    
    const todayMinutes = sessions
        .filter(s => new Date(s.timestamp).toDateString() === new Date().toDateString())
        .reduce((acc, s) => acc + s.duration, 0);
    
    const goal = 240; // 4 Hours
    const percent = Math.min(100, (todayMinutes / goal) * 100);
    const radius = 30;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percent / 100) * circumference;

    return (
        <div className="p-4 h-full w-full bg-nd-black/40 backdrop-blur-md border border-nd-gray rounded-2xl flex items-center justify-between">
            <div>
                <div className="flex items-center gap-2 text-nd-gray mb-1">
                    <BrainCircuit size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Focus</span>
                </div>
                <div className="text-2xl font-mono font-bold">{todayMinutes}m</div>
                <div className="text-[10px] text-nd-gray">Goal: {goal/60}h</div>
            </div>
            
            <div className="relative w-16 h-16 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90">
                    <circle cx="32" cy="32" r={radius} stroke="#262626" strokeWidth="4" fill="transparent" />
                    <circle 
                        cx="32" cy="32" r={radius} 
                        stroke="#eb0000" strokeWidth="4" 
                        fill="transparent" 
                        strokeDasharray={circumference} 
                        strokeDashoffset={offset}
                        className="transition-all duration-1000"
                    />
                </svg>
                <span className="absolute text-xs font-bold">{Math.round(percent)}%</span>
            </div>
        </div>
    );
};

// 13. Market Widget
const MarketWidget: React.FC<WidgetProps> = () => {
    const [tickers, setTickers] = useState([
        { sym: 'BTC', price: 64230, change: 1.2 },
        { sym: 'ETH', price: 3450, change: -0.5 },
        { sym: 'SPY', price: 512, change: 0.8 },
    ]);

    useEffect(() => {
        const i = setInterval(() => {
            setTickers(prev => prev.map(t => ({
                ...t,
                price: t.price * (1 + (Math.random() * 0.002 - 0.001)),
                change: t.change + (Math.random() * 0.2 - 0.1)
            })));
        }, 3000);
        return () => clearInterval(i);
    }, []);

    return (
        <div className="p-4 h-full w-full bg-nd-black/40 backdrop-blur-md border border-nd-gray rounded-2xl flex flex-col justify-between">
            <div className="flex items-center gap-2 text-nd-gray mb-2">
                <TrendingUp size={14} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Market</span>
            </div>
            <div className="space-y-2">
                {tickers.map(t => (
                    <div key={t.sym} className="flex justify-between items-center text-xs">
                        <span className="font-bold">{t.sym}</span>
                        <div className="flex items-center gap-2">
                            <span className="font-mono">${t.price.toFixed(t.price > 1000 ? 0 : 2)}</span>
                            <span className={`flex items-center text-[10px] ${t.change >= 0 ? 'text-green-500' : 'text-nd-red'}`}>
                                {t.change >= 0 ? <ArrowUp size={8} /> : <ArrowDown size={8} />}
                                {Math.abs(t.change).toFixed(1)}%
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- Registry ---

export const WIDGET_REGISTRY = {
  clock: { component: ClockWidget, label: 'Clock', icon: Clock, defaultSize: { w: 200, h: 100 } },
  weather: { component: WeatherWidget, label: 'Weather', icon: Cloud, defaultSize: { w: 180, h: 100 } },
  calendar: { component: CalendarWidget, label: 'Calendar', icon: Calendar, defaultSize: { w: 220, h: 180 } },
  tasks: { component: TasksWidget, label: 'Tasks', icon: CheckSquare, defaultSize: { w: 220, h: 180 } },
  habits: { component: HabitsWidget, label: 'Habits', icon: Activity, defaultSize: { w: 200, h: 180 } },
  wallet: { component: WalletWidget, label: 'Wallet', icon: Wallet, defaultSize: { w: 200, h: 120 } },
  note: { component: NoteWidget, label: 'Sticky Note', icon: FileText, defaultSize: { w: 200, h: 200 } },
  quote: { component: QuoteWidget, label: 'Daily Quote', icon: Quote, defaultSize: { w: 250, h: 150 } },
  stats: { component: StatsWidget, label: 'System Stats', icon: Activity, defaultSize: { w: 160, h: 140 } },
  calculator: { component: CalculatorWidget, label: 'Calculator', icon: Calculator, defaultSize: { w: 200, h: 140 } },
  storage: { component: StorageWidget, label: 'Disk Usage', icon: HardDrive, defaultSize: { w: 200, h: 120 } },
  focus: { component: FocusWidget, label: 'Focus Ring', icon: BrainCircuit, defaultSize: { w: 220, h: 120 } },
  market: { component: MarketWidget, label: 'Market Ticker', icon: TrendingUp, defaultSize: { w: 200, h: 160 } },
};