import type { ChunkManager } from '../core/ChunkManager';
import { BiomeId, GrowingTreeRecord, TileFlag, WorldEngineState } from '../core/GameState';
import { CHUNK_SIZE, gridToChunk } from '../core/IsoMath';
import { RoadType } from '../data/roads.data';
import { FeatureType, TREE_SPECIES } from '../data/trees.data';
import type { ClimateModifiers } from './EnvironmentSystem';

const STAGE_0_TO_1_SEC = 35; // Sapling -> MediumTree
const STAGE_1_TO_MATURE_SEC = 45; // MediumTree -> Mature Tree

export class TreeGrowthSystem {
  public static pickMatureTreeForBiome(biome: BiomeId, gx: number, gy: number): FeatureType {
    const hash = Math.abs((gx * 73856093) ^ (gy * 19349663)) % 100;
    switch (biome) {
      case BiomeId.Jungle:
        if (hash < 45) return FeatureType.JungleHardwood;
        if (hash < 75) return FeatureType.FruitTree;
        return FeatureType.TropicalPalm;
      case BiomeId.Forest:
        if (hash < 50) return FeatureType.OakTree;
        if (hash < 85) return FeatureType.BirchTree;
        return FeatureType.FruitTree;
      case BiomeId.Swamp:
        return FeatureType.CypressTree;
      case BiomeId.Desert:
        return FeatureType.AcaciaTree;
      case BiomeId.Mountain:
        return FeatureType.PineTree;
      case BiomeId.Beach:
        return FeatureType.TropicalPalm;
      case BiomeId.Fertile:
      case BiomeId.Grassland:
      default:
        if (hash < 45) return FeatureType.OakTree;
        if (hash < 75) return FeatureType.FruitTree;
        return FeatureType.BirchTree;
    }
  }

  public static registerSapling(
    state: WorldEngineState,
    chunks: ChunkManager,
    gx: number,
    gy: number
  ): void {
    state.growingTrees ??= [];
    const { chunk, index } = chunks.getTile(gx, gy);
    const biome = chunk.biomeId[index] as BiomeId;
    const matureType = this.pickMatureTreeForBiome(biome, gx, gy);

    const existing = state.growingTrees.find((t) => t.gx === gx && t.gy === gy);
    if (existing) {
      existing.stage = 0;
      existing.elapsedSec = 0;
      existing.matureType = matureType;
      return;
    }

    state.growingTrees.push({
      gx,
      gy,
      stage: 0,
      elapsedSec: 0,
      matureType,
    });
  }

  public static removeAt(state: WorldEngineState, gx: number, gy: number): void {
    if (!state.growingTrees || state.growingTrees.length === 0) return;
    const idx = state.growingTrees.findIndex((t) => t.gx === gx && t.gy === gy);
    if (idx !== -1) {
      state.growingTrees.splice(idx, 1);
    }
  }

  public static removeFootprint(
    state: WorldEngineState,
    gx: number,
    gy: number,
    width: number,
    height: number
  ): void {
    if (!state.growingTrees || state.growingTrees.length === 0) return;
    state.growingTrees = state.growingTrees.filter(
      (t) => t.gx < gx || t.gx >= gx + width || t.gy < gy || t.gy >= gy + height
    );
  }

  /**
   * Re-indexes any pre-existing unlocked Sapling or MediumTree tiles found in modified/loaded chunks
   * (e.g. legacy v2 saves that didn't track growingTrees yet).
   */
  public static backfillFromLoadedChunks(state: WorldEngineState, chunks: ChunkManager): void {
    state.growingTrees ??= [];
    const tracked = new Set(state.growingTrees.map((t) => `${t.gx}:${t.gy}`));
    for (const chunk of chunks.getAllLoadedChunks()) {
      for (let ly = 0; ly < CHUNK_SIZE; ly++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const idx = ly * CHUNK_SIZE + lx;
          if ((chunk.flags[idx] & TileFlag.Unlocked) === 0) continue;
          const ft = chunk.featureType[idx] as FeatureType;
          if (ft !== FeatureType.Sapling && ft !== FeatureType.MediumTree) continue;
          const gx = chunk.cx * CHUNK_SIZE + lx;
          const gy = chunk.cy * CHUNK_SIZE + ly;
          const key = `${gx}:${gy}`;
          if (tracked.has(key)) continue;
          tracked.add(key);
          const biome = chunk.biomeId[idx] as BiomeId;
          state.growingTrees.push({
            gx,
            gy,
            stage: ft === FeatureType.MediumTree ? 1 : 0,
            elapsedSec: 0,
            matureType: this.pickMatureTreeForBiome(biome, gx, gy),
          });
        }
      }
    }
  }

  public static getGrowthInfo(
    state: WorldEngineState,
    gx: number,
    gy: number,
    ft: FeatureType
  ): { stage: 0 | 1; progressPct: number; stageLabel: string; matureName: string } | null {
    if (ft !== FeatureType.Sapling && ft !== FeatureType.MediumTree) return null;
    const entry = state.growingTrees?.find((t) => t.gx === gx && t.gy === gy);
    const stage: 0 | 1 = ft === FeatureType.MediumTree ? 1 : 0;
    const duration = stage === 0 ? STAGE_0_TO_1_SEC : STAGE_1_TO_MATURE_SEC;
    const elapsed = entry ? entry.elapsedSec : 0;
    const pct = Math.max(0, Math.min(99, Math.round((elapsed / duration) * 100)));
    const matureDef = entry ? TREE_SPECIES[entry.matureType] : undefined;
    return {
      stage,
      progressPct: pct,
      stageLabel: stage === 0 ? 'Stage 1/3 · Sapling' : 'Stage 2/3 · Young Tree',
      matureName: matureDef?.name ?? 'Mature Tree',
    };
  }

  public static tick(
    state: WorldEngineState,
    chunks: ChunkManager,
    climate?: Pick<ClimateModifiers, 'treeRegrowthMult'>
  ): { maturedCount: number } {
    const list = state.growingTrees;
    if (!list || list.length === 0) return { maturedCount: 0 };

    const climateMult = Math.max(0.4, climate?.treeRegrowthMult ?? 1.0);
    const keep: GrowingTreeRecord[] = [];
    let maturedCount = 0;

    for (let i = 0; i < list.length; i++) {
      const rec = list[i];
      if (!chunks.isUnlocked(rec.gx, rec.gy)) continue;

      const { cx, cy, index } = gridToChunk(rec.gx, rec.gy);
      const chunk = chunks.getOrCreateChunk(cx, cy);
      if (
        chunk.buildingRef[index] !== -1 ||
        chunk.roadType[index] !== RoadType.None ||
        chunks.isWaterBiome(chunk.biomeId[index] as BiomeId)
      ) {
        continue;
      }

      const ft = chunk.featureType[index] as FeatureType;
      if (ft !== FeatureType.Sapling && ft !== FeatureType.MediumTree) {
        continue;
      }

      const expectedStage: 0 | 1 = ft === FeatureType.MediumTree ? 1 : 0;
      if (rec.stage !== expectedStage) {
        rec.stage = expectedStage;
        rec.elapsedSec = 0;
      }

      const biome = chunk.biomeId[index] as BiomeId;
      const biomeMult =
        biome === BiomeId.Jungle || biome === BiomeId.Fertile
          ? 1.25
          : biome === BiomeId.Desert
            ? 0.75
            : 1.0;

      rec.elapsedSec += climateMult * biomeMult;

      if (rec.stage === 0 && rec.elapsedSec >= STAGE_0_TO_1_SEC) {
        rec.stage = 1;
        rec.elapsedSec = 0;
        chunk.featureType[index] = FeatureType.MediumTree;
        chunk.featureHp[index] = TREE_SPECIES[FeatureType.MediumTree]?.maxHp ?? 26;
        chunks.markChunkModified(cx, cy);
        keep.push(rec);
      } else if (rec.stage === 1 && rec.elapsedSec >= STAGE_1_TO_MATURE_SEC) {
        const matureFt = (TREE_SPECIES[rec.matureType]
          ? rec.matureType
          : FeatureType.OakTree) as FeatureType;
        chunk.featureType[index] = matureFt;
        chunk.featureHp[index] = TREE_SPECIES[matureFt]?.maxHp ?? 45;
        chunks.markChunkModified(cx, cy);
        maturedCount += 1;
        // Mature tree reached; no longer needs growth tracking.
      } else {
        keep.push(rec);
      }
    }

    state.growingTrees = keep;
    return { maturedCount };
  }
}
