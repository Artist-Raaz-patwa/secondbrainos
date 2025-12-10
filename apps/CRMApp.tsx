import React, { useState, useEffect } from 'react';
import { db, auth } from '../services/firebase';
import { ref, onValue, set, push, remove, update } from 'firebase/database';
import { 
  Briefcase, DollarSign, Clock, Users, Plus, ChevronRight, 
  ChevronLeft, MoreHorizontal, CheckCircle, Circle, TrendingUp,
  LayoutDashboard, Minus, FileText, Printer, Calendar, Filter, X,
  PieChart, Palette, Check, Sparkles, Loader2, BrainCircuit, Mail,
  Download, File
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { GoogleGenAI } from "@google/genai";

// --- Types ---

type ProjectStatus = 'lead' | 'active' | 'completed';

interface Project {
  id: string;
  name: string;
  client: string;
  status: ProjectStatus;
  hourlyRate: number;
  createdAt: number;
}

interface Task {
  id: string;
  projectId: string;
  title: string;
  hours: number;
  rate: number; // Rate at time of task creation
  charge: number; // usually hours * rate, but can be manual
  completed: boolean;
  createdAt: number;
}

// --- Components ---

export const CRMApp: React.FC = () => {
  const { authStatus, addLog } = useOS();
  
  // State
  const [view, setView] = useState<'dashboard' | 'project_detail' | 'reports'>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  
  // Forms
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectClient, setNewProjectClient] = useState('');
  const [newProjectRate, setNewProjectRate] = useState(50);

  // --- Data Sync ---

  useEffect(() => {
    if (authStatus === 'connected' && auth.currentUser) {
      const userId = auth.currentUser.uid;
      
      const projectsRef = ref(db, `users/${userId}/crm/projects`);
      const tasksRef = ref(db, `users/${userId}/crm/tasks`);

      const unsubP = onValue(projectsRef, (s) => setProjects(s.val() ? Object.values(s.val()) : []));
      const unsubT = onValue(tasksRef, (s) => setTasks(s.val() ? Object.values(s.val()) : []));

      return () => { unsubP(); unsubT(); };
    } else {
       // Local Storage
       const lp = localStorage.getItem('nd_os_crm_projects');
       if (lp) setProjects(JSON.parse(lp));
       const lt = localStorage.getItem('nd_os_crm_tasks');
       if (lt) setTasks(JSON.parse(lt));
    }
  }, [authStatus]);

  // --- Actions ---

  const saveToStorage = (newProjects: Project[], newTasks: Task[]) => {
      const isCloud = authStatus === 'connected' && !!auth.currentUser;
      if (!isCloud) {
          localStorage.setItem('nd_os_crm_projects', JSON.stringify(newProjects));
          localStorage.setItem('nd_os_crm_tasks', JSON.stringify(newTasks));
      }
      return isCloud;
  };

  const createProject = () => {
      if (!newProjectName) return;
      const newP: Project = {
          id: `p_${Date.now()}`,
          name: newProjectName,
          client: newProjectClient || 'Unknown Client',
          status: 'active',
          hourlyRate: Number(newProjectRate),
          createdAt: Date.now()
      };
      
      if (authStatus === 'connected' && auth.currentUser) {
          set(ref(db, `users/${auth.currentUser.uid}/crm/projects/${newP.id}`), newP);
      } else {
          const newProjects = [...projects, newP];
          setProjects(newProjects);
          saveToStorage(newProjects, tasks);
      }
      
      setNewProjectName('');
      setNewProjectClient('');
      setIsAddingProject(false);
      addLog({ source: 'CRM', message: `New Project: ${newP.name}`, type: 'success', isCloud: authStatus === 'connected' });
  };

  const deleteProject = (id: string) => {
     const remainingTasks = tasks.filter(t => t.projectId !== id);
     if (authStatus === 'connected' && auth.currentUser) {
         remove(ref(db, `users/${auth.currentUser.uid}/crm/projects/${id}`));
         tasks.filter(t => t.projectId === id).forEach(t => {
             remove(ref(db, `users/${auth.currentUser.uid}/crm/tasks/${t.id}`));
         });
     } else {
         const remainingProjects = projects.filter(p => p.id !== id);
         setProjects(remainingProjects);
         setTasks(remainingTasks);
         saveToStorage(remainingProjects, remainingTasks);
     }
     if (selectedProjectId === id) {
         setSelectedProjectId(null);
         setView('dashboard');
     }
  };

  const updateProject = (updated: Project) => {
      if (authStatus === 'connected' && auth.currentUser) {
          update(ref(db, `users/${auth.currentUser.uid}/crm/projects/${updated.id}`), updated);
      } else {
          const newProjects = projects.map(p => p.id === updated.id ? updated : p);
          setProjects(newProjects);
          saveToStorage(newProjects, tasks);
      }
  };

  const saveTask = (task: Task) => {
      if (authStatus === 'connected' && auth.currentUser) {
          update(ref(db, `users/${auth.currentUser.uid}/crm/tasks/${task.id}`), task);
      } else {
          const exists = tasks.find(t => t.id === task.id);
          let newTasks;
          if (exists) {
              newTasks = tasks.map(t => t.id === task.id ? task : t);
          } else {
              newTasks = [...tasks, task];
          }
          setTasks(newTasks);
          saveToStorage(projects, newTasks);
      }
  };

  const deleteTask = (taskId: string) => {
      if (authStatus === 'connected' && auth.currentUser) {
          remove(ref(db, `users/${auth.currentUser.uid}/crm/tasks/${taskId}`));
      } else {
          const newTasks = tasks.filter(t => t.id !== taskId);
          setTasks(newTasks);
          saveToStorage(projects, newTasks);
      }
  };

  const totalRevenue = tasks.filter(t => t.completed).reduce((acc, t) => acc + t.charge, 0);
  const potentialRevenue = tasks.filter(t => !t.completed).reduce((acc, t) => acc + t.charge, 0);
  const totalHours = tasks.reduce((acc, t) => acc + t.hours, 0);
  const activeProjectsCount = projects.filter(p => p.status === 'active').length;

  return (
    <div className="h-full flex flex-col bg-nd-black text-nd-white font-sans overflow-hidden">
      
      {/* Top Bar */}
      <div className="h-[60px] border-b border-nd-gray flex items-center px-4 md:px-6 gap-3 md:gap-4 bg-nd-black shrink-0">
         {view !== 'dashboard' && (
             <button onClick={() => setView('dashboard')} className="p-2 hover:bg-nd-gray/20 rounded-full transition-colors text-nd-gray hover:text-nd-white">
                 <ChevronLeft size={20} />
             </button>
         )}
         
         <div className="flex items-center gap-3">
             <div className="w-8 h-8 bg-nd-white text-nd-black flex items-center justify-center rounded-sm">
                 <Briefcase size={16} />
             </div>
             <div>
                 <h1 className="font-bold text-sm tracking-wide uppercase">Freelance CRM</h1>
                 <p className="text-[10px] text-nd-gray font-mono">
                     {view === 'dashboard' ? 'DASHBOARD' : view === 'reports' ? 'REPORT GENERATOR' : projects.find(p => p.id === selectedProjectId)?.name || 'PROJECT'}
                 </p>
             </div>
         </div>
      </div>

      <div className="flex-1 overflow-hidden relative">
          
          {/* VIEW: DASHBOARD */}
          {view === 'dashboard' && (
              <div className="h-full overflow-y-auto p-4 md:p-8">
                 
                 {/* Metrics Grid */}
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                     <DashboardCard 
                        label="Total Revenue" 
                        value={`$${totalRevenue.toLocaleString()}`} 
                        subValue={`+$${potentialRevenue.toLocaleString()} pending`}
                        icon={DollarSign} 
                        isCurrency
                     />
                     <DashboardCard 
                        label="Billable Hours" 
                        value={`${totalHours}h`} 
                        subValue="Lifetime tracked"
                        icon={Clock} 
                     />
                     <DashboardCard 
                        label="Active Projects" 
                        value={activeProjectsCount.toString()} 
                        subValue={`${projects.length} Total projects`}
                        icon={Briefcase} 
                     />
                 </div>

                 {/* Projects List Header */}
                 <div className="flex items-center justify-between mb-4 border-b border-nd-gray pb-2">
                     <h2 className="text-lg font-bold font-mono">PROJECTS</h2>
                     <div className="flex gap-2">
                        <button 
                            onClick={() => setView('reports')}
                            className="flex items-center gap-2 px-3 py-1.5 border border-nd-gray text-xs font-bold hover:border-nd-white hover:text-nd-white text-nd-gray transition-colors"
                        >
                            <FileText size={14} /> REPORTS
                        </button>
                        <button 
                            onClick={() => setIsAddingProject(true)}
                            className="flex items-center gap-2 px-3 py-1.5 border border-nd-white text-xs font-bold hover:bg-nd-white hover:text-nd-black transition-colors"
                        >
                            <Plus size={14} /> NEW
                        </button>
                     </div>
                 </div>

                 {/* Add Project Form */}
                 {isAddingProject && (
                     <div className="mb-6 p-4 border border-nd-gray bg-nd-gray/5 animate-in slide-in-from-top-2">
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                             <input 
                               autoFocus
                               placeholder="Project Name"
                               value={newProjectName}
                               onChange={e => setNewProjectName(e.target.value)}
                               className="bg-black border border-nd-gray p-2 text-sm outline-none focus:border-nd-white text-nd-white"
                             />
                             <input 
                               placeholder="Client Name"
                               value={newProjectClient}
                               onChange={e => setNewProjectClient(e.target.value)}
                               className="bg-black border border-nd-gray p-2 text-sm outline-none focus:border-nd-white text-nd-white"
                             />
                             <div className="flex items-center border border-nd-gray bg-black px-2">
                                <span className="text-nd-gray text-xs">$</span>
                                <input 
                                    type="number"
                                    placeholder="Rate/hr"
                                    value={newProjectRate}
                                    onChange={e => setNewProjectRate(Number(e.target.value))}
                                    className="bg-transparent p-2 text-sm outline-none w-full text-nd-white"
                                />
                                <span className="text-nd-gray text-xs">/hr</span>
                             </div>
                         </div>
                         <div className="flex justify-end gap-2">
                             <button onClick={() => setIsAddingProject(false)} className="text-xs px-3 py-1 text-nd-gray hover:text-nd-white">CANCEL</button>
                             <button onClick={createProject} className="text-xs px-4 py-1 bg-nd-white text-nd-black font-bold">CREATE</button>
                         </div>
                     </div>
                 )}

                 {/* Projects Table */}
                 <div className="grid grid-cols-1 gap-3">
                     {projects.length === 0 ? (
                         <div className="text-center py-10 opacity-30 font-mono text-sm">NO PROJECTS FOUND</div>
                     ) : (
                         projects.map(project => {
                             const pTasks = tasks.filter(t => t.projectId === project.id);
                             const pRevenue = pTasks.filter(t => t.completed).reduce((sum, t) => sum + t.charge, 0);
                             const pHours = pTasks.reduce((sum, t) => sum + t.hours, 0);

                             return (
                                 <div 
                                   key={project.id}
                                   onClick={() => { setSelectedProjectId(project.id); setView('project_detail'); }}
                                   className="group border border-nd-gray hover:border-nd-white bg-nd-black p-4 cursor-pointer transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-0"
                                 >
                                     <div className="flex-1">
                                         <div className="flex items-center gap-3">
                                             <h3 className="font-bold text-base">{project.name}</h3>
                                             <span className={`text-[10px] px-2 py-0.5 border ${
                                                 project.status === 'active' ? 'border-green-500 text-green-500' :
                                                 project.status === 'completed' ? 'border-nd-gray text-nd-gray' :
                                                 'border-yellow-500 text-yellow-500'
                                             } uppercase`}>{project.status}</span>
                                         </div>
                                         <p className="text-xs text-nd-gray mt-1 flex items-center gap-2">
                                             <Users size={12} /> {project.client}
                                             <span className="w-1 h-1 bg-nd-gray rounded-full"></span>
                                             <span>${project.hourlyRate}/hr</span>
                                         </p>
                                     </div>

                                     <div className="flex items-center justify-between md:justify-end gap-6 text-right w-full md:w-auto border-t border-nd-gray/20 md:border-0 pt-3 md:pt-0">
                                         <div>
                                             <div className="text-[10px] text-nd-gray uppercase tracking-wider">Revenue</div>
                                             <div className="font-mono text-sm text-nd-white">${pRevenue}</div>
                                         </div>
                                         <div>
                                             <div className="text-[10px] text-nd-gray uppercase tracking-wider">Hours</div>
                                             <div className="font-mono text-sm text-nd-white">{pHours}h</div>
                                         </div>
                                         <ChevronRight size={18} className="text-nd-gray group-hover:text-nd-white hidden md:block" />
                                     </div>
                                 </div>
                             );
                         })
                     )}
                 </div>
              </div>
          )}

          {/* VIEW: PROJECT DETAIL */}
          {view === 'project_detail' && selectedProjectId && (
              <ProjectDetail 
                 project={projects.find(p => p.id === selectedProjectId)!} 
                 tasks={tasks.filter(t => t.projectId === selectedProjectId)}
                 authStatus={authStatus}
                 addLog={addLog}
                 onDelete={() => deleteProject(selectedProjectId)}
                 onUpdateProject={updateProject}
                 onSaveTask={saveTask}
                 onDeleteTask={deleteTask}
              />
          )}

          {/* VIEW: REPORTS */}
          {view === 'reports' && (
              <ReportGenerator 
                projects={projects}
                tasks={tasks}
                onClose={() => setView('dashboard')}
              />
          )}

      </div>
    </div>
  );
};

// ... (Sub components remain unchanged but are needed to complete the file validity)
const DashboardCard = ({ label, value, subValue, icon: Icon, isCurrency = false }: any) => (
    <div className="border border-nd-gray p-5 bg-nd-black relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <Icon size={48} />
        </div>
        <div className="relative z-10">
            <h3 className="text-xs font-mono text-nd-gray uppercase tracking-widest mb-2">{label}</h3>
            <div className={`text-3xl font-bold ${isCurrency ? 'text-nd-white' : 'text-nd-white'}`}>
                {value}
            </div>
            {subValue && <div className="text-xs text-nd-gray mt-1">{subValue}</div>}
        </div>
    </div>
);

const ProjectDetail = ({ 
  project, tasks, authStatus, addLog, onDelete, onUpdateProject, onSaveTask, onDeleteTask
}: any) => {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskHours, setNewTaskHours] = useState('');
  const [emailDraft, setEmailDraft] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  
  // Completion Modal
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [finalHoursInput, setFinalHoursInput] = useState('');

  const handleAddTask = () => {
      if (!newTaskTitle || !newTaskHours) return;
      const hours = parseFloat(newTaskHours);
      const newTask: Task = {
          id: `t_${Date.now()}`,
          projectId: project.id,
          title: newTaskTitle,
          hours: hours,
          rate: project.hourlyRate,
          charge: hours * project.hourlyRate,
          completed: false,
          createdAt: Date.now()
      };
      onSaveTask(newTask);
      setNewTaskTitle('');
      setNewTaskHours('');
      addLog({ source: 'CRM', message: `Task Added: ${newTask.title}`, type: 'info', isCloud: authStatus === 'connected' });
  };

  const handleToggleTask = (task: Task) => {
      if (task.completed) {
          // Reopen
          onSaveTask({ ...task, completed: false });
      } else {
          // Open Modal
          setCompletingTask(task);
          setFinalHoursInput(task.hours.toString());
      }
  };

  const confirmCompletion = () => {
      if (!completingTask) return;
      const finalHours = parseFloat(finalHoursInput) || completingTask.hours;
      onSaveTask({ 
          ...completingTask, 
          completed: true, 
          hours: finalHours,
          charge: finalHours * completingTask.rate
      });
      setCompletingTask(null);
      addLog({ source: 'CRM', message: `Task Completed (${finalHours}h)`, type: 'success', isCloud: authStatus === 'connected' });
  };

  const handleDraftEmail = async () => {
      const apiKey = localStorage.getItem('nd_os_api_key') || process.env.API_KEY;
      if (!apiKey) {
          setEmailDraft("Error: API Key missing.");
          return;
      }
      setIsAiLoading(true);
      try {
          const completedTasks = tasks.filter((t: Task) => t.completed).map((t: Task) => t.title).join(', ');
          const prompt = `Write a short, professional email to client "${project.client}" updating them on project "${project.name}". Mention we completed: ${completedTasks}. Keep it concise.`;
          
          const ai = new GoogleGenAI({ apiKey });
          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt
          });
          setEmailDraft(response.text || "Draft failed.");
      } catch (e) {
          setEmailDraft("Connection error.");
      } finally {
          setIsAiLoading(false);
      }
  };

  const totalHours = tasks.reduce((sum: number, t: Task) => sum + t.hours, 0);
  const totalRevenue = tasks.filter((t: Task) => t.completed).reduce((sum: number, t: Task) => sum + t.charge, 0);
  const pendingRevenue = tasks.filter((t: Task) => !t.completed).reduce((sum: number, t: Task) => sum + t.charge, 0);

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8 flex flex-col gap-6 relative">
        
        {/* Header Card */}
        <div className="border border-nd-gray bg-nd-black p-6 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-5">
                 <Briefcase size={120} />
             </div>
             
             <div className="relative z-10">
                 <div className="flex flex-col md:flex-row justify-between items-start mb-4 gap-4 md:gap-0">
                     <div>
                         <h2 className="text-2xl md:text-3xl font-bold mb-1">{project.name}</h2>
                         <div className="flex items-center gap-3 text-sm text-nd-gray">
                             <span className="flex items-center gap-1"><Users size={14} /> {project.client}</span>
                             <span className="w-1 h-1 bg-nd-gray rounded-full"></span>
                             <span className="flex items-center gap-1"><DollarSign size={14} /> ${project.hourlyRate}/hr</span>
                         </div>
                     </div>
                     <div className="flex gap-2 w-full md:w-auto">
                        <select 
                          value={project.status}
                          onChange={(e) => onUpdateProject({...project, status: e.target.value as ProjectStatus})}
                          className="bg-black border border-nd-gray text-xs uppercase px-2 py-1 outline-none focus:border-nd-white flex-1 md:flex-none"
                        >
                            <option value="lead">Lead</option>
                            <option value="active">Active</option>
                            <option value="completed">Completed</option>
                        </select>
                        <button onClick={handleDraftEmail} className="p-1.5 border border-nd-gray text-nd-gray hover:text-white hover:border-nd-white transition-colors">
                            {isAiLoading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                        </button>
                        <button onClick={onDelete} className="p-1.5 border border-nd-red text-nd-red hover:bg-nd-red hover:text-white transition-colors">
                            <X size={14} />
                        </button>
                     </div>
                 </div>

                 {emailDraft && (
                     <div className="mb-4 bg-nd-gray/10 p-3 rounded border border-nd-gray text-xs font-mono whitespace-pre-wrap relative animate-in fade-in">
                         <button onClick={() => setEmailDraft(null)} className="absolute top-2 right-2"><X size={12}/></button>
                         {emailDraft}
                     </div>
                 )}

                 <div className="grid grid-cols-3 gap-4 border-t border-nd-gray/30 pt-4">
                     <div>
                         <div className="text-[10px] text-nd-gray uppercase tracking-widest">Logged</div>
                         <div className="text-xl font-mono">{totalHours}h</div>
                     </div>
                     <div>
                         <div className="text-[10px] text-nd-gray uppercase tracking-widest">Revenue</div>
                         <div className="text-xl font-mono text-green-500">${totalRevenue}</div>
                     </div>
                     <div>
                         <div className="text-[10px] text-nd-gray uppercase tracking-widest">Pending</div>
                         <div className="text-xl font-mono text-nd-gray">${pendingRevenue}</div>
                     </div>
                 </div>
             </div>
        </div>

        {/* Task List */}
        <div className="flex-1 min-h-0 flex flex-col">
            <h3 className="text-lg font-bold font-mono mb-4 flex items-center gap-2">
                TASKS <span className="text-xs text-nd-gray font-normal">({tasks.length})</span>
            </h3>

            {/* Add Task */}
            <div className="flex gap-2 mb-4">
                <input 
                    placeholder="Task Description"
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                    className="flex-1 bg-nd-gray/10 border border-transparent focus:border-nd-gray px-3 py-2 text-sm outline-none text-nd-white"
                />
                <input 
                    type="number"
                    placeholder="Hrs"
                    value={newTaskHours}
                    onChange={e => setNewTaskHours(e.target.value)}
                    className="w-16 md:w-20 bg-nd-gray/10 border border-transparent focus:border-nd-gray px-3 py-2 text-sm outline-none text-nd-white"
                />
                <button 
                  onClick={handleAddTask}
                  className="px-4 bg-nd-white text-nd-black font-bold text-sm hover:bg-white/90"
                >
                    ADD
                </button>
            </div>

            {/* Tasks Table */}
            <div className="border border-nd-gray bg-nd-black">
                {tasks.length === 0 ? (
                    <div className="p-8 text-center text-nd-gray opacity-50 text-sm italic">
                        No tasks logged yet.
                    </div>
                ) : (
                    <div className="divide-y divide-nd-gray/30">
                        {tasks.map((task: Task) => (
                            <div key={task.id} className="flex items-center gap-3 p-3 hover:bg-nd-gray/5 group transition-colors cursor-pointer" onClick={() => handleToggleTask(task)}>
                                <div className={`w-5 h-5 border flex items-center justify-center transition-colors ${task.completed ? 'bg-nd-white border-nd-white text-nd-black' : 'border-nd-gray hover:border-nd-white'}`}>
                                    {task.completed && <CheckCircle size={14} />}
                                </div>
                                
                                <div className="flex-1 min-w-0">
                                    <div className={`text-sm ${task.completed ? 'line-through text-nd-gray' : 'text-nd-white'}`}>
                                        {task.title}
                                    </div>
                                    <div className="text-[10px] text-nd-gray font-mono">
                                        {new Date(task.createdAt).toLocaleDateString()}
                                    </div>
                                </div>

                                <div className="text-right font-mono text-sm px-2">
                                    <div className={task.completed ? 'text-nd-gray' : 'text-nd-white'}>{task.hours}h</div>
                                </div>
                                <div className="text-right font-mono text-sm w-16 md:w-20">
                                    <div className={task.completed ? 'text-nd-white' : 'text-nd-gray'}>${task.charge}</div>
                                </div>

                                <button 
                                  onClick={(e) => { e.stopPropagation(); onDeleteTask(task.id); }}
                                  className="md:opacity-0 group-hover:opacity-100 p-1 text-nd-gray hover:text-nd-red transition-opacity"
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>

        {/* Completion Modal */}
        {completingTask && (
            <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
                <div className="bg-nd-black border border-nd-white w-full max-w-sm shadow-2xl p-6">
                    <h3 className="font-bold text-lg uppercase tracking-wide mb-4">Confirm Work</h3>
                    <p className="text-sm text-nd-gray mb-6 truncate">{completingTask.title}</p>
                    
                    <div className="mb-6">
                        <label className="text-[10px] uppercase text-nd-gray font-bold tracking-widest mb-2 block">
                            Final Billable Hours
                        </label>
                        <input 
                            autoFocus
                            type="number"
                            value={finalHoursInput}
                            onChange={e => setFinalHoursInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && confirmCompletion()}
                            className="w-full bg-nd-gray/10 border border-nd-gray p-3 text-xl font-mono text-nd-white outline-none focus:border-nd-white"
                        />
                        <div className="text-[10px] text-nd-gray mt-2 text-right">
                            Rate: ${project.hourlyRate}/hr • Total: ${(parseFloat(finalHoursInput || '0') * project.hourlyRate).toFixed(2)}
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button 
                            onClick={confirmCompletion}
                            className="flex-1 bg-nd-white text-nd-black py-3 font-bold text-sm hover:bg-white/90 uppercase"
                        >
                            Complete
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

const ReportGenerator = ({ projects, tasks, onClose }: { projects: Project[], tasks: Task[], onClose: () => void }) => {
    // Generate CSV
    const downloadCSV = () => {
        const headers = ['Project', 'Client', 'Status', 'Task', 'Date', 'Hours', 'Rate', 'Total', 'Status'];
        const rows = tasks.map(t => {
            const p = projects.find(proj => proj.id === t.projectId);
            return [
                p?.name || 'Unknown',
                p?.client || 'Unknown',
                p?.status || '-',
                t.title,
                new Date(t.createdAt).toLocaleDateString(),
                t.hours,
                t.rate,
                t.charge,
                t.completed ? 'Paid/Done' : 'Pending'
            ].join(',');
        });
        
        const csvContent = "data:text/csv;charset=utf-8," + [headers.join(','), ...rows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `crm_report_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handlePrint = () => {
        // Inject Print Styles dynamically
        const style = document.createElement('style');
        style.innerHTML = `
            @media print {
                body * { visibility: hidden; }
                #report-container, #report-container * { visibility: visible; }
                #report-container { 
                    position: fixed; 
                    left: 0; 
                    top: 0; 
                    width: 100%; 
                    height: 100%;
                    margin: 0; 
                    padding: 20px; 
                    background: white; 
                    color: black;
                    z-index: 9999;
                    overflow: visible;
                }
                .print-hidden { display: none !important; }
                /* Force black text for print clarity */
                #report-container { color: black !important; }
                #report-container .text-nd-gray { color: #666 !important; }
                #report-container .border-nd-gray { border-color: #ddd !important; }
                #report-container table { width: 100%; border-collapse: collapse; }
                #report-container th { border-bottom: 2px solid #000; text-align: left; }
                #report-container td { border-bottom: 1px solid #ddd; }
            }
        `;
        document.head.appendChild(style);
        window.print();
        document.head.removeChild(style);
    };

    const totalHours = tasks.reduce((acc, t) => acc + t.hours, 0);
    const totalIncome = tasks.filter(t => t.completed).reduce((acc, t) => acc + t.charge, 0);
    const pendingIncome = tasks.filter(t => !t.completed).reduce((acc, t) => acc + t.charge, 0);

    return (
        <div className="h-full flex flex-col bg-nd-black absolute inset-0 z-50 animate-in fade-in slide-in-from-bottom-4">
            
            {/* Toolbar */}
            <div className="flex items-center justify-between p-4 border-b border-nd-gray bg-nd-black shrink-0 print-hidden">
                <div className="flex items-center gap-4">
                    <button onClick={onClose} className="hover:bg-nd-gray/20 p-2 rounded-full"><ChevronLeft size={20}/></button>
                    <h2 className="text-sm font-bold font-mono uppercase tracking-widest">Report Generator</h2>
                </div>
                <div className="flex gap-2">
                    <button onClick={downloadCSV} className="flex items-center gap-2 border border-nd-gray px-4 py-2 text-xs font-bold uppercase hover:border-nd-white transition-colors">
                        <FileText size={14} /> CSV
                    </button>
                    <button onClick={handlePrint} className="flex items-center gap-2 bg-nd-white text-nd-black px-4 py-2 text-xs font-bold uppercase hover:bg-white/90 transition-colors">
                        <Printer size={14} /> Print / PDF
                    </button>
                </div>
            </div>

            {/* Document Preview (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-8 bg-nd-black/50">
                <div id="report-container" className="max-w-3xl mx-auto bg-nd-black border border-nd-gray p-12 shadow-2xl min-h-[800px]">
                    
                    {/* Doc Header */}
                    <div className="flex justify-between items-start border-b-2 border-white pb-8 mb-8">
                        <div>
                            <h1 className="text-4xl font-bold uppercase tracking-tighter mb-2">Work Manifest</h1>
                            <p className="text-xs text-nd-gray font-mono uppercase tracking-widest">Second Brain OS • Generated Report</p>
                        </div>
                        <div className="text-right text-xs font-mono">
                            <div>DATE: {new Date().toLocaleDateString()}</div>
                            <div>REF: {Date.now().toString().slice(-6)}</div>
                        </div>
                    </div>

                    {/* Summary Section */}
                    <div className="grid grid-cols-3 gap-8 mb-12">
                        <div>
                            <div className="text-[10px] text-nd-gray uppercase tracking-widest mb-1">Total Billed</div>
                            <div className="text-2xl font-mono font-bold">${totalIncome.toLocaleString()}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-nd-gray uppercase tracking-widest mb-1">Pending</div>
                            <div className="text-2xl font-mono text-nd-gray">${pendingIncome.toLocaleString()}</div>
                        </div>
                        <div>
                            <div className="text-[10px] text-nd-gray uppercase tracking-widest mb-1">Hours Logged</div>
                            <div className="text-2xl font-mono">{totalHours}h</div>
                        </div>
                    </div>

                    {/* Detailed Breakdown */}
                    <div className="space-y-12">
                        {projects.map(p => {
                            const pTasks = tasks.filter(t => t.projectId === p.id);
                            if (pTasks.length === 0) return null;
                            const pTotal = pTasks.reduce((acc, t) => acc + t.charge, 0);

                            return (
                                <div key={p.id}>
                                    <div className="flex justify-between items-end mb-4 border-b border-nd-gray/50 pb-2">
                                        <div>
                                            <h3 className="font-bold text-lg">{p.name}</h3>
                                            <p className="text-xs text-nd-gray uppercase">{p.client} • {p.status}</p>
                                        </div>
                                        <div className="font-mono font-bold">${pTotal.toLocaleString()}</div>
                                    </div>
                                    
                                    <table className="w-full text-xs font-mono text-left">
                                        <thead className="text-nd-gray uppercase border-b border-nd-gray/20">
                                            <tr>
                                                <th className="py-2 w-1/2">Task</th>
                                                <th className="py-2 text-right">Date</th>
                                                <th className="py-2 text-right">Hrs</th>
                                                <th className="py-2 text-right">Rate</th>
                                                <th className="py-2 text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-nd-gray/10">
                                            {pTasks.map(t => (
                                                <tr key={t.id}>
                                                    <td className="py-2 pr-4">{t.title}</td>
                                                    <td className="py-2 text-right text-nd-gray">{new Date(t.createdAt).toLocaleDateString()}</td>
                                                    <td className="py-2 text-right">{t.hours}</td>
                                                    <td className="py-2 text-right text-nd-gray">${t.rate}</td>
                                                    <td className="py-2 text-right font-bold">${t.charge}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })}
                    </div>

                    {/* Footer */}
                    <div className="mt-20 pt-8 border-t border-nd-gray/30 flex justify-between items-end text-[10px] text-nd-gray font-mono">
                        <div>
                            <p>CONFIDENTIAL DOCUMENT</p>
                            <p>AUTHORIZED PERSONNEL ONLY</p>
                        </div>
                        <div className="text-right">
                            <p>END OF REPORT</p>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};