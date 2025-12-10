import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppID, WindowState, OSContextState, LogEntry, WidgetInstance, WidgetType, AppUsageStats, SystemPowerState, FileNode } from '../types';
import { APP_REGISTRY } from '../registry';
import { auth, db } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { ref, onValue, set as firebaseSet, push, update, get, remove } from 'firebase/database';

const OSContext = createContext<OSContextState | undefined>(undefined);

const DEFAULT_DOCK: AppID[] = [
  AppID.AI_CHAT,
  AppID.EMAIL,
  AppID.CLIPBOARD,
  AppID.PHOTOS,
  AppID.CALENDAR,
  AppID.TASKS,
  AppID.NOTES,
  AppID.FILES,
  AppID.SETTINGS
];

const DEFAULT_FS: FileNode[] = [
    { id: 'f_desktop', parentId: 'root', name: 'Desktop', type: 'folder', size: 0, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'f_docs', parentId: 'root', name: 'Documents', type: 'folder', size: 0, createdAt: Date.now(), updatedAt: Date.now() },
    { id: 'f_imgs', parentId: 'root', name: 'Images', type: 'folder', size: 0, createdAt: Date.now(), updatedAt: Date.now() },
];

export const OSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [windows, setWindows] = useState<Record<string, WindowState>>({});
  const [activeWindowId, setActiveWindowId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [widgets, setWidgets] = useState<WidgetInstance[]>([]);
  const [powerState, setPowerState] = useState<SystemPowerState>('BOOTING');
  const [fs, setFs] = useState<FileNode[]>([]);
  const [dockApps, setDockApps] = useState<AppID[]>(DEFAULT_DOCK);
  
  // Command Palette State
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandPaletteQuery, setCommandPaletteQuery] = useState('');

  // Usage Tracking Refs
  const appStartTimes = useRef<Record<string, number>>({}); 
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- Network Sentinel ---
  useEffect(() => {
      const handleOnline = () => {
          setIsOnline(true);
          addLog({ source: 'Network', message: 'Connection Restored', type: 'success', isCloud: true });
      };
      const handleOffline = () => {
          setIsOnline(false);
          addLog({ source: 'Network', message: 'Connection Lost: Offline Mode Enforced', type: 'error', isCloud: false });
      };

      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);

      return () => {
          window.removeEventListener('online', handleOnline);
          window.removeEventListener('offline', handleOffline);
      };
  }, []);

  // --- Cloud Sync ---
  useEffect(() => {
    // Zero-Tolerance: Only run if online
    if (!isOnline) {
        setAuthStatus('error');
        return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthStatus('connected');
        addLog({ source: 'System', message: 'Neural Link Established (Firebase)', type: 'success', isCloud: true });
        
        // Sync Widgets
        const widgetsRef = ref(db, `users/${user.uid}/widgets`);
        onValue(widgetsRef, (snapshot) => {
            const data = snapshot.val();
            if (data) setWidgets(Object.values(data));
        });

        // Sync Dock
        const dockRef = ref(db, `users/${user.uid}/dock`);
        onValue(dockRef, (snapshot) => {
            const data = snapshot.val();
            if (Array.isArray(data)) {
                setDockApps(data);
            } else if (data === null) {
                // Initialize default dock if empty on server
                firebaseSet(dockRef, DEFAULT_DOCK);
                setDockApps(DEFAULT_DOCK);
            }
        });

        // Sync Files
        const filesRef = ref(db, `users/${user.uid}/files`);
        onValue(filesRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
                setFs(Object.values(data));
            } else {
                // Init default FS if empty in cloud
                const updates: Record<string, any> = {};
                DEFAULT_FS.forEach(f => updates[f.id] = f);
                update(filesRef, updates);
            }
        });

      } else {
        // Logged out
        setAuthStatus('connecting'); // Or 'disconnected' conceptually, but using 'connecting' to show loading/lock screen state if needed
        // We do NOT sign in anonymously automatically anymore.
        // The LockScreen will handle login.
      }
    });
    
    addLog({ source: 'Kernel', message: 'Second Brain OS v3.1.0 Stable', type: 'info', isCloud: false });

    return () => unsubscribe();
  }, [isOnline]);

  // --- Strict Cloud Methods ---

  const addFile = (file: FileNode) => {
      if (!isOnline || !auth.currentUser) return; // Block offline writes
      const newFs = [...fs, file];
      setFs(newFs); // Optimistic UI
      firebaseSet(ref(db, `users/${auth.currentUser.uid}/files/${file.id}`), file);
  };

  const deleteFile = (id: string) => {
      if (!isOnline || !auth.currentUser) return;
      const newFs = fs.filter(f => f.id !== id);
      setFs(newFs);
      remove(ref(db, `users/${auth.currentUser.uid}/files/${id}`));
  };

  const updateFile = (id: string, updates: Partial<FileNode>) => {
      if (!isOnline || !auth.currentUser) return;
      const newFs = fs.map(f => f.id === id ? { ...f, ...updates } : f);
      setFs(newFs);
      update(ref(db, `users/${auth.currentUser.uid}/files/${id}`), updates);
  };

  const recordAppUsage = async (id: string, event: 'launch' | 'close') => {
      if (!isOnline || !auth.currentUser) return;
      const now = Date.now();
      let durationToAdd = 0;

      if (event === 'launch') {
          appStartTimes.current[id] = now;
      } else if (event === 'close') {
          const start = appStartTimes.current[id];
          if (start) {
              durationToAdd = (now - start) / 60000; 
              delete appStartTimes.current[id];
          }
      }

      const statsRef = ref(db, `users/${auth.currentUser.uid}/system/usage/${id}`);
      get(statsRef).then(snap => {
          const current: AppUsageStats = snap.val() || { launches: 0, minutesOpen: 0, lastOpened: 0 };
          const updates: AppUsageStats = {
              launches: event === 'launch' ? current.launches + 1 : current.launches,
              minutesOpen: current.minutesOpen + durationToAdd,
              lastOpened: event === 'launch' ? now : current.lastOpened
          };
          update(statsRef, updates);
      });
  };

  const persistWidgets = (newWidgets: WidgetInstance[]) => {
      if (!isOnline || !auth.currentUser) return;
      setWidgets(newWidgets);
      
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
          const updates: Record<string, any> = {};
          newWidgets.forEach(w => updates[w.id] = w);
          firebaseSet(ref(db, `users/${auth.currentUser!.uid}/widgets`), updates);
      }, 1000);
  };

  const addWidget = (type: WidgetType) => {
      const newWidget: WidgetInstance = {
          id: `w_${Date.now()}`,
          type,
          x: 100 + (widgets.length * 20),
          y: 100 + (widgets.length * 20),
          data: {}
      };
      const updated = [...widgets, newWidget];
      setWidgets(updated);
      persistWidgets(updated);
      addLog({ source: 'Desktop', message: `Added ${type} widget`, type: 'info', isCloud: false });
  };

  const removeWidget = (id: string) => {
      const updated = widgets.filter(w => w.id !== id);
      setWidgets(updated);
      persistWidgets(updated);
  };

  const updateWidget = (id: string, updates: Partial<WidgetInstance>) => {
      const updated = widgets.map(w => w.id === id ? { ...w, ...updates } : w);
      setWidgets(updated);
      persistWidgets(updated); 
  };

  const addLog = (entry: Omit<LogEntry, 'id' | 'timestamp'>) => {
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      ...entry
    }, ...prev].slice(0, 100));
  };

  const clearLogs = () => {
      setLogs([]);
      addLog({ source: 'System', message: 'System Logs Purged', type: 'info', isCloud: false });
  };

  const launchApp = (id: AppID, props?: any) => {
    if (!isOnline) return; // Prevent launch if offline
    setWindows((prev) => {
      // Calculate max Z-Index to bring window to front
      const maxZ = Math.max(0, ...Object.values(prev).map(w => w.zIndex));

      if (prev[id]) {
        // App is already open, update it to active and bring to front
        return {
          ...prev,
          [id]: { 
            ...prev[id], 
            isOpen: true, 
            isMinimized: false, 
            launchProps: props,
            zIndex: maxZ + 1 
          }
        };
      }
      
      // App is not open, launch it
      recordAppUsage(id, 'launch');
      const config = APP_REGISTRY[id];
      if (!config) return prev;
      
      return {
        ...prev,
        [id]: {
          id,
          title: config.title,
          isOpen: true,
          isMinimized: false,
          isMaximized: false,
          zIndex: maxZ + 1,
          position: config.defaultPosition || { x: 100, y: 80 },
          size: config.defaultSize,
          launchProps: props
        }
      };
    });
    setActiveWindowId(id);
  };

  const closeApp = (id: AppID) => {
    recordAppUsage(id, 'close');
    setWindows((prev) => {
      const newWindows = { ...prev };
      delete newWindows[id];
      return newWindows;
    });
    if (activeWindowId === id) setActiveWindowId(null);
  };

  const focusApp = (id: AppID) => {
    setActiveWindowId(id);
    setWindows((prev) => {
      const maxZ = Math.max(0, ...Object.values(prev).map(w => w.zIndex));
      if (prev[id] && prev[id].zIndex === maxZ) return prev;
      if (!prev[id]) return prev;
      return {
        ...prev,
        [id]: { ...prev[id], zIndex: maxZ + 1 }
      };
    });
  };

  const minimizeApp = (id: AppID) => {
    setWindows((prev) => ({
      ...prev,
      [id]: { ...prev[id], isMinimized: true }
    }));
    if (activeWindowId === id) setActiveWindowId(null);
  };

  const updateWindowState = (id: AppID, updates: Partial<WindowState>) => {
    setWindows((prev) => {
        if (!prev[id]) return prev;
        return {
            ...prev,
            [id]: { ...prev[id], ...updates }
        };
    });
  };

  const toggleDockApp = (id: AppID) => {
      // 1. Optimistic Update (Always run regardless of auth)
      setDockApps((prevDock) => {
          // Safety: ensure prevDock is array
          const current = Array.isArray(prevDock) ? prevDock : [];
          
          let newDock: AppID[];
          if (current.includes(id)) {
              newDock = current.filter(appId => appId !== id);
          } else {
              newDock = [...current, id];
          }
          
          // 2. Background Sync (Fire & Forget)
          if (isOnline && auth.currentUser) {
              firebaseSet(ref(db, `users/${auth.currentUser.uid}/dock`), newDock)
                .catch(err => console.error("Dock sync failed", err));
          }
          
          return newDock;
      });
  };

  return (
    <OSContext.Provider value={{
      windows,
      activeWindowId,
      authStatus,
      isOnline,
      logs,
      dockApps,
      widgets,
      powerState,
      fs,
      addFile,
      deleteFile,
      updateFile,
      launchApp,
      closeApp,
      focusApp,
      minimizeApp,
      updateWindowState,
      toggleDockApp,
      addWidget,
      removeWidget,
      updateWidget,
      addLog,
      setPowerState,
      clearLogs,
      isCommandPaletteOpen,
      setCommandPaletteOpen,
      commandPaletteQuery,
      setCommandPaletteQuery
    }}>
      {children}
    </OSContext.Provider>
  );
};

export const useOS = () => {
  const context = useContext(OSContext);
  if (context === undefined) {
    throw new Error('useOS must be used within an OSProvider');
  }
  return context;
};