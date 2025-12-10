import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useOS } from '../context/OSContext';
import { Activity, XCircle, Cpu, HardDrive, Wifi, MemoryStick, LayoutList, LineChart } from 'lucide-react';
import { AppID } from '../types';

// --- Types ---
interface Process {
  id: string;
  name: string;
  status: 'Running' | 'Background' | 'Not Responding';
  cpu: number;
  memory: number;
  network: number;
  pid: number;
}

const HISTORY_LENGTH = 40;

export const TaskManagerApp: React.FC = () => {
  const { windows, closeApp } = useOS();
  const [activeTab, setActiveTab] = useState<'processes' | 'performance'>('processes');
  const [cpuHistory, setCpuHistory] = useState<number[]>(new Array(HISTORY_LENGTH).fill(0));
  const [memHistory, setMemHistory] = useState<number[]>(new Array(HISTORY_LENGTH).fill(0));
  
  // Simulated Real-time Data
  const [processes, setProcesses] = useState<Process[]>([]);

  // --- Realtime Simulation ---
  useEffect(() => {
    const updateStats = () => {
      // 1. Map open windows to processes
      const activeProcs = Object.values(windows)
        .filter(w => w.isOpen)
        .map(w => {
          // Stable randomness based on PID
          const pid = w.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0); 
          
          // Fluctuate CPU based on focused state
          const baseCpu = w.isOpen && !w.isMinimized ? (Math.random() * 15) : (Math.random() * 2);
          const cpu = parseFloat(baseCpu.toFixed(1));
          
          // Memory somewhat static but fluctuates slightly
          const baseMem = 120 + (pid % 200);
          const mem = Math.floor(baseMem + (Math.random() * 10 - 5));

          const net = Math.random() > 0.8 ? parseFloat((Math.random() * 2).toFixed(1)) : 0;

          return {
            id: w.id,
            name: w.title,
            status: w.isMinimized ? 'Background' : 'Running',
            cpu,
            memory: mem,
            network: net,
            pid
          } as Process;
        });

      // 2. Add System Idle Process
      const totalAppCpu = activeProcs.reduce((acc, p) => acc + p.cpu, 0);
      const systemIdle = {
          id: 'system_idle',
          name: 'System Idle Process',
          status: 'Running',
          cpu: Math.max(0, parseFloat((100 - totalAppCpu).toFixed(1))),
          memory: 4096, // Kernel reserved
          network: 0,
          pid: 0
      } as Process;

      setProcesses([systemIdle, ...activeProcs]);

      // 3. Update Global History
      const globalCpu = 100 - systemIdle.cpu;
      const globalMem = activeProcs.reduce((acc, p) => acc + p.memory, 0) + 2048; // Base OS usage

      setCpuHistory(prev => [...prev.slice(1), globalCpu]);
      setMemHistory(prev => [...prev.slice(1), globalMem]);
    };

    const interval = setInterval(updateStats, 1000);
    updateStats(); // Initial run
    return () => clearInterval(interval);
  }, [windows]);

  // --- Render Helpers ---

  const drawGraph = (data: number[], color: string, maxVal: number) => {
      const width = 100;
      const height = 40;
      const points = data.map((val, i) => {
          const x = (i / (HISTORY_LENGTH - 1)) * width;
          const y = height - ((val / maxVal) * height);
          return `${x},${y}`;
      }).join(' ');

      return (
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
              <polyline 
                  fill="none" 
                  stroke={color} 
                  strokeWidth="1.5" 
                  points={points} 
                  vectorEffect="non-scaling-stroke"
              />
              <polygon 
                  fill={color} 
                  fillOpacity="0.1" 
                  points={`0,${height} ${points} ${width},${height}`} 
              />
          </svg>
      );
  };

  const currentCpu = cpuHistory[cpuHistory.length - 1];
  const currentMem = memHistory[memHistory.length - 1];

  return (
    <div className="flex flex-col h-full bg-nd-black text-nd-white font-sans text-sm">
        
        {/* Sidebar / Tabs */}
        <div className="flex items-center border-b border-nd-gray bg-nd-black shrink-0 px-4">
            <button 
                onClick={() => setActiveTab('processes')}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${activeTab === 'processes' ? 'border-nd-white text-nd-white' : 'border-transparent text-nd-gray hover:text-nd-white'}`}
            >
                <LayoutList size={16} /> Processes
            </button>
            <button 
                onClick={() => setActiveTab('performance')}
                className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${activeTab === 'performance' ? 'border-nd-white text-nd-white' : 'border-transparent text-nd-gray hover:text-nd-white'}`}
            >
                <LineChart size={16} /> Performance
            </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden relative">
            
            {/* PROCESSES TAB */}
            {activeTab === 'processes' && (
                <div className="h-full flex flex-col">
                    {/* Header Row */}
                    <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-nd-gray/50 bg-nd-gray/10 text-[10px] font-bold uppercase text-nd-gray select-none">
                        <div className="col-span-5">Name</div>
                        <div className="col-span-2 text-right">Status</div>
                        <div className="col-span-2 text-right">CPU</div>
                        <div className="col-span-2 text-right">Memory</div>
                        <div className="col-span-1 text-center"></div>
                    </div>
                    
                    {/* List */}
                    <div className="flex-1 overflow-y-auto">
                        {processes.map(proc => (
                            <div key={proc.id} className="grid grid-cols-12 gap-2 px-4 py-2 hover:bg-nd-gray/10 border-b border-nd-gray/10 items-center group font-mono text-xs">
                                <div className="col-span-5 flex items-center gap-2 overflow-hidden">
                                    <div className={`w-2 h-2 rounded-full ${proc.name === 'System Idle Process' ? 'bg-nd-gray' : 'bg-green-500'}`} />
                                    <span className="truncate font-sans font-medium text-nd-white">{proc.name}</span>
                                    <span className="text-[10px] text-nd-gray ml-1 opacity-50">({proc.pid})</span>
                                </div>
                                <div className="col-span-2 text-right text-nd-gray">{proc.status}</div>
                                <div className={`col-span-2 text-right ${proc.cpu > 10 ? 'text-nd-red font-bold' : ''}`}>{proc.cpu.toFixed(1)}%</div>
                                <div className="col-span-2 text-right">{proc.memory.toLocaleString()} MB</div>
                                <div className="col-span-1 text-center">
                                    {proc.name !== 'System Idle Process' && (
                                        <button 
                                            onClick={() => closeApp(proc.id as AppID)}
                                            className="text-nd-gray hover:text-nd-red opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="End Task"
                                        >
                                            <XCircle size={14} />
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    {/* Footer */}
                    <div className="px-4 py-2 border-t border-nd-gray bg-nd-black text-[10px] text-nd-gray flex justify-between">
                        <span>Processes: {processes.length}</span>
                        <span>Update Speed: Normal</span>
                    </div>
                </div>
            )}

            {/* PERFORMANCE TAB */}
            {activeTab === 'performance' && (
                <div className="h-full overflow-y-auto p-6 space-y-6">
                    
                    {/* CPU Graph */}
                    <div className="border border-nd-gray rounded-lg p-4 bg-nd-black relative overflow-hidden">
                        <div className="flex justify-between items-start mb-4 relative z-10">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2 text-nd-gray text-xs uppercase tracking-widest font-bold mb-1">
                                    <Cpu size={16} /> CPU Usage
                                </div>
                                <div className="text-3xl font-mono font-bold text-nd-white">{currentCpu.toFixed(1)}%</div>
                            </div>
                            <div className="text-right text-[10px] text-nd-gray font-mono">
                                Virtual Core x8<br/>
                                3.20 GHz
                            </div>
                        </div>
                        <div className="h-32 w-full bg-nd-gray/5 border border-nd-gray/20 rounded">
                            {drawGraph(cpuHistory, 'var(--color-accent)', 100)}
                        </div>
                    </div>

                    {/* Memory Graph */}
                    <div className="border border-nd-gray rounded-lg p-4 bg-nd-black relative overflow-hidden">
                        <div className="flex justify-between items-start mb-4 relative z-10">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-2 text-nd-gray text-xs uppercase tracking-widest font-bold mb-1">
                                    <MemoryStick size={16} /> Memory
                                </div>
                                <div className="text-3xl font-mono font-bold text-nd-white">{(currentMem / 1024).toFixed(1)} GB</div>
                            </div>
                            <div className="text-right text-[10px] text-nd-gray font-mono">
                                16.0 GB Total<br/>
                                DDR5
                            </div>
                        </div>
                        <div className="h-32 w-full bg-nd-gray/5 border border-nd-gray/20 rounded">
                            {drawGraph(memHistory, '#ffffff', 16384)}
                        </div>
                    </div>

                    {/* Mini Stats Grid */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="border border-nd-gray rounded-lg p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-nd-gray/10 rounded"><HardDrive size={18} className="text-nd-gray"/></div>
                                <div>
                                    <div className="text-[10px] uppercase text-nd-gray">Disk 0 (C:)</div>
                                    <div className="text-lg font-mono font-bold">1%</div>
                                </div>
                            </div>
                            <div className="h-8 w-16">
                                {/* Tiny sparkline logic could go here */}
                                <div className="w-full h-full bg-nd-gray/10 rounded overflow-hidden relative">
                                    <div className="absolute bottom-0 left-0 w-full bg-nd-white" style={{ height: '5%' }}></div>
                                </div>
                            </div>
                        </div>

                        <div className="border border-nd-gray rounded-lg p-4 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-nd-gray/10 rounded"><Wifi size={18} className="text-nd-gray"/></div>
                                <div>
                                    <div className="text-[10px] uppercase text-nd-gray">Wi-Fi</div>
                                    <div className="text-lg font-mono font-bold">42 Kbps</div>
                                </div>
                            </div>
                            <div className="h-8 w-16">
                                <div className="w-full h-full bg-nd-gray/10 rounded overflow-hidden relative">
                                    <div className="absolute bottom-0 left-0 w-full bg-nd-white" style={{ height: '20%' }}></div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
            )}

        </div>
    </div>
  );
};