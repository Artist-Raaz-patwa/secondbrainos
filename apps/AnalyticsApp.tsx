import React, { useState, useEffect } from 'react';
import { db, auth } from '../services/firebase';
import { ref, get } from 'firebase/database';
import { 
  BarChart2, PieChart, Activity, Cpu, BrainCircuit, 
  Zap, Calendar, DollarSign, Clock, Layout, RefreshCw,
  TrendingUp, Download, HardDrive, FileText, Image as ImageIcon, Music, Video
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { AppID, AppUsageStats } from '../types';
import { GoogleGenAI } from "@google/genai";

// --- Types ---

interface SystemData {
  tasks: any[];
  habits: any[];
  habitLogs: any;
  wallet: {
      accounts: any[];
      transactions: any[];
  };
  usage: Record<string, AppUsageStats>;
  logs: any[];
  focusSessions: any[];
}

// --- Component ---

export const AnalyticsApp: React.FC = () => {
  const { authStatus, addLog, fs } = useOS();
  const [data, setData] = useState<SystemData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [report, setReport] = useState<string | null>(null);
  const [isThinking, setIsThinking] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'usage' | 'finance' | 'wellbeing' | 'storage' | 'ai'>('overview');

  // --- Data Fetching ---

  const fetchData = async () => {
      setIsLoading(true);
      const snapshot: Partial<SystemData> = {
          tasks: [], habits: [], habitLogs: {}, wallet: { accounts: [], transactions: [] }, usage: {}, logs: [], focusSessions: []
      };

      if (authStatus === 'connected' && auth.currentUser) {
          const uid = auth.currentUser.uid;
          
          try {
              const [tSnap, hSnap, hlSnap, waSnap, wtSnap, uSnap, fSnap] = await Promise.all([
                  get(ref(db, `users/${uid}/tasks`)),
                  get(ref(db, `users/${uid}/habits`)),
                  get(ref(db, `users/${uid}/habit_logs`)),
                  get(ref(db, `users/${uid}/wallet/accounts`)),
                  get(ref(db, `users/${uid}/wallet/transactions`)),
                  get(ref(db, `users/${uid}/system/usage`)),
                  get(ref(db, `users/${uid}/focus_sessions`))
              ]);

              snapshot.tasks = tSnap.val() ? Object.values(tSnap.val()) : [];
              snapshot.habits = hSnap.val() ? Object.values(hSnap.val()) : [];
              snapshot.habitLogs = hlSnap.val() || {};
              snapshot.wallet = {
                  accounts: waSnap.val() ? Object.values(waSnap.val()) : [],
                  transactions: wtSnap.val() ? Object.values(wtSnap.val()) : []
              };
              snapshot.usage = uSnap.val() || {};
              snapshot.focusSessions = fSnap.val() ? Object.values(fSnap.val()) : [];
          } catch (e) {
              console.error("Analytics Fetch Error", e);
          }
      } else {
          // Local Storage Fallback
          snapshot.tasks = JSON.parse(localStorage.getItem('nd_os_tasks') || '[]');
          snapshot.habits = JSON.parse(localStorage.getItem('nd_os_habits') || '[]');
          snapshot.habitLogs = JSON.parse(localStorage.getItem('nd_os_habit_logs') || '{}');
          snapshot.wallet = {
              accounts: JSON.parse(localStorage.getItem('nd_os_wallet_accounts') || '[]'),
              transactions: JSON.parse(localStorage.getItem('nd_os_wallet_transactions') || '[]')
          };
          snapshot.usage = JSON.parse(localStorage.getItem('nd_os_app_usage') || '{}');
          snapshot.focusSessions = JSON.parse(localStorage.getItem('nd_os_focus_history') || '[]');
      }

      setData(snapshot as SystemData);
      setIsLoading(false);
  };

  useEffect(() => {
      fetchData();
  }, [authStatus]);

  // --- AI Report Generation ---

  const generateReport = async () => {
      if (!data) return;
      const apiKey = localStorage.getItem('nd_os_api_key') || process.env.API_KEY;
      
      if (!apiKey) {
          setReport("Error: Missing API Key. Please configure it in System Settings > AI.");
          return;
      }

      setIsThinking(true);
      
      try {
          const ai = new GoogleGenAI({ apiKey });
          
          // Prepare Context (Summarized to save tokens)
          const context = {
              taskCompletionRate: (data.tasks.filter((t: any) => t.completed).length / (data.tasks.length || 1) * 100).toFixed(0) + '%',
              topHabits: data.habits.map((h: any) => h.title),
              habitConsistency: Object.keys(data.habitLogs).length + " days logged",
              netWorth: data.wallet.accounts.reduce((acc: number, a: any) => acc + a.balance, 0),
              recentExpenses: data.wallet.transactions.filter((t: any) => t.type === 'expense').slice(0, 5).map((t: any) => `${t.category}: $${t.amount}`),
              mostUsedApp: Object.entries(data.usage).sort(([,a], [,b]) => b.minutesOpen - a.minutesOpen)[0]?.[0] || 'None',
              focusSessions: data.focusSessions.length,
              totalFocusMinutes: data.focusSessions.reduce((acc, s) => acc + s.duration, 0)
          };

          const prompt = `
            You are the Chief Intelligence Officer of this Operating System.
            Analyze the user's life data:
            ${JSON.stringify(context, null, 2)}

            Generate a "State of the Union" report.
            1. Identify 1 productivity pattern.
            2. Identify 1 financial insight.
            3. Give a brutal but constructive rating (0-100) of their digital life.
            4. Suggest one specific optimization.
            
            Format as:
            ## EXECUTIVE SUMMARY
            ...
            ## PATTERN RECOGNITION
            ...
            ## DIRECTIVE
            ...
          `;

          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt
          });

          setReport(response.text || "Analysis failed.");
      } catch (e: any) {
          setReport("Neural Link Error: " + (e.message || "Unknown error"));
      } finally {
          setIsThinking(false);
      }
  };

  // --- Calculations ---

  const calcProductivityScore = () => {
      if (!data) return 0;
      const totalTasks = data.tasks.length || 1;
      const completedTasks = data.tasks.filter((t: any) => t.completed).length;
      const taskScore = (completedTasks / totalTasks) * 40; 

      const habitDays = Object.keys(data.habitLogs).length;
      const habitScore = Math.min(30, habitDays * 2);

      const focusScore = Math.min(30, (data.focusSessions.reduce((acc, s) => acc + s.duration, 0) / 300) * 30); // 300 mins target

      return Math.round(taskScore + habitScore + focusScore);
  };

  // --- Render ---

  if (!data) return <div className="h-full flex items-center justify-center"><RefreshCw className="animate-spin text-nd-gray" /></div>;

  const score = calcProductivityScore();

  return (
    <div className="h-full flex flex-col bg-nd-black text-nd-white font-sans overflow-hidden">
        
        {/* Header */}
        <div className="h-[60px] border-b border-nd-gray flex items-center justify-between px-6 bg-nd-black shrink-0 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-3 flex-shrink-0">
                <Activity size={20} className="text-nd-red" />
                <h1 className="font-bold text-sm tracking-widest uppercase hidden md:block">System Analytics</h1>
            </div>
            <div className="flex bg-nd-gray/10 rounded-lg p-1 gap-1">
                {(['overview', 'usage', 'wellbeing', 'finance', 'storage', 'ai'] as const).map(tab => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all whitespace-nowrap ${activeTab === tab ? 'bg-nd-white text-nd-black' : 'text-nd-gray hover:text-nd-white'}`}
                    >
                        {tab}
                    </button>
                ))}
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 md:p-8">
            
            {/* VIEW: OVERVIEW */}
            {activeTab === 'overview' && (
                <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in">
                    {/* Score Card */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="border border-nd-gray p-8 relative overflow-hidden bg-gradient-to-br from-black to-nd-gray/10 rounded-2xl flex flex-col justify-center">
                            <div className="absolute top-4 right-4 opacity-20"><Zap size={64} /></div>
                            <h3 className="text-xs font-bold uppercase text-nd-gray tracking-widest mb-2">Productivity Pulse</h3>
                            <div className="flex items-baseline gap-4">
                                <span className="text-6xl md:text-8xl font-mono font-bold tracking-tighter">{score}</span>
                                <span className="text-xl text-nd-gray">/100</span>
                            </div>
                            <div className="w-full h-2 bg-nd-gray/20 rounded-full mt-6 overflow-hidden">
                                <div className="h-full bg-nd-white transition-all duration-1000 ease-out" style={{ width: `${score}%` }} />
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <StatCard 
                                label="Completed Tasks" 
                                value={data.tasks.filter((t: any) => t.completed).length.toString()} 
                                icon={Layout}
                            />
                            <StatCard 
                                label="Total Focus" 
                                value={`${(data.focusSessions.reduce((acc, s) => acc + s.duration, 0) / 60).toFixed(1)}h`} 
                                icon={BrainCircuit}
                            />
                            <StatCard 
                                label="Net Worth" 
                                value={`$${data.wallet.accounts.reduce((acc: number, a: any) => acc + a.balance, 0).toLocaleString()}`} 
                                icon={DollarSign}
                            />
                            <StatCard 
                                label="Stored Files" 
                                value={fs.length.toString()} 
                                icon={HardDrive}
                            />
                        </div>
                    </div>

                    {/* Quick Charts */}
                    <div>
                        <h3 className="text-xs font-bold uppercase text-nd-gray tracking-widest mb-4">Task Velocity</h3>
                        <div className="h-32 flex items-end gap-1 border-b border-nd-gray/50 pb-1">
                            {/* Simulated chart bars */}
                            {[20, 45, 30, 60, 80, 50, score].map((h, i) => (
                                <div key={i} className="flex-1 bg-nd-gray/20 hover:bg-nd-red transition-colors relative group" style={{ height: `${h}%` }}>
                                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[10px] opacity-0 group-hover:opacity-100 transition-opacity font-mono">{h}%</div>
                                </div>
                            ))}
                        </div>
                        <div className="flex justify-between text-[10px] text-nd-gray font-mono mt-2 uppercase">
                            <span>Last 7 Days</span>
                            <span>Today</span>
                        </div>
                    </div>
                </div>
            )}

            {/* VIEW: USAGE */}
            {activeTab === 'usage' && (
                <div className="max-w-4xl mx-auto animate-in fade-in">
                    <h3 className="text-xl font-bold font-mono mb-6">APP TELEMETRY</h3>
                    <div className="space-y-4">
                        {Object.entries(data.usage)
                            .sort(([,a], [,b]) => b.minutesOpen - a.minutesOpen)
                            .map(([appId, stats]: [string, AppUsageStats]) => {
                                const maxMinutes = Math.max(...Object.values(data.usage).map((u: any) => u.minutesOpen));
                                const percent = (stats.minutesOpen / (maxMinutes || 1)) * 100;
                                
                                return (
                                    <div key={appId} className="group">
                                        <div className="flex justify-between items-end mb-1">
                                            <span className="font-bold uppercase text-sm tracking-wider">{appId}</span>
                                            <div className="text-right">
                                                <span className="font-mono text-xs text-nd-white">{stats.minutesOpen.toFixed(1)}m</span>
                                                <span className="text-[10px] text-nd-gray ml-2">({stats.launches} launches)</span>
                                            </div>
                                        </div>
                                        <div className="h-4 bg-nd-gray/10 w-full rounded-sm overflow-hidden flex items-center">
                                            <div 
                                                className="h-full bg-nd-white group-hover:bg-nd-red transition-all duration-500" 
                                                style={{ width: `${percent}%` }} 
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}

            {/* VIEW: WELLBEING (Focus) */}
            {activeTab === 'wellbeing' && (
                <div className="max-w-4xl mx-auto animate-in fade-in">
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-xl font-bold font-mono">DIGITAL WELLBEING</h3>
                        <div className="text-right">
                            <div className="text-2xl font-bold font-mono">{data.focusSessions.length}</div>
                            <div className="text-[10px] text-nd-gray uppercase tracking-widest">Sessions Logged</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="border border-nd-gray p-6 rounded-xl bg-nd-black">
                            <h4 className="text-xs text-nd-gray uppercase tracking-widest mb-4">Focus Distribution</h4>
                            <div className="h-48 flex items-end justify-between gap-2">
                                {data.focusSessions.slice(-7).map((s, i) => (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                                        <div 
                                            className="w-full bg-nd-white/20 hover:bg-nd-white transition-colors rounded-t-sm" 
                                            style={{ height: `${Math.min(100, s.duration * 2)}%` }}
                                        />
                                        <span className="text-[10px] font-mono text-nd-gray">{s.duration}m</span>
                                    </div>
                                ))}
                                {data.focusSessions.length === 0 && <div className="w-full text-center text-nd-gray text-xs">No data recorded</div>}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="p-4 border border-nd-gray rounded-lg flex items-center gap-4">
                                <Clock size={24} className="text-nd-red" />
                                <div>
                                    <div className="text-sm font-bold">Most Productive Hour</div>
                                    <div className="text-xs text-nd-gray">10:00 AM - 11:00 AM (Estimated)</div>
                                </div>
                            </div>
                            <div className="p-4 border border-nd-gray rounded-lg flex items-center gap-4">
                                <BrainCircuit size={24} className="text-nd-white" />
                                <div>
                                    <div className="text-sm font-bold">Deep Work Streak</div>
                                    <div className="text-xs text-nd-gray">3 Days Active</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* VIEW: FINANCE */}
            {activeTab === 'finance' && (
                <div className="max-w-4xl mx-auto animate-in fade-in">
                     <h3 className="text-xl font-bold font-mono mb-6">WEALTH DISTRIBUTION</h3>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                         <div className="border border-nd-gray p-8 flex flex-col items-center justify-center aspect-square rounded-2xl relative bg-nd-black">
                             <div className="text-center z-10">
                                 <div className="text-[10px] text-nd-gray uppercase tracking-widest mb-2">Total Net Worth</div>
                                 <div className="text-4xl font-mono font-bold">
                                     ${data.wallet.accounts.reduce((acc: number, a: any) => acc + a.balance, 0).toLocaleString()}
                                 </div>
                             </div>
                         </div>
                         <div className="space-y-2">
                             {data.wallet.accounts.sort((a: any, b: any) => b.balance - a.balance).map((acc: any) => (
                                 <div key={acc.id} className="flex justify-between items-center p-4 border border-nd-gray/50 hover:border-nd-white transition-colors bg-nd-gray/5 rounded-lg">
                                     <div>
                                         <div className="font-bold text-sm">{acc.bankName}</div>
                                         <div className="text-[10px] text-nd-gray font-mono uppercase">{acc.type} •••• {acc.lastFour}</div>
                                     </div>
                                     <div className="font-mono">${acc.balance.toLocaleString()}</div>
                                 </div>
                             ))}
                         </div>
                     </div>
                </div>
            )}

            {/* VIEW: STORAGE */}
            {activeTab === 'storage' && (
                <div className="max-w-4xl mx-auto animate-in fade-in">
                    <h3 className="text-xl font-bold font-mono mb-6">FILE SYSTEM</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                        <div className="bg-nd-gray/5 border border-nd-gray rounded-xl p-6">
                            <h4 className="text-xs text-nd-gray uppercase tracking-widest mb-4">Storage Usage</h4>
                            <div className="flex items-end gap-2 text-nd-white mb-2">
                                <span className="text-4xl font-mono font-bold">
                                    {(fs.reduce((acc, f) => acc + f.size, 0) / (1024*1024)).toFixed(1)}
                                </span>
                                <span className="text-sm mb-1 text-nd-gray">MB Used</span>
                            </div>
                            <div className="w-full bg-nd-gray/20 h-2 rounded-full overflow-hidden">
                                {/* Mock capacity 64MB for this visual, realistic is much higher but files are small in this demo */}
                                <div className="h-full bg-nd-white" style={{ width: `${Math.min(100, (fs.reduce((acc, f) => acc + f.size, 0) / (64*1024*1024)) * 100)}%` }}></div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 border border-nd-gray rounded bg-nd-black flex flex-col items-center justify-center gap-2">
                                <FileText size={20} className="text-nd-white" />
                                <span className="text-lg font-bold">{fs.filter(f => f.type === 'text').length}</span>
                                <span className="text-lg font-bold">{fs.filter(f => f.type === 'text').length}</span>
                                <span className="text-[10px] text-nd-gray uppercase">Documents</span>
                            </div>
                            <div className="p-4 border border-nd-gray rounded bg-nd-black flex flex-col items-center justify-center gap-2">
                                <ImageIcon size={20} className="text-nd-red" />
                                <span className="text-lg font-bold">{fs.filter(f => f.type === 'image').length}</span>
                                <span className="text-[10px] text-nd-gray uppercase">Images</span>
                            </div>
                        </div>
                    </div>

                    <h4 className="text-xs text-nd-gray uppercase tracking-widest mb-4">Largest Files</h4>
                    <div className="border border-nd-gray rounded-xl overflow-hidden">
                        {fs.sort((a,b) => b.size - a.size).slice(0, 5).map(f => (
                            <div key={f.id} className="flex justify-between items-center p-3 border-b border-nd-gray/20 last:border-0 hover:bg-nd-gray/5">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    {f.type === 'image' ? <ImageIcon size={14} /> : <FileText size={14} />}
                                    <span className="text-sm truncate">{f.name}</span>
                                </div>
                                <span className="text-xs font-mono text-nd-gray">{(f.size/1024).toFixed(1)} KB</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* VIEW: AI INTELLIGENCE */}
            {activeTab === 'ai' && (
                <div className="max-w-3xl mx-auto animate-in fade-in h-full flex flex-col">
                    {!report ? (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border border-nd-gray border-dashed rounded-2xl bg-nd-gray/5">
                            <BrainCircuit size={64} className={`mb-6 ${isThinking ? 'animate-pulse text-nd-red' : 'text-nd-gray'}`} />
                            <h2 className="text-2xl font-bold mb-2">Neural Analysis</h2>
                            <p className="text-nd-gray mb-8 max-w-md">
                                Allow the Gemini Engine to scan your entire OS database (Tasks, Habits, Finances, Usage) to find correlations and optimize your life.
                            </p>
                            <button 
                                onClick={generateReport}
                                disabled={isThinking}
                                className="bg-nd-white text-nd-black px-8 py-3 font-bold uppercase tracking-widest hover:bg-white/90 disabled:opacity-50 transition-transform hover:scale-105"
                            >
                                {isThinking ? 'Processing...' : 'Generate Report'}
                            </button>
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col min-h-0">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-xl font-bold uppercase flex items-center gap-2">
                                    <BrainCircuit className="text-nd-red" /> Intelligence Report
                                </h2>
                                <button onClick={() => setReport(null)} className="text-xs underline text-nd-gray hover:text-nd-white">Reset</button>
                            </div>
                            <div className="flex-1 overflow-y-auto border border-nd-gray p-8 bg-nd-black rounded-xl font-mono text-sm leading-relaxed whitespace-pre-wrap shadow-2xl">
                                {report}
                            </div>
                        </div>
                    )}
                </div>
            )}

        </div>
    </div>
  );
};

// --- Sub Components ---

const StatCard = ({ label, value, icon: Icon, subValue }: any) => (
    <div className="border border-nd-gray p-4 flex flex-col justify-between hover:border-nd-white transition-colors bg-nd-black rounded-xl">
        <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] text-nd-gray uppercase tracking-widest">{label}</span>
            <Icon size={14} className="text-nd-gray" />
        </div>
        <div>
            <div className="text-xl font-bold font-mono truncate">{value}</div>
            {subValue && <div className="text-[10px] text-nd-gray mt-1">{subValue}</div>}
        </div>
    </div>
);