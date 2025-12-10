import React, { useState, useEffect, useRef } from 'react';
import { db, auth } from '../services/firebase';
import { ref, onValue, push, set, remove, update } from 'firebase/database';
import { Plus, Trash2, Search, Book, Clock, Archive, PenTool, MoreHorizontal, ChevronRight, Save, ChevronLeft, FileText, X, BrainCircuit, Wand2, Sparkles } from 'lucide-react';
import { useOS } from '../context/OSContext';
import { FileNode } from '../types';
import { GoogleGenAI } from "@google/genai";

// --- Types ---
interface Note {
  id: string;
  title: string;
  content: string;
  folderId: string;
  updatedAt: number;
  createdAt: number;
}

interface Folder {
  id: string;
  name: string;
  icon: React.ElementType;
}

const FOLDERS: Folder[] = [
  { id: 'inbox', name: 'Inbox', icon: PenTool },
  { id: 'journal', name: 'Journal', icon: Book },
  { id: 'archive', name: 'Archive', icon: Archive },
];

// --- Components ---

export const NotesApp: React.FC<{ fileId?: string }> = ({ fileId }) => {
  const { authStatus, addLog, fs, updateFile } = useOS();
  
  // State
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string>('inbox');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // AI State
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [showAiMenu, setShowAiMenu] = useState(false);
  
  // File Mode State
  const [fileNode, setFileNode] = useState<FileNode | null>(null);
  const [fileContent, setFileContent] = useState('');
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // --- Logic for File Mode ---
  useEffect(() => {
      if (fileId) {
          const file = fs.find(f => f.id === fileId);
          if (file) {
              setFileNode(file);
              setFileContent(file.content || '');
          }
      }
  }, [fileId, fs]);

  // --- Data Logic (Hybrid Firebase + LocalStorage) ---
  useEffect(() => {
    // Only load notes if NOT in file mode
    if (!fileId) {
        if (authStatus === 'connected' && auth.currentUser) {
          const notesRef = ref(db, `users/${auth.currentUser.uid}/notes`);
          const unsubscribe = onValue(notesRef, (snapshot) => {
            const data = snapshot.val();
            if (data) {
              const notesList = Object.entries(data).map(([id, val]: [string, any]) => ({
                id,
                ...val,
              }));
              setNotes(notesList);
            } else {
              setNotes([]);
            }
          });
          return () => unsubscribe();
        } else {
          const localNotes = localStorage.getItem('nd_os_notes');
          if (localNotes) setNotes(JSON.parse(localNotes));
        }
    }
  }, [authStatus, fileId]);

  // --- File Save ---
  const saveFile = (content: string) => {
      setFileContent(content);
      setIsSaving(true);
      
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
          if (fileId) {
              updateFile(fileId, { content, size: content.length, updatedAt: Date.now() });
              addLog({ source: 'Text Editor', message: 'File saved', type: 'success', isCloud: false });
              setIsSaving(false);
          }
      }, 1000);
  };

  // --- Note Save ---
  const saveNote = async (note: Note) => {
    setIsSaving(true);
    const updatedNote = { ...note, updatedAt: Date.now() };

    setNotes(prev => prev.map(n => n.id === note.id ? updatedNote : n));

    const isCloud = authStatus === 'connected' && !!auth.currentUser;
    if (isCloud && auth.currentUser) {
      await update(ref(db, `users/${auth.currentUser.uid}/notes/${note.id}`), updatedNote);
    } else {
      const allNotes = notes.map(n => n.id === note.id ? updatedNote : n);
      localStorage.setItem('nd_os_notes', JSON.stringify(allNotes));
    }
    
    clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
        addLog({ source: 'Notes', message: `Synced: "${note.title || 'Untitled'}"`, type: 'success', isCloud });
        setIsSaving(false);
    }, 1500);
  };

  const createNote = () => {
    const newNote: Note = {
      id: `note_${Date.now()}`,
      title: '',
      content: '',
      folderId: selectedFolderId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const isCloud = authStatus === 'connected' && !!auth.currentUser;
    if (isCloud && auth.currentUser) {
      set(ref(db, `users/${auth.currentUser.uid}/notes/${newNote.id}`), newNote);
    } else {
      const newNotes = [newNote, ...notes];
      setNotes(newNotes);
      localStorage.setItem('nd_os_notes', JSON.stringify(newNotes));
    }
    
    addLog({ source: 'Notes', message: `Created new note`, type: 'info', isCloud });
    setSelectedNoteId(newNote.id);
  };

  const deleteNote = (noteId: string) => {
    const noteToDelete = notes.find(n => n.id === noteId);
    const isCloud = authStatus === 'connected' && !!auth.currentUser;

    if (isCloud && auth.currentUser) {
      remove(ref(db, `users/${auth.currentUser.uid}/notes/${noteId}`));
    } else {
      const newNotes = notes.filter(n => n.id !== noteId);
      setNotes(newNotes);
      localStorage.setItem('nd_os_notes', JSON.stringify(newNotes));
    }
    
    addLog({ source: 'Notes', message: `Deleted: "${noteToDelete?.title || 'Untitled'}"`, type: 'warning', isCloud });
    if (selectedNoteId === noteId) setSelectedNoteId(null);
  };

  // --- AI Actions ---
  const handleAiAction = async (action: 'summarize' | 'grammar' | 'continue' | 'tone') => {
      const activeNote = notes.find(n => n.id === selectedNoteId);
      if (!activeNote && !fileId) return;
      
      const contentToProcess = fileId ? fileContent : activeNote?.content;
      if (!contentToProcess) return;

      const apiKey = localStorage.getItem('nd_os_api_key') || process.env.API_KEY;
      if (!apiKey) {
          addLog({ source: 'AI', message: 'API Key Missing', type: 'error', isCloud: false });
          return;
      }

      setIsAiProcessing(true);
      setShowAiMenu(false);

      try {
          const ai = new GoogleGenAI({ apiKey });
          let prompt = '';
          
          switch(action) {
              case 'summarize': prompt = `Summarize the following text in 3 bullet points:\n\n${contentToProcess}`; break;
              case 'grammar': prompt = `Fix grammar and spelling in the following text. Return ONLY the corrected text:\n\n${contentToProcess}`; break;
              case 'continue': prompt = `Continue writing this text logically for one more paragraph:\n\n${contentToProcess}`; break;
              case 'tone': prompt = `Rewrite the following text to sound more professional and concise:\n\n${contentToProcess}`; break;
          }

          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt
          });

          const result = response.text || '';

          if (action === 'summarize') {
              const newContent = `${contentToProcess}\n\n## Summary\n${result}`;
              if (fileId) saveFile(newContent);
              else if (activeNote) saveNote({ ...activeNote, content: newContent });
          } else if (action === 'continue') {
              const newContent = `${contentToProcess}\n${result}`;
              if (fileId) saveFile(newContent);
              else if (activeNote) saveNote({ ...activeNote, content: newContent });
          } else {
              // Replace content for grammar/tone
              if (fileId) saveFile(result);
              else if (activeNote) saveNote({ ...activeNote, content: result });
          }
          
          addLog({ source: 'AI', message: 'Neural Edit Complete', type: 'success', isCloud: true });

      } catch (e) {
          console.error(e);
          addLog({ source: 'AI', message: 'Processing Failed', type: 'error', isCloud: false });
      } finally {
          setIsAiProcessing(false);
      }
  };

  // --- FILE MODE RENDER ---
  if (fileId && fileNode) {
      return (
          <div className="flex flex-col h-full bg-nd-black text-nd-white font-sans">
              <div className="h-[50px] border-b border-nd-gray flex items-center justify-between px-4 bg-nd-black z-10 shrink-0">
                  <div className="flex items-center gap-2 text-sm font-mono">
                      <FileText size={16} className="text-nd-gray" />
                      <span className="font-bold">{fileNode.name}</span>
                      <span className="text-nd-gray text-xs ml-2 opacity-50">{Math.round(fileNode.size / 1024)} KB</span>
                  </div>
                  <div className="flex items-center gap-2">
                      <div className="relative">
                          <button 
                              onClick={() => setShowAiMenu(!showAiMenu)}
                              disabled={isAiProcessing}
                              className="flex items-center gap-2 px-3 py-1.5 border border-nd-gray rounded text-xs font-bold hover:bg-nd-gray/20 transition-colors disabled:opacity-50"
                          >
                              {isAiProcessing ? <Sparkles size={14} className="animate-spin text-nd-red"/> : <BrainCircuit size={14} className="text-nd-red"/>}
                              <span className="hidden md:inline">AI ACTIONS</span>
                          </button>
                          
                          {showAiMenu && (
                              <div className="absolute top-full right-0 mt-2 w-48 bg-nd-black border border-nd-gray rounded-lg shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                                  <button onClick={() => handleAiAction('grammar')} className="w-full text-left px-4 py-2 text-xs hover:bg-nd-white hover:text-nd-black flex items-center gap-2"><Wand2 size={12}/> Fix Grammar</button>
                                  <button onClick={() => handleAiAction('tone')} className="w-full text-left px-4 py-2 text-xs hover:bg-nd-white hover:text-nd-black flex items-center gap-2"><PenTool size={12}/> Make Professional</button>
                                  <button onClick={() => handleAiAction('summarize')} className="w-full text-left px-4 py-2 text-xs hover:bg-nd-white hover:text-nd-black flex items-center gap-2"><FileText size={12}/> Summarize</button>
                                  <button onClick={() => handleAiAction('continue')} className="w-full text-left px-4 py-2 text-xs hover:bg-nd-white hover:text-nd-black flex items-center gap-2"><ChevronRight size={12}/> Continue Writing</button>
                              </div>
                          )}
                      </div>
                      
                      {isSaving && (
                          <div className="flex items-center gap-1 text-xs text-nd-gray font-mono animate-pulse mr-2">
                              <Save size={12} />
                              <span className="hidden md:inline">SAVING...</span>
                          </div>
                      )}
                  </div>
              </div>
              <textarea
                  value={fileContent}
                  onChange={(e) => saveFile(e.target.value)}
                  className="flex-1 bg-transparent resize-none outline-none text-sm md:text-base p-6 font-mono text-nd-white/90 leading-relaxed placeholder-nd-gray/30"
                  spellCheck={false}
                  placeholder="Type content here..."
              />
          </div>
      );
  }

  // --- STANDARD NOTEBOOK MODE RENDER ---

  const activeNote = notes.find(n => n.id === selectedNoteId);
  const filteredNotes = notes
    .filter(n => n.folderId === selectedFolderId)
    .filter(n => n.title.toLowerCase().includes(searchQuery.toLowerCase()) || n.content.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="flex h-full bg-nd-black text-nd-white font-sans divide-x divide-nd-gray overflow-hidden relative">
      
      {/* 1. Sidebar (Folders) */}
      <div className={`w-[60px] md:w-[200px] flex-shrink-0 bg-nd-black flex-col ${activeNote ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-4 border-b border-nd-gray h-[50px] flex items-center justify-center md:justify-start">
           <span className="font-mono text-xs text-nd-gray hidden md:inline-block">LIBRARY</span>
           <Book size={16} className="md:hidden text-nd-gray" />
        </div>
        <div className="flex-1 py-4 flex flex-col gap-1">
          {FOLDERS.map(folder => (
            <button
              key={folder.id}
              onClick={() => setSelectedFolderId(folder.id)}
              className={`flex items-center gap-3 px-0 justify-center md:justify-start md:px-4 py-3 mx-2 transition-all duration-200 border border-transparent ${
                selectedFolderId === folder.id 
                  ? 'bg-nd-white text-nd-black border-nd-white' 
                  : 'text-nd-gray hover:text-nd-white hover:bg-nd-gray/10'
              }`}
            >
              <folder.icon size={18} />
              <span className="hidden md:inline font-medium text-sm">{folder.name}</span>
              {selectedFolderId === folder.id && (
                <div className="ml-auto w-1 h-1 bg-nd-red rounded-full hidden md:block" />
              )}
            </button>
          ))}
        </div>
        <div className="p-4 mt-auto border-t border-nd-gray flex justify-center md:justify-start">
          <div className="flex items-center gap-2 text-[10px] font-mono text-nd-gray">
            <div className={`w-2 h-2 rounded-full ${authStatus === 'connected' ? 'bg-green-500' : 'bg-nd-red'}`}></div>
            <span className="hidden md:inline">{authStatus === 'connected' ? 'SYNC' : 'LOCAL'}</span>
          </div>
        </div>
      </div>

      {/* 2. Note List */}
      <div className={`flex-1 md:w-[300px] md:flex-none flex flex-col bg-nd-black ${activeNote ? 'hidden md:flex' : 'flex'}`}>
        <div className="h-[50px] border-b border-nd-gray flex items-center px-3 gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-nd-gray" />
            <input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="w-full bg-nd-gray/10 border border-transparent focus:border-nd-gray text-xs pl-8 pr-2 py-1.5 text-nd-white outline-none font-mono"
            />
          </div>
          <button 
            onClick={createNote}
            className="p-1.5 border border-nd-white text-nd-black bg-nd-white hover:bg-transparent hover:text-nd-white transition-colors"
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {filteredNotes.length === 0 ? (
            <div className="p-8 text-center opacity-30">
              <p className="font-mono text-xs">NO DATA</p>
            </div>
          ) : (
            filteredNotes.map(note => (
              <div 
                key={note.id}
                onClick={() => setSelectedNoteId(note.id)}
                className={`group px-4 py-4 border-b border-nd-gray cursor-pointer transition-all duration-200 ${
                  selectedNoteId === note.id 
                    ? 'bg-nd-white text-nd-black' 
                    : 'hover:bg-nd-gray/10 text-nd-gray hover:text-nd-white'
                }`}
              >
                <div className="flex justify-between items-start mb-1">
                  <h3 className={`font-medium text-sm truncate pr-2 ${!note.title ? 'italic opacity-50' : ''}`}>
                    {note.title || 'Untitled Note'}
                  </h3>
                  {selectedNoteId === note.id && (
                     <ChevronRight size={14} />
                  )}
                </div>
                <div className="flex items-center gap-2 text-[10px] opacity-60 font-mono">
                  <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
                  <span className="hidden md:inline">•</span>
                  <span className="hidden md:inline">{new Date(note.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <p className="text-xs mt-2 line-clamp-2 opacity-70 font-mono leading-relaxed">
                  {note.content || 'No text...'}
                </p>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. Editor (Overlay on Mobile) */}
      <div className={`flex-1 flex-col bg-nd-black ${activeNote ? 'flex absolute inset-0 z-20 md:static' : 'hidden md:flex'}`}>
        {activeNote ? (
          <>
            {/* Editor Toolbar */}
            <div className="h-[50px] border-b border-nd-gray flex items-center justify-between px-4 md:px-6 bg-nd-black z-10">
              {/* Mobile Back Button */}
              <button 
                  onClick={() => setSelectedNoteId(null)}
                  className="md:hidden flex items-center gap-2 text-xs font-mono text-nd-gray mr-4"
              >
                  <ChevronLeft size={14} /> BACK
              </button>

              <div className="flex-1 flex items-center gap-4 text-xs font-mono text-nd-gray overflow-hidden">
                <div className="flex items-center gap-1 min-w-0">
                  <Clock size={12} className="flex-shrink-0" />
                  <span className="truncate">{new Date(activeNote.updatedAt).toLocaleString()}</span>
                </div>
                <div className="hidden md:block w-px h-3 bg-nd-gray" />
                <span className="hidden md:inline">{activeNote.content.split(/\s+/).filter(w => w.length > 0).length} words</span>
              </div>
              
              <div className="flex items-center gap-2 flex-shrink-0">
                 {/* AI Button */}
                 <div className="relative">
                      <button 
                          onClick={() => setShowAiMenu(!showAiMenu)}
                          disabled={isAiProcessing}
                          className="flex items-center gap-2 px-3 py-1.5 border border-nd-gray rounded text-xs font-bold hover:bg-nd-gray/20 transition-colors disabled:opacity-50 text-nd-white"
                      >
                          {isAiProcessing ? <Sparkles size={14} className="animate-spin text-nd-red"/> : <BrainCircuit size={14} className="text-nd-red"/>}
                          <span className="hidden md:inline">NEURAL EDIT</span>
                      </button>
                      
                      {showAiMenu && (
                          <div className="absolute top-full right-0 mt-2 w-48 bg-nd-black border border-nd-gray rounded-lg shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
                              <button onClick={() => handleAiAction('grammar')} className="w-full text-left px-4 py-2 text-xs hover:bg-nd-white hover:text-nd-black flex items-center gap-2"><Wand2 size={12}/> Fix Grammar</button>
                              <button onClick={() => handleAiAction('tone')} className="w-full text-left px-4 py-2 text-xs hover:bg-nd-white hover:text-nd-black flex items-center gap-2"><PenTool size={12}/> Professional Tone</button>
                              <button onClick={() => handleAiAction('summarize')} className="w-full text-left px-4 py-2 text-xs hover:bg-nd-white hover:text-nd-black flex items-center gap-2"><FileText size={12}/> Summarize</button>
                              <button onClick={() => handleAiAction('continue')} className="w-full text-left px-4 py-2 text-xs hover:bg-nd-white hover:text-nd-black flex items-center gap-2"><ChevronRight size={12}/> Continue Writing</button>
                          </div>
                      )}
                 </div>

                 <div className="w-px h-4 bg-nd-gray mx-1"></div>

                 {isSaving && (
                   <div className="flex items-center gap-1 text-xs text-nd-gray font-mono animate-pulse mr-2">
                     <Save size={12} />
                     <span className="hidden md:inline">SAVING</span>
                   </div>
                 )}
                 <button 
                  onClick={() => deleteNote(activeNote.id)}
                  className="p-2 text-nd-gray hover:text-nd-red hover:bg-nd-red/10 transition-colors"
                 >
                   <Trash2 size={16} />
                 </button>
              </div>
            </div>

            {/* Writing Area */}
            <div className="flex-1 overflow-y-auto p-6 md:p-12">
              <div className="max-w-3xl mx-auto flex flex-col gap-6 h-full">
                <input
                  value={activeNote.title}
                  onChange={(e) => saveNote({ ...activeNote, title: e.target.value })}
                  placeholder="Note Title"
                  className="bg-transparent text-2xl md:text-4xl font-bold text-nd-white placeholder-nd-gray/30 outline-none w-full border-none p-0 tracking-tight"
                />
                <textarea
                  value={activeNote.content}
                  onChange={(e) => saveNote({ ...activeNote, content: e.target.value })}
                  placeholder="Start typing..."
                  className="flex-1 bg-transparent resize-none outline-none text-sm md:text-base leading-loose font-mono text-nd-white/90 placeholder-nd-gray/30 min-h-[500px]"
                  spellCheck={false}
                />
              </div>
            </div>
            
            {/* Status Bar */}
            <div className="absolute bottom-0 inset-x-0 h-1 bg-nd-gray/20">
               <div className="h-full bg-nd-white transition-all duration-300" style={{ width: `${Math.min(100, (activeNote.content.length / 1000) * 100)}%` }} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-nd-gray">
             <div className="w-16 h-16 border border-nd-gray flex items-center justify-center mb-4 rounded-full opacity-20">
                <PenTool size={24} />
             </div>
             <p className="font-mono text-sm tracking-widest">SELECT NOTE</p>
          </div>
        )}
      </div>

    </div>
  );
};