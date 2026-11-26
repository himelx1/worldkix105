import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  Upload,
  X,
  RotateCcw,
  Save,
  Settings,
  Trophy,
  Smartphone,
  Building2,
  Pencil,
  Trash2,
  Check,
  Clock,
  Globe,
  ArrowUpCircle,
} from 'lucide-react';
import { formatCompactNumber } from '../../core/Formatters';
import { OfflineManager } from '../../persistence/OfflineManager';
import type { SaveSlotId, SaveSlotSummary } from '../../persistence/SaveManager';
import { GameController, GameSnapshot } from '../bridge/GameController';

export const GameModals: React.FC<{ snap: GameSnapshot }> = ({ snap }) => {
  if (snap.activeModal !== 'none') {
    return (
      <div className="pointer-events-auto fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-gradient-to-b from-[#13291e] to-[#08150f] border border-emerald-700/60 rounded-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_20px_50px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col max-h-[86vh]">
          {snap.activeModal === 'pause' && <PauseContent snap={snap} />}
          {snap.activeModal === 'settings' && <SettingsContent snap={snap} />}
          {snap.activeModal === 'saves' && <SavesContent snap={snap} />}
        </div>
      </div>
    );
  }

  if (snap.offlineSummary) {
    const off = snap.offlineSummary;
    const mins = Math.max(1, Math.round(off.elapsedSeconds / 60));
    const timeStr = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
    return (
      <div className="pointer-events-auto fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-gradient-to-b from-[#13291e] to-[#08150f] border border-amber-500/55 rounded-3xl shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_20px_50px_rgba(0,0,0,0.7)] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-400 shrink-0" />
              <h2 className="text-base font-bold text-stone-100">Welcome Back</h2>
            </div>
            <span className="text-xs font-semibold text-amber-300 tabular-nums">{timeStr} away</span>
          </div>

          <p className="text-xs text-stone-300 leading-relaxed">
            Your settlement continued gathering raw yields while offline ({off.effectiveMinutes} effective min).
          </p>

          <div className="grid grid-cols-2 gap-2.5 text-center tabular-nums">
            <div className="p-3 rounded-2xl bg-[#07150e] border border-emerald-800/60">
              <div className="text-[11px] text-stone-400">Net Coins Earned</div>
              <div className="text-lg font-extrabold text-amber-300">+{formatCompactNumber(off.coinsEarned)}C</div>
            </div>
            <div className="p-3 rounded-2xl bg-[#07150e] border border-emerald-800/60">
              <div className="text-[11px] text-stone-400">Goods Stored</div>
              <div className="text-lg font-extrabold text-emerald-300">
                +{formatCompactNumber(off.resourcesProduced)}
              </div>
            </div>
          </div>

          {off.topResourceName && off.topResourceAmount ? (
            <div className="text-xs text-center text-stone-300 tabular-nums">
              Top Harvest: <strong className="text-lime-300">+{off.topResourceAmount} {off.topResourceName}</strong>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => GameController.dismissOfflineSummary()}
            className="w-full min-h-[48px] rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 text-stone-950 font-bold text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_3px_0_#92400e]"
          >
            Collect &amp; Resume
          </button>
        </div>
      </div>
    );
  }

  return null;
};

const ModalHeader: React.FC<{ title: string }> = ({ title }) => (
  <div className="flex items-center justify-between px-4 py-3 border-b border-emerald-800/50 shrink-0">
    <h2 className="text-base font-bold text-stone-100 tracking-tight truncate">{title}</h2>
    <button
      type="button"
      onClick={() => GameController.setActiveModal('none')}
      className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-[#0a1a12] border border-emerald-800/60 text-stone-300 hover:text-white shrink-0"
    >
      <X className="w-5 h-5" />
    </button>
  </div>
);

const PauseContent: React.FC<{ snap: GameSnapshot }> = ({ snap }) => {
  const { offline } = snap;
  const [showIosGuide, setShowIosGuide] = useState(false);

  return (
    <>
      <ModalHeader title="KUKUS — Menu" />
      <div className="p-4 space-y-2.5 overflow-y-auto">
        <button
          type="button"
          onClick={() => GameController.setActiveModal('none')}
          className="w-full min-h-[48px] rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 text-stone-950 font-bold text-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_3px_0_#92400e] active:translate-y-[2px]"
        >
          Resume Game
        </button>

        <button
          type="button"
          onClick={() => {
            GameController.setActiveModal('none');
            GameController.setActiveSheet('levelup');
          }}
          className="w-full min-h-[48px] px-4 rounded-xl bg-[#0b1f15] border border-emerald-500/55 hover:border-emerald-400/70 text-stone-100 text-sm font-semibold flex items-center gap-3"
        >
          <ArrowUpCircle className="w-4 h-4 text-emerald-300" />
          Building Level Up
        </button>

        <button
          type="button"
          onClick={() => {
            GameController.setActiveModal('none');
            GameController.setActiveSheet('quests');
          }}
          className="w-full min-h-[48px] px-4 rounded-xl bg-[#0b1f15] border border-amber-500/55 hover:border-amber-400/70 text-stone-100 text-sm font-semibold flex items-center gap-3"
        >
          <Trophy className="w-4 h-4 text-amber-300" />
          City Missions &amp; Objectives
        </button>

        <button
          type="button"
          onClick={() => GameController.setActiveModal('saves')}
          className="w-full min-h-[48px] px-4 rounded-xl bg-[#0b1f15] border border-emerald-700/55 hover:border-emerald-500/70 text-stone-100 text-sm font-semibold flex items-center gap-3"
        >
          <Save className="w-4 h-4 text-amber-300" />
          Worlds &amp; Save Manager
        </button>

        <button
          type="button"
          onClick={() => {
            GameController.setActiveModal('none');
            GameController.setActiveSheet('achievements');
          }}
          className="w-full min-h-[48px] px-4 rounded-xl bg-[#0b1f15] border border-emerald-700/55 hover:border-emerald-500/70 text-stone-100 text-sm font-semibold flex items-center gap-3"
        >
          <Trophy className="w-4 h-4 text-amber-300" />
          Achievements &amp; Statistics
        </button>

        <button
          type="button"
          onClick={() => {
            GameController.setActiveModal('none');
            GameController.setSimInspectorOpen(true);
          }}
          className="w-full min-h-[48px] px-4 rounded-xl bg-[#0b1f15] border border-emerald-700/55 hover:border-emerald-500/70 text-stone-100 text-sm font-semibold flex items-center gap-3"
        >
          <Building2 className="w-4 h-4 text-amber-300" />
          City &amp; District Inspector
        </button>

        <button
          type="button"
          onClick={() => GameController.setActiveModal('settings')}
          className="w-full min-h-[48px] px-4 rounded-xl bg-[#0b1f15] border border-emerald-700/55 hover:border-emerald-500/70 text-stone-100 text-sm font-semibold flex items-center gap-3"
        >
          <Settings className="w-4 h-4 text-emerald-300" />
          Settings &amp; Performance
        </button>

        {/* PWA In-App Install Prompt */}
        {!offline.isStandalone && offline.canPromptInstall ? (
          <button
            type="button"
            onClick={() => void OfflineManager.promptInstall()}
            className="w-full min-h-[48px] px-4 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 text-white text-sm font-bold flex items-center gap-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_3px_0_#065f46]"
          >
            <Smartphone className="w-4 h-4" />
            Install App for Offline Play
          </button>
        ) : null}

        {!offline.isStandalone && offline.isIOS && !offline.canPromptInstall ? (
          <div className="rounded-xl bg-[#08160f] border border-emerald-800/60 p-3 text-xs text-stone-300">
            <button
              type="button"
              onClick={() => setShowIosGuide(!showIosGuide)}
              className="font-semibold text-amber-300 w-full text-left"
            >
              Install on iPhone / iPad
            </button>
            {showIosGuide ? (
              <p className="mt-1.5 leading-relaxed">
                Tap Share in Safari, then choose Add to Home Screen so your offline world is
                protected from browser storage cleanup.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="pt-2 border-t border-emerald-800/50 text-[11px] text-stone-400 flex items-center justify-between">
          <span>{offline.swReady ? 'Offline Cache Ready' : 'Caching Assets...'}</span>
          <span>{offline.isOnline ? 'Connected' : 'Offline Mode'}</span>
        </div>
      </div>
    </>
  );
};

const SettingsContent: React.FC<{ snap: GameSnapshot }> = ({ snap }) => {
  const { settings } = snap.state;
  const { perf } = snap;

  return (
    <>
      <ModalHeader title="Settings & Performance" />
      <div className="p-4 space-y-4 overflow-y-auto text-xs text-stone-200">
        <div>
          <div className="flex justify-between mb-1">
            <span>Master Volume</span>
            <span className="tabular-nums">{Math.round(settings.masterVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.masterVolume}
            onChange={(e) =>
              GameController.dispatch({
                type: 'UPDATE_SETTINGS',
                partial: { masterVolume: Number(e.target.value) },
              })
            }
            className="w-full accent-amber-500"
          />
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <span>SFX Volume</span>
            <span className="tabular-nums">{Math.round(settings.sfxVolume * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.sfxVolume}
            onChange={(e) =>
              GameController.dispatch({
                type: 'UPDATE_SETTINGS',
                partial: { sfxVolume: Number(e.target.value) },
              })
            }
            className="w-full accent-amber-500"
          />
        </div>

        <div>
          <div className="flex justify-between mb-1">
            <span>City &amp; Nature Ambient</span>
            <span className="tabular-nums">{Math.round((settings.ambientVolume ?? 0.65) * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.ambientVolume ?? 0.65}
            onChange={(e) =>
              GameController.dispatch({
                type: 'UPDATE_SETTINGS',
                partial: { ambientVolume: Number(e.target.value) },
              })
            }
            className="w-full accent-amber-500"
          />
        </div>

        <div>
          <div className="mb-1.5 font-medium">Graphics Power Profile</div>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                ['auto', 'Auto'],
                ['high', '60 FPS'],
                ['low_power', 'Battery 30 FPS'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() =>
                  GameController.dispatch({
                    type: 'UPDATE_SETTINGS',
                    partial: { graphicsMode: mode },
                  })
                }
                className={`min-h-[44px] rounded-xl font-medium ${
                  settings.graphicsMode === mode
                    ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-stone-950 font-bold'
                    : 'bg-[#08160f] border border-emerald-800/60 text-stone-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 font-medium">Crowd Density (NPC Citizens)</div>
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                ['auto', 'Auto'],
                ['low', 'Low'],
                ['medium', 'Med'],
                ['high', 'High'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() =>
                  GameController.dispatch({
                    type: 'UPDATE_SETTINGS',
                    partial: { crowdDensity: mode },
                  })
                }
                className={`min-h-[44px] rounded-xl font-medium ${
                  (settings.crowdDensity ?? 'auto') === mode
                    ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-stone-950 font-bold'
                    : 'bg-[#08160f] border border-emerald-800/60 text-stone-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 font-medium">Time Cycle Mode</div>
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                ['normal', 'Normal Cycle'],
                ['always_day', 'Always Day'],
                ['always_night', 'Always Night'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() =>
                  GameController.dispatch({
                    type: 'UPDATE_SETTINGS',
                    partial: { timeMode: mode },
                  })
                }
                className={`min-h-[44px] rounded-xl font-medium ${
                  (settings.timeMode ?? 'normal') === mode
                    ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-stone-950 font-bold'
                    : 'bg-[#08160f] border border-emerald-800/60 text-stone-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 font-medium">Weather Mode</div>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                ['random', 'Dynamic / Random'],
                ['always_clear', 'Always Clear Skies'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() =>
                  GameController.dispatch({
                    type: 'UPDATE_SETTINGS',
                    partial: { weatherMode: mode },
                  })
                }
                className={`min-h-[44px] rounded-xl font-medium ${
                  (settings.weatherMode ?? 'random') === mode
                    ? 'bg-gradient-to-b from-emerald-400 to-emerald-500 text-stone-950 font-bold'
                    : 'bg-[#08160f] border border-emerald-800/60 text-stone-300'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between p-3 rounded-xl bg-[#08160f] border border-emerald-800/60 cursor-pointer">
          <span>Haptic Vibration Feedback</span>
          <input
            type="checkbox"
            checked={settings.haptics !== false}
            onChange={(e) =>
              GameController.dispatch({
                type: 'UPDATE_SETTINGS',
                partial: { haptics: e.target.checked },
              })
            }
            className="w-5 h-5 accent-amber-500"
          />
        </label>

        <label className="flex items-center justify-between p-3 rounded-xl bg-[#08160f] border border-emerald-800/60 cursor-pointer">
          <span>Reduced Animations</span>
          <input
            type="checkbox"
            checked={settings.reducedAnimations}
            onChange={(e) =>
              GameController.dispatch({
                type: 'UPDATE_SETTINGS',
                partial: { reducedAnimations: e.target.checked },
              })
            }
            className="w-5 h-5 accent-amber-500"
          />
        </label>

        <label className="flex items-center justify-between p-3 rounded-xl bg-[#08160f] border border-emerald-800/60 cursor-pointer">
          <span>Summer Droughts &amp; Weather Events</span>
          <input
            type="checkbox"
            checked={settings.mildDisasters}
            onChange={(e) =>
              GameController.dispatch({
                type: 'UPDATE_SETTINGS',
                partial: { mildDisasters: e.target.checked },
              })
            }
            className="w-5 h-5 accent-amber-500"
          />
        </label>

        <div className="p-3 rounded-xl bg-[#06110b] border border-emerald-900/60 text-[11px] text-stone-400 space-y-1 tabular-nums">
          <div className="font-semibold text-stone-300">Device Performance</div>
          <div>
            FPS: {perf.fps} · Frame p95: {perf.frameTimeP95Ms} ms · Sim Tick: {perf.simTickMs} ms
          </div>
          <div>Active Chunks in RAM: {perf.loadedChunks}</div>
        </div>

        <button
          type="button"
          onClick={() => GameController.setActiveModal('pause')}
          className="w-full min-h-[44px] rounded-xl bg-[#142c20] border border-emerald-700/60 text-stone-100 font-semibold"
        >
          Back to Menu
        </button>
      </div>
    </>
  );
};

const SavesContent: React.FC<{ snap: GameSnapshot }> = ({ snap }) => {
  const [slots, setSlots] = useState<SaveSlotSummary[]>([]);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [newCityName, setNewCityName] = useState('New Kukus Valley');
  const [difficulty, setDifficulty] = useState<'standard' | 'relaxed'>('standard');
  const [renamingId, setRenamingId] = useState<SaveSlotId | null>(null);
  const [renameText, setRenameText] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<SaveSlotId | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshSlots = async () => {
    setSlots(await GameController.listSaveSlots());
  };

  useEffect(() => {
    void refreshSlots();
  }, [snap.activeWorldId]);

  const handleExport = async () => {
    const blob = await GameController.saveManager.exportBackupFile(GameController.engine);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kukus_${snap.state.settings.cityName.replace(/\s+/g, '_').toLowerCase()}.kukus`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMsg('Backup file exported.');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const res = await GameController.importWorldFile(file);
    if (res.ok) {
      setStatusMsg('Backup imported as a new isolated world and loaded.');
      await refreshSlots();
    } else {
      setStatusMsg(res.error ?? 'Import failed.');
    }
    e.target.value = '';
  };

  return (
    <>
      <ModalHeader title="Worlds & Save Manager" />
      <div className="p-4 space-y-3 overflow-y-auto text-xs text-stone-200">
        {statusMsg ? (
          <div className="p-2.5 rounded-xl bg-emerald-900/60 border border-emerald-600/60 text-emerald-100">
            {statusMsg}
          </div>
        ) : null}

        <div className="text-[11px] text-stone-400">
          Every world has its own isolated storage. Autosaves always update only your currently open world.
        </div>

        <div className="space-y-2">
          {slots.map((info) => {
            const isActive = info.slotId === snap.activeWorldId;
            const isRenaming = renamingId === info.slotId;
            const isDeleting = confirmDeleteId === info.slotId;

            return (
              <div
                key={info.slotId}
                className={`p-3 rounded-2xl border space-y-2 ${
                  isActive
                    ? 'bg-emerald-950/70 border-amber-400/70'
                    : 'bg-[#08160f] border-emerald-800/60'
                }`}
              >
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <div className="min-w-0 flex-1">
                    {isRenaming ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          maxLength={28}
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          className="flex-1 min-w-0 h-9 px-2 rounded-lg bg-[#05100b] border border-amber-400/70 text-stone-100 text-xs"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            await GameController.renameWorld(info.slotId, renameText);
                            setRenamingId(null);
                            await refreshSlots();
                            setStatusMsg('World renamed.');
                          }}
                          className="min-w-[36px] min-h-[36px] rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0"
                          aria-label="Confirm rename"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Globe
                          className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-amber-300' : 'text-emerald-400'}`}
                        />
                        <span className="font-bold text-stone-100 truncate">
                          {isActive ? snap.state.settings.cityName : info.cityName}
                        </span>
                        {isActive ? (
                          <span className="text-[10px] font-bold text-amber-300 shrink-0">Active</span>
                        ) : null}
                      </div>
                    )}
                    <div className="text-[11px] text-stone-400 tabular-nums mt-0.5 truncate">
                      Lv.{info.level} · {info.population} pop · {info.coins}C ·{' '}
                      {new Date(info.savedAt).toLocaleString()}
                    </div>
                  </div>

                  <button
                    type="button"
                    aria-label="Rename world"
                    onClick={() => {
                      setRenamingId(isRenaming ? null : info.slotId);
                      setRenameText(isActive ? snap.state.settings.cityName : info.cityName);
                    }}
                    className="min-w-[36px] min-h-[36px] rounded-lg bg-[#0d2217] border border-emerald-800/60 text-stone-300 hover:text-white flex items-center justify-center shrink-0"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {isActive ? (
                    <button
                      type="button"
                      onClick={async () => {
                        await GameController.saveToSlot(info.slotId);
                        await refreshSlots();
                        setStatusMsg(`Saved "${snap.state.settings.cityName}".`);
                      }}
                      className="flex-1 min-h-[40px] px-3 rounded-xl bg-amber-500 text-stone-950 font-bold"
                    >
                      Save Now
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={async () => {
                          const res = await GameController.switchWorld(info.slotId);
                          if (res.ok) {
                            setStatusMsg(
                              res.recoveredFromBackup
                                ? `Recovered ${info.cityName} from backup.`
                                : `Loaded ${info.cityName}.`
                            );
                            GameController.setActiveModal('none');
                          } else {
                            setStatusMsg(res.error ?? 'Load failed');
                          }
                        }}
                        className="flex-1 min-h-[40px] px-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold"
                      >
                        Switch / Load
                      </button>
                      {!isDeleting ? (
                        <button
                          type="button"
                          aria-label={`Delete ${info.cityName}`}
                          onClick={() => setConfirmDeleteId(info.slotId)}
                          className="min-w-[40px] min-h-[40px] px-2.5 rounded-xl bg-red-950/80 border border-red-800/60 text-red-200 flex items-center justify-center"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            await GameController.deleteWorld(info.slotId);
                            setConfirmDeleteId(null);
                            await refreshSlots();
                            setStatusMsg(`Deleted ${info.cityName}.`);
                          }}
                          className="min-h-[40px] px-3 rounded-xl bg-red-600 text-white font-bold"
                        >
                          Confirm Delete
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Export / Import */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="min-h-[44px] px-3 rounded-xl bg-[#0b1f15] border border-emerald-700/60 text-stone-100 font-semibold flex items-center justify-center gap-1.5"
          >
            <Download className="w-4 h-4" />
            Export .kukus
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="min-h-[44px] px-3 rounded-xl bg-[#0b1f15] border border-emerald-700/60 text-stone-100 font-semibold flex items-center justify-center gap-1.5"
          >
            <Upload className="w-4 h-4" />
            Import .kukus
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".kukus,.json"
            onChange={(e) => void handleImport(e)}
            className="hidden"
          />
        </div>

        {/* Create New Isolated World */}
        <div className="pt-3 border-t border-emerald-800/50 space-y-2">
          <div className="font-semibold text-stone-200">Create New Isolated World</div>
          <p className="text-[11px] text-stone-400">
            Saves your current world safely and starts a fresh world in its own separate slot.
          </p>
          <input
            type="text"
            maxLength={24}
            value={newCityName}
            onChange={(e) => setNewCityName(e.target.value)}
            placeholder="Settlement name"
            className="w-full h-10 px-3 rounded-xl bg-[#06110b] border border-emerald-800/70 text-stone-100 text-xs"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDifficulty('standard')}
              className={`flex-1 min-h-[40px] rounded-xl font-semibold ${
                difficulty === 'standard' ? 'bg-amber-500 text-stone-950' : 'bg-[#08160f] border border-emerald-800/60 text-stone-300'
              }`}
            >
              Standard
            </button>
            <button
              type="button"
              onClick={() => setDifficulty('relaxed')}
              className={`flex-1 min-h-[40px] rounded-xl font-semibold ${
                difficulty === 'relaxed' ? 'bg-emerald-600 text-white' : 'bg-[#08160f] border border-emerald-800/60 text-stone-300'
              }`}
            >
              Relaxed
            </button>
          </div>
          <button
            type="button"
            onClick={() => void GameController.createNewWorld(newCityName.trim() || 'New Kukus Valley', difficulty)}
            className="w-full min-h-[44px] rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-4 h-4" />
            Create New World (20 Jungle Tiles)
          </button>
        </div>

        <div className="text-[11px] text-stone-400 flex justify-between pt-1">
          <span>
            Storage: {snap.offline.storagePersisted ? 'Persistent' : 'Standard Browser'}
          </span>
          <span>
            {snap.offline.quotaFreeMB !== null ? `${snap.offline.quotaFreeMB} MB free` : ''}
          </span>
        </div>
      </div>
    </>
  );
};
