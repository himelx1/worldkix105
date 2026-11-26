import type { CoreEngine } from '../core/CoreEngine';
import { ChunkData, SCHEMA_VERSION, TileFlag, WorldEngineState } from '../core/GameState';
import { CHUNK_SIZE, chunkKey } from '../core/IsoMath';
import {
  IndexedDBStore,
  StoredBackupRecord,
  StoredChunkRecord,
  StoredSlotRecord,
} from './IndexedDBStore';
import { MigrationReport, SaveMigrator } from './SaveMigrator';

export type SaveSlotId = string;

export const LEGACY_SLOT_IDS = ['autosave', 'manual_1', 'manual_2', 'manual_3'] as const;
export const ACTIVE_WORLD_STORAGE_KEY = 'kukus_active_world_id';

export function createWorldSlotId(): string {
  return `world_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export interface SaveSlotSummary {
  slotId: SaveSlotId;
  savedAt: number;
  cityName: string;
  level: number;
  population: number;
  coins: number;
  unlockedTiles: number;
  playTimeSeconds: number;
}

export const CHUNK_V1_BYTES =
  256 + // biomeId (u8)
  256 + // elevation (u8)
  256 + // moisture (u8)
  256 + // flags (u8)
  256 + // featureType (u8)
  512 + // featureHp (u16)
  256 + // depositType (u8)
  512 + // depositQty (u16)
  256 + // roadType (u8)
  1024 + // buildingRef (i32)
  256; // pollution (u8)  === 4352 bytes

export const CHUNK_V2_BYTES =
  CHUNK_V1_BYTES +
  256 + // utilityNet (u8)
  512 + // cityRef (u16)
  256; // zoneType (u8) === 5376 bytes

export const CHUNK_V3_ROAD_BYTES =
  CHUNK_V2_BYTES +
  256; // roadDir (u8) === 5632 bytes

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function computeCRC32(str: string): number {
  let c = 0xffffffff;
  for (let i = 0; i < str.length; i++) {
    const x = c ^ str.charCodeAt(i);
    c = (x >>> 8) ^ CRC32_TABLE[x & 0xff];
  }
  return (c ^ 0xffffffff) >>> 0;
}

export function serializeChunk(c: ChunkData): ArrayBuffer {
  const buf = new ArrayBuffer(CHUNK_V3_ROAD_BYTES);
  const u8 = new Uint8Array(buf);
  let off = 0;
  const copyU8 = (arr: Uint8Array) => {
    u8.set(arr, off);
    off += arr.byteLength;
  };
  const copyView = (arr: ArrayBufferView) => {
    u8.set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), off);
    off += arr.byteLength;
  };

  copyU8(c.biomeId);
  copyU8(c.elevation);
  copyU8(c.moisture);
  copyU8(c.flags);
  copyU8(c.featureType);
  copyView(c.featureHp);
  copyU8(c.depositType);
  copyView(c.depositQty);
  copyU8(c.roadType);
  copyView(c.buildingRef);
  copyU8(c.pollution);
  copyU8(c.utilityNet);
  copyView(c.cityRef);
  copyU8(c.zoneType);
  copyU8(c.roadDir ?? new Uint8Array(CHUNK_SIZE * CHUNK_SIZE));
  return buf;
}

export function serializeChunkV1ForTest(c: ChunkData): ArrayBuffer {
  const buf = new ArrayBuffer(CHUNK_V1_BYTES);
  const u8 = new Uint8Array(buf);
  let off = 0;
  const copyU8 = (arr: Uint8Array) => {
    u8.set(arr, off);
    off += arr.byteLength;
  };
  const copyView = (arr: ArrayBufferView) => {
    u8.set(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength), off);
    off += arr.byteLength;
  };

  copyU8(c.biomeId);
  copyU8(c.elevation);
  copyU8(c.moisture);
  copyU8(c.flags);
  copyU8(c.featureType);
  copyView(c.featureHp);
  copyU8(c.depositType);
  copyView(c.depositQty);
  copyU8(c.roadType);
  copyView(c.buildingRef);
  copyU8(c.pollution);
  return buf;
}

export function deserializeChunk(cx: number, cy: number, bytes: ArrayBuffer): ChunkData {
  const len = CHUNK_SIZE * CHUNK_SIZE;
  let off = 0;
  const takeU8 = () => {
    const slice = new Uint8Array(bytes.slice(off, off + len));
    off += len;
    return slice;
  };
  const takeU16 = () => {
    const slice = new Uint16Array(bytes.slice(off, off + len * 2));
    off += len * 2;
    return slice;
  };
  const takeI32 = () => {
    const slice = new Int32Array(bytes.slice(off, off + len * 4));
    off += len * 4;
    return slice;
  };

  const biomeId = takeU8();
  const elevation = takeU8();
  const moisture = takeU8();
  const flags = takeU8();
  const featureType = takeU8();
  const featureHp = takeU16();
  const depositType = takeU8();
  const depositQty = takeU16();
  const roadType = takeU8();
  const buildingRef = takeI32();
  const pollution = takeU8();

  let utilityNet: Uint8Array;
  let cityRef: Uint16Array;
  let zoneType: Uint8Array;
  let roadDir: Uint8Array;

  if (bytes.byteLength >= CHUNK_V2_BYTES) {
    utilityNet = takeU8();
    cityRef = takeU16();
    zoneType = takeU8();
  } else {
    // Legacy v1 chunk upgrade: initialize v2 layers and map unlocked tiles to City #1
    utilityNet = new Uint8Array(len);
    zoneType = new Uint8Array(len);
    cityRef = new Uint16Array(len);
    for (let i = 0; i < len; i++) {
      if ((flags[i] & TileFlag.Unlocked) !== 0) {
        cityRef[i] = 1;
      }
    }
  }

  if (bytes.byteLength >= CHUNK_V3_ROAD_BYTES) {
    roadDir = takeU8();
  } else {
    roadDir = new Uint8Array(len);
  }

  return {
    cx,
    cy,
    key: chunkKey(cx, cy),
    isModified: true,
    lastTouchedTick: 0,
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

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function base64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export class SaveManager {
  private readonly store = new IndexedDBStore();
  private backupRingIndex = 0;
  private saveCount = 0;
  private lastSavedSlotId: string | null = null;
  public lastMigrationReport: MigrationReport | null = null;

  public async isStoragePersistent(): Promise<boolean> {
    await this.store.open();
    return this.store.isAvailable;
  }

  public getStoredActiveWorldId(): string | null {
    try {
      return window.localStorage.getItem(ACTIVE_WORLD_STORAGE_KEY);
    } catch {
      return null;
    }
  }

  public setStoredActiveWorldId(slotId: string): void {
    try {
      window.localStorage.setItem(ACTIVE_WORLD_STORAGE_KEY, slotId);
    } catch {
      // Ignore private-browsing storage errors
    }
  }

  public async listSlots(): Promise<SaveSlotSummary[]> {
    const records = await this.store.listSlots();
    const mapped = records.map((r) => ({
      slotId: r.slotId as SaveSlotId,
      savedAt: r.savedAt,
      cityName: r.cityName,
      level: r.level,
      population: r.population,
      coins: Math.floor(r.coins),
      unlockedTiles: r.unlockedTiles,
      playTimeSeconds: r.playTimeSeconds,
    }));
    mapped.sort((a, b) => b.savedAt - a.savedAt);
    return mapped;
  }

  /**
   * One-time migration from legacy fixed slots ('autosave', 'manual_1..3')
   * into isolated 'world_*' slots so autosave never overwrites another world.
   */
  public async migrateLegacySlotsIfNeeded(): Promise<string | null> {
    const allSlots = await this.store.listSlots();
    const worldSlots = allSlots.filter((s) => s.slotId.startsWith('world_'));
    if (worldSlots.length > 0) {
      const stored = this.getStoredActiveWorldId();
      if (stored && worldSlots.some((s) => s.slotId === stored)) {
        return stored;
      }
      worldSlots.sort((a, b) => b.savedAt - a.savedAt);
      const best = worldSlots[0].slotId;
      this.setStoredActiveWorldId(best);
      return best;
    }

    const legacySlots = allSlots.filter((s) =>
      (LEGACY_SLOT_IDS as readonly string[]).includes(s.slotId)
    );
    if (legacySlots.length === 0) {
      return null;
    }

    let preferredWorldId: string | null = null;
    legacySlots.sort((a, b) => b.savedAt - a.savedAt);

    for (const legacy of legacySlots) {
      const targetId =
        legacy.slotId === 'autosave'
          ? 'world_1'
          : `world_${legacy.slotId}_${legacy.savedAt.toString(36)}`;
      const legacyChunks = await this.store.getChunksForSlot(legacy.slotId);
      const copiedSlot: StoredSlotRecord = {
        ...legacy,
        slotId: targetId,
      };
      const copiedChunks: StoredChunkRecord[] = legacyChunks.map((c) => ({
        id: `${targetId}:${c.cx}:${c.cy}`,
        slotId: targetId,
        cx: c.cx,
        cy: c.cy,
        bytes: c.bytes,
      }));

      const ok = await this.store.writeSlotAndChunks(copiedSlot, copiedChunks, true);
      if (ok) {
        const legacyBackups = await this.store.getBackupsForSlot(legacy.slotId);
        for (let i = 0; i < legacyBackups.length; i++) {
          const b = legacyBackups[i];
          await this.store.writeBackup({
            ...b,
            id: `${targetId}:${i}`,
            slotId: targetId,
          });
        }
        if (legacy.slotId === 'autosave' || !preferredWorldId) {
          preferredWorldId = targetId;
        }
        await this.store.deleteSlot(legacy.slotId);
      }
    }

    if (preferredWorldId) {
      this.setStoredActiveWorldId(preferredWorldId);
    }
    return preferredWorldId;
  }

  public async hasPreMigrationBackup(slotId: SaveSlotId): Promise<boolean> {
    const rec = await this.store.getBackupById(`pre_migration:${slotId}`);
    if (!rec) return false;
    return computeCRC32(rec.payloadJson) === rec.checksumCRC32;
  }

  private async writeLockedPreMigrationBackup(
    slotId: SaveSlotId,
    payloadJson: string,
    rawChunks: Array<{ cx: number; cy: number; bytes: ArrayBuffer }>
  ): Promise<{ created: boolean; backupId: string }> {
    const backupId = `pre_migration:${slotId}`;
    const checksum = computeCRC32(payloadJson);
    const record: StoredBackupRecord = {
      id: backupId,
      slotId: backupId, // Isolated from rolling ring index queries
      savedAt: Date.now(),
      checksumCRC32: checksum,
      payloadJson,
      chunks: rawChunks,
    };
    const ok = await this.store.writeBackup(record);
    if (!ok) return { created: false, backupId };
    const verified = await this.store.getBackupById(backupId);
    return {
      created: Boolean(verified && computeCRC32(verified.payloadJson) === checksum),
      backupId,
    };
  }

  public async restorePreMigrationBackup(
    engine: CoreEngine,
    slotId: SaveSlotId
  ): Promise<{ ok: boolean; error?: string }> {
    const backupId = `pre_migration:${slotId}`;
    const backup = await this.store.getBackupById(backupId);
    if (!backup) {
      return { ok: false, error: 'No locked pre-migration backup exists for this slot' };
    }
    if (computeCRC32(backup.payloadJson) !== backup.checksumCRC32) {
      return { ok: false, error: 'Pre-migration backup failed CRC32 checksum check' };
    }
    try {
      const parsed = JSON.parse(backup.payloadJson) as Partial<WorldEngineState>;
      const mig = SaveMigrator.migrate(parsed, { backupId, backupCreated: true });
      if (!mig.ok || !mig.state) {
        return { ok: false, error: mig.error ?? 'Could not restore backup snapshot' };
      }
      this.lastMigrationReport = mig.report ?? null;
      const chunks = backup.chunks.map((c) => deserializeChunk(c.cx, c.cy, c.bytes));
      engine.loadState(mig.state, chunks);
      // Also restore original pre-migration payload into slot record so slot matches restored state
      const slotRecord: StoredSlotRecord = {
        slotId,
        schemaVersion: parsed.schemaVersion ?? 1,
        savedAt: backup.savedAt,
        cityName: parsed.settings?.cityName ?? mig.state.settings.cityName,
        level: parsed.level ?? mig.state.level,
        population: parsed.population?.total ?? mig.state.population.total,
        coins: Math.floor(parsed.coins ?? mig.state.coins),
        unlockedTiles: parsed.stats?.unlockedTiles ?? mig.state.stats.unlockedTiles,
        playTimeSeconds: parsed.stats?.playTimeSeconds ?? mig.state.stats.playTimeSeconds,
        checksumCRC32: backup.checksumCRC32,
        payloadJson: backup.payloadJson,
      };
      const slotChunks: StoredChunkRecord[] = backup.chunks.map((c) => ({
        id: `${slotId}:${c.cx}:${c.cy}`,
        slotId,
        cx: c.cx,
        cy: c.cy,
        bytes: c.bytes,
      }));
      await this.store.writeSlotAndChunks(slotRecord, slotChunks, true);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Corrupted pre-migration backup payload' };
    }
  }

  public async saveGame(
    engine: CoreEngine,
    slotId: SaveSlotId,
    forceAllChunks = false
  ): Promise<{ ok: boolean; recoveredNote?: string }> {
    const state = engine.state;
    const now = Date.now();
    state.lastSavedAt = now;
    const payloadJson = JSON.stringify(state);
    const checksum = computeCRC32(payloadJson);

    const slotRecord: StoredSlotRecord = {
      slotId,
      schemaVersion: state.schemaVersion,
      savedAt: now,
      cityName: state.settings.cityName,
      level: state.level,
      population: state.population.total,
      coins: Math.floor(state.coins),
      unlockedTiles: state.stats.unlockedTiles,
      playTimeSeconds: state.stats.playTimeSeconds,
      checksumCRC32: checksum,
      payloadJson,
    };

    const existing = await this.store.getSlot(slotId);
    const mustWriteAllChunks =
      forceAllChunks || !existing || this.lastSavedSlotId !== slotId;

    const dirtyKeys = engine.chunks.peekDirtySaveKeys();
    const dirtySet = new Set(dirtyKeys);
    const modifiedChunks = engine.chunks.getModifiedChunks();
    const chunksToWrite: StoredChunkRecord[] = [];

    for (const c of modifiedChunks) {
      if (mustWriteAllChunks || dirtySet.has(c.key)) {
        chunksToWrite.push({
          id: `${slotId}:${c.cx}:${c.cy}`,
          slotId,
          cx: c.cx,
          cy: c.cy,
          bytes: serializeChunk(c),
        });
      }
    }

    const ok = await this.store.writeSlotAndChunks(
      slotRecord,
      chunksToWrite,
      mustWriteAllChunks
    );

    if (ok) {
      engine.chunks.clearDirtySaveKeys(dirtyKeys);
      this.lastSavedSlotId = slotId;
    }

    // Periodically write full recovery backup into 3-deep ring buffer for this isolated world slot
    this.saveCount += 1;
    if (ok && (mustWriteAllChunks || this.saveCount % 3 === 1)) {
      const backupChunks = modifiedChunks.map((c) => ({
        cx: c.cx,
        cy: c.cy,
        bytes: serializeChunk(c),
      }));
      const backup: StoredBackupRecord = {
        id: `${slotId}:${this.backupRingIndex}`,
        slotId,
        savedAt: slotRecord.savedAt,
        checksumCRC32: checksum,
        payloadJson,
        chunks: backupChunks,
      };
      this.backupRingIndex = (this.backupRingIndex + 1) % 3;
      await this.store.writeBackup(backup);
    }

    return { ok };
  }

  public async renameWorldSlot(slotId: SaveSlotId, newName: string): Promise<boolean> {
    const trimmed = newName.trim().slice(0, 28);
    if (!trimmed) return false;
    const slot = await this.store.getSlot(slotId);
    if (!slot) return false;
    try {
      const parsed = JSON.parse(slot.payloadJson) as WorldEngineState;
      parsed.settings = { ...parsed.settings, cityName: trimmed };
      if (Array.isArray(parsed.cities) && parsed.cities[0]) {
        parsed.cities[0].name = trimmed;
      }
      const nextJson = JSON.stringify(parsed);
      const nextSlot: StoredSlotRecord = {
        ...slot,
        cityName: trimmed,
        checksumCRC32: computeCRC32(nextJson),
        payloadJson: nextJson,
      };
      return await this.store.writeSlotAndChunks(nextSlot, [], false);
    } catch {
      return false;
    }
  }

  public async loadGame(
    engine: CoreEngine,
    slotId: SaveSlotId
  ): Promise<{ ok: boolean; recoveredFromBackup?: boolean; migrated?: boolean; error?: string }> {
    const slot = await this.store.getSlot(slotId);
    if (slot) {
      const expectedCrc = computeCRC32(slot.payloadJson);
      if (expectedCrc === slot.checksumCRC32) {
        try {
          const parsed = JSON.parse(slot.payloadJson) as Partial<WorldEngineState>;
          const rawChunks = await this.store.getChunksForSlot(slotId);
          const needsMigration = (parsed.schemaVersion ?? 0) < SCHEMA_VERSION;
          let backupInfo: { created: boolean; backupId: string } | undefined;

          if (needsMigration) {
            backupInfo = await this.writeLockedPreMigrationBackup(
              slotId,
              slot.payloadJson,
              rawChunks.map((rc) => ({ cx: rc.cx, cy: rc.cy, bytes: rc.bytes }))
            );
            if (!backupInfo.created) {
              return { ok: false, error: 'Aborted migration: pre-migration backup could not be verified' };
            }
          }

          const mig = SaveMigrator.migrate(parsed, {
            backupCreated: backupInfo?.created ?? false,
            backupId: backupInfo?.backupId,
          });
          if (mig.ok && mig.state) {
            if (needsMigration && mig.report) {
              this.lastMigrationReport = mig.report;
            }
            const chunks = rawChunks.map((rc) => deserializeChunk(rc.cx, rc.cy, rc.bytes));
            engine.loadState(mig.state, chunks);
            if (needsMigration) {
              await this.saveGame(engine, slotId, true);
            }
            return { ok: true, migrated: needsMigration };
          }
        } catch {
          // Fall through to backup recovery
        }
      }
    }

    // Attempt corruption recovery from rolling backup ring
    const backups = await this.store.getBackupsForSlot(slotId);
    for (const b of backups) {
      if (computeCRC32(b.payloadJson) !== b.checksumCRC32) continue;
      try {
        const parsed = JSON.parse(b.payloadJson) as Partial<WorldEngineState>;
        const needsMigration = (parsed.schemaVersion ?? 0) < SCHEMA_VERSION;
        const mig = SaveMigrator.migrate(parsed, {
          backupCreated: true,
          backupId: b.id,
        });
        if (mig.ok && mig.state) {
          if (needsMigration && mig.report) {
            this.lastMigrationReport = mig.report;
          }
          const chunks = b.chunks.map((c) => deserializeChunk(c.cx, c.cy, c.bytes));
          engine.loadState(mig.state, chunks);
          // Repair corrupted primary slot automatically
          await this.saveGame(engine, slotId, true);
          return { ok: true, recoveredFromBackup: true, migrated: needsMigration };
        }
      } catch {
        continue;
      }
    }

    return { ok: false, error: 'No valid save or backup found for this slot' };
  }

  public async deleteSlot(slotId: SaveSlotId): Promise<boolean> {
    return this.store.deleteSlot(slotId);
  }

  public async exportBackupFile(engine: CoreEngine): Promise<Blob> {
    const modifiedChunks = engine.chunks.getModifiedChunks().map((c) => ({
      cx: c.cx,
      cy: c.cy,
      b64: bufferToBase64(serializeChunk(c)),
    }));
    const envelope = {
      magic: 'KUKUS_SAVE_V2',
      exportedAt: Date.now(),
      checksumCRC32: computeCRC32(JSON.stringify(engine.state)),
      state: engine.state,
      chunks: modifiedChunks,
    };
    const jsonText = JSON.stringify(envelope);

    if (typeof CompressionStream !== 'undefined') {
      const stream = new Blob([jsonText]).stream().pipeThrough(new CompressionStream('gzip'));
      return await new Response(stream).blob();
    }
    return new Blob([jsonText], { type: 'application/json' });
  }

  public async importBackupFile(
    file: File,
    engine: CoreEngine,
    targetSlot?: SaveSlotId
  ): Promise<{ ok: boolean; slotId?: SaveSlotId; migrated?: boolean; error?: string }> {
    const resolvedSlot = targetSlot ?? createWorldSlotId();
    try {
      let jsonText = '';
      const header = new Uint8Array(await file.slice(0, 2).arrayBuffer());
      const isGzip = header.length === 2 && header[0] === 0x1f && header[1] === 0x8b;

      if (isGzip && typeof DecompressionStream !== 'undefined') {
        const stream = file.stream().pipeThrough(new DecompressionStream('gzip'));
        jsonText = await new Response(stream).text();
      } else {
        jsonText = await file.text();
      }

      const envelope = JSON.parse(jsonText) as {
        magic?: string;
        checksumCRC32?: number;
        state?: WorldEngineState;
        chunks?: Array<{ cx: number; cy: number; b64: string }>;
      };

      if (
        (envelope.magic !== 'KUKUS_SAVE_V1' && envelope.magic !== 'KUKUS_SAVE_V2') ||
        !envelope.state
      ) {
        return { ok: false, error: 'Invalid .kukus save file format' };
      }

      const rawStateJson = JSON.stringify(envelope.state);
      const rawChunkBufs = (envelope.chunks ?? []).map((c) => ({
        cx: c.cx,
        cy: c.cy,
        bytes: base64ToBuffer(c.b64),
      }));

      const needsMigration = (envelope.state.schemaVersion ?? 0) < SCHEMA_VERSION;
      let backupInfo: { created: boolean; backupId: string } | undefined;
      if (needsMigration) {
        backupInfo = await this.writeLockedPreMigrationBackup(resolvedSlot, rawStateJson, rawChunkBufs);
        if (!backupInfo.created) {
          return { ok: false, error: 'Aborted import: pre-migration backup verification failed' };
        }
      }

      const mig = SaveMigrator.migrate(envelope.state, {
        backupCreated: backupInfo?.created ?? false,
        backupId: backupInfo?.backupId,
      });
      if (!mig.ok || !mig.state) {
        return { ok: false, error: mig.error ?? 'Migration failed' };
      }

      if (needsMigration && mig.report) {
        this.lastMigrationReport = mig.report;
      }

      const chunks = rawChunkBufs.map((c) => deserializeChunk(c.cx, c.cy, c.bytes));
      engine.loadState(mig.state, chunks);
      await this.saveGame(engine, resolvedSlot, true);
      this.setStoredActiveWorldId(resolvedSlot);
      return { ok: true, slotId: resolvedSlot, migrated: needsMigration };
    } catch {
      return { ok: false, error: 'Could not parse backup file' };
    }
  }
}
