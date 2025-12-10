import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type, FunctionDeclaration, Chat, Part } from "@google/genai";
import { Send, Cpu, Terminal, Loader2, User, ChevronRight, Plus, MessageSquare, Trash2, Menu, X, History, Paperclip, File as FileIcon, Copy } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { db, auth } from '../services/firebase';
import { ref, push, set, get, update, remove, onValue } from 'firebase/database';
import { AppID } from '../types';

// --- Types ---

interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  isToolOutput?: boolean;
}

interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
}

interface Attachment {
  name: string;
  mimeType: string;
  data: string; // Base64
}

// --- Tools Definition ---

const TOOLS: FunctionDeclaration[] = [
  {
    name: 'control_os',
    description: 'Control the operating system windows (open, close, minimize apps).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ['open', 'close', 'minimize'] },
        appId: { type: Type.STRING, enum: Object.values(AppID) },
      },
      required: ['action', 'appId'],
    },
  },
  {
    name: 'manage_tasks',
    description: 'Create, list, or update tasks. Use "list" to see tasks. Use "create" to add new ones.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ['create', 'list', 'complete', 'delete'] },
        title: { type: Type.STRING, description: 'Required for create' },
        priority: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
        taskId: { type: Type.STRING, description: 'Required for complete/delete' },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_notes',
    description: 'Read or create notes.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ['create', 'read_all'] },
        title: { type: Type.STRING },
        content: { type: Type.STRING },
      },
      required: ['action'],
    },
  },
  {
    name: 'manage_habits',
    description: 'Track habits. Log completion or list habits.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: { type: Type.STRING, enum: ['log', 'list', 'create'] },
        habitName: { type: Type.STRING },
        habitId: { type: Type.STRING },
      },
      required: ['action'],
    },
  }
];

// --- Simple Markdown Formatter ---
const MessageContent: React.FC<{ content: string }> = ({ content }) => {
    // 1. Split Code Blocks
    const parts = content.split(/(```[\s\S]*?```)/g);
    
    return (
        <div className="space-y-2">
            {parts.map((part, i) => {
                // Code Block
                if (part.startsWith('```') && part.endsWith('```')) {
                    const codeContent = part.slice(3, -3).replace(/^.*\n/, ''); // remove language line if present
                    return (
                        <div key={i} className="bg-nd-gray/20 rounded-md border border-nd-gray/50 overflow-hidden my-2">
                            <div className="flex justify-between items-center px-3 py-1 bg-nd-black/50 border-b border-nd-gray/30 text-[10px] text-nd-gray">
                                <span className="font-mono">CODE</span>
                                <button onClick={() => navigator.clipboard.writeText(codeContent)} className="hover:text-nd-white flex items-center gap-1">
                                    <Copy size={10} /> COPY
                                </button>
                            </div>
                            <pre className="p-3 text-xs font-mono overflow-x-auto text-nd-white/90">
                                {codeContent}
                            </pre>
                        </div>
                    );
                }
                
                // Regular Text with basic formatting
                // Handling bold (**text**) and lists (- item) via simple replacements/splitting would be complex in one pass.
                // For simplicity/performance in this OS, we map newlines to paragraphs and simple bolding.
                return (
                    <div key={i} className="whitespace-pre-wrap leading-relaxed">
                        {part.split('\n').map((line, j) => {
                            // Simple List Handling
                            if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
                                return <div key={j} className="pl-4 flex"><span className="mr-2">•</span>{line.trim().substring(2)}</div>
                            }
                            // Simple Bold Handling
                            const boldParts = line.split(/(\*\*.*?\*\*)/g);
                            return (
                                <div key={j} className={line.trim() === '' ? 'h-2' : ''}>
                                    {boldParts.map((bp, k) => (
                                        bp.startsWith('**') && bp.endsWith('**') 
                                            ? <strong key={k} className="text-nd-white font-bold">{bp.slice(2, -2)}</strong> 
                                            : bp
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
};

export const AiChatApp: React.FC = () => {
  const { addLog, launchApp, closeApp, minimizeApp, authStatus } = useOS();
  
  // Session State
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showSidebar, setShowSidebar] = useState(true);

  // Chat State
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const chatSessionRef = useRef<Chat | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Initialization & Sync ---

  // 1. Load Session List
  useEffect(() => {
    if (authStatus === 'connected' && auth.currentUser) {
        const sessionsRef = ref(db, `users/${auth.currentUser.uid}/ai_chats/sessions`);
        const unsub = onValue(sessionsRef, (snap) => {
            const data = snap.val();
            const list = data ? Object.values(data) as ChatSession[] : [];
            setSessions(list.sort((a, b) => b.updatedAt - a.updatedAt));
        });
        return () => unsub();
    } else {
        const local = localStorage.getItem('nd_os_chat_sessions');
        if (local) setSessions(JSON.parse(local).sort((a: any, b: any) => b.updatedAt - a.updatedAt));
    }
  }, [authStatus]);

  // 2. Load Messages for Current Session
  useEffect(() => {
      if (!currentSessionId) {
          setMessages([{ id: 'init', role: 'model', content: 'Neural Link Online. Select a chat or start a new one.' }]);
          return;
      }

      if (authStatus === 'connected' && auth.currentUser) {
          const msgsRef = ref(db, `users/${auth.currentUser.uid}/ai_chats/messages/${currentSessionId}`);
          get(msgsRef).then(snap => {
              const data = snap.val();
              if (data) setMessages(data);
              else setMessages([{ id: 'init', role: 'model', content: 'Neural Link Online. Ready.' }]);
          });
      } else {
          const local = localStorage.getItem(`nd_os_chat_msgs_${currentSessionId}`);
          if (local) setMessages(JSON.parse(local));
          else setMessages([{ id: 'init', role: 'model', content: 'Neural Link Online. Ready.' }]);
      }
      
      // Reset Chat Instance
      chatSessionRef.current = null;
      setAttachment(null);
      setInput('');
  }, [currentSessionId, authStatus]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, activeTool, isProcessing]);

  // --- Session Management ---

  const createNewChat = () => {
      const newId = `chat_${Date.now()}`;
      const newSession: ChatSession = {
          id: newId,
          title: 'New Conversation',
          updatedAt: Date.now()
      };

      // Save Session Metadata
      if (authStatus === 'connected' && auth.currentUser) {
          set(ref(db, `users/${auth.currentUser.uid}/ai_chats/sessions/${newId}`), newSession);
      } else {
          const updatedSessions = [newSession, ...sessions];
          setSessions(updatedSessions);
          localStorage.setItem('nd_os_chat_sessions', JSON.stringify(updatedSessions));
      }

      setCurrentSessionId(newId);
      if (window.innerWidth < 768) setShowSidebar(false);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm('Delete this conversation?')) return;

      if (authStatus === 'connected' && auth.currentUser) {
          remove(ref(db, `users/${auth.currentUser.uid}/ai_chats/sessions/${id}`));
          remove(ref(db, `users/${auth.currentUser.uid}/ai_chats/messages/${id}`));
      } else {
          const updated = sessions.filter(s => s.id !== id);
          setSessions(updated);
          localStorage.setItem('nd_os_chat_sessions', JSON.stringify(updated));
          localStorage.removeItem(`nd_os_chat_msgs_${id}`);
      }

      if (currentSessionId === id) setCurrentSessionId(null);
  };

  const saveMessages = (msgs: Message[]) => {
      setMessages(msgs);
      if (!currentSessionId) return;

      if (authStatus === 'connected' && auth.currentUser) {
          set(ref(db, `users/${auth.currentUser.uid}/ai_chats/messages/${currentSessionId}`), msgs);
          update(ref(db, `users/${auth.currentUser.uid}/ai_chats/sessions/${currentSessionId}`), { updatedAt: Date.now() });
      } else {
          localStorage.setItem(`nd_os_chat_msgs_${currentSessionId}`, JSON.stringify(msgs));
          // Update timestamp in session list
          const updatedSessions = sessions.map(s => s.id === currentSessionId ? { ...s, updatedAt: Date.now() } : s);
          // Re-sort
          updatedSessions.sort((a,b) => b.updatedAt - a.updatedAt);
          setSessions(updatedSessions);
          localStorage.setItem('nd_os_chat_sessions', JSON.stringify(updatedSessions));
      }
  };

  const updateSessionTitle = (id: string, title: string) => {
      if (authStatus === 'connected' && auth.currentUser) {
          update(ref(db, `users/${auth.currentUser.uid}/ai_chats/sessions/${id}`), { title });
      } else {
          const updated = sessions.map(s => s.id === id ? { ...s, title } : s);
          setSessions(updated);
          localStorage.setItem('nd_os_chat_sessions', JSON.stringify(updated));
      }
  };

  // --- Tool Execution Logic ---

  const executeTool = async (name: string, args: any): Promise<string> => {
    setActiveTool(name);
    const userId = auth.currentUser?.uid;
    
    if (!userId && name !== 'control_os') {
      return "Error: User not authenticated. Cannot access database.";
    }

    try {
      switch (name) {
        case 'control_os':
          if (args.action === 'open') launchApp(args.appId as AppID);
          if (args.action === 'close') closeApp(args.appId as AppID);
          if (args.action === 'minimize') minimizeApp(args.appId as AppID);
          return `OS Command Executed: ${args.action} ${args.appId}`;

        case 'manage_tasks':
          const tasksRef = ref(db, `users/${userId}/tasks`);
          if (args.action === 'create') {
            const newRef = push(tasksRef);
            await set(newRef, {
              id: newRef.key,
              title: args.title || 'Untitled Task',
              priority: args.priority || 'medium',
              completed: false,
              createdAt: Date.now()
            });
            addLog({ source: 'AI', message: `Task created: ${args.title}`, type: 'success', isCloud: true });
            return `Task created with ID ${newRef.key}`;
          }
          if (args.action === 'list') {
            const snapshot = await get(tasksRef);
            const tasks = snapshot.val() ? Object.values(snapshot.val()) : [];
            const summary = tasks.map((t: any) => `- [${t.completed ? 'x' : ' '}] ${t.title} (${t.priority}, ID: ${t.id})`).join('\n');
            return summary || "No tasks found.";
          }
          if (args.action === 'complete') {
             await update(ref(db, `users/${userId}/tasks/${args.taskId}`), { completed: true });
             return "Task marked as complete.";
          }
          break;

        case 'manage_notes':
           const notesRef = ref(db, `users/${userId}/notes`);
           if (args.action === 'create') {
              const newRef = push(notesRef);
              await set(newRef, {
                  id: newRef.key,
                  title: args.title,
                  content: args.content || '',
                  folderId: 'inbox',
                  updatedAt: Date.now(),
                  createdAt: Date.now()
              });
              return "Note created.";
           }
           if (args.action === 'read_all') {
              const snap = await get(notesRef);
              const notes = snap.val() ? Object.values(snap.val()) : [];
              return JSON.stringify(notes.map((n: any) => ({ title: n.title, content: n.content })));
           }
           break;
           
        case 'manage_habits':
            const habitsRef = ref(db, `users/${userId}/habits`);
            if (args.action === 'list') {
                const snap = await get(habitsRef);
                const habits = snap.val() ? Object.values(snap.val()) : [];
                return JSON.stringify(habits);
            }
            if (args.action === 'create') {
                const newRef = push(habitsRef);
                await set(newRef, {
                    id: newRef.key,
                    title: args.habitName,
                    category: 'personal',
                    createdAt: Date.now()
                });
                return "Habit created.";
            }
            break;
      }
      return "Tool executed successfully.";
    } catch (error) {
      console.error(error);
      return `Error executing tool: ${error}`;
    } finally {
      setActiveTool(null);
    }
    return "Unknown tool";
  };

  // --- Attachment Logic ---

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0];
          const reader = new FileReader();
          reader.onload = (event) => {
              const base64String = (event.target?.result as string).split(',')[1];
              setAttachment({
                  name: file.name,
                  mimeType: file.type,
                  data: base64String
              });
          };
          reader.readAsDataURL(file);
      }
  };

  const removeAttachment = () => {
      setAttachment(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- Chat Logic ---

  const sendMessage = async () => {
    if ((!input.trim() && !attachment) || isProcessing) return;
    
    if (!currentSessionId) {
        createNewChat();
    }

    const userMsg = input;
    const currentAttachment = attachment;
    
    setInput('');
    setAttachment(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Optimistic UI Update
    const displayContent = currentAttachment 
        ? `[File: ${currentAttachment.name}]\n${userMsg}` 
        : userMsg;
        
    const newMessages = [...messages, { 
        id: Date.now().toString(), 
        role: 'user' as const, 
        content: displayContent
    }];
    saveMessages(newMessages);
    
    setIsProcessing(true);

    try {
      const apiKey = localStorage.getItem('nd_os_api_key') || process.env.API_KEY;
      if (!apiKey) throw new Error("Missing API Key");

      // Initialize Chat
      if (!chatSessionRef.current) {
        const ai = new GoogleGenAI({ apiKey });
        chatSessionRef.current = ai.chats.create({
          model: 'gemini-2.5-flash',
          history: messages.filter(m => m.role !== 'system').map(m => ({
              role: m.role,
              parts: [{ text: m.content }]
          })),
          config: {
            systemInstruction: "You are the Second Brain OS AI Kernel. You are succinct, robotic, and efficient. You can see images and files. Use markdown for code and lists. Use tools freely to fulfill user requests.",
            tools: [{ functionDeclarations: TOOLS }]
          }
        });
      }

      // Construct Message Payload
      let messagePayload: string | Array<string | Part> = userMsg;
      
      if (currentAttachment) {
          messagePayload = [
              { text: userMsg || "Analyze this file." },
              { inlineData: { mimeType: currentAttachment.mimeType, data: currentAttachment.data } }
          ];
      }

      // First Turn
      let response = await chatSessionRef.current.sendMessage({ message: messagePayload });
      
      // Handle Function Calls
      while (response.functionCalls && response.functionCalls.length > 0) {
        const responseParts: Part[] = [];
        for (const call of response.functionCalls) {
            const result = await executeTool(call.name, call.args);
            responseParts.push({
                functionResponse: {
                    id: call.id,
                    name: call.name,
                    response: { result: result } 
                }
            });
            const toolLogMsg = { 
                id: Date.now().toString() + Math.random(), 
                role: 'system' as const, 
                content: `> Executed ${call.name}`,
                isToolOutput: true
            };
            setMessages(prev => [...prev, toolLogMsg]);
        }
        response = await chatSessionRef.current.sendMessage({ message: responseParts });
      }

      // Final Text Response
      if (response.text) {
          const aiMsg = { id: Date.now().toString(), role: 'model' as const, content: response.text };
          const finalMessages = [...newMessages, aiMsg];
          saveMessages(finalMessages);

          // Auto-Title Generation
          const session = sessions.find(s => s.id === currentSessionId);
          if (session && session.title === 'New Conversation' && messages.length <= 2) {
              const title = userMsg.length > 30 ? userMsg.substring(0, 30) + '...' : (userMsg || "File Analysis");
              updateSessionTitle(currentSessionId!, title);
          }
      }

    } catch (e: any) {
      console.error(e);
      const errorMsg = { id: Date.now().toString(), role: 'model' as const, content: `KERNEL ERROR: ${e.message || 'Connection severed.'}` };
      saveMessages([...newMessages, errorMsg]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
      }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      e.target.style.height = 'auto';
      e.target.style.height = e.target.scrollHeight + 'px';
  };

  return (
    <div className="flex h-full bg-nd-black text-nd-white font-mono text-sm relative overflow-hidden">
      
      {/* Sidebar (History) */}
      <div className={`
          absolute inset-y-0 left-0 z-20 w-64 bg-nd-black border-r border-nd-gray transform transition-transform duration-300 flex flex-col shadow-2xl md:shadow-none
          ${showSidebar ? 'translate-x-0' : '-translate-x-full'}
          md:relative md:translate-x-0 md:w-64 md:flex-shrink-0
      `}>
          <div className="p-4 border-b border-nd-gray flex items-center justify-between h-[60px]">
              <span className="font-bold text-xs uppercase tracking-widest flex items-center gap-2">
                  <History size={14} /> History
              </span>
              <button onClick={() => setShowSidebar(false)} className="md:hidden"><X size={16}/></button>
          </div>
          
          <div className="p-4">
              <button 
                onClick={createNewChat}
                className="w-full flex items-center justify-center gap-2 border border-nd-white text-nd-black bg-nd-white py-2 rounded text-xs font-bold uppercase hover:bg-white/90"
              >
                  <Plus size={14} /> New Chat
              </button>
          </div>

          <div className="flex-1 overflow-y-auto px-2 space-y-1">
              {sessions.map(s => (
                  <div 
                    key={s.id}
                    onClick={() => { setCurrentSessionId(s.id); if(window.innerWidth < 768) setShowSidebar(false); }}
                    className={`group flex items-center justify-between p-3 rounded cursor-pointer transition-colors ${currentSessionId === s.id ? 'bg-nd-gray/20 border border-nd-gray' : 'hover:bg-nd-gray/10 border border-transparent'}`}
                  >
                      <div className="flex items-center gap-3 overflow-hidden">
                          <MessageSquare size={14} className={currentSessionId === s.id ? "text-nd-white" : "text-nd-gray"} />
                          <div className="flex flex-col overflow-hidden">
                              <span className="truncate text-xs font-medium">{s.title}</span>
                              <span className="text-[10px] text-nd-gray truncate">{new Date(s.updatedAt).toLocaleDateString()}</span>
                          </div>
                      </div>
                      <button 
                        onClick={(e) => deleteSession(s.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 hover:text-nd-red transition-opacity"
                      >
                          <Trash2 size={12} />
                      </button>
                  </div>
              ))}
          </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0 relative bg-nd-black/50 backdrop-blur-sm">
          
          {/* Mobile Header Overlay */}
          <div className="md:hidden absolute top-4 left-4 z-10">
              <button onClick={() => setShowSidebar(true)} className="p-2 bg-nd-black border border-nd-gray rounded shadow-lg">
                  <Menu size={16} />
              </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth pb-20">
            {messages.length === 0 && !currentSessionId && (
                <div className="flex flex-col items-center justify-center h-full text-nd-gray opacity-50 gap-4">
                    <Cpu size={48} strokeWidth={1} />
                    <p>SYSTEM READY</p>
                </div>
            )}
            
            {messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex flex-col max-w-[95%] md:max-w-[85%] ${msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'}`}
              >
                {msg.role !== 'system' && (
                    <div className="flex items-center gap-2 mb-1 opacity-50 text-[10px] uppercase tracking-wider">
                        {msg.role === 'user' ? 'You' : 'Kernel'}
                    </div>
                )}

                <div 
                  className={`px-4 py-3 border relative text-sm md:text-base ${
                    msg.role === 'user' 
                      ? 'bg-nd-white text-nd-black border-nd-white rounded-tl-xl rounded-bl-xl rounded-tr-xl' 
                      : msg.role === 'system'
                      ? 'text-nd-gray border-dashed border-nd-gray/30 text-xs w-full font-mono py-1'
                      : 'text-nd-white border-nd-gray/50 bg-nd-gray/5 rounded-tr-xl rounded-br-xl rounded-tl-xl shadow-sm w-full'
                  }`}
                >
                   {msg.role === 'model' && <Cpu size={14} className="absolute -left-6 top-3 text-nd-red hidden md:block" />}
                   <MessageContent content={msg.content} />
                </div>
              </div>
            ))}
            
            {/* Active Tool Indicator */}
            {activeTool && (
                <div className="flex items-center gap-2 text-nd-red animate-pulse px-2 text-xs">
                    <Terminal size={12} />
                    <span>Running process: {activeTool}</span>
                </div>
            )}

            {isProcessing && !activeTool && (
                 <div className="flex items-center gap-2 text-nd-gray px-2 text-xs">
                     <Loader2 size={12} className="animate-spin" />
                     <span>Processing...</span>
                 </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 md:p-6 bg-nd-black border-t border-nd-gray">
            
            {/* Attachment Preview */}
            {attachment && (
                <div className="flex items-center gap-2 mb-2 p-2 bg-nd-gray/10 rounded border border-nd-gray/30 w-max animate-in fade-in slide-in-from-bottom-2">
                    <FileIcon size={14} className="text-nd-red" />
                    <span className="text-xs max-w-[200px] truncate">{attachment.name}</span>
                    <button onClick={removeAttachment} className="ml-2 hover:text-nd-red transition-colors"><X size={14}/></button>
                </div>
            )}

            <div className="relative flex items-end group max-w-4xl mx-auto bg-nd-gray/10 border border-nd-gray rounded-xl transition-all focus-within:border-nd-white">
              <div className="p-3 text-nd-red">
                 <ChevronRight size={18} />
              </div>
              
              <textarea
                ref={textareaRef}
                autoFocus
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder={currentSessionId ? "Enter system command or attach file..." : "Start a new chat..."}
                disabled={isProcessing}
                rows={1}
                className="w-full bg-transparent outline-none py-3 text-nd-white placeholder-nd-gray/50 font-mono resize-none max-h-[200px]"
              />
              
              <div className="flex items-center gap-1 p-2">
                  {/* File Upload Button */}
                  <label className="p-2 text-nd-gray hover:text-nd-white cursor-pointer hover:bg-nd-gray/20 rounded transition-colors" title="Attach File">
                      <Paperclip size={18} />
                      <input 
                          type="file" 
                          ref={fileInputRef}
                          onChange={handleFileSelect} 
                          className="hidden" 
                          disabled={isProcessing}
                      />
                  </label>

                  <button 
                    onClick={sendMessage}
                    disabled={isProcessing || (!input.trim() && !attachment)}
                    className="p-2 text-nd-gray hover:text-nd-white disabled:opacity-30 hover:bg-nd-gray/20 rounded transition-colors"
                  >
                     {isProcessing ? <Loader2 size={18} className="animate-spin"/> : <Send size={18} />}
                  </button>
              </div>
            </div>
            
            <div className="mt-2 text-[10px] text-nd-gray text-center flex justify-center gap-4 px-1 opacity-50">
               <span>MODEL: GEMINI-2.5-FLASH</span>
               <span>ACCESS: ROOT</span>
            </div>
          </div>

      </div>
    </div>
  );
};