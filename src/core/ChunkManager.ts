import { DepositType, FeatureType } from '../data/trees.data';
import { ROADS } from '../data/roads.data';
import { BiomeId, ChunkData, RoadDirection, TileFlag, UtilityFlag, ZoneId } from './GameState';
import { CHUNK_SIZE, chunkKey, chunkNumKey, gridToChunk, localTileIndex } from './IsoMath';
import { WorldGenerator } from './WorldGenerator';

export const MAX_CHUNKS_IN_RAM = 48;

export const BIOME_NAMES: Record<BiomeId, string> = {
  [BiomeId.DeepWater]: 'Deep Water',
  [BiomeId.River]: 'River',
  [BiomeId.Beach]: 'Coastal Beach',
  [BiomeId.Grassland]: 'Grassland',
  [BiomeId.Fertile]: 'Fertile Floodplain',
  [BiomeId.Jungle]: 'Dense Jungle',
  [BiomeId.Forest]: 'Lush Forest',
  [BiomeId.Swamp]: 'Wetland Swamp',
  [BiomeId.Desert]: 'Arid Desert',
  [BiomeId.Mountain]: 'Highland Mountain',
};

export const BIOME_UNLOCK_COST_MULT: Record<BiomeId, number> = {
  [BiomeId.DeepWater]: 1.25,
  [BiomeId.River]: 1.1,
  [BiomeId.Beach]: 1.05,
  [BiomeId.Grassland]: 1.0,
  [BiomeId.Fertile]: 1.35,
  [BiomeId.Jungle]: 1.0,
  [BiomeId.Forest]: 1.05,
  [BiomeId.Swamp]: 1.25,
  [BiomeId.Desert]: 1.15,
  [BiomeId.Mountain]: 1.75,
};

export class ChunkManager {
  private readonly generator: WorldGenerator;
  private readonly chunks = new Map<string, ChunkData>();
  private readonly chunksByNum = new Map<number, ChunkData>();
  private readonly dirtyRenderKeys = new Set<string>();
  private readonly dirtySaveKeys = new Set<string>();
  private currentTick = 0;
  private unlockedCountCache: number | null = null;

  constructor(worldSeed: number) {
    this.generator = new WorldGenerator(worldSeed);
    // Ensure origin chunk (0,0) exists immediately
    const origin = this.getOrCreateChunk(0, 0);
    origin.isModified = true;
    this.dirtyRenderKeys.add(origin.key);
  }

  public setTick(tick: number): void {
    this.currentTick = tick;
  }

  public getOrCreateChunk(cx: number, cy: number): ChunkData {
    const nKey = chunkNumKey(cx, cy);
    let chunk = this.chunksByNum.get(nKey);
    if (!chunk) {
      const key = chunkKey(cx, cy);
      chunk = this.generator.generateChunk(cx, cy, this.currentTick);
      this.chunks.set(key, chunk);
      this.chunksByNum.set(nKey, chunk);
      this.evictUnmodifiedIfNeeded();
    }
    chunk.lastTouchedTick = this.currentTick;
    return chunk;
  }

  public getLoadedChunk(cx: number, cy: number): ChunkData | undefined {
    return this.chunksByNum.get(chunkNumKey(cx, cy));
  }

  public getLoadedChunkForGrid(gx: number, gy: number): ChunkData | undefined {
    return this.chunksByNum.get(chunkNumKey(gx >> 4, gy >> 4));
  }

  public loadPersistedChunks(persisted: ChunkData[]): void {
    this.chunks.clear();
    this.chunksByNum.clear();
    this.unlockedCountCache = null;
    for (const c of persisted) {
      // Safely sanitize any obsolete RoadType (e.g. legacy Connector) or legacy forestry TileFlag bits
      for (let i = 0; i < c.roadType.length; i++) {
        const rt = c.roadType[i];
        if (rt !== 0 && !ROADS[rt as keyof typeof ROADS]) {
          c.roadType[i] = 0;
        }
        c.flags[i] &= TileFlag.Unlocked | TileFlag.Explored | TileFlag.Irrigated;
      }
      c.isModified = true;
      this.chunks.set(c.key, c);
      this.chunksByNum.set(chunkNumKey(c.cx, c.cy), c);
      this.dirtyRenderKeys.add(c.key);
    }
    if (!this.chunksByNum.has(chunkNumKey(0, 0))) {
      this.getOrCreateChunk(0, 0);
    }
  }

  public getModifiedChunks(): ChunkData[] {
    const out: ChunkData[] = [];
    for (const c of this.chunks.values()) {
      if (c.isModified) out.push(c);
    }
    return out;
  }

  public getAllLoadedChunks(): ChunkData[] {
    return Array.from(this.chunks.values());
  }

  public markChunkModified(cx: number, cy: number): void {
    const c = this.getOrCreateChunk(cx, cy);
    c.isModified = true;
    this.dirtyRenderKeys.add(c.key);
    this.dirtySaveKeys.add(c.key);
  }

  public markRenderDirty(cx: number, cy: number): void {
    this.dirtyRenderKeys.add(chunkKey(cx, cy));
  }

  public markRoadNeighborsRenderDirty(gx: number, gy: number): void {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = gridToChunk(gx + dx, gy + dy);
        this.dirtyRenderKeys.add(chunkKey(n.cx, n.cy));
      }
    }
  }

  public peekDirtyRenderCount(): number {
    return this.dirtyRenderKeys.size;
  }

  public consumeDirtyRenderKeys(): string[] {
    const keys = Array.from(this.dirtyRenderKeys);
    this.dirtyRenderKeys.clear();
    return keys;
  }

  public peekDirtySaveKeys(): string[] {
    return Array.from(this.dirtySaveKeys);
  }

  public clearDirtySaveKeys(keys: string[]): void {
    for (const k of keys) {
      this.dirtySaveKeys.delete(k);
    }
  }

  public consumeDirtySaveKeys(): string[] {
    const keys = Array.from(this.dirtySaveKeys);
    this.dirtySaveKeys.clear();
    return keys;
  }

  public getLoadedChunkCount(): number {
    return this.chunks.size;
  }

  public getTile(gx: number, gy: number): { chunk: ChunkData; index: number } {
    const { cx, cy, index } = gridToChunk(gx, gy);
    const chunk = this.getOrCreateChunk(cx, cy);
    return { chunk, index };
  }

  public isUnlocked(gx: number, gy: number): boolean {
    const chunk = this.getLoadedChunkForGrid(gx, gy);
    if (!chunk) return false;
    return (chunk.flags[localTileIndex(gx, gy)] & TileFlag.Unlocked) !== 0;
  }

  public isExplored(gx: number, gy: number): boolean {
    const { chunk, index } = this.getTile(gx, gy);
    return (chunk.flags[index] & TileFlag.Explored) !== 0;
  }

  public isWaterBiome(biome: BiomeId): boolean {
    return biome === BiomeId.DeepWater || biome === BiomeId.River;
  }

  public isAdjacentToUnlocked(gx: number, gy: number): boolean {
    return (
      this.isUnlocked(gx + 1, gy) ||
      this.isUnlocked(gx - 1, gy) ||
      this.isUnlocked(gx, gy + 1) ||
      this.isUnlocked(gx, gy - 1)
    );
  }

  public canUnlockTile(gx: number, gy: number): boolean {
    return !this.isUnlocked(gx, gy) && this.isAdjacentToUnlocked(gx, gy);
  }

  public computeUnlockCost(gx: number, gy: number, totalUnlocked?: number): number {
    const { chunk, index } = this.getTile(gx, gy);
    const biome = chunk.biomeId[index] as BiomeId;
    const d = Math.abs(gx - 2) + Math.abs(gy - 1.5);
    const mult = BIOME_UNLOCK_COST_MULT[biome] ?? 1.0;
    const unlockedCount = totalUnlocked ?? this.countUnlockedTiles();
    const expansionFactor = 1 + Math.max(0, unlockedCount - 20) * 0.012;
    return Math.round((35 + 11 * Math.pow(Math.max(1, d), 1.15)) * mult * expansionFactor);
  }

  public canUnlockChunk(cx: number, cy: number): boolean {
    const chunk = this.getOrCreateChunk(cx, cy);
    let hasLocked = false;
    let touchesUnlocked = false;
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const idx = ly * CHUNK_SIZE + lx;
        if ((chunk.flags[idx] & TileFlag.Unlocked) === 0) {
          hasLocked = true;
          const gx = cx * CHUNK_SIZE + lx;
          const gy = cy * CHUNK_SIZE + ly;
          if (this.isAdjacentToUnlocked(gx, gy)) {
            touchesUnlocked = true;
          }
        }
      }
    }
    return hasLocked && touchesUnlocked;
  }

  public getChunkUnlockCost(cx: number, cy: number): { lockedCount: number; cost: number } {
    const chunk = this.getOrCreateChunk(cx, cy);
    const totalUnlocked = this.countUnlockedTiles();
    let lockedCount = 0;
    let sumCost = 0;
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const idx = ly * CHUNK_SIZE + lx;
        if ((chunk.flags[idx] & TileFlag.Unlocked) === 0) {
          const gx = cx * CHUNK_SIZE + lx;
          const gy = cy * CHUNK_SIZE + ly;
          sumCost += this.computeUnlockCost(gx, gy, totalUnlocked + lockedCount);
          lockedCount++;
        }
      }
    }
    // 20% bulk discount when expanding an entire 16x16 chunk
    return {
      lockedCount,
      cost: lockedCount > 0 ? Math.round(sumCost * 0.8) : 0,
    };
  }

  public unlockChunk(cx: number, cy: number, cityId = 1): number {
    const chunk = this.getOrCreateChunk(cx, cy);
    let newlyUnlocked = 0;
    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const idx = ly * CHUNK_SIZE + lx;
        if ((chunk.flags[idx] & TileFlag.Unlocked) === 0) {
          const gx = cx * CHUNK_SIZE + lx;
          const gy = cy * CHUNK_SIZE + ly;
          chunk.flags[idx] |= TileFlag.Unlocked | TileFlag.Explored;
          if (chunk.cityRef[idx] === 0) {
            chunk.cityRef[idx] = cityId;
          }
          const biome = chunk.biomeId[idx] as BiomeId;
          if (!this.isWaterBiome(biome)) {
            chunk.elevation[idx] = 2;
          }
          newlyUnlocked++;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              const n = gridToChunk(gx + dx, gy + dy);
              const nc = this.getOrCreateChunk(n.cx, n.cy);
              if ((nc.flags[n.index] & TileFlag.Explored) === 0) {
                nc.flags[n.index] |= TileFlag.Explored;
                nc.isModified = true;
                this.dirtyRenderKeys.add(nc.key);
                this.dirtySaveKeys.add(nc.key);
              }
            }
          }
        }
      }
    }
    if (newlyUnlocked > 0) {
      if (this.unlockedCountCache !== null) {
        this.unlockedCountCache += newlyUnlocked;
      }
      this.markChunkModified(cx, cy);
    }
    return newlyUnlocked;
  }

  public unlockTile(gx: number, gy: number, cityId = 1): void {
    const { cx, cy, index } = gridToChunk(gx, gy);
    const chunk = this.getOrCreateChunk(cx, cy);
    const wasUnlocked = (chunk.flags[index] & TileFlag.Unlocked) !== 0;
    chunk.flags[index] |= TileFlag.Unlocked | TileFlag.Explored;
    if (!wasUnlocked && this.unlockedCountCache !== null) {
      this.unlockedCountCache += 1;
    }
    if (chunk.cityRef[index] === 0) {
      chunk.cityRef[index] = cityId;
    }
    // Owned land becomes flat buildable terrain (water stays recessed at elev 0/1)
    const biome = chunk.biomeId[index] as BiomeId;
    if (!this.isWaterBiome(biome)) {
      chunk.elevation[index] = 2;
    }
    this.markChunkModified(cx, cy);

    // Reveal 2-tile exploration ring around newly unlocked tile & refresh adjacent chunk borders
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const n = gridToChunk(gx + dx, gy + dy);
        const nc = this.getOrCreateChunk(n.cx, n.cy);
        if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) {
          this.dirtyRenderKeys.add(nc.key);
        }
        if ((nc.flags[n.index] & TileFlag.Explored) === 0) {
          nc.flags[n.index] |= TileFlag.Explored;
          nc.isModified = true;
          this.dirtyRenderKeys.add(nc.key);
          this.dirtySaveKeys.add(nc.key);
        }
      }
    }
  }

  public getTileCityId(gx: number, gy: number): number {
    const { chunk, index } = this.getTile(gx, gy);
    if (chunk.cityRef[index] > 0) return chunk.cityRef[index];
    return (chunk.flags[index] & TileFlag.Unlocked) !== 0 ? 1 : 0;
  }

  public setTileCityId(gx: number, gy: number, cityId: number): boolean {
    const { cx, cy, index } = gridToChunk(gx, gy);
    const chunk = this.getOrCreateChunk(cx, cy);
    if ((chunk.flags[index] & TileFlag.Unlocked) === 0) return false;
    chunk.cityRef[index] = Math.max(1, cityId);
    this.markChunkModified(cx, cy);
    return true;
  }

  public getTileZone(gx: number, gy: number): ZoneId {
    const { chunk, index } = this.getTile(gx, gy);
    return chunk.zoneType[index] as ZoneId;
  }

  public setTileZone(gx: number, gy: number, zoneId: ZoneId): boolean {
    const { cx, cy, index } = gridToChunk(gx, gy);
    const chunk = this.getOrCreateChunk(cx, cy);
    if ((chunk.flags[index] & TileFlag.Unlocked) === 0) return false;
    chunk.zoneType[index] = zoneId;
    this.markChunkModified(cx, cy);
    return true;
  }

  public getTileUtility(gx: number, gy: number): number {
    const { chunk, index } = this.getTile(gx, gy);
    return chunk.utilityNet[index];
  }

  public setTileUtilityFlag(gx: number, gy: number, flag: UtilityFlag, enabled: boolean): boolean {
    const { cx, cy, index } = gridToChunk(gx, gy);
    const chunk = this.getOrCreateChunk(cx, cy);
    if ((chunk.flags[index] & TileFlag.Unlocked) === 0) return false;
    if (enabled) {
      chunk.utilityNet[index] |= flag;
    } else {
      chunk.utilityNet[index] &= ~flag;
    }
    this.markChunkModified(cx, cy);
    return true;
  }

  public getRoadDirection(gx: number, gy: number): RoadDirection {
    const chunk = this.getLoadedChunkForGrid(gx, gy);
    if (!chunk) return RoadDirection.TwoWay;
    return (chunk.roadDir?.[localTileIndex(gx, gy)] ?? RoadDirection.TwoWay) as RoadDirection;
  }

  public setRoadDirection(gx: number, gy: number, dir: RoadDirection): boolean {
    const { cx, cy, index } = gridToChunk(gx, gy);
    const chunk = this.getOrCreateChunk(cx, cy);
    if (!chunk.roadDir) {
      chunk.roadDir = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    }
    if (chunk.roadType[index] === 0) return false;
    chunk.roadDir[index] = dir;
    this.markChunkModified(cx, cy);
    this.markRoadNeighborsRenderDirty(gx, gy);
    return true;
  }

  public countUnlockedTilesForCity(cityId: number): number {
    let count = 0;
    for (const c of this.chunks.values()) {
      if (!c.isModified) continue;
      for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
        if ((c.flags[i] & TileFlag.Unlocked) !== 0) {
          const owner = c.cityRef[i] > 0 ? c.cityRef[i] : 1;
          if (owner === cityId) count++;
        }
      }
    }
    return count;
  }

  public getFootprintDepositTotal(
    gx: number,
    gy: number,
    width: number,
    height: number,
    depositType: DepositType
  ): number {
    let total = 0;
    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        const { chunk, index } = this.getTile(gx + dx, gy + dy);
        if (chunk.depositType[index] === depositType) {
          total += chunk.depositQty[index];
        }
      }
    }
    return total;
  }

  public depleteDepositInFootprint(
    gx: number,
    gy: number,
    width: number,
    height: number,
    depositType: DepositType,
    amount: number
  ): boolean {
    if (amount <= 0) return true;
    for (let dx = 0; dx < width; dx++) {
      for (let dy = 0; dy < height; dy++) {
        const tx = gx + dx;
        const ty = gy + dy;
        const { cx, cy, index } = gridToChunk(tx, ty);
        const chunk = this.getOrCreateChunk(cx, cy);
        if (chunk.depositType[index] === depositType && chunk.depositQty[index] > 0) {
          const take = Math.min(chunk.depositQty[index], Math.max(1, Math.round(amount)));
          chunk.depositQty[index] -= take;
          this.markChunkModified(cx, cy);
          return true;
        }
      }
    }
    return false;
  }

  public getUnlockedGridBounds(): {
    minGx: number;
    maxGx: number;
    minGy: number;
    maxGy: number;
    count: number;
  } {
    let minGx = Infinity;
    let maxGx = -Infinity;
    let minGy = Infinity;
    let maxGy = -Infinity;
    let count = 0;

    for (const c of this.chunks.values()) {
      if (!c.isModified) continue;
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const idx = ly * CHUNK_SIZE + lx;
          if ((c.flags[idx] & TileFlag.Unlocked) !== 0) {
            const gx = c.cx * CHUNK_SIZE + lx;
            const gy = c.cy * CHUNK_SIZE + ly;
            if (gx < minGx) minGx = gx;
            if (gx > maxGx) maxGx = gx;
            if (gy < minGy) minGy = gy;
            if (gy > maxGy) maxGy = gy;
            count++;
          }
        }
      }
    }

    if (count === 0) {
      return { minGx: 0, maxGx: 4, minGy: 0, maxGy: 3, count: 20 };
    }
    return { minGx, maxGx, minGy, maxGy, count };
  }

  public countUnlockedTiles(): number {
    if (this.unlockedCountCache !== null) {
      return this.unlockedCountCache;
    }
    let count = 0;
    for (const c of this.chunks.values()) {
      if (!c.isModified) continue;
      for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
        if ((c.flags[i] & TileFlag.Unlocked) !== 0) count++;
      }
    }
    this.unlockedCountCache = count;
    return count;
  }

  private evictUnmodifiedIfNeeded(): void {
    if (this.chunks.size <= MAX_CHUNKS_IN_RAM) return;
    const candidates = Array.from(this.chunks.values())
      .filter((c) => !c.isModified)
      .sort((a, b) => a.lastTouchedTick - b.lastTouchedTick);

    for (const c of candidates) {
      if (this.chunks.size <= MAX_CHUNKS_IN_RAM) break;
      this.chunks.delete(c.key);
      this.chunksByNum.delete(chunkNumKey(c.cx, c.cy));
    }
  }

  /**
   * Scans explored/nearby chunks to locate the closest matching mineral deposit,
   * river/ocean coast tile, or unexplored Ancient Ruin for camera navigation.
   */
  public findNearestTarget(
    fromGx: number,
    fromGy: number,
    opts: { depositType?: number; coast?: boolean; ruin?: boolean }
  ): { gx: number; gy: number; unlocked: boolean } | null {
    let best: { gx: number; gy: number; unlocked: boolean; dist: number } | null = null;
    const searchRadius = 26;

    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        const gx = fromGx + dx;
        const gy = fromGy + dy;
        const { chunk, index } = this.getTile(gx, gy);
        const unlocked = (chunk.flags[index] & TileFlag.Unlocked) !== 0;
        let match = false;

        if (
          opts.depositType &&
          chunk.depositType[index] === opts.depositType &&
          chunk.depositQty[index] > 0 &&
          chunk.buildingRef[index] === -1
        ) {
          match = true;
        } else if (opts.ruin && chunk.featureType[index] === 8) {
          match = true;
        } else if (opts.coast) {
          const bio = chunk.biomeId[index] as BiomeId;
          if (!this.isWaterBiome(bio) && chunk.buildingRef[index] === -1) {
            for (const [nx, ny] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nb = this.getTile(gx + nx, gy + ny);
              if (this.isWaterBiome(nb.chunk.biomeId[nb.index] as BiomeId)) {
                match = true;
                break;
              }
            }
          }
        }

        if (!match) continue;
        // Prefer unlocked matching tiles first, then closest Manhattan distance
        const dist = Math.abs(dx) + Math.abs(dy) + (unlocked ? 0 : 12);
        if (!best || dist < best.dist) {
          best = { gx, gy, unlocked, dist };
        }
      }
    }

    return best ? { gx: best.gx, gy: best.gy, unlocked: best.unlocked } : null;
  }

  public terraformTile(
    gx: number,
    gy: number,
    action: 'to_water' | 'to_land',
    confirmDemolish = false
  ): { ok: boolean; reason?: string; needsConfirm?: boolean; blocker?: 'mountain' | 'building' | 'road' } {
    const { cx, cy, index } = gridToChunk(gx, gy);
    const chunk = this.getOrCreateChunk(cx, cy);
    const isUnlocked = (chunk.flags[index] & TileFlag.Unlocked) !== 0;
    if (!isUnlocked) {
      return { ok: false, reason: 'Unlock tile first before terraforming' };
    }
    if ((chunk.biomeId[index] as BiomeId) === BiomeId.Mountain) {
      return {
        ok: false,
        blocker: 'mountain',
        reason: 'Mountains are permanent terrain and cannot be terraformed',
      };
    }
    if (chunk.buildingRef[index] !== -1 && !confirmDemolish) {
      return {
        ok: false,
        needsConfirm: true,
        blocker: 'building',
        reason: 'Tile has a building — confirm demolition to terraform',
      };
    }
    if (chunk.roadType[index] !== 0 && !confirmDemolish) {
      return {
        ok: false,
        needsConfirm: true,
        blocker: 'road',
        reason: 'Tile has a road or rail — confirm removal to terraform',
      };
    }

    const currentlyWater = this.isWaterBiome(chunk.biomeId[index] as BiomeId);
    if (action === 'to_water' && currentlyWater) {
      return { ok: false, reason: 'Tile is already water' };
    }
    if (action === 'to_land' && !currentlyWater) {
      return { ok: false, reason: 'Tile is already dry land' };
    }

    if (action === 'to_water') {
      chunk.biomeId[index] = BiomeId.River;
      chunk.elevation[index] = 1;
      chunk.featureType[index] = 0;
      chunk.featureHp[index] = 0;
    } else {
      // Inherit the dominant surrounding dry-land biome so reclaimed land keeps true biome colors
      const counts = new Map<BiomeId, number>();
      for (const [dx, dy] of [
        [1, 0], [-1, 0], [0, 1], [0, -1],
        [1, 1], [-1, 1], [1, -1], [-1, -1],
      ]) {
        const nb = this.getTile(gx + dx, gy + dy);
        const nbBio = nb.chunk.biomeId[nb.index] as BiomeId;
        if (!this.isWaterBiome(nbBio) && nbBio !== BiomeId.Mountain) {
          counts.set(nbBio, (counts.get(nbBio) ?? 0) + 1);
        }
      }
      let bestBiome: BiomeId = BiomeId.Grassland;
      let bestCount = 0;
      for (const [bio, cnt] of counts.entries()) {
        if (cnt > bestCount) {
          bestBiome = bio;
          bestCount = cnt;
        }
      }
      chunk.biomeId[index] = bestBiome;
      chunk.elevation[index] = 2;
    }
    this.markChunkModified(cx, cy);
    this.dirtyRenderKeys.add(chunk.key);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = gridToChunk(gx + dx, gy + dy);
      this.dirtyRenderKeys.add(chunkKey(n.cx, n.cy));
    }
    return { ok: true };
  }

  public getRectangleUnlockQuote(
    startGx: number,
    startGy: number,
    width: number,
    height: number
  ): {
    valid: boolean;
    reason?: string;
    startGx: number;
    startGy: number;
    width: number;
    height: number;
    totalTiles: number;
    unlockedAlready: number;
    toUnlockCount: number;
    totalCost: number;
  } {
    const sx = Math.floor(startGx);
    const sy = Math.floor(startGy);
    const w = Math.floor(width);
    const h = Math.floor(height);

    if (!Number.isFinite(sx) || !Number.isFinite(sy) || w < 1 || h < 1) {
      return {
        valid: false,
        reason: 'Width and Height must be at least 1 tile',
        startGx: sx,
        startGy: sy,
        width: w,
        height: h,
        totalTiles: 0,
        unlockedAlready: 0,
        toUnlockCount: 0,
        totalCost: 0,
      };
    }
    if (w > 48 || h > 48 || w * h > 1600) {
      return {
        valid: false,
        reason: 'Max rectangle size is 48×48 (up to 1,600 tiles per purchase)',
        startGx: sx,
        startGy: sy,
        width: w,
        height: h,
        totalTiles: w * h,
        unlockedAlready: 0,
        toUnlockCount: 0,
        totalCost: 0,
      };
    }

    const baseUnlocked = this.countUnlockedTiles();
    let unlockedAlready = 0;
    let toUnlockCount = 0;
    let totalCost = 0;

    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tx = sx + dx;
        const ty = sy + dy;
        if (this.isUnlocked(tx, ty)) {
          unlockedAlready++;
        } else {
          totalCost += this.computeUnlockCost(tx, ty, baseUnlocked + toUnlockCount);
          toUnlockCount++;
        }
      }
    }

    if (toUnlockCount === 0) {
      return {
        valid: false,
        reason: 'All tiles in this rectangle are already unlocked',
        startGx: sx,
        startGy: sy,
        width: w,
        height: h,
        totalTiles: w * h,
        unlockedAlready,
        toUnlockCount: 0,
        totalCost: 0,
      };
    }

    return {
      valid: true,
      startGx: sx,
      startGy: sy,
      width: w,
      height: h,
      totalTiles: w * h,
      unlockedAlready,
      toUnlockCount,
      totalCost,
    };
  }

  public unlockRectangle(startGx: number, startGy: number, width: number, height: number, cityId = 1): number {
    const sx = Math.floor(startGx);
    const sy = Math.floor(startGy);
    const w = Math.floor(width);
    const h = Math.floor(height);
    let newlyUnlocked = 0;
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const tx = sx + dx;
        const ty = sy + dy;
        if (!this.isUnlocked(tx, ty)) {
          this.unlockTile(tx, ty, cityId);
          newlyUnlocked++;
        }
      }
    }
    return newlyUnlocked;
  }

  public applyTerrainBrush(
    gx: number,
    gy: number,
    radius: number,
    brush: 'water' | 'land' | 'zone',
    zoneId: ZoneId = ZoneId.None
  ): { changed: number; skippedMountains: number; skippedLocked: number; skippedOccupied: number } {
    const r = Math.max(0, Math.min(6, Math.floor(radius)));
    let changed = 0;
    let skippedMountains = 0;
    let skippedLocked = 0;
    let skippedOccupied = 0;

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (r > 0 && dx * dx + dy * dy > r * r + 0.5) continue;
        const tx = gx + dx;
        const ty = gy + dy;
        const { chunk, index } = this.getTile(tx, ty);
        const unlocked = (chunk.flags[index] & TileFlag.Unlocked) !== 0;

        if (!unlocked) {
          skippedLocked++;
          continue;
        }

        if (brush === 'zone') {
          if (chunk.zoneType[index] !== zoneId) {
            this.setTileZone(tx, ty, zoneId);
            changed++;
          }
          continue;
        }

        if ((chunk.biomeId[index] as BiomeId) === BiomeId.Mountain) {
          skippedMountains++;
          continue;
        }

        if (chunk.buildingRef[index] !== -1 || chunk.roadType[index] !== 0) {
          skippedOccupied++;
          continue;
        }

        const res = this.terraformTile(tx, ty, brush === 'water' ? 'to_water' : 'to_land', false);
        if (res.ok) changed++;
      }
    }

    return { changed, skippedMountains, skippedLocked, skippedOccupied };
  }

  public getLandStatistics(): {
    totalLandBlocks: number;
    totalOwnedLandBlocks: number;
    totalUnlockedLandBlocks: number;
    totalLockedLandBlocks: number;
    totalWaterAreaBlocks: number;
    totalOwnedLandAreaBlocks: number;
    totalLandValue: number;
  } {
    const unlockedCount = this.countUnlockedTiles();
    let totalLandBlocks = 0;
    let totalOwnedLandBlocks = 0;
    let totalUnlockedInLoaded = 0;
    let totalLockedLandBlocks = 0;
    let totalWaterAreaBlocks = 0;
    let totalLandValue = 0;

    for (const chunk of this.chunks.values()) {
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const idx = ly * CHUNK_SIZE + lx;
          const biome = chunk.biomeId[idx] as BiomeId;
          const isWater = this.isWaterBiome(biome);
          const isUnlocked = (chunk.flags[idx] & TileFlag.Unlocked) !== 0;

          if (isWater) {
            totalWaterAreaBlocks += 1;
          } else {
            totalLandBlocks += 1;
            if (isUnlocked) {
              totalOwnedLandBlocks += 1;
            }
          }

          if (isUnlocked) {
            totalUnlockedInLoaded += 1;
            const gx = chunk.cx * CHUNK_SIZE + lx;
            const gy = chunk.cy * CHUNK_SIZE + ly;
            totalLandValue += this.computeUnlockCost(gx, gy, unlockedCount);
          } else {
            totalLockedLandBlocks += 1;
          }
        }
      }
    }

    return {
      totalLandBlocks,
      totalOwnedLandBlocks,
      totalUnlockedLandBlocks: Math.max(unlockedCount, totalUnlockedInLoaded),
      totalLockedLandBlocks,
      totalWaterAreaBlocks,
      totalOwnedLandAreaBlocks: totalOwnedLandBlocks,
      totalLandValue,
    };
  }
}
