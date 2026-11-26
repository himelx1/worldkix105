import { useEffect, useState } from 'react';
import { CoreEngine } from '../../core/CoreEngine';
import type { CommandResult, GameCommand } from '../../core/CommandTypes';
import type { NotificationItem, OfflineSummary, TileInspection, WorldEngineState } from '../../core/GameState';
import { BUILDINGS } from '../../data/buildings.data';
import { getBuildQueueCap, QuestDef } from '../../data/levels.data';
import { DEPOSIT_NAMES, DepositType } from '../../data/trees.data';
import { AudioSystem } from '../../engine/AudioSystem';
import { PhaserHost } from '../../engine/PhaserHost';
import type { InteractionTool, OverlayMode } from '../../engine/WorldScene';
import { OfflineManager, OfflineStatus } from '../../persistence/OfflineManager';
import { PerfMetrics, PerfMonitor } from '../../persistence/PerfMonitor';
import { createWorldSlotId, SaveManager, SaveSlotId, SaveSlotSummary } from '../../persistence/SaveManager';
import type { MaterialShortage, PlacementValidation } from '../../systems/BuildingSystem';
import type { QuestProgressEntry } from '../../systems/ProgressionSystem';
import type { NetworkDiagnosticsReport } from '../../systems/NetworkDiagnosticsSystem';

export type ActiveSheet =
  | 'none'
  | 'build'
  | 'levelup'
  | 'land'
  | 'inventory'
  | 'population'
  | 'economy'
  | 'national_stats'
  | 'tech'
  | 'achievements'
  | 'quests';

export type NationalStatsSection = 'overview' | 'utilities' | 'resources' | 'population' | 'economy';

export type ActiveModal = 'none' | 'pause' | 'settings' | 'saves';

export type ActiveToolPanel = 'none' | 'brush' | 'view';

export interface GhostInfoState {
  gx: number;
  gy: number;
  valid: boolean;
  reason?: string;
  blockingObstacleTiles?: Array<{ gx: number; gy: number }>;
  missingCoins?: number;
  missingMaterials?: MaterialShortage[];
  queueFull?: boolean;
}

export interface GameSnapshot {
  state: WorldEngineState;
  activeWorldId: SaveSlotId;
  panMode: boolean;
  offlineSummary: OfflineSummary | null;
  activeQuest: { quest: QuestDef; progress: number } | null;
  activeQuests: Array<{ quest: QuestDef; progress: number }>;
  allQuests: QuestProgressEntry[];
  buildQueueActive: number;
  buildQueueCap: number;
  notifications: NotificationItem[];
  perf: PerfMetrics;
  offline: OfflineStatus;
  tool: InteractionTool;
  overlayMode: OverlayMode;
  selectedTile: TileInspection | null;
  selectedBuildingId: number | null;
  ghostInfo: GhostInfoState | null;
  activeSheet: ActiveSheet;
  nationalStatsSection: NationalStatsSection;
  activeToolPanel: ActiveToolPanel;
  activeModal: ActiveModal;
  simInspectorOpen: boolean;
  toastError: string | null;
}

class GameControllerImpl {
  public readonly engine = new CoreEngine();
  public readonly audio = new AudioSystem();
  public readonly perf = new PerfMonitor();
  public readonly saveManager = new SaveManager();
  private phaserHost: PhaserHost | null = null;

  private activeWorldId: SaveSlotId = '';
  private panMode = false;
  private offlineSummary: OfflineSummary | null = null;
  private saveInFlight: Promise<unknown> | null = null;

  private tool: InteractionTool = { mode: 'inspect_chop' };
  private overlayMode: OverlayMode = 'none';
  private selectedTileCoords: { gx: number; gy: number } | null = null;
  private selectedBuildingId: number | null = null;
  private ghostInfo: GhostInfoState | null = null;
  private activeSheet: ActiveSheet = 'none';
  private nationalStatsSection: NationalStatsSection = 'overview';
  private activeToolPanel: ActiveToolPanel = 'none';
  private lastBrushKind: 'water' | 'land' | 'unlock' | 'zone' = 'water';
  private lastBrushRadius = 0;
  private lastBrushZone: import('../../core/GameState').ZoneType = 'residential';
  private activeModal: ActiveModal = 'none';
  private simInspectorOpen = false;
  private toastError: string | null = null;
  private toastTimer: number | null = null;

  private subscribers = new Set<() => void>();
  private snapshotDirty = false;
  private uiTimer: number | null = null;
  private autosaveTimer: number | null = null;
  private bootComplete = false;

  private async safeSaveActiveWorld(forceAllChunks = false): Promise<boolean> {
    if (!this.activeWorldId) {
      this.activeWorldId = this.saveManager.getStoredActiveWorldId() || createWorldSlotId();
      this.saveManager.setStoredActiveWorldId(this.activeWorldId);
    }
    const targetSlot = this.activeWorldId;
    if (this.saveInFlight) {
      try {
        await this.saveInFlight;
      } catch {
        // Previous save failure should not block next save attempt
      }
    }
    const p = this.saveManager.saveGame(this.engine, targetSlot, forceAllChunks);
    this.saveInFlight = p;
    try {
      const res = await p;
      return res.ok;
    } finally {
      if (this.saveInFlight === p) {
        this.saveInFlight = null;
      }
    }
  }

  public async mount(container: HTMLElement): Promise<void> {
    if (this.phaserHost) {
      this.phaserHost.destroy();
      this.phaserHost = null;
    }

    OfflineManager.init();

    if (!this.bootComplete) {
      this.bootComplete = true;
      const migratedId = await this.saveManager.migrateLegacySlotsIfNeeded();
      const slots = await this.saveManager.listSlots();
      const storedId = this.saveManager.getStoredActiveWorldId();

      const resolvedId =
        (storedId && slots.some((s) => s.slotId === storedId) ? storedId : null) ??
        (migratedId && slots.some((s) => s.slotId === migratedId) ? migratedId : null) ??
        (slots[0]?.slotId ?? null);

      if (resolvedId) {
        this.activeWorldId = resolvedId;
        this.saveManager.setStoredActiveWorldId(resolvedId);
        const loadRes = await this.saveManager.loadGame(this.engine, resolvedId);
        if (loadRes.ok && this.engine.state.lastSavedAt) {
          const elapsedSec = Math.max(0, (Date.now() - this.engine.state.lastSavedAt) / 1000);
          const summary = this.engine.applyOfflineCatchup(elapsedSec);
          if (summary) {
            this.offlineSummary = summary;
            await this.safeSaveActiveWorld(false);
          }
        }
      } else {
        this.activeWorldId = createWorldSlotId();
        this.saveManager.setStoredActiveWorldId(this.activeWorldId);
        await this.safeSaveActiveWorld(true);
      }
      void OfflineManager.requestPersistence();
      this.notifyImmediate();
    }

    this.phaserHost = new PhaserHost(container, this.engine, this.audio, this.perf, {
      onSelectTile: (gx, gy) => {
        this.selectedBuildingId = null;
        this.selectedTileCoords = { gx, gy };
        this.activeSheet = 'none';
        this.notifyImmediate();
      },
      onSelectBuilding: (buildingId) => {
        this.selectedTileCoords = null;
        this.selectedBuildingId = buildingId;
        this.activeSheet = 'none';
        this.notifyImmediate();
      },
      onGhostUpdated: (gx, gy, val: PlacementValidation) => {
        this.ghostInfo = {
          gx,
          gy,
          valid: val.valid,
          reason: val.reason,
          blockingObstacleTiles: val.blockingObstacleTiles,
          missingCoins: val.missingCoins,
          missingMaterials: val.missingMaterials,
          queueFull: val.queueFull,
        };
        this.notifyImmediate();
      },
      onMoveCompleted: (buildingId) => {
        this.tool = { mode: 'inspect_chop' };
        this.panMode = false;
        this.ghostInfo = null;
        this.selectedTileCoords = null;
        this.selectedBuildingId = buildingId;
        this.notifyImmediate();
      },
      onToolError: (reason) => {
        this.showErrorToast(reason);
      },
    });

    this.phaserHost.worldScene.setOverlayMode(this.overlayMode);
    this.phaserHost.worldScene.setPanMode(this.panMode);

    this.engine.subscribe(() => {
      this.snapshotDirty = true;
    });

    OfflineManager.subscribe(() => {
      this.notifyImmediate();
    });

    if (this.uiTimer === null) {
      this.uiTimer = window.setInterval(() => {
        if (this.snapshotDirty) {
          this.snapshotDirty = false;
          this.emit();
        }
      }, 200);
    }

    if (this.autosaveTimer === null) {
      this.autosaveTimer = window.setInterval(() => {
        void this.safeSaveActiveWorld(false);
      }, 45000);
    }

    window.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('pagehide', this.handlePageHide);
  }

  public unmount(): void {
    if (this.phaserHost) {
      this.phaserHost.destroy();
      this.phaserHost = null;
    }
    if (this.uiTimer !== null) {
      window.clearInterval(this.uiTimer);
      this.uiTimer = null;
    }
    if (this.autosaveTimer !== null) {
      window.clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    window.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('pagehide', this.handlePageHide);
  }

  private handleVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') {
      void this.safeSaveActiveWorld(false);
    }
  };

  private handlePageHide = (): void => {
    void this.safeSaveActiveWorld(false);
  };

  public dispatchResult(cmd: GameCommand): CommandResult {
    this.audio.unlock();
    const res = this.engine.dispatch(cmd);
    if (!res.ok && res.reason && !res.needsConfirm) {
      this.showErrorToast(res.reason);
      this.audio.play('error');
    } else if (
      res.ok &&
      (cmd.type === 'UNLOCK_TILE' ||
        cmd.type === 'UNLOCK_BATCH_FRONTIER' ||
        cmd.type === 'UNLOCK_CHUNK' ||
        cmd.type === 'UNLOCK_RECTANGLE')
    ) {
      this.audio.play('unlock');
      if (cmd.type === 'UNLOCK_RECTANGLE') {
        this.phaserHost?.worldScene.invalidateAllChunkTextures();
      }
    } else if (res.ok && cmd.type === 'DEMOLISH_BUILDING' && this.selectedBuildingId === cmd.buildingId) {
      this.selectedBuildingId = null;
    } else if (res.ok && cmd.type === 'REMOVE_ROAD') {
      this.audio.play('demolish');
    } else if (
      res.ok &&
      (cmd.type === 'RUSH_CONSTRUCTION' || cmd.type === 'BUILD_ROAD_GRID' || cmd.type === 'UPGRADE_CONNECTED_ROADS')
    ) {
      this.audio.play('build');
    } else if (res.ok && (cmd.type === 'BUY_MISSING_FOR_BUILDING' || cmd.type === 'RECRUIT_WORKERS' || cmd.type === 'CONVERT_CURRENCY')) {
      this.audio.play('coin');
    } else if (res.ok && cmd.type === 'CLEAR_AREA_OBSTACLES') {
      this.audio.play('tree_clear');
    } else if (res.ok && (cmd.type === 'TERRAFORM_TILE' || cmd.type === 'PAINT_TERRAIN_BRUSH')) {
      this.audio.play('build');
      this.phaserHost?.worldScene.invalidateAllChunkTextures();
      this.phaserHost?.worldScene.setOverlayMode(this.overlayMode);
    } else if (
      res.ok &&
      (cmd.type === 'TOGGLE_ZONE_BORDERS' ||
        cmd.type === 'TOGGLE_LAND_MODE' ||
        cmd.type === 'ASSIGN_TILE_CITY_ZONE')
    ) {
      this.audio.play('ui');
      if (cmd.type === 'TOGGLE_LAND_MODE') {
        this.phaserHost?.worldScene.invalidateAllChunkTextures();
      }
      this.phaserHost?.worldScene.setOverlayMode(this.overlayMode);
    }
    this.notifyImmediate();
    return res;
  }

  public dispatch(cmd: GameCommand): boolean {
    return this.dispatchResult(cmd).ok;
  }

  public setOverlayMode(mode: OverlayMode): void {
    this.audio.unlock();
    this.audio.play('ui');
    this.overlayMode = mode;
    this.phaserHost?.worldScene.setOverlayMode(mode);
    this.notifyImmediate();
  }

  public setRectPreview(rect: { startGx: number; startGy: number; width: number; height: number } | null): void {
    this.phaserHost?.worldScene.setRectPreview(rect);
  }

  public setRoadGridPreview(tiles: Array<{ gx: number; gy: number }> | null): void {
    this.phaserHost?.worldScene.setRoadGridPreview(tiles);
  }

  public setRoadUpgradePreview(tiles: Array<{ gx: number; gy: number }> | null): void {
    this.phaserHost?.worldScene.setRoadUpgradePreview(tiles);
  }

  public clearMapPreviews(): void {
    this.phaserHost?.worldScene.setRectPreview(null);
    this.phaserHost?.worldScene.setRoadGridPreview(null);
    this.phaserHost?.worldScene.setRoadUpgradePreview(null);
  }

  public setTool(tool: InteractionTool): void {
    this.audio.unlock();
    this.tool = tool;
    this.panMode = false;
    this.ghostInfo = null;
    if (tool.mode !== 'terrain_brush' && this.activeToolPanel === 'brush') {
      this.activeToolPanel = 'none';
    }
    if (tool.mode !== 'inspect_chop') {
      this.selectedTileCoords = null;
      this.selectedBuildingId = null;
    }
    this.phaserHost?.worldScene.setTool(tool);
    this.notifyImmediate();
  }

  public setActiveToolPanel(panel: ActiveToolPanel): void {
    this.audio.unlock();
    this.audio.play('ui');
    const next: ActiveToolPanel = this.activeToolPanel === panel ? 'none' : panel;
    this.activeToolPanel = next;

    if (next !== 'none') {
      this.activeSheet = 'none';
      this.selectedBuildingId = null;
      this.selectedTileCoords = null;
      this.ghostInfo = null;
    }

    if (next === 'brush') {
      const keepPan = this.panMode;
      this.tool = {
        mode: 'terrain_brush',
        brush: this.lastBrushKind,
        radius: this.lastBrushRadius,
        zoneType: this.lastBrushKind === 'zone' ? this.lastBrushZone : undefined,
      };
      this.phaserHost?.worldScene.setTool(this.tool);
      this.phaserHost?.worldScene.setPanMode(keepPan);
    } else if (next === 'none' && (this.tool.mode === 'terrain_brush' || this.tool.mode === 'terraform' || this.tool.mode === 'land_unlock')) {
      this.tool = { mode: 'inspect_chop' };
      this.panMode = false;
      this.phaserHost?.worldScene.setTool(this.tool);
      this.phaserHost?.worldScene.setPanMode(false);
    }

    this.notifyImmediate();
  }

  public updateBrushConfig(opts: {
    brush?: 'water' | 'land' | 'unlock' | 'zone';
    radius?: number;
    zoneType?: import('../../core/GameState').ZoneType;
  }): void {
    this.audio.unlock();
    this.audio.play('ui');
    if (opts.brush !== undefined) this.lastBrushKind = opts.brush;
    if (opts.radius !== undefined) {
      this.lastBrushRadius = Math.max(0, Math.min(6, Math.floor(opts.radius)));
    }
    if (opts.zoneType !== undefined) this.lastBrushZone = opts.zoneType;

    this.activeToolPanel = 'brush';
    this.activeSheet = 'none';
    const keepPan = this.panMode;
    this.tool = {
      mode: 'terrain_brush',
      brush: this.lastBrushKind,
      radius: this.lastBrushRadius,
      zoneType: this.lastBrushKind === 'zone' ? this.lastBrushZone : undefined,
    };
    this.phaserHost?.worldScene.setTool(this.tool);
    this.phaserHost?.worldScene.setPanMode(keepPan);
    this.notifyImmediate();
  }

  public setPanMode(enabled: boolean): void {
    this.audio.unlock();
    this.panMode = enabled;
    this.phaserHost?.worldScene.setPanMode(enabled);
    this.notifyImmediate();
  }

  public rotateTool(): void {
    this.audio.unlock();
    this.audio.play('ui');
    const nextRot = this.phaserHost?.worldScene.rotateGhostTool() ?? 0;
    if (this.tool.mode === 'build' || this.tool.mode === 'move') {
      this.tool = { ...this.tool, rotation: nextRot };
    }
    this.notifyImmediate();
  }

  public startTerraformTool(action: 'to_land' | 'to_water'): void {
    this.updateBrushConfig({
      brush: action === 'to_water' ? 'water' : 'land',
      radius: 0,
    });
  }

  public startMoveBuilding(buildingId: number): void {
    this.audio.unlock();
    this.audio.play('ui');
    const b = this.engine.state.buildings.find((item) => item.id === buildingId);
    this.tool = { mode: 'move', buildingId, rotation: b?.rotation ?? 0 };
    this.panMode = false;
    this.selectedTileCoords = null;
    this.selectedBuildingId = null;
    this.activeSheet = 'none';
    this.ghostInfo = null;
    this.phaserHost?.worldScene.setTool(this.tool);
    this.notifyImmediate();
  }

  public confirmGhostBuild(): void {
    this.phaserHost?.worldScene.confirmGhostPlacement();
    this.notifyImmediate();
  }

  public clearGhostObstacles(): boolean {
    if (!this.ghostInfo?.blockingObstacleTiles?.length) return false;
    return this.dispatch({
      type: 'CLEAR_AREA_OBSTACLES',
      tiles: this.ghostInfo.blockingObstacleTiles,
    });
  }

  public locateTarget(opts: { depositType?: number; coast?: boolean; ruin?: boolean; keepTool?: boolean }): boolean {
    this.audio.unlock();
    const center = this.getViewportCenterGrid();
    const hit = this.engine.chunks.findNearestTarget(center.gx, center.gy, opts);
    if (!hit) {
      const targetName = opts.ruin
        ? 'Ancient Ruin'
        : opts.coast
          ? 'River or Ocean shoreline'
          : opts.depositType
            ? DEPOSIT_NAMES[opts.depositType as DepositType] ?? 'mineral deposit'
            : 'target';
      this.showErrorToast(`No ${targetName} discovered within 26 tiles — unlock more land!`);
      this.audio.play('error');
      return false;
    }
    this.audio.play('discovery');
    this.activeSheet = 'none';
    if (!opts.keepTool) {
      this.tool = { mode: 'inspect_chop' };
      this.panMode = false;
      this.phaserHost?.worldScene.setTool(this.tool);
      this.selectedBuildingId = null;
      this.selectedTileCoords = { gx: hit.gx, gy: hit.gy };
    }
    const label = opts.ruin
      ? hit.unlocked
        ? 'Ruin Ready'
        : 'Unlock & Explore'
      : opts.coast
        ? hit.unlocked
          ? 'Shoreline'
          : 'Unlock Shore'
        : hit.unlocked
          ? DEPOSIT_NAMES[(opts.depositType ?? 1) as DepositType] ?? 'Deposit'
          : 'Unlock Deposit';
    this.phaserHost?.worldScene.focusOnGrid(hit.gx, hit.gy, label);
    this.notifyImmediate();
    return true;
  }

  public focusBuilding(buildingId: number): void {
    const b = this.engine.state.buildings.find((item) => item.id === buildingId);
    if (!b) return;
    this.audio.unlock();
    this.audio.play('ui');
    this.activeSheet = 'none';
    this.tool = { mode: 'inspect_chop' };
    this.panMode = false;
    this.phaserHost?.worldScene.setTool(this.tool);
    this.selectedTileCoords = null;
    this.selectedBuildingId = buildingId;
    this.phaserHost?.worldScene.focusOnGrid(b.gx, b.gy, BUILDINGS[b.defId]?.name ?? 'Building');
    this.notifyImmediate();
  }

  public focusCoordinate(gx: number, gy: number, label = 'Issue Location', buildingId?: number): void {
    this.audio.unlock();
    this.audio.play('ui');
    this.activeSheet = 'none';
    this.tool = { mode: 'inspect_chop' };
    this.panMode = false;
    this.phaserHost?.worldScene.setTool(this.tool);
    if (buildingId !== undefined) {
      this.selectedTileCoords = null;
      this.selectedBuildingId = buildingId;
    } else {
      this.selectedBuildingId = null;
      this.selectedTileCoords = { gx, gy };
    }
    this.phaserHost?.worldScene.focusOnGrid(gx, gy, label);
    this.notifyImmediate();
  }

  public getNetworkDiagnostics(): NetworkDiagnosticsReport {
    return this.engine.getNetworkDiagnostics();
  }

  public setTrackedQuest(questId: string | null): void {
    this.dispatch({ type: 'SET_TRACKED_QUEST', questId });
  }

  public getViewportCenterGrid(): { gx: number; gy: number } {
    return this.phaserHost?.worldScene.getViewportCenterGrid() ?? { gx: 2, gy: 2 };
  }

  public centerCamera(): void {
    this.phaserHost?.worldScene.centerOnOrigin();
  }

  public zoomIn(): void {
    this.audio.unlock();
    this.phaserHost?.worldScene.zoomBy(1.18);
  }

  public zoomOut(): void {
    this.audio.unlock();
    this.phaserHost?.worldScene.zoomBy(0.84);
  }

  public setActiveSheet(sheet: ActiveSheet): void {
    this.audio.unlock();
    this.audio.play('ui');
    const prev = this.activeSheet;
    this.activeSheet = this.activeSheet === sheet ? 'none' : sheet;
    if (this.activeSheet !== prev && this.activeSheet !== 'none') {
      this.clearMapPreviews();
    }
    if (this.activeSheet !== 'none') {
      this.activeToolPanel = 'none';
      this.selectedBuildingId = null;
      this.selectedTileCoords = null;
      if (this.tool.mode === 'terrain_brush' || this.tool.mode === 'terraform' || this.tool.mode === 'land_unlock') {
        this.tool = { mode: 'inspect_chop' };
        this.panMode = false;
        this.phaserHost?.worldScene.setTool(this.tool);
        this.phaserHost?.worldScene.setPanMode(false);
      }
    }
    this.notifyImmediate();
  }

  public openNationalStats(section: NationalStatsSection = 'overview'): void {
    this.audio.unlock();
    this.audio.play('ui');
    if (this.activeSheet === 'national_stats' && this.nationalStatsSection === section) {
      this.activeSheet = 'none';
      this.notifyImmediate();
      return;
    }
    this.clearMapPreviews();
    this.activeSheet = 'national_stats';
    this.nationalStatsSection = section;
    this.activeToolPanel = 'none';
    this.selectedBuildingId = null;
    this.selectedTileCoords = null;
    if (this.tool.mode === 'terrain_brush' || this.tool.mode === 'terraform' || this.tool.mode === 'land_unlock') {
      this.tool = { mode: 'inspect_chop' };
      this.panMode = false;
      this.phaserHost?.worldScene.setTool(this.tool);
      this.phaserHost?.worldScene.setPanMode(false);
    }
    this.notifyImmediate();
  }

  public setNationalStatsSection(section: NationalStatsSection): void {
    this.audio.unlock();
    this.audio.play('ui');
    this.nationalStatsSection = section;
    this.notifyImmediate();
  }

  public setActiveModal(modal: ActiveModal): void {
    this.audio.unlock();
    this.audio.play('ui');
    this.activeModal = modal;
    this.notifyImmediate();
  }

  public setSimInspectorOpen(open: boolean): void {
    this.audio.unlock();
    this.audio.play('ui');
    this.simInspectorOpen = open;
    this.notifyImmediate();
  }

  public clearSelection(): void {
    this.selectedBuildingId = null;
    this.selectedTileCoords = null;
    this.notifyImmediate();
  }

  public dismissOfflineSummary(): void {
    this.offlineSummary = null;
    this.notifyImmediate();
  }

  public showErrorToast(msg: string): void {
    this.toastError = msg;
    if (this.toastTimer) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toastError = null;
      this.notifyImmediate();
    }, 3200);
    this.notifyImmediate();
  }

  public async saveToSlot(slotId?: SaveSlotId): Promise<boolean> {
    const target = slotId ?? this.activeWorldId;
    if (target === this.activeWorldId) {
      const ok = await this.safeSaveActiveWorld(true);
      this.notifyImmediate();
      return ok;
    }
    const res = await this.saveManager.saveGame(this.engine, target, true);
    this.notifyImmediate();
    return res.ok;
  }

  public async loadFromSlot(slotId: SaveSlotId): Promise<{ ok: boolean; recoveredFromBackup?: boolean; migrated?: boolean; error?: string }> {
    return this.switchWorld(slotId);
  }

  public async switchWorld(slotId: SaveSlotId): Promise<{ ok: boolean; recoveredFromBackup?: boolean; migrated?: boolean; error?: string }> {
    if (slotId !== this.activeWorldId && this.activeWorldId) {
      await this.safeSaveActiveWorld(false);
    }
    const res = await this.saveManager.loadGame(this.engine, slotId);
    if (res.ok) {
      this.activeWorldId = slotId;
      this.saveManager.setStoredActiveWorldId(slotId);
      this.selectedBuildingId = null;
      this.selectedTileCoords = null;
      this.activeSheet = 'none';
      this.activeToolPanel = 'none';
      this.tool = { mode: 'inspect_chop' };
      this.panMode = false;
      this.ghostInfo = null;

      if (this.engine.state.lastSavedAt) {
        const elapsedSec = Math.max(0, (Date.now() - this.engine.state.lastSavedAt) / 1000);
        this.offlineSummary = this.engine.applyOfflineCatchup(elapsedSec);
      } else {
        this.offlineSummary = null;
      }

      this.phaserHost?.worldScene.setTool(this.tool);
      this.phaserHost?.worldScene.invalidateAllChunkTextures();
      this.centerCamera();
      await this.safeSaveActiveWorld(false);
    }
    this.notifyImmediate();
    return res;
  }

  public async renameWorld(slotId: SaveSlotId, newName: string): Promise<boolean> {
    const trimmed = newName.trim().slice(0, 28);
    if (!trimmed) return false;
    if (slotId === this.activeWorldId) {
      this.engine.dispatch({ type: 'UPDATE_SETTINGS', partial: { cityName: trimmed } });
      if (this.engine.state.cities[0]) {
        this.engine.dispatch({ type: 'RENAME_CITY', cityId: this.engine.state.cities[0].id, name: trimmed });
      }
      const ok = await this.safeSaveActiveWorld(false);
      this.notifyImmediate();
      return ok;
    }
    const ok = await this.saveManager.renameWorldSlot(slotId, trimmed);
    this.notifyImmediate();
    return ok;
  }

  public async deleteWorld(slotId: SaveSlotId): Promise<boolean> {
    if (slotId === this.activeWorldId) return false;
    const ok = await this.saveManager.deleteSlot(slotId);
    this.notifyImmediate();
    return ok;
  }

  public async importWorldFile(
    file: File
  ): Promise<{ ok: boolean; slotId?: SaveSlotId; migrated?: boolean; error?: string }> {
    if (this.activeWorldId) {
      await this.safeSaveActiveWorld(false);
    }
    const res = await this.saveManager.importBackupFile(file, this.engine);
    if (res.ok && res.slotId) {
      this.activeWorldId = res.slotId;
      this.saveManager.setStoredActiveWorldId(res.slotId);
      this.selectedBuildingId = null;
      this.selectedTileCoords = null;
      this.activeSheet = 'none';
      this.activeToolPanel = 'none';
      this.tool = { mode: 'inspect_chop' };
      this.panMode = false;
      this.ghostInfo = null;
      this.offlineSummary = null;
      this.phaserHost?.worldScene.setTool(this.tool);
      this.phaserHost?.worldScene.invalidateAllChunkTextures();
      this.centerCamera();
    }
    this.notifyImmediate();
    return res;
  }

  public async restorePreMigrationBackup(slotId: SaveSlotId): Promise<{ ok: boolean; error?: string }> {
    const res = await this.saveManager.restorePreMigrationBackup(this.engine, slotId);
    if (res.ok) {
      this.activeWorldId = slotId;
      this.saveManager.setStoredActiveWorldId(slotId);
      this.phaserHost?.worldScene.invalidateAllChunkTextures();
      this.centerCamera();
    }
    this.notifyImmediate();
    return res;
  }

  public async listSaveSlots(): Promise<SaveSlotSummary[]> {
    return this.saveManager.listSlots();
  }

  public async createNewWorld(cityName: string, difficulty: 'standard' | 'relaxed'): Promise<void> {
    if (this.activeWorldId) {
      await this.safeSaveActiveWorld(false);
    }
    const nextId = createWorldSlotId();
    this.activeWorldId = nextId;
    this.saveManager.setStoredActiveWorldId(nextId);

    this.engine.resetNewWorld(cityName, difficulty);
    this.selectedBuildingId = null;
    this.selectedTileCoords = null;
    this.activeSheet = 'none';
    this.activeToolPanel = 'none';
    this.activeModal = 'none';
    this.tool = { mode: 'inspect_chop' };
    this.panMode = false;
    this.ghostInfo = null;
    this.offlineSummary = null;

    this.phaserHost?.worldScene.setTool(this.tool);
    this.phaserHost?.worldScene.invalidateAllChunkTextures();
    this.centerCamera();
    await this.safeSaveActiveWorld(true);
    this.notifyImmediate();
  }

  public startNewGame(cityName: string, difficulty: 'standard' | 'relaxed'): void {
    void this.createNewWorld(cityName, difficulty);
  }

  public getSnapshot(): GameSnapshot {
    const activeQuest = this.engine.progression.getActiveQuest(this.engine.state);
    const activeQuests = this.engine.progression.getActiveQuests(this.engine.state, 3);
    const allQuests = this.engine.progression.getAllQuestProgress(this.engine.state);
    const buildQueueActive = this.engine.state.buildings.filter((b) => b.status === 'constructing').length;
    const buildQueueCap = getBuildQueueCap(this.engine.state.level);

    return {
      state: this.engine.state,
      activeWorldId: this.activeWorldId,
      panMode: this.panMode,
      offlineSummary: this.offlineSummary,
      activeQuest,
      activeQuests,
      allQuests,
      buildQueueActive,
      buildQueueCap,
      notifications: this.engine.progression.getNotifications(),
      perf: this.perf.getMetrics(),
      offline: { ...OfflineManager.status },
      tool: this.tool,
      overlayMode: this.overlayMode,
      selectedTile: this.selectedTileCoords
        ? this.engine.inspectTile(this.selectedTileCoords.gx, this.selectedTileCoords.gy)
        : null,
      selectedBuildingId: this.selectedBuildingId,
      ghostInfo: this.ghostInfo,
      activeSheet: this.activeSheet,
      nationalStatsSection: this.nationalStatsSection,
      activeToolPanel: this.activeToolPanel,
      activeModal: this.activeModal,
      simInspectorOpen: this.simInspectorOpen,
      toastError: this.toastError,
    };
  }

  public subscribe(cb: () => void): () => void {
    this.subscribers.add(cb);
    return () => this.subscribers.delete(cb);
  }

  private notifyImmediate(): void {
    this.snapshotDirty = false;
    this.emit();
  }

  private emit(): void {
    for (const cb of this.subscribers) cb();
  }
}

export const GameController = new GameControllerImpl();

export function useGameSnapshot(): GameSnapshot {
  const [snap, setSnap] = useState<GameSnapshot>(() => GameController.getSnapshot());
  useEffect(() => {
    return GameController.subscribe(() => {
      setSnap(GameController.getSnapshot());
    });
  }, []);
  return snap;
}
