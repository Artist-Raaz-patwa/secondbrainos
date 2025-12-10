import React from 'react';

export enum AppID {
  SETTINGS = 'settings',
  NOTES = 'notes',
  TASKS = 'tasks',
  FILES = 'files',
  PHOTOS = 'photos',
  PDF = 'pdf',
  AI_CHAT = 'ai_chat',
  HABITS = 'habits',
  LOGS = 'logs',
  CRM = 'crm',
  WALLET = 'wallet',
  VAULT = 'vault',
  CLOCK = 'clock',
  CALENDAR = 'calendar',
  CALCULATOR = 'calculator',
  EMAIL = 'email',
  ANALYTICS = 'analytics',
  CLIPBOARD = 'clipboard',
  TASK_MANAGER = 'task_manager'
}

export type WidgetType = 'clock' | 'weather' | 'note' | 'stats' | 'quote' | 'calendar' | 'tasks' | 'habits' | 'wallet' | 'calculator' | 'storage' | 'focus' | 'market';
export type SystemPowerState = 'OFF' | 'BOOTING' | 'LOCKED' | 'ACTIVE' | 'SLEEP';
export type FileType = 'folder' | 'text' | 'image' | 'audio' | 'video' | 'archive' | 'pdf' | 'unknown';

export interface FileNode {
  id: string;
  parentId: string;
  name: string;
  type: FileType;
  size: number;
  createdAt: number;
  updatedAt: number;
  content?: string;
  mimeType?: string;
}

export interface WidgetInstance {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  data?: any; 
}

export interface WindowState {
  id: AppID;
  title: string;
  isOpen: boolean;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
  launchProps?: any;
}

export interface AppConfig {
  id: AppID;
  title: string;
  icon: React.ElementType;
  component: React.ComponentType<any>;
  defaultSize: { width: number; height: number };
  defaultPosition?: { x: number; y: number };
  showInDock?: boolean; 
}

export interface LogEntry {
  id: string;
  timestamp: number;
  source: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isCloud: boolean;
}

export interface AppUsageStats {
  launches: number;
  minutesOpen: number;
  lastOpened: number;
}

export interface OSContextState {
  windows: Record<string, WindowState>;
  activeWindowId: string | null;
  authStatus: 'connecting' | 'connected' | 'error';
  isOnline: boolean; 
  logs: LogEntry[];
  powerState: SystemPowerState;
  
  // File System
  fs: FileNode[];
  addFile: (file: FileNode) => void;
  deleteFile: (id: string) => void;
  updateFile: (id: string, updates: Partial<FileNode>) => void;

  // Dock State
  dockApps: AppID[];
  toggleDockApp: (id: AppID) => void;
  
  // Widget State
  widgets: WidgetInstance[];
  addWidget: (type: WidgetType) => void;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, updates: Partial<WidgetInstance>) => void;

  // Command Palette State
  isCommandPaletteOpen: boolean;
  setCommandPaletteOpen: (isOpen: boolean) => void;
  commandPaletteQuery: string;
  setCommandPaletteQuery: (query: string) => void;

  // Actions
  setPowerState: (state: SystemPowerState) => void;
  launchApp: (id: AppID, props?: any) => void;
  closeApp: (id: AppID) => void;
  focusApp: (id: AppID) => void;
  minimizeApp: (id: AppID) => void;
  updateWindowState: (id: AppID, updates: Partial<WindowState>) => void;
  addLog: (entry: Omit<LogEntry, 'id' | 'timestamp'>) => void;
  clearLogs: () => void;
}