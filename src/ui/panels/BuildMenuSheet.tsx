import React, { useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Coins,
  Compass,
  Droplets,
  Factory,
  Grid,
  Hammer,
  HelpCircle,
  Lock,
  Mountain,
  Trees,
  Truck,
  Zap,
} from 'lucide-react';
import { formatInGameHourlyRate, getRecipeHourlyAmount } from '../../core/Formatters';
import {
  BUILDING_LIST,
  BuildingCategory,
  BuildingDef,
  getBuildingLevelMultiplier,
  getCorporateLevelTitle,
  isLargeFactory,
} from '../../data/buildings.data';
import { RESOURCES, ResourceId } from '../../data/resources.data';
import { BUILDABLE_ROADS, RoadType } from '../../data/roads.data';
import { TECH_MAP } from '../../data/techTree.data';
import {
  clampBuildingLevel,
  getBuildingStatsAtLevel,
  getDynamicBuildingSummary,
  getEffectiveMaxLevel,
} from '../../systems/BuildingSimulation';
import { BuildingSystem } from '../../systems/BuildingSystem';
import { EconomySystem } from '../../systems/EconomySystem';
import { PLANTATION_LEVELS, PLANTATION_TOTAL_SLOTS, TreePlantationSystem } from '../../systems/TreePlantationSystem';
import { GameController, GameSnapshot } from '../bridge/GameController';
import { SheetContainer } from './SheetContainer';

type FilterTab =
  | 'all'
  | 'ready'
  | 'residential'
  | 'farming_fishing'
  | 'production'
  | 'industrial'
  | 'markets_trade'
  | 'corporate'
  | 'government'
  | 'roads'
  | 'energy'
  | 'services';

const SERVICE_CATS: BuildingCategory[] = [
  'storage',
  'educational',
  'healthcare',
  'recreational',
];

const BuildingMiniPreview: React.FC<{ def: BuildingDef }> = ({ def }) => (
  <svg
    viewBox="0 0 44 44"
    className="w-11 h-11 shrink-0 rounded-xl bg-[#07150e] border border-emerald-800/60 p-1 shadow-inner"
    aria-hidden="true"
  >
    <polygon points="22,28 38,34 22,40 6,34" fill="#1b4332" stroke="#2d6a4f" strokeWidth="1" />
    {def.category === 'agricultural' || def.id === 'village_park' || def.id === 'fountain_plaza' ? (
      <>
        <polygon points="22,24 35,30 22,36 9,30" fill={def.roofColor} />
        <circle cx="16" cy="29" r="2.4" fill={def.accentColor} />
        <circle cx="28" cy="29" r="2.4" fill={def.accentColor} />
        <rect x="19" y="14" width="6" height="9" fill={def.wallColor} />
        <polygon points="22,9 27,14 17,14" fill={def.accentColor} />
      </>
    ) : def.requiredDeposit || def.id === 'marble_quarry' ? (
      <>
        <ellipse cx="22" cy="31" rx="10" ry="5" fill="#1e293b" />
        <polyline points="14,32 22,12 30,32" fill="none" stroke={def.accentColor} strokeWidth="2.4" />
        <circle cx="22" cy="16" r="2.8" fill="#e2e8f0" />
        <rect x="26" y="27" width="8" height="6" fill={def.wallColor} />
      </>
    ) : def.category === 'industrial' || def.id === 'brick_kiln' || def.id === 'coal_power_plant' ? (
      <>
        <polygon points="11,20 22,25 22,36 11,31" fill={def.wallColor} />
        <polygon points="22,25 33,20 33,31 22,36" fill={def.wallColor} fillOpacity="0.72" />
        <polygon points="22,14 33,19 22,24 11,19" fill={def.roofColor} />
        <rect x="15" y="7" width="3.5" height="10" fill="#475569" />
        <rect x="25" y="5" width="3.5" height="12" fill="#475569" />
        <rect x="15" y="7" width="3.5" height="2" fill={def.accentColor} />
        <rect x="25" y="5" width="3.5" height="2" fill={def.accentColor} />
      </>
    ) : def.id === 'wind_turbine' || def.id === 'windmill' || def.id === 'watchtower' ? (
      <>
        <rect x="20" y="13" width="4" height="21" fill="#cbd5e1" />
        <line x1="22" y1="14" x2="22" y2="5" stroke={def.accentColor} strokeWidth="2.2" />
        <line x1="22" y1="14" x2="13" y2="20" stroke={def.accentColor} strokeWidth="2.2" />
        <line x1="22" y1="14" x2="31" y2="20" stroke={def.accentColor} strokeWidth="2.2" />
      </>
    ) : (
      <>
        <polygon points="11,19 22,24 22,36 11,31" fill={def.wallColor} />
        <polygon points="22,24 33,19 33,31 22,36" fill={def.wallColor} fillOpacity="0.72" />
        <polygon points="22,9 35,18 22,25 9,18" fill={def.roofColor} />
        <circle cx="22" cy="15" r="2.4" fill={def.accentColor} />
      </>
    )}
  </svg>
);

export const BuildMenuSheet: React.FC<{ snap: GameSnapshot }> = ({ snap }) => {
  const [tab, setTab] = useState<FilterTab>('all');
  const [query, setQuery] = useState('');
  const [expandedTipId, setExpandedTipId] = useState<string | null>(null);

  const viewCenter = GameController.getViewportCenterGrid();
  const [gridStartX, setGridStartX] = useState<number>(() => viewCenter.gx - 5);
  const [gridStartY, setGridStartY] = useState<number>(() => viewCenter.gy - 5);
  const [gridW, setGridW] = useState<number>(11);
  const [gridH, setGridH] = useState<number>(11);
  const [gridSpacing, setGridSpacing] = useState<number>(5);
  const [gridRoadType, setGridRoadType] = useState<RoadType>(RoadType.Dirt);
  const [gridPreviewOn, setGridPreviewOn] = useState<boolean>(false);

  const { state, buildQueueActive, buildQueueCap } = snap;
  const q = query.trim().toLowerCase();
  const queueFull = buildQueueActive >= buildQueueCap;

  const activeConstructing = state.buildings.find((b) => b.status === 'constructing');

  const roadGridQuote = BuildingSystem.previewRoadGrid(
    gridStartX,
    gridStartY,
    gridW,
    gridH,
    gridSpacing,
    gridRoadType,
    state,
    GameController.engine.chunks
  );

  const updateRoadGridPreview = (
    sx: number,
    sy: number,
    w: number,
    h: number,
    spacing: number,
    rt: RoadType,
    enabled: boolean
  ) => {
    if (!enabled) {
      GameController.setRoadGridPreview(null);
      return;
    }
    const p = BuildingSystem.previewRoadGrid(
      sx,
      sy,
      w,
      h,
      spacing,
      rt,
      state,
      GameController.engine.chunks
    );
    GameController.setRoadGridPreview(p.valid ? p.tiles : []);
  };

  const filteredBuildings = BUILDING_LIST.filter((b) => {
    if (q && !b.name.toLowerCase().includes(q) && !b.description.toLowerCase().includes(q)) {
      return false;
    }
    if (tab === 'roads') {
      return b.category === 'transportation' || b.subCategory === 'transit';
    }
    if (tab === 'ready') {
      return BuildingSystem.getGlobalBuildRequirements(b.id, state).readyToPlace;
    }
    if (tab === 'all') return true;
    if (tab === 'residential') return b.category === 'residential' || b.subCategory === 'skyscraper';
    if (tab === 'farming_fishing') {
      return b.category === 'agricultural' || b.subCategory === 'farming' || b.subCategory === 'fishing';
    }
    if (tab === 'markets_trade') {
      return b.category === 'commercial' || b.subCategory === 'market' || b.subCategory === 'trade_port';
    }
    if (tab === 'corporate') return b.subCategory === 'corporate';
    if (tab === 'government') return b.category === 'government';
    if (tab === 'services') return SERVICE_CATS.includes(b.category);
    if (tab === 'energy') return b.category === 'energy' || b.category === 'environmental';
    return b.category === tab;
  });

  const unlockedRoads = BUILDABLE_ROADS.filter(
    (r) => state.level >= r.unlockLevel && (!r.requiredTech || state.unlockedTechIds.includes(r.requiredTech))
  );

  return (
    <SheetContainer
      title="Construct & Infrastructure"
      subtitle={`Coins: ${Math.floor(state.coins).toLocaleString()} · Build Queue: ${buildQueueActive}/${buildQueueCap}`}
    >
      {/* Queue Banner */}
      {queueFull && activeConstructing ? (
        <div className="mb-3 p-3 rounded-xl bg-amber-950/65 border border-amber-600/60 flex items-center justify-between gap-2 text-xs min-w-0">
          <div className="min-w-0">
            <div className="font-bold text-amber-200">
              Construction Queue Full ({buildQueueActive}/{buildQueueCap})
            </div>
            <div className="text-[11px] text-stone-300">
              Wait for active sites to finish or jump to one and tap Rush.
            </div>
          </div>
          <button
            type="button"
            onClick={() => GameController.focusBuilding(activeConstructing.id)}
            className="min-h-[44px] px-3 rounded-xl bg-amber-500 text-stone-950 font-bold shrink-0"
          >
            Jump to Site
          </button>
        </div>
      ) : null}

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ${BUILDING_LIST.length} blueprints (e.g. Plantation, Port, HQ, Skyscraper, Rail)...`}
        className="w-full mb-2.5 px-3 py-2.5 rounded-xl bg-[#07150e] border border-emerald-800/60 text-xs text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-400"
      />

      {/* Interactive Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-3 mb-3 border-b border-emerald-800/45">
        {(
          [
            ['all', 'All'],
            ['ready', 'Ready Now'],
            ['residential', 'Housing'],
            ['farming_fishing', 'Farm & Fish'],
            ['production', 'Craft'],
            ['industrial', 'Industry & Mega'],
            ['markets_trade', 'Markets & Trade'],
            ['corporate', 'Corporate'],
            ['government', 'Gov'],
            ['roads', 'Roads & Transit'],
            ['services', 'Services'],
            ['energy', 'Utility & Eco'],
          ] as Array<[FilterTab, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`min-h-[44px] px-3.5 rounded-xl text-xs whitespace-nowrap shrink-0 transition-all ${
              tab === id
                ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-stone-950 font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_0_#92400e]'
                : 'bg-[#0a1d14] border border-emerald-800/50 text-stone-300 font-medium hover:text-white hover:border-emerald-700/70'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Road Painting & Road Grid Builder */}
      {(tab === 'roads' || tab === 'all') && (
        <div className="mb-4 space-y-3">
          {tab === 'roads' && (
            <div className="p-3.5 rounded-2xl bg-gradient-to-b from-[#13291e] to-[#08150f] border border-emerald-700/60 space-y-2.5 tabular-nums">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                  <Grid className="w-4 h-4 shrink-0" />
                  Road Grid Builder
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const c = GameController.getViewportCenterGrid();
                    const nx = c.gx - Math.floor(gridW / 2);
                    const ny = c.gy - Math.floor(gridH / 2);
                    setGridStartX(nx);
                    setGridStartY(ny);
                    updateRoadGridPreview(nx, ny, gridW, gridH, gridSpacing, gridRoadType, gridPreviewOn);
                  }}
                  className="min-h-[34px] px-2.5 rounded-lg bg-[#0d2433] border border-sky-600/50 text-sky-200 text-[11px] font-semibold"
                >
                  Center on View
                </button>
              </div>

              <div className="grid grid-cols-5 gap-1.5 text-[11px]">
                <label className="text-stone-400">
                  X
                  <input
                    type="number"
                    value={gridStartX}
                    onChange={(e) => {
                      const v = Math.trunc(Number(e.target.value) || 0);
                      setGridStartX(v);
                      updateRoadGridPreview(v, gridStartY, gridW, gridH, gridSpacing, gridRoadType, gridPreviewOn);
                    }}
                    className="mt-0.5 w-full min-h-[38px] px-1.5 rounded-lg bg-[#06120c] border border-emerald-800/70 text-stone-100 font-bold"
                  />
                </label>
                <label className="text-stone-400">
                  Y
                  <input
                    type="number"
                    value={gridStartY}
                    onChange={(e) => {
                      const v = Math.trunc(Number(e.target.value) || 0);
                      setGridStartY(v);
                      updateRoadGridPreview(gridStartX, v, gridW, gridH, gridSpacing, gridRoadType, gridPreviewOn);
                    }}
                    className="mt-0.5 w-full min-h-[38px] px-1.5 rounded-lg bg-[#06120c] border border-emerald-800/70 text-stone-100 font-bold"
                  />
                </label>
                <label className="text-stone-400">
                  W
                  <input
                    type="number"
                    min={3}
                    max={48}
                    value={gridW}
                    onChange={(e) => {
                      const v = Math.max(3, Math.min(48, Math.trunc(Number(e.target.value) || 3)));
                      setGridW(v);
                      updateRoadGridPreview(gridStartX, gridStartY, v, gridH, gridSpacing, gridRoadType, gridPreviewOn);
                    }}
                    className="mt-0.5 w-full min-h-[38px] px-1.5 rounded-lg bg-[#06120c] border border-emerald-800/70 text-stone-100 font-bold"
                  />
                </label>
                <label className="text-stone-400">
                  H
                  <input
                    type="number"
                    min={3}
                    max={48}
                    value={gridH}
                    onChange={(e) => {
                      const v = Math.max(3, Math.min(48, Math.trunc(Number(e.target.value) || 3)));
                      setGridH(v);
                      updateRoadGridPreview(gridStartX, gridStartY, gridW, v, gridSpacing, gridRoadType, gridPreviewOn);
                    }}
                    className="mt-0.5 w-full min-h-[38px] px-1.5 rounded-lg bg-[#06120c] border border-emerald-800/70 text-stone-100 font-bold"
                  />
                </label>
                <label className="text-stone-400">
                  Gap
                  <input
                    type="number"
                    min={2}
                    max={16}
                    value={gridSpacing}
                    onChange={(e) => {
                      const v = Math.max(2, Math.min(16, Math.trunc(Number(e.target.value) || 2)));
                      setGridSpacing(v);
                      updateRoadGridPreview(gridStartX, gridStartY, gridW, gridH, v, gridRoadType, gridPreviewOn);
                    }}
                    className="mt-0.5 w-full min-h-[38px] px-1.5 rounded-lg bg-[#06120c] border border-emerald-800/70 text-stone-100 font-bold"
                  />
                </label>
              </div>

              <select
                value={gridRoadType}
                onChange={(e) => {
                  const rt = Number(e.target.value) as RoadType;
                  setGridRoadType(rt);
                  updateRoadGridPreview(gridStartX, gridStartY, gridW, gridH, gridSpacing, rt, gridPreviewOn);
                }}
                className="w-full min-h-[42px] px-3 rounded-xl bg-[#07150e] border border-emerald-700/70 text-xs font-semibold text-stone-100"
              >
                {unlockedRoads.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.coinCost}C/tile · {r.speedMultiplier}×)
                  </option>
                ))}
              </select>

              <div className="p-2 rounded-xl bg-[#07150e] border border-emerald-900/60 text-[11px] flex items-center justify-between gap-2">
                {roadGridQuote.valid ? (
                  <>
                    <span className="text-stone-300">
                      <strong className="text-emerald-300">{roadGridQuote.tiles.length}</strong> road tiles
                      {roadGridQuote.skippedCount > 0 ? ` (${roadGridQuote.skippedCount} skipped)` : ''}
                    </span>
                    <span className="font-bold text-amber-300 shrink-0">
                      {roadGridQuote.totalCoinCost}C
                    </span>
                  </>
                ) : (
                  <span className="text-amber-300">{roadGridQuote.reason}</span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = !gridPreviewOn;
                    setGridPreviewOn(next);
                    updateRoadGridPreview(gridStartX, gridStartY, gridW, gridH, gridSpacing, gridRoadType, next);
                  }}
                  className={`min-h-[44px] px-3 rounded-xl font-bold text-xs border ${
                    gridPreviewOn
                      ? 'bg-sky-500 border-sky-400 text-stone-950'
                      : 'bg-[#0b1f16] border-sky-700/60 text-sky-200'
                  }`}
                >
                  {gridPreviewOn ? 'Hide Grid Preview' : 'Preview Grid'}
                </button>
                <button
                  type="button"
                  disabled={!roadGridQuote.valid}
                  onClick={() => {
                    const ok = GameController.dispatch({
                      type: 'BUILD_ROAD_GRID',
                      startGx: gridStartX,
                      startGy: gridStartY,
                      width: gridW,
                      height: gridH,
                      spacing: gridSpacing,
                      roadType: gridRoadType,
                    });
                    if (ok) {
                      setGridPreviewOn(false);
                      GameController.setRoadGridPreview(null);
                    }
                  }}
                  className="min-h-[44px] px-3 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 disabled:from-stone-800 disabled:to-stone-800 disabled:text-stone-500 text-stone-950 font-bold text-xs"
                >
                  Build Road Grid
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 min-w-0">
            <div className="text-xs font-bold text-amber-300/90 tracking-wide uppercase truncate">
              Roads, Highways, Bridges &amp; Rail ({BUILDABLE_ROADS.length})
            </div>
            <button
              type="button"
              onClick={() => {
                GameController.setTool({ mode: 'demolish' });
                GameController.setActiveSheet('none');
              }}
              className="min-h-[44px] px-3 rounded-xl bg-red-950/75 border border-red-800/60 text-red-200 hover:text-white text-xs font-bold shrink-0"
            >
              Remove Mode
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {BUILDABLE_ROADS.filter((r) => !q || r.name.toLowerCase().includes(q)).map((road) => {
              const levelOk = state.level >= road.unlockLevel;
              const techOk = !road.requiredTech || state.unlockedTechIds.includes(road.requiredTech);
              const unlocked = levelOk && techOk;
              const missingParts: string[] = [];
              if (state.coins < road.coinCost) {
                missingParts.push(`Need ${road.coinCost - Math.floor(state.coins)}C`);
              }
              for (const [k, rawNeed] of Object.entries(road.materialCost)) {
                const need = rawNeed ?? 0;
                const rid = k as ResourceId;
                const have = Math.floor(state.resources[rid] ?? 0);
                if (have < need) {
                  missingParts.push(`Need ${need - have} ${RESOURCES[rid]?.name ?? rid} (${have}/${need})`);
                }
              }
              const affordable = missingParts.length === 0;

              return (
                <button
                  key={road.id}
                  type="button"
                  disabled={!unlocked}
                  onClick={() => {
                    GameController.setTool({ mode: 'road', roadType: road.id });
                    GameController.setActiveSheet('none');
                  }}
                  className={`w-full min-w-0 text-left p-3 rounded-2xl border transition-all flex items-center justify-between gap-2.5 min-h-[66px] ${
                    unlocked
                      ? 'bg-gradient-to-b from-[#132b1f] to-[#0b1c13] border-emerald-700/55 hover:border-amber-400/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]'
                      : 'bg-[#0b1611]/70 border-stone-800/80 opacity-65'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-8 h-8 rounded-xl shrink-0 border border-white/20 shadow-inner"
                      style={{ backgroundColor: road.color }}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-stone-100 truncate">{road.name}</div>
                      <div className="text-[11px] text-stone-300/85 mt-0.5 tabular-nums truncate">
                        {unlocked
                          ? `${road.coinCost}C${Object.entries(road.materialCost)
                              .map(([k, v]) => ` · ${v} ${RESOURCES[k as ResourceId]?.name ?? k}`)
                              .join('')} · ${road.speedMultiplier}×`
                          : `Requires Lv.${road.unlockLevel}${
                              road.requiredTech ? ` · ${TECH_MAP[road.requiredTech]?.name}` : ''
                            }`}
                      </div>
                      {road.id === RoadType.ThreeLane ? (
                        <div className="text-[10px] font-medium text-sky-300/90 mt-0.5 truncate">
                          3-Lane urban road with separated sidewalks
                        </div>
                      ) : null}
                      {unlocked && !affordable ? (
                        <div className="text-[10px] font-semibold text-red-300 mt-0.5 truncate">
                          {missingParts.join(' · ')}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <span
                    className={`text-xs font-bold shrink-0 ${
                      !unlocked
                        ? 'text-stone-500'
                        : affordable
                          ? 'text-emerald-300'
                          : 'text-amber-300'
                    }`}
                  >
                    {unlocked ? (affordable ? 'Paint →' : 'Select →') : 'Locked'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Building Blueprint Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filteredBuildings.length === 0 && tab !== 'roads' ? (
          <div className="col-span-full p-4 rounded-2xl bg-[#0a1c13] border border-emerald-800/50 text-xs text-stone-300 text-center">
            No blueprints match your current filter. Try switching to All or clearing the search box.
          </div>
        ) : null}

        {filteredBuildings.map((b) => {
          const blueprintLvl = clampBuildingLevel(b, state.unlockedBuildingLevels?.[b.id] ?? 1);
          const maxLevel = getEffectiveMaxLevel(b);
          const req = BuildingSystem.getGlobalBuildRequirements(b.id, state, blueprintLvl);
          const bpStats = getBuildingStatsAtLevel(b, blueprintLvl);
          const bpSummary = getDynamicBuildingSummary(b, blueprintLvl);
          const showTip = expandedTipId === b.id;
          const largeFactory = isLargeFactory(b);
          const rotatable = b.width !== b.height && b.footprintRotatable !== false;

          const outputLines = b.isAutomatedTreePlantation
            ? [
                {
                  name: RESOURCES.wood.name,
                  lvCur: TreePlantationSystem.getTheoreticalHourlyWood(blueprintLvl),
                  lvMax: TreePlantationSystem.getTheoreticalHourlyWood(maxLevel),
                  curLabel: `Lv.${blueprintLvl}`,
                  maxLevelLabel: `Lv.${maxLevel}`,
                },
              ]
            : b.recipe
              ? Object.entries(b.recipe.outputs)
                  .filter(([, amt]) => (amt ?? 0) > 0)
                  .map(([k, amt]) => {
                    const rid = k as ResourceId;
                    const lvCur = getRecipeHourlyAmount(
                      amt ?? 0,
                      b.recipe!.cycleSeconds,
                      getBuildingLevelMultiplier(blueprintLvl, b)
                    );
                    const lvMax =
                      maxLevel > blueprintLvl
                        ? getRecipeHourlyAmount(
                            amt ?? 0,
                            b.recipe!.cycleSeconds,
                            getBuildingLevelMultiplier(maxLevel, b)
                          )
                        : null;
                    return {
                      name: RESOURCES[rid]?.name ?? rid,
                      lvCur,
                      lvMax,
                      curLabel: `Lv.${blueprintLvl}`,
                      maxLevelLabel: `Lv.${maxLevel}`,
                    };
                  })
              : [];

          const missingItems = req.missingMaterials.map((m) => ({
            resourceId: m.resourceId,
            amount: m.missing,
          }));
          const buyQuote =
            req.unlocked && missingItems.length > 0
              ? EconomySystem.quoteMissingMaterialsCost(state, missingItems, true)
              : null;

          return (
            <div
              key={b.id}
              className={`p-3.5 rounded-2xl border flex flex-col justify-between gap-2.5 min-w-0 transition-all ${
                req.readyToPlace
                  ? 'bg-gradient-to-b from-[#143022] to-[#0b1d14] border-emerald-600/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                  : req.unlocked
                    ? 'bg-gradient-to-b from-[#17261f] to-[#0b1611] border-amber-700/45'
                    : 'bg-[#0b1611]/75 border-stone-800/80 opacity-80'
              }`}
            >
              {/* Header */}
              <div className="flex items-start gap-2.5 min-w-0">
                <BuildingMiniPreview def={b} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1.5 min-w-0">
                    <span className="text-sm font-bold text-stone-100 truncate">{b.name}</span>
                    <span className="text-[11px] font-semibold text-stone-300 tabular-nums shrink-0">
                      Lv.{blueprintLvl}/{maxLevel} · {b.width}×{b.height}
                      {rotatable ? ' ↻' : ''}
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-200/90 font-medium line-clamp-2 mt-0.5 leading-snug tabular-nums">
                    {bpSummary.headline}
                  </p>
                  {b.corporateSector ? (
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-cyan-300 mt-1">
                      <Building2 className="w-3 h-3 shrink-0" />
                      <span>
                        {b.corporateSector} · Lv.{blueprintLvl} {getCorporateLevelTitle(blueprintLvl)} → Lv.{maxLevel}
                      </span>
                    </div>
                  ) : b.isAutomatedTreePlantation ? (
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-lime-300 mt-1">
                      <Trees className="w-3 h-3 shrink-0" />
                      <span>
                        10×20 Main Hall + {PLANTATION_TOTAL_SLOTS}-Plot Plantation · {PLANTATION_LEVELS[0].maxTrees}–
                        {PLANTATION_LEVELS[PLANTATION_LEVELS.length - 1].maxTrees} Trees · Lv.1→Lv.{maxLevel}
                      </span>
                    </div>
                  ) : largeFactory ? (
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-300 mt-1">
                      <Factory className="w-3 h-3 shrink-0" />
                      <span>
                        Mega Factory ({b.width}×{b.height}) · Lv.1→Lv.{maxLevel}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Clear Diagnostic Status */}
              {req.readyToPlace ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-950/75 border border-emerald-600/45 text-[11px] font-semibold text-emerald-300 min-w-0">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    Ready to Place
                    {req.requiredDepositName ? ` · On ${req.requiredDepositName}` : ''}
                    {req.requiresCoast ? ' · Bordering Water' : ''}
                  </span>
                </div>
              ) : !req.unlocked ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-stone-900/90 border border-stone-700/60 text-[11px] font-semibold text-stone-300 min-w-0">
                  <Lock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                  <span className="truncate">
                    {!req.levelOk
                      ? `Unlocks at City Level ${b.unlockLevel} (Currently Lv.${state.level})`
                      : `Research "${req.missingTechName}" in Tech first`}
                  </span>
                </div>
              ) : (
                <div className="flex items-start gap-1.5 px-2.5 py-1.5 rounded-xl bg-red-950/60 border border-red-700/50 text-[11px] font-semibold text-red-200 leading-snug min-w-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
                  <span>{req.summaryReason}</span>
                </div>
              )}

              {/* Per-Hour Capacity & Cost Readout */}
              {outputLines.length > 0 ? (
                <div className="text-[11px] text-emerald-200/95 bg-[#07150e] border border-emerald-900/60 rounded-xl px-2.5 py-1.5 tabular-nums">
                  {outputLines.map((o) => (
                    <div key={o.name} className="flex items-center justify-between gap-2">
                      <span className="truncate">{o.name} Output:</span>
                      <span className="font-bold text-amber-300 shrink-0">
                        {formatInGameHourlyRate(o.lvCur)} {o.curLabel}
                        {o.lvMax !== null ? ` → ${formatInGameHourlyRate(o.lvMax)} ${o.maxLevelLabel}` : ''}
                      </span>
                    </div>
                  ))}
                  {b.isAutomatedTreePlantation ? (
                    <div className="flex items-center justify-between gap-2 text-[10px] text-lime-300/90 mt-0.5">
                      <span>Plantation Capacity:</span>
                      <span className="font-semibold">
                        {PLANTATION_LEVELS[0].maxTrees} → {PLANTATION_LEVELS[PLANTATION_LEVELS.length - 1].maxTrees} Trees
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {/* Material & Coin Requirements */}
              <div className="text-[11px] tabular-nums space-y-0.5 px-1">
                <div className={req.missingCoins === 0 ? 'text-amber-300 font-semibold' : 'text-red-300 font-semibold'}>
                  Coins: {req.coinsHave.toLocaleString()}/{req.coinsNeed}
                  {req.missingCoins > 0 ? ` (-${req.missingCoins})` : ''}
                </div>
                {req.materials.length > 0 ? (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {req.materials.map((m) => (
                      <span
                        key={m.resourceId}
                        className={m.missing === 0 ? 'text-emerald-300 font-medium' : 'text-red-300 font-semibold'}
                      >
                        {m.name}: {m.have}/{m.need}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Placement Conditions, Logistics & Utilities */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-stone-300/90 tabular-nums px-1">
                <span>
                  {bpStats.maxWorkers > 0
                    ? `${bpStats.minWorkers}-${bpStats.maxWorkers} ${b.workerClass}s`
                    : 'Automated'}
                </span>
                {b.truckCapacity ? (
                  <span className="inline-flex items-center gap-0.5 text-lime-300">
                    <Truck className="w-3 h-3" />
                    {b.truckCapacity} Trucks
                  </span>
                ) : null}
                {bpStats.granaryBonus > 0 ? (
                  <span className="text-amber-300">+{bpStats.granaryBonus} Crop Cap</span>
                ) : null}
                {bpStats.warehouseBonus + bpStats.storageCapacityBonus > 0 ? (
                  <span className="text-sky-300">
                    +{bpStats.warehouseBonus + bpStats.storageCapacityBonus} Mat Cap
                  </span>
                ) : null}
                {bpStats.housingCapacity > 0 ? (
                  <span className="text-sky-300">{bpStats.housingCapacity} Homes</span>
                ) : null}
                {bpStats.powerOutput > 0 ? (
                  <span className="text-amber-300">+{bpStats.powerOutput} MW Gen</span>
                ) : null}
                {bpStats.waterOutput > 0 ? (
                  <span className="text-sky-300">+{bpStats.waterOutput} Water</span>
                ) : null}
                {b.exportsSurplus ? <span className="text-cyan-300">Auto-Export FX</span> : null}
                {b.importsUnavailable ? <span className="text-sky-300">Auto-Import</span> : null}
                {b.requiresRoad ? <span>Needs {req.minRoadTierName ?? 'Road'}</span> : null}
                {bpStats.powerDemand > 0 ? (
                  <span className="inline-flex items-center gap-0.5 text-amber-200">
                    <Zap className="w-3 h-3" />
                    {bpStats.powerDemand} MW
                  </span>
                ) : null}
                {bpStats.waterDemand > 0 ? (
                  <span className="inline-flex items-center gap-0.5 text-sky-300">
                    <Droplets className="w-3 h-3" />
                    {bpStats.waterDemand} Water
                  </span>
                ) : null}
              </div>

              {/* Where to get missing items */}
              {req.unlocked && (req.missingMaterials.length > 0 || showTip) ? (
                <div className="text-[11px] text-stone-300 bg-[#07150e]/90 border border-emerald-900/60 rounded-xl px-2.5 py-2 space-y-1">
                  {req.missingMaterials.length > 0 ? (
                    req.missingMaterials.map((m) => (
                      <div key={m.resourceId}>
                        <strong className="text-amber-300">{m.name}:</strong>{' '}
                        {m.producers.length > 0
                          ? m.producers.slice(0, 3).join(' · ')
                          : 'Available via Trading Post Market'}
                      </div>
                    ))
                  ) : (
                    <div>
                      <strong className="text-emerald-300">Placement Tip:</strong> Clear trees/boulders on a{' '}
                      {b.width}×{b.height} plot
                      {rotatable ? ' (tap Rotate while placing)' : ''}
                      {b.requiresRoad ? `, beside a ${req.minRoadTierName ?? 'Road'}` : ''}.
                    </div>
                  )}
                </div>
              ) : null}

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-emerald-800/40">
                {req.unlocked ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        GameController.setTool({
                          mode: 'build',
                          defId: b.id,
                          rotation: 0,
                          targetLevel: blueprintLvl,
                        });
                        GameController.setActiveSheet('none');
                      }}
                      className={`flex-1 min-h-[44px] px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 ${
                        req.readyToPlace
                          ? 'bg-gradient-to-b from-amber-400 to-amber-500 text-stone-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_2px_0_#92400e]'
                          : 'bg-[#10291d] border border-emerald-600/60 text-stone-100 hover:bg-[#173929]'
                      }`}
                    >
                      <Hammer className="w-3.5 h-3.5" />
                      {req.readyToPlace ? 'Place on Map' : 'Preview Ghost'}
                    </button>

                    {buyQuote && buyQuote.totalCost > 0 ? (
                      <button
                        type="button"
                        disabled={!buyQuote.canPurchase}
                        onClick={() =>
                          GameController.dispatch({
                            type: 'BUY_MISSING_FOR_BUILDING',
                            defId: b.id,
                            allowEmergency: true,
                          })
                        }
                        title={
                          buyQuote.usesCourierFee
                            ? 'Emergency courier delivery (+45% fee when no Trading Post)'
                            : 'Buy exact missing materials at market rate'
                        }
                        className="min-h-[44px] px-3 rounded-xl bg-sky-700 hover:bg-sky-600 disabled:bg-stone-800 disabled:text-stone-500 text-white font-bold text-xs flex items-center gap-1 tabular-nums"
                      >
                        <Coins className="w-3.5 h-3.5" />
                        Buy Missing ({buyQuote.totalCost}C)
                      </button>
                    ) : null}

                    {b.requiredDeposit ? (
                      <button
                        type="button"
                        onClick={() => GameController.locateTarget({ depositType: b.requiredDeposit })}
                        className="min-h-[44px] px-2.5 rounded-xl bg-[#0a1d14] border border-sky-700/60 text-sky-200 text-xs font-semibold flex items-center gap-1"
                      >
                        <Mountain className="w-3.5 h-3.5" />
                        Locate
                      </button>
                    ) : b.requiresCoast ? (
                      <button
                        type="button"
                        onClick={() => GameController.locateTarget({ coast: true })}
                        className="min-h-[44px] px-2.5 rounded-xl bg-[#0a1d14] border border-sky-700/60 text-sky-200 text-xs font-semibold flex items-center gap-1"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        Water
                      </button>
                    ) : req.missingMaterials.length === 0 ? (
                      <button
                        type="button"
                        aria-label="Placement help"
                        onClick={() => setExpandedTipId(showTip ? null : b.id)}
                        className="min-w-[44px] min-h-[44px] rounded-xl bg-[#0a1d14] border border-emerald-800/60 text-stone-300 flex items-center justify-center"
                      >
                        <HelpCircle className="w-4 h-4" />
                      </button>
                    ) : null}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      GameController.setActiveSheet(!req.techOk && req.levelOk ? 'tech' : 'quests')
                    }
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#0e2017] border border-stone-700/70 text-stone-200 text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    {!req.techOk && req.levelOk ? 'Open Tech Tree to Research' : 'View Missions to Earn XP'}
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
