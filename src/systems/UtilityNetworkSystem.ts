import { BUILDINGS, getBuildingFootprint } from '../data/buildings.data';
import type { ChunkManager } from '../core/ChunkManager';
import {
  BuildingInstance,
  TileFlag,
  UtilityFlag,
  UtilityGridSummary,
  WorldEngineState,
} from '../core/GameState';
import { CHUNK_SIZE, tileKey, unpackTileX, unpackTileY } from '../core/IsoMath';
import { RoadType } from '../data/roads.data';
import { getBuildingStatsAtLevel } from './BuildingSimulation';
import type { ClimateModifiers } from './EnvironmentSystem';

export type UtilityPlacementKind = 'power_line' | 'substation' | 'water_pipe' | 'water_pump';

const DIRS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export const UTILITY_COSTS: Record<UtilityPlacementKind, number> = {
  power_line: 8,
  substation: 45,
  water_pipe: 8,
  water_pump: 45,
};

export interface UtilityNetworkSnapshot {
  powerTiles: Set<number>;
  waterTiles: Set<number>;
  powerTileNet: Map<number, number>;
  waterTileNet: Map<number, number>;
  powerOverloadedNets: Set<number>;
  waterOverloadedNets: Set<number>;
  substationCenters: Array<{ gx: number; gy: number }>;
  pumpCenters: Array<{ gx: number; gy: number }>;
}

/**
 * Pure continuous road & utility-line component network evaluator:
 * - Any two buildings on the same continuous conductor component (connected drivable roads,
 *   power lines/substations for electricity; connected drivable roads, water pipes/pumps for water)
 *   share that utility network regardless of distance, road length, turns, orientation, or road side.
 * - Separate, disconnected road/conductor sections are strictly isolated from one another.
 * - No distance limits, no artificial conductor distCap bottlenecks, and no radial air-leaps.
 * - Electricity evaluates before water so power-dependent water facilities scale with electricity supply.
 * - Shortages distribute available supply proportionally across connected consumers so delivered <= available.
 */
export class UtilityNetworkSystem {
  private static lastSnapshot: UtilityNetworkSnapshot | null = null;
  private static dirty = true;
  private static lastEvalSignature = '';
  private static evalVersion = 1;

  public static markDirty(): void {
    this.dirty = true;
  }

  public static getEvalVersion(): number {
    return this.evalVersion;
  }

  public static getLastSnapshot(): UtilityNetworkSnapshot | null {
    return this.lastSnapshot;
  }

  public static placeUtility(
    kind: UtilityPlacementKind,
    gx: number,
    gy: number,
    state: WorldEngineState,
    chunks: ChunkManager
  ): { ok: boolean; reason?: string } {
    if (!chunks.isUnlocked(gx, gy)) {
      return { ok: false, reason: 'Unlock tile before installing utilities' };
    }
    const cost = UTILITY_COSTS[kind];
    if (state.coins < cost) {
      return { ok: false, reason: `Needs ${cost} Coins` };
    }
    const flag =
      kind === 'power_line'
        ? UtilityFlag.PowerLine
        : kind === 'substation'
          ? UtilityFlag.PowerLine | UtilityFlag.PowerSubstation
          : kind === 'water_pipe'
            ? UtilityFlag.WaterPipe
            : UtilityFlag.WaterPipe | UtilityFlag.WaterPump;

    const existing = chunks.getTileUtility(gx, gy);
    if ((existing & flag) === flag) {
      return { ok: false, reason: 'Already installed on this tile' };
    }

    state.coins -= cost;
    chunks.setTileUtilityFlag(gx, gy, flag, true);
    this.dirty = true;
    return { ok: true };
  }

  public static removeUtility(
    kind: 'power' | 'water',
    gx: number,
    gy: number,
    state: WorldEngineState,
    chunks: ChunkManager
  ): { ok: boolean; reason?: string } {
    if (!chunks.isUnlocked(gx, gy)) {
      return { ok: false, reason: 'Tile is locked' };
    }
    const mask =
      kind === 'power'
        ? UtilityFlag.PowerLine | UtilityFlag.PowerSubstation
        : UtilityFlag.WaterPipe | UtilityFlag.WaterPump;
    const existing = chunks.getTileUtility(gx, gy);
    if ((existing & mask) === 0) {
      return { ok: false, reason: `No ${kind} utility on this tile` };
    }
    chunks.setTileUtilityFlag(gx, gy, mask, false);
    state.coins += 4;
    this.dirty = true;
    return { ok: true };
  }

  private static computeEvalSignature(state: WorldEngineState, climate: ClimateModifiers): string {
    let bldHash = state.buildings.length;
    for (let i = 0; i < state.buildings.length; i++) {
      const b = state.buildings[i];
      const constructing = b.status === 'constructing' ? 1 : 0;
      const enabled = b.enabled ? 2 : 0;
      bldHash =
        (Math.imul(bldHash, 31) +
          (b.id ^
            (b.gx << 3) ^
            (b.gy << 7) ^
            (b.level << 11) ^
            (b.assignedWorkers << 16) ^
            constructing ^
            enabled)) |
        0;
    }
    const coalOk = state.resources.coal >= 1 ? 1 : 0;
    const ecoWater = state.activePolicies?.includes('eco_water_pact') ? 1 : 0;
    return `${bldHash}|${coalOk}|${ecoWater}|${climate.windPowerMult.toFixed(2)}|${climate.solarPowerMult.toFixed(2)}|${climate.waterDemandMult.toFixed(2)}`;
  }

  /**
   * Partitions a set of conductor tile keys into strict 4-neighbor orthogonal connected components.
   */
  private static buildConnectedComponents(
    tiles: ReadonlySet<number>
  ): {
    tileToComp: Map<number, number>;
    compTileCount: Map<number, number>;
  } {
    const tileToComp = new Map<number, number>();
    const compTileCount = new Map<number, number>();
    let nextCompId = 1;

    for (const startKey of tiles) {
      if (tileToComp.has(startKey)) continue;
      const compId = nextCompId++;
      tileToComp.set(startKey, compId);
      const queue: number[] = [startKey];
      let count = 0;

      while (queue.length > 0) {
        const ck = queue.pop()!;
        count++;
        const cx = unpackTileX(ck);
        const cy = unpackTileY(ck);
        for (let d = 0; d < 4; d++) {
          const nk = tileKey(cx + DIRS[d][0], cy + DIRS[d][1]);
          if (tiles.has(nk) && !tileToComp.has(nk)) {
            tileToComp.set(nk, compId);
            queue.push(nk);
          }
        }
      }

      compTileCount.set(compId, count);
    }

    return { tileToComp, compTileCount };
  }

  /**
   * Returns unique conductor component IDs orthogonally bordering or underneath a building's footprint.
   * Buildings NEVER bridge across disconnected conductor components.
   */
  private static getTouchingComponents(
    b: BuildingInstance,
    tileToComp: ReadonlyMap<number, number>
  ): number[] {
    const def = BUILDINGS[b.defId];
    if (!def) return [];
    const fp = getBuildingFootprint(def, b.rotation ?? 0);
    const seen = new Set<number>();

    for (let dx = -1; dx <= fp.width; dx++) {
      for (let dy = -1; dy <= fp.height; dy++) {
        const inFootprint = dx >= 0 && dx < fp.width && dy >= 0 && dy < fp.height;
        const orthoBorder =
          ((dx === -1 || dx === fp.width) && dy >= 0 && dy < fp.height) ||
          ((dy === -1 || dy === fp.height) && dx >= 0 && dx < fp.width);
        if (!inFootprint && !orthoBorder) continue;

        const cid = tileToComp.get(tileKey(b.gx + dx, b.gy + dy));
        if (cid !== undefined) seen.add(cid);
      }
    }

    return Array.from(seen).sort((a, c) => a - c);
  }

  /**
   * Proportional largest-remainder allocation ensuring total delivered never exceeds available generation.
   */
  private static allocateProportionalDeliveries(
    consumers: ReadonlyArray<{ b: BuildingInstance; dem: number }>,
    netGen: number,
    netDem: number
  ): { sat: number; deliveredByBuildingId: Map<number, number>; totalDelivered: number } {
    const deliveredByBuildingId = new Map<number, number>();
    if (consumers.length === 0 || netDem <= 0) {
      return { sat: 1, deliveredByBuildingId, totalDelivered: 0 };
    }
    if (netGen <= 0) {
      for (const c of consumers) deliveredByBuildingId.set(c.b.id, 0);
      return { sat: 0, deliveredByBuildingId, totalDelivered: 0 };
    }
    if (netGen >= netDem) {
      let totalDelivered = 0;
      for (const c of consumers) {
        deliveredByBuildingId.set(c.b.id, c.dem);
        totalDelivered += c.dem;
      }
      return { sat: 1, deliveredByBuildingId, totalDelivered };
    }

    const sat = Math.max(0, Math.min(1, netGen / netDem));
    const budget = Math.min(netDem, Math.floor(netGen + 1e-6));
    let sumFloor = 0;
    const rows = consumers.map((c) => {
      const exact = c.dem * sat;
      const floored = Math.floor(exact);
      sumFloor += floored;
      return { id: c.b.id, dem: c.dem, floored, rem: exact - floored };
    });

    let leftover = Math.max(0, Math.min(budget - sumFloor, rows.length));
    rows.sort((a, b) => b.rem - a.rem || a.id - b.id);
    for (let i = 0; i < rows.length; i++) {
      let alloc = rows[i].floored;
      if (leftover > 0 && alloc < rows[i].dem) {
        alloc += 1;
        leftover -= 1;
      }
      deliveredByBuildingId.set(rows[i].id, alloc);
    }

    let totalDelivered = 0;
    for (const v of deliveredByBuildingId.values()) totalDelivered += v;
    return { sat, deliveredByBuildingId, totalDelivered };
  }

  public static evaluateNetworks(
    state: WorldEngineState,
    chunks: ChunkManager,
    climate: ClimateModifiers,
    force = false
  ): void {
    const evalSig = this.computeEvalSignature(state, climate);
    if (!force && !this.dirty && this.lastSnapshot !== null && evalSig === this.lastEvalSignature) {
      return;
    }
    this.dirty = false;
    this.lastEvalSignature = evalSig;
    this.evalVersion += 1;

    // Collect unlocked road and utility conductor tiles across all loaded chunks
    const powerTiles = new Set<number>();
    const substationCenters: Array<{ gx: number; gy: number }> = [];
    const waterTiles = new Set<number>();
    const pumpCenters: Array<{ gx: number; gy: number }> = [];

    for (const chunk of chunks.getAllLoadedChunks()) {
      const baseX = chunk.cx * CHUNK_SIZE;
      const baseY = chunk.cy * CHUNK_SIZE;
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        const gy = baseY + ly;
        const rowOff = ly * CHUNK_SIZE;
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const i = rowOff + lx;
          if ((chunk.flags[i] & TileFlag.Unlocked) === 0) continue;
          const u = chunk.utilityNet[i];
          const rt = chunk.roadType[i] as RoadType;
          const isDrivableRoad = rt !== RoadType.None && rt !== RoadType.Rail;
          const hasPower = isDrivableRoad || (u & (UtilityFlag.PowerLine | UtilityFlag.PowerSubstation)) !== 0;
          const hasWater = isDrivableRoad || (u & (UtilityFlag.WaterPipe | UtilityFlag.WaterPump)) !== 0;
          if (!hasPower && !hasWater) continue;

          const gx = baseX + lx;
          const key = tileKey(gx, gy);
          if (hasPower) {
            powerTiles.add(key);
            if ((u & UtilityFlag.PowerSubstation) !== 0) {
              substationCenters.push({ gx, gy });
            }
          }
          if (hasWater) {
            waterTiles.add(key);
            if ((u & UtilityFlag.WaterPump) !== 0) {
              pumpCenters.push({ gx, gy });
            }
          }
        }
      }
    }

    // =========================================================================
    // 1. ELECTRICITY DISTRIBUTION SYSTEM (Continuous Road + Power Wire Grids)
    // =========================================================================
    const powerComps = this.buildConnectedComponents(powerTiles);
    let nextIsolatedPowerNetId = 100000;

    const getInstalledPowerCapacity = (b: BuildingInstance): number => {
      const def = BUILDINGS[b.defId];
      if (!def?.powerOutput || def.powerOutput <= 0) return 0;
      let p = getBuildingStatsAtLevel(def, b.level).powerOutput;
      if (b.defId === 'wind_turbine') p *= climate.windPowerMult;
      if (b.defId === 'solar_array') p *= climate.solarPowerMult;
      return Math.round(p);
    };

    const getOperatingPowerOutput = (b: BuildingInstance): number => {
      const def = BUILDINGS[b.defId];
      if (!def?.powerOutput || def.powerOutput <= 0 || !b.enabled) return 0;
      if (def.minWorkers > 0 && b.assignedWorkers < def.minWorkers) return 0;
      if (b.defId === 'coal_power_plant' && state.resources.coal < 1) return 0;
      return getInstalledPowerCapacity(b);
    };

    const getScaledPowerDemand = (b: BuildingInstance): number => {
      const def = BUILDINGS[b.defId];
      if (!def?.powerDemand || !b.enabled) return 0;
      return getBuildingStatsAtLevel(def, b.level).powerDemand;
    };

    const powerNetInstalled = new Map<number, number>();
    const powerNetGen = new Map<number, number>();
    const powerNetProducers = new Map<number, number>();
    const powerNetHasSource = new Set<number>();
    const powerNetConsumers = new Map<number, Array<{ b: BuildingInstance; dem: number }>>();
    const powerNetDemand = new Map<number, number>();

    let totalPowerInstalled = 0;
    let totalPowerGen = 0;
    let totalPowerDem = 0;
    let totalPowerConnectedDem = 0;
    let totalPowerDelivered = 0;
    let pConn = 0;
    let pDisc = 0;
    let pBrownout = 0;

    // Step 1a: Attach all non-constructing power plants to their primary conductor component (or isolated net)
    const powerGenerators = state.buildings.filter((b) => {
      if (b.status === 'constructing') return false;
      const def = BUILDINGS[b.defId];
      return Boolean(def?.powerOutput && def.powerOutput > 0);
    });

    for (const src of powerGenerators) {
      const installed = getInstalledPowerCapacity(src);
      const gen = getOperatingPowerOutput(src);
      totalPowerInstalled += installed;
      totalPowerGen += gen;

      const touching = this.getTouchingComponents(src, powerComps.tileToComp);
      let netId: number;
      if (touching.length > 0) {
        // Attach to the largest continuous conductor component bordering this plant
        netId = touching.reduce((best, cid) =>
          (powerComps.compTileCount.get(cid) ?? 0) > (powerComps.compTileCount.get(best) ?? 0) ? cid : best
        , touching[0]);
      } else {
        netId = nextIsolatedPowerNetId++;
      }

      src.powerConnected = true;
      src.powerNetworkId = netId;
      powerNetHasSource.add(netId);
      powerNetInstalled.set(netId, (powerNetInstalled.get(netId) ?? 0) + installed);
      powerNetGen.set(netId, (powerNetGen.get(netId) ?? 0) + gen);
      if (src.enabled && gen > 0) {
        powerNetProducers.set(netId, (powerNetProducers.get(netId) ?? 0) + 1);
      } else if (!powerNetProducers.has(netId)) {
        powerNetProducers.set(netId, 0);
      }
    }

    // Step 1b: Attach consumers strictly to touching conductor components that have a power source
    for (let bi = 0; bi < state.buildings.length; bi++) {
      const b = state.buildings[bi];
      if (b.status === 'constructing') continue;
      const def = BUILDINGS[b.defId];
      if (!def) continue;
      const isPowerPlant = Boolean(def.powerOutput && def.powerOutput > 0);
      const dem = getScaledPowerDemand(b);

      if (!b.enabled) {
        if (!isPowerPlant) {
          const touching = this.getTouchingComponents(b, powerComps.tileToComp);
          const srcComp = touching.find((cid) => powerNetHasSource.has(cid));
          b.powerConnected = srcComp !== undefined;
          b.powerNetworkId = srcComp ?? touching[0] ?? 0;
        }
        b.powerSatisfaction = dem > 0 ? 0 : 1;
        b.powerReason = 'ok';
        continue;
      }

      const touching = this.getTouchingComponents(b, powerComps.tileToComp);
      const sourceTouchComps = touching.filter((cid) => powerNetHasSource.has(cid));
      let chosenNetId: number | undefined;
      if (isPowerPlant && b.powerNetworkId) {
        chosenNetId = b.powerNetworkId;
      } else if (sourceTouchComps.length > 0) {
        chosenNetId = sourceTouchComps.reduce((best, cid) =>
          (powerNetGen.get(cid) ?? 0) > (powerNetGen.get(best) ?? 0) ? cid : best
        , sourceTouchComps[0]);
      }

      if (chosenNetId === undefined) {
        b.powerConnected = false;
        b.powerNetworkId = touching[0] ?? 0;
        b.powerSatisfaction = dem > 0 ? 0 : 1;
        b.powerReason =
          dem > 0
            ? touching.length > 0
              ? 'disconnected_section_no_source'
              : 'not_connected_to_network'
            : 'ok';
        if (dem > 0) {
          totalPowerDem += dem;
          pDisc++;
        }
        continue;
      }

      b.powerConnected = true;
      b.powerNetworkId = chosenNetId;

      if (dem > 0) {
        totalPowerDem += dem;
        totalPowerConnectedDem += dem;
        pConn++;
        const list = powerNetConsumers.get(chosenNetId) ?? [];
        list.push({ b, dem });
        powerNetConsumers.set(chosenNetId, list);
        powerNetDemand.set(chosenNetId, (powerNetDemand.get(chosenNetId) ?? 0) + dem);
      } else {
        b.powerSatisfaction = 1;
        b.powerReason = 'ok';
      }
    }

    // Step 1c: Resolve proportional power allocation per continuous network
    const powerOverloadedNets = new Set<number>();
    const powerNetworks: UtilityGridSummary[] = [];

    const allPowerNetIds = new Set<number>([
      ...powerNetHasSource,
      ...powerNetConsumers.keys(),
    ]);

    for (const netId of Array.from(allPowerNetIds).sort((a, c) => a - c)) {
      const netInstalled = powerNetInstalled.get(netId) ?? 0;
      const netGen = powerNetGen.get(netId) ?? 0;
      const netDem = powerNetDemand.get(netId) ?? 0;
      const consumers = powerNetConsumers.get(netId) ?? [];
      const alloc = this.allocateProportionalDeliveries(consumers, netGen, netDem);

      if (netDem > netGen) {
        powerOverloadedNets.add(netId);
      }

      for (const item of consumers) {
        item.b.powerSatisfaction = alloc.sat;
        if (alloc.sat < 1) pBrownout++;
        if (alloc.sat >= 1) {
          item.b.powerReason = 'ok';
        } else if (netGen <= 0) {
          item.b.powerReason = 'source_inactive';
        } else {
          item.b.powerReason = 'insufficient_supply';
        }
      }

      totalPowerDelivered += alloc.totalDelivered;
      const unserved = Math.max(0, netDem - alloc.totalDelivered);
      const availPct =
        netDem > 0 ? Math.min(100, Math.round((alloc.totalDelivered / netDem) * 1000) / 10) : netGen > 0 ? 100 : 0;

      powerNetworks.push({
        networkId: netId,
        tileCount: powerComps.compTileCount.get(netId) ?? 0,
        producerCount: powerNetProducers.get(netId) ?? 0,
        consumerCount: consumers.length,
        installedCapacity: netInstalled,
        availableGeneration: netGen,
        connectedDemand: netDem,
        delivered: alloc.totalDelivered,
        unservedDemand: unserved,
        availabilityPct: availPct,
      });
    }

    // Tile ownership map only contains tiles connected to a component with a power source
    // so isolated conductor segments remain visually flagged as disconnected.
    const powerTileNet = new Map<number, number>();
    for (const [tk, cid] of powerComps.tileToComp.entries()) {
      if (powerNetHasSource.has(cid)) {
        powerTileNet.set(tk, cid);
      }
    }

    const powerUnservedDemand = Math.max(0, totalPowerDem - totalPowerDelivered);
    const powerAvailabilityPct =
      totalPowerConnectedDem > 0
        ? Math.min(100, Math.round((totalPowerDelivered / totalPowerConnectedDem) * 1000) / 10)
        : totalPowerGen > 0
          ? 100
          : 0;

    state.powerInstalledCapacity = totalPowerInstalled;
    state.powerGenerated = totalPowerGen;
    state.powerAvailableGen = totalPowerGen;
    state.powerDistCapacity = totalPowerGen;
    state.powerDemand = totalPowerDem;
    state.powerConnectedDemand = totalPowerConnectedDem;
    state.powerDelivered = totalPowerDelivered;
    state.powerUnservedDemand = powerUnservedDemand;

    // =========================================================================
    // 2. WATER DISTRIBUTION SYSTEM (Continuous Road + Water Pipe Grids)
    // =========================================================================
    const waterComps = this.buildConnectedComponents(waterTiles);
    let nextIsolatedWaterNetId = 100000;

    const getInstalledWaterCapacity = (b: BuildingInstance): number => {
      const def = BUILDINGS[b.defId];
      if (!def?.waterOutput || def.waterOutput <= 0) return 0;
      return getBuildingStatsAtLevel(def, b.level).waterOutput;
    };

    const getOperatingWaterOutput = (b: BuildingInstance): number => {
      const def = BUILDINGS[b.defId];
      if (!def?.waterOutput || def.waterOutput <= 0 || !b.enabled) return 0;
      if (def.minWorkers > 0 && b.assignedWorkers < def.minWorkers) return 0;
      const baseOutput = getInstalledWaterCapacity(b);
      // Power-dependent water facilities scale their output proportionally with electricity supply
      if (def.powerDemand && def.powerDemand > 0) {
        const pSat = b.powerConnected ? (b.powerSatisfaction ?? 0) : 0;
        return Math.round(baseOutput * pSat);
      }
      return baseOutput;
    };

    const waterPolicyCut = state.activePolicies?.includes('eco_water_pact') ? 0.75 : 1.0;
    const getScaledWaterDemand = (b: BuildingInstance): number => {
      const def = BUILDINGS[b.defId];
      if (!def?.waterDemand || !b.enabled) return 0;
      const baseScaledDemand = getBuildingStatsAtLevel(def, b.level).waterDemand;
      return Math.max(1, Math.round(baseScaledDemand * climate.waterDemandMult * waterPolicyCut));
    };

    const waterNetInstalled = new Map<number, number>();
    const waterNetGen = new Map<number, number>();
    const waterNetProducers = new Map<number, number>();
    const waterNetHasSource = new Set<number>();
    const waterNetConsumers = new Map<number, Array<{ b: BuildingInstance; dem: number }>>();
    const waterNetDemand = new Map<number, number>();

    let totalWaterInstalled = 0;
    let totalWaterGen = 0;
    let totalWaterDem = 0;
    let totalWaterConnectedDem = 0;
    let totalWaterDelivered = 0;
    let wConn = 0;
    let wDisc = 0;
    let wShortage = 0;

    const waterSources = state.buildings.filter((b) => {
      if (b.status === 'constructing') return false;
      const def = BUILDINGS[b.defId];
      return Boolean(def?.waterOutput && def.waterOutput > 0);
    });

    for (const src of waterSources) {
      const installed = getInstalledWaterCapacity(src);
      const gen = getOperatingWaterOutput(src);
      totalWaterInstalled += installed;
      totalWaterGen += gen;

      const touching = this.getTouchingComponents(src, waterComps.tileToComp);
      let netId: number;
      if (touching.length > 0) {
        netId = touching.reduce((best, cid) =>
          (waterComps.compTileCount.get(cid) ?? 0) > (waterComps.compTileCount.get(best) ?? 0) ? cid : best
        , touching[0]);
      } else {
        netId = nextIsolatedWaterNetId++;
      }

      src.waterConnected = true;
      src.waterNetworkId = netId;
      waterNetHasSource.add(netId);
      waterNetInstalled.set(netId, (waterNetInstalled.get(netId) ?? 0) + installed);
      waterNetGen.set(netId, (waterNetGen.get(netId) ?? 0) + gen);
      if (src.enabled && gen > 0) {
        waterNetProducers.set(netId, (waterNetProducers.get(netId) ?? 0) + 1);
      } else if (!waterNetProducers.has(netId)) {
        waterNetProducers.set(netId, 0);
      }
    }

    for (let bi = 0; bi < state.buildings.length; bi++) {
      const b = state.buildings[bi];
      if (b.status === 'constructing') continue;
      const def = BUILDINGS[b.defId];
      if (!def) continue;
      const isWaterSource = Boolean(def.waterOutput && def.waterOutput > 0);
      const dem = getScaledWaterDemand(b);

      if (!b.enabled) {
        if (!isWaterSource) {
          const touching = this.getTouchingComponents(b, waterComps.tileToComp);
          const srcComp = touching.find((cid) => waterNetHasSource.has(cid));
          b.waterConnected = srcComp !== undefined;
          b.waterNetworkId = srcComp ?? touching[0] ?? 0;
        }
        b.waterSatisfaction = dem > 0 ? 0 : 1;
        b.waterReason = 'ok';
        continue;
      }

      const touching = this.getTouchingComponents(b, waterComps.tileToComp);
      const sourceTouchComps = touching.filter((cid) => waterNetHasSource.has(cid));
      let chosenNetId: number | undefined;
      if (isWaterSource && b.waterNetworkId) {
        chosenNetId = b.waterNetworkId;
      } else if (sourceTouchComps.length > 0) {
        chosenNetId = sourceTouchComps.reduce((best, cid) =>
          (waterNetGen.get(cid) ?? 0) > (waterNetGen.get(best) ?? 0) ? cid : best
        , sourceTouchComps[0]);
      }

      if (chosenNetId === undefined) {
        b.waterConnected = false;
        b.waterNetworkId = touching[0] ?? 0;
        b.waterSatisfaction = dem > 0 ? 0 : 1;
        b.waterReason =
          dem > 0
            ? touching.length > 0
              ? 'disconnected_section_no_source'
              : 'not_connected_to_network'
            : 'ok';
        if (dem > 0) {
          totalWaterDem += dem;
          wDisc++;
        }
        continue;
      }

      b.waterConnected = true;
      b.waterNetworkId = chosenNetId;

      if (dem > 0) {
        totalWaterDem += dem;
        totalWaterConnectedDem += dem;
        wConn++;
        const list = waterNetConsumers.get(chosenNetId) ?? [];
        list.push({ b, dem });
        waterNetConsumers.set(chosenNetId, list);
        waterNetDemand.set(chosenNetId, (waterNetDemand.get(chosenNetId) ?? 0) + dem);
      } else {
        b.waterSatisfaction = 1;
        b.waterReason = 'ok';
      }
    }

    const waterOverloadedNets = new Set<number>();
    const waterNetworks: UtilityGridSummary[] = [];

    const allWaterNetIds = new Set<number>([
      ...waterNetHasSource,
      ...waterNetConsumers.keys(),
    ]);

    for (const netId of Array.from(allWaterNetIds).sort((a, c) => a - c)) {
      const netInstalled = waterNetInstalled.get(netId) ?? 0;
      const netGen = waterNetGen.get(netId) ?? 0;
      const netDem = waterNetDemand.get(netId) ?? 0;
      const consumers = waterNetConsumers.get(netId) ?? [];
      const alloc = this.allocateProportionalDeliveries(consumers, netGen, netDem);

      if (netDem > netGen) {
        waterOverloadedNets.add(netId);
      }

      for (const item of consumers) {
        item.b.waterSatisfaction = alloc.sat;
        if (alloc.sat < 1) wShortage++;
        if (alloc.sat >= 1) {
          item.b.waterReason = 'ok';
        } else if (netGen <= 0) {
          item.b.waterReason = 'source_inactive';
        } else {
          item.b.waterReason = 'insufficient_supply';
        }
      }

      totalWaterDelivered += alloc.totalDelivered;
      const unserved = Math.max(0, netDem - alloc.totalDelivered);
      const availPct =
        netDem > 0 ? Math.min(100, Math.round((alloc.totalDelivered / netDem) * 1000) / 10) : netGen > 0 ? 100 : 0;

      waterNetworks.push({
        networkId: netId,
        tileCount: waterComps.compTileCount.get(netId) ?? 0,
        producerCount: waterNetProducers.get(netId) ?? 0,
        consumerCount: consumers.length,
        installedCapacity: netInstalled,
        availableGeneration: netGen,
        connectedDemand: netDem,
        delivered: alloc.totalDelivered,
        unservedDemand: unserved,
        availabilityPct: availPct,
      });
    }

    const waterTileNet = new Map<number, number>();
    for (const [tk, cid] of waterComps.tileToComp.entries()) {
      if (waterNetHasSource.has(cid)) {
        waterTileNet.set(tk, cid);
      }
    }

    const waterUnservedDemand = Math.max(0, totalWaterDem - totalWaterDelivered);
    const waterAvailabilityPct =
      totalWaterConnectedDem > 0
        ? Math.min(100, Math.round((totalWaterDelivered / totalWaterConnectedDem) * 1000) / 10)
        : totalWaterGen > 0
          ? 100
          : 0;

    state.waterInstalledCapacity = totalWaterInstalled;
    state.waterGenerated = totalWaterGen;
    state.waterAvailableGen = totalWaterGen;
    state.waterDistCapacity = totalWaterGen;
    state.waterDemand = totalWaterDem;
    state.waterConnectedDemand = totalWaterConnectedDem;
    state.waterDelivered = totalWaterDelivered;
    state.waterUnservedDemand = waterUnservedDemand;

    this.lastSnapshot = {
      powerTiles,
      waterTiles,
      powerTileNet,
      waterTileNet,
      powerOverloadedNets,
      waterOverloadedNets,
      substationCenters,
      pumpCenters,
    };

    state.utilitySummary = {
      powerConnectedCount: pConn,
      powerDisconnectedCount: pDisc,
      powerBrownoutCount: pBrownout,
      powerInstalledCapacity: totalPowerInstalled,
      powerConnectedDemand: totalPowerConnectedDem,
      powerUnservedDemand,
      powerAvailabilityPct,
      waterConnectedCount: wConn,
      waterDisconnectedCount: wDisc,
      waterShortageCount: wShortage,
      waterInstalledCapacity: totalWaterInstalled,
      waterConnectedDemand: totalWaterConnectedDem,
      waterUnservedDemand,
      waterAvailabilityPct,
      powerNetworks,
      waterNetworks,
      serviceCoveragePct: state.utilitySummary?.serviceCoveragePct ?? 0,
    };
  }
}
