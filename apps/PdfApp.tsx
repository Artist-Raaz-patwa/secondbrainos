import React, { useEffect, useState } from 'react';
import { useOS } from '../context/OSContext';
import { FileNode } from '../types';
import { Loader2, FileText, Download, AlertCircle } from 'lucide-react';

export const PdfApp: React.FC<{ fileId?: string }> = ({ fileId }) => {
  const { fs } = useOS();
  const [file, setFile] = useState<FileNode | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fileId) {
      const found = fs.find(f => f.id === fileId);
      if (found) setFile(found);
    }
  }, [fileId, fs]);

  useEffect(() => {
    if (file && file.content) {
      try {
        // If it's already a blob URL (unlikely but good for safety), use it
        if (file.content.startsWith('blob:')) {
            setPdfUrl(file.content);
            return;
        }

        // Convert Data URI (base64) to Blob URL
        // This bypasses Chrome's "Not allowed to load local resource" or size limits on data URIs in iframes
        if (file.content.startsWith('data:application/pdf;base64,')) {
            const base64Content = file.content.split(';base64,')[1];
            const byteCharacters = atob(base64Content);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            
            setPdfUrl(url);
            
            // Cleanup on unmount or file change
            return () => {
                URL.revokeObjectURL(url);
            };
        } else {
            // Fallback for other formats (though less likely to work for PDF if not base64)
            setPdfUrl(file.content);
        }
      } catch (e) {
        console.error("PDF Blob Conversion Error:", e);
        setError("Failed to render PDF. File might be corrupted.");
      }
    }
  }, [file]);

  if (!fileId) {
      return (
          <div className="flex flex-col items-center justify-center h-full text-nd-gray opacity-50 gap-4">
              <FileText size={64} strokeWidth={1} />
              <span className="font-mono text-xs uppercase tracking-widest">No PDF Selected</span>
          </div>
      );
  }

  if (!file) {
      return (
          <div className="flex items-center justify-center h-full text-nd-gray">
              <Loader2 className="animate-spin" />
          </div>
      );
  }

  return (
    <div className="h-full flex flex-col bg-nd-black text-nd-white font-sans">
        {/* Toolbar */}
        <div className="h-12 border-b border-nd-gray flex items-center px-4 justify-between bg-nd-black shrink-0 z-10">
            <div className="flex items-center gap-2 overflow-hidden">
                <FileText size={16} className="text-nd-red flex-shrink-0" />
                <span className="font-mono text-sm truncate">{file.name}</span>
            </div>
            <div className="flex items-center gap-4">
                <span className="text-xs text-nd-gray font-mono hidden sm:inline">{Math.round(file.size/1024)} KB</span>
                <a 
                    href={file.content} 
                    download={file.name}
                    className="p-1.5 hover:bg-nd-gray/20 rounded text-nd-gray hover:text-nd-white transition-colors"
                    title="Download Original"
                >
                    <Download size={16} />
                </a>
            </div>
        </div>
        
        {/* Viewer */}
        <div className="flex-1 bg-nd-gray/10 relative overflow-hidden">
            {error ? (
                <div className="flex flex-col items-center justify-center h-full text-nd-gray gap-2">
                    <AlertCircle size={32} className="text-nd-red" />
                    <span className="text-xs font-mono text-nd-red">{error}</span>
                </div>
            ) : pdfUrl ? (
                <iframe 
                    src={pdfUrl} 
                    className="w-full h-full border-none block" 
                    title={file.name}
                />
            ) : (
                <div className="flex flex-col items-center justify-center h-full text-nd-gray gap-2">
                    <Loader2 size={32} className="animate-spin" />
                    <span className="text-xs font-mono">Rendering...</span>
                </div>
            )}
        </div>
    </div>
  );
};