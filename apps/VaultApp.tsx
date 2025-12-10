import React, { useState, useEffect } from 'react';
import { db, auth } from '../services/firebase';
import { ref, onValue, set, push, remove, update, get } from 'firebase/database';
import { 
  Shield, Lock, Unlock, Key, FileText, Plus, Trash2, 
  Copy, Eye, EyeOff, Search, AlertTriangle, Fingerprint,
  RefreshCw, LogOut, X
} from 'lucide-react';
import { useOS } from '../context/OSContext';

// --- Types ---

type VaultItemType = 'password' | 'note';

interface VaultItem {
  id: string;
  type: VaultItemType;
  title: string;
  username?: string; // For passwords
  secret: string;   // Password or Note Content
  url?: string;     // For passwords
  createdAt: number;
}

// --- Component ---

export const VaultApp: React.FC = () => {
  const { authStatus, addLog } = useOS();
  
  // App State
  const [isLocked, setIsLocked] = useState(true);
  const [hasSetupPin, setHasSetupPin] = useState<boolean | null>(null); // null = loading
  const [pinInput, setPinInput] = useState('');
  
  // Data State
  const [items, setItems] = useState<VaultItem[]>([]);
  const [activeTab, setActiveTab] = useState<VaultItemType>('password');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Edit/Add State
  const [isAdding, setIsAdding] = useState(false);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemUsername, setNewItemUsername] = useState('');
  const [newItemSecret, setNewItemSecret] = useState('');
  const [newItemUrl, setNewItemUrl] = useState('');

  // UI State
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});

  // --- Initialization ---

  useEffect(() => {
    checkPinStatus();
  }, [authStatus]);

  const checkPinStatus = async () => {
    if (authStatus === 'connected' && auth.currentUser) {
      const pinRef = ref(db, `users/${auth.currentUser.uid}/vault/config/pin`);
      const snapshot = await get(pinRef);
      setHasSetupPin(snapshot.exists());
    } else {
      const localPin = localStorage.getItem('nd_os_vault_pin');
      setHasSetupPin(!!localPin);
    }
  };

  const loadVaultData = () => {
    if (authStatus === 'connected' && auth.currentUser) {
      const itemsRef = ref(db, `users/${auth.currentUser.uid}/vault/items`);
      onValue(itemsRef, (snapshot) => {
        const data = snapshot.val();
        setItems(data ? Object.values(data) : []);
      });
    } else {
      const localItems = localStorage.getItem('nd_os_vault_items');
      if (localItems) setItems(JSON.parse(localItems));
    }
  };

  // --- Actions ---

  const handlePinSubmit = async (pin: string) => {
    // 1. Setup Mode
    if (hasSetupPin === false) {
      if (pin.length !== 4) return;
      
      if (authStatus === 'connected' && auth.currentUser) {
        await set(ref(db, `users/${auth.currentUser.uid}/vault/config/pin`), pin);
      } else {
        localStorage.setItem('nd_os_vault_pin', pin);
      }
      
      addLog({ source: 'Vault', message: 'Security PIN Configured', type: 'success', isCloud: authStatus === 'connected' });
      setHasSetupPin(true);
      setPinInput('');
      return;
    }

    // 2. Unlock Mode
    let storedPin = '';
    if (authStatus === 'connected' && auth.currentUser) {
       const snap = await get(ref(db, `users/${auth.currentUser.uid}/vault/config/pin`));
       storedPin = snap.val();
    } else {
       storedPin = localStorage.getItem('nd_os_vault_pin') || '';
    }

    if (pin === storedPin) {
      setIsLocked(false);
      loadVaultData();
      addLog({ source: 'Vault', message: 'Access Granted', type: 'success', isCloud: false });
    } else {
      setPinInput('');
      addLog({ source: 'Vault', message: 'Access Denied: Invalid PIN', type: 'error', isCloud: false });
      // Shake animation effect logic could go here
    }
  };

  const addItem = () => {
    if (!newItemTitle || !newItemSecret) return;

    const newItem: VaultItem = {
      id: `v_${Date.now()}`,
      type: activeTab,
      title: newItemTitle,
      username: activeTab === 'password' ? newItemUsername : undefined,
      url: activeTab === 'password' ? newItemUrl : undefined,
      secret: newItemSecret,
      createdAt: Date.now()
    };

    if (authStatus === 'connected' && auth.currentUser) {
      set(ref(db, `users/${auth.currentUser.uid}/vault/items/${newItem.id}`), newItem);
    } else {
      const newItems = [...items, newItem];
      setItems(newItems);
      localStorage.setItem('nd_os_vault_items', JSON.stringify(newItems));
    }

    setIsAdding(false);
    setNewItemTitle('');
    setNewItemUsername('');
    setNewItemSecret('');
    setNewItemUrl('');
    addLog({ source: 'Vault', message: `Encrypted new ${activeTab}`, type: 'info', isCloud: authStatus === 'connected' });
  };

  const deleteItem = (id: string) => {
    if (confirm('Permanently delete this item?')) {
      if (authStatus === 'connected' && auth.currentUser) {
        remove(ref(db, `users/${auth.currentUser.uid}/vault/items/${id}`));
      } else {
        const newItems = items.filter(i => i.id !== id);
        setItems(newItems);
        localStorage.setItem('nd_os_vault_items', JSON.stringify(newItems));
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    addLog({ source: 'Vault', message: 'Copied to clipboard', type: 'info', isCloud: false });
  };

  // --- Render Sub-Components ---

  const PinPad = () => {
    const handleNum = (num: string) => {
      if (pinInput.length < 4) {
        const newPin = pinInput + num;
        setPinInput(newPin);
        if (newPin.length === 4) {
          setTimeout(() => handlePinSubmit(newPin), 200);
        }
      }
    };

    return (
      <div className="flex flex-col items-center justify-center h-full bg-nd-black text-nd-white animate-in fade-in zoom-in duration-300">
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-2 border-nd-red rounded-full flex items-center justify-center mb-2 shadow-[0_0_30px_rgba(235,0,0,0.2)]">
            <Lock size={32} className="text-nd-red" />
          </div>
          <h2 className="text-xl font-bold uppercase tracking-widest">
            {hasSetupPin === false ? 'Create Access PIN' : 'Security Locked'}
          </h2>
          <div className="flex gap-4 mt-4">
            {[0, 1, 2, 3].map(i => (
              <div 
                key={i} 
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  i < pinInput.length ? 'bg-nd-red scale-125 shadow-[0_0_10px_var(--color-accent)]' : 'bg-nd-gray/30'
                }`} 
              />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 mb-8">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <button
              key={num}
              onClick={() => handleNum(num.toString())}
              className="w-16 h-16 rounded-full border border-nd-gray hover:border-nd-white hover:bg-nd-white/10 text-xl font-mono transition-all active:scale-95"
            >
              {num}
            </button>
          ))}
          <div />
          <button
              onClick={() => handleNum('0')}
              className="w-16 h-16 rounded-full border border-nd-gray hover:border-nd-white hover:bg-nd-white/10 text-xl font-mono transition-all active:scale-95"
            >
              0
            </button>
          <button 
             onClick={() => setPinInput('')}
             className="w-16 h-16 rounded-full border border-transparent text-nd-red hover:bg-nd-red/10 flex items-center justify-center"
          >
             <RefreshCw size={20} />
          </button>
        </div>
        
        {hasSetupPin === false && (
            <p className="text-xs text-nd-gray font-mono max-w-xs text-center mt-4">
                WARNING: This PIN will be required to access your vault. Do not lose it.
            </p>
        )}
      </div>
    );
  };

  const filteredItems = items.filter(i => 
    i.type === activeTab && 
    (i.title.toLowerCase().includes(searchQuery.toLowerCase()) || i.username?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // --- Main Render ---

  if (isLocked) {
    return <PinPad />;
  }

  return (
    <div className="flex h-full bg-nd-black text-nd-white font-sans divide-x divide-nd-gray overflow-hidden">
      
      {/* Sidebar */}
      <div className="w-[60px] md:w-[200px] flex-shrink-0 bg-nd-black flex flex-col pt-4">
        <div className="px-4 mb-6 hidden md:block">
           <div className="flex items-center gap-2 text-nd-red mb-1">
              <Shield size={18} />
              <span className="font-bold tracking-widest uppercase">Vault</span>
           </div>
           <p className="text-[10px] text-nd-gray font-mono">ENCRYPTED STORAGE</p>
        </div>

        <button 
          onClick={() => setActiveTab('password')}
          className={`flex items-center gap-3 px-4 py-3 mx-2 mb-1 transition-all border border-transparent ${activeTab === 'password' ? 'bg-nd-white text-nd-black border-nd-white' : 'text-nd-gray hover:text-nd-white hover:bg-nd-gray/10'}`}
        >
          <Key size={18} />
          <span className="hidden md:inline font-medium text-sm">Passwords</span>
        </button>

        <button 
          onClick={() => setActiveTab('note')}
          className={`flex items-center gap-3 px-4 py-3 mx-2 mb-1 transition-all border border-transparent ${activeTab === 'note' ? 'bg-nd-white text-nd-black border-nd-white' : 'text-nd-gray hover:text-nd-white hover:bg-nd-gray/10'}`}
        >
          <FileText size={18} />
          <span className="hidden md:inline font-medium text-sm">Secure Notes</span>
        </button>

        <div className="mt-auto p-4 border-t border-nd-gray">
          <button 
            onClick={() => { setIsLocked(true); setPinInput(''); }}
            className="flex items-center gap-3 text-nd-red hover:text-white transition-colors w-full"
          >
            <LogOut size={18} />
            <span className="hidden md:inline font-mono text-xs uppercase">Lock Vault</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 bg-nd-black relative">
        
        {/* Toolbar */}
        <div className="h-[60px] border-b border-nd-gray flex items-center justify-between px-6 shrink-0 bg-nd-black z-10">
           <div className="relative flex-1 max-w-md">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-nd-gray" />
              <input 
                 value={searchQuery}
                 onChange={e => setSearchQuery(e.target.value)}
                 placeholder={`Search ${activeTab}s...`}
                 className="w-full bg-nd-gray/10 border border-nd-gray/50 focus:border-nd-white rounded-full py-1.5 pl-9 pr-4 text-sm text-nd-white outline-none font-mono placeholder-nd-gray/50"
              />
           </div>
           <button 
             onClick={() => setIsAdding(true)}
             className="ml-4 flex items-center gap-2 bg-nd-white text-nd-black px-4 py-2 text-xs font-bold uppercase hover:bg-white/90 transition-colors"
           >
             <Plus size={14} /> New Entry
           </button>
        </div>

        {/* Content List */}
        <div className="flex-1 overflow-y-auto p-6">
           {filteredItems.length === 0 ? (
               <div className="flex flex-col items-center justify-center h-full text-nd-gray opacity-30 gap-4">
                  <Fingerprint size={48} />
                  <p className="font-mono text-xs tracking-widest">NO SECURE ITEMS FOUND</p>
               </div>
           ) : (
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
               {filteredItems.map(item => (
                 <div key={item.id} className="border border-nd-gray p-4 bg-nd-black hover:border-nd-white transition-all group relative">
                    <div className="flex justify-between items-start mb-4">
                       <div className="flex items-center gap-3">
                          <div className="p-2 bg-nd-gray/20 rounded-md">
                             {item.type === 'password' ? <Key size={16} /> : <FileText size={16} />}
                          </div>
                          <div>
                             <h3 className="font-bold text-sm">{item.title}</h3>
                             {item.username && <p className="text-xs text-nd-gray font-mono">{item.username}</p>}
                          </div>
                       </div>
                       <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => deleteItem(item.id)} className="p-1.5 hover:bg-nd-red hover:text-white text-nd-gray transition-colors rounded">
                             <Trash2 size={14} />
                          </button>
                       </div>
                    </div>

                    <div className="bg-nd-gray/10 p-3 rounded border border-nd-gray/20 flex items-center justify-between gap-2">
                       <div className="font-mono text-xs text-nd-white truncate flex-1">
                          {visibleSecrets[item.id] ? item.secret : '••••••••••••••••'}
                       </div>
                       <div className="flex gap-1">
                          <button 
                             onClick={() => setVisibleSecrets(prev => ({...prev, [item.id]: !prev[item.id]}))}
                             className="p-1.5 text-nd-gray hover:text-nd-white"
                          >
                             {visibleSecrets[item.id] ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                          <button 
                             onClick={() => copyToClipboard(item.secret)}
                             className="p-1.5 text-nd-gray hover:text-nd-white"
                          >
                             <Copy size={14} />
                          </button>
                       </div>
                    </div>
                    
                    {item.url && (
                        <div className="mt-3 text-xs text-nd-gray hover:text-nd-red cursor-pointer flex items-center gap-1 w-max">
                            <span onClick={() => window.open(item.url?.startsWith('http') ? item.url : `https://${item.url}`, '_blank')}>
                                {item.url}
                            </span>
                        </div>
                    )}
                 </div>
               ))}
             </div>
           )}
        </div>

        {/* Add Item Modal */}
        {isAdding && (
           <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <div className="bg-nd-black border border-nd-white p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-200">
                 <div className="flex items-center justify-between mb-6 border-b border-nd-gray pb-4">
                    <h3 className="font-bold text-lg uppercase tracking-wide">
                        Add {activeTab === 'password' ? 'Credentials' : 'Secure Note'}
                    </h3>
                    <button onClick={() => setIsAdding(false)}><X size={20} className="text-nd-gray hover:text-nd-white"/></button>
                 </div>
                 
                 <div className="space-y-4">
                    <div>
                        <label className="text-[10px] uppercase text-nd-gray font-bold tracking-widest mb-1 block">Title</label>
                        <input 
                           autoFocus
                           value={newItemTitle}
                           onChange={e => setNewItemTitle(e.target.value)}
                           className="w-full bg-nd-gray/10 border border-nd-gray p-2 text-sm text-nd-white outline-none focus:border-nd-white"
                           placeholder="e.g. Gmail, Bank Account"
                        />
                    </div>
                    
                    {activeTab === 'password' && (
                        <>
                            <div>
                                <label className="text-[10px] uppercase text-nd-gray font-bold tracking-widest mb-1 block">Username / Email</label>
                                <input 
                                    value={newItemUsername}
                                    onChange={e => setNewItemUsername(e.target.value)}
                                    className="w-full bg-nd-gray/10 border border-nd-gray p-2 text-sm text-nd-white outline-none focus:border-nd-white"
                                    placeholder="user@example.com"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] uppercase text-nd-gray font-bold tracking-widest mb-1 block">Website (Optional)</label>
                                <input 
                                    value={newItemUrl}
                                    onChange={e => setNewItemUrl(e.target.value)}
                                    className="w-full bg-nd-gray/10 border border-nd-gray p-2 text-sm text-nd-white outline-none focus:border-nd-white"
                                    placeholder="example.com"
                                />
                            </div>
                        </>
                    )}

                    <div>
                        <label className="text-[10px] uppercase text-nd-gray font-bold tracking-widest mb-1 block">
                            {activeTab === 'password' ? 'Password' : 'Content'}
                        </label>
                        {activeTab === 'password' ? (
                             <div className="relative">
                                 <input 
                                    type="password"
                                    value={newItemSecret}
                                    onChange={e => setNewItemSecret(e.target.value)}
                                    className="w-full bg-nd-gray/10 border border-nd-gray p-2 text-sm text-nd-white outline-none focus:border-nd-white font-mono"
                                    placeholder="••••••••"
                                 />
                             </div>
                        ) : (
                            <textarea 
                                value={newItemSecret}
                                onChange={e => setNewItemSecret(e.target.value)}
                                className="w-full h-32 bg-nd-gray/10 border border-nd-gray p-2 text-sm text-nd-white outline-none focus:border-nd-white font-mono resize-none"
                                placeholder="Enter secure note content..."
                            />
                        )}
                    </div>
                 </div>

                 <button 
                    onClick={addItem}
                    disabled={!newItemTitle || !newItemSecret}
                    className="w-full mt-6 bg-nd-white text-nd-black font-bold py-3 text-sm hover:bg-white/90 disabled:opacity-50 uppercase tracking-widest"
                 >
                    Encrypt & Save
                 </button>
              </div>
           </div>
        )}

      </div>
    </div>
  );
};