import { BUILDINGS, getBuildingFootprint, getBuildingLevelMultiplier } from '../data/buildings.data';
import { RESOURCE_LIST, ResourceId } from '../data/resources.data';
import type { ChunkManager } from '../core/ChunkManager';
import { BiomeId, WorldEngineState } from '../core/GameState';
import { getBuildingStatsAtLevel } from './BuildingSimulation';
import type { ClimateModifiers } from './EnvironmentSystem';
import { ResourceSystem } from './ResourceSystem';
import type { RoadNetworkSystem } from './RoadNetworkSystem';
import type { TechModifiers } from './TechSystem';
import type { WorkforceSystem } from './WorkforceSystem';

import type { BuildingInstance } from '../core/GameState';
import { RESOURCES } from '../data/resources.data';
import { localTileIndex } from '../core/IsoMath';
import { DistrictServiceSystem } from './DistrictServiceSystem';
import { TreePlantationSystem } from './TreePlantationSystem';

function formatUtilityReason(prefix: 'Power' | 'Water', reason?: string): string {
  switch (reason) {
    case 'not_connected_to_network':
      return `${prefix}: Not connected to network`;
    case 'disconnected_section_no_source':
      return `${prefix}: Disconnected section has no generator/source`;
    case 'source_inactive':
      return `${prefix}: Generator/source inactive (missing workers or fuel)`;
    case 'distribution_overloaded':
      return `${prefix}: Distribution capacity overloaded`;
    case 'insufficient_supply':
      return `${prefix}: Insufficient network supply`;
    default:
      return `${prefix}: No ${prefix.toLowerCase()} supply`;
  }
}

export interface AdjacencyBonusInfo {
  multiplier: number;
  labels: string[];
}

export class ProductionSystem {
  private static adjCacheTick = -1;
  private static adjCacheBldCount = -1;
  private static cachedSupplyHubs: BuildingInstance[] = [];
  private static cachedResidentials: BuildingInstance[] = [];
  private static cachedScenics: BuildingInstance[] = [];

  private static ensureAdjacencyIndex(state: WorldEngineState): void {
    if (this.adjCacheTick === state.tick && this.adjCacheBldCount === state.buildings.length) {
      return;
    }
    this.adjCacheTick = state.tick;
    this.adjCacheBldCount = state.buildings.length;
    this.cachedSupplyHubs = [];
    this.cachedResidentials = [];
    this.cachedScenics = [];

    for (let i = 0; i < state.buildings.length; i++) {
      const other = state.buildings[i];
      if (other.status === 'constructing') continue;
      const oDef = BUILDINGS[other.defId];
      if (oDef?.category === 'storage' || other.defId === 'cart_depot') {
        this.cachedSupplyHubs.push(other);
      } else if (
        other.defId === 'village_park' ||
        other.defId === 'botanical_garden' ||
        other.defId === 'fountain_plaza' ||
        other.defId === 'festival_plaza'
      ) {
        this.cachedScenics.push(other);
      } else if (oDef?.category === 'residential') {
        this.cachedResidentials.push(other);
      }
    }
  }

  public static getBuildingAdjacencyBonus(
    b: BuildingInstance,
    state: WorldEngineState,
    chunks: ChunkManager
  ): AdjacencyBonusInfo {
    const def = BUILDINGS[b.defId];
    if (!def) return { multiplier: 1.0, labels: [] };

    let mult = 1.0;
    const labels: string[] = [];

    const fp = getBuildingFootprint(def, b.rotation ?? 0);
    if (def.category === 'agricultural') {
      let hasFertileOrRiver = false;
      for (let dx = -1; dx <= fp.width; dx++) {
        for (let dy = -1; dy <= fp.height; dy++) {
          const chunk = chunks.getLoadedChunkForGrid(b.gx + dx, b.gy + dy);
          if (!chunk) continue;
          const bio = chunk.biomeId[localTileIndex(b.gx + dx, b.gy + dy)] as BiomeId;
          if (bio === BiomeId.Fertile || bio === BiomeId.River) {
            hasFertileOrRiver = true;
            break;
          }
        }
        if (hasFertileOrRiver) break;
      }
      if (hasFertileOrRiver) {
        mult *= 1.25;
        labels.push('River / Fertile Irrigation +25%');
      }
    }

    this.ensureAdjacencyIndex(state);

    if (def.category === 'production' || def.category === 'industrial') {
      let nearSupply = false;
      for (let i = 0; i < this.cachedSupplyHubs.length; i++) {
        const other = this.cachedSupplyHubs[i];
        if (other.id !== b.id && Math.abs(other.gx - b.gx) <= 3 && Math.abs(other.gy - b.gy) <= 3) {
          nearSupply = true;
          break;
        }
      }
      if (nearSupply) {
        mult *= 1.15;
        labels.push('Logistics Hub Proximity +15%');
      }
    }

    if (def.category === 'commercial' || def.id === 'festival_plaza') {
      let nearHomes = false;
      for (let i = 0; i < this.cachedResidentials.length; i++) {
        const other = this.cachedResidentials[i];
        if (Math.abs(other.gx - b.gx) <= 3 && Math.abs(other.gy - b.gy) <= 3) {
          nearHomes = true;
          break;
        }
      }
      if (nearHomes) {
        mult *= 1.2;
        labels.push('Neighborhood Foot Traffic +20%');
      }
    }

    if (def.category === 'residential') {
      let nearScenic = false;
      for (let i = 0; i < this.cachedScenics.length; i++) {
        const other = this.cachedScenics[i];
        if (Math.abs(other.gx - b.gx) <= 3 && Math.abs(other.gy - b.gy) <= 3) {
          nearScenic = true;
          break;
        }
      }
      if (nearScenic) {
        mult *= 1.2;
        labels.push('Scenic Plaza Aura +20%');
      }
    }

    return { multiplier: mult, labels };
  }

  public tickProduction(
    state: WorldEngineState,
    chunks: ChunkManager,
    roadNet: RoadNetworkSystem,
    workforce: WorkforceSystem,
    techMods: TechModifiers,
    climate: ClimateModifiers
  ): void {
    ProductionSystem.ensureAdjacencyIndex(state);
    // 1. Track per-minute net estimate (power/water network state already evaluated by UtilityNetworkSystem)
    const tickDeltas: Partial<Record<ResourceId, number>> = {};
    for (const r of RESOURCE_LIST) tickDeltas[r.id] = 0;

    // 2. Building production & status resolution
    for (const b of state.buildings) {
      if (b.status === 'constructing') continue;
      const def = BUILDINGS[b.defId];
      if (!def) continue;

      if (def.isAutomatedTreePlantation) {
        const { woodAdded } = TreePlantationSystem.tickPlantationFactory(
          b,
          state,
          chunks,
          roadNet,
          workforce,
          techMods,
          climate
        );
        tickDeltas.wood = (tickDeltas.wood ?? 0) + woodAdded;
        continue;
      }

      const stats = getBuildingStatsAtLevel(def, b.level);
      const levelMult = stats.multiplier;
      const outputPerCycle = def.recipe
        ? Object.values(def.recipe.outputs).reduce((s, v) => s + (v ?? 0), 0)
        : 0;
      b.theoreticalHourlyRate = stats.totalHourlyOutput;
      b.realizedOutputTotal ??= 0;

      if (!b.enabled) {
        b.status = 'disabled';
        b.actualHourlyRate = 0;
        b.productionBottleneck = 'Paused by player';
        continue;
      }

      if (def.requiresRoad) {
        const { connectedCluster, bestRoadTier } = roadNet.getCachedRoadAccess(b, chunks);
        if (connectedCluster === 0) {
          b.roadReason = 'No adjacent drivable road';
          b.status = 'no_road';
          b.actualHourlyRate = 0;
          b.productionBottleneck = 'Road: No adjacent drivable road';
          continue;
        }
        if (def.minRoadTier && bestRoadTier < def.minRoadTier) {
          b.roadReason = 'Adjacent road tier too low for heavy freight';
          b.status = 'no_road';
          b.actualHourlyRate = 0;
          b.productionBottleneck = 'Road: Upgrade adjacent road tier';
          continue;
        }
        b.roadReason = 'Connected';
      } else {
        b.roadReason = 'Not required';
      }

      if (def.maxWorkers > 0 && b.assignedWorkers < def.minWorkers) {
        b.status = 'no_workers';
        b.actualHourlyRate = 0;
        b.productionBottleneck = `Workers ${b.assignedWorkers}/${def.minWorkers} min needed`;
        continue;
      }

      if (def.powerDemand && (!b.powerConnected || (b.powerSatisfaction ?? 0) <= 0)) {
        b.status = 'no_power';
        b.actualHourlyRate = 0;
        b.productionBottleneck = formatUtilityReason('Power', b.powerReason);
        continue;
      }

      const needsPipedWater = (def.waterDemand ?? 0) > 0;
      if (needsPipedWater && (!b.waterConnected || (b.waterSatisfaction ?? 0) <= 0)) {
        b.status = 'no_water';
        b.actualHourlyRate = 0;
        b.productionBottleneck = formatUtilityReason('Water', b.waterReason);
        continue;
      }

      if (!def.recipe) {
        b.status = 'active';
        b.actualHourlyRate = 0;
        b.productionBottleneck = 'Active';
        continue;
      }

      const fp = getBuildingFootprint(def, b.rotation ?? 0);
      if (def.requiredDeposit) {
        const remainingDeposit = chunks.getFootprintDepositTotal(
          b.gx,
          b.gy,
          fp.width,
          fp.height,
          def.requiredDeposit
        );
        if (remainingDeposit <= 0) {
          b.status = 'deposit_depleted';
          b.actualHourlyRate = 0;
          b.productionBottleneck = 'Local mineral deposit depleted';
          continue;
        }
      }

      const workerEff = workforce.getWorkerEfficiency(b, state, techMods.workerNeedReduction);
      if (workerEff <= 0) {
        b.status = 'no_workers';
        b.actualHourlyRate = 0;
        b.productionBottleneck = `Workers ${b.assignedWorkers}/${def.minWorkers} min needed`;
        continue;
      }

      const roadMult = roadNet.getBuildingLogisticsMultiplier(b, state, chunks);
      const adjBonus = ProductionSystem.getBuildingAdjacencyBonus(b, state, chunks);
      const tileZoneId = chunks.getTileZone(b.gx, b.gy);
      const districtCov = DistrictServiceSystem.getBuildingCoverage(b, state, tileZoneId);
      const powerSat = def.powerDemand ? (b.powerSatisfaction ?? 0) : 1;
      const waterSat = needsPipedWater ? (b.waterSatisfaction ?? 0) : 1;

      let catMult = techMods.prodSpeedMult * adjBonus.multiplier * districtCov.prodBonusMult;
      if (def.category === 'agricultural') {
        catMult *= techMods.farmYieldMult * climate.farmMult;
        if (state.activeEvent?.id === 'bountiful_harvest') catMult *= 1.35;
      } else if (def.requiredDeposit) {
        catMult *= techMods.mineYieldMult;
        if (state.activeEvent?.id === 'gold_rush') catMult *= 1.35;
      }

      if (state.activePolicies?.includes('double_shift') && (def.category === 'production' || def.category === 'industrial')) {
        catMult *= 1.25;
      }
      if (state.activePolicies?.includes('green_charter') && def.category === 'industrial') {
        catMult *= 0.9;
      }
      if (
        state.activePolicies?.includes('timber_stewards') &&
        b.defId === 'bamboo_grove'
      ) {
        catMult *= 1.35;
      }
      if (state.activePolicies?.includes('artisan_stipend') && def.category === 'production') {
        catMult *= 1.25;
      }

      // Tools bonus if any tools exist in inventory for production/industrial buildings
      let toolsMult = 1.0;
      if ((def.category === 'production' || def.category === 'industrial') && state.resources.tools >= 1) {
        toolsMult = 1.15;
        if (state.tick % 45 === 0 && b.id % 3 === 0) {
          state.resources.tools = Math.max(0, state.resources.tools - 0.5);
        }
      }

      const utilitySat = Math.min(powerSat, waterSat);

      const ratePerSec =
        (1 / def.recipe.cycleSeconds) *
        workerEff *
        levelMult *
        roadMult *
        catMult *
        toolsMult *
        utilitySat;

      b.prodProgress += ratePerSec;

      if (b.prodProgress >= 1.0) {
        const hasInputs = ResourceSystem.canAfford(state, 0, def.recipe.inputs);
        if (!hasInputs) {
          const missingList: string[] = [];
          for (const [k, v] of Object.entries(def.recipe.inputs)) {
            if (!v) continue;
            const have = Math.floor(state.resources[k as ResourceId] ?? 0);
            if (have < v) {
              missingList.push(`${RESOURCES[k as ResourceId]?.name ?? k} (${have}/${v})`);
            }
          }
          b.status = 'no_inputs';
          b.prodProgress = 0.99;
          b.actualHourlyRate = 0;
          b.productionBottleneck = `Missing inputs: ${missingList.join(', ')}`;
          continue;
        }

        const hasSpace =
          Object.keys(def.recipe.outputs).length === 0 ||
          ResourceSystem.hasSpaceForAll(state, def.recipe.outputs);
        if (!hasSpace) {
          b.status = 'storage_full';
          b.prodProgress = 0.99;
          b.actualHourlyRate = 0;
          b.productionBottleneck = 'Storage full — expand Granary or Warehouse capacity';
          continue;
        }

        // Atomic execute cycle & local deposit depletion
        if (def.requiredDeposit) {
          const depleted = chunks.depleteDepositInFootprint(
            b.gx,
            b.gy,
            fp.width,
            fp.height,
            def.requiredDeposit,
            1
          );
          if (!depleted) {
            b.status = 'deposit_depleted';
            b.prodProgress = 0.99;
            b.actualHourlyRate = 0;
            b.productionBottleneck = 'Local mineral deposit depleted';
            continue;
          }
        }
        ResourceSystem.consume(state, 0, def.recipe.inputs);
        let cycleOut = 0;
        for (const [k, v] of Object.entries(def.recipe.outputs)) {
          if (v) {
            const rid = k as ResourceId;
            const added = ResourceSystem.addClamped(state, rid, v);
            cycleOut += added;
            tickDeltas[rid] = (tickDeltas[rid] ?? 0) + v;
          }
        }
        b.realizedOutputTotal = (b.realizedOutputTotal ?? 0) + cycleOut;
        for (const [k, v] of Object.entries(def.recipe.inputs)) {
          if (v) {
            const rid = k as ResourceId;
            tickDeltas[rid] = (tickDeltas[rid] ?? 0) - v;
          }
        }
        state.xp += def.recipe.xpPerCycle;
        b.prodProgress -= 1.0;
        b.status = 'active';
      } else {
        b.status = 'active';
      }

      b.actualHourlyRate = Number((ratePerSec * 60 * outputPerCycle).toFixed(1));
      if (powerSat < 1 && waterSat < 1) {
        b.productionBottleneck =
          powerSat <= waterSat
            ? formatUtilityReason('Power', b.powerReason)
            : formatUtilityReason('Water', b.waterReason);
      } else if (powerSat < 1) {
        b.productionBottleneck = formatUtilityReason('Power', b.powerReason);
      } else if (waterSat < 1) {
        b.productionBottleneck = formatUtilityReason('Water', b.waterReason);
      } else {
        b.productionBottleneck = 'Operating smoothly';
      }
    }

    // Exponential moving average for UI per-minute rate estimates
    for (const r of RESOURCE_LIST) {
      const prev = state.netRatesPerMin[r.id] ?? 0;
      const instantPerMin = (tickDeltas[r.id] ?? 0) * 60;
      state.netRatesPerMin[r.id] = Number((prev * 0.92 + instantPerMin * 0.08).toFixed(1));
    }
  }
}
