import React, { useState, useEffect } from 'react';
import { db, auth } from '../services/firebase';
import { ref, onValue, push, set, remove } from 'firebase/database';
import { Clipboard, Trash2, Copy, Clock, AlertTriangle, WifiOff } from 'lucide-react';
import { useOS } from '../context/OSContext';

// --- Types ---
interface ClipboardItem {
  id: string;
  content: string;
  timestamp: number;
}

const EXPIRATION_MS = 48 * 60 * 60 * 1000; // 48 Hours

export const ClipboardApp: React.FC = () => {
  const { authStatus, addLog, isOnline } = useOS();
  const [items, setItems] = useState<ClipboardItem[]>([]);
  const [inputText, setInputText] = useState('');

  useEffect(() => {
    if (authStatus === 'connected' && auth.currentUser) {
      const clipboardRef = ref(db, `users/${auth.currentUser.uid}/clipboard`);
      
      const unsubscribe = onValue(clipboardRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const list: ClipboardItem[] = Object.values(data);
          
          // --- AUTO DELETE LOGIC ---
          const now = Date.now();
          const validItems: ClipboardItem[] = [];
          
          list.forEach(item => {
              if (now - item.timestamp > EXPIRATION_MS) {
                  // Expired: Delete from server
                  remove(ref(db, `users/${auth.currentUser!.uid}/clipboard/${item.id}`));
              } else {
                  validItems.push(item);
              }
          });

          setItems(validItems.sort((a, b) => b.timestamp - a.timestamp));
        } else {
          setItems([]);
        }
      });

      return () => unsubscribe();
    }
  }, [authStatus]);

  const saveToClipboard = (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!inputText.trim()) return;
      if (!auth.currentUser) return;

      const newItem: ClipboardItem = {
          id: `clip_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          content: inputText,
          timestamp: Date.now()
      };

      set(ref(db, `users/${auth.currentUser.uid}/clipboard/${newItem.id}`), newItem);
      setInputText('');
      addLog({ source: 'Clipboard', message: 'Text saved to cloud', type: 'success', isCloud: true });
  };

  const copyItem = (text: string) => {
      navigator.clipboard.writeText(text);
      addLog({ source: 'Clipboard', message: 'Copied to local clipboard', type: 'info', isCloud: false });
  };

  const deleteItem = (id: string) => {
      if (auth.currentUser) {
          remove(ref(db, `users/${auth.currentUser.uid}/clipboard/${id}`));
      }
  };

  const clearAll = () => {
      if (confirm("Clear all history?") && auth.currentUser) {
          remove(ref(db, `users/${auth.currentUser.uid}/clipboard`));
      }
  };

  if (!isOnline) {
      return (
          <div className="h-full flex flex-col items-center justify-center text-nd-red gap-4 bg-nd-black">
              <WifiOff size={48} />
              <div className="text-center">
                  <h3 className="font-bold uppercase tracking-widest">Offline</h3>
                  <p className="text-xs font-mono mt-2">Clipboard Sync requires active connection.</p>
              </div>
          </div>
      );
  }

  return (
    <div className="h-full flex flex-col bg-nd-black text-nd-white font-sans">
        
        {/* Header */}
        <div className="h-[60px] border-b border-nd-gray flex items-center justify-between px-6 shrink-0">
            <div className="flex items-center gap-3">
                <Clipboard size={18} className="text-nd-red" />
                <h2 className="font-bold text-sm tracking-widest uppercase">Cloud Board</h2>
            </div>
            <div className="flex items-center gap-4 text-xs text-nd-gray font-mono">
                <span className="flex items-center gap-1">
                    <Clock size={12} /> Auto-Delete: 48h
                </span>
                {items.length > 0 && (
                    <button onClick={clearAll} className="hover:text-nd-red transition-colors">Clear All</button>
                )}
            </div>
        </div>

        {/* Input */}
        <div className="p-4 border-b border-nd-gray bg-nd-gray/5">
            <form onSubmit={saveToClipboard} className="flex gap-2">
                <input 
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Paste text here to save..."
                    className="flex-1 bg-nd-black border border-nd-gray px-4 py-2 text-sm text-nd-white outline-none focus:border-nd-white"
                    autoFocus
                />
                <button 
                    type="submit" 
                    disabled={!inputText.trim()}
                    className="px-4 py-2 bg-nd-white text-nd-black font-bold text-xs uppercase disabled:opacity-50 hover:bg-white/90"
                >
                    Save
                </button>
            </form>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-nd-gray opacity-30 gap-2">
                    <Clipboard size={32} strokeWidth={1} />
                    <p className="font-mono text-xs">HISTORY EMPTY</p>
                </div>
            ) : (
                items.map(item => {
                    const timeLeft = EXPIRATION_MS - (Date.now() - item.timestamp);
                    const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
                    
                    return (
                        <div key={item.id} className="border border-nd-gray p-3 bg-nd-black hover:border-nd-white transition-all group relative">
                            <div className="pr-8 text-sm font-mono whitespace-pre-wrap break-all line-clamp-3">
                                {item.content}
                            </div>
                            
                            <div className="mt-3 flex items-center justify-between text-[10px] text-nd-gray uppercase tracking-wider">
                                <span className={hoursLeft < 2 ? 'text-nd-red' : ''}>Expires in {hoursLeft}h</span>
                                <span>{new Date(item.timestamp).toLocaleString()}</span>
                            </div>

                            <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => copyItem(item.content)} className="p-1.5 bg-nd-gray/20 hover:bg-nd-white hover:text-nd-black rounded text-nd-white">
                                    <Copy size={12} />
                                </button>
                                <button onClick={() => deleteItem(item.id)} className="p-1.5 bg-nd-gray/20 hover:bg-nd-red hover:text-white rounded text-nd-red">
                                    <Trash2 size={12} />
                                </button>
                            </div>
                        </div>
                    );
                })
            )}
        </div>
        
    </div>
  );
};