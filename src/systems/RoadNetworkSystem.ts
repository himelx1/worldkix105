import { BUILDINGS, getBuildingFootprint } from '../data/buildings.data';
import { getRoadProperties, ROADS, RoadType } from '../data/roads.data';
import type { ChunkManager } from '../core/ChunkManager';
import { BuildingInstance, RoadDirection, TileFlag, WorldEngineState } from '../core/GameState';
import { CHUNK_SIZE, localTileIndex, tileKey, unpackTileX, unpackTileY } from '../core/IsoMath';

export type IntersectionKind =
  | 'none'
  | 'isolated'
  | 'dead_end'
  | 'straight'
  | 'curve'
  | 't_junction'
  | 'cross'
  | 'roundabout'
  | 'interchange';

export type SignalState = 'green' | 'yellow' | 'red' | 'yield' | 'none';

export interface RoadClusterInfo {
  id: number;
  roadClass: 'road' | 'rail';
  count: number;
  speedSum: number;
  avgSpeed: number;
  buildings: number;
  isMainNetwork: boolean;
  isDisconnected: boolean;
  congestionFactor: number;
}

export interface BuildingRoadAccessPoint {
  gx: number;
  gy: number;
  roadType: RoadType;
  clusterId: number;
  tierRank: number;
}

export interface BuildingRoadAccessInfo {
  connectedCluster: number;
  bestRoadTier: number;
  heavyTruckSuitable: boolean;
  restrictedForHeavyTrucks: boolean;
  accessPoints: BuildingRoadAccessPoint[];
}

export interface RoadNetworkSummary {
  totalRoadTiles: number;
  totalRailTiles: number;
  networkCount: number;
  mainNetworkId: number;
  mainNetworkSize: number;
  disconnectedSegments: number;
  disconnectedClusters: number;
  congestedTiles: number;
  activeVehicles: number;
  avgCongestionPct: number;
}

export interface CachedRoadTileEntry {
  gx: number;
  gy: number;
  key: number;
  type: RoadType;
  unlocked: boolean;
  clusterId: number;
}

export class RoadNetworkSystem {
  public networkVersion = 1;

  private roadClusterMap = new Map<number, number>();
  private clusterStatsMap = new Map<number, RoadClusterInfo>();
  private clusterCongestionMap = new Map<number, number>();
  private tileCongestionMap = new Map<number, number>();
  private buildingAccessMap = new Map<number, BuildingRoadAccessInfo>();

  // Precomputed road caches refreshed on dirty rebuild
  private cachedRoadTiles: CachedRoadTileEntry[] = [];
  private cachedRoadTileByKey = new Map<number, CachedRoadTileEntry>();
  private cachedClusterReps = new Map<number, { gx: number; gy: number }>();
  private cachedSignalKindMap = new Map<number, IntersectionKind>();

  // Cached per-tick / building-mutation logistics hub stats (prevents O(N^2) loops)
  private cachedHubTick = -1;
  private cachedHubBldCount = -1;
  private cachedHasHubMitigation = false;
  private cachedHubBoost = 0;

  private totalRoadTiles = 0;
  private totalRailTiles = 0;
  private mainNetworkId = 0;
  private mainNetworkSize = 0;
  private roadDirty = true;

  public markDirty(): void {
    this.roadDirty = true;
    this.cachedHubTick = -1;
    this.networkVersion += 1;
  }

  public invalidateBuildingBoostCache(): void {
    this.cachedHubTick = -1;
  }

  public static getDirectionVector(dir: RoadDirection): { dx: number; dy: number } | null {
    switch (dir) {
      case RoadDirection.OneWayN:
        return { dx: 0, dy: -1 };
      case RoadDirection.OneWayE:
        return { dx: 1, dy: 0 };
      case RoadDirection.OneWayS:
        return { dx: 0, dy: 1 };
      case RoadDirection.OneWayW:
        return { dx: -1, dy: 0 };
      default:
        return null;
    }
  }

  public getRoadBitmask(gx: number, gy: number, chunks: ChunkManager): number {
    const chunk = chunks.getLoadedChunkForGrid(gx, gy);
    if (!chunk) return 0;
    const index = localTileIndex(gx, gy);
    const rt = chunk.roadType[index] as RoadType;
    if (rt === RoadType.None) return 0;

    const isRail = rt === RoadType.Rail;
    const curUnlocked = (chunk.flags[index] & TileFlag.Unlocked) !== 0;
    let mask = 0;

    // N (0,-1, bit 1)
    let nbC = chunks.getLoadedChunkForGrid(gx, gy - 1);
    if (nbC) {
      const ni = localTileIndex(gx, gy - 1);
      const nrt = nbC.roadType[ni] as RoadType;
      if (nrt !== RoadType.None && (isRail ? nrt === RoadType.Rail : nrt !== RoadType.Rail)) {
        if (isRail || curUnlocked === ((nbC.flags[ni] & TileFlag.Unlocked) !== 0)) {
          mask |= 1;
        }
      }
    }
    // E (1,0, bit 2)
    nbC = chunks.getLoadedChunkForGrid(gx + 1, gy);
    if (nbC) {
      const ni = localTileIndex(gx + 1, gy);
      const nrt = nbC.roadType[ni] as RoadType;
      if (nrt !== RoadType.None && (isRail ? nrt === RoadType.Rail : nrt !== RoadType.Rail)) {
        if (isRail || curUnlocked === ((nbC.flags[ni] & TileFlag.Unlocked) !== 0)) {
          mask |= 2;
        }
      }
    }
    // S (0,1, bit 4)
    nbC = chunks.getLoadedChunkForGrid(gx, gy + 1);
    if (nbC) {
      const ni = localTileIndex(gx, gy + 1);
      const nrt = nbC.roadType[ni] as RoadType;
      if (nrt !== RoadType.None && (isRail ? nrt === RoadType.Rail : nrt !== RoadType.Rail)) {
        if (isRail || curUnlocked === ((nbC.flags[ni] & TileFlag.Unlocked) !== 0)) {
          mask |= 4;
        }
      }
    }
    // W (-1,0, bit 8)
    nbC = chunks.getLoadedChunkForGrid(gx - 1, gy);
    if (nbC) {
      const ni = localTileIndex(gx - 1, gy);
      const nrt = nbC.roadType[ni] as RoadType;
      if (nrt !== RoadType.None && (isRail ? nrt === RoadType.Rail : nrt !== RoadType.Rail)) {
        if (isRail || curUnlocked === ((nbC.flags[ni] & TileFlag.Unlocked) !== 0)) {
          mask |= 8;
        }
      }
    }

    return mask;
  }

  public getIntersectionKind(gx: number, gy: number, chunks: ChunkManager): IntersectionKind {
    if (!this.roadDirty) {
      return this.cachedSignalKindMap.get(tileKey(gx, gy)) ?? 'none';
    }
    const chunk = chunks.getLoadedChunkForGrid(gx, gy);
    if (!chunk) return 'none';
    const rt = chunk.roadType[localTileIndex(gx, gy)] as RoadType;
    if (rt === RoadType.None) return 'none';
    if (rt === RoadType.Roundabout) return 'roundabout';
    if (rt === RoadType.Interchange) return 'interchange';

    const mask = this.getRoadBitmask(gx, gy, chunks);
    const bits = ((mask & 1) ? 1 : 0) + ((mask & 2) ? 1 : 0) + ((mask & 4) ? 1 : 0) + ((mask & 8) ? 1 : 0);
    if (bits === 0) return 'isolated';
    if (bits === 1) return 'dead_end';
    if (bits === 2) {
      if (mask === 5 || mask === 10) return 'straight';
      return 'curve';
    }
    if (bits === 3) return 't_junction';
    return 'cross';
  }

  public hasTrafficSignal(gx: number, gy: number, chunks: ChunkManager): boolean {
    const chunk = chunks.getLoadedChunkForGrid(gx, gy);
    if (!chunk) return false;
    const rt = chunk.roadType[localTileIndex(gx, gy)] as RoadType;
    if (rt === RoadType.None || rt === RoadType.Rail) return false;
    if (!getRoadProperties(rt).supportsSignals) return false;
    const kind = this.getIntersectionKind(gx, gy, chunks);
    return kind === 't_junction' || kind === 'cross';
  }

  /**
   * Evaluates deterministic N-S vs E-W traffic light phase at a signalized intersection.
   * Cycle is 16s: 0..6.4s N-S green, 6.4..8.0s N-S yellow/clearance, 8.0..14.4s E-W green, 14.4..16.0s E-W clearance.
   */
  public getSignalState(
    gx: number,
    gy: number,
    fromDx: number,
    fromDy: number,
    simTimeSec: number,
    chunks?: ChunkManager
  ): SignalState {
    if (chunks) {
      const k = tileKey(gx, gy);
      const cachedEntry = !this.roadDirty ? this.cachedRoadTileByKey.get(k) : undefined;
      const rt = cachedEntry
        ? cachedEntry.type
        : (() => {
            const c = chunks.getLoadedChunkForGrid(gx, gy);
            return c ? (c.roadType[localTileIndex(gx, gy)] as RoadType) : RoadType.None;
          })();
      if (rt === RoadType.Roundabout || rt === RoadType.Interchange) return 'yield';
      const kind = cachedEntry
        ? (this.cachedSignalKindMap.get(k) ?? 'none')
        : this.getIntersectionKind(gx, gy, chunks);
      if (kind !== 't_junction' && kind !== 'cross') return 'none';
      if (!getRoadProperties(rt).supportsSignals) return 'yield';
    }

    const offset = (((gx + gy) % 2) + 2) % 2;
    const phase = ((simTimeSec + offset * 4.0) % 16 + 16) % 16;
    const movingNS = Math.abs(fromDy) >= Math.abs(fromDx);

    if (movingNS) {
      if (phase < 6.4) return 'green';
      if (phase < 8.0) return 'yellow';
      return 'red';
    } else {
      if (phase >= 8.0 && phase < 14.4) return 'green';
      if (phase >= 14.4) return 'yellow';
      return 'red';
    }
  }

  public getCachedRoadTiles(): ReadonlyArray<CachedRoadTileEntry> {
    return this.cachedRoadTiles;
  }

  public getCachedClusterRepresentatives(): ReadonlyMap<number, { gx: number; gy: number }> {
    return this.cachedClusterReps;
  }

  public recomputeIfDirty(chunks: ChunkManager, state: WorldEngineState): void {
    if (!this.roadDirty) return;
    this.roadDirty = false;
    this.roadClusterMap.clear();
    this.clusterStatsMap.clear();
    this.clusterCongestionMap.clear();
    this.buildingAccessMap.clear();
    this.cachedRoadTiles = [];
    this.cachedRoadTileByKey.clear();
    this.cachedClusterReps.clear();
    this.cachedSignalKindMap.clear();

    const roadTiles: CachedRoadTileEntry[] = [];
    let drivableCount = 0;
    let railCount = 0;

    for (const chunk of chunks.getAllLoadedChunks()) {
      const baseX = chunk.cx * CHUNK_SIZE;
      const baseY = chunk.cy * CHUNK_SIZE;
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        const gy = baseY + ly;
        const rowOff = ly * CHUNK_SIZE;
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const idx = rowOff + lx;
          const rt = chunk.roadType[idx] as RoadType;
          if (rt !== RoadType.None) {
            const gx = baseX + lx;
            const k = tileKey(gx, gy);
            const entry: CachedRoadTileEntry = {
              gx,
              gy,
              key: k,
              type: rt,
              unlocked: (chunk.flags[idx] & TileFlag.Unlocked) !== 0,
              clusterId: 0,
            };
            roadTiles.push(entry);
            this.cachedRoadTileByKey.set(k, entry);
            if (rt === RoadType.Rail) railCount++;
            else drivableCount++;
          }
        }
      }
    }

    this.cachedRoadTiles = roadTiles;
    this.totalRoadTiles = drivableCount;
    this.totalRailTiles = railCount;
    state.roadConnectedCount = roadTiles.length;

    let nextCluster = 1;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const clusterRaw = new Map<
      number,
      { roadClass: 'road' | 'rail'; count: number; speedSum: number; buildings: number }
    >();

    for (let i = 0; i < roadTiles.length; i++) {
      const start = roadTiles[i];
      if (this.roadClusterMap.has(start.key)) continue;
      const clusterId = nextCluster++;
      const queue: CachedRoadTileEntry[] = [start];
      this.roadClusterMap.set(start.key, clusterId);
      start.clusterId = clusterId;
      this.cachedClusterReps.set(clusterId, { gx: start.gx, gy: start.gy });
      const stat = {
        roadClass: (start.type === RoadType.Rail ? 'rail' : 'road') as 'road' | 'rail',
        count: 0,
        speedSum: 0,
        buildings: 0,
      };

      while (queue.length > 0) {
        const cur = queue.pop()!;
        const rType = cur.type;
        stat.count++;
        stat.speedSum += ROADS[rType]?.speedMultiplier ?? 1.0;

        for (let d = 0; d < 4; d++) {
          const nx = cur.gx + dirs[d][0];
          const ny = cur.gy + dirs[d][1];
          const nk = tileKey(nx, ny);
          const nb = this.cachedRoadTileByKey.get(nk);
          if (nb !== undefined && !this.roadClusterMap.has(nk)) {
            const nType = nb.type;
            const sameClass = rType === RoadType.Rail ? nType === RoadType.Rail : nType !== RoadType.Rail;
            if (!sameClass) continue;
            if (rType !== RoadType.Rail && cur.unlocked !== nb.unlocked) {
              continue;
            }
            this.roadClusterMap.set(nk, clusterId);
            nb.clusterId = clusterId;
            queue.push(nb);
          }
        }
      }
      clusterRaw.set(clusterId, stat);
    }

    // Precompute intersection kinds once per dirty road edit
    for (let i = 0; i < roadTiles.length; i++) {
      const t = roadTiles[i];
      let kind: IntersectionKind;
      if (t.type === RoadType.Roundabout) {
        kind = 'roundabout';
      } else if (t.type === RoadType.Interchange) {
        kind = 'interchange';
      } else {
        const isRail = t.type === RoadType.Rail;
        let mask = 0;
        let nb = this.cachedRoadTileByKey.get(tileKey(t.gx, t.gy - 1));
        if (nb && (isRail ? nb.type === RoadType.Rail : nb.type !== RoadType.Rail) &&
          (isRail || t.unlocked === nb.unlocked)) {
          mask |= 1;
        }
        nb = this.cachedRoadTileByKey.get(tileKey(t.gx + 1, t.gy));
        if (nb && (isRail ? nb.type === RoadType.Rail : nb.type !== RoadType.Rail) &&
          (isRail || t.unlocked === nb.unlocked)) {
          mask |= 2;
        }
        nb = this.cachedRoadTileByKey.get(tileKey(t.gx, t.gy + 1));
        if (nb && (isRail ? nb.type === RoadType.Rail : nb.type !== RoadType.Rail) &&
          (isRail || t.unlocked === nb.unlocked)) {
          mask |= 4;
        }
        nb = this.cachedRoadTileByKey.get(tileKey(t.gx - 1, t.gy));
        if (nb && (isRail ? nb.type === RoadType.Rail : nb.type !== RoadType.Rail) &&
          (isRail || t.unlocked === nb.unlocked)) {
          mask |= 8;
        }
        const bits = ((mask & 1) ? 1 : 0) + ((mask & 2) ? 1 : 0) + ((mask & 4) ? 1 : 0) + ((mask & 8) ? 1 : 0);
        if (bits === 0) kind = 'isolated';
        else if (bits === 1) kind = 'dead_end';
        else if (bits === 2) kind = (mask === 5 || mask === 10) ? 'straight' : 'curve';
        else if (bits === 3) kind = 't_junction';
        else kind = 'cross';
      }
      this.cachedSignalKindMap.set(t.key, kind);
    }

    // Determine main drivable road network (largest connected road component)
    let mainId = 0;
    let mainSize = 0;
    for (const [cid, stat] of clusterRaw.entries()) {
      if (stat.roadClass === 'road' && stat.count > mainSize) {
        mainSize = stat.count;
        mainId = cid;
      }
    }
    this.mainNetworkId = mainId;
    this.mainNetworkSize = mainSize;

    // Update each building's adjacent road connectivity & count buildings per road cluster
    for (const b of state.buildings) {
      const { connectedCluster } = this.evaluateBuildingRoadAccess(b, chunks);
      if (connectedCluster > 0) {
        const stat = clusterRaw.get(connectedCluster);
        if (stat) stat.buildings += 1;
      }
    }

    for (const [clusterId, stat] of clusterRaw.entries()) {
      const avgSpeed = stat.count > 0 ? stat.speedSum / stat.count : 1.0;
      const density = stat.buildings / Math.max(1, stat.count);
      const threshold = 0.7 * avgSpeed;
      let congestion = 1.0;
      if (density > threshold) {
        congestion = Math.max(0.65, 1.0 - (density - threshold) * 0.25);
      }
      const roundedCongestion = Number(congestion.toFixed(2));
      this.clusterCongestionMap.set(clusterId, roundedCongestion);

      const isMain = clusterId === mainId;
      const isDisconnected =
        stat.roadClass === 'road' &&
        (stat.count <= 1 || (mainId > 0 && clusterId !== mainId));

      this.clusterStatsMap.set(clusterId, {
        id: clusterId,
        roadClass: stat.roadClass,
        count: stat.count,
        speedSum: stat.speedSum,
        avgSpeed,
        buildings: stat.buildings,
        isMainNetwork: isMain,
        isDisconnected,
        congestionFactor: roundedCongestion,
      });
    }

    // Prune stale tile congestion entries where roads were deleted
    for (const key of this.tileCongestionMap.keys()) {
      if (!this.cachedRoadTileByKey.has(key)) {
        this.tileCongestionMap.delete(key);
      }
    }

    for (const b of state.buildings) {
      b.congestionFactor =
        b.connectedRoadCluster > 0 ? (this.clusterCongestionMap.get(b.connectedRoadCluster) ?? 1.0) : 1.0;
    }

    this.refreshBuildingHubCache(state);
  }

  private refreshBuildingHubCache(state: WorldEngineState): void {
    this.cachedHubTick = state.tick;
    this.cachedHubBldCount = state.buildings.length;
    let hasMit = false;
    let boost = 0;
    for (let i = 0; i < state.buildings.length; i++) {
      const other = state.buildings[i];
      if (other.status !== 'active') continue;
      const odef = BUILDINGS[other.defId];
      if (
        other.defId === 'cart_depot' ||
        other.defId === 'train_station' ||
        odef?.category === 'storage'
      ) {
        hasMit = true;
      }
      if (odef?.logisticsBoost) {
        boost += odef.logisticsBoost * (1 + (other.level - 1) * 0.2);
      }
    }
    this.cachedHasHubMitigation = hasMit;
    this.cachedHubBoost = Math.min(0.65, boost);
  }

  private ensureBuildingHubCache(state: WorldEngineState): void {
    if (this.cachedHubTick !== state.tick || this.cachedHubBldCount !== state.buildings.length) {
      this.refreshBuildingHubCache(state);
    }
  }

  public recordTrafficSample(
    tileVehicleCount: Map<number, number>,
    tileWaitingCount: Map<number, number>,
    chunks: ChunkManager,
    state: WorldEngineState
  ): void {
    // Decay existing tile congestion and blend current active traffic + waiting queues
    const seen = new Set<number>();
    for (const [key, count] of tileVehicleCount.entries()) {
      seen.add(key);
      const wait = tileWaitingCount.get(key) ?? 0;
      const gx = unpackTileX(key);
      const gy = unpackTileY(key);
      const chunk = chunks.getLoadedChunkForGrid(gx, gy);
      const rt = chunk ? (chunk.roadType[localTileIndex(gx, gy)] as RoadType) : RoadType.None;
      const lanes = rt !== RoadType.None ? Math.max(1, getRoadProperties(rt).totalLanes) : 1;
      const capacity = Math.max(1.5, lanes * 0.9);
      const rawLoad = Math.min(1, (count + wait * 1.4 - 0.6) / capacity);
      const prev = this.tileCongestionMap.get(key) ?? 0;
      const next = Math.max(0, Math.min(1, prev * 0.72 + Math.max(0, rawLoad) * 0.28));
      if (next < 0.02) {
        this.tileCongestionMap.delete(key);
      } else {
        this.tileCongestionMap.set(key, Number(next.toFixed(3)));
      }
    }

    for (const [key, prev] of this.tileCongestionMap.entries()) {
      if (seen.has(key)) continue;
      const decayed = prev * 0.78;
      if (decayed < 0.02) {
        this.tileCongestionMap.delete(key);
      } else {
        this.tileCongestionMap.set(key, Number(decayed.toFixed(3)));
      }
    }

    // Reflect local access-tile congestion onto nearby buildings cleanly
    for (const b of state.buildings) {
      const access = this.buildingAccessMap.get(b.id);
      const baseClusterFactor =
        b.connectedRoadCluster > 0 ? (this.clusterCongestionMap.get(b.connectedRoadCluster) ?? 1.0) : 1.0;
      if (!access || access.accessPoints.length === 0) {
        b.congestionFactor = baseClusterFactor;
        continue;
      }
      let maxLocalLoad = 0;
      for (const ap of access.accessPoints) {
        const load = this.tileCongestionMap.get(tileKey(ap.gx, ap.gy)) ?? 0;
        if (load > maxLocalLoad) maxLocalLoad = load;
      }
      const trafficFactor = Math.max(0.55, 1.0 - maxLocalLoad * 0.35);
      b.congestionFactor = Number(Math.min(baseClusterFactor, trafficFactor).toFixed(2));
    }
  }

  public getTileCongestion(gx: number, gy: number): number {
    return this.tileCongestionMap.get(tileKey(gx, gy)) ?? 0;
  }

  public getTileCongestionMap(): ReadonlyMap<number, number> {
    return this.tileCongestionMap;
  }

  public getRoadClusterId(gx: number, gy: number): number {
    return this.roadClusterMap.get(tileKey(gx, gy)) ?? 0;
  }

  public getClusterInfo(clusterId: number): RoadClusterInfo | undefined {
    return this.clusterStatsMap.get(clusterId);
  }

  public getAllClusterStats(): ReadonlyMap<number, RoadClusterInfo> {
    return this.clusterStatsMap;
  }

  public isRoadDisconnected(gx: number, gy: number): boolean {
    const cid = this.roadClusterMap.get(tileKey(gx, gy));
    if (!cid) return false;
    return this.clusterStatsMap.get(cid)?.isDisconnected ?? false;
  }

  public evaluateBuildingRoadAccess(b: BuildingInstance, chunks: ChunkManager): BuildingRoadAccessInfo {
    const def = BUILDINGS[b.defId];
    if (!def) {
      return {
        connectedCluster: 0,
        bestRoadTier: 0,
        heavyTruckSuitable: false,
        restrictedForHeavyTrucks: false,
        accessPoints: [],
      };
    }

    const fp = getBuildingFootprint(def, b.rotation ?? 0);
    let bestCluster = 0;
    let bestClusterSize = -1;
    let bestTier = 0;
    let heavyTruckSuitable = false;
    let touchesAnyDrivableRoad = false;
    const accessPoints: BuildingRoadAccessPoint[] = [];

    for (let dx = -1; dx <= fp.width; dx++) {
      for (let dy = -1; dy <= fp.height; dy++) {
        const isEdge =
          ((dx === -1 || dx === fp.width) && dy >= 0 && dy < fp.height) ||
          ((dy === -1 || dy === fp.height) && dx >= 0 && dx < fp.width);
        if (!isEdge) continue;

        const nx = b.gx + dx;
        const ny = b.gy + dy;
        const chunk = chunks.getLoadedChunkForGrid(nx, ny);
        if (!chunk) continue;
        const rt = chunk.roadType[localTileIndex(nx, ny)] as RoadType;
        if (rt !== RoadType.None) {
          const cluster = this.roadClusterMap.get(tileKey(nx, ny)) ?? 1;
          const clusterSize = this.clusterStatsMap.get(cluster)?.count ?? 1;
          const roadDef = ROADS[rt];
          const tier = rt === RoadType.Bridge ? 2 : rt === RoadType.Rail ? 9 : (roadDef?.tierRank ?? rt);
          if (rt !== RoadType.Rail) {
            touchesAnyDrivableRoad = true;
            if (clusterSize > bestClusterSize) {
              bestClusterSize = clusterSize;
              bestCluster = cluster;
            }
            if (getRoadProperties(rt).heavyTruckFriendly) {
              heavyTruckSuitable = true;
            }
          } else if (bestCluster === 0) {
            bestCluster = cluster;
          }
          if (tier > bestTier) bestTier = tier;
          accessPoints.push({ gx: nx, gy: ny, roadType: rt, clusterId: cluster, tierRank: tier });
        }
      }
    }

    accessPoints.sort((a, c) => c.tierRank - a.tierRank);
    b.connectedRoadCluster = bestCluster;
    b.congestionFactor = bestCluster > 0 ? (this.clusterCongestionMap.get(bestCluster) ?? 1.0) : 1.0;

    const info: BuildingRoadAccessInfo = {
      connectedCluster: bestCluster,
      bestRoadTier: bestTier,
      heavyTruckSuitable,
      restrictedForHeavyTrucks: touchesAnyDrivableRoad && !heavyTruckSuitable,
      accessPoints,
    };
    this.buildingAccessMap.set(b.id, info);
    return info;
  }

  public getCachedRoadAccess(b: BuildingInstance, chunks: ChunkManager): BuildingRoadAccessInfo {
    const cached = this.buildingAccessMap.get(b.id);
    if (cached !== undefined && !this.roadDirty) {
      return cached;
    }
    return this.evaluateBuildingRoadAccess(b, chunks);
  }

  public getClusterCongestionFactor(b: BuildingInstance, state: WorldEngineState, _chunks: ChunkManager): number {
    if (b.connectedRoadCluster <= 0) return 1.0;
    let base = this.clusterCongestionMap.get(b.connectedRoadCluster) ?? 1.0;
    if (base < 1.0) {
      this.ensureBuildingHubCache(state);
      if (this.cachedHasHubMitigation) {
        base = Math.min(1.0, base + 0.12);
      }
    }
    const existingLocal = b.congestionFactor ?? 1.0;
    b.congestionFactor = Number(Math.min(base, Math.max(0.55, existingLocal)).toFixed(2));
    return b.congestionFactor;
  }

  public getBuildingLogisticsMultiplier(b: BuildingInstance, state: WorldEngineState, chunks: ChunkManager): number {
    const { bestRoadTier } = this.getCachedRoadAccess(b, chunks);
    let base = 1.0;
    if (bestRoadTier > 0) {
      const roadDef = Object.values(ROADS).find((r) => (r.tierRank ?? r.id) === bestRoadTier) ?? ROADS[bestRoadTier as RoadType];
      if (roadDef) {
        base = 0.95 + (roadDef.speedMultiplier - 1.0) * 0.25;
      }
    }

    this.ensureBuildingHubCache(state);
    const congestion = this.getClusterCongestionFactor(b, state, chunks);
    return Math.min(1.85, (base + this.cachedHubBoost) * congestion);
  }

  public getNetworkSummary(activeVehicles = 0): RoadNetworkSummary {
    let networkCount = 0;
    let disconnectedSegments = 0;
    let disconnectedClusters = 0;

    for (const info of this.clusterStatsMap.values()) {
      if (info.roadClass !== 'road') continue;
      networkCount++;
      if (info.isDisconnected) {
        disconnectedClusters++;
        disconnectedSegments += info.count;
      }
    }

    let congestedTiles = 0;
    let sumCong = 0;
    for (const val of this.tileCongestionMap.values()) {
      sumCong += val;
      if (val >= 0.6) congestedTiles++;
    }

    const avgCongestionPct =
      this.totalRoadTiles > 0 ? Math.min(100, Math.round((sumCong / this.totalRoadTiles) * 100)) : 0;

    return {
      totalRoadTiles: this.totalRoadTiles,
      totalRailTiles: this.totalRailTiles,
      networkCount,
      mainNetworkId: this.mainNetworkId,
      mainNetworkSize: this.mainNetworkSize,
      disconnectedSegments,
      disconnectedClusters,
      congestedTiles,
      activeVehicles,
      avgCongestionPct,
    };
  }
}

