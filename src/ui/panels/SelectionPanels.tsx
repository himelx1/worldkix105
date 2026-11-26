import React, { useEffect, useState } from 'react';
import {
  X,
  ArrowUpCircle,
  Trash2,
  Pause,
  Play,
  Axe,
  Sprout,
  Unlock,
  Compass,
  Move,
  Copy,
  Waves,
  Trees,
  Building2,
  GitBranch,
  Truck,
} from 'lucide-react';
import { formatInGameHourlyRate } from '../../core/Formatters';
import { BiomeId, RoadDirection, UtilityFlag, ZONE_META, ZoneType } from '../../core/GameState';
import { BUILDINGS, getBuildingFootprint, getCorporateLevelTitle } from '../../data/buildings.data';
import { RESOURCES, ResourceId } from '../../data/resources.data';
import { getRoadProperties, ROAD_UPGRADE_TIERS, ROADS, RoadType } from '../../data/roads.data';
import {
  DEPOSIT_NAMES,
  DepositType,
  FeatureType,
  isMatureTreeFeature,
  isTreeFeature,
  TREE_SPECIES,
} from '../../data/trees.data';
import {
  BuildingCostCalculator,
  buildUpgradeDeltas,
  getBuildingSimSnapshot,
  getDynamicBuildingSummary,
  getEffectiveMaxLevel,
} from '../../systems/BuildingSimulation';
import { BuildingSystem } from '../../systems/BuildingSystem';
import { DistrictServiceSystem } from '../../systems/DistrictServiceSystem';
import { ProductionSystem } from '../../systems/ProductionSystem';
import { TreeGrowthSystem } from '../../systems/TreeGrowthSystem';
import { PLANTATION_TOTAL_SLOTS, TreePlantationSystem } from '../../systems/TreePlantationSystem';
import { GameController, GameSnapshot } from '../bridge/GameController';

export const SelectionPanels: React.FC<{ snap: GameSnapshot }> = ({ snap }) => {
  const [confirmDemolish, setConfirmDemolish] = useState(false);
  const [pendingTerraform, setPendingTerraform] = useState<'to_water' | 'to_land' | null>(null);
  const [showNetworkUpgrade, setShowNetworkUpgrade] = useState(false);
  const [networkTargetRoad, setNetworkTargetRoad] = useState<RoadType>(RoadType.Paved);
  const [networkPreviewActive, setNetworkPreviewActive] = useState(false);

  useEffect(() => {
    setShowNetworkUpgrade(false);
    setNetworkPreviewActive(false);
    GameController.setRoadUpgradePreview(null);
  }, [snap.selectedTile?.gx, snap.selectedTile?.gy, snap.selectedBuildingId]);

  if (snap.selectedBuildingId !== null) {
    const b = snap.state.buildings.find((item) => item.id === snap.selectedBuildingId);
    if (!b) return null;
    const def = BUILDINGS[b.defId];
    if (!def) return null;

    const fp = getBuildingFootprint(def, b.rotation ?? 0);
    const maxLevel = getEffectiveMaxLevel(def);
    const canUpgrade = b.status !== 'constructing' && b.level < maxLevel;
    const preview = BuildingSystem.getBuildingUpgradePreview(b, snap.state);
    const simSnap = getBuildingSimSnapshot(b, snap.state, (rid) =>
      BuildingSystem.getResourceProducers(rid)
    );
    const dynSummary = getDynamicBuildingSummary(def, b.level, b, snap.state);
    const copyCost = BuildingCostCalculator.getCopyCost(def, b.level);
    const adj = ProductionSystem.getBuildingAdjacencyBonus(
      b,
      snap.state,
      GameController.engine.chunks
    );
    const copyUnlocked =
      snap.state.level >= def.unlockLevel &&
      (!def.requiredTech || snap.state.unlockedTechIds.includes(def.requiredTech));

    const upgradeDeltas = preview?.next ? buildUpgradeDeltas(preview.cur, preview.next) : [];
    const upgradeDiffs: string[] = upgradeDeltas.map((d) => `${d.label}: ${d.current} → ${d.next}`);
    if (def.isAutomatedTreePlantation && canUpgrade) {
      const curCfg = TreePlantationSystem.getLevelConfig(b.level);
      const nextCfg = TreePlantationSystem.getLevelConfig(b.level + 1);
      upgradeDiffs.push(`Cycle: ${curCfg.growSeconds}s → ${nextCfg.growSeconds}s`);
      upgradeDiffs.push(
        `Wood/Tree: ${(curCfg.woodPerTree * curCfg.efficiency).toFixed(1)} → ${(nextCfg.woodPerTree * nextCfg.efficiency).toFixed(1)}`
      );
    }

    return (
      <div className="pointer-events-auto fixed bottom-24 inset-x-0 z-30 flex justify-center px-3">
        <div className="w-full max-w-md min-w-0 max-h-[68vh] overflow-y-auto bg-gradient-to-b from-[#142c20]/98 to-[#091610]/98 backdrop-blur-md border border-emerald-700/60 rounded-2xl p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_16px_40px_rgba(0,0,0,0.6)] space-y-2.5">
          <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <div className="text-sm font-bold text-stone-100 tabular-nums truncate">
                {def.name} · Lv.{b.level}/{maxLevel} ({fp.width}×{fp.height})
              </div>
              <div className="text-xs text-stone-300/85 mt-0.5 tabular-nums">
                ID #{b.id} · Status:{' '}
                <span className="text-amber-300 font-semibold capitalize">
                  {b.status.replace(/_/g, ' ')}
                </span>
                {b.status === 'constructing' ? ` (${Math.round(b.buildProgress * 100)}%)` : ''}
                {` · (${b.gx}, ${b.gy})`}
              </div>
              {def.corporateSector ? (
                <div className="flex items-center gap-1 text-[11px] font-bold text-cyan-300 mt-0.5">
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    {def.corporateSector} · {getCorporateLevelTitle(b.level)}
                  </span>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setConfirmDemolish(false);
                GameController.clearSelection();
              }}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-[#0a1a12] border border-emerald-800/60 text-stone-300 hover:text-white shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="text-xs text-emerald-200/95 bg-[#081710] border border-emerald-800/55 rounded-xl px-3 py-2 space-y-1.5 tabular-nums">
            <div className="font-semibold text-stone-100 leading-snug">{dynSummary.headline}</div>
            {dynSummary.metrics.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[10px]">
                {dynSummary.metrics.map((m) => (
                  <div
                    key={m.label}
                    className="px-2 py-1.5 rounded-lg bg-[#05100b] border border-emerald-900/50 min-w-0"
                  >
                    <div className="text-stone-400 truncate">{m.label}</div>
                    <div
                      className={`font-bold truncate ${
                        m.accent === 'amber'
                          ? 'text-amber-300'
                          : m.accent === 'sky'
                            ? 'text-sky-300'
                            : m.accent === 'rose'
                              ? 'text-rose-300'
                              : m.accent === 'emerald'
                                ? 'text-emerald-300'
                                : 'text-stone-200'
                      }`}
                    >
                      {m.value}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            {simSnap && simSnap.storageType !== 'none' ? (
              <div className="text-[11px] text-amber-200 font-medium pt-0.5">
                {simSnap.storageType === 'crop' ? 'Crop Inventory Stored:' : 'Material Inventory Stored:'}{' '}
                <strong>{simSnap.relevantStoredTotal.toLocaleString()}</strong> /{' '}
                {simSnap.relevantStoredCapacity.toLocaleString()} units
              </div>
            ) : null}
          </div>

          <p className="text-[11px] text-stone-400 leading-relaxed">{def.description}</p>

          {/* Automated Tree Plantation Factory Live Telemetry */}
          {def.isAutomatedTreePlantation ? (() => {
            const cfg = TreePlantationSystem.getLevelConfig(b.level);
            const geom = TreePlantationSystem.getGeometry(b.rotation === 1 ? 1 : 0);
            const ps = snap.state.treePlantations?.[b.id];
            const activeTrees = ps?.activeTrees ?? 0;
            const saplingCount = ps?.saplingCount ?? 0;
            const youngCount = ps?.youngCount ?? 0;
            const matureCount = ps?.matureCount ?? 0;
            const plantedTotal = ps?.plantedTotal ?? 0;
            const harvestedTotal = ps?.harvestedTotal ?? 0;
            return (
              <div className="p-3 rounded-xl bg-[#091c12] border border-lime-600/50 space-y-2 text-xs tabular-nums">
                <div className="flex items-center justify-between font-bold text-lime-300">
                  <span className="flex items-center gap-1.5">
                    <Trees className="w-4 h-4 shrink-0" /> Plantation Yard ({geom.totalWidth}×{geom.totalHeight})
                  </span>
                  <span>
                    {activeTrees}/{cfg.maxTrees} Trees
                  </span>
                </div>
                <div className="text-[11px] text-stone-300">
                  Main Factory: <strong className="text-stone-100">{geom.mainWidth}×{geom.mainHeight}</strong> ·
                  Plantation Plots: <strong className="text-emerald-300">{PLANTATION_TOTAL_SLOTS}</strong> · {cfg.label}
                </div>
                <div className="grid grid-cols-3 gap-1.5 text-[11px]">
                  <div className="p-2 rounded-lg bg-[#06120c] border border-emerald-900/50">
                    <div className="text-stone-400">Saplings</div>
                    <strong className="text-lime-200">{saplingCount}</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-[#06120c] border border-emerald-900/50">
                    <div className="text-stone-400">Growing</div>
                    <strong className="text-emerald-300">{youngCount}</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-[#06120c] border border-emerald-900/50">
                    <div className="text-stone-400">Mature</div>
                    <strong className="text-amber-300">{matureCount}</strong>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                  <div className="p-2 rounded-lg bg-[#06120c] border border-emerald-900/50">
                    <span className="text-stone-400">Planted Total:</span>{' '}
                    <strong className="text-stone-100">{plantedTotal}</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-[#06120c] border border-emerald-900/50">
                    <span className="text-stone-400">Harvested Total:</span>{' '}
                    <strong className="text-lime-300">{harvestedTotal}</strong>
                  </div>
                  <div className="p-2 rounded-lg bg-[#06120c] border border-emerald-900/50">
                    <span className="text-stone-400">Yield / Tree:</span>{' '}
                    <strong className="text-amber-300">
                      {(cfg.woodPerTree * cfg.efficiency).toFixed(1)} Wood
                    </strong>
                  </div>
                  <div className="p-2 rounded-lg bg-[#06120c] border border-emerald-900/50">
                    <span className="text-stone-400">Grow Time:</span>{' '}
                    <strong className="text-sky-300">{cfg.growSeconds}s</strong>
                  </div>
                </div>
              </div>
            );
          })() : null}

          {def.truckCapacity ||
          simSnap?.stats.granaryBonus ||
          simSnap?.stats.warehouseBonus ||
          simSnap?.stats.storageCapacityBonus ||
          def.exportsSurplus ||
          def.importsUnavailable ? (
            <div className="flex flex-wrap gap-2 text-[11px] text-cyan-200 bg-[#071820] border border-cyan-800/50 rounded-xl px-3 py-1.5 tabular-nums">
              {def.truckCapacity ? (
                <span className="inline-flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5 text-lime-300" /> Fleet: {def.truckCapacity} Trucks
                </span>
              ) : null}
              {simSnap?.stats.granaryBonus ? (
                <span>Crop Storage: +{simSnap.stats.granaryBonus}/crop</span>
              ) : null}
              {(simSnap?.stats.warehouseBonus ?? 0) + (simSnap?.stats.storageCapacityBonus ?? 0) > 0 ? (
                <span>
                  Material Storage: +
                  {(simSnap?.stats.warehouseBonus ?? 0) + (simSnap?.stats.storageCapacityBonus ?? 0)}/item
                </span>
              ) : null}
              {def.exportsSurplus ? <span>Auto-Exports Surplus for FX</span> : null}
              {def.importsUnavailable ? <span>Auto-Imports Scarce Inputs</span> : null}
            </div>
          ) : null}

          {adj.labels.length > 0 ? (
            <div className="text-[11px] font-medium text-emerald-300 bg-emerald-950/60 border border-emerald-700/50 rounded-xl px-3 py-2 tabular-nums">
              Adjacency Bonus: {adj.labels.join(' · ')}
            </div>
          ) : null}

          {(def.recipe || def.isAutomatedTreePlantation) && (
            <div className="text-[11px] text-stone-200 bg-[#08150f] border border-emerald-800/60 rounded-xl px-3 py-2 tabular-nums space-y-1.5">
              {def.recipe ? (
                <div>
                  Cycle ({def.recipe.cycleSeconds}s):{' '}
                  {Object.keys(def.recipe.inputs).length > 0
                    ? Object.entries(def.recipe.inputs)
                        .map(([k, v]) => `${v} ${RESOURCES[k as ResourceId]?.name ?? k}`)
                        .join(' + ')
                    : 'Natural Harvest'}{' '}
                  →{' '}
                  {Object.keys(def.recipe.outputs).length > 0
                    ? Object.entries(def.recipe.outputs)
                        .map(([k, v]) => `${v} ${RESOURCES[k as ResourceId]?.name ?? k}`)
                        .join(' + ')
                    : 'Power Output'}
                </div>
              ) : null}
              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                <div className="p-1.5 rounded-lg bg-[#05100b] border border-emerald-900/50">
                  <div className="text-stone-400">Capacity/hr</div>
                  <div className="font-bold text-stone-100">
                    {formatInGameHourlyRate(b.theoreticalHourlyRate ?? preview?.cur.totalHourlyOutput ?? 0)}
                  </div>
                </div>
                <div className="p-1.5 rounded-lg bg-[#05100b] border border-emerald-900/50">
                  <div className="text-stone-400">Actual/hr</div>
                  <div className={`font-bold ${(b.actualHourlyRate ?? 0) > 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                    {formatInGameHourlyRate(b.actualHourlyRate ?? 0)}
                  </div>
                </div>
                <div className="p-1.5 rounded-lg bg-[#05100b] border border-emerald-900/50">
                  <div className="text-stone-400">Produced</div>
                  <div className="font-bold text-amber-300">{Math.round(b.realizedOutputTotal ?? 0)}</div>
                </div>
              </div>
              {def.recipe && Object.keys(def.recipe.inputs).length > 0 ? (
                <div className="flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px]">
                  {Object.entries(def.recipe.inputs).map(([k, needRaw]) => {
                    const need = needRaw ?? 0;
                    const have = Math.floor(snap.state.resources[k as ResourceId] ?? 0);
                    return (
                      <span key={k} className={have >= need ? 'text-emerald-300' : 'text-red-300 font-semibold'}>
                        {RESOURCES[k as ResourceId]?.name ?? k}: {have}/{need}
                      </span>
                    );
                  })}
                </div>
              ) : null}
              {b.productionBottleneck ? (
                <div className={`text-[10px] font-medium ${b.status === 'active' ? 'text-emerald-300' : 'text-amber-300'}`}>
                  Status: {b.productionBottleneck}
                </div>
              ) : null}
            </div>
          )}

          {/* Upgrade Preview Box */}
          {canUpgrade && preview?.next ? (
            <div className="p-2.5 rounded-xl bg-[#0c2117] border border-amber-600/45 text-[11px] space-y-1 tabular-nums">
              <div className="flex items-center justify-between gap-2 font-bold text-amber-300">
                <span>
                  Upgrade to Lv.{b.level + 1}
                  {def.corporateSector ? ` (${getCorporateLevelTitle(b.level + 1)})` : ''}
                </span>
                <span>{preview.cost.coinCost}C</span>
              </div>
              {upgradeDiffs.length > 0 ? (
                <div className="text-emerald-300 font-medium">{upgradeDiffs.join(' · ')}</div>
              ) : null}
              {preview.cost.materials.length > 0 ? (
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-stone-300">
                  {preview.cost.materials.map((m) => (
                    <span
                      key={m.resourceId}
                      className={m.missing > 0 ? 'text-red-300 font-semibold' : 'text-stone-200'}
                    >
                      {m.name}: {m.have}/{m.need}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {def.powerDemand || def.waterDemand || def.requiresRoad || b.connectedRoadCluster > 0 ? (
            <div className="flex flex-wrap gap-3 text-[11px] tabular-nums px-1">
              {def.powerDemand ? (
                <span className={b.powerConnected && (b.powerSatisfaction ?? 0) > 0 ? 'text-amber-200 font-medium' : 'text-red-300 font-semibold'}>
                  Power: {b.powerConnected ? `${Math.round((b.powerSatisfaction ?? 0) * 100)}%` : 'Off-Grid'}
                  {b.powerReason && b.powerReason !== 'ok' ? ` (${b.powerReason.replace(/_/g, ' ')})` : ''}
                </span>
              ) : null}
              {def.waterDemand ? (
                <span className={b.waterConnected && (b.waterSatisfaction ?? 0) > 0 ? 'text-sky-200 font-medium' : 'text-red-300 font-semibold'}>
                  Water: {b.waterConnected ? `${Math.round((b.waterSatisfaction ?? 0) * 100)}%` : 'Off-Grid'}
                  {b.waterReason && b.waterReason !== 'ok' ? ` (${b.waterReason.replace(/_/g, ' ')})` : ''}
                </span>
              ) : null}
              {(() => {
                const roadNet = GameController.engine.roadNet;
                const access = roadNet.getCachedRoadAccess(b, GameController.engine.chunks);
                const clusterInfo =
                  access.connectedCluster > 0 ? roadNet.getClusterInfo(access.connectedCluster) : undefined;
                const needsHeavy =
                  def.category === 'industrial' ||
                  def.category === 'production' ||
                  def.category === 'storage' ||
                  def.subCategory === 'trade_port' ||
                  (def.truckCapacity ?? 0) > 0;
                const congestionPct = Math.round((1 - (b.congestionFactor ?? 1)) * 100);
                if (access.connectedCluster > 0) {
                  return (
                    <>
                      <span className={clusterInfo?.isDisconnected ? 'text-amber-300 font-semibold' : 'text-emerald-300 font-medium'}>
                        Road: {clusterInfo?.isDisconnected ? `Isolated Net #${access.connectedCluster}` : `Net #${access.connectedCluster}`}
                        {congestionPct > 5 ? ` · ${congestionPct}% Traffic` : ''}
                      </span>
                      {needsHeavy && access.restrictedForHeavyTrucks ? (
                        <span className="text-amber-300 font-semibold">Narrow Road — Heavy Trucks Restricted</span>
                      ) : null}
                    </>
                  );
                }
                if (def.requiresRoad) {
                  return <span className="text-red-300 font-semibold">{b.roadReason || 'Road: No Road Access'}</span>;
                }
                return null;
              })()}
              {(() => {
                const cov = DistrictServiceSystem.getBuildingCoverage(b, snap.state);
                const covered =
                  cov.hasCivicHqOrSub ||
                  cov.hasTaxCoverage ||
                  cov.hasEducationCoverage ||
                  cov.hasWorkerCoverage ||
                  cov.hasGovCoverage;
                return covered ? <span className="text-emerald-300 font-medium">District Covered</span> : null;
              })()}
            </div>
          ) : null}

          {def.maxWorkers > 0 ? (
            (() => {
              const effMax = GameController.engine.workforce.getEffectiveMaxWorkers(b);
              return (
                <div className="flex items-center justify-between text-xs bg-[#08150f] border border-emerald-800/60 rounded-xl px-3 py-2 tabular-nums">
                  <span className="text-stone-200 font-medium">
                    Workers: {b.assignedWorkers}/{effMax}
                    {b.lockedWorkers !== null ? ' · Pinned' : ' · Auto'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        GameController.dispatch({
                          type: 'SET_BUILDING_WORKERS',
                          buildingId: b.id,
                          lockedWorkers: Math.max(0, (b.lockedWorkers ?? b.assignedWorkers) - 1),
                        })
                      }
                      className="w-10 h-10 rounded-lg bg-[#142c20] border border-emerald-800/60 text-stone-100 font-bold"
                    >
                      -
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        GameController.dispatch({
                          type: 'SET_BUILDING_WORKERS',
                          buildingId: b.id,
                          lockedWorkers: Math.min(effMax, (b.lockedWorkers ?? b.assignedWorkers) + 1),
                        })
                      }
                      className="w-10 h-10 rounded-lg bg-[#142c20] border border-emerald-800/60 text-stone-100 font-bold"
                    >
                      +
                    </button>
                    {b.lockedWorkers !== null ? (
                      <button
                        type="button"
                        onClick={() =>
                          GameController.dispatch({
                            type: 'SET_BUILDING_WORKERS',
                            buildingId: b.id,
                            lockedWorkers: null,
                          })
                        }
                        className="h-10 px-2.5 rounded-lg bg-emerald-700 text-white text-[11px] font-semibold"
                      >
                        Auto
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })()
          ) : null}

          <div className="space-y-2 pt-0.5">
            <div className="flex items-center gap-2">
              {canUpgrade && preview ? (
                <button
                  type="button"
                  disabled={!preview.cost.canAfford}
                  onClick={() => GameController.dispatch({ type: 'UPGRADE_BUILDING', buildingId: b.id })}
                  className="flex-1 min-h-[44px] px-3 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 disabled:from-stone-700 disabled:to-stone-800 disabled:text-stone-400 text-stone-950 font-bold text-xs flex items-center justify-center gap-1.5 tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_3px_0_#92400e] disabled:shadow-none active:translate-y-[2px]"
                >
                  <ArrowUpCircle className="w-4 h-4 shrink-0" />
                  {preview.cost.canAfford
                    ? `Upgrade (${preview.cost.coinCost}C)`
                    : `Need Resources (${preview.cost.coinCost}C)`}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => GameController.dispatch({ type: 'TOGGLE_BUILDING', buildingId: b.id })}
                className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#142c20] border border-emerald-700/60 text-stone-100 text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                {b.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                {b.enabled ? 'Pause' : 'Resume'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmDemolish(false);
                  GameController.startMoveBuilding(b.id);
                }}
                className="flex-1 min-h-[44px] px-3 rounded-xl bg-[#0d2433] border border-sky-700/60 text-sky-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5"
              >
                <Move className="w-4 h-4" />
                Move
              </button>
              {copyUnlocked ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmDemolish(false);
                    GameController.setTool({
                      mode: 'build',
                      defId: b.defId,
                      rotation: b.rotation ?? 0,
                      targetLevel: b.level,
                      copiedFromBuildingId: b.id,
                    });
                  }}
                  title={`Copy at Lv.${b.level}: ${copyCost.coinCost.toLocaleString()}C`}
                  className="flex-1 min-h-[44px] px-2.5 rounded-xl bg-[#10261b] border border-emerald-700/60 text-emerald-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-1 tabular-nums"
                >
                  <Copy className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    Copy Lv.{b.level} ({copyCost.coinCost}C)
                  </span>
                </button>
              ) : null}
              {!confirmDemolish ? (
                <button
                  type="button"
                  onClick={() => setConfirmDemolish(true)}
                  className="min-h-[44px] min-w-[44px] px-3 rounded-xl bg-red-950/80 text-red-200 border border-red-800/60 flex items-center justify-center gap-1 text-xs font-semibold"
                  aria-label="Demolish"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    GameController.dispatch({ type: 'DEMOLISH_BUILDING', buildingId: b.id });
                    setConfirmDemolish(false);
                    GameController.clearSelection();
                  }}
                  className="min-h-[44px] px-3.5 rounded-xl bg-red-600 text-white text-xs font-bold"
                >
                  Confirm
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (snap.selectedTile) {
    const t = snap.selectedTile;
    const species = TREE_SPECIES[t.featureType];
    const depName = DEPOSIT_NAMES[t.depositType as DepositType];
    const isRuin = t.featureType === FeatureType.AncientRuin;
    const isTree = isTreeFeature(t.featureType);
    const curRoad = t.roadType !== RoadType.None ? ROADS[t.roadType] : null;
    const roadRefund = curRoad ? Math.round(curRoad.coinCost * 0.5) : 0;
    const nextRoadType =
      t.roadType >= RoadType.Dirt && t.roadType < RoadType.Highway
        ? ((t.roadType + 1) as RoadType)
        : null;
    const nextRoadDef = nextRoadType ? ROADS[nextRoadType] : null;
    const canUpgradeRoad =
      nextRoadDef &&
      snap.state.level >= nextRoadDef.unlockLevel &&
      (!nextRoadDef.requiredTech || snap.state.unlockedTechIds.includes(nextRoadDef.requiredTech));

    const upgradeChoices = ROAD_UPGRADE_TIERS.filter(
      (r) =>
        snap.state.level >= r.unlockLevel &&
        (!r.requiredTech || snap.state.unlockedTechIds.includes(r.requiredTech)) &&
        (r.tierRank ?? r.id) > (curRoad?.tierRank ?? t.roadType)
    );
    const effectiveNetworkTarget =
      upgradeChoices.find((c) => c.id === networkTargetRoad)?.id ?? upgradeChoices[0]?.id ?? RoadType.Paved;
    const netPreview =
      curRoad && showNetworkUpgrade && upgradeChoices.length > 0
        ? BuildingSystem.previewConnectedRoadUpgrade(
            t.gx,
            t.gy,
            effectiveNetworkTarget,
            snap.state,
            GameController.engine.chunks
          )
        : null;

    return (
      <div className="pointer-events-auto fixed bottom-24 inset-x-0 z-30 flex justify-center px-3">
        <div className="w-full max-w-md max-h-[68vh] overflow-y-auto bg-gradient-to-b from-[#142c20]/98 to-[#091610]/98 backdrop-blur-md border border-emerald-700/60 rounded-2xl p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_16px_40px_rgba(0,0,0,0.6)] space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-bold text-stone-100 tabular-nums">
                {t.biomeName} · ({t.gx}, {t.gy})
              </div>
              <div className="text-xs text-stone-300/85 tabular-nums mt-0.5">
                <span className={t.unlocked ? 'text-emerald-300 font-semibold' : 'text-sky-300 font-semibold'}>
                  {t.unlocked ? t.cityName : t.canUnlock ? 'Unlockable Border' : 'Locked Wilderness'}
                </span>
                {t.zoneType !== 'none' ? ` · ${ZONE_META[t.zoneType]?.name ?? t.zoneType}` : ''}
                {(t.utilityNet & UtilityFlag.PowerLine) !== 0 ? ' · Power' : ''}
                {(t.utilityNet & UtilityFlag.WaterPipe) !== 0 ? ' · Water' : ''}
                {t.depositType !== DepositType.None ? ` · ${depName} (${t.depositQty})` : ''}
                {curRoad ? ` · ${curRoad.name} (${curRoad.speedMultiplier}×)` : ''}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setPendingTerraform(null);
                setShowNetworkUpgrade(false);
                GameController.setRoadUpgradePreview(null);
                GameController.clearSelection();
              }}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-[#0a1a12] border border-emerald-800/60 text-stone-300 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {species ? (() => {
            const growthInfo = TreeGrowthSystem.getGrowthInfo(
              snap.state,
              t.gx,
              t.gy,
              t.featureType
            );
            const matureTree = isTreeFeature(t.featureType) && isMatureTreeFeature(t.featureType);
            return (
              <div className="text-xs font-medium text-lime-300 bg-[#08150f] border border-emerald-800/60 rounded-xl px-3 py-2 tabular-nums space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {isRuin
                      ? 'Ancient overgrown ruins hiding relics, Coins & Research Points.'
                      : `${species.name} · ${t.featureHp}/${t.featureMaxHp} HP`}
                  </span>
                  {matureTree ? (
                    <span className="text-[10px] font-bold text-amber-300 shrink-0">Mature</span>
                  ) : growthInfo ? (
                    <span className="text-[10px] font-bold text-emerald-300 shrink-0">
                      {growthInfo.progressPct}%
                    </span>
                  ) : null}
                </div>
                {growthInfo ? (
                  <>
                    <div className="text-[11px] text-stone-300">
                      {growthInfo.stageLabel} → Growing into{' '}
                      <strong className="text-emerald-200">{growthInfo.matureName}</strong> (Workers harvest only mature trees)
                    </div>
                    <div className="w-full h-1.5 bg-[#05100b] rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-lime-500 to-emerald-400 transition-all"
                        style={{ width: `${Math.max(4, growthInfo.progressPct)}%` }}
                      />
                    </div>
                  </>
                ) : null}
              </div>
            );
          })() : null}

          <div className="flex flex-wrap items-center gap-2">
            {!t.unlocked ? (
              <button
                type="button"
                disabled={!t.canUnlock}
                onClick={() => GameController.dispatch({ type: 'UNLOCK_TILE', gx: t.gx, gy: t.gy })}
                className="flex-1 min-h-[46px] px-4 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 disabled:from-stone-800 disabled:to-stone-800 disabled:text-stone-500 text-stone-950 font-bold text-xs flex items-center justify-center gap-1.5 tabular-nums shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_3px_0_#92400e] disabled:shadow-none active:translate-y-[2px]"
              >
                <Unlock className="w-4 h-4" />
                {t.canUnlock ? `Unlock & Flatten (${t.unlockCost}C)` : 'Border Locked — Unlock Adjacent First'}
              </button>
            ) : isRuin ? (
              <button
                type="button"
                onClick={() => GameController.dispatch({ type: 'EXPLORE_RUIN', gx: t.gx, gy: t.gy })}
                className="flex-1 min-h-[46px] px-4 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 text-stone-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_3px_0_#92400e] active:translate-y-[2px]"
              >
                <Compass className="w-4 h-4" />
                Explore Ancient Ruin
              </button>
            ) : t.featureType !== FeatureType.None ? (
              <button
                type="button"
                onClick={() =>
                  GameController.dispatch({ type: 'CHOP_TILE', gx: t.gx, gy: t.gy, isManualTap: true })
                }
                className="flex-1 min-h-[46px] px-4 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 text-stone-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_3px_0_#92400e] active:translate-y-[2px]"
              >
                <Axe className="w-4 h-4" />
                {t.featureType === FeatureType.Sapling || t.featureType === FeatureType.MediumTree
                  ? 'Clear Young Tree'
                  : 'Chop / Harvest'}
              </button>
            ) : curRoad ? (
              <>
                {nextRoadDef ? (
                  <button
                    type="button"
                    disabled={!canUpgradeRoad}
                    onClick={() =>
                      GameController.dispatch({ type: 'PLACE_ROAD', roadType: nextRoadDef.id, gx: t.gx, gy: t.gy })
                    }
                    className="flex-1 min-h-[46px] px-4 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 disabled:from-stone-800 disabled:to-stone-800 disabled:text-stone-400 text-stone-950 font-bold text-xs flex items-center justify-center gap-1.5 tabular-nums"
                  >
                    <ArrowUpCircle className="w-4 h-4" />
                    {canUpgradeRoad
                      ? `Upgrade (${nextRoadDef.name})`
                      : `${nextRoadDef.name} (Lv.${nextRoadDef.unlockLevel})`}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => {
                    GameController.dispatch({ type: 'REMOVE_ROAD', gx: t.gx, gy: t.gy });
                    GameController.clearSelection();
                  }}
                  className="min-h-[46px] px-3.5 rounded-xl bg-red-950/85 border border-red-700/70 text-red-100 font-bold text-xs flex items-center justify-center gap-1.5 tabular-nums"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove Road{roadRefund > 0 ? ` (+${roadRefund}C)` : ''}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    GameController.clearSelection();
                    GameController.setActiveSheet('build');
                  }}
                  className="flex-1 min-h-[46px] px-3 rounded-xl bg-gradient-to-b from-emerald-500 to-emerald-600 text-white font-bold text-xs shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_3px_0_#065f46] active:translate-y-[2px]"
                >
                  Build Here
                </button>
                <button
                  type="button"
                  onClick={() => GameController.dispatch({ type: 'REPLANT_TILE', gx: t.gx, gy: t.gy })}
                  className="min-h-[46px] px-3.5 rounded-xl bg-[#0a1d14] border border-emerald-700/70 text-lime-300 font-semibold text-xs flex items-center gap-1.5"
                >
                  <Sprout className="w-4 h-4" />
                  Plant Tree
                </button>
              </>
            )}
          </div>

          {curRoad ? (
            <div className="p-3 rounded-xl bg-[#081912] border border-emerald-700/55 space-y-2 text-xs tabular-nums">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-stone-100">
                  {t.roadDisconnected ? (
                    <span className="text-amber-300">Disconnected Segment</span>
                  ) : (
                    <span className="text-emerald-300">
                      Connected Network #{t.roadClusterId ?? 1}
                    </span>
                  )}
                </span>
                <span className="text-[11px] text-stone-300 capitalize">
                  {(t.roadIntersectionKind ?? 'straight').replace('_', ' ')} ·{' '}
                  {getRoadProperties(curRoad.id).totalLanes}{' '}
                  {getRoadProperties(curRoad.id).totalLanes === 1 ? 'Lane' : 'Lanes'} ·{' '}
                  {Math.round((t.roadCongestion ?? 0) * 100)}% Load
                </span>
              </div>
              {curRoad.id !== RoadType.Rail ? (
                <div className="space-y-1">
                  <div className="text-[11px] text-stone-400 font-semibold">Lane Direction</div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(
                      [
                        [RoadDirection.TwoWay, '2-Way'],
                        [RoadDirection.OneWayN, '1W N'],
                        [RoadDirection.OneWayE, '1W E'],
                        [RoadDirection.OneWayS, '1W S'],
                        [RoadDirection.OneWayW, '1W W'],
                      ] as const
                    ).map(([dir, label]) => {
                      const active = (t.roadDirection ?? RoadDirection.TwoWay) === dir;
                      return (
                        <button
                          key={dir}
                          type="button"
                          onClick={() =>
                            GameController.dispatch({
                              type: 'SET_ROAD_DIRECTION',
                              gx: t.gx,
                              gy: t.gy,
                              direction: dir,
                            })
                          }
                          className={`min-h-[36px] rounded-lg text-[11px] font-bold border ${
                            active
                              ? 'bg-amber-400 border-amber-300 text-stone-950'
                              : 'bg-[#06120c] border-emerald-800/70 text-stone-200'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Connected Road Network Bulk Upgrade */}
          {curRoad && curRoad.id !== RoadType.Rail && curRoad.id !== RoadType.Bridge && upgradeChoices.length > 0 ? (
            <div className="p-3 rounded-xl bg-[#081912] border border-emerald-700/55 space-y-2 text-xs tabular-nums">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-bold text-amber-300">
                  <GitBranch className="w-4 h-4 shrink-0" /> Connected Road Upgrade
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const nextOpen = !showNetworkUpgrade;
                    setShowNetworkUpgrade(nextOpen);
                    if (!nextOpen) {
                      setNetworkPreviewActive(false);
                      GameController.setRoadUpgradePreview(null);
                    } else {
                      setNetworkTargetRoad(effectiveNetworkTarget);
                    }
                  }}
                  className="min-h-[34px] px-2.5 rounded-lg bg-[#0d2433] border border-sky-600/60 text-sky-200 font-semibold text-[11px]"
                >
                  {showNetworkUpgrade ? 'Close' : 'Upgrade Network'}
                </button>
              </div>

              {showNetworkUpgrade ? (
                <div className="space-y-2 pt-1">
                  <select
                    value={effectiveNetworkTarget}
                    onChange={(e) => {
                      const nextRt = Number(e.target.value) as RoadType;
                      setNetworkTargetRoad(nextRt);
                      if (networkPreviewActive) {
                        const p = BuildingSystem.previewConnectedRoadUpgrade(
                          t.gx,
                          t.gy,
                          nextRt,
                          snap.state,
                          GameController.engine.chunks
                        );
                        GameController.setRoadUpgradePreview(p.valid ? p.tiles : []);
                      }
                    }}
                    className="w-full min-h-[40px] px-2.5 rounded-xl bg-[#06120c] border border-emerald-800/70 text-stone-100 font-semibold"
                  >
                    {upgradeChoices.map((r) => (
                      <option key={r.id} value={r.id}>
                        Upgrade All Connected → {r.name} ({r.speedMultiplier}×)
                      </option>
                    ))}
                  </select>

                  {netPreview ? (
                    <div className="p-2 rounded-lg bg-[#06120c] border border-emerald-900/60 flex items-center justify-between gap-2 text-[11px]">
                      {netPreview.valid ? (
                        <>
                          <span className="text-stone-300">
                            <strong className="text-emerald-300">{netPreview.tiles.length}</strong> connected road tiles
                          </span>
                          <span className="font-bold text-amber-300">{netPreview.totalCoinCost}C</span>
                        </>
                      ) : (
                        <span className="text-amber-300">{netPreview.reason}</span>
                      )}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const next = !networkPreviewActive;
                        setNetworkPreviewActive(next);
                        if (next && netPreview?.valid) {
                          GameController.setRoadUpgradePreview(netPreview.tiles);
                        } else {
                          GameController.setRoadUpgradePreview(null);
                        }
                      }}
                      className={`min-h-[42px] px-3 rounded-xl font-bold border ${
                        networkPreviewActive
                          ? 'bg-sky-500 border-sky-400 text-stone-950'
                          : 'bg-[#0b1f16] border-sky-700/60 text-sky-200'
                      }`}
                    >
                      {networkPreviewActive ? 'Hide Preview' : 'Preview Roads'}
                    </button>
                    <button
                      type="button"
                      disabled={!netPreview?.valid}
                      onClick={() => {
                        const ok = GameController.dispatch({
                          type: 'UPGRADE_CONNECTED_ROADS',
                          gx: t.gx,
                          gy: t.gy,
                          targetRoadType: effectiveNetworkTarget,
                        });
                        if (ok) {
                          setNetworkPreviewActive(false);
                          setShowNetworkUpgrade(false);
                          GameController.setRoadUpgradePreview(null);
                        }
                      }}
                      className="min-h-[42px] px-3 rounded-xl bg-gradient-to-b from-amber-400 to-amber-500 disabled:from-stone-800 disabled:to-stone-800 disabled:text-stone-500 text-stone-950 font-bold"
                    >
                      Confirm Upgrade
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Unlocked Tile District Zone Selector */}
          {t.unlocked ? (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-stone-400 shrink-0 font-semibold">Zone:</span>
              <select
                value={t.zoneType}
                onChange={(e) =>
                  GameController.dispatch({
                    type: 'ASSIGN_TILE_CITY_ZONE',
                    gx: t.gx,
                    gy: t.gy,
                    zoneType: e.target.value as ZoneType,
                  })
                }
                className="flex-1 min-h-[38px] px-2.5 rounded-xl bg-[#07150e] border border-emerald-800/70 text-stone-100 font-semibold text-[11px]"
              >
                {(Object.keys(ZONE_META) as ZoneType[]).map((z) => (
                  <option key={z} value={z}>
                    {ZONE_META[z].name} ({ZONE_META[z].bonusText})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {t.unlocked ? (
            t.biomeId === BiomeId.Mountain ? (
              <div className="text-[11px] text-stone-400">
                Permanent mountain terrain (cannot be converted to water or flatland).
              </div>
            ) : pendingTerraform ? (
              <div className="p-2.5 rounded-xl bg-red-950/70 border border-red-700/70 flex items-center justify-between gap-2 text-xs">
                <span className="text-red-100 font-medium">Remove existing road/structure &amp; terraform?</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      GameController.dispatchResult({
                        type: 'TERRAFORM_TILE',
                        gx: t.gx,
                        gy: t.gy,
                        action: pendingTerraform,
                        confirmDemolish: true,
                      });
                      setPendingTerraform(null);
                    }}
                    className="h-8 px-2.5 rounded-lg bg-red-600 text-white font-bold text-[11px]"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingTerraform(null)}
                    className="h-8 px-2 rounded-lg bg-[#0a1a12] text-stone-300 text-[11px]"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 pt-0.5">
                {t.biomeId === BiomeId.River || t.biomeId === BiomeId.DeepWater ? (
                  <button
                    type="button"
                    onClick={() => {
                      const res = GameController.dispatchResult({
                        type: 'TERRAFORM_TILE',
                        gx: t.gx,
                        gy: t.gy,
                        action: 'to_land',
                      });
                      if (res.needsConfirm) setPendingTerraform('to_land');
                    }}
                    className="flex-1 min-h-[38px] px-3 rounded-xl bg-[#0d2433] border border-emerald-700/60 text-emerald-200 font-semibold text-xs flex items-center justify-center gap-1.5"
                  >
                    <Waves className="w-3.5 h-3.5" />
                    Reclaim as Land (75C)
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const res = GameController.dispatchResult({
                        type: 'TERRAFORM_TILE',
                        gx: t.gx,
                        gy: t.gy,
                        action: 'to_water',
                      });
                      if (res.needsConfirm) setPendingTerraform('to_water');
                    }}
                    className="flex-1 min-h-[38px] px-3 rounded-xl bg-[#0d2433] border border-sky-700/60 text-sky-200 font-semibold text-xs flex items-center justify-center gap-1.5"
                  >
                    <Waves className="w-3.5 h-3.5" />
                    Convert to Canal/Water (75C)
                  </button>
                )}
              </div>
            )
          ) : null}
        </div>
      </div>
    );
  }

  return null;
};
