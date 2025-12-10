import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useOS } from '../../context/OSContext';
import { APP_REGISTRY } from '../../registry';
import { WIDGET_REGISTRY } from '../widgets/WidgetRegistry';
import { 
  Search, Command, AppWindow, File as FileIcon, 
  Power, Lock, Moon, Wifi, Smartphone, Calculator,
  ChevronRight, ArrowRight, Layout
} from 'lucide-react';
import { AppID, FileNode, WidgetType } from '../../types';

type ResultType = 'app' | 'file' | 'action' | 'widget';

interface SearchResult {
  id: string;
  type: ResultType;
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  action: () => void;
}

export const CommandPalette: React.FC = () => {
  const { 
    launchApp, 
    fs, 
    setPowerState, 
    addWidget,
    isCommandPaletteOpen,
    setCommandPaletteOpen,
    commandPaletteQuery,
    setCommandPaletteQuery
  } = useOS();

  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // --- Keyboard Listeners ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!isCommandPaletteOpen);
      }
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommandPaletteOpen, setCommandPaletteOpen]);

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      // Don't clear query if it was set externally (e.g. from context menu)
      setSelectedIndex(0);
    }
  }, [isCommandPaletteOpen]);

  // --- Search Logic ---
  const results: SearchResult[] = useMemo(() => {
    if (!commandPaletteQuery) return [];

    const lowerQ = commandPaletteQuery.toLowerCase();
    const res: SearchResult[] = [];

    // 1. Apps
    Object.values(APP_REGISTRY).forEach(app => {
      if (app.title.toLowerCase().includes(lowerQ)) {
        res.push({
          id: `app-${app.id}`,
          type: 'app',
          title: app.title,
          subtitle: 'Application',
          icon: app.icon,
          action: () => launchApp(app.id)
        });
      }
    });

    // 2. System Actions
    if ('lock'.includes(lowerQ)) res.push({ id: 'act-lock', type: 'action', title: 'Lock Screen', icon: Lock, action: () => setPowerState('LOCKED') });
    if ('sleep'.includes(lowerQ)) res.push({ id: 'act-sleep', type: 'action', title: 'Sleep', icon: Moon, action: () => setPowerState('SLEEP') });
    if ('shutdown'.includes(lowerQ)) res.push({ id: 'act-off', type: 'action', title: 'Shut Down', icon: Power, action: () => setPowerState('OFF') });
    
    // 3. Files
    fs.forEach(file => {
      if (file.name.toLowerCase().includes(lowerQ)) {
        res.push({
          id: file.id,
          type: 'file',
          title: file.name,
          subtitle: `${file.type.toUpperCase()} • ${(file.size / 1024).toFixed(1)} KB`,
          icon: FileIcon, // Simplified icon logic
          action: () => {
             if (file.type === 'image') launchApp(AppID.PHOTOS, { initialImageId: file.id });
             else if (file.type === 'text') launchApp(AppID.NOTES, { fileId: file.id });
             else if (file.type === 'pdf') launchApp(AppID.PDF, { fileId: file.id });
             else launchApp(AppID.FILES);
          }
        });
      }
    });

    // 4. Widgets
    Object.entries(WIDGET_REGISTRY).forEach(([type, config]) => {
        if (config.label.toLowerCase().includes(lowerQ) || 'widget'.includes(lowerQ)) {
            res.push({
                id: `widget-${type}`,
                type: 'widget',
                title: config.label,
                subtitle: 'Add Widget',
                icon: config.icon || Layout,
                action: () => addWidget(type as WidgetType)
            });
        }
    });

    // 5. Quick Math (Easter Egg)
    if (/^[0-9+\-*/().\s]+$/.test(commandPaletteQuery)) {
        try {
            // eslint-disable-next-line no-eval
            const val = eval(commandPaletteQuery); 
            res.unshift({
                id: 'calc-res',
                type: 'action',
                title: `= ${val}`,
                subtitle: 'Calculator',
                icon: Calculator,
                action: () => { navigator.clipboard.writeText(String(val)); setCommandPaletteOpen(false); }
            });
        } catch (e) {}
    }

    return res.slice(0, 8); // Limit results
  }, [commandPaletteQuery, fs, launchApp, setPowerState, addWidget, setCommandPaletteOpen]);

  // --- Navigation Logic ---
  useEffect(() => {
      const handleNav = (e: KeyboardEvent) => {
          if (!isCommandPaletteOpen) return;

          if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelectedIndex(prev => (prev + 1) % results.length);
          } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelectedIndex(prev => (prev - 1 + results.length) % results.length);
          } else if (e.key === 'Enter') {
              e.preventDefault();
              if (results[selectedIndex]) {
                  results[selectedIndex].action();
                  setCommandPaletteOpen(false);
              }
          }
      };

      window.addEventListener('keydown', handleNav);
      return () => window.removeEventListener('keydown', handleNav);
  }, [isCommandPaletteOpen, results, selectedIndex, setCommandPaletteOpen]);

  if (!isCommandPaletteOpen) return null;

  return (
    <div 
        className="fixed inset-0 z-[10000] flex items-start justify-center pt-[20vh] bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
        onMouseDown={(e) => { if (e.target === e.currentTarget) setCommandPaletteOpen(false); }}
    >
        <div className="w-full max-w-xl bg-nd-black/90 backdrop-blur-xl border border-nd-gray rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            
            {/* Input */}
            <div className="flex items-center px-4 py-4 border-b border-nd-gray/50">
                <Search size={20} className="text-nd-gray mr-3" />
                <input
                    ref={inputRef}
                    value={commandPaletteQuery}
                    onChange={(e) => setCommandPaletteQuery(e.target.value)}
                    placeholder="Type a command or search..."
                    className="flex-1 bg-transparent text-lg text-nd-white outline-none placeholder-nd-gray/50 font-mono"
                />
                <div className="hidden md:flex items-center gap-1 text-[10px] text-nd-gray border border-nd-gray/30 px-2 py-1 rounded">
                    <span className="font-bold">ESC</span>
                </div>
            </div>

            {/* Results */}
            <div className="max-h-[300px] overflow-y-auto p-2" ref={listRef}>
                {results.length === 0 ? (
                    <div className="p-8 text-center text-nd-gray">
                        {commandPaletteQuery ? 'No results found.' : (
                            <div className="flex flex-col items-center gap-2 opacity-50">
                                <Command size={32} />
                                <span className="text-xs font-mono">waiting for input...</span>
                            </div>
                        )}
                    </div>
                ) : (
                    results.map((item, idx) => (
                        <button
                            key={item.id}
                            onClick={() => { item.action(); setCommandPaletteOpen(false); }}
                            onMouseEnter={() => setSelectedIndex(idx)}
                            className={`w-full flex items-center justify-between px-3 py-3 rounded-lg transition-all group ${
                                idx === selectedIndex 
                                    ? 'bg-nd-white text-nd-black' 
                                    : 'text-nd-gray hover:bg-nd-gray/10 hover:text-nd-white'
                            }`}
                        >
                            <div className="flex items-center gap-3">
                                <item.icon size={18} className={idx === selectedIndex ? 'text-nd-black' : 'text-nd-white'} />
                                <div className="text-left">
                                    <div className="text-sm font-bold">{item.title}</div>
                                    {item.subtitle && <div className={`text-[10px] ${idx === selectedIndex ? 'text-nd-black/60' : 'text-nd-gray'}`}>{item.subtitle}</div>}
                                </div>
                            </div>
                            
                            {idx === selectedIndex && (
                                <ArrowRight size={16} className="animate-in slide-in-from-left-2 fade-in duration-200" />
                            )}
                        </button>
                    ))
                )}
            </div>

            {/* Footer */}
            <div className="bg-nd-gray/10 px-4 py-2 border-t border-nd-gray/20 flex justify-between items-center text-[10px] text-nd-gray font-mono">
                <div className="flex gap-4">
                    <span><strong>ProTip:</strong> Use arrow keys to navigate</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-nd-red animate-pulse"></div>
                    <span>System Active</span>
                </div>
            </div>
        </div>
    </div>
  );
};