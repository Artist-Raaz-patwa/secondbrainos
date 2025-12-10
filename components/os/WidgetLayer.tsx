import React, { useState, useRef, useEffect } from 'react';
import { useOS } from '../../context/OSContext';
import { WIDGET_REGISTRY } from '../widgets/WidgetRegistry';
import { Move, X, GripHorizontal } from 'lucide-react';

export const WidgetLayer: React.FC = () => {
  const { widgets, updateWidget, removeWidget } = useOS();
  const containerRef = useRef<HTMLDivElement>(null);

  // --- Drag Logic ---
  const [isDragging, setIsDragging] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent, id: string, initialX: number, initialY: number) => {
      // Prevent drag if interacting with inputs
      if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') return;
      
      e.stopPropagation();
      setIsDragging(id);
      setDragOffset({
          x: e.clientX - initialX,
          y: e.clientY - initialY
      });
  };

  useEffect(() => {
      const handleMouseMove = (e: MouseEvent) => {
          if (isDragging) {
              const newX = e.clientX - dragOffset.x;
              const newY = e.clientY - dragOffset.y;
              updateWidget(isDragging, { x: newX, y: newY });
          }
      };

      const handleMouseUp = () => {
          if (isDragging) setIsDragging(null);
      };

      if (isDragging) {
          window.addEventListener('mousemove', handleMouseMove);
          window.addEventListener('mouseup', handleMouseUp);
      }
      return () => {
          window.removeEventListener('mousemove', handleMouseMove);
          window.removeEventListener('mouseup', handleMouseUp);
      };
  }, [isDragging, dragOffset, updateWidget]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        {widgets.map(widget => {
            const config = WIDGET_REGISTRY[widget.type];
            if (!config) return null;
            const WidgetComponent = config.component;
            const defaultW = config.defaultSize.w;
            const defaultH = config.defaultSize.h;

            return (
                <div 
                    key={widget.id}
                    style={{
                        left: widget.x,
                        top: widget.y,
                        width: defaultW,
                        height: defaultH,
                    }}
                    className={`absolute pointer-events-auto group transition-shadow duration-200 ${isDragging === widget.id ? 'z-50 cursor-grabbing' : 'z-0'}`}
                >
                    {/* Controls Overlay (Visible on Hover) */}
                    <div className="absolute -top-8 left-0 right-0 h-8 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <div 
                            className="bg-nd-black text-nd-gray border border-nd-gray p-1.5 rounded cursor-grab active:cursor-grabbing hover:text-nd-white"
                            onMouseDown={(e) => handleMouseDown(e, widget.id, widget.x, widget.y)}
                        >
                            <GripHorizontal size={14} />
                        </div>
                        <button 
                            onClick={() => removeWidget(widget.id)}
                            className="bg-nd-black text-nd-red border border-nd-red/50 p-1.5 rounded hover:bg-nd-red hover:text-white"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Widget Content */}
                    <div className="w-full h-full">
                        <WidgetComponent 
                            data={widget.data} 
                            updateData={(d) => updateWidget(widget.id, { data: { ...widget.data, ...d } })} 
                        />
                    </div>
                </div>
            );
        })}
    </div>
  );
};