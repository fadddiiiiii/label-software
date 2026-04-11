import React from 'react';
import { X, Info, ShieldCheck, Cpu } from 'lucide-react';

interface AboutDialogProps {
  onClose: () => void;
}

export function AboutDialog({ onClose }: AboutDialogProps) {
  const [version, setVersion] = React.useState('Loading...');

  React.useEffect(() => {
    window.electron.ipcRenderer.invoke('app:get-version').then((v: string) => setVersion(v));
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-[#1e1e2d] w-full max-w-md rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Info className="w-5 h-5 text-blue-400" />
            About OMG
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          <div className="text-center space-y-2">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl mx-auto flex items-center justify-center shadow-lg shadow-blue-500/20 mb-4">
               <span className="text-3xl font-bold text-white tracking-tighter">OMG</span>
            </div>
            <h3 className="text-xl font-semibold text-white">OMG Label Software</h3>
            <p className="text-sm text-white/50">Enterprise Label Design & Print Engine</p>
          </div>

          <div className="bg-black/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/40 flex items-center gap-2"><Cpu className="w-4 h-4"/> Version</span>
              <span className="text-white font-mono">{version}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/40 flex items-center gap-2"><ShieldCheck className="w-4 h-4"/> License Type</span>
              <span className="text-emerald-400 font-medium">Activated (Perpetual)</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-white/40">Architecture</span>
              <span className="text-white/80">Electron / React / Python Win32</span>
            </div>
          </div>
          
          <div className="text-xs text-center text-white/30 pt-4 border-t border-white/5">
            © 2026 OMG Enterprises. All rights reserved.<br/>
            Engineered for high-volume ZPL/TSPL/PDF label generation.
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-black/20 border-t border-white/5 flex justify-center">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-white/10 hover:bg-white/15 text-white text-sm font-medium rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
