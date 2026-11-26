import React, { useState } from 'react';
import {
  Axe,
  Compass,
  Eye,
  FlaskConical,
  Hammer,
  Landmark,
  Layers,
  Map as MapIcon,
  Sprout,
  Users,
  Check,
  X,
  Crosshair,
  Trash2,
  RotateCw,
  Hand,
  Paintbrush,
  ArrowUpCircle,
} from 'lucide-react';
import { ZONE_META, ZoneType } from '../../core/GameState';
import { BUILDINGS, getBuildingFootprint } from '../../data/buildings.data';
import { RESOURCES, ResourceId } from '../../data/resources.data';
import type { TerrainBrushKind } from '../../engine/WorldScene';
import {
  BuildingCostCalculator,
  clampBuildingLevel,
  getEffectiveMaxLevel,
} from '../../systems/BuildingSimulation';
import { GameController, GameSnapshot } from '../bridge/GameController';

interface BottomDockProps {
  snap: GameSnapshot;
}

const DISTRICT_ZONES = (Object.keys(ZONE_META) as ZoneType[]).filter((z) => z !== 'none');

export const BottomDock: React.FC<BottomDockProps> = ({ snap }) => {
  const { tool, ghostInfo, activeSheet, activeToolPanel, activeQuest, state, panMode } = snap;
  const [customSizeOpen, setCustomSizeOpen] = useState(false);

  const isBuildGhost = tool.mode === 'build';
  const isMoveGhost = tool.mode === 'move';
  const isGhostMode = isBuildGhost || isMoveGhost;
  const movingBldg = isMoveGhost
    ? state.buildings.find((b) => b.id === tool.buildingId)
    : undefined;
  const ghostDef = isBuildGhost
    ? BUILDINGS[tool.defId]
    : movingBldg
      ? BUILDINGS[movingBldg.defId]
      : null;

  const ghostRot: 0 | 1 = isBuildGhost
    ? (tool.rotation ?? 0)
    : isMoveGhost
      ? (tool.rotation ?? movingBldg?.rotation ?? 0)
      : 0;
  const ghostFp = ghostDef ? getBuildingFootprint(ghostDef, ghostRot) : null;
  const canRotateGhost = Boolean(
    ghostDef && ghostDef.width !== ghostDef.height && ghostDef.footprintRotatable !== false
  );
  const ghostLevel =
    isBuildGhost && ghostDef
      ? clampBuildingLevel(
          ghostDef,
          tool.targetLevel ?? state.unlockedBuildingLevels?.[ghostDef.id] ?? 1
        )
      : isMoveGhost && movingBldg
        ? movingBldg.level
        : 1;
  const ghostBuildCost =
    isBuildGhost && ghostDef
      ? BuildingCostCalculator.getCumulativeBuildCost(ghostDef, ghostLevel)
      : null;

  let readyUpgradeCount = 0;
  for (const b of state.buildings) {
    if (b.status === 'constructing') continue;
    const def = BUILDINGS[b.defId];
    if (!def) continue;
    const maxLvl = getEffectiveMaxLevel(def);
    if (b.level >= maxLvl) continue;
    const stepCost = BuildingCostCalculator.getUpgradeStepCost(def, b.level);
    if (BuildingCostCalculator.evaluateCost(stepCost, state).canAfford) {
      readyUpgradeCount += 1;
    }
  }

  const isOtherToolBar =
    activeToolPanel === 'none' &&
    (tool.mode === 'road' ||
      tool.mode === 'demolish' ||
      tool.mode === 'place_utility' ||
      tool.mode === 'remove_utility' ||
      tool.mode === 'rect_land');

  const isAnyBrushOrPanel = activeToolPanel !== 'none' || isOtherToolBar;

  const showChopHint =
    state.stats.treesCut === 0 &&
    !isGhostMode &&
    !isAnyBrushOrPanel &&
    !snap.selectedTile &&
    !snap.selectedBuildingId;

  const activeBrush = tool.mode === 'terrain_brush' ? tool.brush : 'water';
  const activeRadius = tool.mode === 'terrain_brush' ? tool.radius : 0;
  const activeZone: ZoneType = tool.mode === 'terrain_brush' ? (tool.zoneType ?? 'residential') : 'residential';
  const isClearMarkingsMode = activeBrush === 'zone' && activeZone === 'none';
  const isZoneMarkingMode = activeBrush === 'zone' && activeZone !== 'none';
  const activeDiameter = activeRadius * 2 + 1;

  const setBrush = (brush: TerrainBrushKind, zoneType?: ZoneType) => {
    GameController.updateBrushConfig({
      brush,
      radius: activeRadius,
      zoneType: brush === 'zone' ? (zoneType ?? (activeZone === 'none' ? 'residential' : activeZone)) : undefined,
    });
  };

  const setRadius = (r: number, keepCustomOpen = false) => {
    setCustomSizeOpen(keepCustomOpen);
    GameController.updateBrushConfig({ radius: Math.max(0, Math.min(6, Math.floor(r))) });
  };

  const applyCustomDiameter = (rawValue: number) => {
    const clamped = Math.max(1, Math.min(13, Math.trunc(rawValue) || 1));
    const nextRadius = Math.max(0, Math.min(6, Math.floor((clamped - 1) / 2)));
    setRadius(nextRadius, true);
  };

  return (
    <div className="pointer-events-none w-full max-w-full flex flex-col gap-2 px-2.5 pb-safe">
      {/* Right-Edge Main Toolbar: strictly View | Brush | Point/Compass */}
      {!isGhostMode && (
        <div className="flex justify-end pr-0.5">
          <div className="pointer-events-auto flex flex-col gap-1.5 bg-gradient-to-b from-[#13291e]/94 to-[#08150f]/95 backdrop-blur-md border border-emerald-700/45 rounded-2xl p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_20px_rgba(0,0,0,0.4)]">
            <button
              type="button"
              aria-label="View Settings"
              onClick={() => GameController.setActiveToolPanel('view')}
              className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-colors ${
                activeToolPanel === 'view'
                  ? 'bg-emerald-400 border-emerald-300 text-stone-950 font-bold'
                  : state.landModeActive || state.showZoneBorders
                    ? 'bg-[#0d271b] border-amber-400/70 text-amber-300'
                    : 'bg-[#0a1c13] hover:bg-emerald-900/80 border-emerald-800/50 text-emerald-300'
              }`}
              title="View"
            >
              <Eye className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Brush Tools"
              onClick={() => GameController.setActiveToolPanel('brush')}
              className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-colors ${
                activeToolPanel === 'brush'
                  ? 'bg-sky-400 border-sky-300 text-stone-950 font-bold'
                  : 'bg-[#0a1c13] hover:bg-sky-950/80 border-sky-800/60 text-sky-300'
              }`}
              title="Brush"
            >
              <Paintbrush className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Recenter camera"
              onClick={() => GameController.centerCamera()}
              className="w-11 h-11 rounded-xl bg-[#0a1c13] hover:bg-emerald-900/80 border border-emerald-800/50 text-amber-300 flex items-center justify-center transition-colors"
              title="Point / Compass"
            >
              <Crosshair className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Non-blocking Initial Clearing Prompt */}
      {showChopHint ? (
        <div className="pointer-events-none mx-auto max-w-full bg-gradient-to-b from-[#163225]/92 to-[#0b1b13]/94 backdrop-blur-md border border-amber-500/45 rounded-xl px-3.5 py-2 shadow-lg flex items-center gap-2 text-xs text-stone-100">
          <Axe className="w-4 h-4 text-amber-400 shrink-0" />
          <span>Tap trees inside your sunlit estate to chop wood &amp; earn coins</span>
        </div>
      ) : null}

      {/* Centralized Bottom Brush Panel (Compact Floating Tool Panel) */}
      {!isGhostMode && activeToolPanel === 'brush' ? (
        <div className="pointer-events-auto mx-auto w-full max-w-lg min-w-0 bg-gradient-to-b from-[#0f2938]/96 to-[#081722]/96 backdrop-blur-md border border-sky-500/60 rounded-2xl p-2.5 space-y-2 shadow-lg">
          {/* Top Bar: Mode Status + Pan/Brush Mode Switch + Done */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Paintbrush className="w-4 h-4 text-sky-300 shrink-0" />
              <span className="text-xs font-bold text-stone-100 truncate tabular-nums">
                {panMode
                  ? 'Pan Mode (Drag Map)'
                  : `${
                      activeBrush === 'water'
                        ? 'Water'
                        : activeBrush === 'land'
                          ? 'Land'
                          : activeBrush === 'unlock'
                            ? 'Unlock Land'
                            : isClearMarkingsMode
                              ? 'Clear Markings'
                              : 'Zone Marking'
                    } · ${activeDiameter}×${activeDiameter}`}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => GameController.setPanMode(!panMode)}
                className={`min-h-[38px] px-2.5 rounded-xl text-xs font-bold flex items-center gap-1 border transition-colors ${
                  panMode
                    ? 'bg-amber-400 border-amber-300 text-stone-950'
                    : 'bg-[#091c28] border-sky-500/70 text-sky-100'
                }`}
              >
                {panMode ? <Hand className="w-3.5 h-3.5" /> : <Paintbrush className="w-3.5 h-3.5" />}
                {panMode ? 'Pan' : 'Brush'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCustomSizeOpen(false);
                  GameController.setActiveToolPanel('none');
                }}
                className="min-h-[38px] px-3 rounded-xl bg-sky-700 hover:bg-sky-600 text-white text-xs font-bold flex items-center gap-1 shrink-0"
              >
                <Check className="w-3.5 h-3.5" />
                Done
              </button>
            </div>
          </div>

          {/* Brush Options */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {(
              [
                { id: 'water', label: 'Water', active: activeBrush === 'water', onClick: () => setBrush('water') },
                { id: 'land', label: 'Land', active: activeBrush === 'land', onClick: () => setBrush('land') },
                { id: 'unlock', label: 'Unlock Land', active: activeBrush === 'unlock', onClick: () => setBrush('unlock') },
                {
                  id: 'zone',
                  label: 'Zone Marking',
                  active: isZoneMarkingMode,
                  onClick: () => setBrush('zone', activeZone === 'none' ? 'residential' : activeZone),
                },
                {
                  id: 'clear',
                  label: 'Clear Zones',
                  active: isClearMarkingsMode,
                  onClick: () => setBrush('zone', 'none'),
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={opt.onClick}
                className={`min-h-[36px] px-2.5 rounded-xl text-[11px] font-bold whitespace-nowrap shrink-0 border transition-colors ${
                  opt.active
                    ? opt.id === 'land'
                      ? 'bg-emerald-400 border-emerald-300 text-stone-950'
                      : opt.id === 'clear'
                        ? 'bg-rose-400 border-rose-300 text-stone-950'
                        : 'bg-sky-400 border-sky-300 text-stone-950'
                    : 'bg-[#091c28] border-sky-800/70 text-sky-100 hover:border-sky-500/70'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Contextual Sub-Option: District Zone Selector OR Clear Target */}
          {isZoneMarkingMode ? (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-sky-200 font-semibold shrink-0">District:</span>
              <select
                value={activeZone}
                onChange={(e) => setBrush('zone', e.target.value as ZoneType)}
                className="flex-1 min-w-0 min-h-[36px] px-2.5 rounded-xl bg-[#07151f] border border-sky-700/70 text-[11px] font-semibold text-stone-100"
              >
                {DISTRICT_ZONES.map((z) => (
                  <option key={z} value={z}>
                    {ZONE_META[z].name} ({ZONE_META[z].bonusText})
                  </option>
                ))}
              </select>
            </div>
          ) : isClearMarkingsMode ? (
            <div className="text-[11px] text-sky-200/90 px-0.5">
              Tap or drag unlocked tiles to clear District Zone markings.
            </div>
          ) : null}

          {/* Brush Size Controls: Small, Medium, Large, Custom Size */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 pt-0.5 border-t border-sky-800/50 tabular-nums">
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-sky-200/90 font-semibold mr-0.5">Size:</span>
              <button
                type="button"
                onClick={() => setRadius(0, false)}
                className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold border ${
                  !customSizeOpen && activeRadius === 0
                    ? 'bg-amber-400 border-amber-300 text-stone-950'
                    : 'bg-[#091c28] border-sky-800/70 text-stone-200'
                }`}
              >
                Small
              </button>
              <button
                type="button"
                onClick={() => setRadius(1, false)}
                className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold border ${
                  !customSizeOpen && activeRadius === 1
                    ? 'bg-amber-400 border-amber-300 text-stone-950'
                    : 'bg-[#091c28] border-sky-800/70 text-stone-200'
                }`}
              >
                Medium
              </button>
              <button
                type="button"
                onClick={() => setRadius(2, false)}
                className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold border ${
                  !customSizeOpen && activeRadius === 2
                    ? 'bg-amber-400 border-amber-300 text-stone-950'
                    : 'bg-[#091c28] border-sky-800/70 text-stone-200'
                }`}
              >
                Large
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextOpen = !customSizeOpen;
                  setCustomSizeOpen(nextOpen);
                  if (nextOpen && activeRadius < 3) {
                    setRadius(3, true);
                  }
                }}
                className={`min-h-[34px] px-2.5 rounded-lg text-[11px] font-bold border ${
                  customSizeOpen || activeRadius >= 3
                    ? 'bg-amber-400 border-amber-300 text-stone-950'
                    : 'bg-[#091c28] border-sky-800/70 text-stone-200'
                }`}
              >
                Custom
              </button>
            </div>

            {(customSizeOpen || activeRadius >= 3) && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Decrease custom brush size"
                  onClick={() => setRadius(Math.max(0, activeRadius - 1), true)}
                  className="w-8 h-[34px] rounded-lg bg-[#091c28] border border-sky-700/70 text-stone-100 font-bold text-xs"
                >
                  -
                </button>
                <input
                  type="number"
                  aria-label="Custom brush width"
                  min={1}
                  max={13}
                  step={2}
                  value={activeDiameter}
                  onChange={(e) => applyCustomDiameter(Number(e.target.value))}
                  className="w-12 h-[34px] text-center rounded-lg bg-[#07151f] border border-sky-700/70 text-xs font-bold text-amber-300"
                />
                <button
                  type="button"
                  aria-label="Increase custom brush size"
                  onClick={() => setRadius(Math.min(6, activeRadius + 1), true)}
                  className="w-8 h-[34px] rounded-lg bg-[#091c28] border border-sky-700/70 text-stone-100 font-bold text-xs"
                >
                  +
                </button>
              </div>
            )}
          </div>
        </div>
      ) : !isGhostMode && activeToolPanel === 'view' ? (
        /* Centralized Bottom View Panel */
        <div className="pointer-events-auto mx-auto w-full max-w-lg min-w-0 bg-gradient-to-b from-[#13291e]/96 to-[#08150f]/96 backdrop-blur-md border border-emerald-600/60 rounded-2xl p-2.5 space-y-2 shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Eye className="w-4 h-4 text-emerald-300 shrink-0" />
              <span className="text-xs font-bold text-stone-100 truncate">
                View Mode: {state.landModeActive ? 'Land View' : 'Normal View'}
                {state.showZoneBorders ? ' · Borders ON' : ''}
              </span>
            </div>
            <button
              type="button"
              onClick={() => GameController.setActiveToolPanel('none')}
              className="min-h-[38px] px-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold flex items-center gap-1 shrink-0"
            >
              <Check className="w-3.5 h-3.5" />
              Done
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              onClick={() => GameController.dispatch({ type: 'TOGGLE_LAND_MODE', enabled: false })}
              className={`min-h-[44px] px-2 rounded-xl border text-xs font-bold transition-colors ${
                !state.landModeActive
                  ? 'bg-emerald-400 border-emerald-300 text-stone-950'
                  : 'bg-[#091c12] border-emerald-800/70 text-stone-200'
              }`}
            >
              Normal View
            </button>
            <button
              type="button"
              onClick={() => GameController.dispatch({ type: 'TOGGLE_LAND_MODE', enabled: true })}
              className={`min-h-[44px] px-2 rounded-xl border text-xs font-bold transition-colors ${
                state.landModeActive
                  ? 'bg-amber-400 border-amber-300 text-stone-950'
                  : 'bg-[#091c12] border-emerald-800/70 text-stone-200'
              }`}
            >
              Land View
            </button>
            <button
              type="button"
              onClick={() =>
                GameController.dispatch({
                  type: 'TOGGLE_ZONE_BORDERS',
                  enabled: !state.showZoneBorders,
                })
              }
              className={`min-h-[44px] px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1 transition-colors ${
                state.showZoneBorders
                  ? 'bg-sky-400 border-sky-300 text-stone-950'
                  : 'bg-[#091c12] border-emerald-800/70 text-stone-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Borders {state.showZoneBorders ? 'ON' : 'OFF'}</span>
            </button>
          </div>

          <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-emerald-800/50">
            {(
              [
                ['power', 'Power Grid'],
                ['water', 'Water Pipes'],
                ['traffic', 'Traffic'],
                ['zones', 'Zones'],
              ] as const
            ).map(([ovId, ovLabel]) => {
              const active = snap.overlayMode === ovId;
              return (
                <button
                  key={ovId}
                  type="button"
                  onClick={() => GameController.setOverlayMode(active ? 'none' : ovId)}
                  className={`min-h-[44px] px-1.5 rounded-xl border text-[11px] font-semibold whitespace-nowrap truncate transition-colors ${
                    active
                      ? 'bg-amber-400 border-amber-300 text-stone-950 font-bold'
                      : 'bg-[#091c12] border-emerald-800/70 text-stone-300'
                  }`}
                >
                  {ovLabel}
                </button>
              );
            })}
          </div>
        </div>
      ) : !isGhostMode && isOtherToolBar ? (
        /* Existing Road / Demolish / Utility Active Bar */
        <div
          className={`pointer-events-auto mx-auto w-full max-w-md min-w-0 backdrop-blur-md border rounded-2xl px-3 py-2 flex items-center justify-between gap-2 shadow-lg ${
            tool.mode === 'demolish' || tool.mode === 'remove_utility'
              ? 'bg-gradient-to-b from-red-950/95 to-[#1a0909]/95 border-red-600/60 text-red-100'
              : 'bg-gradient-to-b from-[#142c20]/96 to-[#08160f]/96 border-emerald-600/60 text-stone-100'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0 text-xs">
            {tool.mode === 'demolish' || tool.mode === 'remove_utility' ? (
              <Trash2 className="w-4 h-4 text-red-400 shrink-0" />
            ) : (
              <Paintbrush className="w-4 h-4 text-amber-300 shrink-0" />
            )}
            <span className="truncate font-semibold">
              {panMode
                ? 'Pan Mode: Drag to scroll map'
                : tool.mode === 'demolish'
                  ? 'Remove: Tap/drag roads, trees & buildings'
                  : tool.mode === 'road'
                    ? 'Road Brush: Tap or drag along tiles'
                    : tool.mode === 'place_utility'
                      ? 'Utility Brush: Tap or drag tiles'
                      : 'Remove Utility: Tap or drag tiles'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => GameController.setPanMode(!panMode)}
              className={`min-h-[44px] px-2.5 rounded-xl text-xs font-bold flex items-center gap-1 ${
                panMode
                  ? 'bg-amber-400 text-stone-950'
                  : 'bg-black/35 border border-white/20 text-stone-100'
              }`}
            >
              {panMode ? <Hand className="w-3.5 h-3.5" /> : <Paintbrush className="w-3.5 h-3.5" />}
              {panMode ? 'Pan' : 'Paint'}
            </button>
            <button
              type="button"
              onClick={() => GameController.setTool({ mode: 'inspect_chop' })}
              className={`min-h-[44px] px-3 rounded-xl text-white text-xs font-bold shrink-0 ${
                tool.mode === 'demolish' || tool.mode === 'remove_utility'
                  ? 'bg-red-800/90 hover:bg-red-700'
                  : 'bg-emerald-700 hover:bg-emerald-600'
              }`}
            >
              Done
            </button>
          </div>
        </div>
      ) : null}

      {/* Contextual Floating Action Bars (Build/Move Ghost Confirm OR Quest Card + Tool Switcher) */}
      {isGhostMode && ghostDef && ghostFp ? (
        <div className="pointer-events-auto mx-auto w-full max-w-md min-w-0 bg-gradient-to-b from-[#152e22]/96 to-[#091710]/97 backdrop-blur-md border border-emerald-700/60 rounded-2xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_12px_30px_rgba(0,0,0,0.5)]">
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-stone-100 truncate">
              {isMoveGhost
                ? 'Move'
                : isBuildGhost && tool.copiedFromBuildingId
                  ? 'Copy'
                  : 'Place'}{' '}
              {ghostDef.name} · Lv.{ghostLevel} ({ghostFp.width}×{ghostFp.height})
            </div>
            {ghostBuildCost ? (
              <div className="text-[10px] text-amber-300/95 font-semibold tabular-nums truncate">
                Cost: {ghostBuildCost.coinCost.toLocaleString()}C
                {Object.entries(ghostBuildCost.materialCost)
                  .map(([k, v]) => ` · ${v} ${RESOURCES[k as ResourceId]?.name ?? k}`)
                  .join('')}
              </div>
            ) : null}
            <div className={`text-[11px] tabular-nums truncate ${ghostInfo && !ghostInfo.valid ? 'text-amber-300' : 'text-stone-300'}`}>
              {ghostInfo
                ? ghostInfo.valid
                  ? `Tile (${ghostInfo.gx}, ${ghostInfo.gy}) · Tap Confirm or tap tile again`
                  : ghostInfo.reason
                : ghostDef.isAutomatedTreePlantation
                  ? 'Tap unlocked land for 20×50 reserve (10×20 hall + 800-plot yard)'
                  : 'Tap any flat cleared tile'}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => GameController.setTool({ mode: 'inspect_chop' })}
              className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-stone-800/90 border border-stone-600/60 text-stone-200 flex items-center justify-center hover:bg-stone-700"
              aria-label={isMoveGhost ? 'Cancel move' : 'Cancel build'}
            >
              <X className="w-4 h-4" />
            </button>
            {canRotateGhost ? (
              <button
                type="button"
                onClick={() => GameController.rotateTool()}
                className="min-w-[44px] min-h-[44px] px-3 rounded-xl bg-[#0d2433] border border-sky-600/60 text-sky-200 font-bold text-xs flex items-center justify-center gap-1"
                aria-label="Rotate footprint"
              >
                <RotateCw className="w-4 h-4" />
                Rotate
              </button>
            ) : null}
            {ghostInfo?.blockingObstacleTiles && ghostInfo.blockingObstacleTiles.length > 0 ? (
              <button
                type="button"
                onClick={() => GameController.clearGhostObstacles()}
                className="min-h-[44px] px-3 rounded-xl bg-gradient-to-b from-lime-500 to-lime-600 text-stone-950 font-bold text-xs flex items-center gap-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_3px_0_#365314]"
              >
                Clear ({ghostInfo.blockingObstacleTiles.length})
              </button>
            ) : null}
            <button
              type="button"
              disabled={!ghostInfo?.valid}
              onClick={() => GameController.confirmGhostBuild()}
              className="min-w-[44px] min-h-[44px] px-3.5 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 disabled:from-stone-700 disabled:to-stone-800 disabled:text-stone-400 text-stone-950 font-bold text-xs flex items-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.4),0_3px_0_#92400e] disabled:shadow-none active:translate-y-[2px]"
            >
              <Check className="w-4 h-4" />
              {isMoveGhost ? 'Move' : 'Build'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-end justify-between gap-2 min-w-0">
          {/* Active Guided Quest Strip */}
          {activeQuest ? (
            <div className="pointer-events-auto max-w-[200px] sm:max-w-xs min-w-0 bg-gradient-to-b from-[#142c20]/94 to-[#091610]/95 backdrop-blur-md border border-emerald-700/45 rounded-xl px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_6px_18px_rgba(0,0,0,0.4)]">
              <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-amber-300">
                <span className="truncate min-w-0">{activeQuest.quest.title}</span>
                <span className="tabular-nums shrink-0 text-amber-200">
                  {activeQuest.progress}/{activeQuest.quest.targetValue}
                </span>
              </div>
              <div className="text-[10px] text-stone-300 truncate mt-0.5">{activeQuest.quest.description}</div>
              <div className="w-full h-1 bg-[#06110b] rounded-sm overflow-hidden mt-1.5">
                <div
                  className="h-full bg-amber-400 transition-all duration-200"
                  style={{
                    width: `${Math.min(100, Math.round((activeQuest.progress / activeQuest.quest.targetValue) * 100))}%`,
                  }}
                />
              </div>
            </div>
          ) : (
            <div />
          )}

          {/* Quick Map Tools: Inspect/Chop, Sapling, Remove/Bulldoze */}
          <div className="pointer-events-auto flex items-center gap-1 bg-gradient-to-b from-[#13291e]/94 to-[#08150f]/95 backdrop-blur-md border border-emerald-700/45 rounded-2xl p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_20px_rgba(0,0,0,0.4)]">
            <button
              type="button"
              title="Chop / Inspect"
              aria-label="Chop or inspect tool"
              onClick={() => GameController.setTool({ mode: 'inspect_chop' })}
              className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center transition-all ${
                tool.mode === 'inspect_chop'
                  ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-stone-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_0_#92400e]'
                  : 'text-stone-300 hover:text-white hover:bg-emerald-950/60'
              }`}
            >
              <Axe className="w-4 h-4" />
            </button>
            <button
              type="button"
              title="Plant Sapling"
              aria-label="Plant sapling tool"
              onClick={() => GameController.setTool({ mode: 'replant' })}
              className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center transition-all ${
                tool.mode === 'replant'
                  ? 'bg-gradient-to-b from-emerald-400 to-emerald-500 text-stone-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_0_#065f46]'
                  : 'text-stone-300 hover:text-white hover:bg-emerald-950/60'
              }`}
            >
              <Sprout className="w-4 h-4" />
            </button>
            <button
              type="button"
              title="Remove Roads, Trees or Buildings"
              aria-label="Remove tool"
              onClick={() =>
                GameController.setTool(
                  tool.mode === 'demolish' ? { mode: 'inspect_chop' } : { mode: 'demolish' }
                )
              }
              className={`min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center transition-all ${
                tool.mode === 'demolish'
                  ? 'bg-gradient-to-b from-red-500 to-red-600 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_2px_0_#7f1d1d]'
                  : 'text-stone-300 hover:text-red-300 hover:bg-red-950/40'
              }`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Primary 6-Tab Sculpted Bottom Navigation Dock */}
      <nav className="pointer-events-auto mx-auto w-full max-w-2xl bg-gradient-to-b from-[#142c20]/96 to-[#08150f]/97 backdrop-blur-md border border-emerald-700/50 rounded-2xl grid grid-cols-6 gap-1 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_10px_30px_rgba(0,0,0,0.55)]">
        <DockTab
          icon={<Hammer className="w-5 h-5" />}
          label="Build"
          active={activeSheet === 'build'}
          onClick={() => GameController.setActiveSheet('build')}
        />
        <DockTab
          icon={<ArrowUpCircle className="w-5 h-5" />}
          label="Level Up"
          badge={readyUpgradeCount > 0 ? readyUpgradeCount : undefined}
          active={activeSheet === 'levelup'}
          onClick={() => GameController.setActiveSheet('levelup')}
        />
        <DockTab
          icon={<MapIcon className="w-5 h-5" />}
          label="Land"
          active={activeSheet === 'land'}
          onClick={() => GameController.setActiveSheet('land')}
        />
        <DockTab
          icon={<Landmark className="w-5 h-5" />}
          label="Economy"
          active={activeSheet === 'economy'}
          onClick={() => GameController.setActiveSheet('economy')}
        />
        <DockTab
          icon={<Users className="w-5 h-5" />}
          label="Society"
          active={activeSheet === 'population'}
          onClick={() => GameController.setActiveSheet('population')}
        />
        <DockTab
          icon={<FlaskConical className="w-5 h-5" />}
          label="Tech"
          active={activeSheet === 'tech'}
          onClick={() => GameController.setActiveSheet('tech')}
        />
      </nav>
    </div>
  );
};

interface DockTabProps {
  icon: React.ReactNode;
  label: string;
  badge?: number;
  active: boolean;
  onClick: () => void;
}

const DockTab: React.FC<DockTabProps> = ({ icon, label, badge, active, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className={`relative min-h-[50px] flex flex-col items-center justify-center rounded-xl transition-all px-0.5 ${
      active
        ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-stone-950 font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_0_#92400e]'
        : 'text-stone-200 hover:text-white hover:bg-[#163124]/80 border border-transparent hover:border-emerald-800/40'
    }`}
  >
    {icon}
    {badge ? (
      <span
        className={`absolute top-1 right-1.5 min-w-[16px] h-4 px-1 rounded-md text-[9px] font-extrabold tabular-nums flex items-center justify-center ${
          active ? 'bg-stone-950 text-amber-300' : 'bg-emerald-500 text-stone-950'
        }`}
      >
        {badge > 99 ? '99+' : badge}
      </span>
    ) : null}
    <span className="text-[10px] sm:text-[11px] font-semibold mt-0.5 whitespace-nowrap">{label}</span>
  </button>
);

export { Compass };
