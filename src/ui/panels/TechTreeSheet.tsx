import React, { useState } from 'react';
import { TECH_MAP, TECH_TREE, TechBranch } from '../../data/techTree.data';
import { TechSystem } from '../../systems/TechSystem';
import { GameController, GameSnapshot } from '../bridge/GameController';
import { SheetContainer } from './SheetContainer';

const BRANCHES: Array<['all' | TechBranch, string]> = [
  ['all', 'All'],
  ['forestry', 'Forestry'],
  ['agriculture', 'Agriculture'],
  ['construction', 'Construction'],
  ['mining', 'Mining'],
  ['manufacturing', 'Industry'],
  ['transportation', 'Transport'],
  ['healthcare', 'Health'],
  ['education', 'Education'],
  ['energy', 'Energy'],
  ['automation', 'Automation'],
  ['advanced', 'Advanced'],
];

export const TechTreeSheet: React.FC<{ snap: GameSnapshot }> = ({ snap }) => {
  const [branch, setBranch] = useState<'all' | TechBranch>('all');
  const { state } = snap;
  const activeDef = state.activeTechId ? TECH_MAP[state.activeTechId] : null;
  const list = TECH_TREE.filter((t) => branch === 'all' || t.branch === branch);

  return (
    <SheetContainer
      title="Technology Tree"
      subtitle={`Research Pool: ${Math.floor(state.researchPoints)} RP · Unlocked: ${state.unlockedTechIds.length}/${TECH_TREE.length}`}
    >
      {/* Active Research Banner */}
      {activeDef ? (
        <div className="mb-3 p-3 rounded-xl bg-indigo-950/60 border border-indigo-700/60">
          <div className="flex items-center justify-between text-xs font-semibold text-indigo-200">
            <span>Researching: {activeDef.name}</span>
            <span className="tabular-nums">
              {Math.floor(state.activeTechProgress)}/{activeDef.rpCost} RP
            </span>
          </div>
          <div className="w-full h-2 bg-stone-900 rounded-sm overflow-hidden mt-1.5">
            <div
              className="h-full bg-indigo-400 transition-all"
              style={{
                width: `${Math.min(100, Math.round((state.activeTechProgress / activeDef.rpCost) * 100))}%`,
              }}
            />
          </div>
        </div>
      ) : null}

      {/* Branch Filter */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-2.5 mb-3 border-b border-emerald-900/40">
        {BRANCHES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setBranch(id)}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 ${
              branch === id ? 'bg-amber-500 text-stone-950 font-semibold' : 'bg-emerald-950/70 text-stone-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tech Nodes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {list.map((tech) => {
          const done = state.unlockedTechIds.includes(tech.id);
          const isActive = state.activeTechId === tech.id;
          const canStart = TechSystem.canStartTech(state, tech.id);

          return (
            <div
              key={tech.id}
              className={`p-3 rounded-xl border flex flex-col justify-between gap-2 ${
                done
                  ? 'bg-emerald-900/35 border-emerald-600/60'
                  : isActive
                    ? 'bg-indigo-950/50 border-indigo-500/70'
                    : 'bg-emerald-950/45 border-emerald-900/55'
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold text-stone-100">{tech.name}</span>
                  <span className="text-[11px] text-amber-300 capitalize shrink-0">{tech.branch}</span>
                </div>
                <p className="text-[11px] text-stone-300 mt-1">{tech.description}</p>
                <div className="text-[11px] text-emerald-300 mt-1 font-medium">{tech.effectSummary}</div>
                {tech.prerequisites.length > 0 ? (
                  <div className="text-[10px] text-stone-400 mt-1">
                    Requires: {tech.prerequisites.map((p) => TECH_MAP[p]?.name ?? p).join(' · ')}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-emerald-900/40 text-xs tabular-nums">
                <span className="text-stone-300">
                  {tech.rpCost} RP · {tech.coinCost}C
                </span>

                {done ? (
                  <span className="text-emerald-400 font-semibold">Unlocked</span>
                ) : isActive ? (
                  <span className="text-indigo-300 font-semibold">Active</span>
                ) : (
                  <button
                    type="button"
                    disabled={!canStart.ok}
                    onClick={() => GameController.dispatch({ type: 'START_TECH', techId: tech.id })}
                    className="min-h-[36px] px-3 rounded-lg bg-amber-500 disabled:bg-stone-800 disabled:text-stone-500 text-stone-950 font-semibold"
                  >
                    {canStart.ok ? 'Research' : canStart.reason ?? 'Locked'}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </SheetContainer>
  );
};
