import React, { useState, useRef, useEffect } from 'react';
import { AppID } from '../../types';
import { APP_REGISTRY } from '../../registry';
import { useOS } from '../../context/OSContext';
import { Settings, Plus, X, GripHorizontal, Check } from 'lucide-react';

interface DockProps {
  onOpenApp: (id: AppID) => void;
  activeApp: string | null;
  hasOpenWindows: boolean;
}

export const Dock: React.FC<DockProps> = ({ onOpenApp, activeApp, hasOpenWindows }) => {
  const { dockApps, toggleDockApp } = useOS();
  const [isEditing, setIsEditing] = useState(false);
  
  // Auto-hide Logic
  const [isDockVisible, setIsDockVisible] = useState(true);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startHideTimer = () => {
      clearHideTimer();
      hideTimeoutRef.current = setTimeout(() => {
          setIsDockVisible(false);
      }, 2000); // Hide after 2 seconds of inactivity
  };

  const clearHideTimer = () => {
      if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current);
          hideTimeoutRef.current = null;
      }
  };

  const handleInteractionStart = () => {
      setIsDockVisible(true);
      clearHideTimer();
  };

  const handleInteractionEnd = () => {
      if (hasOpenWindows && !isEditing) {
          startHideTimer();
      }
  };

  // Sync visibility with window state
  useEffect(() => {
    if (hasOpenWindows && !isEditing) {
        startHideTimer();
    } else {
        setIsDockVisible(true);
        clearHideTimer();
    }
    return () => clearHideTimer();
  }, [hasOpenWindows, isEditing]);

  // Long Press Logic
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  const startPress = () => {
    handleInteractionStart(); // Keep visible during press
    timerRef.current = setTimeout(() => {
      setIsEditing(true);
      if (navigator.vibrate) navigator.vibrate(50); // Haptic feedback
    }, 600);
  };

  const endPress = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // We don't immediately hide on endPress/click to allow for UI interaction feedback
    // The onMouseLeave will handle the hide trigger eventually
  };

  // Close editing when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
       const target = e.target as HTMLElement;
       const isInsideDock = target.closest('#dock-container');
       const isInsideModal = target.closest('#dock-library-modal');
       
       // Only close if click is OUTSIDE both dock and modal
       if (isEditing && !isInsideDock && !isInsideModal) {
           setIsEditing(false);
       }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isEditing]);

  return (
    <>
        {/* Hover Trigger Zone at Bottom Screen Edge */}
        <div 
            className="fixed bottom-0 left-0 right-0 h-4 z-[9990]"
            onMouseEnter={handleInteractionStart}
        />

        {/* App Library Modal (Edit Mode) */}
        {isEditing && (
            <div 
                id="dock-library-modal"
                className="fixed bottom-32 left-1/2 -translate-x-1/2 w-[90vw] max-w-[400px] bg-nd-black/90 backdrop-blur-xl border border-nd-gray rounded-2xl z-[9999] shadow-2xl animate-in slide-in-from-bottom-5 overflow-hidden"
            >
                <div className="flex items-center justify-between p-4 border-b border-nd-gray bg-white/5">
                    <span className="text-xs font-bold uppercase tracking-widest pl-1">Modify Dock</span>
                    <button onClick={() => setIsEditing(false)} className="p-1.5 hover:bg-nd-red hover:text-white rounded-md transition-colors">
                        <X size={14} />
                    </button>
                </div>
                <div className="p-3 grid grid-cols-4 gap-3 max-h-[300px] overflow-y-auto">
                    {Object.values(APP_REGISTRY).map(app => {
                        const isPinned = dockApps.includes(app.id);
                        return (
                            <button
                                key={app.id}
                                onClick={() => toggleDockApp(app.id)}
                                className={`flex flex-col items-center justify-center p-3 rounded-xl gap-2 border transition-all relative group ${
                                    isPinned 
                                    ? 'bg-nd-white text-nd-black border-nd-white shadow-lg' 
                                    : 'bg-transparent text-nd-gray border-transparent hover:bg-white/5 hover:border-nd-gray'
                                }`}
                            >
                                <app.icon size={24} strokeWidth={isPinned ? 2 : 1.5} />
                                <span className="text-[10px] font-mono uppercase truncate w-full text-center tracking-tight">{app.title}</span>
                                {isPinned && (
                                    <div className="absolute top-2 right-2 w-2 h-2 bg-green-500 rounded-full shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                                )}
                            </button>
                        );
                    })}
                </div>
            </div>
        )}

        {/* Main Dock Container */}
        <div 
            id="dock-container"
            className={`
                fixed bottom-8 left-1/2 z-[9999] flex flex-col items-center gap-3 w-auto max-w-[95vw]
                transition-transform duration-500 ease-[cubic-bezier(0.19,1,0.22,1)]
                ${isDockVisible 
                    ? '-translate-x-1/2 translate-y-0' 
                    : '-translate-x-1/2 translate-y-[200%]'
                }
            `}
            onMouseEnter={handleInteractionStart}
            onMouseLeave={handleInteractionEnd}
        >
          {isEditing && (
              <div className="text-[9px] bg-nd-red/20 text-nd-red border border-nd-red/50 px-3 py-1 rounded-full font-mono uppercase tracking-widest animate-pulse shadow-[0_0_15px_rgba(235,0,0,0.2)] backdrop-blur-md">
                  Dock Edit Mode
              </div>
          )}
          
          <div 
            className={`
                bg-nd-black/60 backdrop-blur-2xl border border-nd-gray/50 px-2 py-2 md:px-3 md:py-3 rounded-3xl flex items-center gap-2 md:gap-3 shadow-[0px_20px_50px_rgba(0,0,0,0.6)] transition-all duration-300 ease-expo
                ${isEditing ? 'border-nd-white/50 scale-105 ring-2 ring-nd-white/10' : 'hover:border-nd-gray hover:bg-nd-black/80'}
            `}
            onContextMenu={(e) => { e.preventDefault(); setIsEditing(true); }}
          >
            {dockApps.map((appId) => {
              const app = APP_REGISTRY[appId];
              if (!app) return null;

              const isAi = appId === AppID.AI_CHAT;
              const isActive = activeApp === app.id;
              
              return (
                <div 
                  key={app.id}
                  className="relative group"
                  onMouseDown={startPress}
                  onMouseUp={endPress}
                  onMouseLeave={endPress}
                  onTouchStart={startPress}
                  onTouchEnd={endPress}
                >
                  {/* Remove Button in Edit Mode */}
                  {isEditing && (
                      <button 
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { 
                            e.preventDefault(); 
                            e.stopPropagation(); 
                            toggleDockApp(app.id); 
                        }}
                        className="absolute -top-3 -right-2 z-[100] w-6 h-6 bg-nd-black text-nd-red border border-nd-red rounded-full flex items-center justify-center shadow-lg hover:bg-nd-red hover:text-white transition-all scale-100 cursor-pointer"
                      >
                          <X size={12} strokeWidth={3} />
                      </button>
                  )}

                  <div 
                    onClick={() => !isEditing && onOpenApp(app.id)}
                    className={`
                        relative flex flex-col items-center justify-center cursor-pointer transition-all duration-500 ease-expo
                        ${isEditing ? 'animate-[wiggle_0.3s_infinite] pointer-events-none' : 'hover:-translate-y-2'}
                        ${isActive ? 'opacity-100' : 'opacity-80 hover:opacity-100'}
                    `}
                  >
                    <div className={`
                        p-3 md:p-3.5 rounded-2xl transition-all duration-300 border backdrop-blur-sm
                        ${isAi 
                            ? (isActive ? 'bg-nd-red text-white border-nd-red shadow-[0_0_20px_var(--color-accent)]' : 'bg-nd-white/10 text-nd-white border-nd-white/20 hover:bg-nd-red hover:border-nd-red hover:text-white') 
                            : (isActive ? 'bg-nd-white text-nd-black border-nd-white shadow-[0_0_20px_rgba(255,255,255,0.3)]' : 'bg-transparent text-nd-gray border-transparent hover:bg-nd-white/10 hover:border-nd-white/30 hover:text-nd-white')
                        }
                    `}>
                      <app.icon size={24} strokeWidth={1.5} className="md:w-6 md:h-6" />
                    </div>

                    {/* Active Indicator */}
                    <div className={`
                        absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full transition-all duration-300
                        ${isActive && !isEditing ? 'bg-nd-white shadow-[0_0_8px_white] w-1.5 h-1.5' : 'bg-transparent w-0'}
                    `} />
                  </div>
                  
                  {/* Tooltip */}
                  {!isEditing && (
                      <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-nd-black/90 border border-nd-gray rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 transform translate-y-2 group-hover:translate-y-0 pointer-events-none z-20 shadow-xl">
                        <span className="text-[10px] font-bold text-nd-white whitespace-nowrap tracking-wide uppercase">{app.title}</span>
                        {/* Triangle */}
                        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-nd-black border-r border-b border-nd-gray transform rotate-45"></div>
                      </div>
                  )}
                </div>
              );
            })}

            {/* Separator */}
            <div className="w-px h-8 bg-gradient-to-b from-transparent via-nd-gray/30 to-transparent mx-1"></div>

            {/* Edit Toggle Button */}
            <button 
                onClick={() => setIsEditing(!isEditing)}
                className={`
                    p-3 rounded-2xl border transition-all duration-300 group
                    ${isEditing 
                        ? 'bg-nd-white text-nd-black border-nd-white shadow-[0_0_15px_rgba(255,255,255,0.2)]' 
                        : 'bg-transparent text-nd-gray border-transparent hover:bg-nd-white/10 hover:border-nd-white/30 hover:text-nd-white'
                    }
                `}
            >
                {isEditing ? <Check size={24} strokeWidth={2} /> : <Settings size={24} strokeWidth={1.5} />}
            </button>
          </div>
        </div>
        
        {/* CSS for Wiggle Animation */}
        <style>{`
            @keyframes wiggle {
                0% { transform: rotate(0deg); }
                25% { transform: rotate(-3deg); }
                50% { transform: rotate(0deg); }
                75% { transform: rotate(3deg); }
                100% { transform: rotate(0deg); }
            }
        `}</style>
    </>
  );
};