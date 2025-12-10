import React, { useEffect, useState } from 'react';
import { TopBar } from './components/os/TopBar';
import { Dock } from './components/os/Dock';
import { Window } from './components/os/Window';
import { WidgetLayer } from './components/os/WidgetLayer';
import { OSProvider, useOS } from './context/OSContext';
import { APP_REGISTRY } from './registry';
import { AppID, WidgetType, FileNode, FileType } from './types';
import { WIDGET_REGISTRY } from './components/widgets/WidgetRegistry';
import { Plus, Settings, X, Power, File, Folder, Image as ImageIcon, Music, Video, FileText, FileArchive, BookOpen, WifiOff, AlertTriangle } from 'lucide-react';
import { LockScreen } from './components/os/LockScreen';
import { CommandPalette } from './components/os/CommandPalette';
import { ToastNotification } from './components/os/ToastNotification';

// Cinematic Boot Component
const BootSequence = ({ onComplete }: { onComplete: () => void }) => {
  const [lines, setLines] = useState<string[]>([]);
  const sequence = [
    "INITIALIZING KERNEL v3.1.0...",
    "CHECKING NETWORK STATUS... [REQUIRED]",
    "VERIFYING REMOTE CONNECTION...",
    "LOADING MODULES: [CLOUD_FS, SYNC_ENGINE]",
    "ESTABLISHING SECURE UPLINK...",
    "USER AUTHENTICATED.",
    "WELCOME TO SECOND BRAIN OS."
  ];

  useEffect(() => {
    let delay = 0;
    sequence.forEach((line, index) => {
      delay += Math.random() * 150 + 50; // Faster boot
      setTimeout(() => {
        setLines(prev => [...prev, line]);
        if (index === sequence.length - 1) {
          setTimeout(onComplete, 500); 
        }
      }, delay);
    });
  }, []);

  return (
    <div className="fixed inset-0 bg-black z-[9999] flex items-end md:items-center justify-start md:justify-center p-8 font-mono text-xs md:text-sm text-nd-white/80 cursor-wait">
      <div className="max-w-lg w-full">
        {lines.map((line, i) => (
          <div key={i} className="mb-1">
            <span className="text-nd-gray mr-2">[{new Date().toLocaleTimeString()}]</span>
            <span className={i === lines.length - 1 ? "text-nd-white font-bold" : "text-nd-white/70"}>
              {line}
            </span>
          </div>
        ))}
        <div className="animate-cursor-blink inline-block w-2 h-4 bg-nd-red ml-1 align-middle"></div>
      </div>
    </div>
  );
};

const OfflineOverlay = () => (
    <div className="fixed inset-0 z-[10000] bg-nd-black flex flex-col items-center justify-center text-center p-8">
        <div className="w-24 h-24 rounded-full border-4 border-nd-red flex items-center justify-center mb-8 animate-pulse shadow-[0_0_50px_rgba(220,38,38,0.5)]">
            <WifiOff size={48} className="text-nd-red" />
        </div>
        <h1 className="text-3xl font-mono font-bold text-nd-red tracking-widest mb-4">CONNECTION LOST</h1>
        <div className="max-w-md space-y-4">
            <p className="text-sm font-mono text-nd-white">
                CRITICAL ERROR: REMOTE UPLINK SEVERED.
            </p>
            <p className="text-xs text-nd-gray leading-relaxed">
                To prevent data corruption, all local operations have been suspended. 
                The system strictly enforces a zero-tolerance policy for offline data divergence.
            </p>
            <div className="bg-nd-gray/10 border border-nd-red/30 p-4 rounded text-xs font-mono text-nd-red mt-8">
                WAITING FOR RECONNECTION...
            </div>
        </div>
    </div>
);

const OSManager: React.FC = () => {
    const { powerState, setPowerState, isOnline } = useOS();

    // Force blocking overlay if offline
    if (!isOnline) {
        return <OfflineOverlay />;
    }

    if (powerState === 'OFF') {
        return (
            <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center">
                <button 
                    onClick={() => setPowerState('BOOTING')}
                    className="group flex flex-col items-center gap-4 text-nd-gray hover:text-nd-white transition-colors"
                >
                    <div className="w-16 h-16 rounded-full border-2 border-nd-gray group-hover:border-nd-white group-hover:shadow-[0_0_20px_rgba(255,255,255,0.5)] flex items-center justify-center transition-all">
                        <Power size={32} />
                    </div>
                    <span className="text-xs font-mono uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">System Power</span>
                </button>
            </div>
        );
    }

    if (powerState === 'BOOTING') {
        return <BootSequence onComplete={() => setPowerState('LOCKED')} />;
    }

    if (powerState === 'LOCKED') {
        return <LockScreen />;
    }

    if (powerState === 'SLEEP') {
        return (
            <div 
                onClick={() => setPowerState('LOCKED')}
                className="fixed inset-0 bg-black z-[9999] cursor-none"
            >
                {/* Tiny led indicator */}
                <div className="absolute bottom-8 right-8 w-1 h-1 bg-nd-white animate-pulse rounded-full shadow-[0_0_10px_white]"></div>
            </div>
        );
    }

    return <Desktop />;
};

const DesktopIcons = () => {
    const { fs, launchApp } = useOS();
    
    // Filter files in 'f_desktop' folder
    const desktopFiles = fs.filter(f => f.parentId === 'f_desktop');

    const getIcon = (type: FileType) => {
        switch (type) {
            case 'folder': return <Folder size={32} strokeWidth={1} />;
            case 'image': return <ImageIcon size={32} strokeWidth={1} />;
            case 'audio': return <Music size={32} strokeWidth={1} />;
            case 'video': return <Video size={32} strokeWidth={1} />;
            case 'text': return <FileText size={32} strokeWidth={1} />;
            case 'archive': return <FileArchive size={32} strokeWidth={1} />;
            case 'pdf': return <BookOpen size={32} strokeWidth={1} />;
            default: return <File size={32} strokeWidth={1} />;
        }
    };

    const handleIconDoubleClick = (file: FileNode) => {
        if (file.type === 'image') {
            launchApp(AppID.PHOTOS, { initialImageId: file.id });
        } else if (file.type === 'text') {
            launchApp(AppID.NOTES, { fileId: file.id });
        } else if (file.type === 'pdf') {
            launchApp(AppID.PDF, { fileId: file.id });
        } else {
            launchApp(AppID.FILES);
        }
    };

    return (
        <div className="absolute inset-0 z-10 p-4 grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] grid-rows-[repeat(auto-fill,minmax(90px,1fr))] gap-4 pointer-events-none">
            {desktopFiles.map(file => (
                <div 
                    key={file.id} 
                    onDoubleClick={() => handleIconDoubleClick(file)}
                    className="flex flex-col items-center gap-2 p-2 rounded-lg hover:bg-white/10 cursor-pointer pointer-events-auto transition-colors group h-max w-24"
                >
                    <div className="text-nd-gray group-hover:text-nd-white transition-colors filter drop-shadow-md">
                        {file.type === 'image' && file.content ? (
                             <div className="w-10 h-10 md:w-12 md:h-12 border-2 border-nd-white/20 rounded-md overflow-hidden bg-black shadow-sm">
                                <img src={file.content} alt={file.name} className="w-full h-full object-cover" />
                             </div>
                        ) : file.type === 'text' && file.content ? (
                             <div className="w-10 h-12 md:w-12 md:h-14 bg-nd-white text-nd-black p-1.5 rounded-sm shadow-sm overflow-hidden border border-nd-gray">
                                 <div className="text-[3px] font-mono leading-[4px] opacity-70 break-words">
                                     {file.content.slice(0, 200)}
                                 </div>
                             </div>
                        ) : file.type === 'pdf' ? (
                             <div className="w-10 h-12 md:w-12 md:h-14 bg-nd-black border border-nd-red rounded-sm flex items-center justify-center relative shadow-sm">
                                 <BookOpen size={20} className="text-nd-red" />
                                 <span className="absolute bottom-0.5 right-0.5 text-[5px] bg-nd-red text-white px-0.5 font-bold">PDF</span>
                             </div>
                        ) : (
                             getIcon(file.type)
                        )}
                    </div>
                    <span className="text-[10px] text-center text-nd-white font-medium drop-shadow-md line-clamp-2 leading-tight break-all">
                        {file.name}
                    </span>
                </div>
            ))}
        </div>
    );
};

const Desktop: React.FC = () => {
  const { 
      windows, 
      activeWindowId, 
      launchApp, 
      closeApp, 
      focusApp, 
      minimizeApp, 
      addWidget, 
      addFile, 
      addLog,
      setCommandPaletteOpen,
      setCommandPaletteQuery 
  } = useOS();
  
  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, visible: boolean }>({ x: 0, y: 0, visible: false });
  const [isDragOver, setIsDragOver] = useState(false);

  // Apply Theme Function
  const applyTheme = () => {
    const savedConfig = localStorage.getItem('nd_os_config');
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        
        // Apply Accent
        if (config.appearance?.accentColor) {
           document.documentElement.style.setProperty('--color-accent', config.appearance.accentColor);
        }

        // Apply Animations
        if (config.appearance?.animations === false) {
            document.body.classList.add('no-animations');
        } else {
            document.body.classList.remove('no-animations');
        }

        // Apply Transparency
        if (config.appearance?.transparency) {
             document.body.classList.add('enable-glass');
        } else {
             document.body.classList.remove('enable-glass');
        }
        
        // Apply Wallpaper
        const bgEl = document.getElementById('desktop-bg');
        if (bgEl) {
           // Reset styles
           bgEl.style.backgroundImage = '';
           bgEl.style.backgroundSize = '';
           bgEl.style.backgroundPosition = '';
           bgEl.style.filter = '';
           bgEl.className = 'absolute inset-0 pointer-events-none transition-all duration-1000 ease-in-out'; // Reset base classes
           
           const grayscale = config.appearance?.wallpaperGrayscale ?? true;
           const filterVal = grayscale ? 'grayscale(100%) contrast(1.2)' : 'none';

           if (config.appearance?.wallpaper === 'custom' && config.appearance?.customWallpaper) {
               bgEl.style.backgroundImage = `url(${config.appearance.customWallpaper})`;
               bgEl.style.backgroundSize = 'cover';
               bgEl.style.backgroundPosition = 'center';
               bgEl.style.opacity = '0.4';
               bgEl.style.filter = filterVal;
           } else if (config.appearance?.wallpaper === 'aurora') {
               bgEl.style.backgroundImage = 'radial-gradient(at 0% 0%, hsla(253,16%,7%,1) 0, transparent 50%), radial-gradient(at 50% 0%, hsla(225,39%,30%,1) 0, transparent 50%), radial-gradient(at 100% 0%, hsla(339,49%,30%,1) 0, transparent 50%)';
               bgEl.style.opacity = '0.5';
               bgEl.style.filter = filterVal;
           } else {
               let bgClass = '';
               switch (config.appearance?.wallpaper) {
                   case 'grid': bgClass = 'bg-grid-pattern'; break;
                   case 'lines': bgClass = 'bg-lines-pattern'; break;
                   case 'solid': bgClass = 'bg-nd-black'; break;
                   default: bgClass = 'bg-dot-pattern'; break;
               }
               bgEl.classList.add(bgClass);
               bgEl.style.opacity = '0.2';
               bgEl.style.filter = filterVal;
           }
        }
      } catch (e) {
        console.error("Theme Load Error", e);
      }
    }
  };

  // Theme Loader (Initial + Event Listener)
  useEffect(() => {
    applyTheme();
    window.addEventListener('theme-change', applyTheme);
    return () => window.removeEventListener('theme-change', applyTheme);
  }, []);

  // Context Menu Handler
  const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      // Only show if clicking directly on desktop (or widget layer)
      if ((e.target as HTMLElement).id === 'desktop-area' || (e.target as HTMLElement).id === 'desktop-bg') {
          setContextMenu({ x: e.clientX, y: e.clientY, visible: true });
      } else {
          setContextMenu({ ...contextMenu, visible: false });
      }
  };

  const handleClick = () => {
      if (contextMenu.visible) setContextMenu({ ...contextMenu, visible: false });
  };

  // --- Drag & Drop Handlers ---

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
      e.preventDefault();
      // Check if relatedTarget is null (left window) or not a child of desktop
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setIsDragOver(false);
      }
  };

  const handleDrop = async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
          let count = 0;
          for (let i = 0; i < files.length; i++) {
              const file = files[i];
              
              // Helper to detect type
              let type: FileType = 'unknown';
              if (file.type.startsWith('image/')) type = 'image';
              else if (file.type.startsWith('audio/')) type = 'audio';
              else if (file.type.startsWith('video/')) type = 'video';
              else if (file.type === 'application/pdf') type = 'pdf';
              else if (file.type.includes('text') || file.name.endsWith('.json') || file.name.endsWith('.md')) type = 'text';
              else if (file.type.includes('zip') || file.type.includes('compressed')) type = 'archive';

              let content = '';
              // Read content for text or images (as base64)
              if (type === 'text') {
                  try { content = await file.text(); } catch {}
              } else if (type === 'image' || type === 'pdf') {
                  try {
                      content = await new Promise((resolve) => {
                          const reader = new FileReader();
                          reader.onload = (e) => resolve(e.target?.result as string);
                          reader.readAsDataURL(file);
                      });
                  } catch {}
              }

              const newNode: FileNode = {
                  id: `file_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
                  parentId: 'f_desktop', // Save to Desktop
                  name: file.name,
                  type,
                  size: file.size,
                  mimeType: file.type,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                  content
              };
              
              addFile(newNode);
              count++;
          }
          addLog({ source: 'Desktop', message: `Saved ${count} file(s) to Desktop`, type: 'success', isCloud: false });
      }
  };

  const hasOpenWindows = Object.values(windows).some(w => w.isOpen && !w.isMinimized);

  return (
    <div 
        className="h-screen w-screen bg-nd-black text-nd-white overflow-hidden relative font-sans selection:bg-nd-red selection:text-white animate-in fade-in duration-1000"
        onContextMenu={handleContextMenu}
        onClick={handleClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
    >
      {/* Background Texture */}
      <div id="desktop-bg" className="absolute inset-0 bg-dot-pattern opacity-20 pointer-events-none" />
      
      {/* Global Command Palette */}
      <CommandPalette />
      
      {/* Toast Notification System */}
      <ToastNotification />

      {/* Drag Overlay */}
      {isDragOver && (
          <div className="absolute inset-0 z-[100] bg-nd-red/10 border-4 border-nd-red border-dashed m-4 rounded-xl flex items-center justify-center pointer-events-none animate-pulse">
              <div className="bg-nd-black border border-nd-red px-6 py-4 rounded-xl text-nd-white font-bold text-xl uppercase tracking-widest shadow-2xl">
                  Drop to Save to Desktop
              </div>
          </div>
      )}
      
      {/* System Bar */}
      <TopBar />

      {/* Desktop Area */}
      <main id="desktop-area" className="relative w-full h-[calc(100vh-80px)] overflow-hidden">
        
        {/* Widgets Layer (Beneath Icons) */}
        <WidgetLayer />

        {/* Desktop Icons Layer */}
        <DesktopIcons />

        {/* Render Windows */}
        {Object.values(windows).map((window) => {
          const AppConfig = APP_REGISTRY[window.id as AppID];
          if (!AppConfig) return null;
          const AppComponent = AppConfig.component;

          return (
            <Window
              key={window.id}
              app={window}
              onClose={(id) => closeApp(id as AppID)}
              onFocus={(id) => focusApp(id as AppID)}
              onMinimize={(id) => minimizeApp(id as AppID)}
            >
              <AppComponent {...window.launchProps} />
            </Window>
          );
        })}

        {/* If no apps/widgets are open, show a welcome splash or clock */}
        {!activeWindowId && !hasOpenWindows && (
           <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-50 animate-fade-up -z-10">
              <h1 className="text-[120px] font-mono font-bold leading-none text-nd-gray/20 select-none">OS</h1>
              <p className="font-mono text-nd-red tracking-[1em] mt-4 select-none">SECOND BRAIN</p>
              <p className="mt-8 text-xs text-nd-gray font-mono tracking-widest bg-nd-gray/10 px-3 py-1 rounded">PRESS CTRL+K TO START</p>
           </div>
        )}
      </main>

      {/* Dock (Always on Top) */}
      <Dock onOpenApp={launchApp} activeApp={activeWindowId} hasOpenWindows={hasOpenWindows} />

      {/* Context Menu */}
      {contextMenu.visible && (
          <div 
            className="fixed bg-nd-black border border-nd-gray/50 shadow-2xl rounded-lg py-1 w-48 z-[9999] animate-in fade-in zoom-in-95 duration-100"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
              <button 
                onClick={() => { 
                    setCommandPaletteQuery('widget'); 
                    setCommandPaletteOpen(true); 
                    setContextMenu({...contextMenu, visible: false}); 
                }}
                className="w-full text-left px-4 py-2 text-xs font-bold uppercase hover:bg-nd-white hover:text-nd-black flex items-center gap-2"
              >
                  <Plus size={14} /> Add Widget
              </button>
              <button 
                onClick={() => { launchApp(AppID.SETTINGS); setContextMenu({...contextMenu, visible: false}); }}
                className="w-full text-left px-4 py-2 text-xs font-bold uppercase hover:bg-nd-white hover:text-nd-black flex items-center gap-2"
              >
                  <Settings size={14} /> System Settings
              </button>
              <div className="h-px bg-nd-gray/30 my-1 mx-2"></div>
              <div className="px-4 py-1 text-[10px] text-nd-gray font-mono">SECOND BRAIN OS v3</div>
          </div>
      )}

    </div>
  );
};

const App: React.FC = () => {
  return (
    <OSProvider>
      <OSManager />
    </OSProvider>
  );
};

export default App;