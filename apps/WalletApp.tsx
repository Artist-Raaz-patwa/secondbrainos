import React, { useState, useEffect } from 'react';
import { db, auth } from '../services/firebase';
import { ref, onValue, set, push, remove, update } from 'firebase/database';
import { 
  CreditCard, TrendingUp, TrendingDown, LayoutDashboard, 
  Plus, History, DollarSign, Wallet, ArrowUpRight, ArrowDownLeft,
  Sparkles, Loader2, Banknote, Landmark, Smartphone, X, Trash2,
  PieChart, BarChart3, Wifi, ShieldCheck
} from 'lucide-react';
import { useOS } from '../context/OSContext';
import { GoogleGenAI } from "@google/genai";

// --- Types ---

type CardStyle = 'obsidian' | 'glass' | 'mesh' | 'outline';
type CardColor = 'zinc' | 'red' | 'emerald' | 'blue' | 'purple';

interface Account {
  id: string;
  name: string;
  bankName: string; // Added
  lastFour: string; // Added
  type: 'bank' | 'card' | 'cash' | 'crypto';
  balance: number;
  currency: string;
  style: CardStyle; // Added
  color: CardColor; // Added
}

interface Transaction {
  id: string;
  accountId: string;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  date: number; // timestamp
  note: string;
}

// --- Icons Map ---
const ACCT_ICONS = {
  bank: Landmark,
  card: CreditCard,
  cash: Banknote,
  crypto: Smartphone
};

// --- Component ---

export const WalletApp: React.FC = () => {
  const { authStatus, addLog } = useOS();
  
  // View State
  const [view, setView] = useState<'dashboard' | 'accounts' | 'transactions' | 'analytics'>('dashboard');
  
  // Data State
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // --- Card Designer State ---
  const [isAddingAccount, setIsAddingAccount] = useState(false);
  const [newAcctName, setNewAcctName] = useState(''); // Cardholder Name
  const [newBankName, setNewBankName] = useState('');
  const [newLastFour, setNewLastFour] = useState('');
  const [newAcctType, setNewAcctType] = useState<'bank'|'card'|'cash'>('card');
  const [newAcctBalance, setNewAcctBalance] = useState('');
  const [newCardStyle, setNewCardStyle] = useState<CardStyle>('obsidian');
  const [newCardColor, setNewCardColor] = useState<CardColor>('zinc');

  // --- Transaction State ---
  const [isAddingTx, setIsAddingTx] = useState(false);
  const [txAmount, setTxAmount] = useState('');
  const [txType, setTxType] = useState<'income' | 'expense'>('expense');
  const [txCategory, setTxCategory] = useState('');
  const [txAccountId, setTxAccountId] = useState('');
  const [txNote, setTxNote] = useState('');

  // --- Sync ---
  useEffect(() => {
    if (authStatus === 'connected' && auth.currentUser) {
      const uid = auth.currentUser.uid;
      const acctRef = ref(db, `users/${uid}/wallet/accounts`);
      const txRef = ref(db, `users/${uid}/wallet/transactions`);

      const unsubA = onValue(acctRef, s => setAccounts(s.val() ? Object.values(s.val()) : []));
      const unsubT = onValue(txRef, s => {
          const data = s.val() ? Object.values(s.val()) : [];
          // Sort by date desc
          setTransactions((data as Transaction[]).sort((a, b) => b.date - a.date));
      });

      return () => { unsubA(); unsubT(); };
    } else {
       // Local Storage
       const la = localStorage.getItem('nd_os_wallet_accounts');
       if (la) setAccounts(JSON.parse(la));
       const lt = localStorage.getItem('nd_os_wallet_transactions');
       if (lt) setTransactions(JSON.parse(lt));
    }
  }, [authStatus]);

  // --- Persistence Helpers ---
  const persistAccounts = (data: Account[]) => {
      if (authStatus !== 'connected') {
          localStorage.setItem('nd_os_wallet_accounts', JSON.stringify(data));
          setAccounts(data);
      }
  };
  
  const persistTransactions = (data: Transaction[]) => {
      if (authStatus !== 'connected') {
          localStorage.setItem('nd_os_wallet_transactions', JSON.stringify(data));
          setTransactions(data);
      }
  };

  // --- Actions ---

  const addAccount = () => {
    if (!newAcctName || !newAcctBalance) return;
    const newAcct: Account = {
        id: `acc_${Date.now()}`,
        name: newAcctName, // Acts as Cardholder Name
        bankName: newBankName || 'Virtual Bank',
        lastFour: newLastFour || '0000',
        type: newAcctType,
        balance: parseFloat(newAcctBalance),
        currency: 'USD',
        style: newCardStyle,
        color: newCardColor
    };

    if (authStatus === 'connected' && auth.currentUser) {
        set(ref(db, `users/${auth.currentUser.uid}/wallet/accounts/${newAcct.id}`), newAcct);
    } else {
        persistAccounts([...accounts, newAcct]);
    }
    
    // Reset Form
    setNewAcctName('');
    setNewBankName('');
    setNewLastFour('');
    setNewAcctBalance('');
    setIsAddingAccount(false);
    
    addLog({ source: 'Wallet', message: `Card Added: ${newAcct.bankName}`, type: 'success', isCloud: authStatus === 'connected' });
  };

  const addTransaction = () => {
      if (!txAmount || !txAccountId || !txCategory) return;
      const amountVal = parseFloat(txAmount);
      
      const newTx: Transaction = {
          id: `tx_${Date.now()}`,
          accountId: txAccountId,
          amount: amountVal,
          type: txType,
          category: txCategory,
          date: Date.now(),
          note: txNote
      };

      const acct = accounts.find(a => a.id === txAccountId);
      if (!acct) return;

      // Update Account Balance
      const newBalance = txType === 'income' ? acct.balance + amountVal : acct.balance - amountVal;
      const updatedAcct = { ...acct, balance: newBalance };

      if (authStatus === 'connected' && auth.currentUser) {
          const uid = auth.currentUser.uid;
          set(ref(db, `users/${uid}/wallet/transactions/${newTx.id}`), newTx);
          update(ref(db, `users/${uid}/wallet/accounts/${acct.id}`), updatedAcct);
      } else {
          persistTransactions([newTx, ...transactions]);
          const newAccounts = accounts.map(a => a.id === acct.id ? updatedAcct : a);
          persistAccounts(newAccounts);
      }

      setTxAmount('');
      setTxNote('');
      setIsAddingTx(false);
      addLog({ source: 'Wallet', message: `Tx: ${txType.toUpperCase()} $${amountVal}`, type: 'info', isCloud: authStatus === 'connected' });
  };

  const deleteTransaction = (tx: Transaction) => {
      const acct = accounts.find(a => a.id === tx.accountId);
      
      if (authStatus === 'connected' && auth.currentUser) {
          const uid = auth.currentUser.uid;
          remove(ref(db, `users/${uid}/wallet/transactions/${tx.id}`));
          if (acct) {
              const revertedBalance = tx.type === 'income' ? acct.balance - tx.amount : acct.balance + tx.amount;
              update(ref(db, `users/${uid}/wallet/accounts/${acct.id}`), { balance: revertedBalance });
          }
      } else {
          const newTxs = transactions.filter(t => t.id !== tx.id);
          persistTransactions(newTxs);
           if (acct) {
              const revertedBalance = tx.type === 'income' ? acct.balance - tx.amount : acct.balance + tx.amount;
              const newAccts = accounts.map(a => a.id === acct.id ? { ...a, balance: revertedBalance } : a);
              persistAccounts(newAccts);
          }
      }
  };

  const deleteAccount = (id: string) => {
      if (confirm('Delete this card? This cannot be undone.')) {
        if (authStatus === 'connected' && auth.currentUser) {
             const uid = auth.currentUser.uid;
             remove(ref(db, `users/${uid}/wallet/accounts/${id}`));
        } else {
            const newAccts = accounts.filter(a => a.id !== id);
            persistAccounts(newAccts);
        }
      }
  };

  // --- AI Logic ---
  const analyzeFinances = async () => {
      const apiKey = localStorage.getItem('nd_os_api_key') || process.env.API_KEY;
      if (!apiKey) {
          setAiAdvice("Error: API Key missing. Please set it in Settings > AI & Intelligence.");
          return;
      }
      setIsAiLoading(true);
      try {
          const ai = new GoogleGenAI({ apiKey });
          
          // Prepare Data for Context
          const expenseTx = transactions.filter(t => t.type === 'expense');
          const categories: Record<string, number> = {};
          expenseTx.forEach(t => {
              categories[t.category] = (categories[t.category] || 0) + t.amount;
          });
          const topCategories = Object.entries(categories)
             .sort(([,a], [,b]) => b - a)
             .slice(0, 3)
             .map(([c, a]) => `${c} ($${a})`).join(', ');

          const totalSpend = expenseTx.reduce((acc, t) => acc + t.amount, 0);

          const prompt = `
            You are a minimalist, elite financial advisor.
            Data:
            - Total Spend (All Time): $${totalSpend}
            - Top Expense Categories: ${topCategories}
            - Recent Transactions: ${transactions.slice(0, 5).map(t => `${t.type}: $${t.amount} (${t.category})`).join(', ')}
            
            Task:
            1. Analyze the spending behavior.
            2. Provide 3 specific, actionable insights.
            3. Use a direct, slightly robotic, professional tone.
            4. If spending is high on specific things, warn the user.
            
            Output Format:
            - INSIGHT 1: ...
            - INSIGHT 2: ...
            - RECOMMENDATION: ...
          `;

          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt
          });
          
          setAiAdvice(response.text);
      } catch (e) {
          console.error(e);
          setAiAdvice("Neural Link Interference. Analysis failed.");
      } finally {
          setIsAiLoading(false);
      }
  };

  // --- Computed ---
  const totalBalance = accounts.reduce((acc, a) => acc + a.balance, 0);
  const incomeThisMonth = transactions
     .filter(t => t.type === 'income' && new Date(t.date).getMonth() === new Date().getMonth())
     .reduce((acc, t) => acc + t.amount, 0);
  const expenseThisMonth = transactions
     .filter(t => t.type === 'expense' && new Date(t.date).getMonth() === new Date().getMonth())
     .reduce((acc, t) => acc + t.amount, 0);

  // --- Render Helpers ---

  // Generate CSS classes for cards based on style/color
  const getCardClasses = (style: CardStyle, color: CardColor) => {
     const colorMap = {
        zinc: 'from-zinc-800 to-zinc-900 border-zinc-700',
        red: 'from-red-900 to-nd-black border-red-900',
        emerald: 'from-emerald-900 to-nd-black border-emerald-900',
        blue: 'from-blue-900 to-nd-black border-blue-900',
        purple: 'from-purple-900 to-nd-black border-purple-900'
     };

     const base = "relative overflow-hidden transition-all duration-300";
     
     switch(style) {
         case 'obsidian':
             return `${base} bg-gradient-to-br ${colorMap[color]} border shadow-xl`;
         case 'glass':
             return `${base} bg-white/5 backdrop-blur-xl border border-white/10 shadow-lg`;
         case 'mesh':
             return `${base} bg-gradient-to-br ${colorMap[color]} bg-[url('https://grainy-gradients.vercel.app/noise.svg')] border-0 shadow-2xl`;
         case 'outline':
             return `${base} bg-transparent border-2 border-dashed ${color === 'zinc' ? 'border-zinc-700' : `border-${color}-500/50`}`;
         default:
             return `${base} bg-black border border-zinc-800`;
     }
  };

  const VisualCard = ({ data, preview }: { data: Partial<Account>, preview?: boolean }) => {
     const classes = getCardClasses(data.style || 'obsidian', data.color || 'zinc');
     
     return (
        <div className={`aspect-[1.586/1] w-full rounded-2xl p-6 flex flex-col justify-between select-none ${classes} ${preview ? 'transform scale-100' : 'group hover:-translate-y-1'}`}>
            <div className="flex justify-between items-start z-10">
                <div className="flex items-center gap-2">
                    <ChipIcon />
                    <Wifi size={16} className="text-white/50 rotate-90" />
                </div>
                <span className="font-mono text-sm uppercase tracking-widest text-white/70">{data.bankName || 'BANK'}</span>
            </div>
            
            <div className="z-10">
                <div className="text-2xl font-mono text-white tracking-widest mb-1">
                    •••• •••• •••• {data.lastFour || '0000'}
                </div>
                <div className="flex justify-between items-end">
                    <div>
                        <div className="text-[10px] text-white/50 uppercase">Card Holder</div>
                        <div className="font-mono text-sm text-white">{data.name || 'NAME'}</div>
                    </div>
                    <div>
                         <div className="text-[10px] text-white/50 uppercase text-right">Balance</div>
                         <div className="font-mono text-lg font-bold text-white">${data.balance?.toLocaleString() || '0.00'}</div>
                    </div>
                </div>
            </div>

            {/* Decorative Overlay for Glass/Mesh */}
            {data.style === 'glass' && <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />}
            {data.style === 'mesh' && <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-[50px] rounded-full pointer-events-none" />}
        </div>
     );
  };

  return (
    <div className="flex h-full bg-nd-black text-nd-white font-sans divide-x divide-nd-gray overflow-hidden">
        
        {/* Sidebar */}
        <div className="w-[60px] md:w-[200px] flex-shrink-0 bg-nd-black flex flex-col pt-4">
            <NavButton active={view === 'dashboard'} onClick={() => setView('dashboard')} icon={LayoutDashboard} label="Dashboard" />
            <NavButton active={view === 'accounts'} onClick={() => setView('accounts')} icon={Wallet} label="Cards" />
            <NavButton active={view === 'analytics'} onClick={() => setView('analytics')} icon={BarChart3} label="Analytics" />
            <NavButton active={view === 'transactions'} onClick={() => setView('transactions')} icon={History} label="History" />
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-nd-black relative">
            
            {/* Top Bar */}
            <div className="h-[60px] border-b border-nd-gray flex items-center justify-between px-6 bg-nd-black shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 border border-nd-white bg-nd-white text-nd-black">
                        <DollarSign size={16} strokeWidth={3} />
                    </div>
                    <div>
                        <h1 className="font-bold text-sm tracking-wide uppercase">Smart Wallet</h1>
                        <p className="text-[10px] text-nd-gray font-mono">FINANCE OS 2.0</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                        <div className="text-[10px] text-nd-gray uppercase tracking-widest">Net Worth</div>
                        <div className="font-mono text-xl font-bold tracking-tight">${totalBalance.toLocaleString()}</div>
                    </div>
                    <button 
                        onClick={() => { setIsAddingTx(true); }}
                        className="bg-nd-white text-nd-black px-3 py-1.5 text-xs font-bold flex items-center gap-2 hover:bg-white/90"
                    >
                        <Plus size={14} /> <span className="hidden sm:inline">TRANSACTION</span>
                    </button>
                </div>
            </div>

            {/* Scroll Area */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8">
                
                {/* VIEW: DASHBOARD */}
                {view === 'dashboard' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        {/* Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="border border-nd-gray p-5 flex items-center justify-between group hover:border-nd-white transition-colors bg-gradient-to-r from-black to-zinc-900">
                                <div>
                                    <div className="text-[10px] text-nd-gray uppercase tracking-widest mb-1">Income (Month)</div>
                                    <div className="text-2xl font-mono text-nd-white group-hover:text-green-400 transition-colors">
                                        +${incomeThisMonth.toLocaleString()}
                                    </div>
                                </div>
                                <div className="p-3 bg-nd-gray/10 rounded-full text-nd-gray group-hover:text-green-400 transition-colors">
                                    <ArrowUpRight size={20} />
                                </div>
                            </div>
                            <div className="border border-nd-gray p-5 flex items-center justify-between group hover:border-nd-white transition-colors bg-gradient-to-r from-black to-zinc-900">
                                <div>
                                    <div className="text-[10px] text-nd-gray uppercase tracking-widest mb-1">Expense (Month)</div>
                                    <div className="text-2xl font-mono text-nd-white group-hover:text-nd-red transition-colors">
                                        -${expenseThisMonth.toLocaleString()}
                                    </div>
                                </div>
                                <div className="p-3 bg-nd-gray/10 rounded-full text-nd-gray group-hover:text-nd-red transition-colors">
                                    <ArrowDownLeft size={20} />
                                </div>
                            </div>
                        </div>

                        {/* Recent Activity */}
                        <div>
                            <div className="flex items-center justify-between mb-4 border-b border-nd-gray pb-2">
                                <h3 className="font-bold text-sm uppercase">Recent Activity</h3>
                                <button onClick={() => setView('transactions')} className="text-[10px] text-nd-gray hover:text-nd-white underline">VIEW ALL</button>
                            </div>
                            <div className="space-y-2">
                                {transactions.slice(0, 5).map(tx => (
                                    <TransactionRow key={tx.id} tx={tx} accountName={accounts.find(a => a.id === tx.accountId)?.name} />
                                ))}
                                {transactions.length === 0 && (
                                    <div className="text-center py-8 text-nd-gray text-xs font-mono opacity-50">NO DATA RECORDED</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* VIEW: ANALYTICS */}
                {view === 'analytics' && (
                    <div className="space-y-8 animate-in fade-in">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-bold font-mono">FINANCIAL INTELLIGENCE</h2>
                            <button 
                                onClick={analyzeFinances}
                                disabled={isAiLoading}
                                className="flex items-center gap-2 border border-nd-white px-4 py-2 text-xs font-bold hover:bg-nd-white hover:text-nd-black transition-all"
                            >
                                <Sparkles size={14} className={isAiLoading ? "animate-spin" : "text-nd-red"} />
                                {isAiLoading ? 'PROCESSING...' : 'ANALYZE SPENDING'}
                            </button>
                        </div>

                        {/* AI Insight Box */}
                        {aiAdvice && (
                            <div className="bg-nd-gray/5 border border-nd-gray p-6 relative overflow-hidden">
                                <div className="absolute top-0 right-0 p-4 opacity-5"><Sparkles size={120} /></div>
                                <div className="relative z-10 font-mono text-sm leading-relaxed whitespace-pre-wrap">
                                    {aiAdvice}
                                </div>
                            </div>
                        )}

                        {/* Category Breakdown */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                             <div>
                                <h3 className="text-xs font-bold uppercase tracking-widest text-nd-gray mb-4">Spending by Category</h3>
                                <div className="space-y-4">
                                    {Object.entries(
                                        transactions
                                            .filter(t => t.type === 'expense')
                                            .reduce((acc, t) => {
                                                acc[t.category] = (acc[t.category] || 0) + t.amount;
                                                return acc;
                                            }, {} as Record<string, number>)
                                    )
                                    .sort(([,a], [,b]) => b - a)
                                    .map(([cat, amount], idx, arr) => {
                                        const total = arr.reduce((sum, [,a]) => sum + a, 0);
                                        const percent = (amount / total) * 100;
                                        return (
                                            <div key={cat} className="group">
                                                <div className="flex justify-between text-xs mb-1">
                                                    <span className="font-bold">{cat}</span>
                                                    <span className="font-mono text-nd-gray">${amount.toLocaleString()} ({percent.toFixed(0)}%)</span>
                                                </div>
                                                <div className="h-2 bg-nd-gray/10 w-full rounded-full overflow-hidden">
                                                    <div className="h-full bg-nd-white group-hover:bg-nd-red transition-colors" style={{ width: `${percent}%` }} />
                                                </div>
                                            </div>
                                        )
                                    })}
                                    {transactions.filter(t => t.type === 'expense').length === 0 && (
                                        <div className="text-center text-xs text-nd-gray py-4">Not enough data for visualization</div>
                                    )}
                                </div>
                             </div>

                             <div>
                                 <h3 className="text-xs font-bold uppercase tracking-widest text-nd-gray mb-4">Cash Flow Health</h3>
                                 <div className="aspect-video border border-nd-gray bg-nd-black flex items-center justify-center relative p-8">
                                     {/* Simple Visualization of Flow */}
                                     <div className="flex gap-4 items-end h-full w-full justify-center">
                                         <div className="w-20 bg-green-900/50 border border-green-500 relative group transition-all hover:bg-green-500/20" style={{ height: `${Math.min(100, (incomeThisMonth / (incomeThisMonth + expenseThisMonth || 1)) * 100)}%` }}>
                                             <div className="absolute -top-6 w-full text-center text-xs font-mono text-green-500">${incomeThisMonth}</div>
                                             <div className="absolute bottom-2 w-full text-center text-[10px] uppercase text-green-500 font-bold">In</div>
                                         </div>
                                         <div className="w-20 bg-red-900/50 border border-nd-red relative group transition-all hover:bg-nd-red/20" style={{ height: `${Math.min(100, (expenseThisMonth / (incomeThisMonth + expenseThisMonth || 1)) * 100)}%` }}>
                                             <div className="absolute -top-6 w-full text-center text-xs font-mono text-nd-red">${expenseThisMonth}</div>
                                              <div className="absolute bottom-2 w-full text-center text-[10px] uppercase text-nd-red font-bold">Out</div>
                                         </div>
                                     </div>
                                 </div>
                             </div>
                        </div>
                    </div>
                )}

                {/* VIEW: ACCOUNTS */}
                {view === 'accounts' && (
                    <div className="space-y-6">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-bold font-mono">YOUR CARDS</h2>
                            <button 
                                onClick={() => setIsAddingAccount(true)}
                                className="bg-nd-white text-nd-black px-4 py-2 text-xs font-bold hover:bg-white/90 flex items-center gap-2"
                            >
                                <Plus size={14} /> ADD CARD
                            </button>
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                             {accounts.map(acc => (
                                 <div key={acc.id} className="relative group">
                                     <VisualCard data={acc} />
                                     <button 
                                        onClick={() => deleteAccount(acc.id)}
                                        className="absolute top-2 right-2 p-2 text-white/50 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all z-20 bg-black/50 rounded-full"
                                     >
                                        <Trash2 size={16} />
                                     </button>
                                 </div>
                             ))}
                        </div>
                        
                        {/* CARD DESIGNER MODAL */}
                        {isAddingAccount && (
                            <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4">
                                <div className="bg-nd-black border border-nd-white w-full max-w-4xl shadow-2xl flex flex-col md:flex-row max-h-[90vh] overflow-hidden">
                                    
                                    {/* Left: Controls */}
                                    <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col gap-6 overflow-y-auto">
                                        <div className="flex justify-between items-center border-b border-nd-gray pb-4">
                                            <h3 className="font-bold text-lg uppercase tracking-wide">Card Designer</h3>
                                            <button onClick={() => setIsAddingAccount(false)}><X size={20} className="text-nd-gray hover:text-nd-white" /></button>
                                        </div>

                                        <div className="space-y-4">
                                            <div>
                                                <label className="text-xs text-nd-gray uppercase block mb-1">Card Style</label>
                                                <div className="grid grid-cols-4 gap-2">
                                                    {(['obsidian', 'glass', 'mesh', 'outline'] as CardStyle[]).map(s => (
                                                        <button 
                                                            key={s} 
                                                            onClick={() => setNewCardStyle(s)}
                                                            className={`py-2 text-[10px] border uppercase transition-colors ${newCardStyle === s ? 'bg-nd-white text-nd-black border-nd-white' : 'border-nd-gray text-nd-gray hover:border-nd-white'}`}
                                                        >
                                                            {s}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-xs text-nd-gray uppercase block mb-1">Color Theme</label>
                                                <div className="flex gap-2">
                                                    {(['zinc', 'red', 'emerald', 'blue', 'purple'] as CardColor[]).map(c => (
                                                        <button 
                                                            key={c} 
                                                            onClick={() => setNewCardColor(c)}
                                                            className={`w-8 h-8 rounded-full border-2 transition-transform ${newCardColor === c ? 'scale-110 border-white' : 'border-transparent hover:scale-105'}`}
                                                            style={{ 
                                                                backgroundColor: c === 'zinc' ? '#333' : c === 'red' ? '#7f1d1d' : c === 'emerald' ? '#064e3b' : c === 'blue' ? '#1e3a8a' : '#581c87' 
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-xs text-nd-gray uppercase block mb-1">Cardholder Name</label>
                                                    <input 
                                                        value={newAcctName}
                                                        onChange={e => setNewAcctName(e.target.value)}
                                                        className="w-full bg-nd-gray/10 border border-nd-gray p-2 text-sm text-nd-white outline-none focus:border-nd-white"
                                                        placeholder="J. DOE"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-nd-gray uppercase block mb-1">Bank Name</label>
                                                    <input 
                                                        value={newBankName}
                                                        onChange={e => setNewBankName(e.target.value)}
                                                        className="w-full bg-nd-gray/10 border border-nd-gray p-2 text-sm text-nd-white outline-none focus:border-nd-white"
                                                        placeholder="NEOBANK"
                                                    />
                                                </div>
                                            </div>
                                            
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <label className="text-xs text-nd-gray uppercase block mb-1">Last 4 Digits</label>
                                                    <input 
                                                        value={newLastFour}
                                                        maxLength={4}
                                                        onChange={e => setNewLastFour(e.target.value)}
                                                        className="w-full bg-nd-gray/10 border border-nd-gray p-2 text-sm text-nd-white outline-none focus:border-nd-white font-mono"
                                                        placeholder="4242"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs text-nd-gray uppercase block mb-1">Balance ($)</label>
                                                    <input 
                                                        type="number"
                                                        value={newAcctBalance}
                                                        onChange={e => setNewAcctBalance(e.target.value)}
                                                        className="w-full bg-nd-gray/10 border border-nd-gray p-2 text-sm text-nd-white outline-none focus:border-nd-white font-mono"
                                                        placeholder="0.00"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <button 
                                            onClick={addAccount}
                                            disabled={!newAcctName || !newAcctBalance}
                                            className="mt-auto w-full py-3 bg-nd-white text-nd-black font-bold uppercase hover:bg-white/90 disabled:opacity-50"
                                        >
                                            Issue Card
                                        </button>
                                    </div>

                                    {/* Right: Preview */}
                                    <div className="w-full md:w-1/2 bg-zinc-900 flex flex-col items-center justify-center p-8 border-l border-nd-gray relative">
                                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-800 to-black opacity-50" />
                                        <h4 className="text-xs text-nd-gray uppercase tracking-[0.2em] mb-8 relative z-10">Live Preview</h4>
                                        <div className="w-full max-w-sm relative z-10 transform transition-transform hover:scale-105 duration-500">
                                            <VisualCard 
                                                data={{ 
                                                    name: newAcctName || 'CARD HOLDER', 
                                                    bankName: newBankName || 'BANK NAME', 
                                                    lastFour: newLastFour || '0000', 
                                                    balance: parseFloat(newAcctBalance) || 0,
                                                    style: newCardStyle,
                                                    color: newCardColor
                                                }} 
                                                preview 
                                            />
                                        </div>
                                    </div>

                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* VIEW: TRANSACTIONS */}
                {view === 'transactions' && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-xl font-bold font-mono">HISTORY</h2>
                        </div>
                        <div className="border border-nd-gray bg-nd-black min-h-[400px]">
                            {transactions.length === 0 ? (
                                <div className="p-10 text-center text-nd-gray opacity-50 font-mono text-sm">
                                    NO TRANSACTIONS LOGGED
                                </div>
                            ) : (
                                <div className="divide-y divide-nd-gray/20">
                                    {transactions.map(tx => (
                                        <TransactionRow 
                                            key={tx.id} 
                                            tx={tx} 
                                            accountName={accounts.find(a => a.id === tx.accountId)?.name} 
                                            onDelete={() => deleteTransaction(tx)}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

            </div>

            {/* Add Transaction Modal */}
            {isAddingTx && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                    <div className="bg-nd-black border border-nd-white p-6 w-full max-w-sm space-y-4 shadow-2xl relative">
                        <button onClick={() => setIsAddingTx(false)} className="absolute top-4 right-4 text-nd-gray hover:text-nd-white"><X size={16}/></button>
                        
                        <h3 className="font-bold text-lg border-b border-nd-gray pb-2 uppercase tracking-wide">Log Transaction</h3>
                        
                        {/* Type Toggle */}
                        <div className="flex border border-nd-gray">
                            <button 
                                onClick={() => setTxType('expense')}
                                className={`flex-1 py-2 text-xs font-bold uppercase transition-colors ${txType === 'expense' ? 'bg-nd-red text-white' : 'text-nd-gray hover:text-nd-white'}`}
                            >
                                Expense
                            </button>
                            <button 
                                onClick={() => setTxType('income')}
                                className={`flex-1 py-2 text-xs font-bold uppercase transition-colors ${txType === 'income' ? 'bg-green-500 text-black' : 'text-nd-gray hover:text-nd-white'}`}
                            >
                                Income
                            </button>
                        </div>

                        {/* Amount */}
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-nd-gray">$</span>
                            <input 
                                type="number"
                                autoFocus
                                placeholder="0.00"
                                value={txAmount}
                                onChange={e => setTxAmount(e.target.value)}
                                className="w-full bg-nd-gray/10 border border-nd-gray p-3 pl-8 text-xl font-mono text-nd-white outline-none focus:border-nd-white"
                            />
                        </div>

                        {/* Account Selector */}
                        <select 
                            value={txAccountId}
                            onChange={e => setTxAccountId(e.target.value)}
                            className="w-full bg-nd-gray/10 border border-nd-gray p-2 text-sm text-nd-white outline-none focus:border-nd-white appearance-none"
                        >
                            <option value="">Select Account</option>
                            {accounts.map(a => (
                                <option key={a.id} value={a.id}>{a.name} (${a.balance})</option>
                            ))}
                        </select>

                        {/* Category */}
                        <div className="grid grid-cols-3 gap-2">
                            {['Food', 'Transport', 'Tech', 'Home', 'Work', 'Health'].map(c => (
                                <button 
                                    key={c}
                                    onClick={() => setTxCategory(c)}
                                    className={`py-1.5 text-[10px] border uppercase ${txCategory === c ? 'bg-nd-white text-nd-black border-nd-white' : 'border-nd-gray text-nd-gray hover:border-nd-white'}`}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                        
                        <input 
                            placeholder="Note (Optional)"
                            value={txNote}
                            onChange={e => setTxNote(e.target.value)}
                            className="w-full bg-nd-gray/10 border border-nd-gray p-2 text-xs text-nd-white outline-none focus:border-nd-white"
                        />

                        <button 
                            onClick={addTransaction} 
                            disabled={!txAmount || !txAccountId || !txCategory}
                            className="w-full bg-nd-white text-nd-black font-bold py-3 text-sm hover:bg-white/90 disabled:opacity-50"
                        >
                            CONFIRM
                        </button>
                    </div>
                </div>
            )}

        </div>
    </div>
  );
};

// --- Sub Components ---

const ChipIcon = () => (
    <div className="w-10 h-8 bg-gradient-to-br from-yellow-200 to-yellow-500 rounded-md border border-yellow-600/50 flex relative overflow-hidden">
        <div className="absolute top-2 left-0 w-full h-px bg-yellow-600/50" />
        <div className="absolute bottom-2 left-0 w-full h-px bg-yellow-600/50" />
        <div className="absolute left-3 top-0 h-full w-px bg-yellow-600/50" />
        <div className="absolute right-3 top-0 h-full w-px bg-yellow-600/50" />
    </div>
);

const NavButton = ({ active, onClick, icon: Icon, label }: any) => (
    <button 
        onClick={onClick}
        className={`flex items-center gap-3 px-4 py-3 mx-2 transition-all duration-200 border border-transparent mb-1 ${
            active 
                ? 'bg-nd-white text-nd-black border-nd-white' 
                : 'text-nd-gray hover:text-nd-white hover:bg-nd-gray/10'
        }`}
    >
        <Icon size={18} />
        <span className="hidden md:inline font-medium text-sm">{label}</span>
    </button>
);

const TransactionRow = ({ tx, accountName, onDelete }: { tx: Transaction, accountName?: string, onDelete?: () => void }) => (
    <div className="flex items-center justify-between p-3 hover:bg-nd-gray/5 group transition-colors">
        <div className="flex items-center gap-3">
             <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.type === 'income' ? 'bg-green-500/20 text-green-500' : 'bg-nd-red/20 text-nd-red'}`}>
                 {tx.type === 'income' ? <ArrowUpRight size={14} /> : <ArrowDownLeft size={14} />}
             </div>
             <div>
                 <p className="text-sm font-bold text-nd-white">{tx.category || 'Uncategorized'}</p>
                 <div className="flex items-center gap-2 text-[10px] text-nd-gray">
                     <span>{new Date(tx.date).toLocaleDateString()}</span>
                     {accountName && <><span>•</span><span>{accountName}</span></>}
                 </div>
             </div>
        </div>
        <div className="flex items-center gap-4">
             <span className={`font-mono font-bold ${tx.type === 'income' ? 'text-green-500' : 'text-nd-white'}`}>
                 {tx.type === 'income' ? '+' : '-'}${tx.amount.toLocaleString()}
             </span>
             {onDelete && (
                 <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="text-nd-gray hover:text-nd-red opacity-0 group-hover:opacity-100 transition-opacity">
                     <Trash2 size={14} />
                 </button>
             )}
        </div>
    </div>
);