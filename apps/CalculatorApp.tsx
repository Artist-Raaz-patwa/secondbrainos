import React, { useState, useEffect, useCallback } from 'react';
import { db, auth } from '../services/firebase';
import { ref, onValue, set, push, remove } from 'firebase/database';
import { 
  Calculator, RotateCcw, Trash2, History, Scale,
  Delete, Divide, X as XIcon, Plus, Minus, Equal,
  ChevronRight
} from 'lucide-react';
import { useOS } from '../context/OSContext';

// --- Types ---
type Mode = 'standard' | 'scientific' | 'converter';

interface CalcHistoryItem {
  id: string;
  expression: string;
  result: string;
  timestamp: number;
}

// Converter Data
const CONVERTERS = {
    length: {
        units: ['m', 'km', 'cm', 'mm', 'ft', 'in', 'mi', 'yd'],
        ratios: { m: 1, km: 1000, cm: 0.01, mm: 0.001, ft: 0.3048, in: 0.0254, mi: 1609.34, yd: 0.9144 }
    },
    mass: {
        units: ['kg', 'g', 'mg', 'lb', 'oz'],
        ratios: { kg: 1, g: 0.001, mg: 0.000001, lb: 0.453592, oz: 0.0283495 }
    },
    temp: {
        units: ['C', 'F', 'K'],
        // Temp is special, handled by logic
    }
};

export const CalculatorApp: React.FC = () => {
  const { authStatus, addLog } = useOS();
  
  // State
  const [mode, setMode] = useState<Mode>('standard');
  const [input, setInput] = useState('');
  const [result, setResult] = useState('');
  const [history, setHistory] = useState<CalcHistoryItem[]>([]);
  
  // Converter State
  const [convType, setConvType] = useState<'length'|'mass'|'temp'>('length');
  const [fromUnit, setFromUnit] = useState('m');
  const [toUnit, setToUnit] = useState('ft');
  const [convValue, setConvValue] = useState('');
  const [convResult, setConvResult] = useState('');

  // --- Sync History ---
  useEffect(() => {
    if (authStatus === 'connected' && auth.currentUser) {
       const hRef = ref(db, `users/${auth.currentUser.uid}/calculator/history`);
       const unsub = onValue(hRef, s => {
           const val = s.val();
           const data = val ? (Object.values(val) as CalcHistoryItem[]) : [];
           setHistory(data.sort((a, b) => b.timestamp - a.timestamp));
       });
       return () => unsub();
    } else {
       const local = localStorage.getItem('nd_os_calc_history');
       if (local) setHistory(JSON.parse(local));
    }
  }, [authStatus]);

  const saveHistoryItem = (expression: string, res: string) => {
      const newItem: CalcHistoryItem = {
          id: `h_${Date.now()}`,
          expression,
          result: res,
          timestamp: Date.now()
      };
      
      if (authStatus === 'connected' && auth.currentUser) {
          push(ref(db, `users/${auth.currentUser.uid}/calculator/history`), newItem);
      } else {
          const newHist = [newItem, ...history].slice(0, 50); // Limit local to 50
          setHistory(newHist);
          localStorage.setItem('nd_os_calc_history', JSON.stringify(newHist));
      }
  };
  
  const clearHistory = () => {
      if (authStatus === 'connected' && auth.currentUser) {
          set(ref(db, `users/${auth.currentUser.uid}/calculator/history`), {});
      } else {
          setHistory([]);
          localStorage.removeItem('nd_os_calc_history');
      }
  };

  // --- Logic ---

  const handlePress = (val: string) => {
      if (val === 'C') {
          setInput('');
          setResult('');
      } else if (val === 'DEL') {
          setInput(prev => prev.slice(0, -1));
      } else if (val === '=') {
          calculate();
      } else if (val === 'sqrt') {
          setInput(prev => `sqrt(${prev})`);
      } else if (val === 'pow') {
           setInput(prev => `${prev}^`);
      } else {
          // Prevent multiple operators
          const lastChar = input.slice(-1);
          const isOp = ['+','-','*','/','^','.','('].includes(val);
          const lastIsOp = ['+','-','*','/','^','.'].includes(lastChar);
          
          if (isOp && lastIsOp && val !== '(') {
              setInput(prev => prev.slice(0, -1) + val);
          } else {
              setInput(prev => prev + val);
          }
      }
  };

  const calculate = () => {
      try {
          // Safe eval replacement (simple parser logic or use Function)
          // For simplicity in this demo, using Function but sanitizing
          // Replace symbols for JS
          let evalString = input
             .replace(/x/g, '*')
             .replace(/\^/g, '**')
             .replace(/sin/g, 'Math.sin')
             .replace(/cos/g, 'Math.cos')
             .replace(/tan/g, 'Math.tan')
             .replace(/log/g, 'Math.log10')
             .replace(/ln/g, 'Math.log')
             .replace(/sqrt/g, 'Math.sqrt')
             .replace(/pi/g, 'Math.PI')
             .replace(/e/g, 'Math.E');

          // Extremely basic sanitization
          if (/[^0-9+\-*/().MathPIE\s]/.test(evalString)) throw new Error("Invalid Input");

          const res = new Function(`return ${evalString}`)();
          const formatted = String(Math.round(res * 100000000) / 100000000); // Precision fix
          
          setResult(formatted);
          saveHistoryItem(input, formatted);
      } catch (e) {
          setResult('Error');
      }
  };
  
  const handleKeyboard = useCallback((e: KeyboardEvent) => {
      const key = e.key;
      if (/[0-9+\-*/.()^]/.test(key)) handlePress(key);
      if (key === 'Enter') calculate();
      if (key === 'Backspace') handlePress('DEL');
      if (key === 'Escape') handlePress('C');
  }, [input]);

  useEffect(() => {
      window.addEventListener('keydown', handleKeyboard);
      return () => window.removeEventListener('keydown', handleKeyboard);
  }, [handleKeyboard]);

  // --- Converter Logic ---
  useEffect(() => {
      if (!convValue) {
          setConvResult('');
          return;
      }
      const val = parseFloat(convValue);
      if (isNaN(val)) return;

      if (convType === 'temp') {
          let res = val;
          if (fromUnit === 'C' && toUnit === 'F') res = (val * 9/5) + 32;
          else if (fromUnit === 'F' && toUnit === 'C') res = (val - 32) * 5/9;
          else if (fromUnit === 'C' && toUnit === 'K') res = val + 273.15;
          else if (fromUnit === 'K' && toUnit === 'C') res = val - 273.15;
          else if (fromUnit === 'F' && toUnit === 'K') res = (val - 32) * 5/9 + 273.15;
          else if (fromUnit === 'K' && toUnit === 'F') res = (val - 273.15) * 9/5 + 32;
          setConvResult(res.toFixed(2));
      } else {
          // Length/Mass
          const ratios = CONVERTERS[convType].ratios as Record<string, number>;
          const base = val * ratios[fromUnit];
          const target = base / ratios[toUnit];
          setConvResult(target.toFixed(4));
      }

  }, [convValue, fromUnit, toUnit, convType]);

  // --- Render ---
  
  const Btn = ({ v, op, accent, double }: any) => (
      <button 
        onClick={() => handlePress(v)}
        className={`
           rounded-lg text-lg font-mono transition-all active:scale-95 flex items-center justify-center
           ${double ? 'col-span-2' : ''}
           ${accent ? 'bg-nd-white text-nd-black hover:bg-white/90' : 
             op ? 'bg-nd-gray/20 text-nd-red border border-nd-gray/30 hover:bg-nd-gray/40' : 
             'bg-nd-black border border-nd-gray text-nd-white hover:bg-nd-gray/10'}
        `}
      >
          {v === '*' ? <XIcon size={18}/> : v === '/' ? <Divide size={18}/> : v}
      </button>
  );

  return (
    <div className="flex h-full bg-nd-black text-nd-white font-sans overflow-hidden divide-x divide-nd-gray">
        
        {/* Sidebar: History */}
        <div className="w-[60px] md:w-[250px] bg-nd-black flex flex-col flex-shrink-0">
            <div className="p-4 border-b border-nd-gray h-[60px] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <History size={16} className="text-nd-red" />
                    <span className="hidden md:inline font-bold uppercase tracking-widest text-xs">Tape</span>
                </div>
                <button onClick={clearHistory} className="hidden md:block text-nd-gray hover:text-nd-red"><Trash2 size={14} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
                {history.length === 0 ? (
                    <div className="text-center p-8 text-nd-gray opacity-30 text-xs hidden md:block">NO HISTORY</div>
                ) : (
                    history.map(item => (
                        <button 
                            key={item.id}
                            onClick={() => setInput(item.result)}
                            className="w-full text-left p-4 border-b border-nd-gray/10 hover:bg-nd-gray/5 group transition-colors"
                        >
                            <div className="text-xs text-nd-gray font-mono mb-1 truncate">{item.expression} =</div>
                            <div className="text-lg font-mono text-nd-white font-bold truncate">{item.result}</div>
                            <div className="text-[10px] text-nd-gray mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {new Date(item.timestamp).toLocaleTimeString()}
                            </div>
                        </button>
                    ))
                )}
            </div>
        </div>

        {/* Main Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-nd-black">
             
             {/* Mode Switcher */}
             <div className="h-[60px] border-b border-nd-gray flex items-center px-4 gap-2 bg-nd-black shrink-0">
                 {[
                     { id: 'standard', icon: Calculator, label: 'Standard' },
                     { id: 'scientific', icon: ChevronRight, label: 'Scientific' },
                     { id: 'converter', icon: Scale, label: 'Converter' }
                 ].map(m => (
                     <button
                        key={m.id}
                        onClick={() => setMode(m.id as Mode)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-bold uppercase transition-all ${mode === m.id ? 'bg-nd-white text-nd-black' : 'text-nd-gray hover:text-nd-white hover:bg-nd-gray/10'}`}
                     >
                         <m.icon size={14} /> <span className="hidden sm:inline">{m.label}</span>
                     </button>
                 ))}
             </div>

             {/* Content */}
             <div className="flex-1 p-6 flex flex-col">
                 
                 {mode === 'converter' ? (
                     <div className="flex-1 flex flex-col items-center justify-center max-w-lg mx-auto w-full gap-8 animate-in fade-in">
                         {/* Type Selector */}
                         <div className="flex border border-nd-gray rounded-lg overflow-hidden w-full">
                             {['length', 'mass', 'temp'].map(t => (
                                 <button
                                    key={t}
                                    onClick={() => { setConvType(t as any); setFromUnit(CONVERTERS[t as keyof typeof CONVERTERS].units[0]); setToUnit(CONVERTERS[t as keyof typeof CONVERTERS].units[1]); }}
                                    className={`flex-1 py-3 text-xs font-bold uppercase ${convType === t ? 'bg-nd-white text-nd-black' : 'bg-nd-black text-nd-gray hover:text-nd-white'}`}
                                 >
                                     {t}
                                 </button>
                             ))}
                         </div>

                         {/* Input / Output */}
                         <div className="w-full space-y-4">
                             <div className="flex gap-4 items-center">
                                 <input 
                                     type="number"
                                     value={convValue}
                                     onChange={e => setConvValue(e.target.value)}
                                     placeholder="0"
                                     className="flex-1 bg-nd-gray/10 border border-nd-gray p-4 text-2xl font-mono text-nd-white outline-none focus:border-nd-white rounded-xl"
                                 />
                                 <select 
                                    value={fromUnit}
                                    onChange={e => setFromUnit(e.target.value)}
                                    className="w-24 bg-nd-black border border-nd-gray p-2 text-nd-white outline-none rounded-lg"
                                 >
                                     {CONVERTERS[convType].units.map(u => <option key={u} value={u}>{u}</option>)}
                                 </select>
                             </div>

                             <div className="flex justify-center text-nd-gray"><RotateCcw className="rotate-90" size={24}/></div>

                             <div className="flex gap-4 items-center">
                                 <div className="flex-1 bg-nd-gray/5 border border-nd-gray/50 p-4 text-2xl font-mono text-nd-red outline-none rounded-xl min-h-[66px] flex items-center">
                                     {convResult || '0'}
                                 </div>
                                 <select 
                                    value={toUnit}
                                    onChange={e => setToUnit(e.target.value)}
                                    className="w-24 bg-nd-black border border-nd-gray p-2 text-nd-white outline-none rounded-lg"
                                 >
                                     {CONVERTERS[convType].units.map(u => <option key={u} value={u}>{u}</option>)}
                                 </select>
                             </div>
                         </div>
                     </div>
                 ) : (
                     <div className="flex-1 flex flex-col h-full max-w-md mx-auto w-full animate-in fade-in">
                         {/* Display */}
                         <div className="bg-nd-gray/5 border border-nd-gray rounded-xl p-6 mb-6 text-right flex flex-col justify-end min-h-[120px]">
                             <div className="text-nd-gray text-sm font-mono h-6 truncate">{input || '0'}</div>
                             <div className="text-4xl md:text-5xl font-bold font-mono text-nd-white truncate">{result || (input ? '' : '0')}</div>
                         </div>

                         {/* Keypad */}
                         <div className={`grid gap-3 flex-1 ${mode === 'scientific' ? 'grid-cols-5' : 'grid-cols-4'}`}>
                             {mode === 'scientific' && (
                                 <>
                                     <Btn v="sin" op /> <Btn v="cos" op /> <Btn v="tan" op /> <Btn v="log" op /> <Btn v="ln" op />
                                     <Btn v="(" op /> <Btn v=")" op /> <Btn v="sqrt" op /> <Btn v="pow" op /> <Btn v="pi" op />
                                 </>
                             )}
                             
                             <Btn v="C" op /> <Btn v="DEL" op /> <Btn v="%" op /> <Btn v="/" op />
                             <Btn v="7" /> <Btn v="8" /> <Btn v="9" /> <Btn v="*" op />
                             <Btn v="4" /> <Btn v="5" /> <Btn v="6" /> <Btn v="-" op />
                             <Btn v="1" /> <Btn v="2" /> <Btn v="3" /> <Btn v="+" op />
                             <Btn v="0" double /> <Btn v="." /> <Btn v="=" accent />
                         </div>
                     </div>
                 )}
             </div>
        </div>
    </div>
  );
};