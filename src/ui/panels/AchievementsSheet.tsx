import React from 'react';
import { ACHIEVEMENTS } from '../../data/achievements.data';
import type { GameSnapshot } from '../bridge/GameController';
import { SheetContainer } from './SheetContainer';

export const AchievementsSheet: React.FC<{ snap: GameSnapshot }> = ({ snap }) => {
  const { state } = snap;

  return (
    <SheetContainer
      title="Achievements & Statistics"
      subtitle={`Unlocked: ${state.unlockedAchievements.length}/${ACHIEVEMENTS.length} · Play Time: ${Math.floor(
        state.stats.playTimeSeconds / 60
      )}m`}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs tabular-nums">
          <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-900/50">
            <div className="text-stone-400">Trees Cut</div>
            <div className="font-bold text-lime-300 text-base">{state.stats.treesCut}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-900/50">
            <div className="text-stone-400">Buildings Built</div>
            <div className="font-bold text-stone-100 text-base">{state.stats.buildingsBuilt}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-900/50">
            <div className="text-stone-400">Peak Population</div>
            <div className="font-bold text-sky-300 text-base">{state.stats.maxPopulation}</div>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-950/50 border border-emerald-900/50">
            <div className="text-stone-400">Coins Earned</div>
            <div className="font-bold text-amber-300 text-base">
              {Math.floor(state.stats.totalCoinsEarned).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {ACHIEVEMENTS.map((a) => {
            const done = state.unlockedAchievements.includes(a.id);
            return (
              <div
                key={a.id}
                className={`p-3 rounded-xl border ${
                  done
                    ? 'bg-emerald-900/35 border-emerald-600/60'
                    : 'bg-emerald-950/40 border-emerald-900/45 opacity-80'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-stone-100">{a.title}</span>
                  <span className={`text-xs font-semibold ${done ? 'text-emerald-400' : 'text-stone-400'}`}>
                    {done ? 'Complete' : `+${a.rewardCoins}C`}
                  </span>
                </div>
                <p className="text-xs text-stone-300 mt-1">{a.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </SheetContainer>
  );
};
