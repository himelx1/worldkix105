import React from 'react';
import type { GameSnapshot } from '../bridge/GameController';

export const NotificationToasts: React.FC<{ snap: GameSnapshot }> = ({ snap }) => {
  const recent = snap.notifications.filter((n) => snap.state.tick - n.tick <= 5).slice(0, 2);

  return (
    <div className="pointer-events-none fixed top-24 left-1/2 -translate-x-1/2 z-40 w-full max-w-sm px-3 flex flex-col gap-1.5">
      {snap.toastError ? (
        <div className="bg-red-950/95 border border-red-700/80 text-red-100 rounded-lg px-3 py-2 text-xs font-medium shadow-lg text-center">
          {snap.toastError}
        </div>
      ) : null}

      {recent.map((n) => (
        <div
          key={n.id}
          className="bg-[#0e261b]/95 border border-amber-500/60 text-stone-100 rounded-lg px-3 py-2 shadow-lg"
        >
          <div className="text-xs font-semibold text-amber-300">{n.title}</div>
          <div className="text-[11px] text-stone-300">{n.message}</div>
        </div>
      ))}
    </div>
  );
};
