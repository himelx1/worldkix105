import { getRecipeHourlyAmount } from '../core/Formatters';
import type { BuildingInstance, BuildingStatus, WorldEngineState } from '../core/GameState';
import {
  BuildingCategory,
  BuildingDef,
  BUILDINGS,
  getBuildingLevelMultiplier,
} from '../data/buildings.data';
import { RESOURCE_LIST, RESOURCES, ResourceId } from '../data/resources.data';

export interface PlantationLevelSpec {
  level: number;
  maxTrees: number;
  plantBatch: number;
  harvestBatch: number;
  growSeconds: number;
  woodPerTree: number;
  efficiency: number;
  label: string;
}

export const PLANTATION_TOTAL_SLOTS = 800; // 20x50 (1000) minus 10x20 main factory building (200)

export const PLANTATION_LEVEL_SPECS: ReadonlyArray<PlantationLevelSpec> = [
  {
    level: 1,
    maxTrees: 160,
    plantBatch: 8,
    harvestBatch: 8,
    growSeconds: 40,
    woodPerTree: 1.5,
    efficiency: 1.0,
    label: 'Base plantation & automated timber line',
  },
  {
    level: 2,
    maxTrees: 300,
    plantBatch: 14,
    harvestBatch: 14,
    growSeconds: 32,
    woodPerTree: 1.8,
    efficiency: 1.15,
    label: 'Expanded nursery & faster seedling growth',
  },
  {
    level: 3,
    maxTrees: 460,
    plantBatch: 22,
    harvestBatch: 22,
    growSeconds: 26,
    woodPerTree: 2.1,
    efficiency: 1.35,
    label: 'Automated gantry harvesters & drip irrigation',
  },
  {
    level: 4,
    maxTrees: 640,
    plantBatch: 32,
    harvestBatch: 32,
    growSeconds: 21,
    woodPerTree: 2.5,
    efficiency: 1.6,
    label: 'High-density silviculture & rapid replant drones',
  },
  {
    level: 5,
    maxTrees: 800,
    plantBatch: 48,
    harvestBatch: 48,
    growSeconds: 16,
    woodPerTree: 3.0,
    efficiency: 1.9,
    label: 'Full-capacity 800-plot industrial forestry complex',
  },
];

export function getPlantationLevelSpec(level: number): PlantationLevelSpec {
  const idx = Math.max(0, Math.min(PLANTATION_LEVEL_SPECS.length - 1, Math.floor(level) - 1));
  return PLANTATION_LEVEL_SPECS[idx];
}

export function getPlantationTheoreticalHourlyWood(level: number): number {
  const cfg = getPlantationLevelSpec(level);
  const woodPerRealSec = (cfg.maxTrees / cfg.growSeconds) * cfg.woodPerTree * cfg.efficiency;
  return Number((woodPerRealSec * 12.5).toFixed(1));
}

export function getEffectiveMaxLevel(def: Pick<BuildingDef, 'category' | 'maxLevel'>): number {
  return def.category === 'storage' ? 4 : 5;
}

export function clampBuildingLevel(def: Pick<BuildingDef, 'category' | 'maxLevel'>, level: number): number {
  const maxLvl = getEffectiveMaxLevel(def);
  return Math.min(maxLvl, Math.max(1, Math.floor(level || 1)));
}

export interface BuildingCostMaterialItem {
  resourceId: ResourceId;
  name: string;
  have: number;
  need: number;
  missing: number;
  producers: string[];
}

export interface BuildingCostBreakdown {
  coinCost: number;
  materialCost: Partial<Record<ResourceId, number>>;
}

export interface EvaluatedBuildingCost {
  coinCost: number;
  coinsHave: number;
  missingCoins: number;
  materials: BuildingCostMaterialItem[];
  missingMaterials: BuildingCostMaterialItem[];
  materialCost: Partial<Record<ResourceId, number>>;
  canAfford: boolean;
}

export class BuildingCostCalculator {
  public static getLevel1Cost(def: BuildingDef): BuildingCostBreakdown {
    const materialCost: Partial<Record<ResourceId, number>> = {};
    for (const [k, v] of Object.entries(def.materialCost)) {
      if (v && v > 0) materialCost[k as ResourceId] = v;
    }
    return {
      coinCost: Math.max(0, Math.round(def.coinCost)),
      materialCost,
    };
  }

  public static getUpgradeStepCost(def: BuildingDef, fromLevel: number): BuildingCostBreakdown {
    const lvl = Math.max(1, Math.floor(fromLevel));
    const mult = 0.75 * Math.pow(1.6, lvl - 1);
    const coinCost = Math.max(0, Math.round(def.coinCost * mult));
    const materialCost: Partial<Record<ResourceId, number>> = {};
    for (const [k, v] of Object.entries(def.materialCost)) {
      if (!v || v <= 0) continue;
      materialCost[k as ResourceId] = Math.max(1, Math.round(v * mult));
    }
    return { coinCost, materialCost };
  }

  /**
   * Computes cumulative cost to build a fresh instance directly at `targetLevel`:
   * L1 cost + sum of upgrade steps from 1..(targetLevel - 1).
   */
  public static getCumulativeBuildCost(def: BuildingDef, targetLevel: number): BuildingCostBreakdown {
    const clampedTarget = clampBuildingLevel(def, targetLevel);
    const base = this.getLevel1Cost(def);
    let totalCoins = base.coinCost;
    const totalMaterials: Partial<Record<ResourceId, number>> = { ...base.materialCost };

    for (let lvl = 1; lvl < clampedTarget; lvl++) {
      const step = this.getUpgradeStepCost(def, lvl);
      totalCoins += step.coinCost;
      for (const [k, v] of Object.entries(step.materialCost)) {
        if (!v) continue;
        const rid = k as ResourceId;
        totalMaterials[rid] = (totalMaterials[rid] ?? 0) + v;
      }
    }

    return { coinCost: totalCoins, materialCost: totalMaterials };
  }

  public static getCopyCost(def: BuildingDef, sourceLevel: number): BuildingCostBreakdown {
    return this.getCumulativeBuildCost(def, sourceLevel);
  }

  public static getDemolishRefundCoins(def: BuildingDef, level: number): number {
    const invested = this.getCumulativeBuildCost(def, level);
    return Math.round(invested.coinCost * 0.4);
  }

  public static evaluateCost(
    cost: BuildingCostBreakdown,
    state: WorldEngineState,
    producersFn?: (rid: ResourceId) => string[]
  ): EvaluatedBuildingCost {
    const coinsHave = Math.floor(state.coins);
    const missingCoins = Math.max(0, cost.coinCost - coinsHave);
    const materials: BuildingCostMaterialItem[] = [];
    for (const [k, rawNeed] of Object.entries(cost.materialCost)) {
      const need = rawNeed ?? 0;
      if (need <= 0) continue;
      const rid = k as ResourceId;
      const have = Math.floor(state.resources[rid] ?? 0);
      materials.push({
        resourceId: rid,
        name: RESOURCES[rid]?.name ?? rid,
        have,
        need,
        missing: Math.max(0, need - have),
        producers: producersFn ? producersFn(rid) : [],
      });
    }
    const missingMaterials = materials.filter((m) => m.missing > 0);
    return {
      coinCost: cost.coinCost,
      coinsHave,
      missingCoins,
      materials,
      missingMaterials,
      materialCost: cost.materialCost,
      canAfford: missingCoins === 0 && missingMaterials.length === 0,
    };
  }
}

export interface HourlyOutputRate {
  resourceId: ResourceId;
  name: string;
  perHour: number;
}

export interface BuildingLevelStats {
  level: number;
  maxLevel: number;
  multiplier: number;
  hourlyOutputs: HourlyOutputRate[];
  totalHourlyOutput: number;
  housingCapacity: number;
  granaryBonus: number;
  warehouseBonus: number;
  storageCapacityBonus: number;
  totalStorageBonus: number;
  powerOutput: number;
  powerDemand: number;
  waterOutput: number;
  waterDemand: number;
  minWorkers: number;
  maxWorkers: number;
  upkeepPerMin: number;
  taxPerMin: number;
  tradeCapacity: number;
  healthcareBonus: number;
  educationBonus: number;
  safetyBonus: number;
  recreationBonus: number;
  happinessBonus: number;
  rpPerMin: number;
  rpPaperCostPerMin: number;
  lifeExpectancyBonus: number;
  plantationMaxTrees: number;
}

export function getBuildingStatsAtLevel(def: BuildingDef, level: number): BuildingLevelStats {
  const maxLevel = getEffectiveMaxLevel(def);
  const clampedLevel = Math.min(maxLevel, Math.max(1, Math.floor(level || 1)));
  const mult = getBuildingLevelMultiplier(clampedLevel, def);
  const linearDemandMult = 1 + (clampedLevel - 1) * 0.25;

  const hourlyOutputs: HourlyOutputRate[] = [];
  let totalHourlyOutput = 0;

  if (def.isAutomatedTreePlantation) {
    const perHour = getPlantationTheoreticalHourlyWood(clampedLevel);
    hourlyOutputs.push({ resourceId: 'wood', name: RESOURCES.wood.name, perHour });
    totalHourlyOutput += perHour;
  } else if (def.recipe) {
    for (const [k, v] of Object.entries(def.recipe.outputs)) {
      if (!v) continue;
      const rid = k as ResourceId;
      const perHour = getRecipeHourlyAmount(v, def.recipe.cycleSeconds, mult);
      hourlyOutputs.push({ resourceId: rid, name: RESOURCES[rid]?.name ?? rid, perHour });
      totalHourlyOutput += perHour;
    }
  }

  const extraWorkers = clampedLevel > 1 && def.maxWorkers >= 2 ? clampedLevel - 1 : 0;
  const granaryBonus = def.granaryBonus ? Math.round(def.granaryBonus * mult) : 0;
  const warehouseBonus = def.warehouseBonus ? Math.round(def.warehouseBonus * mult) : 0;
  const storageCapacityBonus = def.storageCapacityBonus ? Math.round(def.storageCapacityBonus * mult) : 0;

  return {
    level: clampedLevel,
    maxLevel,
    multiplier: mult,
    hourlyOutputs,
    totalHourlyOutput: Number(totalHourlyOutput.toFixed(1)),
    housingCapacity: def.housingCapacity ? Math.round(def.housingCapacity * mult) : 0,
    granaryBonus,
    warehouseBonus,
    storageCapacityBonus,
    totalStorageBonus: granaryBonus + warehouseBonus + storageCapacityBonus,
    powerOutput: def.powerOutput ? Math.round(def.powerOutput * mult) : 0,
    powerDemand: def.powerDemand ? Math.round(def.powerDemand * linearDemandMult) : 0,
    waterOutput: def.waterOutput ? Math.round(def.waterOutput * mult) : 0,
    waterDemand: def.waterDemand ? Math.round(def.waterDemand * linearDemandMult) : 0,
    minWorkers: def.minWorkers,
    maxWorkers: def.maxWorkers > 0 ? def.maxWorkers + extraWorkers : 0,
    upkeepPerMin: def.upkeepPerMin ? Math.round(def.upkeepPerMin * linearDemandMult) : 0,
    taxPerMin: def.taxPerMin ? Math.round(def.taxPerMin * mult) : 0,
    tradeCapacity: def.tradeCapacity ? Math.round(def.tradeCapacity * mult) : 0,
    healthcareBonus: def.healthcareBonus ? Math.round(def.healthcareBonus * mult) : 0,
    educationBonus: def.educationBonus ? Math.round(def.educationBonus * mult) : 0,
    safetyBonus: def.safetyBonus ? Math.round(def.safetyBonus * mult) : 0,
    recreationBonus: def.recreationBonus ? Math.round(def.recreationBonus * mult) : 0,
    happinessBonus: def.happinessBonus ? Math.round(def.happinessBonus * linearDemandMult) : 0,
    rpPerMin: def.rpPerMin ? Number((def.rpPerMin * (1 + (clampedLevel - 1) * 0.35)).toFixed(2)) : 0,
    rpPaperCostPerMin: def.rpPaperCostPerMin
      ? Number((def.rpPaperCostPerMin * (1 + (clampedLevel - 1) * 0.2)).toFixed(2))
      : 0,
    lifeExpectancyBonus: def.lifeExpectancyBonus
      ? Number((def.lifeExpectancyBonus * Math.min(2.0, 1 + (clampedLevel - 1) * 0.25)).toFixed(2))
      : 0,
    plantationMaxTrees: def.isAutomatedTreePlantation ? getPlantationLevelSpec(clampedLevel).maxTrees : 0,
  };
}

export interface StorageGroupBreakdown {
  baseCapacityPerItem: number;
  bonusCapacity: number;
  capacityPerItem: number;
  totalStoredUnits: number;
  totalCapacityUnits: number;
  overflowItems: Array<{ resourceId: ResourceId; name: string; stored: number; cap: number }>;
  activeBuildingCount: number;
}

export interface StorageSystemSummary {
  crop: StorageGroupBreakdown; // granaryBonus group
  material: StorageGroupBreakdown; // warehouseBonus + storageCapacityBonus group
  granaryBonus: number;
  warehouseBonus: number;
}

export function getStorageSystemSummary(state: WorldEngineState): StorageSystemSummary {
  let granaryBonus = 0;
  let warehouseBonus = 0;
  let cropBuildingCount = 0;
  let materialBuildingCount = 0;

  for (const b of state.buildings) {
    if (b.status === 'constructing') continue;
    const def = BUILDINGS[b.defId];
    if (!def) continue;
    const stats = getBuildingStatsAtLevel(def, b.level);
    if (stats.granaryBonus > 0) {
      granaryBonus += stats.granaryBonus;
      cropBuildingCount++;
    }
    if (stats.warehouseBonus + stats.storageCapacityBonus > 0) {
      warehouseBonus += stats.warehouseBonus + stats.storageCapacityBonus;
      materialBuildingCount++;
    }
  }

  let cropBase = 0;
  let cropStored = 0;
  let cropCapTotal = 0;
  let matBase = 0;
  let matStored = 0;
  let matCapTotal = 0;
  const cropOverflow: StorageGroupBreakdown['overflowItems'] = [];
  const matOverflow: StorageGroupBreakdown['overflowItems'] = [];

  for (const r of RESOURCE_LIST) {
    const stored = state.resources[r.id] ?? 0;
    const cap =
      r.storageGroup === 'granary' ? r.baseCap + granaryBonus : r.baseCap + warehouseBonus;
    if (r.storageGroup === 'granary') {
      cropBase = Math.max(cropBase, r.baseCap);
      cropStored += stored;
      cropCapTotal += cap;
      if (stored > cap) {
        cropOverflow.push({ resourceId: r.id, name: r.name, stored: Math.floor(stored), cap });
      }
    } else {
      matBase = Math.max(matBase, r.baseCap);
      matStored += stored;
      matCapTotal += cap;
      if (stored > cap) {
        matOverflow.push({ resourceId: r.id, name: r.name, stored: Math.floor(stored), cap });
      }
    }
  }

  return {
    crop: {
      baseCapacityPerItem: cropBase,
      bonusCapacity: granaryBonus,
      capacityPerItem: cropBase + granaryBonus,
      totalStoredUnits: Math.round(cropStored),
      totalCapacityUnits: cropCapTotal,
      overflowItems: cropOverflow,
      activeBuildingCount: cropBuildingCount,
    },
    material: {
      baseCapacityPerItem: matBase,
      bonusCapacity: warehouseBonus,
      capacityPerItem: matBase + warehouseBonus,
      totalStoredUnits: Math.round(matStored),
      totalCapacityUnits: matCapTotal,
      overflowItems: matOverflow,
      activeBuildingCount: materialBuildingCount,
    },
    granaryBonus,
    warehouseBonus,
  };
}

export interface BuildingSimSnapshot {
  id: number;
  defId: string;
  name: string;
  category: BuildingCategory;
  level: number;
  maxLevel: number;
  constructionState: 'constructing' | 'completed';
  buildProgress: number;
  status: BuildingStatus;
  enabled: boolean;
  stats: BuildingLevelStats;
  actualProductionPerHour: number;
  maxProductionPerHour: number;
  storageType: 'crop' | 'material' | 'both' | 'none';
  storageCapacityContribution: number;
  relevantStoredTotal: number;
  relevantStoredCapacity: number;
  powerGeneration: number;
  powerConsumption: number;
  waterGeneration: number;
  waterConsumption: number;
  requiredWorkers: number;
  availableWorkers: number;
  maxWorkers: number;
  incomePerMin: number;
  expensePerMin: number;
  constructionCost: BuildingCostBreakdown;
  nextUpgradeCost: EvaluatedBuildingCost | null;
}

export function getBuildingSimSnapshot(
  b: BuildingInstance,
  state: WorldEngineState,
  producersFn?: (rid: ResourceId) => string[]
): BuildingSimSnapshot | null {
  const def = BUILDINGS[b.defId];
  if (!def) return null;

  const maxLevel = getEffectiveMaxLevel(def);
  const level = clampBuildingLevel(def, b.level);
  const stats = getBuildingStatsAtLevel(def, level);

  const storageType: BuildingSimSnapshot['storageType'] =
    stats.granaryBonus > 0 && stats.warehouseBonus + stats.storageCapacityBonus > 0
      ? 'both'
      : stats.granaryBonus > 0
        ? 'crop'
        : stats.warehouseBonus + stats.storageCapacityBonus > 0
          ? 'material'
          : 'none';

  let relevantStoredTotal = 0;
  let relevantStoredCapacity = 0;
  if (storageType !== 'none') {
    for (const r of RESOURCE_LIST) {
      const match =
        storageType === 'both' ||
        (storageType === 'crop' && r.storageGroup === 'granary') ||
        (storageType === 'material' && r.storageGroup === 'warehouse');
      if (!match) continue;
      relevantStoredTotal += Math.floor(state.resources[r.id] ?? 0);
      relevantStoredCapacity += Math.floor(state.capacities[r.id] ?? r.baseCap);
    }
  } else if (stats.hourlyOutputs.length > 0) {
    for (const out of stats.hourlyOutputs) {
      relevantStoredTotal += Math.floor(state.resources[out.resourceId] ?? 0);
      relevantStoredCapacity += Math.floor(state.capacities[out.resourceId] ?? 100);
    }
  }

  const maxProductionPerHour = b.theoreticalHourlyRate ?? stats.totalHourlyOutput;
  const actualProductionPerHour =
    b.status === 'active' ? (b.actualHourlyRate ?? maxProductionPerHour) : 0;

  const isConstructing = b.status === 'constructing';
  const nextUpgradeCost =
    level < maxLevel
      ? BuildingCostCalculator.evaluateCost(
          BuildingCostCalculator.getUpgradeStepCost(def, level),
          state,
          producersFn
        )
      : null;

  return {
    id: b.id,
    defId: b.defId,
    name: def.name,
    category: def.category,
    level,
    maxLevel,
    constructionState: isConstructing ? 'constructing' : 'completed',
    buildProgress: b.buildProgress,
    status: b.status,
    enabled: b.enabled,
    stats,
    actualProductionPerHour: Number(actualProductionPerHour.toFixed(1)),
    maxProductionPerHour: Number(maxProductionPerHour.toFixed(1)),
    storageType,
    storageCapacityContribution: stats.totalStorageBonus,
    relevantStoredTotal,
    relevantStoredCapacity,
    powerGeneration: !isConstructing && b.enabled ? stats.powerOutput : 0,
    powerConsumption: !isConstructing && b.enabled ? stats.powerDemand : 0,
    waterGeneration: !isConstructing && b.enabled ? stats.waterOutput : 0,
    waterConsumption: !isConstructing && b.enabled ? stats.waterDemand : 0,
    requiredWorkers: stats.minWorkers,
    availableWorkers: b.assignedWorkers,
    maxWorkers: stats.maxWorkers,
    incomePerMin: !isConstructing && b.enabled ? stats.taxPerMin : 0,
    expensePerMin: !isConstructing && b.enabled ? stats.upkeepPerMin : 0,
    constructionCost: BuildingCostCalculator.getCumulativeBuildCost(def, level),
    nextUpgradeCost,
  };
}

export interface DynamicMetricBadge {
  label: string;
  value: string;
  accent?: 'emerald' | 'amber' | 'sky' | 'rose' | 'slate';
}

export function getDynamicBuildingSummary(
  def: BuildingDef,
  level: number,
  instance?: BuildingInstance | null,
  state?: WorldEngineState | null
): {
  headline: string;
  metrics: DynamicMetricBadge[];
} {
  const stats = getBuildingStatsAtLevel(def, level);
  const maxLvl = stats.maxLevel;
  const metrics: DynamicMetricBadge[] = [];

  if (stats.hourlyOutputs.length > 0) {
    const top = stats.hourlyOutputs[0];
    const extra = stats.hourlyOutputs.length > 1 ? ` (+${stats.hourlyOutputs.length - 1})` : '';
    const actual = instance
      ? instance.status === 'active'
        ? (instance.actualHourlyRate ?? top.perHour)
        : 0
      : top.perHour;
    metrics.push({
      label: `${top.name}/hr${extra}`,
      value: instance ? `${actual.toFixed(1)} / ${stats.totalHourlyOutput.toFixed(1)}` : `${top.perHour.toFixed(1)}/hr`,
      accent: 'emerald',
    });
  }

  if (stats.plantationMaxTrees > 0) {
    const activeTrees =
      instance && state?.treePlantations?.[instance.id]
        ? state.treePlantations[instance.id].activeTrees
        : 0;
    metrics.push({
      label: 'Plantation Slots',
      value: instance ? `${activeTrees} / ${stats.plantationMaxTrees}` : `${stats.plantationMaxTrees} trees`,
      accent: 'emerald',
    });
  }

  if (stats.housingCapacity > 0) {
    const cityHoused =
      instance && state
        ? (state.population.cohorts ?? [])
            .filter((c) => c.homeBuildingId === instance.id)
            .reduce((s, c) => s + c.count, 0)
        : null;
    metrics.push({
      label: 'Housing',
      value: cityHoused !== null ? `${cityHoused} / ${stats.housingCapacity}` : `${stats.housingCapacity} residents`,
      accent: 'sky',
    });
  }

  if (stats.granaryBonus > 0) {
    metrics.push({
      label: 'Crop Storage',
      value: `+${stats.granaryBonus}/crop`,
      accent: 'amber',
    });
  }
  if (stats.warehouseBonus + stats.storageCapacityBonus > 0) {
    metrics.push({
      label: 'Material Storage',
      value: `+${stats.warehouseBonus + stats.storageCapacityBonus}/item`,
      accent: 'amber',
    });
  }

  if (stats.powerOutput > 0) {
    metrics.push({ label: 'Power Gen', value: `+${stats.powerOutput} MW`, accent: 'amber' });
  }
  if (stats.powerDemand > 0) {
    metrics.push({ label: 'Power Use', value: `${stats.powerDemand} MW`, accent: 'slate' });
  }
  if (stats.waterOutput > 0) {
    metrics.push({ label: 'Water Supply', value: `+${stats.waterOutput} kL`, accent: 'sky' });
  }
  if (stats.waterDemand > 0) {
    metrics.push({ label: 'Water Use', value: `${stats.waterDemand} kL`, accent: 'slate' });
  }

  if (stats.maxWorkers > 0) {
    metrics.push({
      label: 'Workers',
      value: instance
        ? `${instance.assignedWorkers} / ${stats.maxWorkers} (min ${stats.minWorkers})`
        : `${stats.minWorkers}-${stats.maxWorkers}`,
      accent: 'slate',
    });
  }

  if (stats.educationBonus > 0) {
    metrics.push({ label: 'Education', value: `+${stats.educationBonus}`, accent: 'sky' });
  }
  if (stats.healthcareBonus > 0) {
    metrics.push({ label: 'Healthcare', value: `+${stats.healthcareBonus}`, accent: 'emerald' });
  }
  if (stats.safetyBonus > 0) {
    metrics.push({ label: 'Safety', value: `+${stats.safetyBonus}`, accent: 'amber' });
  }
  if (stats.recreationBonus > 0) {
    metrics.push({ label: 'Recreation', value: `+${stats.recreationBonus}`, accent: 'emerald' });
  }
  if (stats.rpPerMin > 0) {
    metrics.push({ label: 'Research', value: `+${stats.rpPerMin} RP/m`, accent: 'sky' });
  }
  if (stats.taxPerMin > 0) {
    metrics.push({ label: 'Income', value: `+${stats.taxPerMin}c/m`, accent: 'amber' });
  }
  if (stats.tradeCapacity > 0) {
    metrics.push({ label: 'Trade Cap', value: `+${stats.tradeCapacity}`, accent: 'sky' });
  }
  if (stats.upkeepPerMin > 0) {
    metrics.push({ label: 'Upkeep', value: `-${stats.upkeepPerMin}c/m`, accent: 'rose' });
  }

  const levelPrefix = `Lv.${stats.level}/${maxLvl}`;
  const headlineParts: string[] = [];
  if (stats.hourlyOutputs.length > 0) {
    const main = stats.hourlyOutputs[0];
    headlineParts.push(`Produces ${main.perHour.toFixed(1)} ${main.name}/hr`);
  }
  if (stats.housingCapacity > 0) headlineParts.push(`Houses ${stats.housingCapacity} citizens`);
  if (stats.granaryBonus > 0) headlineParts.push(`Adds +${stats.granaryBonus} crop storage per crop type`);
  if (stats.warehouseBonus + stats.storageCapacityBonus > 0) {
    headlineParts.push(`Adds +${stats.warehouseBonus + stats.storageCapacityBonus} material storage per item`);
  }
  if (stats.powerOutput > 0) headlineParts.push(`Generates ${stats.powerOutput} MW power`);
  if (stats.waterOutput > 0) headlineParts.push(`Supplies ${stats.waterOutput} kL clean water`);
  if (stats.educationBonus > 0) headlineParts.push(`Provides +${stats.educationBonus} education capacity`);
  if (stats.healthcareBonus > 0) headlineParts.push(`Provides +${stats.healthcareBonus} healthcare capacity`);
  if (stats.safetyBonus > 0) headlineParts.push(`Provides +${stats.safetyBonus} civic safety`);
  if (stats.recreationBonus > 0) headlineParts.push(`Provides +${stats.recreationBonus} recreation`);
  if (stats.rpPerMin > 0) headlineParts.push(`Generates ${stats.rpPerMin} RP/min`);
  if (stats.tradeCapacity > 0) headlineParts.push(`Supports ${stats.tradeCapacity} trade volume/min`);
  if (headlineParts.length === 0 && stats.taxPerMin > 0) {
    headlineParts.push(`Generates ${stats.taxPerMin} Coins/min tax revenue`);
  }

  const headline =
    headlineParts.length > 0
      ? `${levelPrefix}: ${headlineParts.join(' · ')}.`
      : `${levelPrefix}: ${def.description}`;

  return { headline, metrics };
}

export type LevelUpStatus = 'ready' | 'waiting_resources' | 'max_level' | 'requirements_unmet';

export interface LevelUpDeltaItem {
  label: string;
  current: string;
  next: string;
  deltaText: string;
}

export interface LevelUpEntry {
  building: BuildingInstance;
  def: BuildingDef;
  level: number;
  maxLevel: number;
  status: LevelUpStatus;
  statusReason: string;
  cityName: string;
  curStats: BuildingLevelStats;
  nextStats: BuildingLevelStats | null;
  deltas: LevelUpDeltaItem[];
  cost: EvaluatedBuildingCost | null;
}

export function buildUpgradeDeltas(cur: BuildingLevelStats, next: BuildingLevelStats): LevelUpDeltaItem[] {
  const deltas: LevelUpDeltaItem[] = [];
  if (next.totalHourlyOutput > cur.totalHourlyOutput) {
    const outName = next.hourlyOutputs[0]?.name ?? 'Output';
    deltas.push({
      label: `${outName}/hr`,
      current: `${cur.totalHourlyOutput.toFixed(1)}`,
      next: `${next.totalHourlyOutput.toFixed(1)}`,
      deltaText: `+${(next.totalHourlyOutput - cur.totalHourlyOutput).toFixed(1)}`,
    });
  }
  if (next.plantationMaxTrees > cur.plantationMaxTrees) {
    deltas.push({
      label: 'Tree Slots',
      current: `${cur.plantationMaxTrees}`,
      next: `${next.plantationMaxTrees}`,
      deltaText: `+${next.plantationMaxTrees - cur.plantationMaxTrees}`,
    });
  }
  if (next.housingCapacity > cur.housingCapacity) {
    deltas.push({
      label: 'Housing',
      current: `${cur.housingCapacity}`,
      next: `${next.housingCapacity}`,
      deltaText: `+${next.housingCapacity - cur.housingCapacity}`,
    });
  }
  if (next.granaryBonus > cur.granaryBonus) {
    deltas.push({
      label: 'Crop Cap',
      current: `+${cur.granaryBonus}`,
      next: `+${next.granaryBonus}`,
      deltaText: `+${next.granaryBonus - cur.granaryBonus}`,
    });
  }
  if (next.warehouseBonus + next.storageCapacityBonus > cur.warehouseBonus + cur.storageCapacityBonus) {
    const c = cur.warehouseBonus + cur.storageCapacityBonus;
    const n = next.warehouseBonus + next.storageCapacityBonus;
    deltas.push({
      label: 'Material Cap',
      current: `+${c}`,
      next: `+${n}`,
      deltaText: `+${n - c}`,
    });
  }
  if (next.powerOutput > cur.powerOutput) {
    deltas.push({
      label: 'Power Gen',
      current: `${cur.powerOutput} MW`,
      next: `${next.powerOutput} MW`,
      deltaText: `+${next.powerOutput - cur.powerOutput} MW`,
    });
  }
  if (next.waterOutput > cur.waterOutput) {
    deltas.push({
      label: 'Water Supply',
      current: `${cur.waterOutput} kL`,
      next: `${next.waterOutput} kL`,
      deltaText: `+${next.waterOutput - cur.waterOutput} kL`,
    });
  }
  if (next.educationBonus > cur.educationBonus) {
    deltas.push({
      label: 'Education',
      current: `+${cur.educationBonus}`,
      next: `+${next.educationBonus}`,
      deltaText: `+${next.educationBonus - cur.educationBonus}`,
    });
  }
  if (next.healthcareBonus > cur.healthcareBonus) {
    deltas.push({
      label: 'Healthcare',
      current: `+${cur.healthcareBonus}`,
      next: `+${next.healthcareBonus}`,
      deltaText: `+${next.healthcareBonus - cur.healthcareBonus}`,
    });
  }
  if (next.safetyBonus > cur.safetyBonus) {
    deltas.push({
      label: 'Safety',
      current: `+${cur.safetyBonus}`,
      next: `+${next.safetyBonus}`,
      deltaText: `+${next.safetyBonus - cur.safetyBonus}`,
    });
  }
  if (next.recreationBonus > cur.recreationBonus) {
    deltas.push({
      label: 'Recreation',
      current: `+${cur.recreationBonus}`,
      next: `+${next.recreationBonus}`,
      deltaText: `+${next.recreationBonus - cur.recreationBonus}`,
    });
  }
  if (next.rpPerMin > cur.rpPerMin) {
    deltas.push({
      label: 'Research',
      current: `${cur.rpPerMin}/m`,
      next: `${next.rpPerMin}/m`,
      deltaText: `+${(next.rpPerMin - cur.rpPerMin).toFixed(1)}/m`,
    });
  }
  if (next.taxPerMin > cur.taxPerMin) {
    deltas.push({
      label: 'Income',
      current: `${cur.taxPerMin}c/m`,
      next: `${next.taxPerMin}c/m`,
      deltaText: `+${next.taxPerMin - cur.taxPerMin}c/m`,
    });
  }
  if (next.tradeCapacity > cur.tradeCapacity) {
    deltas.push({
      label: 'Trade Cap',
      current: `${cur.tradeCapacity}`,
      next: `${next.tradeCapacity}`,
      deltaText: `+${next.tradeCapacity - cur.tradeCapacity}`,
    });
  }
  if (next.maxWorkers > cur.maxWorkers) {
    deltas.push({
      label: 'Workers',
      current: `${cur.maxWorkers}`,
      next: `${next.maxWorkers}`,
      deltaText: `+${next.maxWorkers - cur.maxWorkers}`,
    });
  }
  if (next.powerDemand > cur.powerDemand) {
    deltas.push({
      label: 'Power Use',
      current: `${cur.powerDemand} MW`,
      next: `${next.powerDemand} MW`,
      deltaText: `+${next.powerDemand - cur.powerDemand} MW`,
    });
  }
  if (next.waterDemand > cur.waterDemand) {
    deltas.push({
      label: 'Water Use',
      current: `${cur.waterDemand} kL`,
      next: `${next.waterDemand} kL`,
      deltaText: `+${next.waterDemand - cur.waterDemand} kL`,
    });
  }
  if (next.upkeepPerMin > cur.upkeepPerMin) {
    deltas.push({
      label: 'Upkeep',
      current: `${cur.upkeepPerMin}c/m`,
      next: `${next.upkeepPerMin}c/m`,
      deltaText: `+${next.upkeepPerMin - cur.upkeepPerMin}c/m`,
    });
  }
  return deltas;
}

export function getLevelUpCatalog(
  state: WorldEngineState,
  producersFn?: (rid: ResourceId) => string[]
): LevelUpEntry[] {
  const cityNames = new Map<number, string>();
  for (const c of state.cities) cityNames.set(c.id, c.name);

  const entries: LevelUpEntry[] = [];
  for (const b of state.buildings) {
    const def = BUILDINGS[b.defId];
    if (!def) continue;

    const maxLevel = getEffectiveMaxLevel(def);
    const level = clampBuildingLevel(def, b.level);
    const curStats = getBuildingStatsAtLevel(def, level);
    const nextStats = level < maxLevel ? getBuildingStatsAtLevel(def, level + 1) : null;
    const cost =
      level < maxLevel
        ? BuildingCostCalculator.evaluateCost(
            BuildingCostCalculator.getUpgradeStepCost(def, level),
            state,
            producersFn
          )
        : null;
    const deltas = nextStats ? buildUpgradeDeltas(curStats, nextStats) : [];

    let status: LevelUpStatus;
    let statusReason: string;
    if (b.status === 'constructing') {
      status = 'requirements_unmet';
      statusReason = `Under construction (${Math.round(b.buildProgress * 100)}%)`;
    } else if (level >= maxLevel) {
      status = 'max_level';
      statusReason = `Max Level ${maxLevel} reached`;
    } else if (cost && cost.canAfford) {
      status = 'ready';
      statusReason = `Ready for Level ${level + 1}`;
    } else {
      status = 'waiting_resources';
      const missingParts: string[] = [];
      if (cost && cost.missingCoins > 0) missingParts.push(`${cost.missingCoins} Coins`);
      if (cost) {
        for (const m of cost.missingMaterials.slice(0, 3)) {
          missingParts.push(`${m.missing} ${m.name}`);
        }
      }
      statusReason =
        missingParts.length > 0 ? `Need ${missingParts.join(', ')}` : 'Insufficient resources';
    }

    entries.push({
      building: b,
      def,
      level,
      maxLevel,
      status,
      statusReason,
      cityName: cityNames.get(b.cityId ?? state.activeCityId) ?? state.settings.cityName,
      curStats,
      nextStats,
      deltas,
      cost,
    });
  }

  return entries;
}
