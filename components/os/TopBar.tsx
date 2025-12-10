import React, { useState, useEffect, useRef } from 'react';
import { Battery, Wifi, Power, LogOut, Moon, Command, Check, Maximize2, Minus, Scissors, Copy, Clipboard, Monitor, LayoutList, HelpCircle, FilePlus, X, Activity } from 'lucide-react';
import { useOS } from '../../context/OSContext';
import { ControlCenter } from './ControlCenter';
import { auth } from '../../services/firebase';
import { AppID } from '../../types';

export const TopBar: React.FC = () => {
  const { 
      setPowerState, 
      launchApp, 
      windows, 
      activeWindowId, 
      closeApp, 
      minimizeApp, 
      focusApp, 
      setCommandPaletteOpen,
      updateWindowState
  } = useOS();

  const [time, setTime] = useState(new Date());
  const [showSystemMenu, setShowSystemMenu] = useState(false);
  const [showControlCenter, setShowControlCenter] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  
  const menuRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    
    const handleClickOutside = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
            setShowSystemMenu(false);
            setActiveMenu(null);
        }
        if (controlRef.current && !controlRef.current.contains(e.target as Node)) {
            setShowControlCenter(false);
        }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
        clearInterval(timer);
        document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = () => {
      setPowerState('LOCKED');
      setTimeout(() => {
          auth.signOut();
      }, 500);
      setShowSystemMenu(false);
  };

  // --- Menu Actions ---
  const handleEditAction = (action: 'cut' | 'copy' | 'paste') => {
      if (action === 'cut') document.execCommand('cut');
      if (action === 'copy') document.execCommand('copy');
      if (action === 'paste') navigator.clipboard.readText().then(t => document.execCommand('insertText', false, t)).catch(() => {});
      setActiveMenu(null);
  };

  const menuItems: Record<string, any[]> = {
      file: [
          { label: 'New Window', icon: FilePlus, action: () => launchApp(AppID.FILES), shortcut: 'Ctrl+N' },
          { label: 'Open...', icon: Command, action: () => setCommandPaletteOpen(true), shortcut: 'Ctrl+K' },
          { separator: true },
          { 
              label: 'Close Window', 
              icon: X,
              action: () => activeWindowId && closeApp(activeWindowId as AppID), 
              disabled: !activeWindowId, 
              shortcut: 'Ctrl+W' 
          },
          { separator: true },
          { label: 'Log Out', icon: LogOut, action: handleLogout },
          { label: 'Shut Down', icon: Power, action: () => setPowerState('OFF') }
      ],
      edit: [
          { label: 'Cut', icon: Scissors, action: () => handleEditAction('cut'), shortcut: 'Ctrl+X' },
          { label: 'Copy', icon: Copy, action: () => handleEditAction('copy'), shortcut: 'Ctrl+C' },
          { label: 'Paste', icon: Clipboard, action: () => handleEditAction('paste'), shortcut: 'Ctrl+V' },
          { separator: true },
          { label: 'Clipboard History', icon: LayoutList, action: () => launchApp(AppID.CLIPBOARD) }
      ],
      view: [
          { 
              label: 'Toggle Fullscreen', 
              action: () => {
                  if (activeWindowId) {
                      const w = windows[activeWindowId];
                      updateWindowState(activeWindowId as AppID, { isMaximized: !w.isMaximized });
                  }
              }, 
              disabled: !activeWindowId,
              icon: Maximize2
          },
          { 
              label: 'Minimize All', 
              action: () => Object.keys(windows).forEach(id => minimizeApp(id as AppID)), 
              shortcut: 'Win+D',
              icon: Minus
          },
      ],
      window: [
          { label: 'Task Manager', icon: Activity, action: () => launchApp(AppID.TASK_MANAGER), shortcut: 'Ctrl+Esc' },
          { separator: true },
          ...(Object.values(windows).length > 0 ? Object.values(windows).map(w => ({
              label: w.title,
              action: () => focusApp(w.id as AppID),
              checked: activeWindowId === w.id,
              isWindowItem: true
          })) : [{ label: 'No Active Windows', disabled: true }])
      ],
      help: [
          { label: 'Ask AI Assistant', icon: Command, action: () => launchApp(AppID.AI_CHAT) },
          { label: 'System Status', icon: Monitor, action: () => launchApp(AppID.ANALYTICS) },
          { separator: true },
          { label: 'About Second Brain', icon: HelpCircle, action: () => alert("Second Brain OS v3.1.0\nA minimalist productivity environment.\nBuilt with React, Firebase & Google Gemini.") }
      ]
  };

  return (
    <>
        <div className="h-8 w-full bg-nd-black/90 backdrop-blur-md border-b border-nd-gray flex items-center justify-between px-4 select-none z-[5000] relative">
        
        {/* Left: System Menus */}
        <div className="flex items-center gap-2 h-full relative" ref={menuRef}>
            {/* Apple-style Logo Button */}
            <button 
                onClick={() => setShowSystemMenu(!showSystemMenu)}
                className={`font-bold text-sm tracking-tighter hover:bg-nd-white/10 px-2 py-1 rounded transition-colors mr-2 ${showSystemMenu ? 'bg-nd-white/10' : ''}`}
            >
                SECOND BRAIN
            </button>
            
            {/* System Menu Dropdown */}
            {showSystemMenu && (
                <div className="absolute top-9 left-0 w-56 bg-nd-black/95 backdrop-blur-xl border border-nd-gray/50 rounded-lg shadow-2xl py-1 flex flex-col text-sm animate-in fade-in slide-in-from-top-1 z-50">
                    <div className="px-4 py-2 border-b border-nd-gray/30 mb-1">
                        <span className="text-xs text-nd-gray font-mono block">OS VERSION</span>
                        <span className="font-bold">3.1.0 LTS (Stable)</span>
                    </div>
                    <button onClick={() => { launchApp(AppID.SETTINGS); setShowSystemMenu(false); }} className="text-left px-4 py-1.5 hover:bg-nd-white/10 hover:text-white transition-colors flex items-center gap-2">
                        <Command size={14} /> System Settings
                    </button>
                    <div className="h-px bg-nd-gray/30 my-1 mx-2"></div>
                    <button 
                        onClick={() => { setPowerState('SLEEP'); setShowSystemMenu(false); }}
                        className="text-left px-4 py-1.5 hover:bg-nd-white/10 hover:text-white transition-colors flex items-center gap-2"
                    >
                        <Moon size={14} /> Sleep
                    </button>
                    <button 
                        onClick={handleLogout}
                        className="text-left px-4 py-1.5 hover:bg-nd-white/10 hover:text-white transition-colors flex items-center gap-2"
                    >
                        <LogOut size={14} /> Log Out...
                    </button>
                    <button 
                        onClick={() => { setPowerState('OFF'); setShowSystemMenu(false); }}
                        className="text-left px-4 py-1.5 hover:bg-nd-red hover:text-white transition-colors flex items-center gap-2"
                    >
                        <Power size={14} /> Shut Down...
                    </button>
                </div>
            )}

            {/* Application Menus (File, Edit, etc) */}
            <div className="hidden md:flex h-full" onMouseLeave={() => setActiveMenu(null)}>
                {Object.entries(menuItems).map(([key, items]) => (
                    <div key={key} className="relative h-full flex items-center">
                        <button
                            onMouseEnter={() => activeMenu && setActiveMenu(key)}
                            onClick={() => setActiveMenu(activeMenu === key ? null : key)}
                            className={`px-3 py-1 rounded text-xs font-medium transition-colors capitalize ${activeMenu === key ? 'bg-nd-white/10 text-nd-white' : 'text-nd-white/70 hover:bg-nd-white/5 hover:text-nd-white'}`}
                        >
                            {key}
                        </button>
                        
                        {activeMenu === key && (
                            <div className="absolute top-full left-0 w-64 bg-nd-black/95 backdrop-blur-xl border border-nd-gray/50 rounded-b-lg shadow-2xl py-1 z-50 animate-in fade-in zoom-in-95 duration-75">
                                {items.map((item, idx) => {
                                    if (item.separator) return <div key={idx} className="h-px bg-nd-gray/30 my-1 mx-2" />;
                                    
                                    return (
                                        <button
                                            key={idx}
                                            disabled={item.disabled}
                                            onClick={() => {
                                                if (item.action && !item.disabled) {
                                                    item.action();
                                                    setActiveMenu(null);
                                                }
                                            }}
                                            className="w-full text-left px-4 py-1.5 hover:bg-nd-white/10 hover:text-white transition-colors flex items-center justify-between group disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed text-xs font-medium text-nd-white/90"
                                        >
                                            <span className="flex items-center gap-3">
                                                <div className="w-4 flex justify-center text-nd-gray group-hover:text-nd-white">
                                                    {item.checked && <Check size={12} className="text-nd-red" />}
                                                    {item.icon && !item.checked && <item.icon size={14} />}
                                                </div>
                                                {item.label}
                                            </span>
                                            {item.shortcut && <span className="text-[10px] text-nd-gray group-hover:text-nd-white/70 ml-4 font-mono">{item.shortcut}</span>}
                                        </button>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
        
        {/* Right: Status Tray */}
        <div className="flex items-center gap-4 h-full relative" ref={controlRef}>
            <button 
                onClick={() => setShowControlCenter(!showControlCenter)}
                className={`flex items-center gap-3 hover:bg-nd-white/10 px-2 py-1 rounded transition-colors ${showControlCenter ? 'bg-nd-white/10' : ''}`}
            >
                <div className="flex items-center gap-2 text-xs font-mono">
                    <span className="hidden sm:inline text-xs font-bold">100%</span>
                    <Battery size={16} />
                </div>
                <Wifi size={16} />
                <div className="w-px h-4 bg-nd-gray mx-1" />
                <span className="text-xs font-mono font-bold">
                    {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
            </button>

            {showControlCenter && <ControlCenter />}
        </div>
        </div>
    </>
  );
};