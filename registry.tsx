import React, { lazy } from 'react';
import { AppID, AppConfig } from './types';
import { Settings, FileText, CheckSquare, Folder, Cpu, Calendar, Activity, Briefcase, CreditCard, Shield, Clock, CalendarDays, Calculator, Mail, BarChart2, Image as ImageIcon, BookOpen, Clipboard, Monitor } from 'lucide-react';

// Lazy Load Apps
const SettingsApp = lazy(() => import('./apps/SettingsApp').then(m => ({ default: m.SettingsApp })));
const NotesApp = lazy(() => import('./apps/NotesApp').then(m => ({ default: m.NotesApp })));
const TasksApp = lazy(() => import('./apps/TasksApp').then(m => ({ default: m.TasksApp })));
const HabitApp = lazy(() => import('./apps/HabitApp').then(m => ({ default: m.HabitApp })));
const LogApp = lazy(() => import('./apps/LogApp').then(m => ({ default: m.LogApp })));
const AiChatApp = lazy(() => import('./apps/AiChatApp').then(m => ({ default: m.AiChatApp })));
const CRMApp = lazy(() => import('./apps/CRMApp').then(m => ({ default: m.CRMApp })));
const WalletApp = lazy(() => import('./apps/WalletApp').then(m => ({ default: m.WalletApp })));
const FilesApp = lazy(() => import('./apps/FilesApp').then(m => ({ default: m.FilesApp })));
const VaultApp = lazy(() => import('./apps/VaultApp').then(m => ({ default: m.VaultApp })));
const ClockApp = lazy(() => import('./apps/ClockApp').then(m => ({ default: m.ClockApp })));
const CalendarApp = lazy(() => import('./apps/CalendarApp').then(m => ({ default: m.CalendarApp })));
const CalculatorApp = lazy(() => import('./apps/CalculatorApp').then(m => ({ default: m.CalculatorApp })));
const EmailApp = lazy(() => import('./apps/EmailApp').then(m => ({ default: m.EmailApp })));
const AnalyticsApp = lazy(() => import('./apps/AnalyticsApp').then(m => ({ default: m.AnalyticsApp })));
const PhotosApp = lazy(() => import('./apps/PhotosApp').then(m => ({ default: m.PhotosApp })));
const PdfApp = lazy(() => import('./apps/PdfApp').then(m => ({ default: m.PdfApp })));
const ClipboardApp = lazy(() => import('./apps/ClipboardApp').then(m => ({ default: m.ClipboardApp })));
const TaskManagerApp = lazy(() => import('./apps/TaskManagerApp').then(m => ({ default: m.TaskManagerApp })));

export const APP_REGISTRY: Record<AppID, AppConfig> = {
  [AppID.TASK_MANAGER]: {
    id: AppID.TASK_MANAGER,
    title: 'Task Manager',
    icon: Activity,
    component: TaskManagerApp,
    defaultSize: { width: 700, height: 500 },
    showInDock: false,
  },
  [AppID.CLIPBOARD]: {
    id: AppID.CLIPBOARD,
    title: 'Clipboard',
    icon: Clipboard,
    component: ClipboardApp,
    defaultSize: { width: 400, height: 600 },
    showInDock: true,
  },
  [AppID.ANALYTICS]: {
    id: AppID.ANALYTICS,
    title: 'Analytics',
    icon: BarChart2,
    component: AnalyticsApp,
    defaultSize: { width: 1000, height: 700 },
    showInDock: true,
  },
  [AppID.EMAIL]: {
    id: AppID.EMAIL,
    title: 'Mail',
    icon: Mail,
    component: EmailApp,
    defaultSize: { width: 1000, height: 700 },
    showInDock: true,
  },
  [AppID.CALCULATOR]: {
    id: AppID.CALCULATOR,
    title: 'Calculator',
    icon: Calculator,
    component: CalculatorApp,
    defaultSize: { width: 800, height: 600 },
    showInDock: true,
  },
  [AppID.CALENDAR]: {
    id: AppID.CALENDAR,
    title: 'Calendar',
    icon: CalendarDays,
    component: CalendarApp,
    defaultSize: { width: 1000, height: 700 },
    showInDock: true,
  },
  [AppID.CLOCK]: {
    id: AppID.CLOCK,
    title: 'Time & Focus',
    icon: Clock,
    component: ClockApp,
    defaultSize: { width: 700, height: 500 },
    showInDock: true,
  },
  [AppID.VAULT]: {
    id: AppID.VAULT,
    title: 'Security Vault',
    icon: Shield,
    component: VaultApp,
    defaultSize: { width: 900, height: 600 },
    showInDock: true,
  },
  [AppID.WALLET]: {
    id: AppID.WALLET,
    title: 'Wallet',
    icon: CreditCard,
    component: WalletApp,
    defaultSize: { width: 1000, height: 700 },
    showInDock: true,
  },
  [AppID.CRM]: {
    id: AppID.CRM,
    title: 'Freelance CRM',
    icon: Briefcase,
    component: CRMApp,
    defaultSize: { width: 1100, height: 700 },
    showInDock: true,
  },
  [AppID.SETTINGS]: {
    id: AppID.SETTINGS,
    title: 'System Settings',
    icon: Settings,
    component: SettingsApp,
    defaultSize: { width: 800, height: 600 },
    showInDock: true,
  },
  [AppID.AI_CHAT]: {
    id: AppID.AI_CHAT,
    title: 'AI Assistant',
    icon: Cpu,
    component: AiChatApp,
    defaultSize: { width: 500, height: 600 },
    showInDock: true, 
  },
  [AppID.NOTES]: {
    id: AppID.NOTES,
    title: 'Notes',
    icon: FileText,
    component: NotesApp,
    defaultSize: { width: 900, height: 600 },
    showInDock: true,
  },
  [AppID.TASKS]: {
    id: AppID.TASKS,
    title: 'Tasks',
    icon: CheckSquare,
    component: TasksApp,
    defaultSize: { width: 950, height: 650 },
    showInDock: true,
  },
  [AppID.HABITS]: {
    id: AppID.HABITS,
    title: 'Habit Calendar',
    icon: Calendar,
    component: HabitApp,
    defaultSize: { width: 1000, height: 700 },
    showInDock: true,
  },
  [AppID.LOGS]: {
    id: AppID.LOGS,
    title: 'System Log',
    icon: Activity, // Note: Shared icon, might want to change later if confusing
    component: LogApp,
    defaultSize: { width: 600, height: 400 },
    showInDock: true,
  },
  [AppID.FILES]: {
    id: AppID.FILES,
    title: 'File Manager',
    icon: Folder,
    component: FilesApp,
    defaultSize: { width: 700, height: 450 },
    showInDock: true,
  },
  [AppID.PHOTOS]: {
    id: AppID.PHOTOS,
    title: 'Photos',
    icon: ImageIcon,
    component: PhotosApp,
    defaultSize: { width: 900, height: 650 },
    showInDock: true,
  },
  [AppID.PDF]: {
    id: AppID.PDF,
    title: 'PDF Viewer',
    icon: BookOpen,
    component: PdfApp,
    defaultSize: { width: 800, height: 800 },
    showInDock: false,
  },
};