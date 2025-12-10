import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, auth } from '../services/firebase';
import { ref, onValue, set, push, update, get } from 'firebase/database';
import { 
  Clock, Watch, Timer, Hourglass, Play, Pause, 
  RotateCcw, BrainCircuit, History, Globe, Flag, X
} from 'lucide-react';
import { useOS } from '../context/OSContext';

// --- Types ---
type Tab = 'clock' | 'focus' | 'timer' | 'stopwatch';

interface FocusSession {
  id: string;
  duration: number; // minutes
  timestamp: number;
  label: string;
}

interface ClockState {
  focus: {
    isActive: boolean;
    endTime: number; // timestamp
    duration: number; // minutes
  };
  stopwatch: {
    isRunning: boolean;
    startTime: number; // timestamp of current run start
    accumulated: number; // ms previously accumulated
    laps: number[];
  };
  timer: {
    isRunning: boolean;
    endTime: number; // timestamp
    duration: number; // seconds (original duration)
  };
}

const DEFAULT_STATE: ClockState = {
  focus: { isActive: false, endTime: 0, duration: 25 },
  stopwatch: { isRunning: false, startTime: 0, accumulated: 0, laps: [] },
  timer: { isRunning: false, endTime: 0, duration: 300 }
};

// --- Helper Functions ---
const formatTime = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const milliseconds = Math.floor((ms % 1000) / 10);
  return {
    m: String(minutes).padStart(2, '0'),
    s: String(seconds).padStart(2, '0'),
    ms: String(milliseconds).padStart(2, '0')
  };
};

export const ClockApp: React.FC = () => {
  const { authStatus, addLog } = useOS();
  const [activeTab, setActiveTab] = useState<Tab>('clock');

  // --- Global Clock ---
  const [now, setNow] = useState(new Date());

  // --- Persistent State ---
  const [clockState, setClockState] = useState<ClockState>(DEFAULT_STATE);
  const [focusHistory, setFocusHistory] = useState<FocusSession[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // --- Display State (Derived from Persistent State + Interval) ---
  const [focusDisplaySeconds, setFocusDisplaySeconds] = useState(25 * 60);
  const [timerDisplaySeconds, setTimerDisplaySeconds] = useState(300);
  const [swDisplayMs, setSwDisplayMs] = useState(0);

  // --- Refs ---
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- Persistence Handlers ---

  const saveClockState = (newState: ClockState) => {
    setClockState(newState);
    if (authStatus === 'connected' && auth.currentUser) {
       update(ref(db, `users/${auth.currentUser.uid}/clock/state`), newState);
    } else {
       localStorage.setItem('nd_os_clock_state', JSON.stringify(newState));
    }
  };

  const logFocusSession = (minutes: number) => {
     const newSession: FocusSession = {
        id: `fs_${Date.now()}`,
        duration: minutes,
        timestamp: Date.now(),
        label: 'Deep Work'
      };
  
      if (authStatus === 'connected' && auth.currentUser) {
        push(ref(db, `users/${auth.currentUser.uid}/focus_sessions`), newSession);
      } else {
        const updated = [newSession, ...focusHistory];
        setFocusHistory(updated);
        localStorage.setItem('nd_os_focus_history', JSON.stringify(updated));
      }
      addLog({ source: 'Clock', message: `Focus Session Completed (${minutes}m)`, type: 'success', isCloud: authStatus === 'connected' });
  };

  // --- Sync Effect ---

  useEffect(() => {
    // 1. Global Ticker (Runs every 50ms to update all UI)
    intervalRef.current = setInterval(() => {
        const currentTime = Date.now();
        setNow(new Date());

        setClockState(prevState => {
            // Update Focus UI
            if (prevState.focus.isActive) {
                const remaining = Math.max(0, Math.ceil((prevState.focus.endTime - currentTime) / 1000));
                setFocusDisplaySeconds(remaining);
                
                // Handle Focus Completion
                if (remaining <= 0) {
                    // We need to save the state change, but we are inside a setState callback.
                    // This pattern prevents infinite loops but requires careful handling.
                    // We'll defer the state update logic slightly or handle it in the next render cycle if we returned a new state,
                    // but since we are just deriving UI values here, we'll trigger the "Finish" logic via a separate check below or 
                    // construct the new state right here.
                    
                    // However, to keep it pure, let's just update the display here and let a separate effect handle the transition
                    // OR handle it immediately if we want to stop the timer.
                }
            } else {
                setFocusDisplaySeconds(prevState.focus.duration * 60);
            }

            // Update Timer UI
            if (prevState.timer.isRunning) {
                const remaining = Math.max(0, Math.ceil((prevState.timer.endTime - currentTime) / 1000));
                setTimerDisplaySeconds(remaining);
            } else {
                 if (prevState.timer.endTime === 0) {
                     setTimerDisplaySeconds(prevState.timer.duration);
                 }
            }

            // Update Stopwatch UI
            if (prevState.stopwatch.isRunning) {
                setSwDisplayMs((currentTime - prevState.stopwatch.startTime) + prevState.stopwatch.accumulated);
            } else {
                setSwDisplayMs(prevState.stopwatch.accumulated);
            }
            
            return prevState;
        });
    }, 50);

    return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // --- Completion Check Effect ---
  // Checks if timers expired while we were away or during the interval tick
  useEffect(() => {
      const checkTimers = () => {
          const currentTime = Date.now();
          
          // Check Focus
          if (clockState.focus.isActive && currentTime >= clockState.focus.endTime) {
              logFocusSession(clockState.focus.duration);
              saveClockState({
                  ...clockState,
                  focus: { ...clockState.focus, isActive: false }
              });
              setFocusDisplaySeconds(clockState.focus.duration * 60);
          }

          // Check Timer
          if (clockState.timer.isRunning && currentTime >= clockState.timer.endTime) {
              addLog({ source: 'Clock', message: 'Timer Finished', type: 'info', isCloud: false });
              saveClockState({
                  ...clockState,
                  timer: { ...clockState.timer, isRunning: false, endTime: 0 } // Reset endTime to 0 to indicate "fresh"
              });
          }
      };

      const i = setInterval(checkTimers, 1000);
      return () => clearInterval(i);
  }, [clockState]);


  // --- Load Data ---
  useEffect(() => {
      if (authStatus === 'connected' && auth.currentUser) {
          const uid = auth.currentUser.uid;
          
          // Load State
          onValue(ref(db, `users/${uid}/clock/state`), snap => {
              if (snap.exists()) setClockState(snap.val());
          });

          // Load History
          onValue(ref(db, `users/${uid}/focus_sessions`), snap => {
               setFocusHistory(snap.exists() ? Object.values(snap.val()) : []);
          });

      } else {
          const localState = localStorage.getItem('nd_os_clock_state');
          if (localState) setClockState(JSON.parse(localState));

          const localHistory = localStorage.getItem('nd_os_focus_history');
          if (localHistory) setFocusHistory(JSON.parse(localHistory));
      }
  }, [authStatus]);


  // --- Actions: Focus ---

  const toggleFocus = () => {
      if (clockState.focus.isActive) {
          // Pause/Stop
          saveClockState({
              ...clockState,
              focus: { ...clockState.focus, isActive: false }
          });
      } else {
          // Start
          const endTime = Date.now() + (clockState.focus.duration * 60 * 1000);
          saveClockState({
              ...clockState,
              focus: { ...clockState.focus, isActive: true, endTime }
          });
      }
  };

  const setFocusDurationAction = (minutes: number) => {
      saveClockState({
          ...clockState,
          focus: { ...clockState.focus, duration: minutes, isActive: false }
      });
      setFocusDisplaySeconds(minutes * 60);
  };

  const resetFocus = () => {
      saveClockState({
          ...clockState,
          focus: { ...clockState.focus, isActive: false }
      });
      setFocusDisplaySeconds(clockState.focus.duration * 60);
  };

  // --- Actions: Stopwatch ---

  const toggleSw = () => {
      if (clockState.stopwatch.isRunning) {
          // Pause: Calculate accumulated time and stop
          const currentRunTime = Date.now() - clockState.stopwatch.startTime;
          saveClockState({
              ...clockState,
              stopwatch: { 
                  ...clockState.stopwatch, 
                  isRunning: false, 
                  accumulated: clockState.stopwatch.accumulated + currentRunTime 
              }
          });
      } else {
          // Start
          saveClockState({
              ...clockState,
              stopwatch: { 
                  ...clockState.stopwatch, 
                  isRunning: true, 
                  startTime: Date.now() 
              }
          });
      }
  };

  const resetSw = () => {
      saveClockState({
          ...clockState,
          stopwatch: { isRunning: false, startTime: 0, accumulated: 0, laps: [] }
      });
      setSwDisplayMs(0);
  };

  const lapSw = () => {
      const currentTotal = clockState.stopwatch.isRunning 
        ? (Date.now() - clockState.stopwatch.startTime) + clockState.stopwatch.accumulated
        : clockState.stopwatch.accumulated;

      saveClockState({
          ...clockState,
          stopwatch: {
              ...clockState.stopwatch,
              laps: [currentTotal, ...clockState.stopwatch.laps]
          }
      });
  };

  // --- Actions: Timer ---

  const startTimer = (seconds?: number) => {
      const duration = seconds || clockState.timer.duration;
      const endTime = Date.now() + (duration * 1000);
      
      saveClockState({
          ...clockState,
          timer: { isRunning: true, endTime, duration }
      });
  };

  const pauseTimer = () => {
      // Upon pause, we actually just reset it in this simple version or we could calculate remaining
      // For a Countdown, usually you Pause (save remaining) or Stop. 
      // To implement Pause for Timer correctly we'd need to update 'duration' to be 'remaining'.
      
      const remaining = Math.max(0, Math.ceil((clockState.timer.endTime - Date.now()) / 1000));
      saveClockState({
          ...clockState,
          timer: { isRunning: false, endTime: 0, duration: remaining }
      });
  };

  const resetTimer = () => {
       // Reset to a default default? Or just stop.
       saveClockState({
           ...clockState,
           timer: { isRunning: false, endTime: 0, duration: 300 } // Default 5m
       });
       setTimerDisplaySeconds(300);
  };


  // --- Computed Views ---

  const totalFocusMinutes = focusHistory.reduce((acc, s) => acc + s.duration, 0);
  const todayFocusMinutes = focusHistory
    .filter(s => new Date(s.timestamp).toDateString() === new Date().toDateString())
    .reduce((acc, s) => acc + s.duration, 0);

  // --- Render ---

  return (
    <div className="flex h-full bg-nd-black text-nd-white font-sans overflow-hidden divide-x divide-nd-gray">
        
        {/* Sidebar */}
        <div className="w-[60px] md:w-[150px] bg-nd-black flex flex-col pt-6 flex-shrink-0">
            <button 
                onClick={() => setActiveTab('clock')}
                className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-lg mb-1 transition-all ${activeTab === 'clock' ? 'bg-nd-white text-nd-black' : 'text-nd-gray hover:bg-nd-gray/10'}`}
            >
                <Globe size={20} /> <span className="hidden md:inline text-sm font-medium">World Clock</span>
            </button>
            <button 
                onClick={() => setActiveTab('focus')}
                className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-lg mb-1 transition-all ${activeTab === 'focus' ? 'bg-nd-white text-nd-black' : 'text-nd-gray hover:bg-nd-gray/10'}`}
            >
                <BrainCircuit size={20} /> <span className="hidden md:inline text-sm font-medium">Focus</span>
            </button>
             <button 
                onClick={() => setActiveTab('stopwatch')}
                className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-lg mb-1 transition-all ${activeTab === 'stopwatch' ? 'bg-nd-white text-nd-black' : 'text-nd-gray hover:bg-nd-gray/10'}`}
            >
                <Watch size={20} /> <span className="hidden md:inline text-sm font-medium">Stopwatch</span>
            </button>
            <button 
                onClick={() => setActiveTab('timer')}
                className={`flex items-center gap-3 px-4 py-3 mx-2 rounded-lg mb-1 transition-all ${activeTab === 'timer' ? 'bg-nd-white text-nd-black' : 'text-nd-gray hover:bg-nd-gray/10'}`}
            >
                <Hourglass size={20} /> <span className="hidden md:inline text-sm font-medium">Timer</span>
            </button>
        </div>

        {/* Main Area */}
        <div className="flex-1 flex flex-col relative overflow-hidden">
            
            {/* VIEW: WORLD CLOCK */}
            {activeTab === 'clock' && (
                <div className="h-full flex flex-col items-center justify-center p-8 animate-in fade-in">
                     <div className="text-center mb-12">
                         <div className="text-[10px] text-nd-red font-mono uppercase tracking-[0.3em] mb-4">Local Time</div>
                         <div className="text-7xl md:text-9xl font-mono font-bold tracking-tighter">
                             {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
                         </div>
                         <div className="text-xl md:text-2xl mt-2 text-nd-gray font-light">
                             {now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
                         </div>
                     </div>

                     <div className="grid grid-cols-2 md:grid-cols-3 gap-8 w-full max-w-2xl border-t border-nd-gray/30 pt-8">
                         <WorldClockItem city="New York" offset={-4} />
                         <WorldClockItem city="London" offset={1} />
                         <WorldClockItem city="Tokyo" offset={9} />
                     </div>
                </div>
            )}

            {/* VIEW: FOCUS */}
            {activeTab === 'focus' && (
                <div className="h-full flex flex-col relative animate-in fade-in">
                     {/* Focus Stats Header */}
                     <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start z-10">
                         <div>
                             <h2 className="text-xs font-bold uppercase tracking-widest text-nd-gray mb-1">Deep Work Today</h2>
                             <div className="text-2xl font-mono">{Math.floor(todayFocusMinutes / 60)}h {todayFocusMinutes % 60}m</div>
                         </div>
                         <button 
                            onClick={() => setShowHistory(!showHistory)}
                            className={`p-2 rounded-full border transition-all ${showHistory ? 'bg-nd-white text-nd-black border-nd-white' : 'border-nd-gray text-nd-gray hover:text-nd-white'}`}
                         >
                             <History size={18} />
                         </button>
                     </div>

                     {/* Main Timer Display */}
                     <div className="flex-1 flex flex-col items-center justify-center">
                          <div className={`relative w-64 h-64 md:w-80 md:h-80 rounded-full border-4 flex items-center justify-center transition-all duration-500 ${clockState.focus.isActive ? 'border-nd-red shadow-[0_0_50px_var(--color-accent)]' : 'border-nd-gray'}`}>
                              <div className="text-center">
                                  <div className="text-6xl md:text-7xl font-mono font-bold tracking-tighter tabular-nums">
                                      {Math.floor(focusDisplaySeconds / 60).toString().padStart(2, '0')}:{(focusDisplaySeconds % 60).toString().padStart(2, '0')}
                                  </div>
                                  <div className="text-xs text-nd-gray mt-2 font-mono uppercase tracking-widest">{clockState.focus.isActive ? 'FOCUSING' : 'READY'}</div>
                              </div>
                          </div>

                          <div className="flex items-center gap-6 mt-12">
                              {!clockState.focus.isActive ? (
                                  <button onClick={toggleFocus} className="bg-nd-white text-nd-black px-8 py-3 rounded-full font-bold uppercase tracking-widest hover:scale-105 transition-transform">
                                      Start Session
                                  </button>
                              ) : (
                                  <>
                                    <button onClick={toggleFocus} className="bg-nd-gray/20 border border-nd-gray text-nd-white px-6 py-3 rounded-full font-bold uppercase tracking-widest hover:bg-nd-gray/40 transition-colors">
                                        Pause
                                    </button>
                                    <button onClick={resetFocus} className="text-nd-red px-6 py-3 font-bold uppercase tracking-widest hover:bg-nd-red/10 rounded-full transition-colors">
                                        Abort
                                    </button>
                                  </>
                              )}
                          </div>
                          
                          {/* Duration Selector */}
                          {!clockState.focus.isActive && (
                              <div className="flex gap-2 mt-8">
                                  {[15, 25, 45, 60].map(m => (
                                      <button 
                                        key={m}
                                        onClick={() => setFocusDurationAction(m)}
                                        className={`px-3 py-1 text-xs font-mono border rounded ${clockState.focus.duration === m ? 'border-nd-white text-nd-white' : 'border-nd-gray text-nd-gray hover:border-nd-white'}`}
                                      >
                                          {m}m
                                      </button>
                                  ))}
                              </div>
                          )}
                     </div>

                     {/* History Panel Overlay */}
                     {showHistory && (
                         <div className="absolute inset-y-0 right-0 w-80 bg-nd-black border-l border-nd-gray z-20 p-6 overflow-y-auto animate-in slide-in-from-right">
                             <div className="flex justify-between items-center mb-6">
                                 <h3 className="font-bold uppercase tracking-widest">Session Log</h3>
                                 <button onClick={() => setShowHistory(false)}><X size={16} /></button>
                             </div>
                             <div className="space-y-3">
                                 {focusHistory.sort((a,b) => b.timestamp - a.timestamp).map(session => (
                                     <div key={session.id} className="border border-nd-gray/30 p-3 rounded bg-nd-gray/5">
                                         <div className="flex justify-between items-center mb-1">
                                             <span className="text-sm font-bold text-nd-white">{session.label}</span>
                                             <span className="text-xs font-mono text-nd-red">{session.duration}m</span>
                                         </div>
                                         <div className="text-[10px] text-nd-gray font-mono">
                                             {new Date(session.timestamp).toLocaleString()}
                                         </div>
                                     </div>
                                 ))}
                                 {focusHistory.length === 0 && <div className="text-nd-gray text-xs text-center py-4">No sessions recorded.</div>}
                             </div>
                         </div>
                     )}
                </div>
            )}

            {/* VIEW: STOPWATCH */}
            {activeTab === 'stopwatch' && (
                 <div className="h-full flex flex-col items-center justify-center p-8 animate-in fade-in relative">
                     <div className="flex-1 flex flex-col justify-center items-center w-full max-w-md">
                         <div className="text-7xl md:text-8xl font-mono font-bold tabular-nums tracking-tighter mb-8">
                             {(() => {
                                 const t = formatTime(swDisplayMs);
                                 return <>{t.m}:{t.s}<span className="text-4xl text-nd-gray">.{t.ms}</span></>;
                             })()}
                         </div>

                         <div className="grid grid-cols-2 gap-4 w-full">
                             <button 
                                onClick={toggleSw}
                                className={`py-4 rounded-xl font-bold uppercase tracking-widest transition-colors ${clockState.stopwatch.isRunning ? 'bg-nd-red/20 text-nd-red border border-nd-red' : 'bg-nd-white text-nd-black border border-nd-white'}`}
                             >
                                 {clockState.stopwatch.isRunning ? 'Stop' : 'Start'}
                             </button>
                             <button 
                                onClick={clockState.stopwatch.isRunning ? lapSw : resetSw}
                                className="py-4 rounded-xl font-bold uppercase tracking-widest border border-nd-gray text-nd-white hover:bg-nd-gray/20 transition-colors"
                             >
                                 {clockState.stopwatch.isRunning ? 'Lap' : 'Reset'}
                             </button>
                         </div>
                     </div>

                     {/* Laps */}
                     {clockState.stopwatch.laps.length > 0 && (
                         <div className="h-1/3 w-full max-w-md border-t border-nd-gray/30 pt-4 overflow-y-auto">
                             <table className="w-full text-sm font-mono">
                                 <tbody>
                                     {clockState.stopwatch.laps.map((lap, idx) => {
                                         const t = formatTime(lap);
                                         return (
                                             <tr key={idx} className="border-b border-nd-gray/10 text-nd-gray">
                                                 <td className="py-2">Lap {clockState.stopwatch.laps.length - idx}</td>
                                                 <td className="py-2 text-right text-nd-white">{t.m}:{t.s}.{t.ms}</td>
                                             </tr>
                                         );
                                     })}
                                 </tbody>
                             </table>
                         </div>
                     )}
                 </div>
            )}

            {/* VIEW: TIMER */}
            {activeTab === 'timer' && (
                 <div className="h-full flex flex-col items-center justify-center p-8 animate-in fade-in">
                     
                     <div className={`text-8xl font-mono font-bold tabular-nums tracking-tighter mb-12 ${timerDisplaySeconds === 0 ? 'text-nd-red animate-pulse' : 'text-nd-white'}`}>
                          {Math.floor(timerDisplaySeconds / 60).toString().padStart(2, '0')}:{(timerDisplaySeconds % 60).toString().padStart(2, '0')}
                     </div>

                     <div className="flex gap-4 mb-8">
                         {!clockState.timer.isRunning ? (
                             <button onClick={() => startTimer()} className="w-16 h-16 rounded-full bg-nd-white text-nd-black flex items-center justify-center hover:scale-110 transition-transform">
                                 <Play size={24} fill="currentColor" />
                             </button>
                         ) : (
                             <button onClick={pauseTimer} className="w-16 h-16 rounded-full bg-nd-gray/20 text-nd-white border border-nd-gray flex items-center justify-center hover:bg-nd-gray/40 transition-colors">
                                 <Pause size={24} fill="currentColor" />
                             </button>
                         )}
                         <button onClick={resetTimer} className="w-16 h-16 rounded-full border border-nd-gray text-nd-gray flex items-center justify-center hover:text-nd-white hover:border-nd-white transition-colors">
                             <RotateCcw size={20} />
                         </button>
                     </div>

                     <div className="grid grid-cols-3 gap-3">
                         {[1, 5, 10, 15, 30, 60].map(m => (
                             <button 
                                key={m}
                                onClick={() => startTimer(m * 60)}
                                className="px-6 py-3 border border-nd-gray rounded hover:bg-nd-gray/10 font-mono text-sm"
                             >
                                 {m}m
                             </button>
                         ))}
                     </div>
                 </div>
            )}

        </div>
    </div>
  );
};

// --- Sub Components ---

const WorldClockItem = ({ city, offset }: { city: string, offset: number }) => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        // Calculate offset time
        const calcTime = () => {
             const d = new Date();
             const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
             return new Date(utc + (3600000 * offset));
        };
        setTime(calcTime());
        const i = setInterval(() => setTime(calcTime()), 1000);
        return () => clearInterval(i);
    }, [offset]);

    return (
        <div className="flex flex-col items-center">
             <div className="text-xs text-nd-gray uppercase tracking-widest mb-1">{city}</div>
             <div className="text-2xl font-mono font-bold">
                 {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
             </div>
             <div className="text-[10px] text-nd-gray mt-1">
                 {offset > 0 ? `+${offset} UTC` : `${offset} UTC`}
             </div>
        </div>
    );
};