import React, { useState } from 'react';
import { Wifi, Bluetooth, Moon, Zap, Volume2, Sun, Cast } from 'lucide-react';

export const ControlCenter: React.FC = () => {
  const [volume, setVolume] = useState(75);
  const [brightness, setBrightness] = useState(100);
  const [toggles, setToggles] = useState({
      wifi: true,
      bluetooth: true,
      dnd: false,
      airdrop: false
  });

  const toggle = (key: keyof typeof toggles) => setToggles(p => ({ ...p, [key]: !p[key] }));

  return (
    <div className="absolute top-10 right-4 w-80 bg-nd-black/80 backdrop-blur-2xl border border-nd-gray rounded-2xl shadow-2xl p-4 z-[9999] animate-in slide-in-from-top-2 fade-in duration-200">
        
        {/* Connectivity Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
            {/* Network Group */}
            <div className="bg-nd-gray/20 rounded-xl p-3 flex flex-col gap-3">
                <button 
                    onClick={() => toggle('wifi')}
                    className={`flex items-center gap-3 transition-all ${toggles.wifi ? 'text-nd-white' : 'text-nd-gray opacity-50'}`}
                >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${toggles.wifi ? 'bg-nd-white text-nd-black' : 'bg-nd-gray/30'}`}>
                        <Wifi size={16} />
                    </div>
                    <div className="flex flex-col items-start">
                        <span className="text-xs font-bold">Wi-Fi</span>
                        <span className="text-[10px] opacity-70">{toggles.wifi ? 'Second Brain' : 'Off'}</span>
                    </div>
                </button>
                <button 
                    onClick={() => toggle('bluetooth')}
                    className={`flex items-center gap-3 transition-all ${toggles.bluetooth ? 'text-nd-white' : 'text-nd-gray opacity-50'}`}
                >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${toggles.bluetooth ? 'bg-nd-white text-nd-black' : 'bg-nd-gray/30'}`}>
                        <Bluetooth size={16} />
                    </div>
                    <div className="flex flex-col items-start">
                        <span className="text-xs font-bold">Bluetooth</span>
                        <span className="text-[10px] opacity-70">{toggles.bluetooth ? 'On' : 'Off'}</span>
                    </div>
                </button>
            </div>

            {/* Other Toggles */}
            <div className="grid grid-cols-2 gap-3">
                <button 
                    onClick={() => toggle('dnd')}
                    className={`rounded-xl p-2 flex flex-col items-center justify-center gap-2 transition-all ${toggles.dnd ? 'bg-nd-white text-nd-black' : 'bg-nd-gray/20 text-nd-gray'}`}
                >
                    <Moon size={20} className={toggles.dnd ? "fill-current" : ""} />
                    <span className="text-[10px] font-bold">Focus</span>
                </button>
                <button 
                    className="rounded-xl p-2 flex flex-col items-center justify-center gap-2 bg-nd-gray/20 text-nd-gray hover:bg-nd-gray/30 transition-all"
                >
                    <Cast size={20} />
                    <span className="text-[10px] font-bold">Cast</span>
                </button>
            </div>
        </div>

        {/* Sliders */}
        <div className="bg-nd-gray/20 rounded-xl p-4 space-y-4 mb-4">
            <div className="flex items-center gap-3">
                <Sun size={16} className="text-nd-gray" />
                <input 
                    type="range" 
                    min="0" max="100" 
                    value={brightness}
                    onChange={(e) => setBrightness(Number(e.target.value))}
                    className="w-full h-1 bg-nd-black rounded-full appearance-none accent-nd-white cursor-pointer"
                />
            </div>
            <div className="flex items-center gap-3">
                <Volume2 size={16} className="text-nd-gray" />
                <input 
                    type="range" 
                    min="0" max="100" 
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="w-full h-1 bg-nd-black rounded-full appearance-none accent-nd-white cursor-pointer"
                />
            </div>
        </div>

        {/* Music Player Mock */}
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-nd-red rounded-md flex items-center justify-center">
                <Zap size={20} className="text-white fill-current" />
            </div>
            <div className="flex-1 overflow-hidden">
                <div className="text-xs font-bold truncate">Deep Work FM</div>
                <div className="text-[10px] text-nd-gray">Ambient Flow</div>
            </div>
            <button className="text-nd-white hover:text-nd-gray transition-colors">
                <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-current border-b-[6px] border-b-transparent ml-1"></div>
            </button>
        </div>

    </div>
  );
};