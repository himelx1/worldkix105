import { BUILDINGS, getBuildingFootprint } from '../data/buildings.data';
import { getRoadProperties, ROADS, RoadType } from '../data/roads.data';
import type { ChunkManager } from '../core/ChunkManager';
import { BiomeId, BuildingInstance, RoadDirection, TileFlag, VehicleClass } from '../core/GameState';
import { localTileIndex, tileKey, unpackTileX, unpackTileY } from '../core/IsoMath';
import { RoadNetworkSystem } from './RoadNetworkSystem';

export type TransportMode = 'citizen' | 'vehicle' | 'train';

export interface GridPoint {
  gx: number;
  gy: number;
}

export interface FindPathOptions {
  vehicleClass?: VehicleClass;
  congestionMap?: ReadonlyMap<number, number>;
}

const DIRS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * Strict network-aware movement rules & bounded A* pathfinding:
 * - Citizens walk ONLY on roads, bridges, and unlocked non-mountain dry land.
 *   They NEVER walk on unbridged water, buildings, mountains, or locked tiles.
 * - Vehicles travel strictly on roads & bridges, obey one-way directions,
 *   avoid congested bottlenecks, and route heavy trucks away from narrow residential lanes when possible.
 * - Trains travel strictly on RoadType.Rail tiles.
 */
export class PathfindingSystem {
  public static isTilePassable(
    gx: number,
    gy: number,
    chunks: ChunkManager,
    mode: TransportMode = 'citizen'
  ): boolean {
    const chunk = chunks.getLoadedChunkForGrid(gx, gy);
    if (!chunk) return false;
    const index = localTileIndex(gx, gy);
    const unlocked = (chunk.flags[index] & TileFlag.Unlocked) !== 0;
    const road = chunk.roadType[index] as RoadType;
    if (chunk.buildingRef[index] !== -1) return false;

    if (mode === 'train') {
      return unlocked && road === RoadType.Rail;
    }

    if (mode === 'vehicle') {
      // Vehicles strictly stay on drivable unlocked roads
      return unlocked && road !== RoadType.None && road !== RoadType.Rail;
    }

    if (!unlocked) return false;

    const biome = chunk.biomeId[index] as BiomeId;
    if (chunks.isWaterBiome(biome)) {
      return road === RoadType.Bridge || road === RoadType.ElevatedHighway || road === RoadType.UndergroundRoad;
    }
    return true;
  }

  /**
   * Validates directed edge traversal from (fromGx, fromGy) to (toGx, toGy).
   * Enforces unlocked land borders and one-way road directions.
   */
  public static isEdgeTraversable(
    fromGx: number,
    fromGy: number,
    toGx: number,
    toGy: number,
    chunks: ChunkManager,
    mode: TransportMode = 'citizen'
  ): boolean {
    const toChunk = chunks.getLoadedChunkForGrid(toGx, toGy);
    if (!toChunk) return false;
    const toIdx = localTileIndex(toGx, toGy);
    const toUnlocked = (toChunk.flags[toIdx] & TileFlag.Unlocked) !== 0;
    const toRoad = toChunk.roadType[toIdx] as RoadType;
    if (toChunk.buildingRef[toIdx] !== -1) return false;

    if (mode === 'train') {
      return toUnlocked && toRoad === RoadType.Rail;
    }

    if (mode !== 'vehicle') {
      if (!toUnlocked) return false;
      const biome = toChunk.biomeId[toIdx] as BiomeId;
      if (chunks.isWaterBiome(biome)) {
        return toRoad === RoadType.Bridge || toRoad === RoadType.ElevatedHighway || toRoad === RoadType.UndergroundRoad;
      }
      return true;
    }

    if (toRoad === RoadType.None || toRoad === RoadType.Rail) return false;

    const fromChunk = chunks.getLoadedChunkForGrid(fromGx, fromGy);
    if (!fromChunk) return false;
    const fromIdx = localTileIndex(fromGx, fromGy);
    const fromUnlocked = (fromChunk.flags[fromIdx] & TileFlag.Unlocked) !== 0;
    const fromRoad = fromChunk.roadType[fromIdx] as RoadType;

    if (fromUnlocked !== toUnlocked) {
      return false;
    }

    const dx = toGx - fromGx;
    const dy = toGy - fromGy;

    const fromDir = (fromChunk.roadDir?.[fromIdx] ?? RoadDirection.TwoWay) as RoadDirection;
    if (fromDir !== RoadDirection.TwoWay) {
      const vec = RoadNetworkSystem.getDirectionVector(fromDir);
      if (vec && dx === -vec.dx && dy === -vec.dy) {
        return false;
      }
    }

    const toDir = (toChunk.roadDir?.[toIdx] ?? RoadDirection.TwoWay) as RoadDirection;
    if (toDir !== RoadDirection.TwoWay) {
      const vec = RoadNetworkSystem.getDirectionVector(toDir);
      if (vec && dx === -vec.dx && dy === -vec.dy) {
        return false;
      }
    }

    return true;
  }

  public static getTileStepCost(
    gx: number,
    gy: number,
    chunks: ChunkManager,
    mode: TransportMode,
    opts?: FindPathOptions
  ): number {
    const chunk = chunks.getLoadedChunkForGrid(gx, gy);
    const road = chunk ? (chunk.roadType[localTileIndex(gx, gy)] as RoadType) : RoadType.None;
    if (road === RoadType.None) {
      return mode === 'citizen' ? 1.75 : 999;
    }

    const spd = ROADS[road]?.speedMultiplier ?? 1.15;
    let cost = Math.max(0.28, 1.0 / spd);

    if (mode === 'vehicle') {
      const vClass = opts?.vehicleClass ?? 'car';
      const props = getRoadProperties(road);

      if (vClass === 'heavy_truck') {
        if (road === RoadType.Dirt) cost *= 8.5;
        else if (road === RoadType.SmallRoad) cost *= 7.5;
        else if (road === RoadType.ResidentialRoad) cost *= 7.0;
        else if (
          road === RoadType.IndustrialRoad ||
          road === RoadType.Highway ||
          road === RoadType.Expressway ||
          road === RoadType.Interchange ||
          road === RoadType.FourLane ||
          road === RoadType.SixLane ||
          road === RoadType.EightLane
        ) {
          cost *= 0.72;
        } else if (!props.heavyTruckFriendly) {
          cost *= 2.4;
        }
      } else if (vClass === 'bus') {
        if (road === RoadType.Dirt || road === RoadType.SmallRoad) cost *= 2.6;
        else if (props.widthClass === 'wide' || road === RoadType.TwoLane || road === RoadType.CommercialBlvd) {
          cost *= 0.85;
        }
      } else if (vClass === 'car') {
        if (road === RoadType.IndustrialRoad) cost *= 1.3;
        else if (road === RoadType.ResidentialRoad || road === RoadType.TwoLane || road === RoadType.CommercialBlvd) {
          cost *= 0.9;
        }
      } else if (vClass === 'emergency') {
        if (props.widthClass === 'highway' || props.widthClass === 'wide') cost *= 0.72;
      }

      if (opts?.congestionMap && opts.congestionMap.size > 0) {
        const cong = opts.congestionMap.get(tileKey(gx, gy)) ?? 0;
        if (cong > 0.05) {
          cost += cong * (vClass === 'emergency' ? 0.55 : 1.9);
        }
      }
    }

    return cost;
  }

  /**
   * Evaluates whether a computed vehicle path uses restricted narrow/residential roads.
   */
  public static inspectRouteSuitability(
    path: ReadonlyArray<GridPoint>,
    chunks: ChunkManager,
    vehicleClass: VehicleClass
  ): { suitable: boolean; restrictedTiles: number; sampleRestrictedCoord?: GridPoint } {
    if (vehicleClass !== 'heavy_truck' || path.length === 0) {
      return { suitable: true, restrictedTiles: 0 };
    }
    let restrictedTiles = 0;
    let sampleRestrictedCoord: GridPoint | undefined;
    for (let i = 0; i < path.length; i++) {
      const pt = path[i];
      const chunk = chunks.getLoadedChunkForGrid(pt.gx, pt.gy);
      if (!chunk) continue;
      const rt = chunk.roadType[localTileIndex(pt.gx, pt.gy)] as RoadType;
      if (rt === RoadType.None) continue;
      if (getRoadProperties(rt).heavyTruckRestricted) {
        restrictedTiles++;
        if (!sampleRestrictedCoord) sampleRestrictedCoord = pt;
      }
    }
    return {
      suitable: restrictedTiles === 0,
      restrictedTiles,
      sampleRestrictedCoord,
    };
  }

  /**
   * Returns all valid entrance tiles adjacent to a building footprint,
   * sorted with paved/wide road access tiles first.
   */
  public static findBuildingEntrances(
    b: BuildingInstance,
    chunks: ChunkManager,
    mode: TransportMode = 'citizen'
  ): GridPoint[] {
    const def = BUILDINGS[b.defId];
    if (!def) return [];
    const fp = getBuildingFootprint(def, b.rotation ?? 0);

    const roadEntrances: Array<{ gx: number; gy: number; score: number }> = [];
    const landEntrances: GridPoint[] = [];

    for (let dx = -1; dx <= fp.width; dx++) {
      for (let dy = -1; dy <= fp.height; dy++) {
        const isPerimeter =
          ((dx === -1 || dx === fp.width) && dy >= 0 && dy < fp.height) ||
          ((dy === -1 || dy === fp.height) && dx >= 0 && dx < fp.width);
        if (!isPerimeter) continue;

        const tx = b.gx + dx;
        const ty = b.gy + dy;
        if (!this.isTilePassable(tx, ty, chunks, mode)) continue;

        const chunk = chunks.getLoadedChunkForGrid(tx, ty);
        if (!chunk) continue;
        const rt = chunk.roadType[localTileIndex(tx, ty)] as RoadType;
        if (rt !== RoadType.None) {
          const tier = ROADS[rt]?.tierRank ?? rt;
          roadEntrances.push({ gx: tx, gy: ty, score: tier });
        } else if (mode === 'citizen') {
          landEntrances.push({ gx: tx, gy: ty });
        }
      }
    }

    roadEntrances.sort((a, c) => c.score - a.score);
    const out: GridPoint[] = roadEntrances.map((e) => ({ gx: e.gx, gy: e.gy }));
    for (const l of landEntrances) out.push(l);
    return out;
  }

  /**
   * Returns the best accessible entrance tile adjacent to a building footprint
   * (preferring highest-tier connected roads/bridges first, then dry empty land).
   */
  public static findBuildingEntrance(
    b: BuildingInstance,
    chunks: ChunkManager,
    mode: TransportMode = 'citizen'
  ): GridPoint | null {
    const list = this.findBuildingEntrances(b, chunks, mode);
    return list.length > 0 ? list[0] : null;
  }

  /**
   * Finds the closest drivable road tile to a world coordinate within maxRadius.
   */
  public static findNearestRoadTile(
    gx: number,
    gy: number,
    chunks: ChunkManager,
    maxRadius = 6
  ): GridPoint | null {
    const cx = Math.round(gx);
    const cy = Math.round(gy);
    let best: { gx: number; gy: number; dist: number } | null = null;
    for (let dy = -maxRadius; dy <= maxRadius; dy++) {
      for (let dx = -maxRadius; dx <= maxRadius; dx++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (!this.isTilePassable(tx, ty, chunks, 'vehicle')) continue;
        const d = Math.hypot(dx, dy);
        if (!best || d < best.dist) {
          best = { gx: tx, gy: ty, dist: d };
        }
      }
    }
    return best ? { gx: best.gx, gy: best.gy } : null;
  }

  /**
   * Bounded A* pathfinder returning tile waypoints (excluding start, including goal)
   * using a binary min-heap and packed integer tile keys.
   */
  public static findPath(
    startGx: number,
    startGy: number,
    goalGx: number,
    goalGy: number,
    chunks: ChunkManager,
    mode: TransportMode = 'citizen',
    maxNodes = 560,
    opts?: FindPathOptions
  ): GridPoint[] | null {
    const sx = Math.round(startGx);
    const sy = Math.round(startGy);
    const gx = Math.round(goalGx);
    const gy = Math.round(goalGy);

    if (sx === gx && sy === gy) return [{ gx, gy }];
    if (!this.isTilePassable(gx, gy, chunks, mode)) return null;

    const startKey = tileKey(sx, sy);
    const goalKey = tileKey(gx, gy);

    interface HeapNode {
      x: number;
      y: number;
      key: number;
      f: number;
      pdx: number;
      pdy: number;
    }

    const heap: HeapNode[] = [
      { x: sx, y: sy, key: startKey, f: Math.abs(gx - sx) + Math.abs(gy - sy), pdx: 0, pdy: 0 },
    ];
    const heapIndex = new Map<number, number>([[startKey, 0]]);
    const gScore = new Map<number, number>([[startKey, 0]]);
    const cameFrom = new Map<number, number>();
    const closed = new Set<number>();

    const swap = (i: number, j: number) => {
      const a = heap[i];
      const b = heap[j];
      heap[i] = b;
      heap[j] = a;
      heapIndex.set(b.key, i);
      heapIndex.set(a.key, j);
    };

    const siftUp = (i: number) => {
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[i].f >= heap[p].f) break;
        swap(i, p);
        i = p;
      }
    };

    const siftDown = (i: number) => {
      const n = heap.length;
      while (true) {
        let best = i;
        const l = i * 2 + 1;
        const r = l + 1;
        if (l < n && heap[l].f < heap[best].f) best = l;
        if (r < n && heap[r].f < heap[best].f) best = r;
        if (best === i) break;
        swap(i, best);
        i = best;
      }
    };

    const popMin = (): HeapNode => {
      const top = heap[0];
      heapIndex.delete(top.key);
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        heapIndex.set(last.key, 0);
        siftDown(0);
      }
      return top;
    };

    let expanded = 0;
    while (heap.length > 0 && expanded < maxNodes) {
      const cur = popMin();
      if (cur.key === goalKey) {
        const path: GridPoint[] = [];
        let traceKey: number | undefined = goalKey;
        while (traceKey !== undefined && traceKey !== startKey) {
          path.push({ gx: unpackTileX(traceKey), gy: unpackTileY(traceKey) });
          traceKey = cameFrom.get(traceKey);
        }
        path.reverse();
        return path;
      }

      closed.add(cur.key);
      expanded++;
      const curG = gScore.get(cur.key) ?? Infinity;

      for (let d = 0; d < 4; d++) {
        const dx = DIRS[d][0];
        const dy = DIRS[d][1];
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        const nKey = tileKey(nx, ny);
        if (closed.has(nKey)) continue;
        if (!this.isEdgeTraversable(cur.x, cur.y, nx, ny, chunks, mode)) continue;

        let stepCost = this.getTileStepCost(nx, ny, chunks, mode, opts);
        if (mode === 'vehicle' && (cur.pdx !== 0 || cur.pdy !== 0) && (dx !== cur.pdx || dy !== cur.pdy)) {
          stepCost += 0.14; // Prefer straight arterial corridors over unnecessary zig-zags
        }

        const tentativeG = curG + stepCost;
        if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
          cameFrom.set(nKey, cur.key);
          gScore.set(nKey, tentativeG);
          const f = tentativeG + (Math.abs(gx - nx) + Math.abs(gy - ny)) * 0.55;
          const existingIdx = heapIndex.get(nKey);
          if (existingIdx !== undefined) {
            heap[existingIdx].f = f;
            heap[existingIdx].pdx = dx;
            heap[existingIdx].pdy = dy;
            siftUp(existingIdx);
          } else {
            const idx = heap.length;
            heap.push({ x: nx, y: ny, key: nKey, f, pdx: dx, pdy: dy });
            heapIndex.set(nKey, idx);
            siftUp(idx);
          }
        }
      }
    }

    return null;
  }
}

