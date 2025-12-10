import React, { useEffect, useState } from 'react';
import { useOS } from '../../context/OSContext';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

export const ToastNotification: React.FC = () => {
  const { logs } = useOS();
  const [visibleToast, setVisibleToast] = useState<any | null>(null);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Whenever a new log arrives, show it if it's recent (< 100ms ago)
    if (logs.length > 0) {
      const latest = logs[0];
      const now = Date.now();
      if (now - latest.timestamp < 500) {
        setVisibleToast(latest);
        setIsExiting(false);
        
        const t = setTimeout(() => {
            setIsExiting(true);
            setTimeout(() => setVisibleToast(null), 300); // Wait for exit animation
        }, 3000);
        return () => clearTimeout(t);
      }
    }
  }, [logs]);

  if (!visibleToast) return null;

  const getIcon = () => {
      switch (visibleToast.type) {
          case 'success': return <CheckCircle size={18} className="text-green-500" />;
          case 'error': return <AlertCircle size={18} className="text-nd-red" />;
          case 'warning': return <AlertTriangle size={18} className="text-yellow-500" />;
          default: return <Info size={18} className="text-nd-white" />;
      }
  };

  return (
    <div className={`
        fixed top-4 left-1/2 -translate-x-1/2 z-[10000]
        flex items-center gap-3 px-4 py-3 rounded-full
        bg-nd-black/90 backdrop-blur-xl border border-nd-gray shadow-2xl
        transition-all duration-300 ease-out
        ${isExiting ? 'opacity-0 -translate-y-4' : 'opacity-100 translate-y-0'}
    `}>
        {getIcon()}
        <div className="flex flex-col">
            <span className="text-xs font-bold text-nd-white">{visibleToast.message}</span>
            <span className="text-[10px] text-nd-gray uppercase tracking-widest">{visibleToast.source}</span>
        </div>
        <button onClick={() => setIsExiting(true)} className="ml-2 text-nd-gray hover:text-nd-white">
            <X size={14} />
        </button>
    </div>
  );
};