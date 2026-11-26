import { BUILDINGS, getBuildingFootprint } from '../data/buildings.data';
import type { ChunkManager } from '../core/ChunkManager';
import {
  BuildingInstance,
  TileFlag,
  TreePlantationState,
  WorldEngineState,
} from '../core/GameState';
import { localTileIndex } from '../core/IsoMath';
import {
  getPlantationLevelSpec,
  getPlantationTheoreticalHourlyWood,
  PLANTATION_LEVEL_SPECS,
  PLANTATION_TOTAL_SLOTS,
  type PlantationLevelSpec,
} from './BuildingSimulation';
import { DistrictServiceSystem } from './DistrictServiceSystem';
import type { ClimateModifiers } from './EnvironmentSystem';
import { ProductionSystem } from './ProductionSystem';
import { ResourceSystem } from './ResourceSystem';
import type { RoadNetworkSystem } from './RoadNetworkSystem';
import type { TechModifiers } from './TechSystem';
import type { WorkforceSystem } from './WorkforceSystem';

export type PlantationLevelConfig = PlantationLevelSpec;
export { PLANTATION_TOTAL_SLOTS };
export const PLANTATION_LEVELS: ReadonlyArray<PlantationLevelConfig> = PLANTATION_LEVEL_SPECS;

export interface PlantationGeometry {
  totalWidth: number;
  totalHeight: number;
  mainWidth: number;
  mainHeight: number;
  rotation: 0 | 1;
}

export class TreePlantationSystem {
  public static getLevelConfig(level: number): PlantationLevelConfig {
    return getPlantationLevelSpec(level);
  }

  /**
   * Returns theoretical steady-state Wood per in-game hour (12.5 real sec = 1 in-game hour)
   * directly derived from maxTrees, growSeconds, woodPerTree, and efficiency.
   */
  public static getTheoreticalHourlyWood(level: number): number {
    return getPlantationTheoreticalHourlyWood(level);
  }

  public static getGeometry(rotation: 0 | 1 = 0): PlantationGeometry {
    const rot: 0 | 1 = rotation === 1 ? 1 : 0;
    return rot === 0
      ? { totalWidth: 20, totalHeight: 50, mainWidth: 10, mainHeight: 20, rotation: 0 }
      : { totalWidth: 50, totalHeight: 20, mainWidth: 20, mainHeight: 10, rotation: 1 };
  }

  /**
   * Maps slot index [0..799] -> relative tile offset (dx, dy) strictly inside the
   * 20x50 (or 50x20) footprint excluding the 10x20 (or 20x10) main factory building.
   */
  public static getSlotCoords(
    b: Pick<BuildingInstance, 'gx' | 'gy' | 'rotation'>,
    slotIndex: number
  ): { gx: number; gy: number; dx: number; dy: number } {
    const geom = this.getGeometry(b.rotation === 1 ? 1 : 0);
    let count = 0;
    for (let dy = 0; dy < geom.totalHeight; dy++) {
      for (let dx = 0; dx < geom.totalWidth; dx++) {
        if (dx < geom.mainWidth && dy < geom.mainHeight) continue;
        if (count === slotIndex) {
          return { gx: b.gx + dx, gy: b.gy + dy, dx, dy };
        }
        count++;
      }
    }
    return { gx: b.gx, gy: b.gy, dx: 0, dy: 0 };
  }

  /**
   * Builds (and caches) a flat list of relative (dx, dy) pairs for all 800 plantation tiles.
   */
  private static readonly slotOffsetsRot0: Array<{ dx: number; dy: number }> = (() => {
    const list: Array<{ dx: number; dy: number }> = [];
    for (let dy = 0; dy < 50; dy++) {
      for (let dx = 0; dx < 20; dx++) {
        if (dx < 10 && dy < 20) continue;
        list.push({ dx, dy });
      }
    }
    return list;
  })();

  private static readonly slotOffsetsRot1: Array<{ dx: number; dy: number }> = (() => {
    const list: Array<{ dx: number; dy: number }> = [];
    for (let dy = 0; dy < 20; dy++) {
      for (let dx = 0; dx < 50; dx++) {
        if (dx < 20 && dy < 10) continue;
        list.push({ dx, dy });
      }
    }
    return list;
  })();

  public static getSlotOffsets(rotation: 0 | 1 = 0): ReadonlyArray<{ dx: number; dy: number }> {
    return rotation === 1 ? this.slotOffsetsRot1 : this.slotOffsetsRot0;
  }

  public static isMainBuildingTile(dx: number, dy: number, rotation: 0 | 1 = 0): boolean {
    const geom = this.getGeometry(rotation);
    return dx >= 0 && dx < geom.mainWidth && dy >= 0 && dy < geom.mainHeight;
  }

  public static ensurePlantationState(b: BuildingInstance, state: WorldEngineState): TreePlantationState {
    state.treePlantations ??= {};
    let ps = state.treePlantations[b.id];
    const cfg = this.getLevelConfig(b.level);
    if (!ps || !Array.isArray(ps.stages) || ps.stages.length !== PLANTATION_TOTAL_SLOTS) {
      ps = {
        buildingId: b.id,
        stages: new Array<number>(PLANTATION_TOTAL_SLOTS).fill(0),
        progress: new Array<number>(PLANTATION_TOTAL_SLOTS).fill(0),
        activeTrees: 0,
        saplingCount: 0,
        youngCount: 0,
        matureCount: 0,
        maxTreeCap: cfg.maxTrees,
        plantedTotal: 0,
        harvestedTotal: 0,
        woodProducedTotal: 0,
        lastAction: 'idle',
      };
      state.treePlantations[b.id] = ps;
    } else {
      if (!Array.isArray(ps.progress) || ps.progress.length !== PLANTATION_TOTAL_SLOTS) {
        ps.progress = new Array<number>(PLANTATION_TOTAL_SLOTS).fill(0);
      }
      ps.maxTreeCap = cfg.maxTrees;
    }
    return ps;
  }

  public static onDemolishBuilding(buildingId: number, state: WorldEngineState): void {
    if (state.treePlantations && buildingId in state.treePlantations) {
      delete state.treePlantations[buildingId];
    }
  }

  public static onMoveBuilding(
    b: BuildingInstance,
    state: WorldEngineState,
    chunks: ChunkManager
  ): void {
    const def = BUILDINGS[b.defId];
    if (!def?.isAutomatedTreePlantation) return;
    const ps = this.ensurePlantationState(b, state);
    const offsets = this.getSlotOffsets(b.rotation === 1 ? 1 : 0);
    // Validate each occupied slot is inside unlocked & owned footprint
    let saplingCount = 0;
    let youngCount = 0;
    let matureCount = 0;
    for (let i = 0; i < PLANTATION_TOTAL_SLOTS; i++) {
      if (ps.stages[i] === 0) continue;
      const off = offsets[i];
      const gx = b.gx + off.dx;
      const gy = b.gy + off.dy;
      const chunk = chunks.getLoadedChunkForGrid(gx, gy) ?? chunks.getTile(gx, gy).chunk;
      const idx = localTileIndex(gx, gy);
      const validSlot =
        (chunk.flags[idx] & TileFlag.Unlocked) !== 0 && chunk.buildingRef[idx] === b.id;
      if (!validSlot) {
        ps.stages[i] = 0;
        ps.progress[i] = 0;
        continue;
      }
      if (ps.stages[i] === 1) saplingCount++;
      else if (ps.stages[i] === 2) youngCount++;
      else if (ps.stages[i] >= 3) matureCount++;
    }
    ps.saplingCount = saplingCount;
    ps.youngCount = youngCount;
    ps.matureCount = matureCount;
    ps.activeTrees = saplingCount + youngCount + matureCount;
  }

  /**
   * Executes one 1-second simulation tick for a single Automated Tree Plantation Factory:
   * 1. Validates road, workers, power, and water (using shared systems).
   * 2. Grows every tree inside owned & unlocked 20x50 plantation slots (Sapling -> Young -> Mature).
   * 3. Automatically identifies & harvests mature trees, collecting Wood into city storage.
   * 4. Automatically replants empty slots up to the factory level's maxTrees cap.
   */
  public static tickPlantationFactory(
    b: BuildingInstance,
    state: WorldEngineState,
    chunks: ChunkManager,
    roadNet: RoadNetworkSystem,
    workforce: WorkforceSystem,
    techMods: TechModifiers,
    climate: ClimateModifiers
  ): { woodAdded: number } {
    const def = BUILDINGS[b.defId];
    if (!def?.isAutomatedTreePlantation) return { woodAdded: 0 };

    const ps = this.ensurePlantationState(b, state);
    const cfg = this.getLevelConfig(b.level);
    ps.maxTreeCap = cfg.maxTrees;

    const theoreticalHourly = this.getTheoreticalHourlyWood(b.level);
    b.theoreticalHourlyRate = theoreticalHourly;
    b.realizedOutputTotal ??= 0;

    if (!b.enabled) {
      b.status = 'disabled';
      b.actualHourlyRate = 0;
      b.productionBottleneck = 'Paused by player';
      ps.lastAction = 'idle';
      return { woodAdded: 0 };
    }

    if (def.requiresRoad) {
      const { connectedCluster, bestRoadTier } = roadNet.getCachedRoadAccess(b, chunks);
      if (connectedCluster === 0) {
        b.roadReason = 'No adjacent drivable road';
        b.status = 'no_road';
        b.actualHourlyRate = 0;
        b.productionBottleneck = 'Road: Connect a road along factory perimeter';
        ps.lastAction = 'blocked';
        return { woodAdded: 0 };
      }
      if (def.minRoadTier && bestRoadTier < def.minRoadTier) {
        b.roadReason = 'Adjacent road tier too low';
        b.status = 'no_road';
        b.actualHourlyRate = 0;
        b.productionBottleneck = 'Road: Upgrade adjacent road tier';
        ps.lastAction = 'blocked';
        return { woodAdded: 0 };
      }
      b.roadReason = 'Connected';
    }

    if (def.maxWorkers > 0 && b.assignedWorkers < def.minWorkers) {
      b.status = 'no_workers';
      b.actualHourlyRate = 0;
      b.productionBottleneck = `Workers ${b.assignedWorkers}/${def.minWorkers} min needed`;
      ps.lastAction = 'blocked';
      return { woodAdded: 0 };
    }

    if (def.powerDemand && (!b.powerConnected || (b.powerSatisfaction ?? 0) <= 0)) {
      b.status = 'no_power';
      b.actualHourlyRate = 0;
      b.productionBottleneck = 'Power: Connect building to power grid';
      ps.lastAction = 'blocked';
      return { woodAdded: 0 };
    }

    if (def.waterDemand && (!b.waterConnected || (b.waterSatisfaction ?? 0) <= 0)) {
      b.status = 'no_water';
      b.actualHourlyRate = 0;
      b.productionBottleneck = 'Water: Connect building to piped water';
      ps.lastAction = 'blocked';
      return { woodAdded: 0 };
    }

    const workerEff = workforce.getWorkerEfficiency(b, state, techMods.workerNeedReduction);
    if (workerEff <= 0) {
      b.status = 'no_workers';
      b.actualHourlyRate = 0;
      b.productionBottleneck = `Workers ${b.assignedWorkers}/${def.minWorkers} min needed`;
      ps.lastAction = 'blocked';
      return { woodAdded: 0 };
    }

    const roadMult = roadNet.getBuildingLogisticsMultiplier(b, state, chunks);
    const adjBonus = ProductionSystem.getBuildingAdjacencyBonus(b, state, chunks);
    const tileZoneId = chunks.getTileZone(b.gx, b.gy);
    const districtCov = DistrictServiceSystem.getBuildingCoverage(b, state, tileZoneId);
    const powerSat = def.powerDemand ? (b.powerSatisfaction ?? 0) : 1;
    const waterSat = def.waterDemand ? (b.waterSatisfaction ?? 0) : 1;

    const utilitySat = Math.min(powerSat, waterSat);
    let speedMult =
      workerEff *
      roadMult *
      techMods.prodSpeedMult *
      adjBonus.multiplier *
      districtCov.prodBonusMult *
      utilitySat;

    let yieldMult = cfg.efficiency;
    if (state.activePolicies?.includes('double_shift')) speedMult *= 1.25;
    if (state.activePolicies?.includes('timber_stewards')) {
      speedMult *= 1.5;
      yieldMult *= 1.35;
    }
    if (state.activePolicies?.includes('green_charter')) {
      speedMult *= 1.2;
    }
    if (state.activePolicies?.includes('artisan_stipend')) {
      yieldMult *= 1.15;
    }
    if (state.resources.tools >= 1) {
      speedMult *= 1.15;
      if (state.tick % 45 === 0 && b.id % 3 === 0) {
        state.resources.tools = Math.max(0, state.resources.tools - 0.5);
      }
    }
    // Gentle climate responsiveness without breaking plantation autonomy
    speedMult *= Math.max(0.7, Math.min(1.3, climate.farmMult));

    const offsets = this.getSlotOffsets(b.rotation === 1 ? 1 : 0);
    const progressStep = (100 / cfg.growSeconds) * speedMult;

    const woodCap = Math.max(1, state.capacities.wood ?? 500);
    const freeSpace = Math.max(0, woodCap - (state.resources.wood ?? 0));
    const storageFull = freeSpace <= 0.01;

    let harvestedThisTick = 0;
    let plantedThisTick = 0;
    let woodAddedThisTick = 0;

    const harvestBudget = Math.max(1, Math.round(cfg.harvestBatch * Math.max(0.5, speedMult)));
    const plantBudget = Math.max(1, Math.round(cfg.plantBatch * Math.max(0.5, speedMult)));

    // Pre-pass: ensure strict land boundary ownership & advance growth stages
    let activeTrees = 0;
    for (let i = 0; i < PLANTATION_TOTAL_SLOTS; i++) {
      const off = offsets[i];
      const gx = b.gx + off.dx;
      const gy = b.gy + off.dy;
      const chunk = chunks.getLoadedChunkForGrid(gx, gy) ?? chunks.getTile(gx, gy).chunk;
      const idx = localTileIndex(gx, gy);
      const ownedUnlocked =
        (chunk.flags[idx] & TileFlag.Unlocked) !== 0 && chunk.buildingRef[idx] === b.id;

      if (!ownedUnlocked) {
        ps.stages[i] = 0;
        ps.progress[i] = 0;
        continue;
      }

      const stage = ps.stages[i];
      if (stage > 0) {
        if (stage < 3) {
          const nextProg = Math.min(100, ps.progress[i] + progressStep);
          ps.progress[i] = nextProg;
          if (nextProg >= 100) {
            ps.stages[i] = 3;
          } else if (nextProg >= 45) {
            ps.stages[i] = 2;
          } else {
            ps.stages[i] = 1;
          }
        }
        activeTrees++;
      }
    }

    // Harvest mature trees (stage === 3) inside own plantation & immediately allow replant
    const harvestedSlots: number[] = [];
    if (!storageFull) {
      // Spread harvesting visually across grid using rotating cursor
      const startOffset = (state.tick * 17 + b.id * 31) % PLANTATION_TOTAL_SLOTS;
      for (let k = 0; k < PLANTATION_TOTAL_SLOTS && harvestedThisTick < harvestBudget; k++) {
        const i = (startOffset + k) % PLANTATION_TOTAL_SLOTS;
        if (ps.stages[i] < 3) continue;

        const rawWood = cfg.woodPerTree * yieldMult;
        if ((state.resources.wood ?? 0) >= woodCap) break;

        const added = ResourceSystem.addClamped(state, 'wood', rawWood);
        if (added <= 0) break;

        ps.stages[i] = 0;
        ps.progress[i] = 0;
        activeTrees = Math.max(0, activeTrees - 1);
        harvestedThisTick++;
        harvestedSlots.push(i);
        woodAddedThisTick += added;
      }
    }

    if (woodAddedThisTick > 0) {
      const roundedAdded = Number(woodAddedThisTick.toFixed(2));
      b.realizedOutputTotal = Number(((b.realizedOutputTotal ?? 0) + roundedAdded).toFixed(1));
      ps.harvestedTotal += harvestedThisTick;
      ps.woodProducedTotal = Number((ps.woodProducedTotal + roundedAdded).toFixed(1));
      state.stats.treesCut += harvestedThisTick;
      state.xp += Math.max(1, Math.round(harvestedThisTick * 0.5));
    }

    // Automatically replant harvested spaces first, then expand toward maxTreeCap
    for (let h = 0; h < harvestedSlots.length && activeTrees < cfg.maxTrees && plantedThisTick < plantBudget; h++) {
      const slot = harvestedSlots[h];
      const off = offsets[slot];
      const gx = b.gx + off.dx;
      const gy = b.gy + off.dy;
      const chunk = chunks.getLoadedChunkForGrid(gx, gy) ?? chunks.getTile(gx, gy).chunk;
      const idx = localTileIndex(gx, gy);
      if ((chunk.flags[idx] & TileFlag.Unlocked) !== 0 && chunk.buildingRef[idx] === b.id) {
        ps.stages[slot] = 1;
        ps.progress[slot] = 1;
        activeTrees++;
        plantedThisTick++;
      }
    }

    if (activeTrees < cfg.maxTrees && plantedThisTick < plantBudget) {
      // Fill available plantation spaces in an even spatial pattern across the 800-tile yard
      const stride = 29;
      let idxCursor = ((state.tick * 13 + b.id * 7) % PLANTATION_TOTAL_SLOTS);
      for (let k = 0; k < PLANTATION_TOTAL_SLOTS && activeTrees < cfg.maxTrees && plantedThisTick < plantBudget; k++) {
        const i = idxCursor;
        idxCursor = (idxCursor + stride) % PLANTATION_TOTAL_SLOTS;
        if (ps.stages[i] !== 0) continue;

        const off = offsets[i];
        const gx = b.gx + off.dx;
        const gy = b.gy + off.dy;
        const chunk = chunks.getLoadedChunkForGrid(gx, gy) ?? chunks.getTile(gx, gy).chunk;
        const idx = localTileIndex(gx, gy);
        if ((chunk.flags[idx] & TileFlag.Unlocked) === 0 || chunk.buildingRef[idx] !== b.id) {
          continue;
        }
        ps.stages[i] = 1;
        ps.progress[i] = 1;
        activeTrees++;
        plantedThisTick++;
      }
    }

    if (plantedThisTick > 0) {
      ps.plantedTotal += plantedThisTick;
    }

    // Recount stages cleanly
    let saplingCount = 0;
    let youngCount = 0;
    let matureCount = 0;
    for (let i = 0; i < PLANTATION_TOTAL_SLOTS; i++) {
      const s = ps.stages[i];
      if (s === 1) saplingCount++;
      else if (s === 2) youngCount++;
      else if (s >= 3) matureCount++;
    }
    ps.saplingCount = saplingCount;
    ps.youngCount = youngCount;
    ps.matureCount = matureCount;
    ps.activeTrees = saplingCount + youngCount + matureCount;

    if (storageFull && matureCount > 0) {
      b.status = 'storage_full';
      b.actualHourlyRate = 0;
      b.productionBottleneck = 'Warehouse storage full — expand Wood capacity';
      ps.lastAction = 'idle';
      return { woodAdded: woodAddedThisTick };
    }

    b.status = 'active';
    const expectedRealSecOutput =
      (cfg.maxTrees / cfg.growSeconds) * cfg.woodPerTree * yieldMult * speedMult;
    b.actualHourlyRate = Number((expectedRealSecOutput * 12.5).toFixed(1));
    b.prodProgress = Math.min(0.99, ps.activeTrees / Math.max(1, cfg.maxTrees));

    if (harvestedThisTick > 0) {
      ps.lastAction = 'harvesting';
      b.productionBottleneck = `Harvesting & replanting (${ps.activeTrees}/${cfg.maxTrees} plots active)`;
    } else if (plantedThisTick > 0) {
      ps.lastAction = 'planting';
      b.productionBottleneck = `Planting saplings (${ps.activeTrees}/${cfg.maxTrees} plots active)`;
    } else {
      ps.lastAction = 'growing';
      b.productionBottleneck = `Growing plantation (${saplingCount} saplings, ${youngCount} growing, ${matureCount} mature)`;
    }

    return { woodAdded: woodAddedThisTick };
  }

  public static getFootprintRef(): typeof getBuildingFootprint {
    return getBuildingFootprint;
  }
}
