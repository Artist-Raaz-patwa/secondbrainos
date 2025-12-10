import React, { useState, useEffect } from 'react';
import { 
  Mail, Star, Inbox, Send, AlertCircle, RefreshCw, 
  ChevronRight, BrainCircuit, LogIn, ShieldAlert,
  Search, Paperclip, MoreVertical, Archive, Trash2,
  ChevronLeft
} from 'lucide-react';
import firebase from 'firebase/compat/app';
import { auth } from '../services/firebase';
import { useOS } from '../context/OSContext';
import { GoogleGenAI } from "@google/genai";

// --- Types ---

interface Email {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  snippet: string;
  date: string;
  isUnread: boolean;
  body?: string; // Full body loaded on demand
}

// --- Demo Data (Fallback) ---
const DEMO_EMAILS: Email[] = [
  { id: '1', threadId: 't1', from: 'Alerts <noreply@google.com>', subject: 'Security Alert: New Sign-in', snippet: 'Your Google Account was just signed in to from a new device...', date: new Date().toISOString(), isUnread: true, body: 'We noticed a new sign-in to your Google Account on a Windows device. If this was you, you can ignore this email.' },
  { id: '2', threadId: 't2', from: 'Client X <ceo@startup.io>', subject: 'Urgent: Project Update', snippet: 'Can we schedule a call for tomorrow? The investors are asking about...', date: new Date(Date.now() - 3600000).toISOString(), isUnread: true, body: 'Hi, I hope this finds you well. Investors are asking for the Q3 roadmap. Can we sync up tomorrow at 10 AM to finalize the deck? Cheers.' },
  { id: '3', threadId: 't3', from: 'Newsletter <daily@tech.com>', subject: 'The Future of AI is Here', snippet: 'In today\'s issue: Gemini 2.0 release notes, new coding capabilities...', date: new Date(Date.now() - 86400000).toISOString(), isUnread: false, body: 'Welcome to the daily digest. Today we explore the boundaries of LLMs and how they are reshaping OS design.' },
];

export const EmailApp: React.FC = () => {
  const { addLog } = useOS();
  
  // State
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmailId, setSelectedEmailId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'important' | 'all'>('important');
  const [error, setError] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState(false);
  
  // AI State
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  // Derived
  const selectedEmail = emails.find(e => e.id === selectedEmailId);

  // --- Actions ---

  const connectGmail = async () => {
    setIsLoading(true);
    setError(null);
    try {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
        
        const result = await auth.signInWithPopup(provider);
        // @ts-ignore - The types for legacy compat firebase might miss 'credential.accessToken'
        const token = result.credential?.accessToken;
        
        if (token) {
            setAccessToken(token);
            setIsConnected(true);
            setIsDemoMode(false);
            addLog({ source: 'Email', message: 'Gmail OAuth Successful', type: 'success', isCloud: true });
            fetchEmails(token);
        } else {
            throw new Error("No access token returned");
        }
    } catch (err: any) {
        console.error("Gmail Auth Error:", err);
        setError("Connection Failed: Ensure 'Google' provider is enabled in Firebase Console.");
        // Auto fallback to demo for better UX in this environment
        setIsDemoMode(true);
        setEmails(DEMO_EMAILS);
    } finally {
        setIsLoading(false);
    }
  };

  const fetchEmails = async (token: string) => {
      setIsLoading(true);
      try {
          // 1. List Messages (Filter for Important)
          const query = filter === 'important' ? 'label:IMPORTANT' : '';
          const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=${query}`, {
              headers: { Authorization: `Bearer ${token}` }
          });
          
          if (!listRes.ok) throw new Error("Failed to fetch list");
          const listData = await listRes.json();
          
          if (!listData.messages) {
              setEmails([]);
              setIsLoading(false);
              return;
          }

          // 2. Fetch Details (Batching not implemented for simplicity, fetching parallel)
          const detailsPromises = listData.messages.map(async (msg: any) => {
              const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}`, {
                  headers: { Authorization: `Bearer ${token}` }
              });
              return res.json();
          });

          const details = await Promise.all(detailsPromises);
          
          // 3. Transform
          const parsed: Email[] = details.map((d: any) => {
              const headers = d.payload.headers;
              const subject = headers.find((h: any) => h.name === 'Subject')?.value || '(No Subject)';
              const from = headers.find((h: any) => h.name === 'From')?.value || 'Unknown';
              const date = headers.find((h: any) => h.name === 'Date')?.value || new Date().toISOString();
              
              // Simple Body decoding (Snippet is usually enough for list)
              let body = d.snippet;
              if (d.payload.body?.data) {
                  body = atob(d.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
              } else if (d.payload.parts && d.payload.parts[0]?.body?.data) {
                  body = atob(d.payload.parts[0].body.data.replace(/-/g, '+').replace(/_/g, '/'));
              }

              return {
                  id: d.id,
                  threadId: d.threadId,
                  from,
                  subject,
                  snippet: d.snippet,
                  date,
                  isUnread: d.labelIds.includes('UNREAD'),
                  body
              };
          });

          setEmails(parsed);
      } catch (err) {
          console.error("Fetch Error", err);
          setError("Failed to fetch emails. Token may have expired.");
      } finally {
          setIsLoading(false);
      }
  };

  const handleAiSummary = async () => {
      if (!selectedEmail) return;
      
      const apiKey = localStorage.getItem('nd_os_api_key') || process.env.API_KEY;
      if (!apiKey) {
          setSummary("Error: Missing API Key. Check Settings.");
          return;
      }
      
      setIsSummarizing(true);
      try {
          const ai = new GoogleGenAI({ apiKey });
          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: `Summarize this email in 3 bullet points. Ignore boilerplate signatures.\n\nSubject: ${selectedEmail.subject}\nFrom: ${selectedEmail.from}\nBody: ${selectedEmail.body}`
          });
          setSummary(response.text || "Could not generate summary.");
      } catch (e) {
          setSummary("AI Error: Connection failed.");
      } finally {
          setIsSummarizing(false);
      }
  };

  // --- Render ---

  // Connect Screen
  if (!isConnected && !isDemoMode) {
      return (
          <div className="flex flex-col items-center justify-center h-full bg-nd-black text-nd-white p-8 text-center animate-in fade-in">
              <div className="w-20 h-20 bg-nd-gray/10 rounded-full flex items-center justify-center mb-6 border border-nd-gray">
                  <Mail size={40} className="text-nd-white" />
              </div>
              <h2 className="text-2xl font-bold font-mono uppercase tracking-tight mb-2">Secure Maillink</h2>
              <p className="text-nd-gray text-sm max-w-sm mb-8 leading-relaxed">
                  Connect your Google account to fetch Priority Inbox using the Gmail API. 
                  <br/><span className="text-xs opacity-50 mt-2 block">Read-only permission required.</span>
              </p>
              
              {error && (
                  <div className="bg-nd-red/10 border border-nd-red/30 p-4 rounded mb-6 flex items-start gap-3 text-left">
                      <AlertCircle size={16} className="text-nd-red flex-shrink-0 mt-0.5" />
                      <div className="text-xs text-nd-red">
                          <p className="font-bold mb-1">Connection Failed</p>
                          <p>{error}</p>
                      </div>
                  </div>
              )}

              <button 
                  onClick={connectGmail}
                  disabled={isLoading}
                  className="flex items-center gap-3 bg-nd-white text-nd-black px-6 py-3 font-bold uppercase tracking-widest hover:bg-white/90 transition-all rounded disabled:opacity-50"
              >
                  {isLoading ? <RefreshCw size={18} className="animate-spin" /> : <LogIn size={18} />}
                  <span>{isLoading ? 'Connecting...' : 'Authorize Gmail'}</span>
              </button>
              
              <button 
                  onClick={() => { setIsDemoMode(true); setEmails(DEMO_EMAILS); }}
                  className="mt-6 text-xs text-nd-gray hover:text-nd-white underline"
              >
                  Enter Demo Mode
              </button>
          </div>
      );
  }

  // Main UI
  return (
    <div className="flex h-full bg-nd-black text-nd-white font-sans divide-x divide-nd-gray overflow-hidden">
        
        {/* Sidebar */}
        <div className={`w-[60px] md:w-[200px] flex-shrink-0 bg-nd-black flex flex-col pt-4 ${selectedEmailId ? 'hidden md:flex' : 'flex'}`}>
            <div className="px-4 mb-6 hidden md:block">
                <div className="flex items-center gap-2 text-nd-red mb-1">
                    <Inbox size={18} />
                    <span className="font-bold tracking-widest uppercase">Inbox</span>
                </div>
                <p className="text-[10px] text-nd-gray font-mono">{isDemoMode ? 'SIMULATION' : auth.currentUser?.email}</p>
            </div>

            <div className="flex-1 flex flex-col gap-1">
                <button 
                    onClick={() => { setFilter('important'); if(!isDemoMode && accessToken) fetchEmails(accessToken); }}
                    className={`flex items-center gap-3 px-4 py-3 mx-2 rounded transition-all ${filter === 'important' ? 'bg-nd-white text-nd-black' : 'text-nd-gray hover:text-nd-white hover:bg-nd-gray/10'}`}
                >
                    <Star size={18} className={filter === 'important' ? "fill-current" : ""} />
                    <span className="hidden md:inline font-medium text-sm">Important</span>
                </button>
                
                <button 
                    onClick={() => { setFilter('all'); if(!isDemoMode && accessToken) fetchEmails(accessToken); }}
                    className={`flex items-center gap-3 px-4 py-3 mx-2 rounded transition-all ${filter === 'all' ? 'bg-nd-white text-nd-black' : 'text-nd-gray hover:text-nd-white hover:bg-nd-gray/10'}`}
                >
                    <Inbox size={18} />
                    <span className="hidden md:inline font-medium text-sm">All Mail</span>
                </button>
            </div>

            <div className="p-4 border-t border-nd-gray">
                <button 
                    onClick={() => { setIsConnected(false); setAccessToken(null); setIsDemoMode(false); }}
                    className="flex items-center gap-2 text-xs text-nd-gray hover:text-nd-white w-full"
                >
                    <ShieldAlert size={14} />
                    <span className="hidden md:inline">Disconnect</span>
                </button>
            </div>
        </div>

        {/* Email List */}
        <div className={`flex-1 md:w-[350px] md:flex-none flex flex-col min-w-0 bg-nd-black border-r border-nd-gray ${selectedEmailId ? 'hidden md:flex' : 'flex'}`}>
            <div className="h-[60px] border-b border-nd-gray flex items-center justify-between px-4 bg-nd-black shrink-0">
                <h2 className="font-bold uppercase tracking-widest text-sm">{filter}</h2>
                <button 
                    onClick={() => !isDemoMode && accessToken && fetchEmails(accessToken)} 
                    className="p-2 hover:bg-nd-gray/20 rounded-full"
                >
                    <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
                {emails.length === 0 ? (
                    <div className="p-8 text-center text-nd-gray text-xs font-mono opacity-50">
                        {isLoading ? 'SYNCING...' : 'NO MESSAGES'}
                    </div>
                ) : (
                    emails.map(email => (
                        <div 
                            key={email.id}
                            onClick={() => { setSelectedEmailId(email.id); setSummary(null); }}
                            className={`p-4 border-b border-nd-gray cursor-pointer transition-colors group ${selectedEmailId === email.id ? 'bg-nd-white text-nd-black' : 'hover:bg-nd-gray/10'}`}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className={`font-bold text-sm truncate pr-2 ${selectedEmailId !== email.id && email.isUnread ? 'text-nd-white' : ''} ${selectedEmailId === email.id ? 'text-nd-black' : 'text-nd-gray'}`}>
                                    {email.from.split('<')[0].replace(/"/g, '')}
                                </span>
                                {email.isUnread && selectedEmailId !== email.id && (
                                    <div className="w-2 h-2 bg-nd-red rounded-full mt-1.5" />
                                )}
                            </div>
                            <div className={`text-sm mb-1 truncate ${selectedEmailId === email.id ? 'font-bold' : ''}`}>{email.subject}</div>
                            <div className={`text-xs truncate ${selectedEmailId === email.id ? 'opacity-70' : 'text-nd-gray'}`}>
                                {email.snippet}
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>

        {/* Detail View */}
        <div className={`flex-1 flex flex-col min-w-0 bg-nd-black ${selectedEmailId ? 'flex absolute inset-0 z-20 md:static' : 'hidden md:flex'}`}>
            {selectedEmail ? (
                <>
                    {/* Header */}
                    <div className="h-[60px] border-b border-nd-gray flex items-center justify-between px-6 bg-nd-black shrink-0">
                        <div className="flex items-center gap-4">
                            <button onClick={() => setSelectedEmailId(null)} className="md:hidden">
                                <ChevronLeft size={20} />
                            </button>
                            <div className="flex flex-col">
                                <span className="font-bold text-sm truncate max-w-[200px] md:max-w-md">{selectedEmail.from}</span>
                                <span className="text-[10px] text-nd-gray font-mono">{new Date(selectedEmail.date).toLocaleString()}</span>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <button 
                                onClick={handleAiSummary}
                                disabled={isSummarizing || !!summary}
                                className="flex items-center gap-2 border border-nd-gray px-3 py-1.5 text-xs font-bold uppercase hover:border-nd-white transition-colors disabled:opacity-50"
                            >
                                <BrainCircuit size={14} className={isSummarizing ? "animate-spin" : "text-nd-red"} />
                                <span className="hidden sm:inline">TL;DR</span>
                            </button>
                            <button className="p-2 hover:bg-nd-gray/20 rounded"><Archive size={18} /></button>
                            <button className="p-2 hover:bg-nd-gray/20 rounded"><Trash2 size={18} /></button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-6 md:p-10">
                        <h1 className="text-xl md:text-2xl font-bold mb-6 leading-tight">{selectedEmail.subject}</h1>
                        
                        {/* Summary Block */}
                        {summary && (
                            <div className="mb-8 bg-nd-gray/10 border-l-2 border-nd-red p-4 animate-in slide-in-from-top-2">
                                <div className="flex items-center gap-2 text-nd-red mb-2 text-xs font-bold uppercase tracking-widest">
                                    <BrainCircuit size={12} /> Neural Summary
                                </div>
                                <div className="text-sm leading-relaxed font-mono opacity-80 whitespace-pre-line">
                                    {summary}
                                </div>
                            </div>
                        )}

                        <div className="prose prose-invert prose-sm max-w-none font-mono opacity-90 leading-relaxed whitespace-pre-wrap">
                            {selectedEmail.body}
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-nd-gray opacity-30">
                    <Mail size={64} strokeWidth={1} />
                    <span className="mt-4 font-mono text-xs uppercase tracking-widest">Select an Item</span>
                </div>
            )}
        </div>

    </div>
  );
};