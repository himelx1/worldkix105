export interface StoredSlotRecord {
  slotId: string;
  schemaVersion: number;
  savedAt: number;
  cityName: string;
  level: number;
  population: number;
  coins: number;
  unlockedTiles: number;
  playTimeSeconds: number;
  checksumCRC32: number;
  payloadJson: string;
}

export interface StoredChunkRecord {
  id: string; // `${slotId}:${cx}:${cy}`
  slotId: string;
  cx: number;
  cy: number;
  bytes: ArrayBuffer;
}

export interface StoredBackupRecord {
  id: string; // `${slotId}:${ringIndex}`
  slotId: string;
  savedAt: number;
  checksumCRC32: number;
  payloadJson: string;
  chunks: Array<{ cx: number; cy: number; bytes: ArrayBuffer }>;
}

const DB_NAME = 'kukus_db';
const DB_VERSION = 1;

export class IndexedDBStore {
  private db: IDBDatabase | null = null;
  public isAvailable = true;

  public async open(): Promise<boolean> {
    if (this.db) return true;
    if (typeof indexedDB === 'undefined') {
      this.isAvailable = false;
      return false;
    }

    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('slots')) {
            db.createObjectStore('slots', { keyPath: 'slotId' });
          }
          if (!db.objectStoreNames.contains('chunks')) {
            const chunkStore = db.createObjectStore('chunks', { keyPath: 'id' });
            chunkStore.createIndex('bySlot', 'slotId', { unique: false });
          }
          if (!db.objectStoreNames.contains('backups')) {
            const backupStore = db.createObjectStore('backups', { keyPath: 'id' });
            backupStore.createIndex('bySlot', 'slotId', { unique: false });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      this.isAvailable = true;
      return true;
    } catch {
      this.isAvailable = false;
      return false;
    }
  }

  public async getSlot(slotId: string): Promise<StoredSlotRecord | null> {
    if (!(await this.open()) || !this.db) return null;
    return new Promise((resolve) => {
      const tx = this.db!.transaction(['slots'], 'readonly');
      const req = tx.objectStore('slots').get(slotId);
      req.onsuccess = () => resolve((req.result as StoredSlotRecord) ?? null);
      req.onerror = () => resolve(null);
    });
  }

  public async listSlots(): Promise<StoredSlotRecord[]> {
    if (!(await this.open()) || !this.db) return [];
    return new Promise((resolve) => {
      const tx = this.db!.transaction(['slots'], 'readonly');
      const req = tx.objectStore('slots').getAll();
      req.onsuccess = () => resolve((req.result as StoredSlotRecord[]) ?? []);
      req.onerror = () => resolve([]);
    });
  }

  public async getChunksForSlot(slotId: string): Promise<StoredChunkRecord[]> {
    if (!(await this.open()) || !this.db) return [];
    return new Promise((resolve) => {
      const tx = this.db!.transaction(['chunks'], 'readonly');
      const idx = tx.objectStore('chunks').index('bySlot');
      const req = idx.getAll(slotId);
      req.onsuccess = () => resolve((req.result as StoredChunkRecord[]) ?? []);
      req.onerror = () => resolve([]);
    });
  }

  public async writeSlotAndChunks(
    slot: StoredSlotRecord,
    chunksToWrite: StoredChunkRecord[],
    replaceAllChunks = false
  ): Promise<boolean> {
    if (!(await this.open()) || !this.db) return false;

    const existingKeysToDelete: string[] = [];
    if (replaceAllChunks) {
      const existing = await this.getChunksForSlot(slot.slotId);
      for (const c of existing) existingKeysToDelete.push(c.id);
    }

    return new Promise((resolve) => {
      const tx = this.db!.transaction(['slots', 'chunks'], 'readwrite');
      const slotStore = tx.objectStore('slots');
      const chunkStore = tx.objectStore('chunks');

      for (const key of existingKeysToDelete) {
        chunkStore.delete(key);
      }
      for (const chunk of chunksToWrite) {
        chunkStore.put(chunk);
      }
      slotStore.put(slot);

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
    });
  }

  public async writeBackup(record: StoredBackupRecord): Promise<boolean> {
    if (!(await this.open()) || !this.db) return false;
    return new Promise((resolve) => {
      const tx = this.db!.transaction(['backups'], 'readwrite');
      tx.objectStore('backups').put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  public async getBackupsForSlot(slotId: string): Promise<StoredBackupRecord[]> {
    if (!(await this.open()) || !this.db) return [];
    return new Promise((resolve) => {
      const tx = this.db!.transaction(['backups'], 'readonly');
      const idx = tx.objectStore('backups').index('bySlot');
      const req = idx.getAll(slotId);
      req.onsuccess = () => {
        const list = (req.result as StoredBackupRecord[]) ?? [];
        list.sort((a, b) => b.savedAt - a.savedAt);
        resolve(list);
      };
      req.onerror = () => resolve([]);
    });
  }

  public async getBackupById(id: string): Promise<StoredBackupRecord | null> {
    if (!(await this.open()) || !this.db) return null;
    return new Promise((resolve) => {
      const tx = this.db!.transaction(['backups'], 'readonly');
      const req = tx.objectStore('backups').get(id);
      req.onsuccess = () => resolve((req.result as StoredBackupRecord) ?? null);
      req.onerror = () => resolve(null);
    });
  }

  public async deleteBackupById(id: string): Promise<boolean> {
    if (!(await this.open()) || !this.db) return false;
    return new Promise((resolve) => {
      const tx = this.db!.transaction(['backups'], 'readwrite');
      tx.objectStore('backups').delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }

  public async deleteSlot(slotId: string): Promise<boolean> {
    if (!(await this.open()) || !this.db) return false;
    const chunks = await this.getChunksForSlot(slotId);
    const backups = await this.getBackupsForSlot(slotId);
    return new Promise((resolve) => {
      const tx = this.db!.transaction(['slots', 'chunks', 'backups'], 'readwrite');
      tx.objectStore('slots').delete(slotId);
      const chunkStore = tx.objectStore('chunks');
      for (const c of chunks) chunkStore.delete(c.id);
      const backupStore = tx.objectStore('backups');
      for (const b of backups) backupStore.delete(b.id);
      backupStore.delete(`pre_migration:${slotId}`);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  }
}
