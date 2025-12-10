import React, { useState, useEffect, useMemo } from 'react';
import { 
  Folder, FileText, Image as ImageIcon, Music, Video, 
  ChevronRight, HardDrive, Search, ArrowUp, Grid, List, 
  Archive, Trash2, File, FileArchive, CheckSquare, 
  UploadCloud, Loader2, Home, BookOpen, Filter, X,
  BrainCircuit, Sparkles
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { FileNode, FileType, AppID } from '../types';
import { GoogleGenAI } from "@google/genai";

// --- Icons & Helpers ---

const formatSize = (bytes: number) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getIcon = (type: FileType, className?: string) => {
  switch (type) {
    case 'folder': return <Folder className={className} />;
    case 'image': return <ImageIcon className={className} />;
    case 'audio': return <Music className={className} />;
    case 'video': return <Video className={className} />;
    case 'text': return <FileText className={className} />;
    case 'archive': return <FileArchive className={className} />;
    case 'pdf': return <BookOpen className={className} />;
    case 'unknown': return <File className={className} />;
    default: return <File className={className} />;
  }
};

const getFileTypeFromMime = (mime: string): FileType => {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('audio/')) return 'audio';
    if (mime.startsWith('video/')) return 'video';
    if (mime === 'application/pdf') return 'pdf';
    if (mime.includes('text') || mime.includes('json') || mime.includes('javascript')) return 'text';
    if (mime.includes('zip') || mime.includes('compressed') || mime.includes('tar')) return 'archive';
    return 'unknown';
};

// --- Component ---

interface FilesAppProps {
    initialCategory?: 'image' | 'video' | 'audio' | 'document' | 'archive';
}

export const FilesApp: React.FC<FilesAppProps> = ({ initialCategory }) => {
  const { authStatus, addLog, fs, addFile, deleteFile, updateFile, launchApp } = useOS();
  
  // Navigation State
  const [currentPath, setCurrentPath] = useState<string[]>(['root']); // Stack of folder IDs
  
  // UI State
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selection, setSelection] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  
  // AI State
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  
  // Derived State
  const currentFolderId = currentPath[currentPath.length - 1];

  // Handle Initial Category Launch
  useEffect(() => {
      if (initialCategory) {
          setActiveCategory(initialCategory);
          setCurrentPath(['root']); // Reset path but apply filter
      }
  }, [initialCategory]);
  
  // Compute Content
  const currentItems = useMemo(() => {
      let items = fs;

      // 1. Filter by Category (Global Search) OR Folder (Local)
      if (activeCategory) {
          items = items.filter(f => {
              if (activeCategory === 'document') return f.type === 'text' || f.type === 'pdf';
              if (activeCategory === 'media') return f.type === 'audio' || f.type === 'video';
              return f.type === activeCategory;
          });
      } else {
          items = items.filter(item => item.parentId === currentFolderId);
      }

      // 2. Search Query
      if (searchQuery) {
          items = items.filter(item => item.name.toLowerCase().includes(searchQuery.toLowerCase()));
      }

      // 3. Sort
      return items.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        return b.createdAt - a.createdAt;
      });
  }, [fs, currentFolderId, activeCategory, searchQuery]);

  const breadcrumbs = currentPath.map(id => {
      if (id === 'root') return { id: 'root', name: 'Home' };
      const node = fs.find(n => n.id === id);
      return node ? { id: node.id, name: node.name } : { id, name: 'Unknown' };
  });

  // --- File Operations ---

  const createFolder = () => {
      if (activeCategory) return; // Cannot create folders in category view
      const name = prompt("Folder Name:", "New Folder");
      if (!name) return;
      
      const newFolder: FileNode = {
          id: `f_${Date.now()}`,
          parentId: currentFolderId,
          name,
          type: 'folder',
          size: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
      };

      addFile(newFolder);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      setIsUploading(true);
      
      for (let i = 0; i < files.length; i++) {
          const file = files[i];
          const type = getFileTypeFromMime(file.type);
          
          let content = '';
          // Read content for text or small files
          if (type === 'text' || file.name.endsWith('.json') || file.name.endsWith('.md')) {
             try {
                 content = await file.text();
             } catch (err) { console.warn("Could not read text", err); }
          }
          
          // For images AND PDFs, we read as DataURL
          if (type === 'image' || type === 'pdf') {
              try {
                  content = await new Promise((resolve) => {
                      const reader = new FileReader();
                      reader.onload = (e) => resolve(e.target?.result as string);
                      reader.readAsDataURL(file);
                  });
              } catch (e) { console.warn("Could not read file", e); }
          }

          const newNode: FileNode = {
              id: `file_${Date.now()}_${i}`,
              parentId: activeCategory ? 'root' : currentFolderId, // Default to root if in category view
              name: file.name,
              type,
              size: file.size,
              mimeType: file.type,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              content: content 
          };
          addFile(newNode);
      }
      
      setIsUploading(false);
      addLog({ source: 'Files', message: `Uploaded ${files.length} files`, type: 'success', isCloud: authStatus === 'connected' });
  };

  const deleteSelection = () => {
      if (!confirm(`Delete ${selection.length} items?`)) return;
      selection.forEach(id => deleteFile(id));
      setSelection([]);
  };

  const archiveSelection = () => {
      if (selection.length === 0) return;
      
      const itemsToArchive = fs.filter(f => selection.includes(f.id));
      const archiveName = itemsToArchive.length === 1 ? `${itemsToArchive[0].name}.zip` : `Archive_${Date.now()}.zip`;
      const totalSize = itemsToArchive.reduce((acc, item) => acc + item.size, 0);

      // Create Archive Node
      // We store the items as a JSON string in 'content' for simulation. 
      const archiveNode: FileNode = {
          id: `arch_${Date.now()}`,
          parentId: currentFolderId,
          name: archiveName,
          type: 'archive',
          size: totalSize,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          content: JSON.stringify(itemsToArchive),
          mimeType: 'application/zip'
      };

      addFile(archiveNode);
      selection.forEach(id => deleteFile(id));
      setSelection([]);
      addLog({ source: 'Archiver', message: `Compressed ${itemsToArchive.length} items`, type: 'success', isCloud: authStatus === 'connected' });
  };

  const extractArchive = (archiveId: string) => {
      const archive = fs.find(f => f.id === archiveId);
      if (!archive || archive.type !== 'archive' || !archive.content) return;

      try {
          const extractedItems: FileNode[] = JSON.parse(archive.content);
          const restoredItems = extractedItems.map(item => ({
              ...item,
              id: `restored_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
              parentId: currentFolderId,
              updatedAt: Date.now()
          }));

          restoredItems.forEach(item => addFile(item));
          addLog({ source: 'Archiver', message: `Extracted ${restoredItems.length} items`, type: 'success', isCloud: authStatus === 'connected' });

      } catch (e) {
          console.error("Extraction Failed", e);
          addLog({ source: 'Archiver', message: "Extraction Failed: Corrupt Data", type: 'error', isCloud: false });
      }
  };

  // --- AI Analysis ---
  const analyzeSelection = async () => {
      const fileId = selection[0];
      const file = fs.find(f => f.id === fileId);
      if (!file || !file.content) return;

      const apiKey = localStorage.getItem('nd_os_api_key') || process.env.API_KEY;
      if (!apiKey) {
          setAiAnalysis("API Key Missing.");
          return;
      }

      setIsAiProcessing(true);
      try {
          const ai = new GoogleGenAI({ apiKey });
          let prompt = '';
          
          if (file.type === 'image') {
              const base64Data = file.content.split(',')[1];
              const response = await ai.models.generateContent({
                  model: 'gemini-2.5-flash',
                  contents: [
                      { inlineData: { mimeType: file.mimeType || 'image/png', data: base64Data } },
                      { text: "Describe this image in detail. Be concise." }
                  ]
              });
              setAiAnalysis(response.text || "No description generated.");
          } else if (file.type === 'text' || file.name.endsWith('.json') || file.name.endsWith('.md')) {
              const response = await ai.models.generateContent({
                  model: 'gemini-2.5-flash',
                  contents: `Analyze this file content. Summarize key points:\n\n${file.content.slice(0, 5000)}` // Limit for token safety
              });
              setAiAnalysis(response.text || "No analysis generated.");
          } else {
              setAiAnalysis("File type not supported for analysis.");
          }
      } catch (e) {
          setAiAnalysis("Analysis Failed.");
      } finally {
          setIsAiProcessing(false);
      }
  };

  // --- Interaction ---

  const handleItemClick = (e: React.MouseEvent, item: FileNode) => {
      e.stopPropagation();
      if (e.metaKey || e.ctrlKey) {
          setSelection(prev => prev.includes(item.id) ? prev.filter(i => i !== item.id) : [...prev, item.id]);
      } else {
          setSelection([item.id]);
          setAiAnalysis(null); // Reset on new selection
      }
  };

  const handleDoubleClick = (item: FileNode) => {
      if (item.type === 'folder') {
          if (activeCategory) return; // Can't nav folders in flat view
          setCurrentPath(prev => [...prev, item.id]);
          setSelection([]);
          setSearchQuery('');
          setAiAnalysis(null);
      } else if (item.type === 'archive') {
          if(confirm(`Extract ${item.name}?`)) {
              extractArchive(item.id);
          }
      } else if (item.type === 'image') {
          launchApp(AppID.PHOTOS, { initialImageId: item.id });
      } else if (item.type === 'text') {
          launchApp(AppID.NOTES, { fileId: item.id });
      } else if (item.type === 'pdf') {
          launchApp(AppID.PDF, { fileId: item.id });
      }
  };

  const navigateUp = () => {
      if (currentPath.length > 1) {
          setCurrentPath(prev => prev.slice(0, -1));
          setSelection([]);
      }
  };

  // --- Render ---

  return (
    <div className="flex h-full bg-nd-black text-nd-white font-sans overflow-hidden divide-x divide-nd-gray select-none">
        
        {/* Sidebar */}
        <div className="w-[60px] md:w-[200px] flex-shrink-0 bg-nd-black flex flex-col pt-4">
             {/* Storage Meter */}
             <div className="px-4 mb-6 hidden md:block">
                 <div className="flex items-center gap-2 text-nd-white mb-2">
                     <HardDrive size={16} />
                     <span className="font-bold text-xs uppercase tracking-wider">Storage</span>
                 </div>
                 <div className="h-1.5 bg-nd-gray/30 w-full rounded-full overflow-hidden mb-1">
                     <div className="h-full bg-nd-white" style={{ width: '15%' }} />
                 </div>
                 <div className="text-[10px] text-nd-gray font-mono flex justify-between">
                     <span>{formatSize(fs.reduce((acc, f) => acc + f.size, 0))} used</span>
                 </div>
             </div>

             <nav className="flex-1 flex flex-col gap-1">
                 <button 
                    onClick={() => { setCurrentPath(['root']); setSelection([]); setActiveCategory(null); }}
                    className={`flex items-center gap-3 px-4 py-3 mx-2 transition-all rounded ${!activeCategory && currentPath.length === 1 ? 'bg-nd-white text-nd-black' : 'text-nd-gray hover:text-nd-white hover:bg-nd-gray/10'}`}
                 >
                     <Home size={18} />
                     <span className="hidden md:inline font-medium text-sm">Home</span>
                 </button>
                 
                 <button onClick={() => { setCurrentPath(['root', 'f_desktop']); setActiveCategory(null); }} className={`flex items-center gap-3 px-4 py-3 mx-2 transition-all rounded ${!activeCategory && currentPath.includes('f_desktop') ? 'bg-nd-white text-nd-black' : 'text-nd-gray hover:text-nd-white hover:bg-nd-gray/10'}`}>
                     <Grid size={18} />
                     <span className="hidden md:inline font-medium text-sm">Desktop</span>
                 </button>
                 
                 <button onClick={() => setActiveCategory('document')} className={`flex items-center gap-3 px-4 py-3 mx-2 transition-all rounded ${activeCategory === 'document' ? 'bg-nd-white text-nd-black' : 'text-nd-gray hover:text-nd-white hover:bg-nd-gray/10'}`}>
                     <FileText size={18} />
                     <span className="hidden md:inline font-medium text-sm">Documents</span>
                 </button>
                 <button onClick={() => setActiveCategory('image')} className={`flex items-center gap-3 px-4 py-3 mx-2 transition-all rounded ${activeCategory === 'image' ? 'bg-nd-white text-nd-black' : 'text-nd-gray hover:text-nd-white hover:bg-nd-gray/10'}`}>
                     <ImageIcon size={18} />
                     <span className="hidden md:inline font-medium text-sm">Images</span>
                 </button>
                 <button onClick={() => setActiveCategory('archive')} className={`flex items-center gap-3 px-4 py-3 mx-2 transition-all rounded ${activeCategory === 'archive' ? 'bg-nd-white text-nd-black' : 'text-nd-gray hover:text-nd-white hover:bg-nd-gray/10'}`}>
                     <Archive size={18} />
                     <span className="hidden md:inline font-medium text-sm">Archives</span>
                 </button>
             </nav>
        </div>

        {/* Main Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-nd-black" onClick={() => { setSelection([]); setAiAnalysis(null); }}>
             
             {/* Toolbar */}
             <div className="h-[60px] border-b border-nd-gray flex items-center justify-between px-4 bg-nd-black shrink-0">
                 <div className="flex items-center gap-3">
                     {!activeCategory ? (
                         <>
                            <button 
                                onClick={navigateUp}
                                disabled={currentPath.length === 1}
                                className="p-2 border border-nd-gray rounded hover:bg-nd-gray/20 disabled:opacity-30 disabled:hover:bg-transparent"
                            >
                                <ArrowUp size={16} />
                            </button>
                            
                            <div className="flex items-center gap-1 text-sm overflow-hidden whitespace-nowrap mask-linear-fade">
                                {breadcrumbs.map((crumb, i) => (
                                    <React.Fragment key={crumb.id}>
                                        {i > 0 && <ChevronRight size={14} className="text-nd-gray" />}
                                        <button 
                                            onClick={() => setCurrentPath(currentPath.slice(0, i + 1))}
                                            className={`px-1 hover:bg-nd-gray/20 rounded ${i === breadcrumbs.length - 1 ? 'font-bold text-nd-white' : 'text-nd-gray'}`}
                                        >
                                            {crumb.name}
                                        </button>
                                    </React.Fragment>
                                ))}
                            </div>
                         </>
                     ) : (
                         <div className="flex items-center gap-2 bg-nd-gray/10 px-3 py-1.5 rounded-md border border-nd-gray/30">
                             <Filter size={14} className="text-nd-red" />
                             <span className="text-xs font-bold uppercase tracking-wide">
                                 {activeCategory === 'document' ? 'All Documents' : 
                                  activeCategory === 'image' ? 'All Images' : 
                                  activeCategory === 'media' ? 'All Media' : 'Filtered'}
                             </span>
                             <button onClick={() => setActiveCategory(null)} className="ml-2 hover:text-white text-nd-gray">
                                 <X size={14} />
                             </button>
                         </div>
                     )}
                 </div>

                 <div className="flex items-center gap-2">
                     {/* Actions for Selection */}
                     {selection.length === 1 && (
                         <button 
                            onClick={(e) => { e.stopPropagation(); analyzeSelection(); }} 
                            className="flex items-center gap-2 mr-2 bg-nd-gray/10 text-nd-white border border-nd-gray px-3 py-1 rounded-full hover:bg-nd-white hover:text-nd-black transition-colors"
                         >
                             {isAiProcessing ? <Loader2 size={14} className="animate-spin" /> : <BrainCircuit size={14} />}
                             <span className="text-xs font-bold">Analyze</span>
                         </button>
                     )}

                     {selection.length > 0 && (
                         <div className="flex items-center gap-2 mr-4 bg-nd-white text-nd-black px-3 py-1 rounded-full animate-in zoom-in">
                             <span className="text-xs font-bold">{selection.length} selected</span>
                             <div className="w-px h-3 bg-black/20 mx-1"></div>
                             <button onClick={archiveSelection} title="Archive Selection" className="hover:scale-110 transition-transform"><Archive size={14} /></button>
                             <button onClick={deleteSelection} title="Delete Selection" className="hover:scale-110 transition-transform text-red-600"><Trash2 size={14} /></button>
                         </div>
                     )}

                     {/* Upload Button */}
                     <label className="cursor-pointer p-2 hover:bg-nd-gray/20 rounded text-nd-gray hover:text-nd-white transition-colors relative">
                         {isUploading ? <Loader2 size={20} className="animate-spin" /> : <UploadCloud size={20} />}
                         <input type="file" multiple className="hidden" onChange={handleFileUpload} />
                     </label>

                     {!activeCategory && (
                        <button onClick={createFolder} className="p-2 hover:bg-nd-gray/20 rounded text-nd-gray hover:text-nd-white transition-colors">
                            <Folder size={20} /> <span className="sr-only">New Folder</span>
                        </button>
                     )}
                     
                     <div className="w-px h-4 bg-nd-gray mx-1"></div>
                     
                     <button onClick={() => setViewMode('grid')} className={`p-2 rounded transition-colors ${viewMode === 'grid' ? 'text-nd-white bg-nd-gray/20' : 'text-nd-gray hover:bg-nd-gray/10'}`}>
                         <Grid size={18} />
                     </button>
                     <button onClick={() => setViewMode('list')} className={`p-2 rounded transition-colors ${viewMode === 'list' ? 'text-nd-white bg-nd-gray/20' : 'text-nd-gray hover:bg-nd-gray/10'}`}>
                         <List size={18} />
                     </button>
                 </div>
             </div>

             {/* AI Analysis Panel (Floating) */}
             {aiAnalysis && (
                 <div className="absolute top-[70px] right-6 w-72 bg-nd-black/95 backdrop-blur-xl border border-nd-gray p-4 rounded-xl shadow-2xl z-20 animate-in slide-in-from-right-4">
                     <div className="flex justify-between items-center mb-2">
                         <div className="flex items-center gap-2 text-nd-red text-xs font-bold uppercase"><Sparkles size={12}/> Analysis</div>
                         <button onClick={() => setAiAnalysis(null)} className="text-nd-gray hover:text-white"><X size={12}/></button>
                     </div>
                     <div className="text-xs font-mono text-nd-white leading-relaxed max-h-60 overflow-y-auto">
                         {aiAnalysis}
                     </div>
                 </div>
             )}

             {/* File View */}
             <div className="flex-1 overflow-y-auto p-4 relative">
                 {currentItems.length === 0 ? (
                     <div className="absolute inset-0 flex flex-col items-center justify-center text-nd-gray opacity-30 pointer-events-none">
                         <Folder size={64} strokeWidth={1} />
                         <span className="text-sm font-mono mt-4 uppercase tracking-widest">
                             {activeCategory ? 'No items found' : 'Folder Empty'}
                         </span>
                     </div>
                 ) : (
                     <div className={`
                        ${viewMode === 'grid' 
                            ? 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4' 
                            : 'flex flex-col gap-1'
                        }
                     `}>
                        {currentItems.map(item => {
                            const isSelected = selection.includes(item.id);
                            return (
                                <div
                                    key={item.id}
                                    onClick={(e) => handleItemClick(e, item)}
                                    onDoubleClick={() => handleDoubleClick(item)}
                                    className={`
                                        group border transition-all cursor-pointer relative
                                        ${viewMode === 'grid' 
                                            ? 'aspect-square flex flex-col items-center justify-center p-4 rounded-xl gap-3 text-center' 
                                            : 'flex items-center p-3 rounded-lg gap-4'
                                        }
                                        ${isSelected 
                                            ? 'bg-nd-white text-nd-black border-nd-white shadow-lg z-10' 
                                            : 'bg-nd-black border-transparent hover:bg-nd-gray/10 hover:border-nd-gray'
                                        }
                                    `}
                                >
                                    {/* Icon */}
                                    <div className={`${viewMode === 'grid' ? 'w-12 h-12' : 'w-8 h-8'} flex items-center justify-center ${isSelected ? 'text-nd-black' : 'text-nd-gray group-hover:text-nd-white'} transition-colors`}>
                                        {item.type === 'image' && item.content ? (
                                            <div className="w-full h-full border border-nd-gray rounded overflow-hidden bg-black/50">
                                                <img src={item.content} alt={item.name} className="w-full h-full object-cover" />
                                            </div>
                                        ) : item.type === 'text' && item.content ? (
                                            <div className="w-full h-full bg-nd-white text-nd-black p-1 rounded-sm shadow-sm overflow-hidden border border-nd-gray">
                                                <div className="text-[3px] font-mono leading-[4px] opacity-70 break-words text-left">
                                                    {item.content.slice(0, 150)}
                                                </div>
                                            </div>
                                        ) : item.type === 'pdf' ? (
                                            <div className="relative w-full h-full flex items-center justify-center">
                                                <BookOpen className="w-full h-full stroke-[1.5]" />
                                                <span className="absolute bottom-0 right-0 bg-nd-red text-white text-[6px] px-1 py-0.5 font-bold rounded-tl-sm">PDF</span>
                                            </div>
                                        ) : (
                                            getIcon(item.type, "w-full h-full stroke-[1.5]")
                                        )}
                                    </div>
                                    
                                    {/* Info */}
                                    <div className={`min-w-0 ${viewMode === 'grid' ? 'w-full' : 'flex-1 flex items-center justify-between'}`}>
                                        <div className={`truncate font-medium text-sm ${viewMode === 'grid' ? 'w-full' : ''}`}>
                                            {item.name}
                                        </div>
                                        
                                        {viewMode === 'list' && (
                                            <div className={`flex items-center gap-8 text-xs font-mono ${isSelected ? 'text-black/60' : 'text-nd-gray'}`}>
                                                <span className="w-20 text-right">{item.type === 'folder' ? '-' : formatSize(item.size)}</span>
                                                <span className="w-32 text-right hidden sm:block">{new Date(item.updatedAt).toLocaleDateString()}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Grid Details (Size) */}
                                    {viewMode === 'grid' && (
                                        <div className={`text-[10px] font-mono ${isSelected ? 'text-black/60' : 'text-nd-gray'}`}>
                                            {item.type === 'folder' ? 'DIR' : formatSize(item.size)}
                                        </div>
                                    )}

                                    {/* Selection Checkbox (Visual Aid) */}
                                    {isSelected && (
                                        <div className="absolute top-2 right-2 text-nd-red">
                                            <CheckSquare size={16} className="fill-current text-white" />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                     </div>
                 )}
             </div>

             {/* Footer */}
             <div className="h-[30px] border-t border-nd-gray bg-nd-black flex items-center px-4 justify-between text-[10px] font-mono text-nd-gray shrink-0">
                 <div className="flex gap-4">
                    <span>{currentItems.length} items</span>
                    <span>{selection.length > 0 ? `${selection.length} selected` : ''}</span>
                 </div>
                 <div className="uppercase tracking-widest">{viewMode} VIEW</div>
             </div>
        </div>
    </div>
  );
};