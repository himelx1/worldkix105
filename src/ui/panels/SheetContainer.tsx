import React from 'react';
import { X } from 'lucide-react';
import { GameController } from '../bridge/GameController';

interface SheetContainerProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const SheetContainer: React.FC<SheetContainerProps> = ({ title, subtitle, children }) => {
  return (
    <div className="pointer-events-auto fixed inset-x-0 bottom-0 z-30 flex justify-center">
      <div className="w-full max-w-2xl bg-gradient-to-b from-[#13291e]/98 to-[#07130d]/98 backdrop-blur-md border-t border-x border-emerald-700/55 rounded-t-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_-12px_40px_rgba(0,0,0,0.65)] flex flex-col max-h-[68vh] pb-safe">
        <div className="w-12 h-1 bg-emerald-600/50 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-emerald-800/50 shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-stone-100 tracking-tight truncate">{title}</h2>
            {subtitle ? <p className="text-xs text-stone-300/85 truncate">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            aria-label="Close panel"
            onClick={() => GameController.setActiveSheet('none')}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-[#0b1d14] border border-emerald-800/60 text-stone-200 hover:text-white hover:border-emerald-600/70 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
      </div>
    </div>
  );
};
