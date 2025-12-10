import React, { useState, useEffect } from 'react';
import { useOS } from '../../context/OSContext';
import { ArrowRight, Lock, User, Mail, AlertCircle, Loader2 } from 'lucide-react';
import { auth } from '../../services/firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

export const LockScreen: React.FC = () => {
  const { setPowerState, authStatus } = useOS();
  const [time, setTime] = useState(new Date());
  
  // Auth State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Check if we are "Locked" (Session active) or "Logged Out"
  const currentUser = auth.currentUser;

  useEffect(() => {
    const i = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  const handleAuth = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (!password.trim()) return;
    
    // Unlock Mode (User already authenticated in session)
    if (currentUser) {
        // In a real OS, we'd verify the password again here.
        // For this web sim, since firebase persistence is on, we just "Unlock" the UI.
        // To make it feel real, we'll just add a fake delay.
        setIsLoading(true);
        setTimeout(() => {
            setPowerState('ACTIVE');
            setIsLoading(false);
        }, 800);
        return;
    }

    // Login/Register Mode
    if (!email.trim()) {
        setError("Email required");
        return;
    }

    setIsLoading(true);
    try {
        if (isRegistering) {
            await createUserWithEmailAndPassword(auth, email, password);
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
        // Successful login/register will trigger onAuthStateChanged in OSContext
        // We wait for that to happen, but we can also set Active here to speed up UI
        setPowerState('ACTIVE');
    } catch (err: any) {
        console.error("Auth Error", err);
        setError(err.message || "Authentication failed");
        setIsLoading(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-nd-black z-[100] flex flex-col items-center justify-between py-12 text-nd-white overflow-hidden animate-in fade-in duration-500">
       {/* Background Effect */}
       <div className="absolute inset-0 bg-dot-pattern opacity-10 pointer-events-none" />
       <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/80 pointer-events-none" />

       {/* Time & Date */}
       <div className="flex flex-col items-center mt-12 z-10">
           <div className="text-8xl font-mono font-bold tracking-tighter">
               {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}
           </div>
           <div className="text-xl font-light tracking-widest text-nd-gray uppercase mt-2">
               {time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
           </div>
       </div>

       {/* Login/Unlock Form */}
       <div className="flex flex-col items-center gap-6 w-full max-w-sm px-4 z-10">
           <div className="flex flex-col items-center gap-3">
               <div className="w-24 h-24 rounded-full bg-nd-gray/10 border-2 border-nd-white/20 flex items-center justify-center shadow-2xl relative overflow-hidden">
                   {currentUser?.photoURL ? (
                       <img src={currentUser.photoURL} alt="User" className="w-full h-full object-cover" />
                   ) : (
                       <User size={40} className="text-nd-white/50" />
                   )}
                   {isLoading && (
                       <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                           <Loader2 className="w-8 h-8 text-nd-white animate-spin" />
                       </div>
                   )}
               </div>
               <h2 className="text-lg font-bold tracking-wide">
                   {currentUser ? (currentUser.displayName || currentUser.email || 'User') : (isRegistering ? 'Create Account' : 'Sign In')}
               </h2>
           </div>

           <form onSubmit={handleAuth} className="w-full space-y-4">
               {error && (
                   <div className="bg-nd-red/20 border border-nd-red/50 text-nd-red text-xs p-2 rounded flex items-center gap-2 justify-center animate-shake">
                       <AlertCircle size={14} /> {error}
                   </div>
               )}

               {!currentUser && (
                   <div className="relative">
                       <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-nd-gray" />
                       <input 
                         type="email" 
                         value={email}
                         onChange={(e) => { setEmail(e.target.value); setError(null); }}
                         placeholder="Email Address"
                         className="w-full bg-white/5 border border-white/20 rounded-full py-3 pl-12 pr-6 text-sm outline-none focus:border-nd-white/50 transition-all placeholder-white/30 backdrop-blur-md"
                         autoFocus={!currentUser}
                       />
                   </div>
               )}

               <div className="relative">
                   <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-nd-gray" />
                   <input 
                     type="password" 
                     value={password}
                     onChange={(e) => { setPassword(e.target.value); setError(null); }}
                     placeholder="Password"
                     className="w-full bg-white/5 border border-white/20 rounded-full py-3 pl-12 pr-12 text-sm outline-none focus:border-nd-white/50 transition-all placeholder-white/30 backdrop-blur-md"
                     autoFocus={!!currentUser}
                   />
                   <button 
                     type="submit"
                     disabled={isLoading}
                     className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-nd-white text-nd-black rounded-full flex items-center justify-center hover:scale-105 transition-transform disabled:opacity-50"
                   >
                       <ArrowRight size={16} />
                   </button>
               </div>
           </form>
           
           {!currentUser && (
               <button 
                 onClick={() => { setIsRegistering(!isRegistering); setError(null); }}
                 className="text-xs text-nd-gray font-mono cursor-pointer hover:text-nd-white transition-colors"
               >
                   {isRegistering ? 'Already have an account? Sign In' : 'New User? Create Account'}
               </button>
           )}
           
           {currentUser && (
               <button 
                 onClick={() => { auth.signOut(); }}
                 className="text-xs text-nd-gray font-mono cursor-pointer hover:text-nd-white transition-colors"
               >
                   Switch User
               </button>
           )}
       </div>

       {/* Footer Status */}
       <div className="flex gap-6 text-xs text-nd-gray font-mono uppercase tracking-widest z-10">
           <span className="flex items-center gap-2"><div className={`w-2 h-2 rounded-full ${authStatus === 'connected' ? 'bg-green-500' : 'bg-nd-red'}`} /> Network</span>
           <span className="flex items-center gap-2"><Lock size={12} /> Secure Boot</span>
       </div>
    </div>
  );
};