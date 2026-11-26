import { DepositType, FeatureType, TREE_SPECIES } from '../data/trees.data';
import { BiomeId, ChunkData, TileFlag } from './GameState';
import { CHUNK_SIZE, chunkKey, chunkToGrid, hashCoords, mulberry32 } from './IsoMath';

export class WorldGenerator {
  private readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  private valueNoise2D(x: number, y: number, scale: number, salt: number): number {
    const sx = x / scale;
    const sy = y / scale;
    const ix = Math.floor(sx);
    const iy = Math.floor(sy);
    const fx = sx - ix;
    const fy = sy - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);

    const n00 = (hashCoords(this.seed + salt, ix, iy) & 0xffff) / 65535;
    const n10 = (hashCoords(this.seed + salt, ix + 1, iy) & 0xffff) / 65535;
    const n01 = (hashCoords(this.seed + salt, ix, iy + 1) & 0xffff) / 65535;
    const n11 = (hashCoords(this.seed + salt, ix + 1, iy + 1) & 0xffff) / 65535;

    const nx0 = n00 + (n10 - n00) * ux;
    const nx1 = n01 + (n11 - n01) * ux;
    return nx0 + (nx1 - nx0) * uy;
  }

  private fbm(x: number, y: number, baseScale: number, salt: number): number {
    const o1 = this.valueNoise2D(x, y, baseScale, salt) * 0.58;
    const o2 = this.valueNoise2D(x, y, baseScale * 0.5, salt + 101) * 0.28;
    const o3 = this.valueNoise2D(x, y, baseScale * 0.25, salt + 211) * 0.14;
    return o1 + o2 + o3;
  }

  /**
   * Exact 20 contiguous starting unlocked tiles (5x4 = 20 tiles) at Chunk (0,0).
   */
  public static isStartingTile(gx: number, gy: number): boolean {
    return gx >= 0 && gx <= 4 && gy >= 0 && gy <= 3;
  }

  public generateChunk(cx: number, cy: number, tick = 0): ChunkData {
    const len = CHUNK_SIZE * CHUNK_SIZE;
    const biomeId = new Uint8Array(len);
    const elevation = new Uint8Array(len);
    const moisture = new Uint8Array(len);
    const flags = new Uint8Array(len);
    const featureType = new Uint8Array(len);
    const featureHp = new Uint16Array(len);
    const depositType = new Uint8Array(len);
    const depositQty = new Uint16Array(len);
    const roadType = new Uint8Array(len);
    const buildingRef = new Int32Array(len).fill(-1);
    const pollution = new Uint8Array(len);
    const utilityNet = new Uint8Array(len);
    const cityRef = new Uint16Array(len);
    const zoneType = new Uint8Array(len);
    const roadDir = new Uint8Array(len);

    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const idx = ly * CHUNK_SIZE + lx;
        const { gx, gy } = chunkToGrid(cx, cy, lx, ly);
        const rng = mulberry32(hashCoords(this.seed ^ 0x9e3779b9, gx, gy));
        const distFromStart = Math.hypot(gx - 2, gy - 1.5);

        const cont = this.fbm(gx, gy, 42, 11);
        const mtnNoise = this.fbm(gx + 17, gy - 23, 24, 37);
        const moist = this.fbm(gx - 31, gy + 19, 28, 73);
        const temp = this.fbm(gx + 53, gy + 41, 36, 131);
        const riverVal = Math.abs(this.fbm(gx + 5, gy - 9, 30, 199) - 0.5);

        let b: BiomeId = BiomeId.Jungle;
        let elev = 2;

        if (WorldGenerator.isStartingTile(gx, gy)) {
          // Owned starting land is flat (elev = 2) with starter city #1
          b = BiomeId.Jungle;
          elev = 2;
          flags[idx] = TileFlag.Unlocked | TileFlag.Explored;
          cityRef[idx] = 1;
        } else if (gx >= -1 && gx <= 6 && gy === 5) {
          // Guaranteed nearby river corridor south of starting patch
          b = BiomeId.River;
          elev = 1;
        } else if (gx === 6 && gy === 1) {
          // Guaranteed nearby stone outcrop
          b = BiomeId.Grassland;
          elev = 3;
          depositType[idx] = DepositType.Stone;
          depositQty[idx] = 800;
          featureType[idx] = FeatureType.StoneOutcrop;
          featureHp[idx] = 60;
        } else if (gx === 5 && gy === 4) {
          // Guaranteed nearby clay bed
          b = BiomeId.Fertile;
          elev = 2;
          depositType[idx] = DepositType.Clay;
          depositQty[idx] = 800;
        } else if (gx === -2 && gy === 2) {
          // Guaranteed reachable Ancient Jungle Ruin west of starting clearing
          b = BiomeId.Jungle;
          elev = 2;
          featureType[idx] = FeatureType.AncientRuin;
          featureHp[idx] = 50;
        } else if (gx === 8 && gy === -2) {
          // Guaranteed reachable highland Gold Ore vein
          b = BiomeId.Mountain;
          elev = 4;
          depositType[idx] = DepositType.Gold;
          depositQty[idx] = 1200;
        } else if (gx === 9 && gy === -1) {
          // Guaranteed reachable highland Silver Ore vein
          b = BiomeId.Mountain;
          elev = 4;
          depositType[idx] = DepositType.Silver;
          depositQty[idx] = 1300;
        } else {
          const isProtectedSpawnBuffer = distFromStart < 6.5;
          if (!isProtectedSpawnBuffer && cont < 0.27) {
            b = BiomeId.DeepWater;
            elev = 0;
          } else if (!isProtectedSpawnBuffer && cont < 0.32) {
            b = BiomeId.Beach;
            elev = 2;
          } else if (riverVal < 0.026 && mtnNoise < 0.65) {
            b = BiomeId.River;
            elev = 1;
          } else if (mtnNoise > 0.69 && distFromStart > 5.5) {
            b = BiomeId.Mountain;
            elev = Math.min(7, 4 + Math.floor((mtnNoise - 0.69) * 12));
          } else if (moist > 0.68 && temp < 0.4) {
            b = BiomeId.Swamp;
            elev = 2;
          } else if (temp > 0.72 && moist < 0.32 && distFromStart > 9) {
            b = BiomeId.Desert;
            elev = 2;
          } else if (moist > 0.45) {
            b = BiomeId.Jungle;
            elev = 2 + (mtnNoise > 0.54 ? 1 : 0);
          } else if (riverVal < 0.085) {
            b = BiomeId.Fertile;
            elev = 2;
          } else {
            b = BiomeId.Forest;
            elev = 2 + (mtnNoise > 0.56 ? 1 : 0);
          }
        }

        biomeId[idx] = b;
        elevation[idx] = elev;
        moisture[idx] = Math.round(moist * 255);

        // Reveal wider fog border around starting clearing so dense forest canopy is visible
        if (gx >= -4 && gx <= 8 && gy >= -4 && gy <= 7) {
          flags[idx] |= TileFlag.Explored;
        }

        // Populate 9+ distinct tree species across biomes
        if (WorldGenerator.isStartingTile(gx, gy)) {
          const r = rng();
          const ft =
            r < 0.48
              ? FeatureType.JungleHardwood
              : r < 0.7
                ? FeatureType.TropicalPalm
                : r < 0.86
                  ? FeatureType.FruitTree
                  : r < 0.94
                    ? FeatureType.BambooCluster
                    : FeatureType.BirchTree;
          featureType[idx] = ft;
          featureHp[idx] = TREE_SPECIES[ft]?.maxHp ?? 35;
        } else if (featureType[idx] === FeatureType.None) {
          const r = rng();
          if (b === BiomeId.DeepWater || b === BiomeId.River) {
            // No trees on open water
          } else if (b === BiomeId.Mountain) {
            if (r < 0.38) {
              featureType[idx] = FeatureType.StoneOutcrop;
              featureHp[idx] = 60;
            } else if (r < 0.78) {
              featureType[idx] = FeatureType.PineTree;
              featureHp[idx] = TREE_SPECIES[FeatureType.PineTree].maxHp;
            } else if (r < 0.92) {
              featureType[idx] = FeatureType.OakTree;
              featureHp[idx] = TREE_SPECIES[FeatureType.OakTree].maxHp;
            }
          } else if (b === BiomeId.Desert) {
            if (r < 0.16) {
              featureType[idx] = FeatureType.AcaciaTree;
              featureHp[idx] = TREE_SPECIES[FeatureType.AcaciaTree].maxHp;
            } else if (r < 0.25) {
              featureType[idx] = FeatureType.TropicalPalm;
              featureHp[idx] = 30;
            }
          } else if (b === BiomeId.Beach) {
            if (r < 0.82) {
              featureType[idx] = FeatureType.TropicalPalm;
              featureHp[idx] = 30;
            }
          } else if (b === BiomeId.Swamp) {
            if (r < 0.72) {
              featureType[idx] = FeatureType.CypressTree;
              featureHp[idx] = TREE_SPECIES[FeatureType.CypressTree].maxHp;
            } else if (r < 0.9) {
              featureType[idx] = FeatureType.BambooCluster;
              featureHp[idx] = 25;
            }
          } else if (b === BiomeId.Forest) {
            if (distFromStart > 5.5 && r < 0.015) {
              featureType[idx] = FeatureType.AncientRuin;
              featureHp[idx] = 50;
            } else if (r < 0.92) {
              const ft =
                r < 0.3
                  ? FeatureType.OakTree
                  : r < 0.56
                    ? FeatureType.BirchTree
                    : r < 0.76
                      ? FeatureType.PineTree
                      : r < 0.88
                        ? FeatureType.FruitTree
                        : FeatureType.AncientMahogany;
              featureType[idx] = ft;
              featureHp[idx] = TREE_SPECIES[ft]?.maxHp ?? 40;
            }
          } else {
            if (distFromStart > 5.5 && r < 0.015) {
              featureType[idx] = FeatureType.AncientRuin;
              featureHp[idx] = 50;
            } else if (r < 0.94) {
              const ft =
                r < 0.36
                  ? FeatureType.JungleHardwood
                  : r < 0.56
                    ? FeatureType.FruitTree
                    : r < 0.7
                      ? FeatureType.TropicalPalm
                      : r < 0.82
                        ? FeatureType.BambooCluster
                        : r < 0.9
                          ? FeatureType.OakTree
                          : FeatureType.AncientMahogany;
              featureType[idx] = ft;
              featureHp[idx] = TREE_SPECIES[ft]?.maxHp ?? 40;
            }
          }
        }

        // Populate finite mineral deposits (including Silver)
        if (depositType[idx] === DepositType.None) {
          const dNoise = this.fbm(gx - 77, gy + 88, 12, 313);
          const dr = rng();
          if (b === BiomeId.Mountain) {
            if (dNoise > 0.6 && dr < 0.52) {
              depositType[idx] =
                dr < 0.14
                  ? DepositType.IronOre
                  : dr < 0.25
                    ? DepositType.Coal
                    : dr < 0.35
                      ? DepositType.CopperOre
                      : dr < 0.44
                        ? DepositType.Silver
                        : DepositType.Gold;
              depositQty[idx] = depositType[idx] === DepositType.Coal ? 1600 : 1400;
            } else if (dr < 0.3) {
              depositType[idx] = DepositType.Stone;
              depositQty[idx] = 1200;
            }
          } else if ((b === BiomeId.Swamp || (b === BiomeId.Fertile && riverVal < 0.05)) && dr < 0.24) {
            depositType[idx] = DepositType.Clay;
            depositQty[idx] = 900;
          } else if ((b === BiomeId.Beach || b === BiomeId.Desert) && dr < 0.32) {
            depositType[idx] = DepositType.Sand;
            depositQty[idx] = 1000;
          } else if ((b === BiomeId.Grassland || b === BiomeId.Forest) && dNoise > 0.68 && dr < 0.18) {
            depositType[idx] = dr < 0.04 ? DepositType.Silver : DepositType.Stone;
            depositQty[idx] = depositType[idx] === DepositType.Silver ? 1100 : 800;
          }
        }

      }
    }

    return {
      cx,
      cy,
      key: chunkKey(cx, cy),
      isModified: cx === 0 && cy === 0,
      lastTouchedTick: tick,
      biomeId,
      elevation,
      moisture,
      flags,
      featureType,
      featureHp,
      depositType,
      depositQty,
      roadType,
      buildingRef,
      pollution,
      utilityNet,
      cityRef,
      zoneType,
      roadDir,
    };
  }
}
