import React, { useState, useEffect, useRef, Suspense } from 'react';
import { X, Minus, Square, Loader2 } from 'lucide-react';
import { AppID, WindowState } from '../../types';
import { useOS } from '../../context/OSContext';
import { ErrorBoundary } from '../ui/ErrorBoundary';

interface WindowProps {
  app: WindowState;
  onClose: (id: AppID) => void;
  onFocus: (id: AppID) => void;
  onMinimize: (id: AppID) => void;
  children: React.ReactNode;
}

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
type SnapType = 'left' | 'right' | 'maximize' | null;

const SNAP_THRESHOLD = 20;
const TOP_BAR_HEIGHT = 40; 

// Loading Spinner for Lazy Apps
const WindowLoader = () => (
  <div className="flex flex-col items-center justify-center h-full text-nd-gray gap-3 bg-transparent">
      <Loader2 size={32} className="animate-spin text-nd-white" />
      <span className="font-mono text-xs uppercase tracking-widest animate-pulse">Initializing...</span>
  </div>
);

export const Window: React.FC<WindowProps> = ({ app, onClose, onFocus, onMinimize, children }) => {
  const { updateWindowState } = useOS();
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [resizeDir, setResizeDir] = useState<ResizeDirection | null>(null);
  const [snapPreview, setSnapPreview] = useState<SnapType>(null);
  
  // Local state for smooth animation frame updates
  const [position, setPosition] = useState(app.position);
  const [size, setSize] = useState(app.size);

  const windowRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number | undefined>(undefined);

  // Sync state from context when not interacting
  useEffect(() => {
    if (!isDragging && !isResizing) {
      setPosition(app.position);
      setSize(app.size);
    }
  }, [app.position, app.size, isDragging, isResizing]);

  // --- Handlers ---

  const handleMouseDown = (e: React.MouseEvent) => {
    if (app.isMaximized) return; 
    if (window.innerWidth < 768) return; 

    if ((e.target as HTMLElement).closest('button')) return;

    setIsDragging(true);
    onFocus(app.id);
    const rect = windowRef.current?.getBoundingClientRect();
    if (rect) {
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
    }
  };

  const handleResizeStart = (e: React.MouseEvent, dir: ResizeDirection) => {
    e.stopPropagation();
    if (window.innerWidth < 768) return; 
    setIsResizing(true);
    setResizeDir(dir);
    onFocus(app.id);
    setDragOffset({ x: e.clientX, y: e.clientY });
  };

  const handleToggleMaximize = () => {
    if (window.innerWidth < 768) return; 
    if (app.isMaximized) {
        updateWindowState(app.id, { isMaximized: false });
    } else {
        updateWindowState(app.id, { isMaximized: true });
    }
  };

  // --- Optimized Mouse Move ---

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging && !isResizing) return;

        // Use rAF to throttle updates to screen refresh rate
        cancelAnimationFrame(requestRef.current!);
        requestRef.current = requestAnimationFrame(() => {
            if (isDragging) {
                const newX = e.clientX - dragOffset.x;
                const newY = e.clientY - dragOffset.y;
                setPosition({ x: newX, y: newY });

                // Snap Logic
                if (e.clientX < SNAP_THRESHOLD) setSnapPreview('left');
                else if (e.clientX > window.innerWidth - SNAP_THRESHOLD) setSnapPreview('right');
                else if (e.clientY < TOP_BAR_HEIGHT + SNAP_THRESHOLD) setSnapPreview('maximize');
                else setSnapPreview(null);
            }

            if (isResizing && resizeDir) {
                const deltaX = e.clientX - dragOffset.x;
                const deltaY = e.clientY - dragOffset.y;
                
                let newWidth = size.width;
                let newHeight = size.height;
                let newX = position.x;
                let newY = position.y;

                const MIN_W = 300;
                const MIN_H = 200;

                if (resizeDir.includes('e')) newWidth = Math.max(MIN_W, size.width + deltaX);
                if (resizeDir.includes('s')) newHeight = Math.max(MIN_H, size.height + deltaY);
                if (resizeDir.includes('w')) {
                    const proposedWidth = Math.max(MIN_W, size.width - deltaX);
                    newX += size.width - proposedWidth;
                    newWidth = proposedWidth;
                }
                if (resizeDir.includes('n')) {
                    const proposedHeight = Math.max(MIN_H, size.height - deltaY);
                    newY += size.height - proposedHeight;
                    newHeight = proposedHeight;
                }
                
                setSize({ width: newWidth, height: newHeight });
                setPosition({ x: newX, y: newY });
                // Note: For resize we don't update dragOffset usually, but here we are calculating deltas from click origin relative to prev size
                setDragOffset({ x: e.clientX, y: e.clientY });
            }
        });
    };

    const handleMouseUp = (e: MouseEvent) => {
        cancelAnimationFrame(requestRef.current!);
        
        if (isDragging) {
            setIsDragging(false);
            if (snapPreview) {
                const screenW = window.innerWidth;
                const screenH = window.innerHeight - 32;
                
                if (snapPreview === 'maximize') updateWindowState(app.id, { isMaximized: true });
                else if (snapPreview === 'left') updateWindowState(app.id, { isMaximized: false, position: { x: 0, y: 32 }, size: { width: screenW / 2, height: screenH } });
                else if (snapPreview === 'right') updateWindowState(app.id, { isMaximized: false, position: { x: screenW / 2, y: 32 }, size: { width: screenW / 2, height: screenH } });
                setSnapPreview(null);
            } else {
                updateWindowState(app.id, { position });
            }
        }

        if (isResizing) {
            setIsResizing(false);
            setResizeDir(null);
            updateWindowState(app.id, { position, size });
        }
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      cancelAnimationFrame(requestRef.current!);
    };
  }, [isDragging, isResizing, resizeDir, snapPreview, position, size, dragOffset, app.id, updateWindowState]);


  if (!app.isOpen || app.isMinimized) return null;

  const desktopStyle = app.isMaximized ? {
      left: 0,
      top: 32,
      width: '100vw',
      height: 'calc(100vh - 32px)',
      zIndex: app.zIndex,
  } : {
      left: position.x,
      top: position.y,
      width: size.width,
      height: size.height,
      zIndex: app.zIndex,
  };

  // Physics based smoothness with SOLID DARK colors
  // When interacting, disable transition for 1:1 feel. When releasing, enable for snap.
  const isInteracting = isDragging || isResizing;
  const transitionClass = isInteracting ? 'transition-none duration-0' : 'transition-all duration-300 ease-out';

  return (
    <>
        {/* Snap Preview Ghost - darkened */}
        {isDragging && snapPreview && (
            <div 
                className="fixed bg-nd-white/10 border-2 border-nd-gray z-[100] transition-all duration-300 ease-expo pointer-events-none rounded-sm"
                style={{
                    top: 40,
                    left: snapPreview === 'right' ? '50%' : 8,
                    right: snapPreview === 'left' ? '50%' : 8,
                    bottom: 8,
                    marginLeft: snapPreview === 'right' ? 8 : 0,
                    marginRight: snapPreview === 'left' ? 8 : 0,
                }}
            />
        )}

        <div
            ref={windowRef}
            style={desktopStyle}
            className={`
                fixed flex flex-col 
                window-glass
                border border-nd-gray shadow-[0px_0px_0px_1px_rgba(0,0,0,1),8px_8px_0px_0px_rgba(20,20,20,1)]
                ${transitionClass} animate-window-in
                ${isDragging ? 'cursor-grabbing opacity-90' : ''} 
                ${app.isMaximized ? 'shadow-none border-0 rounded-none' : 'md:rounded-sm'}
                
                /* Mobile Overrides */
                max-md:!left-0 max-md:!top-8 max-md:!w-full max-md:!h-[calc(100vh-8rem)] max-md:!border-x-0 max-md:!border-b-0 max-md:shadow-none max-md:!transform-none max-md:!rounded-none
            `}
            onMouseDown={() => onFocus(app.id)}
        >
            {/* Resize Handles (Desktop Only) */}
            {!app.isMaximized && (
                <div className="hidden md:block">
                    <div className="absolute top-0 left-0 w-full h-2 cursor-n-resize z-20" onMouseDown={(e) => handleResizeStart(e, 'n')} />
                    <div className="absolute bottom-0 left-0 w-full h-2 cursor-s-resize z-20" onMouseDown={(e) => handleResizeStart(e, 's')} />
                    <div className="absolute top-0 left-0 h-full w-2 cursor-w-resize z-20" onMouseDown={(e) => handleResizeStart(e, 'w')} />
                    <div className="absolute top-0 right-0 h-full w-2 cursor-e-resize z-20" onMouseDown={(e) => handleResizeStart(e, 'e')} />
                    <div className="absolute top-0 left-0 w-6 h-6 cursor-nw-resize z-30" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
                    <div className="absolute top-0 right-0 w-6 h-6 cursor-ne-resize z-30" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
                    <div className="absolute bottom-0 left-0 w-6 h-6 cursor-sw-resize z-30" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
                    <div className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize z-30" onMouseDown={(e) => handleResizeStart(e, 'se')} />
                </div>
            )}

            {/* Window Header */}
            <div 
                className="h-10 md:h-11 border-b border-nd-gray flex items-center justify-between px-4 cursor-grab active:cursor-grabbing select-none relative z-10 max-md:cursor-default bg-transparent"
                onMouseDown={handleMouseDown}
                onDoubleClick={handleToggleMaximize}
            >
                <div className="flex items-center gap-2">
                    <div className="flex gap-1.5 group p-1">
                        <div className="w-2.5 h-2.5 bg-nd-gray rounded-full group-hover:bg-nd-red transition-colors duration-300"></div>
                        <div className="w-2.5 h-2.5 bg-nd-gray rounded-full group-hover:bg-nd-red transition-colors duration-300 delay-75"></div>
                        <div className="w-2.5 h-2.5 bg-nd-gray rounded-full group-hover:bg-nd-red transition-colors duration-300 delay-150"></div>
                    </div>
                    <span className="font-mono text-xs font-bold uppercase tracking-widest ml-3 text-nd-white">{app.title}</span>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={() => onMinimize(app.id)} className="p-1.5 hover:bg-nd-gray/20 rounded text-nd-gray hover:text-nd-white transition-colors">
                        <Minus size={14} />
                    </button>
                    <button onClick={handleToggleMaximize} className="hidden md:block p-1.5 hover:bg-nd-gray/20 rounded text-nd-gray hover:text-nd-white transition-colors">
                        <Square size={10} />
                    </button>
                    <button onClick={() => onClose(app.id)} className="p-1.5 hover:bg-nd-red hover:text-white rounded text-nd-gray transition-colors">
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Window Content with Suspense & Error Boundary */}
            <div className="flex-1 overflow-auto p-0 md:p-0 relative bg-transparent">
                <div className="relative z-10 h-full">
                    <ErrorBoundary appName={app.title} onClose={() => onClose(app.id)}>
                        <Suspense fallback={<WindowLoader />}>
                            {children}
                        </Suspense>
                    </ErrorBoundary>
                </div>
            </div>

            {/* Visual Resize Grip (Desktop Only) */}
            {!app.isMaximized && (
                <div className="hidden md:flex absolute bottom-0 right-0 w-4 h-4 cursor-se-resize pointer-events-none items-end justify-end p-0.5 opacity-50">
                    <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
                        <path d="M6 6L6 0L0 6L6 6Z" fill="#555"/>
                    </svg>
                </div>
            )}
        </div>
    </>
  );
};