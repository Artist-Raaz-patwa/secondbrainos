import React, { useState, useMemo, useEffect } from 'react';
import { useOS } from '../context/OSContext';
import { 
  Image as ImageIcon, Grid, Layers, Clock, 
  Trash2, Download, Info, ChevronLeft, ChevronRight, X, ZoomIn
} from 'lucide-react';
import { FileNode } from '../types';

export const PhotosApp: React.FC<{ initialImageId?: string }> = ({ initialImageId }) => {
  const { fs, deleteFile, addLog } = useOS();
  const [view, setView] = useState<'library' | 'albums'>('library');
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  
  // Filter for images only
  const allImages = useMemo(() => 
    fs.filter(f => f.type === 'image' && f.content).sort((a, b) => b.createdAt - a.createdAt), 
  [fs]);

  // Handle Initial Launch Params
  useEffect(() => {
      if (initialImageId) {
          const exists = allImages.find(img => img.id === initialImageId);
          if (exists) {
              setSelectedImageId(initialImageId);
          }
      }
  }, [initialImageId, allImages]);

  const albums = useMemo(() => {
      const groups: Record<string, FileNode[]> = {};
      allImages.forEach(img => {
          // Find folder name from parentId
          const parent = fs.find(f => f.id === img.parentId);
          const albumName = parent ? parent.name : 'Unsorted';
          if (!groups[albumName]) groups[albumName] = [];
          groups[albumName].push(img);
      });
      return groups;
  }, [allImages, fs]);

  // Actions
  const handleDelete = (id: string) => {
      if (confirm('Delete this photo?')) {
          deleteFile(id);
          setSelectedImageId(null);
          addLog({ source: 'Photos', message: 'Photo deleted', type: 'info', isCloud: false });
      }
  };

  const handleDownload = (img: FileNode) => {
      if (!img.content) return;
      const link = document.createElement('a');
      link.href = img.content;
      link.download = img.name;
      link.click();
  };

  const activeImageIndex = allImages.findIndex(img => img.id === selectedImageId);
  const nextImage = () => {
      if (activeImageIndex < allImages.length - 1) setSelectedImageId(allImages[activeImageIndex + 1].id);
  };
  const prevImage = () => {
      if (activeImageIndex > 0) setSelectedImageId(allImages[activeImageIndex - 1].id);
  };

  return (
    <div className="flex h-full bg-nd-black text-nd-white font-sans divide-x divide-nd-gray overflow-hidden">
        
        {/* Sidebar */}
        <div className="w-[60px] md:w-[200px] flex-shrink-0 bg-nd-black flex flex-col pt-4">
            <div className="px-4 mb-6 hidden md:block">
                <div className="flex items-center gap-2 text-nd-red mb-1">
                    <ImageIcon size={18} />
                    <span className="font-bold tracking-widest uppercase">Photos</span>
                </div>
                <p className="text-[10px] text-nd-gray font-mono">{allImages.length} ITEMS</p>
            </div>

            <nav className="flex-1 flex flex-col gap-1">
                <button 
                    onClick={() => setView('library')}
                    className={`flex items-center gap-3 px-4 py-3 mx-2 rounded transition-all ${view === 'library' ? 'bg-nd-white text-nd-black' : 'text-nd-gray hover:text-nd-white hover:bg-nd-gray/10'}`}
                >
                    <Grid size={18} />
                    <span className="hidden md:inline font-medium text-sm">Library</span>
                </button>
                <button 
                    onClick={() => setView('albums')}
                    className={`flex items-center gap-3 px-4 py-3 mx-2 rounded transition-all ${view === 'albums' ? 'bg-nd-white text-nd-black' : 'text-nd-gray hover:text-nd-white hover:bg-nd-gray/10'}`}
                >
                    <Layers size={18} />
                    <span className="hidden md:inline font-medium text-sm">Albums</span>
                </button>
            </nav>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-nd-black relative">
            
            {/* Header */}
            <div className="h-[60px] border-b border-nd-gray flex items-center justify-between px-6 bg-nd-black shrink-0">
                <h2 className="text-lg font-bold font-mono tracking-tight uppercase">
                    {view === 'library' ? 'All Photos' : 'Albums'}
                </h2>
                <div className="text-xs text-nd-gray font-mono">
                    SYNCED
                </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-6">
                {view === 'library' && (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {allImages.length === 0 ? (
                            <div className="col-span-full flex flex-col items-center justify-center py-20 text-nd-gray opacity-50">
                                <ImageIcon size={48} strokeWidth={1} />
                                <p className="mt-4 font-mono text-xs uppercase tracking-widest">No Photos Found</p>
                                <p className="text-[10px] mt-1">Upload images via Files App</p>
                            </div>
                        ) : (
                            allImages.map(img => (
                                <div 
                                    key={img.id}
                                    onClick={() => setSelectedImageId(img.id)}
                                    className="aspect-square bg-nd-gray/10 rounded-lg overflow-hidden border border-nd-gray/30 hover:border-nd-white cursor-pointer transition-all group relative"
                                >
                                    {img.content ? (
                                        <img src={img.content} alt={img.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-nd-red"><Info /></div>
                                    )}
                                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                            ))
                        )}
                    </div>
                )}

                {view === 'albums' && (
                    <div className="space-y-8">
                        {Object.keys(albums).length === 0 && (
                             <div className="text-center py-20 text-nd-gray opacity-50">
                                <Layers size={48} strokeWidth={1} className="mx-auto" />
                                <p className="mt-4 font-mono text-xs uppercase tracking-widest">No Albums</p>
                             </div>
                        )}
                        {Object.entries(albums).map(([name, imgs]) => (
                            <div key={name}>
                                <div className="flex items-end gap-2 mb-3 border-b border-nd-gray/30 pb-2">
                                    <h3 className="text-lg font-bold">{name}</h3>
                                    <span className="text-xs text-nd-gray mb-1">{imgs.length} photos</span>
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                    {imgs.map(img => (
                                        <div 
                                            key={img.id}
                                            onClick={() => setSelectedImageId(img.id)}
                                            className="aspect-square bg-nd-gray/10 rounded-lg overflow-hidden border border-nd-gray/30 hover:border-nd-white cursor-pointer transition-all group relative"
                                        >
                                            <img src={img.content} alt={img.name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Lightbox Overlay */}
            {selectedImageId && activeImageIndex >= 0 && (
                <div className="absolute inset-0 z-50 bg-black/95 flex flex-col animate-in fade-in duration-200">
                    {/* Toolbar */}
                    <div className="h-14 flex items-center justify-between px-4 border-b border-nd-gray/30 bg-black/50 backdrop-blur-md">
                        <button onClick={() => setSelectedImageId(null)} className="p-2 hover:bg-white/10 rounded-full">
                            <X size={20} />
                        </button>
                        <span className="text-xs font-mono truncate max-w-xs">{allImages[activeImageIndex]?.name}</span>
                        <div className="flex gap-2">
                            <button onClick={() => handleDownload(allImages[activeImageIndex])} className="p-2 hover:bg-white/10 rounded-full">
                                <Download size={18} />
                            </button>
                            <button onClick={() => handleDelete(selectedImageId)} className="p-2 hover:bg-nd-red/20 text-nd-red rounded-full">
                                <Trash2 size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Main Image */}
                    <div className="flex-1 relative flex items-center justify-center p-4 group">
                        <button 
                            onClick={prevImage}
                            disabled={activeImageIndex === 0}
                            className="absolute left-4 p-3 rounded-full bg-black/50 text-white hover:bg-white/20 disabled:opacity-0 transition-all z-10"
                        >
                            <ChevronLeft size={24} />
                        </button>

                        <img 
                            src={allImages[activeImageIndex]?.content} 
                            alt="View" 
                            className="max-h-full max-w-full object-contain shadow-2xl"
                        />

                        <button 
                            onClick={nextImage}
                            disabled={activeImageIndex === allImages.length - 1}
                            className="absolute right-4 p-3 rounded-full bg-black/50 text-white hover:bg-white/20 disabled:opacity-0 transition-all z-10"
                        >
                            <ChevronRight size={24} />
                        </button>
                    </div>

                    {/* Metadata Footer */}
                    <div className="h-12 border-t border-nd-gray/30 flex items-center justify-center text-xs text-nd-gray bg-black/50 backdrop-blur-md font-mono">
                        {new Date(allImages[activeImageIndex]?.createdAt).toLocaleString()} • {Math.round(allImages[activeImageIndex]?.size / 1024)} KB
                    </div>
                </div>
            )}

        </div>
    </div>
  );
};