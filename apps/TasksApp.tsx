import React, { useState, useEffect } from 'react';
import { db, auth } from '../services/firebase';
import { ref, onValue, set, remove, update } from 'firebase/database';
import { 
  Plus, Trash2, Calendar, CheckSquare, Square, 
  AlertCircle, ChevronRight, BrainCircuit, List,
  Layout, Check, Clock, X, Timer
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { GoogleGenAI, Type } from "@google/genai";

// --- Types ---
type Priority = 'low' | 'medium' | 'high';

interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

interface Task {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  priority: Priority;
  dueDate: string | null; // ISO Date String YYYY-MM-DD
  subtasks: SubTask[];
  createdAt: number;
  timeSpent?: number; // Minutes
}

type FilterType = 'inbox' | 'today' | 'upcoming' | 'completed';

// --- Constants ---
const FILTERS: { id: FilterType; label: string; icon: any }[] = [
  { id: 'inbox', label: 'Inbox', icon: Layout },
  { id: 'today', label: 'Today', icon: Clock },
  { id: 'upcoming', label: 'Upcoming', icon: Calendar },
  { id: 'completed', label: 'Done', icon: CheckSquare },
];

const PRIORITIES: { id: Priority; color: string }[] = [
  { id: 'high', color: 'text-nd-red' },
  { id: 'medium', color: 'text-nd-white' },
  { id: 'low', color: 'text-nd-gray' },
];

// --- Component ---
export const TasksApp: React.FC = () => {
  const { authStatus, addLog } = useOS();
  
  // State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeFilter, setActiveFilter] = useState<FilterType>('inbox');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [newTaskInput, setNewTaskInput] = useState('');
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  // Completion Modal State
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [timeSpentInput, setTimeSpentInput] = useState('');

  // Computed
  const activeTask = tasks.find(t => t.id === selectedTaskId);

  // --- Data Sync ---
  useEffect(() => {
    if (authStatus === 'connected' && auth.currentUser) {
      const tasksRef = ref(db, `users/${auth.currentUser.uid}/tasks`);
      const unsubscribe = onValue(tasksRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const list = Object.values(data) as Task[];
          setTasks(list.sort((a, b) => b.createdAt - a.createdAt));
        } else {
          setTasks([]);
        }
      });
      return () => unsubscribe();
    } else {
      const local = localStorage.getItem('nd_os_tasks');
      if (local) setTasks(JSON.parse(local));
    }
  }, [authStatus]);

  const saveTask = (task: Task, logMessage?: string) => {
    // Optimistic Update
    const updatedTasks = tasks.map(t => t.id === task.id ? task : t);
    setTasks(updatedTasks);

    const isCloud = authStatus === 'connected' && !!auth.currentUser;

    if (isCloud && auth.currentUser) {
      update(ref(db, `users/${auth.currentUser.uid}/tasks/${task.id}`), task);
    } else {
      localStorage.setItem('nd_os_tasks', JSON.stringify(updatedTasks));
    }

    if (logMessage) {
        addLog({ source: 'Tasks', message: logMessage, type: 'success', isCloud });
    }
  };

  const handleTaskToggle = (e: React.MouseEvent, task: Task) => {
      e.stopPropagation();
      if (task.completed) {
          // Re-opening: No time prompt needed
          saveTask({ ...task, completed: false }, "Task Reopened");
      } else {
          // Completing: Open prompt
          setCompletingTask(task);
          setTimeSpentInput('');
      }
  };

  const confirmCompletion = () => {
      if (!completingTask) return;
      
      const minutes = parseInt(timeSpentInput) || 0;
      saveTask({ ...completingTask, completed: true, timeSpent: (completingTask.timeSpent || 0) + minutes }, `Task Completed (${minutes}m logged)`);
      setCompletingTask(null);
  };

  const addTask = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newTaskInput.trim()) return;

    const newTask: Task = {
      id: `task_${Date.now()}`,
      title: newTaskInput,
      description: '',
      completed: false,
      priority: 'medium',
      dueDate: null,
      subtasks: [],
      createdAt: Date.now(),
    };

    const updatedTasks = [newTask, ...tasks];
    setTasks(updatedTasks);
    setNewTaskInput('');
    
    const isCloud = authStatus === 'connected' && !!auth.currentUser;

    if (isCloud && auth.currentUser) {
      set(ref(db, `users/${auth.currentUser.uid}/tasks/${newTask.id}`), newTask);
    } else {
      localStorage.setItem('nd_os_tasks', JSON.stringify(updatedTasks));
    }
    
    addLog({ source: 'Tasks', message: `Created: "${newTask.title}"`, type: 'info', isCloud });
  };

  const deleteTask = (id: string) => {
    const taskToDelete = tasks.find(t => t.id === id);
    const updated = tasks.filter(t => t.id !== id);
    setTasks(updated);
    if (selectedTaskId === id) setSelectedTaskId(null);

    const isCloud = authStatus === 'connected' && !!auth.currentUser;

    if (isCloud && auth.currentUser) {
      remove(ref(db, `users/${auth.currentUser.uid}/tasks/${id}`));
    } else {
      localStorage.setItem('nd_os_tasks', JSON.stringify(updated));
    }

    addLog({ source: 'Tasks', message: `Deleted: "${taskToDelete?.title || 'Task'}"`, type: 'warning', isCloud });
  };

  // --- AI Feature ---
  const handleAiBreakdown = async () => {
    if (!activeTask) return;
    
    const apiKey = localStorage.getItem('nd_os_api_key') || process.env.API_KEY;
    if (!apiKey) {
        addLog({ source: 'AI', message: 'API Key missing. Configure in settings.', type: 'error', isCloud: false });
        return;
    }

    setIsAiProcessing(true);
    addLog({ source: 'AI', message: `Analyzing task: "${activeTask.title}"`, type: 'info', isCloud: true });

    try {
      const ai = new GoogleGenAI({ apiKey });
      const prompt = `Break down this task into 3-5 concise, actionable subtasks. Task: "${activeTask.title}". Description: "${activeTask.description}".`;
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("No response text");
      
      const subtaskTitles: string[] = JSON.parse(text);

      const newSubtasks: SubTask[] = subtaskTitles.map(title => ({
        id: `st_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title,
        completed: false
      }));

      saveTask({
        ...activeTask,
        subtasks: [...(activeTask.subtasks || []), ...newSubtasks]
      }, `AI Deconstructed into ${newSubtasks.length} subtasks`);

    } catch (err) {
      console.error("AI Error", err);
      addLog({ source: 'AI', message: `Analysis Failed`, type: 'error', isCloud: false });
    } finally {
      setIsAiProcessing(false);
    }
  };

  // --- Filters ---
  const getFilteredTasks = () => {
    const today = new Date().toISOString().split('T')[0];
    
    return tasks.filter(t => {
      if (activeFilter === 'completed') return t.completed;
      if (t.completed) return false; // Hide completed in other views

      if (activeFilter === 'inbox') return true;
      if (activeFilter === 'today') return t.dueDate === today;
      if (activeFilter === 'upcoming') return t.dueDate && t.dueDate > today;
      return true;
    });
  };

  const filteredTasks = getFilteredTasks();

  return (
    <div className="flex h-full bg-nd-black text-nd-white font-sans divide-x divide-nd-gray overflow-hidden relative">
      
      {/* 1. Sidebar */}
      <div className="w-[60px] md:w-[180px] flex-shrink-0 flex flex-col bg-nd-black pt-4">
        {FILTERS.map(filter => (
          <button
            key={filter.id}
            onClick={() => { setActiveFilter(filter.id); setSelectedTaskId(null); }}
            className={`flex items-center gap-3 px-4 py-3 mx-2 mb-1 transition-all ${
              activeFilter === filter.id
                ? 'bg-nd-white text-nd-black'
                : 'text-nd-gray hover:text-nd-white hover:bg-nd-gray/10'
            }`}
          >
            <filter.icon size={18} />
            <span className="hidden md:inline font-medium text-sm">{filter.label}</span>
            {activeFilter === filter.id && tasks.filter(t => !t.completed && activeFilter === 'inbox').length > 0 && filter.id === 'inbox' && (
                <span className="ml-auto text-xs font-mono">{tasks.filter(t => !t.completed).length}</span>
            )}
          </button>
        ))}
      </div>

      {/* 2. Main List */}
      <div className={`flex-1 flex flex-col min-w-0 ${selectedTaskId ? 'hidden lg:flex' : 'flex'}`}>
        
        {/* Add Task Input */}
        <form onSubmit={addTask} className="p-4 border-b border-nd-gray flex items-center gap-3">
          <div className="w-5 h-5 border border-nd-gray rounded-sm flex items-center justify-center">
            <Plus size={14} className="text-nd-gray" />
          </div>
          <input
            autoFocus
            value={newTaskInput}
            onChange={(e) => setNewTaskInput(e.target.value)}
            placeholder="Add a new task..."
            className="flex-1 bg-transparent outline-none text-nd-white placeholder-nd-gray"
          />
        </form>

        {/* Task List */}
        <div className="flex-1 overflow-y-auto">
          {filteredTasks.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full opacity-30 gap-2">
                <CheckSquare size={32} />
                <span className="font-mono text-xs">NO TASKS</span>
             </div>
          ) : (
            filteredTasks.map(task => (
              <div
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
                className={`flex items-center gap-3 px-4 py-3 border-b border-nd-gray/20 cursor-pointer group transition-colors ${
                  selectedTaskId === task.id ? 'bg-nd-gray/20' : 'hover:bg-nd-gray/5'
                }`}
              >
                {/* Custom Checkbox */}
                <button
                  onClick={(e) => handleTaskToggle(e, task)}
                  className={`w-5 h-5 border flex items-center justify-center transition-colors ${
                    task.completed 
                      ? 'bg-nd-gray border-nd-gray text-nd-black' 
                      : `border-nd-gray hover:border-nd-white ${task.priority === 'high' ? 'border-nd-red' : ''}`
                  }`}
                >
                  {task.completed && <Check size={14} strokeWidth={3} />}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${task.completed ? 'line-through text-nd-gray' : 'text-nd-white'}`}>
                    {task.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                     {task.priority === 'high' && <span className="text-[10px] text-nd-red font-mono uppercase tracking-wider">HIGH</span>}
                     {task.dueDate && (
                       <div className={`flex items-center gap-1 text-[10px] font-mono ${new Date(task.dueDate) < new Date() && !task.completed ? 'text-nd-red' : 'text-nd-gray'}`}>
                         <Calendar size={10} />
                         <span>{task.dueDate}</span>
                       </div>
                     )}
                     {task.timeSpent && task.timeSpent > 0 && (
                         <div className="flex items-center gap-1 text-[10px] text-nd-gray font-mono">
                             <Timer size={10} />
                             <span>{task.timeSpent}m</span>
                         </div>
                     )}
                     {task.subtasks?.length > 0 && (
                        <div className="flex items-center gap-1 text-[10px] text-nd-gray font-mono">
                           <List size={10} />
                           <span>{task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}</span>
                        </div>
                     )}
                  </div>
                </div>

                {selectedTaskId === task.id && <ChevronRight size={16} className="text-nd-white" />}
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. Detail Inspector Panel */}
      {selectedTaskId && activeTask ? (
        <div className="w-full lg:w-[350px] flex-shrink-0 bg-nd-black flex flex-col border-l border-nd-gray absolute inset-0 lg:static z-20">
          
          {/* Mobile Header (Back button) */}
          <div className="lg:hidden h-[50px] border-b border-nd-gray flex items-center px-4">
             <button onClick={() => setSelectedTaskId(null)} className="text-sm font-mono flex items-center gap-2 text-nd-gray">
               <ChevronRight className="rotate-180" size={14} /> BACK
             </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
            
            {/* Title & Priority */}
            <div className="flex items-start gap-3">
               <button
                  onClick={(e) => handleTaskToggle(e, activeTask)}
                  className={`mt-1 w-6 h-6 border flex-shrink-0 flex items-center justify-center transition-colors ${
                    activeTask.completed ? 'bg-nd-gray border-nd-gray' : 'border-nd-white'
                  }`}
                >
                  {activeTask.completed && <Check size={16} />}
                </button>
                <textarea
                  value={activeTask.title}
                  onChange={(e) => saveTask({...activeTask, title: e.target.value})} // No log for typing
                  className={`flex-1 bg-transparent outline-none text-lg font-bold resize-none h-auto overflow-hidden ${activeTask.completed ? 'line-through text-nd-gray' : ''}`}
                  rows={2}
                />
            </div>

            {/* Properties Grid */}
            <div className="grid grid-cols-2 gap-4">
               {/* Due Date */}
               <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-widest text-nd-gray font-mono">Due Date</label>
                  <div className="relative group">
                    <input 
                      type="date"
                      value={activeTask.dueDate || ''}
                      onChange={(e) => saveTask({...activeTask, dueDate: e.target.value || null}, "Due Date Updated")}
                      className="w-full bg-nd-gray/10 border border-transparent focus:border-nd-gray text-xs px-2 py-2 text-nd-white outline-none font-mono"
                    />
                    <Calendar size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-nd-gray pointer-events-none" />
                  </div>
               </div>
               
               {/* Priority */}
               <div className="flex flex-col gap-1">
                  <label className="text-[10px] uppercase tracking-widest text-nd-gray font-mono">Priority</label>
                  <div className="flex gap-1">
                    {PRIORITIES.map(p => (
                      <button
                        key={p.id}
                        onClick={() => saveTask({...activeTask, priority: p.id}, `Priority: ${p.id.toUpperCase()}`)}
                        className={`flex-1 h-8 border flex items-center justify-center transition-all ${
                           activeTask.priority === p.id
                             ? `bg-nd-white border-nd-white ${p.id === 'high' ? 'text-nd-red' : 'text-nd-black'}`
                             : 'border-nd-gray/30 text-nd-gray hover:border-nd-gray'
                        }`}
                        title={p.id}
                      >
                         <AlertCircle size={12} className={activeTask.priority === p.id ? 'fill-current' : ''} />
                      </button>
                    ))}
                  </div>
               </div>
            </div>

            {/* Time Tracking (Manual Add) */}
            <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-widest text-nd-gray font-mono">Total Time (Minutes)</label>
                <div className="flex items-center gap-2">
                    <Timer size={14} className="text-nd-gray" />
                    <input 
                        type="number"
                        value={activeTask.timeSpent || 0}
                        onChange={(e) => saveTask({...activeTask, timeSpent: parseInt(e.target.value) || 0})}
                        className="bg-transparent border-b border-nd-gray focus:border-nd-white w-20 text-sm font-mono outline-none"
                    />
                    <span className="text-xs text-nd-gray">mins</span>
                </div>
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
               <label className="text-[10px] uppercase tracking-widest text-nd-gray font-mono">Notes</label>
               <textarea
                 value={activeTask.description}
                 onChange={(e) => saveTask({...activeTask, description: e.target.value})} // No log
                 placeholder="Add details..."
                 className="w-full min-h-[100px] bg-nd-gray/10 p-3 text-sm text-nd-white/80 outline-none resize-none font-mono leading-relaxed"
               />
            </div>

            {/* Subtasks */}
            <div className="flex flex-col gap-2">
               <div className="flex items-center justify-between">
                 <label className="text-[10px] uppercase tracking-widest text-nd-gray font-mono">Subtasks</label>
                 <button 
                    onClick={handleAiBreakdown} 
                    disabled={isAiProcessing}
                    className="text-[10px] flex items-center gap-1 text-nd-gray hover:text-nd-white disabled:opacity-50"
                 >
                    <BrainCircuit size={12} className={isAiProcessing ? "animate-spin" : ""} />
                    {isAiProcessing ? "THINKING..." : "DECONSTRUCT"}
                 </button>
               </div>
               
               <div className="flex flex-col gap-2">
                  {/* Subtask List */}
                  {(activeTask.subtasks || []).map((st, idx) => (
                    <div key={st.id} className="flex items-center gap-2 group">
                       <button
                         onClick={() => {
                            const newSubs = [...activeTask.subtasks];
                            newSubs[idx].completed = !newSubs[idx].completed;
                            saveTask({...activeTask, subtasks: newSubs}, `Subtask ${newSubs[idx].completed ? 'Completed' : 'Reset'}`);
                         }}
                         className={`w-4 h-4 border flex items-center justify-center ${st.completed ? 'bg-nd-gray border-nd-gray' : 'border-nd-gray hover:border-nd-white'}`}
                       >
                         {st.completed && <Check size={10} />}
                       </button>
                       <input 
                         value={st.title}
                         onChange={(e) => {
                            const newSubs = [...activeTask.subtasks];
                            newSubs[idx].title = e.target.value;
                            saveTask({...activeTask, subtasks: newSubs});
                         }}
                         className={`flex-1 bg-transparent outline-none text-sm ${st.completed ? 'text-nd-gray line-through' : 'text-nd-white'}`}
                       />
                       <button 
                         onClick={() => {
                            const newSubs = activeTask.subtasks.filter((_, i) => i !== idx);
                            saveTask({...activeTask, subtasks: newSubs});
                         }}
                         className="opacity-0 group-hover:opacity-100 text-nd-gray hover:text-nd-red"
                       >
                         <Trash2 size={12} />
                       </button>
                    </div>
                  ))}

                  {/* Add Subtask */}
                  <button 
                    onClick={() => {
                      const newSub: SubTask = { id: Date.now().toString(), title: '', completed: false };
                      saveTask({...activeTask, subtasks: [...(activeTask.subtasks || []), newSub]});
                    }}
                    className="flex items-center gap-2 text-sm text-nd-gray hover:text-nd-white mt-2"
                  >
                    <Plus size={14} /> <span>Add subtask</span>
                  </button>
               </div>
            </div>

          </div>
          
          {/* Footer Actions */}
          <div className="p-4 border-t border-nd-gray flex justify-between items-center">
            <span className="text-[10px] font-mono text-nd-gray">
               CREATED {new Date(activeTask.createdAt).toLocaleDateString()}
            </span>
            <button 
              onClick={() => deleteTask(activeTask.id)}
              className="p-2 hover:bg-nd-red hover:text-white text-nd-red border border-transparent hover:border-nd-red transition-all"
            >
              <Trash2 size={16} />
            </button>
          </div>

        </div>
      ) : (
        // Empty State for Inspector (Desktop)
        <div className="hidden lg:flex w-[350px] flex-col items-center justify-center border-l border-nd-gray text-nd-gray">
           <div className="w-16 h-16 border border-nd-gray rounded-full flex items-center justify-center mb-4 opacity-30">
              <Layout size={24} />
           </div>
           <p className="font-mono text-xs tracking-widest">SELECT A TASK</p>
        </div>
      )}

      {/* Completion Dialog */}
      {completingTask && (
          <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-nd-black border border-nd-white w-full max-w-sm shadow-2xl p-6 animate-in zoom-in-95 duration-200">
                  <h3 className="font-bold text-lg uppercase tracking-wide mb-4 flex items-center gap-2">
                      <CheckSquare className="text-nd-white" /> Complete Task
                  </h3>
                  <p className="text-sm text-nd-gray mb-6 truncate">{completingTask.title}</p>
                  
                  <div className="mb-6">
                      <label className="text-[10px] uppercase text-nd-gray font-bold tracking-widest mb-2 block">
                          Final Time Spent (Minutes)
                      </label>
                      <input 
                          autoFocus
                          type="number"
                          placeholder="e.g. 30"
                          value={timeSpentInput}
                          onChange={e => setTimeSpentInput(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && confirmCompletion()}
                          className="w-full bg-nd-gray/10 border border-nd-gray p-3 text-xl font-mono text-nd-white outline-none focus:border-nd-white"
                      />
                  </div>

                  <div className="flex gap-3">
                      <button 
                          onClick={confirmCompletion}
                          className="flex-1 bg-nd-white text-nd-black py-3 font-bold text-sm hover:bg-white/90 uppercase"
                      >
                          Confirm
                      </button>
                      <button 
                          onClick={() => setCompletingTask(null)}
                          className="px-4 py-3 border border-nd-gray text-nd-gray hover:text-nd-white hover:border-nd-white text-sm uppercase"
                      >
                          Cancel
                      </button>
                  </div>
              </div>
          </div>
      )}

    </div>
  );
};