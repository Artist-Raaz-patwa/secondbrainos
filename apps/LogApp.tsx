import React from 'react';
import { useOS } from '../context/OSContext';
import { Wifi, Save, AlertCircle, Info, CheckCircle } from 'lucide-react';

export const LogApp: React.FC = () => {
  const { logs, authStatus } = useOS();

  return (
    <div className="h-full flex flex-col bg-nd-black font-mono text-sm">
      
      {/* Header Status */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-nd-gray bg-nd-black z-10">
        <div className="flex items-center gap-2">
           <div className={`w-2 h-2 rounded-full ${authStatus === 'connected' ? 'bg-green-500 animate-pulse' : 'bg-nd-red'}`}></div>
           <span className="text-xs uppercase tracking-widest text-nd-gray">
             {authStatus === 'connected' ? 'NEURAL UPLINK: ACTIVE' : 'NEURAL UPLINK: OFFLINE'}
           </span>
        </div>
        <div className="flex items-center gap-4 text-xs text-nd-gray">
           <span>ENTRIES: {logs.length}</span>
           <span>MEM: 64KB</span>
        </div>
      </div>

      {/* Logs Console */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {logs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-nd-gray opacity-50">
             <p>AWAITING SYSTEM EVENTS...</p>
          </div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex items-start gap-3 text-xs hover:bg-nd-gray/10 p-1 rounded group">
              <span className="text-nd-gray whitespace-nowrap">
                [{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour:'2-digit', minute:'2-digit', second:'2-digit' })}]
              </span>
              
              <div className="w-[80px] flex-shrink-0 uppercase tracking-tighter text-nd-white/70 font-bold">
                 {log.source}
              </div>

              <div className={`flex-1 ${
                log.type === 'error' ? 'text-nd-red' : 
                log.type === 'success' ? 'text-white' : 
                'text-nd-gray group-hover:text-nd-white'
              }`}>
                {log.message}
              </div>

              <div className="w-6 flex justify-end">
                {log.isCloud ? (
                   <Wifi size={12} className="text-nd-gray group-hover:text-white" />
                ) : (
                   <Save size={12} className="text-nd-gray opacity-50" />
                )}
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
};