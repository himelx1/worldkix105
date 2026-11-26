export const CHUNK_SIZE = 16;
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 32;
export const ELEV_STEP_PX = 8;
export const TILE_KEY_BIAS = 131072;
export const TILE_KEY_STRIDE = 262144;
export const CHUNK_KEY_BIAS = 8192;
export const CHUNK_KEY_STRIDE = 16384;

export interface GridCoord {
  gx: number;
  gy: number;
}

export interface ChunkLocalCoord {
  cx: number;
  cy: number;
  lx: number;
  ly: number;
  index: number;
}

export interface ScreenCoord {
  sx: number;
  sy: number;
}

export function tileKey(gx: number, gy: number): number {
  return (gx + TILE_KEY_BIAS) * TILE_KEY_STRIDE + (gy + TILE_KEY_BIAS);
}

export function unpackTileX(key: number): number {
  return Math.floor(key / TILE_KEY_STRIDE) - TILE_KEY_BIAS;
}

export function unpackTileY(key: number): number {
  return (key % TILE_KEY_STRIDE) - TILE_KEY_BIAS;
}

export function chunkNumKey(cx: number, cy: number): number {
  return (cx + CHUNK_KEY_BIAS) * CHUNK_KEY_STRIDE + (cy + CHUNK_KEY_BIAS);
}

export function localTileIndex(gx: number, gy: number): number {
  return ((gy & 15) << 4) | (gx & 15);
}

export function chunkKey(cx: number, cy: number): string {
  return `${cx}:${cy}`;
}

export function parseChunkKey(key: string): { cx: number; cy: number } {
  const [cx, cy] = key.split(':').map(Number);
  return { cx, cy };
}

export function gridToChunk(gx: number, gy: number): ChunkLocalCoord {
  const cx = Math.floor(gx / CHUNK_SIZE);
  const cy = Math.floor(gy / CHUNK_SIZE);
  const lx = ((gx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const ly = ((gy % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return { cx, cy, lx, ly, index: ly * CHUNK_SIZE + lx };
}

export function chunkToGrid(cx: number, cy: number, lx: number, ly: number): GridCoord {
  return {
    gx: cx * CHUNK_SIZE + lx,
    gy: cy * CHUNK_SIZE + ly,
  };
}

export function gridToIso(gx: number, gy: number, elevation = 0): ScreenCoord {
  return {
    sx: (gx - gy) * (TILE_WIDTH * 0.5),
    sy: (gx + gy) * (TILE_HEIGHT * 0.5) - elevation * ELEV_STEP_PX,
  };
}

export function isoToGridApprox(wx: number, wy: number): GridCoord {
  const halfW = TILE_WIDTH * 0.5;
  const halfH = TILE_HEIGHT * 0.5;
  const gx = Math.floor((wx / halfW + wy / halfH) * 0.5);
  const gy = Math.floor((wy / halfH - wx / halfW) * 0.5);
  return { gx, gy };
}

export function isPointInIsoDiamond(
  px: number,
  py: number,
  centerSx: number,
  centerSy: number
): boolean {
  const dx = Math.abs(px - centerSx) / (TILE_WIDTH * 0.5);
  const dy = Math.abs(py - centerSy) / (TILE_HEIGHT * 0.5);
  return dx + dy <= 1.02;
}

export function hashCoords(seed: number, x: number, y: number): number {
  let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
