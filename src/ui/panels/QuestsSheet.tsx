import React, { useState } from 'react';
import { CheckCircle2, Compass, Hammer, Landmark, Map as MapIcon, Pin, FlaskConical, Users, Lock } from 'lucide-react';
import type { QuestActionHint, QuestDef } from '../../data/levels.data';
import { GameController, GameSnapshot } from '../bridge/GameController';
import { SheetContainer } from './SheetContainer';

type QuestTab = 'active' | 'upcoming' | 'completed';

function runQuestAction(q: QuestDef): void {
  const hint: QuestActionHint = q.actionHint;
  if (hint === 'build') {
    if (q.buildingId) {
      GameController.setTool({ mode: 'build', defId: q.buildingId });
      GameController.setActiveSheet('none');
    } else {
      GameController.setActiveSheet('build');
    }
    return;
  }
  if (hint === 'land') {
    GameController.setActiveSheet('land');
    return;
  }
  if (hint === 'tech') {
    GameController.setActiveSheet('tech');
    return;
  }
  if (hint === 'economy') {
    GameController.setActiveSheet('economy');
    return;
  }
  if (hint === 'society') {
    GameController.setActiveSheet('population');
    return;
  }
  if (hint === 'ruin') {
    GameController.locateTarget({ ruin: true });
    return;
  }
  GameController.setActiveSheet('none');
}

function getActionLabel(q: QuestDef): string {
  switch (q.actionHint) {
    case 'build':
      return q.buildingId ? 'Select Blueprint' : 'Open Build';
    case 'land':
      return 'Expand Land';
    case 'tech':
      return 'Open Tech';
    case 'economy':
      return 'Open Market';
    case 'society':
      return 'Open Society';
    case 'ruin':
      return 'Locate Ruin';
    default:
      return 'Go to Map';
  }
}

function getActionIcon(hint: QuestActionHint): React.ReactNode {
  switch (hint) {
    case 'build':
      return <Hammer className="w-3.5 h-3.5" />;
    case 'land':
      return <MapIcon className="w-3.5 h-3.5" />;
    case 'tech':
      return <FlaskConical className="w-3.5 h-3.5" />;
    case 'economy':
      return <Landmark className="w-3.5 h-3.5" />;
    case 'society':
      return <Users className="w-3.5 h-3.5" />;
    case 'ruin':
      return <Compass className="w-3.5 h-3.5" />;
    default:
      return <Compass className="w-3.5 h-3.5" />;
  }
}

export const QuestsSheet: React.FC<{ snap: GameSnapshot }> = ({ snap }) => {
  const [tab, setTab] = useState<QuestTab>('active');
  const { allQuests, state } = snap;

  const activeEntries = allQuests.filter((e) => !e.completed && e.unlocked);
  const upcomingEntries = allQuests.filter((e) => !e.completed && !e.unlocked);
  const completedEntries = allQuests.filter((e) => e.completed);
  const doneCount = completedEntries.length;

  const displayed =
    tab === 'active'
      ? activeEntries
      : tab === 'upcoming'
        ? upcomingEntries
        : completedEntries;

  return (
    <SheetContainer
      title="City Missions & Objectives"
      subtitle={`Completed: ${doneCount}/${allQuests.length} · All unlocked missions track in parallel`}
    >
      <div className="space-y-3">
        {state.speed === 0 ? (
          <div className="p-3 rounded-xl bg-amber-950/70 border border-amber-600/60 flex items-center justify-between gap-2 text-xs">
            <span className="text-amber-200 font-medium">
              Simulation is Paused — resume time so workers, builds, and growth advance.
            </span>
            <button
              type="button"
              onClick={() => GameController.dispatch({ type: 'SET_SPEED', speed: 1 })}
              className="min-h-[44px] px-3.5 rounded-xl bg-amber-500 text-stone-950 font-bold shrink-0"
            >
              Play 1×
            </button>
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-1.5">
          {(
            [
              ['active', `Active (${activeEntries.length})`],
              ['upcoming', `Upcoming (${upcomingEntries.length})`],
              ['completed', `Done (${doneCount})`],
            ] as Array<[QuestTab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`min-h-[44px] px-3 rounded-xl text-xs font-bold tabular-nums transition-all ${
                tab === id
                  ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-stone-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_0_#92400e]'
                  : 'bg-[#0a1d14] border border-emerald-800/55 text-stone-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-2.5">
          {displayed.length === 0 ? (
            <div className="p-4 rounded-2xl bg-[#0a1c13] border border-emerald-800/50 text-xs text-stone-300 text-center">
              {tab === 'active'
                ? 'All unlocked missions for your current City Level are finished!'
                : tab === 'upcoming'
                  ? 'Every civilization milestone is unlocked.'
                  : 'No missions completed yet — complete your first mission above.'}
            </div>
          ) : null}

          {displayed.map(({ quest, progress, completed, unlocked }) => {
            const pct = Math.min(100, Math.round((progress / Math.max(1, quest.targetValue)) * 100));
            const isPinned = snap.activeQuest?.quest.id === quest.id && !completed;

            return (
              <div
                key={quest.id}
                className={`p-3.5 rounded-2xl border space-y-2.5 ${
                  completed
                    ? 'bg-emerald-900/25 border-emerald-700/50'
                    : isPinned
                      ? 'bg-gradient-to-b from-[#173626] to-[#0b1d14] border-amber-500/70'
                      : 'bg-gradient-to-b from-[#132b1f] to-[#0a1b12] border-emerald-700/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-bold text-stone-100">{quest.title}</span>
                      {isPinned ? (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-400/50 text-[10px] font-bold text-amber-300">
                          Pinned HUD
                        </span>
                      ) : null}
                      {!unlocked ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-800 text-[10px] font-semibold text-stone-300">
                          <Lock className="w-3 h-3" />
                          Lv.{quest.minLevel}
                        </span>
                      ) : null}
                      {completed ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-300">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Complete
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-stone-200 mt-0.5">{quest.description}</p>
                  </div>

                  <div className="text-right shrink-0 tabular-nums">
                    <div className="text-xs font-bold text-amber-300">
                      {progress}/{quest.targetValue}
                    </div>
                    <div className="text-[10px] text-lime-300 mt-0.5">
                      +{quest.rewardCoins}C · +{quest.rewardXp} XP
                    </div>
                  </div>
                </div>

                <div className="w-full h-1.5 bg-[#06120c] rounded-sm overflow-hidden">
                  <div
                    className={`h-full transition-all ${completed ? 'bg-emerald-400' : 'bg-amber-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="text-[11px] text-stone-300/90 bg-[#07150e]/85 border border-emerald-900/60 rounded-xl px-3 py-2 leading-snug">
                  <strong className="text-amber-300">How to complete:</strong> {quest.tip}
                </div>

                {!completed && unlocked ? (
                  <div className="flex items-center gap-2 pt-0.5">
                    {!isPinned ? (
                      <button
                        type="button"
                        onClick={() => GameController.setTrackedQuest(quest.id)}
                        className="min-h-[44px] px-3 rounded-xl bg-[#0a1d14] border border-emerald-700/60 text-stone-200 hover:text-white text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Pin className="w-3.5 h-3.5 text-amber-300" />
                        Pin to HUD
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => runQuestAction(quest)}
                      className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 text-stone-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_0_#92400e]"
                    >
                      {getActionIcon(quest.actionHint)}
                      {getActionLabel(quest)}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </SheetContainer>
  );
};
