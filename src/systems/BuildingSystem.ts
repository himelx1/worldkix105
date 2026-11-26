import {
  BUILDING_LIST,
  BuildingCategory,
  BuildingDef,
  BUILDINGS,
  getBuildingFootprint,
} from '../data/buildings.data';
import type { ZoneType } from '../core/GameState';
import { getBuildQueueCap } from '../data/levels.data';
import { RESOURCES, ResourceId } from '../data/resources.data';
import { ROADS, RoadType } from '../data/roads.data';
import { TECH_MAP } from '../data/techTree.data';
import {
  DEPOSIT_NAMES,
  DepositType,
  FeatureType,
  isMatureTreeFeature,
  TREE_SPECIES,
} from '../data/trees.data';
import type { ChunkManager } from '../core/ChunkManager';
import { BuildingInstance, RoadDirection, WorldEngineState, ZONE_ID_TO_TYPE } from '../core/GameState';
import { CHUNK_SIZE, gridToChunk } from '../core/IsoMath';
import {
  BuildingCostCalculator,
  BuildingLevelStats,
  clampBuildingLevel,
  getBuildingStatsAtLevel as simGetBuildingStatsAtLevel,
  getEffectiveMaxLevel,
} from './BuildingSimulation';
import { ResourceSystem } from './ResourceSystem';
import type { RoadNetworkSystem } from './RoadNetworkSystem';
import { TreeGrowthSystem } from './TreeGrowthSystem';
import { TreePlantationSystem } from './TreePlantationSystem';

export interface MaterialShortage {
  resourceId: ResourceId;
  name: string;
  have: number;
  need: number;
  missing: number;
  producers: string[];
}

export interface GlobalBuildRequirements {
  unlocked: boolean;
  readyToPlace: boolean;
  levelOk: boolean;
  techOk: boolean;
  missingTechName?: string;
  queueActive: number;
  queueCap: number;
  queueFull: boolean;
  coinsHave: number;
  coinsNeed: number;
  missingCoins: number;
  materials: MaterialShortage[];
  missingMaterials: MaterialShortage[];
  requiredDeposit?: DepositType;
  requiredDepositName?: string;
  requiresCoast: boolean;
  requiresRoad: boolean;
  minRoadTierName?: string;
  summaryReason?: string;
}

export interface PlacementValidation {
  valid: boolean;
  reason?: string;
  missingCoins?: number;
  missingMaterials?: MaterialShortage[];
  queueFull?: boolean;
  blockingObstacleTiles?: Array<{ gx: number; gy: number }>;
  requiresDeposit?: DepositType;
  requiresCoast?: boolean;
}

const NATURAL_SOURCES: Partial<Record<ResourceId, string[]>> = {
  wood: ['Chop Trees', 'Automated Tree Plantation Factory'],
  stone: ['Chop Stone Boulders', 'Stone Factory'],
  herbs: ['Chop Jungle Trees', 'Gatherer Hut', 'Spice Garden'],
  berries: ['Chop Fruit Trees', 'Gatherer Hut'],
  bamboo: ['Chop Wild Bamboo', 'Bamboo Grove'],
  clay: ['Clay Pit (on Clay Bed)'],
  sand: ['Sand Factory (on Sand Bank)'],
  iron_ore: ['Iron Mine (on Iron Vein)'],
  copper_ore: ['Copper Mine (on Copper Vein)'],
  coal: ['Coal Factory (on Coal Deposit)'],
  gold_ore: ['Gold Factory (on Gold Vein)'],
  silver_ore: ['Silver Factory (on Silver Vein)'],
  silver: ['Silver Refinery'],
};

const DEFAULT_ALLOWED_ZONES_BY_CATEGORY: Record<BuildingCategory, ZoneType[]> = {
  residential: ['residential', 'sez'],
  production: ['industrial', 'heavy_industrial', 'agricultural', 'forestry', 'mining', 'fishing', 'epz', 'sez'],
  agricultural: ['agricultural', 'fishing', 'forestry', 'sez'],
  industrial: ['industrial', 'heavy_industrial', 'epz', 'mining', 'forestry', 'tech_park', 'logistics', 'port', 'sez'],
  commercial: ['commercial', 'residential', 'financial', 'port', 'logistics', 'sez'],
  storage: ['industrial', 'heavy_industrial', 'agricultural', 'commercial', 'logistics', 'port', 'epz', 'mining', 'forestry', 'sez'],
  educational: ['residential', 'commercial', 'government', 'research', 'tech_park', 'sez'],
  healthcare: ['residential', 'commercial', 'government', 'sez'],
  government: ['government', 'commercial', 'residential', 'financial', 'sez'],
  recreational: ['residential', 'commercial', 'government', 'fishing', 'forestry', 'sez'],
  transportation: ['residential', 'commercial', 'industrial', 'heavy_industrial', 'agricultural', 'government', 'logistics', 'port', 'epz', 'mining', 'forestry', 'financial', 'tech_park', 'research', 'fishing', 'sez'],
  energy: ['industrial', 'heavy_industrial', 'commercial', 'residential', 'agricultural', 'government', 'mining', 'tech_park', 'logistics', 'port', 'epz', 'sez'],
  environmental: ['residential', 'commercial', 'industrial', 'heavy_industrial', 'agricultural', 'government', 'forestry', 'fishing', 'research', 'sez'],
};

function getAllowedZonesForDef(def: BuildingDef): ZoneType[] {
  return def.allowedZones && def.allowedZones.length > 0
    ? def.allowedZones
    : DEFAULT_ALLOWED_ZONES_BY_CATEGORY[def.category];
}

export class BuildingSystem {
  private static producerCache: Partial<Record<ResourceId, string[]>> | null = null;

  public static getResourceProducers(resourceId: ResourceId): string[] {
    if (!this.producerCache) {
      this.producerCache = {};
      for (const b of BUILDING_LIST) {
        if (!b.recipe?.outputs) continue;
        for (const outId of Object.keys(b.recipe.outputs) as ResourceId[]) {
          const list = (this.producerCache[outId] ??= []);
          if (!list.includes(b.name)) list.push(b.name);
        }
      }
    }
    const base = NATURAL_SOURCES[resourceId] ?? [];
    const crafted = this.producerCache[resourceId] ?? [];
    return Array.from(new Set([...base, ...crafted]));
  }

  public static getResourceConsumers(resourceId: ResourceId): string[] {
    const usedBy: string[] = [];
    for (const b of BUILDING_LIST) {
      if (b.materialCost[resourceId] || b.recipe?.inputs?.[resourceId]) {
        usedBy.push(b.name);
      }
    }
    return usedBy.slice(0, 6);
  }

  public static getGlobalBuildRequirements(
    defId: string,
    state: WorldEngineState,
    targetLevelOverride?: number
  ): GlobalBuildRequirements {
    const def = BUILDINGS[defId];
    if (!def) {
      return {
        unlocked: false,
        readyToPlace: false,
        levelOk: false,
        techOk: false,
        queueActive: 0,
        queueCap: 2,
        queueFull: false,
        coinsHave: Math.floor(state.coins),
        coinsNeed: 0,
        missingCoins: 0,
        materials: [],
        missingMaterials: [],
        requiresCoast: false,
        requiresRoad: false,
        summaryReason: 'Unknown building',
      };
    }

    const levelOk = state.level >= def.unlockLevel;
    const techOk = !def.requiredTech || state.unlockedTechIds.includes(def.requiredTech);
    const missingTechName = def.requiredTech
      ? TECH_MAP[def.requiredTech]?.name ?? def.requiredTech
      : undefined;

    const queueActive = state.buildings.filter((b) => b.status === 'constructing').length;
    const queueCap = getBuildQueueCap(state.level);
    const queueFull = queueActive >= queueCap;

    const resolvedLevel = clampBuildingLevel(
      def,
      targetLevelOverride ?? state.unlockedBuildingLevels?.[defId] ?? 1
    );
    const evaluated = BuildingCostCalculator.evaluateCost(
      BuildingCostCalculator.getCumulativeBuildCost(def, resolvedLevel),
      state,
      (rid) => this.getResourceProducers(rid)
    );
    const coinsHave = evaluated.coinsHave;
    const coinsNeed = evaluated.coinCost;
    const missingCoins = evaluated.missingCoins;
    const materials = evaluated.materials;
    const missingMaterials = evaluated.missingMaterials;
    const requiredDepositName = def.requiredDeposit
      ? DEPOSIT_NAMES[def.requiredDeposit]
      : undefined;
    const minRoadTierName = def.minRoadTier ? ROADS[def.minRoadTier as RoadType]?.name : undefined;

    let summaryReason: string | undefined;
    if (!levelOk) {
      summaryReason = `Unlocks at City Level ${def.unlockLevel}`;
    } else if (!techOk) {
      summaryReason = `Research "${missingTechName}" in Tech first`;
    } else if (queueFull) {
      summaryReason = `Build Queue Full (${queueActive}/${queueCap}) — wait or Rush a build`;
    } else if (missingCoins > 0 || missingMaterials.length > 0) {
      const parts: string[] = [];
      if (missingCoins > 0) parts.push(`${missingCoins} more Coins`);
      for (const m of missingMaterials) {
        parts.push(`${m.missing} ${m.name} (${m.have}/${m.need})`);
      }
      summaryReason = `Need ${parts.join(', ')}`;
    } else if (requiredDepositName) {
      summaryReason = `Place over a ${requiredDepositName} tile`;
    } else if (def.requiresCoast) {
      summaryReason = 'Place touching a River or Ocean tile';
    }

    return {
      unlocked: levelOk && techOk,
      readyToPlace:
        levelOk && techOk && !queueFull && missingCoins === 0 && missingMaterials.length === 0,
      levelOk,
      techOk,
      missingTechName,
      queueActive,
      queueCap,
      queueFull,
      coinsHave,
      coinsNeed,
      missingCoins,
      materials,
      missingMaterials,
      requiredDeposit: def.requiredDeposit,
      requiredDepositName,
      requiresCoast: Boolean(def.requiresCoast),
      requiresRoad: def.requiresRoad,
      minRoadTierName,
      summaryReason,
    };
  }

  public static getUpgradeCostAndMissing(
    b: BuildingInstance,
    state: WorldEngineState
  ): {
    coinCost: number;
    missingCoins: number;
    materials: MaterialShortage[];
    missingMaterials: MaterialShortage[];
    canAfford: boolean;
  } {
    const def = BUILDINGS[b.defId];
    if (!def) {
      return { coinCost: 0, missingCoins: 0, materials: [], missingMaterials: [], canAfford: false };
    }
    const evaluated = BuildingCostCalculator.evaluateCost(
      BuildingCostCalculator.getUpgradeStepCost(def, b.level),
      state,
      (rid) => this.getResourceProducers(rid)
    );
    return {
      coinCost: evaluated.coinCost,
      missingCoins: evaluated.missingCoins,
      materials: evaluated.materials,
      missingMaterials: evaluated.missingMaterials,
      canAfford: evaluated.canAfford,
    };
  }

  public static getBuildingStatsAtLevel(def: BuildingDef, level: number): BuildingLevelStats {
    return simGetBuildingStatsAtLevel(def, level);
  }

  public static getBuildingUpgradePreview(
    b: BuildingInstance,
    state: WorldEngineState
  ): {
    cur: BuildingLevelStats;
    next: BuildingLevelStats | null;
    cost: ReturnType<typeof BuildingSystem.getUpgradeCostAndMissing>;
  } | null {
    const def = BUILDINGS[b.defId];
    if (!def) return null;
    const maxLvl = getEffectiveMaxLevel(def);
    const cur = this.getBuildingStatsAtLevel(def, b.level);
    const next = b.level < maxLvl ? this.getBuildingStatsAtLevel(def, b.level + 1) : null;
    const cost = this.getUpgradeCostAndMissing(b, state);
    return { cur, next, cost };
  }

  /**
   * Checks whether `chunk.buildingRef[index]` belongs to an actual surviving building whose
   * footprint covers (tx, ty). If not, clears the orphaned ghost reference in place.
   */
  private static healStaleBuildingRefAt(
    tx: number,
    ty: number,
    state: WorldEngineState,
    chunks: ChunkManager
  ): number {
    const { cx, cy, index } = gridToChunk(tx, ty);
    const chunk = chunks.getLoadedChunk(cx, cy);
    if (!chunk) return -1;
    const refId = chunk.buildingRef[index];
    if (refId === -1) return -1;
    const owner = state.buildings.find((item) => item.id === refId);
    if (owner) {
      const def = BUILDINGS[owner.defId];
      if (def) {
        const fp = getBuildingFootprint(def, owner.rotation ?? 0);
        if (tx >= owner.gx && tx < owner.gx + fp.width && ty >= owner.gy && ty < owner.gy + fp.height) {
          return refId;
        }
      }
    }
    chunk.buildingRef[index] = -1;
    chunks.markChunkModified(cx, cy);
    return -1;
  }

  /**
   * Reconciles all loaded chunks' buildingRef grids against surviving `state.buildings`.
   * Scrubs orphaned ghost references (e.g. from legacy save migration or moved/demolished bugs)
   * and re-stamps valid building footprints.
   */
  public static reconcileBuildingRefs(state: WorldEngineState, chunks: ChunkManager): number {
    const expectedOwners = new Map<string, number>();
    for (const b of state.buildings) {
      const def = BUILDINGS[b.defId];
      if (!def) continue;
      const fp = getBuildingFootprint(def, b.rotation ?? 0);
      for (let dx = 0; dx < fp.width; dx++) {
        for (let dy = 0; dy < fp.height; dy++) {
          expectedOwners.set(`${b.gx + dx}:${b.gy + dy}`, b.id);
        }
      }
    }

    let healed = 0;
    for (const chunk of chunks.getAllLoadedChunks()) {
      const baseX = chunk.cx * CHUNK_SIZE;
      const baseY = chunk.cy * CHUNK_SIZE;
      let dirty = false;
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        const gy = baseY + ly;
        const rowOff = ly * CHUNK_SIZE;
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const idx = rowOff + lx;
          const ref = chunk.buildingRef[idx];
          if (ref === -1) continue;
          const gx = baseX + lx;
          if (expectedOwners.get(`${gx}:${gy}`) !== ref) {
            chunk.buildingRef[idx] = -1;
            dirty = true;
            healed++;
          }
        }
      }
      if (dirty) {
        chunks.markChunkModified(chunk.cx, chunk.cy);
      }
    }

    for (const b of state.buildings) {
      const def = BUILDINGS[b.defId];
      if (!def) continue;
      const fp = getBuildingFootprint(def, b.rotation ?? 0);
      for (let dx = 0; dx < fp.width; dx++) {
        for (let dy = 0; dy < fp.height; dy++) {
          const { cx, cy, index } = gridToChunk(b.gx + dx, b.gy + dy);
          const chunk = chunks.getOrCreateChunk(cx, cy);
          if (chunk.buildingRef[index] !== b.id) {
            chunk.buildingRef[index] = b.id;
            chunks.markChunkModified(cx, cy);
          }
        }
      }
    }

    return healed;
  }

  public validateBuildingPlacement(
    defId: string,
    gx: number,
    gy: number,
    state: WorldEngineState,
    chunks: ChunkManager,
    rotation: 0 | 1 = 0,
    targetLevelOverride?: number
  ): PlacementValidation {
    const def = BUILDINGS[defId];
    if (!def) return { valid: false, reason: 'Unknown building' };

    if (def.maxPerWorld !== undefined) {
      const existingCount = state.buildings.filter((b) => b.defId === defId).length;
      if (existingCount >= def.maxPerWorld) {
        return {
          valid: false,
          reason: `Only ${def.maxPerWorld} ${def.name} allowed in the world`,
        };
      }
    }

    const req = BuildingSystem.getGlobalBuildRequirements(defId, state, targetLevelOverride);
    if (!req.levelOk) {
      return { valid: false, reason: `Requires City Level ${def.unlockLevel} (currently Lv.${state.level})` };
    }
    if (!req.techOk) {
      return { valid: false, reason: `Research "${req.missingTechName}" in Tech first` };
    }
    if (req.queueFull) {
      return {
        valid: false,
        queueFull: true,
        reason: `Construction queue full (${req.queueActive}/${req.queueCap}) — wait or tap an active site to Rush`,
      };
    }

    const fp = getBuildingFootprint(def, rotation);
    let hasDeposit = false;
    let touchesWater = false;
    const blockingObstacles: Array<{ gx: number; gy: number }> = [];
    const anchorCityId = chunks.getTileCityId(gx, gy);

    for (let dx = 0; dx < fp.width; dx++) {
      for (let dy = 0; dy < fp.height; dy++) {
        const tx = gx + dx;
        const ty = gy + dy;
        if (!chunks.isUnlocked(tx, ty)) {
          return {
            valid: false,
            missingCoins: req.missingCoins,
            missingMaterials: req.missingMaterials,
            reason: `Tile (${tx}, ${ty}) is locked wilderness — unlock frontier land first`,
          };
        }
        const tileCityId = chunks.getTileCityId(tx, ty);
        if (anchorCityId > 0 && tileCityId > 0 && tileCityId !== anchorCityId) {
          return {
            valid: false,
            missingCoins: req.missingCoins,
            missingMaterials: req.missingMaterials,
            reason: `Footprint (${tx}, ${ty}) crosses a city border — keep buildings inside one city`,
          };
        }
        const zoneId = chunks.getTileZone(tx, ty);
        const zoneType = ZONE_ID_TO_TYPE[zoneId] ?? 'none';
        const allowedZones = getAllowedZonesForDef(def);
        if (zoneType !== 'none' && !allowedZones.includes(zoneType)) {
          return {
            valid: false,
            missingCoins: req.missingCoins,
            missingMaterials: req.missingMaterials,
            reason: `${def.name} is not permitted in a ${zoneType.toUpperCase()} zone`,
          };
        }
        const { chunk, index } = chunks.getTile(tx, ty);
        const biome = chunk.biomeId[index];
        if (chunks.isWaterBiome(biome)) {
          return {
            valid: false,
            missingCoins: req.missingCoins,
            missingMaterials: req.missingMaterials,
            reason: 'Cannot place foundation directly on River or Deep Water',
          };
        }
        if (BuildingSystem.healStaleBuildingRefAt(tx, ty, state, chunks) !== -1) {
          return {
            valid: false,
            missingCoins: req.missingCoins,
            missingMaterials: req.missingMaterials,
            reason: `Footprint (${tx}, ${ty}) overlaps another building — move or remove it first`,
          };
        }
        if (chunk.roadType[index] !== RoadType.None) {
          return {
            valid: false,
            missingCoins: req.missingCoins,
            missingMaterials: req.missingMaterials,
            reason: `Footprint (${tx}, ${ty}) has a road — remove road or choose adjacent plot`,
          };
        }
        if (chunk.featureType[index] !== FeatureType.None) {
          blockingObstacles.push({ gx: tx, gy: ty });
        }
        if (def.requiredDeposit && chunk.depositType[index] === def.requiredDeposit && chunk.depositQty[index] > 0) {
          hasDeposit = true;
        }
      }
    }

    if (blockingObstacles.length > 0) {
      return {
        valid: false,
        blockingObstacleTiles: blockingObstacles,
        missingCoins: req.missingCoins,
        missingMaterials: req.missingMaterials,
        reason: `${blockingObstacles.length} tree${blockingObstacles.length > 1 ? 's/boulders' : '/boulder'} blocking plot — tap "Clear Trees" or chop first`,
      };
    }

    if (def.requiredDeposit && !hasDeposit) {
      return {
        valid: false,
        requiresDeposit: def.requiredDeposit,
        missingCoins: req.missingCoins,
        missingMaterials: req.missingMaterials,
        reason: `No active ${req.requiredDepositName ?? 'mineral deposit'} under footprint — place over a sparkling vein`,
      };
    }

    if (def.requiresCoast) {
      outer: for (let dx = -1; dx <= fp.width; dx++) {
        for (let dy = -1; dy <= fp.height; dy++) {
          if (dx >= 0 && dx < fp.width && dy >= 0 && dy < fp.height) continue;
          const { chunk, index } = chunks.getTile(gx + dx, gy + dy);
          if (chunks.isWaterBiome(chunk.biomeId[index])) {
            touchesWater = true;
            break outer;
          }
        }
      }
      if (!touchesWater) {
        return {
          valid: false,
          requiresCoast: true,
          missingCoins: req.missingCoins,
          missingMaterials: req.missingMaterials,
          reason: 'Must sit directly beside a River or Ocean water tile',
        };
      }
    }

    if (req.missingCoins > 0 || req.missingMaterials.length > 0) {
      return {
        valid: false,
        missingCoins: req.missingCoins,
        missingMaterials: req.missingMaterials,
        reason: req.summaryReason,
      };
    }

    return { valid: true };
  }

  public placeBuilding(
    defId: string,
    gx: number,
    gy: number,
    state: WorldEngineState,
    chunks: ChunkManager,
    roadNet: RoadNetworkSystem,
    rotation: 0 | 1 = 0,
    targetLevelOverride?: number
  ): { ok: boolean; reason?: string; building?: BuildingInstance } {
    const check = this.validateBuildingPlacement(
      defId,
      gx,
      gy,
      state,
      chunks,
      rotation,
      targetLevelOverride
    );
    if (!check.valid) return { ok: false, reason: check.reason };

    const def = BUILDINGS[defId];
    const resolvedLevel = clampBuildingLevel(
      def,
      targetLevelOverride ?? state.unlockedBuildingLevels?.[defId] ?? 1
    );
    const buildCost = BuildingCostCalculator.getCumulativeBuildCost(def, resolvedLevel);

    if (!ResourceSystem.consume(state, buildCost.coinCost, buildCost.materialCost)) {
      const req = BuildingSystem.getGlobalBuildRequirements(defId, state, resolvedLevel);
      return { ok: false, reason: req.summaryReason ?? 'Insufficient Coins or materials' };
    }

    const fp = getBuildingFootprint(def, rotation);
    const ownerCityId = chunks.getTileCityId(gx, gy) || state.activeCityId || 1;
    let id = Math.max(1, Math.floor(state.nextBuildingId || 1));
    while (state.buildings.some((existing) => existing.id === id)) {
      id += 1;
    }
    state.nextBuildingId = id + 1;

    const building: BuildingInstance = {
      id,
      defId,
      gx,
      gy,
      rotation,
      cityId: ownerCityId,
      level: resolvedLevel,
      status: 'constructing',
      buildProgress: 0,
      prodProgress: 0,
      assignedWorkers: 0,
      lockedWorkers: null,
      enabled: true,
      connectedRoadCluster: 0,
    };

    for (let dx = 0; dx < fp.width; dx++) {
      for (let dy = 0; dy < fp.height; dy++) {
        const { cx, cy, index } = gridToChunk(gx + dx, gy + dy);
        const chunk = chunks.getOrCreateChunk(cx, cy);
        chunk.buildingRef[index] = id;
        chunks.markChunkModified(cx, cy);
      }
    }

    state.buildings.push(building);
    TreeGrowthSystem.removeFootprint(state, gx, gy, fp.width, fp.height);
    roadNet.evaluateBuildingRoadAccess(building, chunks);
    return { ok: true, building };
  }

  public getRushCost(b: BuildingInstance): number {
    const def = BUILDINGS[b.defId];
    if (!def || b.status !== 'constructing') return 0;
    const rem = Math.max(0.05, 1 - b.buildProgress);
    return Math.max(15, Math.round((25 + def.coinCost * 0.14) * rem));
  }

  public rushConstruction(
    buildingId: number,
    state: WorldEngineState
  ): { ok: boolean; reason?: string; xpGained: number; cost: number; building?: BuildingInstance } {
    const b = state.buildings.find((item) => item.id === buildingId);
    if (!b) return { ok: false, reason: 'Building not found', xpGained: 0, cost: 0 };
    if (b.status !== 'constructing') {
      return { ok: false, reason: 'Construction already finished', xpGained: 0, cost: 0 };
    }
    const def = BUILDINGS[b.defId];
    if (!def) return { ok: false, reason: 'Unknown building', xpGained: 0, cost: 0 };

    const cost = this.getRushCost(b);
    if (state.coins < cost) {
      return { ok: false, reason: `Need ${cost} Coins to Rush completion`, xpGained: 0, cost };
    }

    state.coins -= cost;
    b.buildProgress = 1;
    b.status = b.enabled ? 'active' : 'disabled';
    state.stats.buildingsBuilt += 1;
    ResourceSystem.recalculateCapacities(state);
    return { ok: true, xpGained: def.xpOnBuild, cost, building: b };
  }

  public placeRoad(
    roadType: RoadType,
    gx: number,
    gy: number,
    state: WorldEngineState,
    chunks: ChunkManager,
    roadNet: RoadNetworkSystem
  ): { ok: boolean; reason?: string; xpGained: number } {
    const def = ROADS[roadType];
    if (!def || roadType === RoadType.None) return { ok: false, reason: 'Invalid road', xpGained: 0 };
    if (state.level < def.unlockLevel) {
      return { ok: false, reason: `Requires Level ${def.unlockLevel}`, xpGained: 0 };
    }
    if (def.requiredTech && !state.unlockedTechIds.includes(def.requiredTech)) {
      return {
        ok: false,
        reason: `Requires technology: ${TECH_MAP[def.requiredTech]?.name ?? def.requiredTech}`,
        xpGained: 0,
      };
    }
    if (!chunks.isUnlocked(gx, gy)) {
      return { ok: false, reason: 'Unlock tile first before placing road', xpGained: 0 };
    }

    const { cx, cy, index } = gridToChunk(gx, gy);
    const chunk = chunks.getOrCreateChunk(cx, cy);
    const isWater = chunks.isWaterBiome(chunk.biomeId[index]);
    const canCrossWater = def.allowedOnWater;
    const waterOnlyBridge = roadType === RoadType.Bridge;
    if (isWater && !canCrossWater) {
      return { ok: false, reason: 'Select Bridge or Elevated/Underground Highway to cross River or Water', xpGained: 0 };
    }
    if (!isWater && waterOnlyBridge) {
      return { ok: false, reason: 'Timber Bridges can only be built over River or Water', xpGained: 0 };
    }
    if (BuildingSystem.healStaleBuildingRefAt(gx, gy, state, chunks) !== -1) {
      return { ok: false, reason: 'Tile has a building', xpGained: 0 };
    }
    if (chunk.featureType[index] !== FeatureType.None) {
      return { ok: false, reason: 'Chop trees or boulders on tile first', xpGained: 0 };
    }
    const existingRoad = chunk.roadType[index] as RoadType;
    if (existingRoad === roadType) {
      return { ok: false, reason: 'Road already placed here', xpGained: 0 };
    }
    if (existingRoad !== RoadType.None && roadType !== RoadType.Rail) {
      const prevDef = ROADS[existingRoad];
      const prevRank = prevDef?.tierRank ?? existingRoad;
      const nextRank = def.tierRank ?? roadType;
      if (prevDef && nextRank < prevRank) {
        return { ok: false, reason: 'Select a matching or higher road tier to upgrade', xpGained: 0 };
      }
    }

    const prevRefund = existingRoad !== RoadType.None ? Math.round((ROADS[existingRoad]?.coinCost ?? 0) * 0.5) : 0;
    const netCoinCost = Math.max(0, def.coinCost - prevRefund);

    if (!ResourceSystem.canAfford(state, netCoinCost, def.materialCost)) {
      const missing: string[] = [];
      if (state.coins < netCoinCost) {
        missing.push(`${netCoinCost - Math.floor(state.coins)} Coins`);
      }
      for (const [k, v] of Object.entries(def.materialCost)) {
        if (!v) continue;
        const have = Math.floor(state.resources[k as ResourceId] ?? 0);
        if (have < v) missing.push(`${v - have} ${RESOURCES[k as ResourceId]?.name ?? k}`);
      }
      return { ok: false, reason: `Need ${missing.join(', ')} for ${def.name}`, xpGained: 0 };
    }

    ResourceSystem.consume(state, netCoinCost, def.materialCost);

    chunk.roadType[index] = roadType;
    if (!chunk.roadDir) {
      chunk.roadDir = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    }
    chunks.markChunkModified(cx, cy);
    chunks.markRoadNeighborsRenderDirty(gx, gy);
    roadNet.markDirty();
    roadNet.recomputeIfDirty(chunks, state);
    if (existingRoad === RoadType.None) {
      state.stats.roadsBuilt += 1;
    }

    return { ok: true, xpGained: def.xpYield };
  }

  public upgradeBuilding(
    buildingId: number,
    state: WorldEngineState
  ): { ok: boolean; reason?: string; xpGained: number } {
    const b = state.buildings.find((item) => item.id === buildingId);
    if (!b) return { ok: false, reason: 'Building not found', xpGained: 0 };
    if (b.status === 'constructing') return { ok: false, reason: 'Wait for construction to finish', xpGained: 0 };
    const def = BUILDINGS[b.defId];
    if (!def) return { ok: false, reason: 'Invalid definition', xpGained: 0 };
    const maxLvl = getEffectiveMaxLevel(def);
    if (b.level >= maxLvl) return { ok: false, reason: 'Already max level', xpGained: 0 };

    const upg = BuildingSystem.getUpgradeCostAndMissing(b, state);
    if (!upg.canAfford) {
      const parts: string[] = [];
      if (upg.missingCoins > 0) parts.push(`${upg.missingCoins} Coins`);
      for (const m of upg.missingMaterials) {
        parts.push(`${m.missing} ${m.name} (${m.have}/${m.need})`);
      }
      return { ok: false, reason: `Upgrade needs ${parts.join(', ')}`, xpGained: 0 };
    }

    const matCost: Partial<Record<string, number>> = {};
    for (const m of upg.materials) matCost[m.resourceId] = m.need;

    if (!ResourceSystem.consume(state, upg.coinCost, matCost)) {
      return { ok: false, reason: 'Insufficient Coins or materials', xpGained: 0 };
    }

    b.level += 1;
    state.unlockedBuildingLevels ??= {};
    state.unlockedBuildingLevels[b.defId] = Math.min(
      maxLvl,
      Math.max(state.unlockedBuildingLevels[b.defId] ?? 1, b.level)
    );
    ResourceSystem.recalculateCapacities(state);
    return { ok: true, xpGained: 40 * b.level };
  }

  public validateBuildingMove(
    buildingId: number,
    newGx: number,
    newGy: number,
    state: WorldEngineState,
    chunks: ChunkManager,
    rotation?: 0 | 1
  ): PlacementValidation {
    const b = state.buildings.find((item) => item.id === buildingId);
    if (!b) return { valid: false, reason: 'Building not found' };
    const nextRot = rotation ?? b.rotation ?? 0;
    if (b.gx === newGx && b.gy === newGy && (b.rotation ?? 0) === nextRot) {
      return { valid: false, reason: 'Already at this location' };
    }
    const def = BUILDINGS[b.defId];
    if (!def) return { valid: false, reason: 'Unknown building' };

    const fp = getBuildingFootprint(def, nextRot);
    let hasDeposit = false;
    let touchesWater = false;
    const blockingObstacles: Array<{ gx: number; gy: number }> = [];
    const anchorCityId = chunks.getTileCityId(newGx, newGy);

    for (let dx = 0; dx < fp.width; dx++) {
      for (let dy = 0; dy < fp.height; dy++) {
        const tx = newGx + dx;
        const ty = newGy + dy;
        if (!chunks.isUnlocked(tx, ty)) {
          return { valid: false, reason: `Tile (${tx}, ${ty}) must be unlocked first` };
        }
        const tileCityId = chunks.getTileCityId(tx, ty);
        if (anchorCityId > 0 && tileCityId > 0 && tileCityId !== anchorCityId) {
          return { valid: false, reason: `Cannot move across a city border at (${tx}, ${ty})` };
        }
        const zoneId = chunks.getTileZone(tx, ty);
        const zoneType = ZONE_ID_TO_TYPE[zoneId] ?? 'none';
        const allowedZones = getAllowedZonesForDef(def);
        if (zoneType !== 'none' && !allowedZones.includes(zoneType)) {
          return { valid: false, reason: `${def.name} cannot sit in a ${zoneType.toUpperCase()} zone` };
        }
        const { chunk, index } = chunks.getTile(tx, ty);
        const biome = chunk.biomeId[index];
        if (chunks.isWaterBiome(biome)) {
          return { valid: false, reason: 'Cannot move onto River or Deep Water' };
        }
        const liveRef = BuildingSystem.healStaleBuildingRefAt(tx, ty, state, chunks);
        if (liveRef !== -1 && liveRef !== buildingId) {
          return { valid: false, reason: 'Footprint overlaps another building' };
        }
        if (chunk.roadType[index] !== RoadType.None) {
          return { valid: false, reason: 'Clear road on target plot first' };
        }
        if (chunk.featureType[index] !== FeatureType.None) {
          blockingObstacles.push({ gx: tx, gy: ty });
        }
        if (def.requiredDeposit && chunk.depositType[index] === def.requiredDeposit && chunk.depositQty[index] > 0) {
          hasDeposit = true;
        }
      }
    }

    if (blockingObstacles.length > 0) {
      return {
        valid: false,
        blockingObstacleTiles: blockingObstacles,
        reason: `${blockingObstacles.length} tree/boulder blocking plot — tap Clear Trees`,
      };
    }

    if (def.requiredDeposit && !hasDeposit) {
      const dName = def.requiredDeposit ? DEPOSIT_NAMES[def.requiredDeposit] : 'mineral deposit';
      return { valid: false, reason: `Must remain over an active ${dName}` };
    }

    if (def.requiresCoast) {
      outer: for (let dx = -1; dx <= fp.width; dx++) {
        for (let dy = -1; dy <= fp.height; dy++) {
          if (dx >= 0 && dx < fp.width && dy >= 0 && dy < fp.height) continue;
          const { chunk, index } = chunks.getTile(newGx + dx, newGy + dy);
          if (chunks.isWaterBiome(chunk.biomeId[index])) {
            touchesWater = true;
            break outer;
          }
        }
      }
      if (!touchesWater) {
        return { valid: false, reason: 'Must border a River or Ocean tile' };
      }
    }

    return { valid: true };
  }

  public moveBuilding(
    buildingId: number,
    newGx: number,
    newGy: number,
    state: WorldEngineState,
    chunks: ChunkManager,
    roadNet: RoadNetworkSystem,
    rotation?: 0 | 1
  ): { ok: boolean; reason?: string; building?: BuildingInstance } {
    const check = this.validateBuildingMove(buildingId, newGx, newGy, state, chunks, rotation);
    if (!check.valid) return { ok: false, reason: check.reason };

    const b = state.buildings.find((item) => item.id === buildingId);
    if (!b) return { ok: false, reason: 'Building not found' };
    const def = BUILDINGS[b.defId];
    if (!def) return { ok: false, reason: 'Invalid definition' };

    const prevFp = getBuildingFootprint(def, b.rotation ?? 0);
    for (let dx = 0; dx < prevFp.width; dx++) {
      for (let dy = 0; dy < prevFp.height; dy++) {
        const { cx, cy, index } = gridToChunk(b.gx + dx, b.gy + dy);
        const chunk = chunks.getOrCreateChunk(cx, cy);
        if (chunk.buildingRef[index] === b.id) {
          chunk.buildingRef[index] = -1;
          chunks.markChunkModified(cx, cy);
        }
      }
    }

    const nextRot = rotation ?? b.rotation ?? 0;
    const nextFp = getBuildingFootprint(def, nextRot);
    b.gx = newGx;
    b.gy = newGy;
    b.rotation = nextRot;
    b.cityId = chunks.getTileCityId(newGx, newGy) || b.cityId || state.activeCityId || 1;

    for (let dx = 0; dx < nextFp.width; dx++) {
      for (let dy = 0; dy < nextFp.height; dy++) {
        const { cx, cy, index } = gridToChunk(newGx + dx, newGy + dy);
        const chunk = chunks.getOrCreateChunk(cx, cy);
        chunk.buildingRef[index] = b.id;
        chunks.markChunkModified(cx, cy);
      }
    }

    roadNet.markDirty();
    roadNet.recomputeIfDirty(chunks, state);
    roadNet.evaluateBuildingRoadAccess(b, chunks);
    TreePlantationSystem.onMoveBuilding(b, state, chunks);
    state.stats.buildingsMoved = (state.stats.buildingsMoved ?? 0) + 1;
    return { ok: true, building: b };
  }

  public removeRoad(
    gx: number,
    gy: number,
    state: WorldEngineState,
    chunks: ChunkManager,
    roadNet: RoadNetworkSystem
  ): { ok: boolean; reason?: string; refundCoins: number } {
    if (!chunks.isUnlocked(gx, gy)) {
      return { ok: false, reason: 'Tile is locked', refundCoins: 0 };
    }
    const { cx, cy, index } = gridToChunk(gx, gy);
    const chunk = chunks.getOrCreateChunk(cx, cy);
    const existingRoad = chunk.roadType[index] as RoadType;
    if (existingRoad === RoadType.None) {
      return { ok: false, reason: 'No road on this tile', refundCoins: 0 };
    }
    if (BuildingSystem.healStaleBuildingRefAt(gx, gy, state, chunks) !== -1) {
      return { ok: false, reason: 'Tile has a building', refundCoins: 0 };
    }
    const prevDef = ROADS[existingRoad];
    const refundCoins = Math.round((prevDef?.coinCost ?? 0) * 0.5);
    chunk.roadType[index] = RoadType.None;
    if (chunk.roadDir) {
      chunk.roadDir[index] = RoadDirection.TwoWay;
    }
    chunks.markChunkModified(cx, cy);
    chunks.markRoadNeighborsRenderDirty(gx, gy);
    roadNet.markDirty();
    roadNet.recomputeIfDirty(chunks, state);
    if (refundCoins > 0) {
      state.coins += refundCoins;
    }
    return { ok: true, refundCoins };
  }

  public demolishBuilding(
    buildingId: number,
    state: WorldEngineState,
    chunks: ChunkManager
  ): boolean {
    const idx = state.buildings.findIndex((item) => item.id === buildingId);
    if (idx === -1) return false;
    const b = state.buildings[idx];
    const def = BUILDINGS[b.defId];

    if (def) {
      const fp = getBuildingFootprint(def, b.rotation ?? 0);
      for (let dx = 0; dx < fp.width; dx++) {
        for (let dy = 0; dy < fp.height; dy++) {
          const { cx, cy, index } = gridToChunk(b.gx + dx, b.gy + dy);
          const chunk = chunks.getOrCreateChunk(cx, cy);
          if (chunk.buildingRef[index] === b.id) {
            chunk.buildingRef[index] = -1;
            chunks.markChunkModified(cx, cy);
          }
        }
      }
      // 40% refund of invested construction & upgrade coin cost
      state.coins += BuildingCostCalculator.getDemolishRefundCoins(def, b.level);
    }

    state.buildings.splice(idx, 1);
    TreePlantationSystem.onDemolishBuilding(buildingId, state);
    ResourceSystem.recalculateCapacities(state);
    return true;
  }

  public tickConstruction(
    state: WorldEngineState,
    buildSpeedMult: number,
    weatherBuildMult: number,
    onComplete: (b: BuildingInstance, xp: number) => void
  ): void {
    for (const b of state.buildings) {
      if (b.status !== 'constructing') continue;
      const def = BUILDINGS[b.defId];
      if (!def) continue;

      const step = (1 / Math.max(1, def.buildTime)) * buildSpeedMult * weatherBuildMult;
      b.buildProgress = Math.min(1, b.buildProgress + step);
      if (b.buildProgress >= 1) {
        b.buildProgress = 1;
        b.status = b.enabled ? 'active' : 'disabled';
        state.stats.buildingsBuilt += 1;
        ResourceSystem.recalculateCapacities(state);
        onComplete(b, def.xpOnBuild);
      }
    }
  }

  public static previewConnectedRoadUpgrade(
    startGx: number,
    startGy: number,
    targetRoadType: RoadType,
    state: WorldEngineState,
    chunks: ChunkManager
  ): {
    valid: boolean;
    reason?: string;
    tiles: Array<{ gx: number; gy: number; fromRoad: RoadType }>;
    totalCoinCost: number;
    materialCost: Partial<Record<ResourceId, number>>;
  } {
    const def = ROADS[targetRoadType];
    if (
      !def ||
      targetRoadType === RoadType.None ||
      targetRoadType === RoadType.Rail ||
      targetRoadType === RoadType.Bridge
    ) {
      return { valid: false, reason: 'Select a drivable land road type for network upgrade', tiles: [], totalCoinCost: 0, materialCost: {} };
    }
    if (state.level < def.unlockLevel) {
      return { valid: false, reason: `${def.name} unlocks at Level ${def.unlockLevel}`, tiles: [], totalCoinCost: 0, materialCost: {} };
    }
    if (def.requiredTech && !state.unlockedTechIds.includes(def.requiredTech)) {
      return { valid: false, reason: `Research ${TECH_MAP[def.requiredTech]?.name ?? def.requiredTech} first`, tiles: [], totalCoinCost: 0, materialCost: {} };
    }

    const startTile = chunks.getTile(startGx, startGy);
    const startRoad = startTile.chunk.roadType[startTile.index] as RoadType;
    if (startRoad === RoadType.None || startRoad === RoadType.Rail) {
      return { valid: false, reason: 'Select an existing drivable road tile first', tiles: [], totalCoinCost: 0, materialCost: {} };
    }

    const visited = new Set<string>([`${startGx}:${startGy}`]);
    const queue: Array<[number, number]> = [[startGx, startGy]];
    const tiles: Array<{ gx: number; gy: number; fromRoad: RoadType }> = [];
    let totalCoinCost = 0;
    const materialCost: Partial<Record<ResourceId, number>> = {};
    const targetRank = def.tierRank ?? targetRoadType;

    while (queue.length > 0 && visited.size < 1800) {
      const [cx, cy] = queue.pop()!;
      const t = chunks.getTile(cx, cy);
      const rt = t.chunk.roadType[t.index] as RoadType;
      const isWater = chunks.isWaterBiome(t.chunk.biomeId[t.index]);

      if (rt !== RoadType.None && rt !== RoadType.Rail) {
        if (rt !== targetRoadType && (!isWater || def.allowedOnWater)) {
          const prevDef = ROADS[rt];
          const prevRank = prevDef?.tierRank ?? rt;
          if (targetRank >= prevRank) {
            tiles.push({ gx: cx, gy: cy, fromRoad: rt });
            const refund = Math.round((prevDef?.coinCost ?? 0) * 0.5);
            totalCoinCost += Math.max(0, def.coinCost - refund);
            for (const [k, v] of Object.entries(def.materialCost)) {
              if (!v) continue;
              const rid = k as ResourceId;
              materialCost[rid] = (materialCost[rid] ?? 0) + v;
            }
          }
        }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx;
          const ny = cy + dy;
          const key = `${nx}:${ny}`;
          if (visited.has(key)) continue;
          const nb = chunks.getTile(nx, ny);
          const nrt = nb.chunk.roadType[nb.index] as RoadType;
          if (nrt !== RoadType.None && nrt !== RoadType.Rail) {
            visited.add(key);
            queue.push([nx, ny]);
          }
        }
      }
    }

    if (tiles.length === 0) {
      return { valid: false, reason: `All connected road tiles are already ${def.name} or higher`, tiles: [], totalCoinCost: 0, materialCost: {} };
    }

    return { valid: true, tiles, totalCoinCost, materialCost };
  }

  public upgradeConnectedRoadNetwork(
    startGx: number,
    startGy: number,
    targetRoadType: RoadType,
    state: WorldEngineState,
    chunks: ChunkManager,
    roadNet: RoadNetworkSystem
  ): { ok: boolean; reason?: string; count: number; xpGained: number } {
    const preview = BuildingSystem.previewConnectedRoadUpgrade(startGx, startGy, targetRoadType, state, chunks);
    if (!preview.valid) return { ok: false, reason: preview.reason, count: 0, xpGained: 0 };

    if (!ResourceSystem.canAfford(state, preview.totalCoinCost, preview.materialCost)) {
      return {
        ok: false,
        reason: `Needs ${preview.totalCoinCost} Coins and materials to upgrade ${preview.tiles.length} road tiles`,
        count: 0,
        xpGained: 0,
      };
    }

    ResourceSystem.consume(state, preview.totalCoinCost, preview.materialCost);
    const def = ROADS[targetRoadType];
    for (const t of preview.tiles) {
      const { cx, cy, index } = gridToChunk(t.gx, t.gy);
      const chunk = chunks.getOrCreateChunk(cx, cy);
      chunk.roadType[index] = targetRoadType;
      chunks.markChunkModified(cx, cy);
      chunks.markRoadNeighborsRenderDirty(t.gx, t.gy);
    }
    roadNet.markDirty();
    roadNet.recomputeIfDirty(chunks, state);

    const xpGained = preview.tiles.length * Math.max(1, def.xpYield);
    return { ok: true, count: preview.tiles.length, xpGained };
  }

  public static previewRoadGrid(
    startGx: number,
    startGy: number,
    width: number,
    height: number,
    spacing: number,
    roadType: RoadType,
    state: WorldEngineState,
    chunks: ChunkManager
  ): {
    valid: boolean;
    reason?: string;
    tiles: Array<{ gx: number; gy: number }>;
    skippedCount: number;
    totalCoinCost: number;
    materialCost: Partial<Record<ResourceId, number>>;
  } {
    const def = ROADS[roadType];
    if (!def || roadType === RoadType.None) {
      return { valid: false, reason: 'Invalid road type', tiles: [], skippedCount: 0, totalCoinCost: 0, materialCost: {} };
    }
    if (state.level < def.unlockLevel) {
      return { valid: false, reason: `${def.name} unlocks at Level ${def.unlockLevel}`, tiles: [], skippedCount: 0, totalCoinCost: 0, materialCost: {} };
    }
    if (def.requiredTech && !state.unlockedTechIds.includes(def.requiredTech)) {
      return { valid: false, reason: `Research ${TECH_MAP[def.requiredTech]?.name ?? def.requiredTech} first`, tiles: [], skippedCount: 0, totalCoinCost: 0, materialCost: {} };
    }

    const sx = Math.floor(startGx);
    const sy = Math.floor(startGy);
    const w = Math.max(3, Math.min(48, Math.floor(width)));
    const h = Math.max(3, Math.min(48, Math.floor(height)));
    const step = Math.max(2, Math.min(16, Math.floor(spacing)));

    const tiles: Array<{ gx: number; gy: number }> = [];
    let skippedCount = 0;
    let totalCoinCost = 0;
    const materialCost: Partial<Record<ResourceId, number>> = {};

    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const isEdge = dx === 0 || dy === 0 || dx === w - 1 || dy === h - 1;
        const isGridLine = dx % step === 0 || dy % step === 0;
        if (!isEdge && !isGridLine) continue;

        const tx = sx + dx;
        const ty = sy + dy;
        if (!chunks.isUnlocked(tx, ty)) {
          skippedCount++;
          continue;
        }
        const { chunk, index } = chunks.getTile(tx, ty);
        const isWater = chunks.isWaterBiome(chunk.biomeId[index]);
        if (chunk.buildingRef[index] !== -1 || chunk.featureType[index] !== FeatureType.None) {
          skippedCount++;
          continue;
        }
        if ((chunk.biomeId[index] as number) === 9 && roadType !== RoadType.UndergroundRoad && roadType !== RoadType.ElevatedHighway) {
          skippedCount++;
          continue;
        }
        if (isWater && !def.allowedOnWater) {
          skippedCount++;
          continue;
        }
        if (!isWater && roadType === RoadType.Bridge) {
          skippedCount++;
          continue;
        }
        const existing = chunk.roadType[index] as RoadType;
        if (existing === roadType) continue;
        if (existing !== RoadType.None && (ROADS[existing]?.tierRank ?? existing) > (def.tierRank ?? roadType)) {
          skippedCount++;
          continue;
        }

        tiles.push({ gx: tx, gy: ty });
        const refund = existing !== RoadType.None ? Math.round((ROADS[existing]?.coinCost ?? 0) * 0.5) : 0;
        totalCoinCost += Math.max(0, def.coinCost - refund);
        for (const [k, v] of Object.entries(def.materialCost)) {
          if (!v) continue;
          const rid = k as ResourceId;
          materialCost[rid] = (materialCost[rid] ?? 0) + v;
        }
      }
    }

    if (tiles.length === 0) {
      return {
        valid: false,
        reason: 'No buildable unlocked road tiles in this grid (check land unlock or clear trees/buildings)',
        tiles: [],
        skippedCount,
        totalCoinCost: 0,
        materialCost: {},
      };
    }

    return { valid: true, tiles, skippedCount, totalCoinCost, materialCost };
  }

  public buildRoadGrid(
    startGx: number,
    startGy: number,
    width: number,
    height: number,
    spacing: number,
    roadType: RoadType,
    state: WorldEngineState,
    chunks: ChunkManager,
    roadNet: RoadNetworkSystem
  ): { ok: boolean; reason?: string; count: number; xpGained: number } {
    const preview = BuildingSystem.previewRoadGrid(startGx, startGy, width, height, spacing, roadType, state, chunks);
    if (!preview.valid) return { ok: false, reason: preview.reason, count: 0, xpGained: 0 };

    if (!ResourceSystem.canAfford(state, preview.totalCoinCost, preview.materialCost)) {
      return {
        ok: false,
        reason: `Needs ${preview.totalCoinCost} Coins and materials to build ${preview.tiles.length} road tiles`,
        count: 0,
        xpGained: 0,
      };
    }

    ResourceSystem.consume(state, preview.totalCoinCost, preview.materialCost);
    const def = ROADS[roadType];
    for (const t of preview.tiles) {
      const { cx, cy, index } = gridToChunk(t.gx, t.gy);
      const chunk = chunks.getOrCreateChunk(cx, cy);
      if (chunk.roadType[index] === RoadType.None) {
        state.stats.roadsBuilt += 1;
      }
      chunk.roadType[index] = roadType;
      chunks.markChunkModified(cx, cy);
      chunks.markRoadNeighborsRenderDirty(t.gx, t.gy);
    }

    roadNet.markDirty();
    roadNet.recomputeIfDirty(chunks, state);
    const xpGained = preview.tiles.length * Math.max(1, def.xpYield);
    return { ok: true, count: preview.tiles.length, xpGained };
  }

  public static chopTile(
    gx: number,
    gy: number,
    damage: number,
    chunks: ChunkManager,
    state: WorldEngineState,
    opts?: { allowImmature?: boolean }
  ): { hit: boolean; cleared: boolean; woodGained: number; bonusName?: string; bonusAmount?: number; coinsGained: number; xpGained: number } {
    if (!chunks.isUnlocked(gx, gy)) {
      return { hit: false, cleared: false, woodGained: 0, coinsGained: 0, xpGained: 0 };
    }
    const { cx, cy, index } = gridToChunk(gx, gy);
    const chunk = chunks.getOrCreateChunk(cx, cy);
    const ft = chunk.featureType[index] as FeatureType;
    if (ft === FeatureType.None) {
      return { hit: false, cleared: false, woodGained: 0, coinsGained: 0, xpGained: 0 };
    }
    if (
      opts?.allowImmature === false &&
      (ft === FeatureType.Sapling || ft === FeatureType.MediumTree) &&
      !isMatureTreeFeature(ft)
    ) {
      return { hit: false, cleared: false, woodGained: 0, coinsGained: 0, xpGained: 0 };
    }
    const species = TREE_SPECIES[ft];
    if (!species) {
      return { hit: false, cleared: false, woodGained: 0, coinsGained: 0, xpGained: 0 };
    }
    const nextHp = Math.max(0, chunk.featureHp[index] - Math.round(damage));
    chunk.featureHp[index] = nextHp;
    chunks.markChunkModified(cx, cy);
    if (nextHp > 0) {
      return { hit: true, cleared: false, woodGained: 0, coinsGained: 0, xpGained: 0 };
    }
    chunk.featureType[index] = FeatureType.None;
    chunk.featureHp[index] = 0;
    TreeGrowthSystem.removeAt(state, gx, gy);

    let woodGained = 0;
    const timberBoost = state.activePolicies?.includes('timber_stewards') ? 1.35 : 1.0;
    if (species.woodYield > 0) {
      const yieldAmt = Math.round(species.woodYield * timberBoost);
      woodGained = ResourceSystem.addClamped(state, 'wood', yieldAmt);
    }
    let bonusName: string | undefined;
    let bonusAmount = 0;
    if (species.bonusResource && species.bonusAmount) {
      const roll = ((gx * 73856093) ^ (gy * 19349663) ^ state.tick) & 255;
      if (roll / 255 <= (species.bonusChance ?? 1)) {
        bonusAmount = ResourceSystem.addClamped(state, species.bonusResource, species.bonusAmount);
        bonusName = species.bonusResource;
      }
    }
    state.coins += species.coinYield;
    state.stats.totalCoinsEarned += species.coinYield;
    state.stats.treesCut += 1;
    return {
      hit: true,
      cleared: true,
      woodGained,
      bonusName,
      bonusAmount,
      coinsGained: species.coinYield,
      xpGained: species.xpYield,
    };
  }

  public static exploreRuin(
    gx: number,
    gy: number,
    chunks: ChunkManager,
    state: WorldEngineState
  ): { ok: boolean; reason?: string; coins: number; rp: number; stone: number; wood: number; xp: number } {
    if (!chunks.isUnlocked(gx, gy)) {
      return { ok: false, reason: 'Unlock this tile first', coins: 0, rp: 0, stone: 0, wood: 0, xp: 0 };
    }
    const { cx, cy, index } = gridToChunk(gx, gy);
    const chunk = chunks.getOrCreateChunk(cx, cy);
    if (chunk.featureType[index] !== FeatureType.AncientRuin) {
      return { ok: false, reason: 'No Ancient Ruin on this tile', coins: 0, rp: 0, stone: 0, wood: 0, xp: 0 };
    }
    chunk.featureType[index] = FeatureType.None;
    chunk.featureHp[index] = 0;
    chunks.markChunkModified(cx, cy);
    const coins = 140;
    const rp = 12;
    const stone = ResourceSystem.addClamped(state, 'stone', 10);
    const wood = ResourceSystem.addClamped(state, 'wood', 6);
    state.coins += coins;
    state.stats.totalCoinsEarned += coins;
    state.researchPoints += rp;
    state.stats.ruinsExplored += 1;
    return { ok: true, coins, rp, stone, wood, xp: 45 };
  }

  public static replantTile(
    gx: number,
    gy: number,
    chunks: ChunkManager,
    state?: WorldEngineState
  ): boolean {
    if (!chunks.isUnlocked(gx, gy)) return false;
    const { cx, cy, index } = gridToChunk(gx, gy);
    const chunk = chunks.getOrCreateChunk(cx, cy);
    if (chunks.isWaterBiome(chunk.biomeId[index])) return false;
    if (chunk.featureType[index] !== FeatureType.None) return false;
    if (chunk.buildingRef[index] !== -1 || chunk.roadType[index] !== 0) return false;
    chunk.featureType[index] = FeatureType.Sapling;
    chunk.featureHp[index] = TREE_SPECIES[FeatureType.Sapling]?.maxHp ?? 15;
    chunks.markChunkModified(cx, cy);
    if (state) {
      TreeGrowthSystem.registerSapling(state, chunks, gx, gy);
    }
    return true;
  }
}
