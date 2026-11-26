import Phaser from 'phaser';
import { BUILDINGS, getBuildingFootprint } from '../data/buildings.data';
import { RoadType } from '../data/roads.data';
import { DepositType, FeatureType } from '../data/trees.data';
import type { CoreEngine } from '../core/CoreEngine';
import {
  BiomeId,
  BuildingInstance,
  ChunkData,
  RoadDirection,
  TileFlag,
  UtilityFlag,
  ZoneId,
  ZONE_ID_TO_TYPE,
  ZONE_META,
  ZoneType,
} from '../core/GameState';
import {
  CHUNK_SIZE,
  chunkKey,
  chunkToGrid,
  gridToChunk,
  gridToIso,
  isoToGridApprox,
  localTileIndex,
  tileKey,
} from '../core/IsoMath';
import type { PerfMonitor } from '../persistence/PerfMonitor';
import { UtilityNetworkSystem, type UtilityPlacementKind } from '../systems/UtilityNetworkSystem';
import { TreePlantationSystem } from '../systems/TreePlantationSystem';
import { ATLAS_KEY, generateWorldAtlas, getBuildingSpriteRef, isHalfResBuildingFrame } from './AtlasGenerator';
import type { AudioSystem } from './AudioSystem';
import { CameraInputController } from './CameraInputController';
import { VfxPool } from './VfxPool';

export type OverlayMode = 'none' | 'power' | 'water' | 'zones' | 'deposits' | 'paths' | 'traffic';

export type TerrainBrushKind = 'water' | 'land' | 'unlock' | 'zone';

export type InteractionTool =
  | { mode: 'inspect_chop' }
  | { mode: 'land_unlock' }
  | { mode: 'rect_land' }
  | { mode: 'terraform'; action: 'to_land' | 'to_water' }
  | { mode: 'terrain_brush'; brush: TerrainBrushKind; radius: number; zoneType?: ZoneType }
  | { mode: 'build'; defId: string; rotation?: 0 | 1; targetLevel?: number; copiedFromBuildingId?: number }
  | { mode: 'move'; buildingId: number; rotation?: 0 | 1 }
  | { mode: 'road'; roadType: RoadType }
  | { mode: 'replant' }
  | { mode: 'demolish' }
  | { mode: 'place_utility'; kind: UtilityPlacementKind }
  | { mode: 'remove_utility'; kind: 'power' | 'water' };

import type { PlacementValidation } from '../systems/BuildingSystem';

export interface SceneCallbacks {
  onSelectTile: (gx: number, gy: number) => void;
  onSelectBuilding: (buildingId: number) => void;
  onGhostUpdated: (gx: number, gy: number, validation: PlacementValidation) => void;
  onMoveCompleted?: (buildingId: number) => void;
  onToolError: (reason: string) => void;
}

interface ChunkRenderSlot {
  key: string;
  cx: number;
  cy: number;
  rt: Phaser.GameObjects.RenderTexture;
  originSx: number;
  originSy: number;
  lastUsedFrame: number;
}

const CHUNK_TEX_W = 1088;
const CHUNK_TEX_H = 620;
const CHUNK_OFFSET_X = 544;
const CHUNK_OFFSET_Y = 96;
const MAX_RENDER_TEXTURES = 24;

const SMOKE_BUILDINGS = new Set([
  'timber_cottage',
  'brick_townhouse',
  'bakery',
  'brick_kiln',
  'iron_smelter',
  'copper_smelter',
  'steelworks',
  'coal_power_plant',
  'glassworks',
  'pottery_workshop',
  'mint_foundry',
  'mega_brick_kiln',
  'regional_bakery_plant',
  'industrial_steel_complex',
]);

function getIndoorActivityEmoji(category: string, defId: string): string {
  if (defId.includes('bakery') || category === 'agricultural') return '🌾';
  if (defId.includes('steel') || defId.includes('kiln') || defId.includes('smelter') || category === 'industrial') return '🏭';
  if (category === 'production') return '⚙️';
  if (category === 'commercial') return '🏪';
  if (category === 'government') return '🏛️';
  if (category === 'healthcare') return '⚕️';
  if (category === 'educational') return '📚';
  if (category === 'residential') return '🏠';
  return '🔨';
}

export class WorldScene extends Phaser.Scene {
  private engine!: CoreEngine;
  private audio!: AudioSystem;
  private perf!: PerfMonitor;
  private sceneCallbacks!: SceneCallbacks;

  private cameraCtrl!: CameraInputController;
  private vfx!: VfxPool;

  private chunkTextures = new Map<string, ChunkRenderSlot>();
  private featureSprites: Phaser.GameObjects.Image[] = [];
  private featureCoords: Array<{ gx: number; gy: number }> = [];
  private activeFeatureCount = 0;

  private depositSprites: Phaser.GameObjects.Image[] = [];
  private waterRippleSprites: Phaser.GameObjects.Image[] = [];
  private waterTileCenters: Array<{ sx: number; sy: number; gx: number; gy: number }> = [];
  private roadLightTiles: Array<{ sx: number; sy: number; gx: number; gy: number }> = [];
  private hasWaterVisible = false;

  private citizenSprites: Phaser.GameObjects.Image[] = [];
  private cargoSprites: Phaser.GameObjects.Image[] = [];
  private plantationTreeSprites: Phaser.GameObjects.Image[] = [];
  private plantationTreeCoords: Array<{ gx: number; gy: number }> = [];
  private activePlantationTreeCount = 0;
  private vehicleSprites: Phaser.GameObjects.Image[] = [];
  private trainSprites: Phaser.GameObjects.Image[] = [];
  private landPriceLabels: Phaser.GameObjects.Text[] = [];
  private lightSprites: Phaser.GameObjects.Image[] = [];
  private windowLightSprites: Phaser.GameObjects.Image[] = [];
  private starSprites: Array<{ img: Phaser.GameObjects.Image; rx: number; ry: number; phase: number }> = [];
  private smokeSprites: Phaser.GameObjects.Image[] = [];

  private buildingSprites = new Map<number, Phaser.GameObjects.Image>();
  private statusMarkers = new Map<number, Phaser.GameObjects.Text>();
  private activityBadges = new Map<number, Phaser.GameObjects.Text>();
  private ambientSprites: Array<{ img: Phaser.GameObjects.Image; phase: number; baseX: number; baseY: number }> = [];
  private boatSprites: Array<{ img: Phaser.GameObjects.Image; phase: number }> = [];
  private deerSprites: Array<{ img: Phaser.GameObjects.Image; phase: number; gx: number; gy: number }> = [];
  private fireflySprites: Array<{ img: Phaser.GameObjects.Image; phase: number; baseX: number; baseY: number }> = [];
  private lanternSprites: Array<{ img: Phaser.GameObjects.Image; phase: number; baseX: number; baseY: number }> = [];

  private selectedCursor!: Phaser.GameObjects.Image;
  private ghostFootprintSprites: Phaser.GameObjects.Image[] = [];
  private ghostBuildingSprite!: Phaser.GameObjects.Image;
  private overlayGraphics!: Phaser.GameObjects.Graphics;
  private previewGraphics!: Phaser.GameObjects.Graphics;
  private skyWashOverlay!: Phaser.GameObjects.Rectangle;
  private ambientOverlay!: Phaser.GameObjects.Rectangle;
  private weatherOverlay!: Phaser.GameObjects.Rectangle;
  private weatherDrops: Array<{ rect: Phaser.GameObjects.Rectangle; rx: number; ry: number; speed: number }> = [];

  private rectPreview: { startGx: number; startGy: number; width: number; height: number } | null = null;
  private roadGridPreview: Array<{ gx: number; gy: number }> | null = null;
  private roadUpgradePreview: Array<{ gx: number; gy: number }> | null = null;

  private tool: InteractionTool = { mode: 'inspect_chop' };
  private panMode = false;
  private overlayMode: OverlayMode = 'none';
  private selectedTile: { gx: number; gy: number } | null = null;
  private ghostCoord: { gx: number; gy: number } | null = null;
  private frameCounter = 0;
  private entityRefreshTimer = 0;
  private forceEntitySync = true;
  private lowPowerMode = false;
  private animClockSec = 0;
  private lastInLandMode = false;
  private lastVisibleChunkBounds: { minCx: number; maxCx: number; minCy: number; maxCy: number } | null = null;

  constructor() {
    super({ key: 'WorldScene' });
  }

  public configure(
    engine: CoreEngine,
    audio: AudioSystem,
    perf: PerfMonitor,
    callbacks: SceneCallbacks
  ): void {
    this.engine = engine;
    this.audio = audio;
    this.perf = perf;
    this.sceneCallbacks = callbacks;
  }

  public isInLandMode(): boolean {
    return (
      Boolean(this.engine?.state?.landModeActive) ||
      this.tool.mode === 'land_unlock' ||
      this.tool.mode === 'rect_land'
    );
  }

  public setRectPreview(rect: { startGx: number; startGy: number; width: number; height: number } | null): void {
    this.rectPreview = rect;
    this.renderPreviews();
  }

  public setRoadGridPreview(tiles: Array<{ gx: number; gy: number }> | null): void {
    this.roadGridPreview = tiles;
    this.renderPreviews();
  }

  public setRoadUpgradePreview(tiles: Array<{ gx: number; gy: number }> | null): void {
    this.roadUpgradePreview = tiles;
    this.renderPreviews();
  }

  public setPanMode(enabled: boolean): void {
    this.panMode = enabled;
  }

  public setTool(tool: InteractionTool): void {
    const prevLand = this.isInLandMode();
    this.tool = tool;
    this.panMode = false;
    if (tool.mode !== 'build' && tool.mode !== 'move') {
      this.ghostCoord = null;
      this.hideGhost();
    } else if (tool.mode === 'move') {
      const b = this.engine.state.buildings.find((item) => item.id === tool.buildingId);
      if (b) {
        if (tool.rotation === undefined) {
          this.tool = { ...tool, rotation: b.rotation ?? 0 };
        }
        this.ghostCoord = { gx: b.gx, gy: b.gy };
        this.updateGhostPreview();
      } else {
        this.ghostCoord = null;
        this.hideGhost();
      }
    } else {
      this.ghostCoord = null;
      this.hideGhost();
    }
    if (prevLand !== this.isInLandMode()) {
      this.invalidateAllChunkTextures();
    }
    this.forceEntitySync = true;
    this.renderPreviews();
    this.renderMapOverlay();
  }

  public rotateGhostTool(): 0 | 1 {
    if (this.tool.mode === 'build') {
      const nextRot: 0 | 1 = this.tool.rotation === 1 ? 0 : 1;
      this.tool = { ...this.tool, rotation: nextRot };
      this.updateGhostPreview();
      return nextRot;
    }
    if (this.tool.mode === 'move') {
      const moveBuildingId = this.tool.buildingId;
      const b = this.engine.state.buildings.find((item) => item.id === moveBuildingId);
      const curRot = this.tool.rotation ?? b?.rotation ?? 0;
      const nextRot: 0 | 1 = curRot === 1 ? 0 : 1;
      this.tool = { ...this.tool, rotation: nextRot };
      this.updateGhostPreview();
      return nextRot;
    }
    return 0;
  }

  public setOverlayMode(mode: OverlayMode): void {
    this.overlayMode = mode;
    this.renderMapOverlay();
    this.forceEntitySync = true;
  }

  private triggerHaptic(ms = 10): void {
    if (this.engine.state.settings.haptics && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  }

  public confirmGhostPlacement(): void {
    if (!this.ghostCoord) return;

    if (this.tool.mode === 'build') {
      const rot = this.tool.rotation ?? 0;
      const res = this.engine.dispatch({
        type: 'PLACE_BUILDING',
        defId: this.tool.defId,
        gx: this.ghostCoord.gx,
        gy: this.ghostCoord.gy,
        rotation: rot,
        targetLevel: this.tool.targetLevel,
      });
      if (res.ok) {
        this.audio.play('build');
        this.triggerHaptic(14);
        const { sx, sy } = gridToIso(this.ghostCoord.gx, this.ghostCoord.gy, 2);
        this.vfx.spawnText(sx, sy - 20, 'Constructing!', '#86efac');
        this.forceEntitySync = true;
      } else {
        this.audio.play('error');
        this.sceneCallbacks.onToolError(res.reason ?? 'Cannot build here');
      }
      return;
    }

    if (this.tool.mode === 'move') {
      const targetBuildingId = this.tool.buildingId;
      const b = this.engine.state.buildings.find((item) => item.id === targetBuildingId);
      const rot = this.tool.rotation ?? b?.rotation ?? 0;
      const res = this.engine.dispatch({
        type: 'MOVE_BUILDING',
        buildingId: targetBuildingId,
        gx: this.ghostCoord.gx,
        gy: this.ghostCoord.gy,
        rotation: rot,
      });
      if (res.ok) {
        this.audio.play('move');
        this.triggerHaptic(12);
        const { sx, sy } = gridToIso(this.ghostCoord.gx, this.ghostCoord.gy, 2);
        this.vfx.spawnText(sx, sy - 24, 'Relocated!', '#93c5fd');
        this.ghostCoord = null;
        this.hideGhost();
        this.tool = { mode: 'inspect_chop' };
        this.forceEntitySync = true;
        this.sceneCallbacks.onMoveCompleted?.(targetBuildingId);
      } else {
        this.audio.play('error');
        this.sceneCallbacks.onToolError(res.reason ?? 'Cannot move building here');
      }
    }
  }

  public centerOnOrigin(): void {
    if (this.cameraCtrl) {
      this.cameraCtrl.centerOnGrid(2, 1);
    }
  }

  public getViewportCenterGrid(): { gx: number; gy: number } {
    if (this.cameraCtrl) {
      return this.cameraCtrl.getViewportCenterGrid();
    }
    return { gx: 2, gy: 2 };
  }

  public focusOnGrid(gx: number, gy: number, label = 'Target'): void {
    if (this.cameraCtrl) {
      this.cameraCtrl.centerOnGrid(gx, gy);
    }
    this.selectedTile = { gx, gy };
    const elev = this.getTileElev(gx, gy);
    const { sx, sy } = gridToIso(gx, gy, elev);
    this.selectedCursor.setPosition(sx, sy).setVisible(true);
    this.vfx?.spawnText(sx, sy - 26, label, '#fde047');
    this.forceEntitySync = true;
  }

  public zoomBy(factor: number): void {
    if (this.cameraCtrl) {
      this.cameraCtrl.zoomByStep(factor);
    }
  }

  public invalidateAllChunkTextures(): void {
    this.lastVisibleChunkBounds = null;
    for (const slot of this.chunkTextures.values()) {
      this.engine.chunks.markRenderDirty(slot.cx, slot.cy);
    }
  }

  public create(): void {
    generateWorldAtlas(this);

    const cam = this.cameras.main;
    cam.setBackgroundColor('#07150e');
    cam.setZoom(Math.max(1.18, this.engine.state.camera.zoom || 1.28));

    this.vfx = new VfxPool(this);

    // Pre-allocate large tree/feature pool (720) with frustum culling so trees never hide on pan/zoom
    for (let i = 0; i < 720; i++) {
      const f = this.add.image(0, 0, ATLAS_KEY, `feat_${FeatureType.JungleHardwood}`);
      f.setOrigin(0.5, 0.82).setVisible(false);
      this.featureSprites.push(f);
      this.featureCoords.push({ gx: 0, gy: 0 });
    }
    for (let i = 0; i < 90; i++) {
      const d = this.add.image(0, 0, ATLAS_KEY, `dep_${DepositType.Stone}`);
      d.setOrigin(0.5, 0.5).setVisible(false);
      this.depositSprites.push(d);
    }

    // Water animated ripple pool
    for (let i = 0; i < 180; i++) {
      const w = this.add.image(0, 0, ATLAS_KEY, 'water_ripple').setDepth(-9000).setVisible(false);
      this.waterRippleSprites.push(w);
    }

    // Autonomous Citizen villager + cargo pools (sized for max 64 crowd cap, naturally scaled to fit sidewalks/doors)
    for (let i = 0; i < 64; i++) {
      const c = this.add
        .image(0, 0, ATLAS_KEY, 'cit_laborer_0')
        .setOrigin(0.5, 0.9)
        .setScale(0.33)
        .setVisible(false);
      this.citizenSprites.push(c);

      const cg = this.add
        .image(0, 0, ATLAS_KEY, 'cargo_wood')
        .setOrigin(0.5, 0.5)
        .setScale(0.38)
        .setVisible(false);
      this.cargoSprites.push(cg);
    }

    // Automated Tree Plantation Factory live tree pool (450 visible frustum-culled trees)
    for (let i = 0; i < 450; i++) {
      const pt = this.add.image(0, 0, ATLAS_KEY, `feat_${FeatureType.Sapling}`);
      pt.setOrigin(0.5, 0.82).setVisible(false);
      this.plantationTreeSprites.push(pt);
      this.plantationTreeCoords.push({ gx: 0, gy: 0 });
    }

    // Road vehicles pool (60)
    for (let i = 0; i < 60; i++) {
      const v = this.add
        .image(0, 0, ATLAS_KEY, 'veh_cargo_truck_empty')
        .setOrigin(0.5, 0.72)
        .setScale(0.65)
        .setVisible(false);
      this.vehicleSprites.push(v);
    }

    // Railway train pool (12)
    for (let i = 0; i < 12; i++) {
      const tr = this.add
        .image(0, 0, ATLAS_KEY, 'train_passenger')
        .setOrigin(0.5, 0.72)
        .setScale(0.85)
        .setVisible(false);
      this.trainSprites.push(tr);
    }

    // Land Mode tile price labels pool (90)
    for (let i = 0; i < 90; i++) {
      const lbl = this.add
        .text(0, 0, '', {
          fontSize: '9px',
          fontStyle: 'bold',
          color: '#fef08a',
          backgroundColor: 'rgba(2, 6, 23, 0.78)',
          padding: { x: 3, y: 1 },
        })
        .setOrigin(0.5, 0.5)
        .setDepth(805000)
        .setVisible(false);
      this.landPriceLabels.push(lbl);
    }

    // Chimney smoke puffs pool
    for (let i = 0; i < 36; i++) {
      const sm = this.add.image(0, 0, ATLAS_KEY, 'smoke_puff').setVisible(false);
      this.smokeSprites.push(sm);
    }

    // Warm additive night light halos pool (streetlamps, plazas, citizen lanterns)
    for (let i = 0; i < 140; i++) {
      const lt = this.add
        .image(0, 0, ATLAS_KEY, 'light_halo')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(960000)
        .setVisible(false);
      this.lightSprites.push(lt);
    }

    // Illuminated building window glow pool
    for (let i = 0; i < 80; i++) {
      const wg = this.add
        .image(0, 0, ATLAS_KEY, 'window_glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(960500)
        .setVisible(false);
      this.windowLightSprites.push(wg);
    }

    // Twinkling night sky starfield pool
    for (let i = 0; i < 28; i++) {
      const st = this.add
        .image(0, 0, ATLAS_KEY, 'sky_star')
        .setScrollFactor(0)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(946500)
        .setVisible(false);
      const rx = ((i * 73 + 19) % 100) / 100;
      const ry = ((i * 41 + 11) % 45) / 100;
      this.starSprites.push({ img: st, rx, ry, phase: i * 0.9 });
    }

    this.overlayGraphics = this.add.graphics().setDepth(790000);
    this.previewGraphics = this.add.graphics().setDepth(812000);

    this.selectedCursor = this.add
      .image(0, 0, ATLAS_KEY, 'tile_selected')
      .setOrigin(0.5, 0)
      .setDepth(800000)
      .setVisible(false);

    for (let i = 0; i < 24; i++) {
      const g = this.add
        .image(0, 0, ATLAS_KEY, 'tile_valid')
        .setOrigin(0.5, 0)
        .setDepth(810000)
        .setVisible(false);
      this.ghostFootprintSprites.push(g);
    }

    const defaultGhostRef = getBuildingSpriteRef('leaf_hut', 1, 0);
    this.ghostBuildingSprite = this.add
      .image(0, 0, defaultGhostRef.textureKey, defaultGhostRef.frame)
      .setOrigin(0.5, 1)
      .setAlpha(0.78)
      .setDepth(820000)
      .setVisible(false);

    // Secondary twilight / sunrise horizon wash
    this.skyWashOverlay = this.add
      .rectangle(0, 0, 4000, 4000, 0xf97316, 0)
      .setScrollFactor(0)
      .setDepth(944000);

    // Day/Night ambient darkness & sunset tint overlay
    this.ambientOverlay = this.add
      .rectangle(0, 0, 4000, 4000, 0x040b1d, 0)
      .setScrollFactor(0)
      .setDepth(945000);

    // Weather screen tint
    this.weatherOverlay = this.add
      .rectangle(0, 0, 4000, 4000, 0x0f172a, 0)
      .setScrollFactor(0)
      .setDepth(950000);

    // Pooled rain streaks & snow flakes (screen-space)
    for (let i = 0; i < 42; i++) {
      const rect = this.add
        .rectangle(0, 0, 2, 11, 0xbae6fd, 0.55)
        .setScrollFactor(0)
        .setDepth(951000)
        .setVisible(false);
      this.weatherDrops.push({
        rect,
        rx: ((i * 53 + 17) % 100) / 100,
        ry: ((i * 29 + 7) % 100) / 100,
        speed: 0.75 + (i % 5) * 0.14,
      });
    }

    // Pooled ambient birds & river boats
    for (let i = 0; i < 8; i++) {
      const img = this.add
        .image(0, 0, ATLAS_KEY, 'amb_bird')
        .setDepth(850000)
        .setVisible(false);
      this.ambientSprites.push({
        img,
        phase: i * 1.1,
        baseX: (i - 4) * 90,
        baseY: (i % 3) * 70 - 40,
      });
    }
    for (let i = 0; i < 3; i++) {
      const boat = this.add.image(0, 0, ATLAS_KEY, 'amb_boat').setVisible(false);
      this.boatSprites.push({ img: boat, phase: i * 2.1 });
    }
    for (let i = 0; i < 5; i++) {
      const deer = this.add.image(0, 0, ATLAS_KEY, 'wild_deer').setVisible(false);
      this.deerSprites.push({
        img: deer,
        phase: i * 1.4,
        gx: (i - 2) * 3.5 + 1.5,
        gy: ((i % 3) - 1) * 3.2 + 1.5,
      });
    }
    for (let i = 0; i < 18; i++) {
      const ff = this.add
        .image(0, 0, ATLAS_KEY, 'firefly_glow')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(955000)
        .setVisible(false);
      this.fireflySprites.push({
        img: ff,
        phase: i * 0.75,
        baseX: ((i % 6) - 2.5) * 95,
        baseY: (Math.floor(i / 6) - 1) * 75,
      });
    }
    for (let i = 0; i < 14; i++) {
      const lan = this.add
        .image(0, 0, ATLAS_KEY, 'festival_lantern')
        .setDepth(952000)
        .setVisible(false);
      this.lanternSprites.push({
        img: lan,
        phase: i * 0.65,
        baseX: ((i % 7) - 3) * 75,
        baseY: (Math.floor(i / 7) - 0.5) * 90,
      });
    }

    this.cameraCtrl = new CameraInputController(this, this.engine.chunks, {
      onTapTile: (gx, gy) => this.handleTapTile(gx, gy),
      onLongPressTile: (gx, gy) => {
        this.selectedTile = { gx, gy };
        this.sceneCallbacks.onSelectTile(gx, gy);
      },
      onDragPaintTile: (gx, gy) => this.handlePaintTile(gx, gy),
      isPaintMode: () =>
        !this.panMode &&
        (this.tool.mode === 'road' ||
          this.tool.mode === 'land_unlock' ||
          this.tool.mode === 'terraform' ||
          this.tool.mode === 'terrain_brush' ||
          this.tool.mode === 'demolish' ||
          this.tool.mode === 'place_utility' ||
          this.tool.mode === 'remove_utility'),
      onUserGestureAudioUnlock: () => this.audio.unlock(),
      onCameraMoved: (x, y, z) => {
        this.engine.dispatch({ type: 'SET_CAMERA', x, y, zoom: z });
        this.forceEntitySync = true;
      },
    });

    this.cameraCtrl.centerOnGrid(2, 1);

    // Subscribe to engine events for immediate VFX & dirty sync
    this.engine.subscribe((ev) => {
      if (ev.type === 'CHOP_HIT') {
        const { sx, sy } = gridToIso(ev.gx, ev.gy, 2);
        this.vfx.spawnChips(sx, sy - 6, 0xa16207, ev.cleared ? 8 : 3);
        if (ev.cleared) {
          if (!ev.fromCitizen) this.audio.play('tree_clear');
          const msg = ev.wood > 0 ? `+${ev.wood} Wood  +${ev.coins}C` : `+${ev.coins}C`;
          this.vfx.spawnText(sx, sy - 24, msg, '#bef264');
        } else if (!ev.fromCitizen) {
          this.audio.play('chop');
        }
        this.forceEntitySync = true;
      } else if (ev.type === 'AUTO_DELIVERY') {
        const { sx, sy } = gridToIso(ev.gx, ev.gy, 2);
        this.vfx.spawnText(sx, sy - 26, ev.label, ev.color);
      } else if (ev.type === 'TILE_UNLOCKED') {
        this.markRoadNeighborsDirty(ev.gx, ev.gy);
        const { sx, sy } = gridToIso(ev.gx, ev.gy, 2);
        this.audio.play('unlock');
        this.vfx.spawnText(sx, sy - 10, 'Unlocked', '#fde047');
        this.cameraCtrl.clampCamera();
        this.forceEntitySync = true;
      } else if (ev.type === 'BUILDING_COMPLETED') {
        const { sx, sy } = gridToIso(ev.gx, ev.gy, 2);
        this.audio.play('coin');
        this.vfx.spawnText(sx, sy - 28, `+${ev.xp} XP`, '#93c5fd');
        this.forceEntitySync = true;
      } else if (ev.type === 'RUIN_EXPLORED') {
        const { sx, sy } = gridToIso(ev.gx, ev.gy, 2);
        this.audio.play('discovery');
        this.vfx.spawnChips(sx, sy - 10, 0xfde047, 10);
        this.vfx.spawnText(sx, sy - 32, `+${ev.coins}C  +${ev.rp} RP`, '#fde047');
        this.forceEntitySync = true;
      } else if (ev.type === 'FESTIVAL_STARTED') {
        this.audio.play('festival');
        const cam = this.cameras.main;
        this.vfx.spawnText(cam.scrollX + cam.width * 0.5, cam.scrollY + cam.height * 0.4, 'City Festival!', '#fde047');
      } else if (ev.type === 'BUILDING_MOVED' || ev.type === 'BUILDING_PLACED') {
        this.forceEntitySync = true;
      } else if (ev.type === 'ROAD_PLACED') {
        this.markRoadNeighborsDirty(ev.gx, ev.gy);
        this.forceEntitySync = true;
      } else if (ev.type === 'ROAD_REMOVED') {
        this.markRoadNeighborsDirty(ev.gx, ev.gy);
        const { sx, sy } = gridToIso(ev.gx, ev.gy, 2);
        this.vfx.spawnChips(sx, sy, 0x94a3b8, 5);
        this.vfx.spawnText(
          sx,
          sy - 16,
          ev.refundCoins > 0 ? `Removed +${ev.refundCoins}C` : 'Removed',
          '#fca5a5'
        );
        this.forceEntitySync = true;
      } else if (ev.type === 'LEVEL_UP') {
        this.audio.play('levelup');
      } else if (ev.type === 'STATE_CHANGED') {
        this.cameraCtrl.clampCamera();
        this.forceEntitySync = true;
      }
    });

    this.game.canvas.addEventListener('webglcontextlost', () => {
      this.engine.dispatch({ type: 'SET_SPEED', speed: 0 });
    });
    this.game.canvas.addEventListener('webglcontextrestored', () => {
      this.invalidateAllChunkTextures();
      this.forceEntitySync = true;
    });
  }

  private handleTapTile(gx: number, gy: number): void {
    this.selectedTile = { gx, gy };
    const { sx, sy } = gridToIso(gx, gy, this.getTileElev(gx, gy));
    this.selectedCursor.setPosition(sx, sy).setVisible(true);

    if (this.tool.mode === 'build' || this.tool.mode === 'move') {
      if (this.ghostCoord && this.ghostCoord.gx === gx && this.ghostCoord.gy === gy) {
        this.confirmGhostPlacement();
        return;
      }
      this.ghostCoord = { gx, gy };
      this.updateGhostPreview();
      return;
    }

    if (this.tool.mode === 'road') {
      const res = this.engine.dispatch({ type: 'PLACE_ROAD', roadType: this.tool.roadType, gx, gy });
      if (res.ok) {
        this.audio.play('road');
      } else {
        this.audio.play('error');
        this.sceneCallbacks.onToolError(res.reason ?? 'Cannot build road');
      }
      return;
    }

    if (this.tool.mode === 'land_unlock') {
      const res = this.engine.dispatch({ type: 'UNLOCK_TILE', gx, gy });
      if (!res.ok) {
        this.audio.play('error');
        this.sceneCallbacks.onToolError(res.reason ?? 'Cannot unlock tile');
      } else {
        this.triggerHaptic(8);
      }
      return;
    }

    if (this.tool.mode === 'terraform') {
      const res = this.engine.dispatch({
        type: 'TERRAFORM_TILE',
        gx,
        gy,
        action: this.tool.action,
      });
      if (res.ok) {
        this.audio.play('build');
        this.triggerHaptic(10);
        this.vfx.spawnChips(
          sx,
          sy + 8,
          this.tool.action === 'to_water' ? 0x38bdf8 : 0x6ec45a,
          6
        );
        this.vfx.spawnText(
          sx,
          sy - 14,
          this.tool.action === 'to_water' ? 'Water' : 'Reclaimed',
          this.tool.action === 'to_water' ? '#7dd3fc' : '#86efac'
        );
      } else if (res.needsConfirm) {
        // Let user inspect tile for confirmation if there's a building/road in the way
        this.sceneCallbacks.onSelectTile(gx, gy);
        this.sceneCallbacks.onToolError(res.reason ?? 'Clear road or building first');
      } else {
        this.audio.play('error');
        this.sceneCallbacks.onToolError(res.reason ?? 'Cannot terraform tile');
      }
      return;
    }

    if (this.tool.mode === 'replant') {
      const res = this.engine.dispatch({ type: 'REPLANT_TILE', gx, gy });
      if (res.ok) {
        this.audio.play('unlock');
        this.vfx.spawnText(sx, sy - 10, 'Sapling', '#86efac');
      } else {
        this.audio.play('error');
        this.sceneCallbacks.onToolError(res.reason ?? 'Cannot plant here');
      }
      return;
    }

    if (this.tool.mode === 'demolish') {
      const info = this.engine.inspectTile(gx, gy);
      if (info.building) {
        const res = this.engine.dispatch({ type: 'DEMOLISH_BUILDING', buildingId: info.building.id });
        if (res.ok) {
          this.audio.play('demolish');
          this.vfx.spawnChips(sx, sy - 8, 0xf87171, 8);
          this.vfx.spawnText(sx, sy - 22, 'Demolished', '#fca5a5');
        } else {
          this.audio.play('error');
          this.sceneCallbacks.onToolError(res.reason ?? 'Cannot remove building');
        }
        return;
      }
      if (info.roadType !== RoadType.None) {
        const res = this.engine.dispatch({ type: 'REMOVE_ROAD', gx, gy });
        if (res.ok) {
          this.audio.play('demolish');
        } else {
          this.audio.play('error');
          this.sceneCallbacks.onToolError(res.reason ?? 'Cannot remove road');
        }
        return;
      }
      if (info.unlocked && info.featureType !== FeatureType.None) {
        this.engine.dispatch({ type: 'CHOP_TILE', gx, gy, isManualTap: true });
        return;
      }
      this.audio.play('error');
      this.sceneCallbacks.onToolError('Tap a road, tree, or building to remove');
      return;
    }

    if (this.tool.mode === 'place_utility') {
      const res = this.engine.dispatch({ type: 'PLACE_UTILITY', kind: this.tool.kind, gx, gy });
      if (res.ok) {
        this.audio.play('road');
        const labelMap: Record<UtilityPlacementKind, string> = {
          power_line: '+Power Line',
          substation: '+Substation',
          water_pipe: '+Water Pipe',
          water_pump: '+Water Pump',
        };
        const color =
          this.tool.kind === 'power_line' || this.tool.kind === 'substation' ? '#fde047' : '#38bdf8';
        this.vfx.spawnText(sx, sy - 12, labelMap[this.tool.kind], color);
        this.renderMapOverlay();
      } else {
        this.audio.play('error');
        this.sceneCallbacks.onToolError(res.reason ?? 'Cannot install utility here');
      }
      return;
    }

    if (this.tool.mode === 'remove_utility') {
      const res = this.engine.dispatch({ type: 'REMOVE_UTILITY', kind: this.tool.kind, gx, gy });
      if (res.ok) {
        this.audio.play('demolish');
        this.vfx.spawnText(sx, sy - 12, 'Removed', '#fca5a5');
        this.renderMapOverlay();
      } else {
        this.audio.play('error');
        this.sceneCallbacks.onToolError(res.reason ?? 'No utility on this tile');
      }
      return;
    }

    if (this.tool.mode === 'terrain_brush') {
      const res = this.engine.dispatch({
        type: 'PAINT_TERRAIN_BRUSH',
        gx,
        gy,
        brush: this.tool.brush,
        radius: this.tool.radius,
        zoneType: this.tool.zoneType,
      });
      if (res.ok) {
        this.audio.play('build');
        this.triggerHaptic(8);
        this.invalidateAllChunkTextures();
        this.forceEntitySync = true;
      } else {
        this.audio.play('error');
        this.sceneCallbacks.onToolError(res.reason ?? 'Cannot brush tile');
      }
      return;
    }

    if (this.tool.mode === 'rect_land') {
      this.sceneCallbacks.onSelectTile(gx, gy);
      return;
    }

    const info = this.engine.inspectTile(gx, gy);
    if (info.building) {
      this.audio.play('ui');
      this.sceneCallbacks.onSelectBuilding(info.building.id);
      return;
    }
    if (info.unlocked && info.featureType !== FeatureType.None) {
      this.engine.dispatch({ type: 'CHOP_TILE', gx, gy, isManualTap: true });
      return;
    }
    this.audio.play('ui');
    this.sceneCallbacks.onSelectTile(gx, gy);
  }

  private handlePaintTile(gx: number, gy: number): void {
    if (this.tool.mode === 'road') {
      const res = this.engine.dispatch({ type: 'PLACE_ROAD', roadType: this.tool.roadType, gx, gy });
      if (res.ok) {
        this.audio.play('road');
        this.triggerHaptic(6);
      }
    } else if (this.tool.mode === 'land_unlock') {
      const res = this.engine.dispatch({ type: 'UNLOCK_TILE', gx, gy });
      if (res.ok) this.triggerHaptic(6);
    } else if (this.tool.mode === 'terraform') {
      const res = this.engine.dispatch({
        type: 'TERRAFORM_TILE',
        gx,
        gy,
        action: this.tool.action,
      });
      if (res.ok) {
        this.audio.play('build');
        this.triggerHaptic(8);
        const { sx, sy } = gridToIso(gx, gy, this.getTileElev(gx, gy));
        this.vfx.spawnChips(
          sx,
          sy + 8,
          this.tool.action === 'to_water' ? 0x38bdf8 : 0x6ec45a,
          5
        );
      }
    } else if (this.tool.mode === 'terrain_brush') {
      const res = this.engine.dispatch({
        type: 'PAINT_TERRAIN_BRUSH',
        gx,
        gy,
        brush: this.tool.brush,
        radius: this.tool.radius,
        zoneType: this.tool.zoneType,
      });
      if (res.ok) {
        this.audio.play('build');
        this.triggerHaptic(6);
        this.invalidateAllChunkTextures();
        this.forceEntitySync = true;
      }
    } else if (this.tool.mode === 'demolish') {
      const info = this.engine.inspectTile(gx, gy);
      if (info.roadType !== RoadType.None) {
        const res = this.engine.dispatch({ type: 'REMOVE_ROAD', gx, gy });
        if (res.ok) this.audio.play('demolish');
      }
    } else if (this.tool.mode === 'place_utility') {
      const res = this.engine.dispatch({ type: 'PLACE_UTILITY', kind: this.tool.kind, gx, gy });
      if (res.ok) {
        this.audio.play('road');
        this.renderMapOverlay();
      }
    } else if (this.tool.mode === 'remove_utility') {
      const res = this.engine.dispatch({ type: 'REMOVE_UTILITY', kind: this.tool.kind, gx, gy });
      if (res.ok) {
        this.audio.play('demolish');
        this.renderMapOverlay();
      }
    }
  }

  private markRoadNeighborsDirty(gx: number, gy: number): void {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const { cx, cy } = gridToChunk(gx + dx, gy + dy);
        this.engine.chunks.markRenderDirty(cx, cy);
      }
    }
  }

  private updateGhostPreview(): void {
    if ((this.tool.mode !== 'build' && this.tool.mode !== 'move') || !this.ghostCoord) {
      this.hideGhost();
      return;
    }

    let defId: string;
    let level = 1;
    let rotation: 0 | 1 = 0;

    if (this.tool.mode === 'build') {
      defId = this.tool.defId;
      rotation = this.tool.rotation ?? 0;
      level = Math.max(1, this.tool.targetLevel ?? this.engine.state.unlockedBuildingLevels?.[defId] ?? 1);
    } else {
      const moveId = this.tool.buildingId;
      const b = this.engine.state.buildings.find((item) => item.id === moveId);
      if (!b) {
        this.hideGhost();
        return;
      }
      defId = b.defId;
      level = b.level;
      rotation = this.tool.rotation ?? b.rotation ?? 0;
    }

    const def = BUILDINGS[defId];
    if (!def) return;

    const fp = getBuildingFootprint(def, rotation);
    const { gx, gy } = this.ghostCoord;
    const val =
      this.tool.mode === 'build'
        ? this.engine.buildingSys.validateBuildingPlacement(
            def.id,
            gx,
            gy,
            this.engine.state,
            this.engine.chunks,
            rotation,
            this.tool.targetLevel
          )
        : this.engine.buildingSys.validateBuildingMove(
            this.tool.buildingId,
            gx,
            gy,
            this.engine.state,
            this.engine.chunks,
            rotation
          );

    for (const g of this.ghostFootprintSprites) g.setVisible(false);

    const plantationGeom = def.isAutomatedTreePlantation
      ? TreePlantationSystem.getGeometry(rotation)
      : null;
    const southX = gx + (plantationGeom ? plantationGeom.mainWidth : fp.width) - 1;
    const southY = gy + (plantationGeom ? plantationGeom.mainHeight : fp.height) - 1;
    const elev = this.getTileElev(gx, gy);
    const anchor = gridToIso(southX, southY, elev);
    const spriteRef = getBuildingSpriteRef(def.id, level, rotation);
    this.ghostBuildingSprite
      .setTexture(spriteRef.textureKey, spriteRef.frame)
      .setScale(isHalfResBuildingFrame(spriteRef.frame) ? 2 : 1)
      .setPosition(anchor.sx, anchor.sy + 32)
      .setTint(val.valid ? (this.tool.mode === 'move' ? 0xbae6fd : 0xffffff) : 0xfca5a5)
      .setVisible(true);

    this.renderPreviews(val.valid);
    this.sceneCallbacks.onGhostUpdated(gx, gy, val);
  }

  private hideGhost(): void {
    for (const g of this.ghostFootprintSprites) g.setVisible(false);
    this.ghostBuildingSprite.setVisible(false);
    this.renderPreviews();
  }

  private renderPreviews(ghostValid?: boolean): void {
    const gfx = this.previewGraphics;
    if (!gfx) return;
    gfx.clear();

    // 1. Building/Move ghost footprint of ANY size (including 20x50 Plantation Factory)
    if ((this.tool.mode === 'build' || this.tool.mode === 'move') && this.ghostCoord) {
      let defId = '';
      let rot: 0 | 1 = 0;
      if (this.tool.mode === 'build') {
        defId = this.tool.defId;
        rot = this.tool.rotation ?? 0;
      } else if (this.tool.mode === 'move') {
        const moveId = this.tool.buildingId;
        const b = this.engine.state.buildings.find((it) => it.id === moveId);
        defId = b?.defId ?? '';
        rot = this.tool.rotation ?? b?.rotation ?? 0;
      }
      const def = BUILDINGS[defId];
      if (def) {
        const fp = getBuildingFootprint(def, rot);
        const col = ghostValid === false ? 0xf87171 : 0x4ade80;
        if (def.isAutomatedTreePlantation) {
          const geom = TreePlantationSystem.getGeometry(rot);
          const elev = this.getTileElev(this.ghostCoord.gx, this.ghostCoord.gy);
          const ox = this.ghostCoord.gx;
          const oy = this.ghostCoord.gy;

          const pTop = gridToIso(ox, oy, elev);
          const pRight = gridToIso(ox + fp.width, oy, elev);
          const pBottom = gridToIso(ox + fp.width, oy + fp.height, elev);
          const pLeft = gridToIso(ox, oy + fp.height, elev);

          gfx.fillStyle(col, 0.22);
          gfx.lineStyle(2.4, col, 0.95);
          gfx.beginPath();
          gfx.moveTo(pTop.sx, pTop.sy);
          gfx.lineTo(pRight.sx, pRight.sy);
          gfx.lineTo(pBottom.sx, pBottom.sy);
          gfx.lineTo(pLeft.sx, pLeft.sy);
          gfx.closePath();
          gfx.fillPath();
          gfx.strokePath();

          // Subdivision guide lines across 20x50 plantation yard
          gfx.lineStyle(1, col, 0.35);
          for (let dx = 5; dx < fp.width; dx += 5) {
            const a = gridToIso(ox + dx, oy, elev);
            const b = gridToIso(ox + dx, oy + fp.height, elev);
            gfx.lineBetween(a.sx, a.sy, b.sx, b.sy);
          }
          for (let dy = 5; dy < fp.height; dy += 5) {
            const a = gridToIso(ox, oy + dy, elev);
            const b = gridToIso(ox + fp.width, oy + dy, elev);
            gfx.lineBetween(a.sx, a.sy, b.sx, b.sy);
          }

          // Highlight 10x20 (or 20x10) Main Factory Building pad within the 20x50 footprint
          const mCol = ghostValid === false ? 0xf87171 : 0xfbbf24;
          const mTop = gridToIso(ox, oy, elev);
          const mRight = gridToIso(ox + geom.mainWidth, oy, elev);
          const mBottom = gridToIso(ox + geom.mainWidth, oy + geom.mainHeight, elev);
          const mLeft = gridToIso(ox, oy + geom.mainHeight, elev);
          gfx.fillStyle(mCol, 0.32);
          gfx.lineStyle(2.2, mCol, 0.98);
          gfx.beginPath();
          gfx.moveTo(mTop.sx, mTop.sy);
          gfx.lineTo(mRight.sx, mRight.sy);
          gfx.lineTo(mBottom.sx, mBottom.sy);
          gfx.lineTo(mLeft.sx, mLeft.sy);
          gfx.closePath();
          gfx.fillPath();
          gfx.strokePath();
        } else {
          gfx.fillStyle(col, 0.28);
          gfx.lineStyle(1.4, col, 0.9);
          for (let dx = 0; dx < fp.width; dx++) {
            for (let dy = 0; dy < fp.height; dy++) {
              const tx = this.ghostCoord.gx + dx;
              const ty = this.ghostCoord.gy + dy;
              const elev = this.getTileElev(tx, ty);
              const { sx, sy } = gridToIso(tx, ty, elev);
              gfx.beginPath();
              gfx.moveTo(sx, sy + 1);
              gfx.lineTo(sx + 31, sy + 16);
              gfx.lineTo(sx, sy + 31);
              gfx.lineTo(sx - 31, sy + 16);
              gfx.closePath();
              gfx.fillPath();
              gfx.strokePath();
            }
          }
        }
      }
    }

    // 2. Rectangular land purchase preview
    if (this.rectPreview) {
      const { startGx, startGy, width, height } = this.rectPreview;
      gfx.fillStyle(0xfbbf24, 0.24);
      gfx.lineStyle(1.6, 0xfde047, 0.95);
      for (let dy = 0; dy < Math.min(48, height); dy++) {
        for (let dx = 0; dx < Math.min(48, width); dx++) {
          const tx = startGx + dx;
          const ty = startGy + dy;
          const elev = this.getTileElev(tx, ty);
          const { sx, sy } = gridToIso(tx, ty, elev);
          gfx.beginPath();
          gfx.moveTo(sx, sy + 1);
          gfx.lineTo(sx + 31, sy + 16);
          gfx.lineTo(sx, sy + 31);
          gfx.lineTo(sx - 31, sy + 16);
          gfx.closePath();
          gfx.fillPath();
          if (dx === 0 || dy === 0 || dx === width - 1 || dy === height - 1) {
            gfx.strokePath();
          }
        }
      }
    }

    // 3. Road Grid Builder preview
    if (this.roadGridPreview && this.roadGridPreview.length > 0) {
      gfx.fillStyle(0x38bdf8, 0.34);
      gfx.lineStyle(1.5, 0xbae6fd, 0.92);
      for (const pt of this.roadGridPreview) {
        const elev = this.getTileElev(pt.gx, pt.gy);
        const { sx, sy } = gridToIso(pt.gx, pt.gy, elev);
        gfx.beginPath();
        gfx.moveTo(sx, sy + 2);
        gfx.lineTo(sx + 30, sy + 16);
        gfx.lineTo(sx, sy + 30);
        gfx.lineTo(sx - 30, sy + 16);
        gfx.closePath();
        gfx.fillPath();
        gfx.strokePath();
      }
    }

    // 4. Connected Road Network Upgrade preview
    if (this.roadUpgradePreview && this.roadUpgradePreview.length > 0) {
      gfx.fillStyle(0xf59e0b, 0.36);
      gfx.lineStyle(1.8, 0xfef08a, 0.96);
      for (const pt of this.roadUpgradePreview) {
        const elev = this.getTileElev(pt.gx, pt.gy);
        const { sx, sy } = gridToIso(pt.gx, pt.gy, elev);
        gfx.beginPath();
        gfx.moveTo(sx, sy + 2);
        gfx.lineTo(sx + 30, sy + 16);
        gfx.lineTo(sx, sy + 30);
        gfx.lineTo(sx - 30, sy + 16);
        gfx.closePath();
        gfx.fillPath();
        gfx.strokePath();
      }
    }
  }

  private getTileElev(gx: number, gy: number): number {
    const fast = this.engine.chunks.getLoadedChunkForGrid(gx, gy);
    if (fast) return fast.elevation[localTileIndex(gx, gy)];
    const { chunk, index } = this.engine.chunks.getTile(gx, gy);
    return chunk.elevation[index];
  }

  public update(_time: number, delta: number): void {
    this.frameCounter += 1;
    this.perf.recordFrameDelta(delta);

    const settings = this.engine.state.settings;
    const wantLowPower = settings.graphicsMode === 'low_power';
    if (wantLowPower !== this.lowPowerMode) {
      this.lowPowerMode = wantLowPower;
      this.perf.setLowPowerActive(wantLowPower);
      this.game.loop.targetFps = wantLowPower ? 30 : 60;
    }

    const simStart = performance.now();
    const didTick = this.engine.advanceFrame(delta);
    if (didTick) {
      this.perf.recordSimDuration(
        performance.now() - simStart,
        this.engine.chunks.getLoadedChunkCount()
      );
    }

    const dtSec = Math.min(0.1, delta / 1000);
    if (this.engine.state.speed > 0) {
      this.animClockSec += dtSec * Math.max(1, this.engine.state.speed * 0.65);
    }

    this.cameraCtrl.update(dtSec);
    this.vfx.update(dtSec);

    // Sync audio volumes & continuous city/nature soundscape
    const timeMode = settings.timeMode ?? 'normal';
    const visualHour =
      timeMode === 'always_day'
        ? 12.0
        : timeMode === 'always_night'
          ? 22.0
          : this.engine.state.timeOfDayHours;
    this.audio.setVolumes(settings.masterVolume, settings.sfxVolume, settings.ambientVolume ?? 0.65);
    this.audio.updateAmbient(dtSec, {
      population: this.engine.state.population.total,
      activeBuildings: this.engine.state.buildings.filter((b) => b.status === 'active').length,
      timeOfDayHours: visualHour,
      weather: this.engine.state.weather,
      speed: this.engine.state.speed,
      hasWaterVisible: this.hasWaterVisible,
      festivalActive: (this.engine.state.festivalTicksRemaining ?? 0) > 0,
    });

    const curInLandMode = this.isInLandMode();
    if (curInLandMode !== this.lastInLandMode) {
      this.lastInLandMode = curInLandMode;
      this.invalidateAllChunkTextures();
      this.forceEntitySync = true;
    }

    this.syncVisibleChunks();

    this.entityRefreshTimer += delta;
    if (this.forceEntitySync || this.entityRefreshTimer >= 160) {
      this.forceEntitySync = false;
      this.entityRefreshTimer = 0;
      this.syncDynamicEntities();
      if ((this.tool.mode === 'build' || this.tool.mode === 'move') && this.ghostCoord) {
        this.updateGhostPreview();
      }
    }

    // 60fps smooth animations: citizens, vehicles, trains, water waves, chimney smoke, day/night lights
    this.syncCitizens();
    this.syncVehiclesAndTrains();
    this.updateWaterAndSmoke();
    this.updateDayNightLightingAndWeather(dtSec);
  }

  private getCameraWorldFrustum(): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } {
    const cam = this.cameras.main;
    const tl = cam.getWorldPoint(0, 0);
    const tr = cam.getWorldPoint(cam.width, 0);
    const bl = cam.getWorldPoint(0, cam.height);
    const br = cam.getWorldPoint(cam.width, cam.height);
    return {
      minX: Math.min(tl.x, tr.x, bl.x, br.x),
      maxX: Math.max(tl.x, tr.x, bl.x, br.x),
      minY: Math.min(tl.y, tr.y, bl.y, br.y),
      maxY: Math.max(tl.y, tr.y, bl.y, br.y),
    };
  }

  private getVisibleGridBounds(): {
    minGx: number;
    maxGx: number;
    minGy: number;
    maxGy: number;
  } {
    const cam = this.cameras.main;
    const corners = [
      cam.getWorldPoint(0, 0),
      cam.getWorldPoint(cam.width, 0),
      cam.getWorldPoint(0, cam.height),
      cam.getWorldPoint(cam.width, cam.height),
    ];

    let minGx = Infinity;
    let maxGx = -Infinity;
    let minGy = Infinity;
    let maxGy = -Infinity;

    for (const pt of corners) {
      const g = isoToGridApprox(pt.x, pt.y + 32);
      if (g.gx < minGx) minGx = g.gx;
      if (g.gx > maxGx) maxGx = g.gx;
      if (g.gy < minGy) minGy = g.gy;
      if (g.gy > maxGy) maxGy = g.gy;
    }

    return {
      minGx: Math.floor(minGx) - 4,
      maxGx: Math.ceil(maxGx) + 4,
      minGy: Math.floor(minGy) - 4,
      maxGy: Math.ceil(maxGy) + 5,
    };
  }

  private syncVisibleChunks(): void {
    const bounds = this.getVisibleGridBounds();
    const cMin = gridToChunk(bounds.minGx, bounds.minGy);
    const cMax = gridToChunk(bounds.maxGx, bounds.maxGy);

    const minCx = Math.min(cMin.cx, cMax.cx) - 1;
    const maxCx = Math.max(cMin.cx, cMax.cx) + 1;
    const minCy = Math.min(cMin.cy, cMax.cy) - 1;
    const maxCy = Math.max(cMin.cy, cMax.cy) + 1;

    if (
      this.engine.chunks.peekDirtyRenderCount() === 0 &&
      this.lastVisibleChunkBounds !== null &&
      this.lastVisibleChunkBounds.minCx === minCx &&
      this.lastVisibleChunkBounds.maxCx === maxCx &&
      this.lastVisibleChunkBounds.minCy === minCy &&
      this.lastVisibleChunkBounds.maxCy === maxCy
    ) {
      return;
    }
    this.lastVisibleChunkBounds = { minCx, maxCx, minCy, maxCy };

    const dirtyKeys = new Set(this.engine.chunks.consumeDirtyRenderKeys());
    const visibleKeys = new Set<string>();

    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = chunkKey(cx, cy);
        visibleKeys.add(key);
        const chunk = this.engine.chunks.getOrCreateChunk(cx, cy);
        let slot = this.chunkTextures.get(key);
        if (!slot) {
          slot = this.acquireChunkRenderSlot(cx, cy, chunk);
          dirtyKeys.add(key);
        }
        slot.lastUsedFrame = this.frameCounter;
        slot.rt.setVisible(true);
        if (dirtyKeys.has(key)) {
          this.bakeChunkTexture(chunk, slot);
        }
      }
    }

    for (const [key, slot] of this.chunkTextures.entries()) {
      if (!visibleKeys.has(key)) {
        slot.rt.setVisible(false);
      }
    }
  }

  private acquireChunkRenderSlot(cx: number, cy: number, _chunk: ChunkData): ChunkRenderSlot {
    const key = chunkKey(cx, cy);
    const origin = chunkToGrid(cx, cy, 0, 0);
    const isoOrigin = gridToIso(origin.gx, origin.gy, 0);

    if (this.chunkTextures.size >= MAX_RENDER_TEXTURES) {
      let oldestKey: string | null = null;
      let oldestFrame = Infinity;
      for (const [k, s] of this.chunkTextures.entries()) {
        if (!s.rt.visible && s.lastUsedFrame < oldestFrame) {
          oldestFrame = s.lastUsedFrame;
          oldestKey = k;
        }
      }
      if (oldestKey) {
        const recycled = this.chunkTextures.get(oldestKey)!;
        this.chunkTextures.delete(oldestKey);
        recycled.key = key;
        recycled.cx = cx;
        recycled.cy = cy;
        recycled.originSx = isoOrigin.sx;
        recycled.originSy = isoOrigin.sy;
        recycled.rt.setPosition(isoOrigin.sx - CHUNK_OFFSET_X, isoOrigin.sy - CHUNK_OFFSET_Y);
        recycled.rt.setDepth((cx + cy) * 10 - 50000);
        this.chunkTextures.set(key, recycled);
        return recycled;
      }
    }

    const rt = this.add.renderTexture(
      isoOrigin.sx - CHUNK_OFFSET_X,
      isoOrigin.sy - CHUNK_OFFSET_Y,
      CHUNK_TEX_W,
      CHUNK_TEX_H
    );
    rt.setOrigin(0, 0);
    rt.setDepth((cx + cy) * 10 - 50000);

    const slot: ChunkRenderSlot = {
      key,
      cx,
      cy,
      rt,
      originSx: isoOrigin.sx,
      originSy: isoOrigin.sy,
      lastUsedFrame: this.frameCounter,
    };
    this.chunkTextures.set(key, slot);
    return slot;
  }

  private bakeChunkTexture(chunk: ChunkData, slot: ChunkRenderSlot): void {
    const rt = slot.rt;
    rt.clear();

    const showFrontier = this.isInLandMode();

    for (let ly = 0; ly < CHUNK_SIZE; ly++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const idx = ly * CHUNK_SIZE + lx;
        const { gx, gy } = chunkToGrid(chunk.cx, chunk.cy, lx, ly);
        const elev = chunk.elevation[idx];
        const biome = chunk.biomeId[idx];
        const { sx, sy } = gridToIso(gx, gy, elev);

        const localX = sx - slot.originSx + CHUNK_OFFSET_X;
        const localY = sy - slot.originSy + CHUNK_OFFSET_Y;

        rt.stamp(ATLAS_KEY, `biome_${biome}`, localX, localY, { originX: 0.5, originY: 0 });

        const unlocked = (chunk.flags[idx] & TileFlag.Unlocked) !== 0;
        if (unlocked) {
          rt.stamp(ATLAS_KEY, 'tile_owned', localX, localY, { originX: 0.5, originY: 0 });
          if (!this.engine.chunks.isUnlocked(gx, gy - 1)) {
            rt.stamp(ATLAS_KEY, 'border_ne', localX, localY, { originX: 0.5, originY: 0 });
          }
          if (!this.engine.chunks.isUnlocked(gx - 1, gy)) {
            rt.stamp(ATLAS_KEY, 'border_nw', localX, localY, { originX: 0.5, originY: 0 });
          }
          if (!this.engine.chunks.isUnlocked(gx + 1, gy)) {
            rt.stamp(ATLAS_KEY, 'border_se', localX, localY, { originX: 0.5, originY: 0 });
          }
          if (!this.engine.chunks.isUnlocked(gx, gy + 1)) {
            rt.stamp(ATLAS_KEY, 'border_sw', localX, localY, { originX: 0.5, originY: 0 });
          }
        } else {
          if (showFrontier && this.engine.chunks.isAdjacentToUnlocked(gx, gy)) {
            rt.stamp(ATLAS_KEY, 'tile_frontier', localX, localY, { originX: 0.5, originY: 0 });
          } else {
            rt.stamp(ATLAS_KEY, 'tile_locked', localX, localY, { originX: 0.5, originY: 0 });
            if (this.engine.chunks.isAdjacentToUnlocked(gx, gy)) {
              rt.stamp(ATLAS_KEY, 'tile_frontier_subtle', localX, localY, { originX: 0.5, originY: 0 });
            }
          }
        }

        const road = chunk.roadType[idx] as RoadType;
        if (road !== RoadType.None) {
          const mask = this.engine.roadNet.getRoadBitmask(gx, gy, this.engine.chunks);
          rt.stamp(ATLAS_KEY, `road_${road}_${mask}`, localX, localY, { originX: 0.5, originY: 0 });
          const dir = (chunk.roadDir?.[idx] ?? 0) as RoadDirection;
          if (dir >= RoadDirection.OneWayN && dir <= RoadDirection.OneWayW) {
            rt.stamp(ATLAS_KEY, `road_dir_${dir}`, localX, localY + 17, { originX: 0.5, originY: 0.5 });
          }
        }
      }
    }

    rt.render();
  }

  private syncDynamicEntities(): void {
    const inLandMode = this.isInLandMode();
    const bounds = this.getVisibleGridBounds();
    const frustum = this.getCameraWorldFrustum();
    const fMinX = frustum.minX - 96;
    const fMaxX = frustum.maxX + 96;
    const fMinY = frustum.minY - 120;
    const fMaxY = frustum.maxY + 140;

    let featIdx = 0;
    let depIdx = 0;
    let labelIdx = 0;
    this.waterTileCenters.length = 0;
    this.roadLightTiles.length = 0;

    for (let gy = bounds.minGy; gy <= bounds.maxGy; gy++) {
      for (let gx = bounds.minGx; gx <= bounds.maxGx; gx++) {
        const chunk = this.engine.chunks.getLoadedChunkForGrid(gx, gy) ?? this.engine.chunks.getTile(gx, gy).chunk;
        const index = localTileIndex(gx, gy);
        const elev = chunk.elevation[index];
        const { sx, sy } = gridToIso(gx, gy, elev);

        if (sx < fMinX || sx > fMaxX || sy < fMinY || sy > fMaxY) continue;

        const unlocked = (chunk.flags[index] & TileFlag.Unlocked) !== 0;
        const explored = (chunk.flags[index] & TileFlag.Explored) !== 0;
        const biome = chunk.biomeId[index] as BiomeId;
        const depthBase = (gx + gy) * 100 + elev * 2;

        if (!inLandMode && (biome === BiomeId.River || biome === BiomeId.DeepWater)) {
          this.waterTileCenters.push({ sx, sy: sy + 16, gx, gy });
        }

        const road = chunk.roadType[index] as RoadType;
        if (!inLandMode && road !== RoadType.None && (road >= RoadType.Stone || ((gx + gy) & 1) === 0)) {
          this.roadLightTiles.push({ sx, sy: sy + 8, gx, gy });
        }

        if (inLandMode) {
          if (!unlocked && labelIdx < this.landPriceLabels.length) {
            const isAdj = this.engine.chunks.isAdjacentToUnlocked(gx, gy);
            if (isAdj || ((gx & 1) === 0 && (gy & 1) === 0)) {
              const cost = this.engine.chunks.computeUnlockCost(gx, gy);
              const lbl = this.landPriceLabels[labelIdx++];
              lbl
                .setText(`${cost}C`)
                .setColor(isAdj ? '#fde047' : '#cbd5e1')
                .setPosition(sx, sy + 16)
                .setAlpha(isAdj ? 1 : 0.72)
                .setVisible(true);
            }
          }
          continue;
        }

        const dep = chunk.depositType[index] as DepositType;
        if (
          (unlocked || explored) &&
          dep !== DepositType.None &&
          chunk.buildingRef[index] === -1 &&
          depIdx < this.depositSprites.length
        ) {
          const ds = this.depositSprites[depIdx++];
          ds.setFrame(`dep_${dep}`)
            .setPosition(sx, sy + 16)
            .setDepth(depthBase + 1)
            .setAlpha(unlocked ? 1 : 0.78)
            .setVisible(true);
        }

        const ft = chunk.featureType[index] as FeatureType;
        if (ft !== FeatureType.None && featIdx < this.featureSprites.length) {
          const fs = this.featureSprites[featIdx];
          this.featureCoords[featIdx] = { gx, gy };
          featIdx++;
          fs.setFrame(`feat_${ft}`)
            .setPosition(sx, sy + 24)
            .setDepth(depthBase + 15)
            .setTint(unlocked ? 0xffffff : 0x94a3b8)
            .setAlpha(unlocked ? 1 : 0.86)
            .setVisible(true);
        }
      }
    }

    this.activeFeatureCount = featIdx;
    this.hasWaterVisible = !inLandMode && this.waterTileCenters.length > 0;

    for (let i = featIdx; i < this.featureSprites.length; i++) {
      this.featureSprites[i].setVisible(false);
    }
    for (let i = depIdx; i < this.depositSprites.length; i++) {
      this.depositSprites[i].setVisible(false);
    }
    for (let i = labelIdx; i < this.landPriceLabels.length; i++) {
      this.landPriceLabels[i].setVisible(false);
    }

    // Sync Buildings (Hidden in True Land Mode)
    const activeIds = new Set<number>();
    for (const b of this.engine.state.buildings) {
      const def = BUILDINGS[b.defId];
      if (!def) continue;
      activeIds.add(b.id);
      const rot: 0 | 1 = b.rotation === 1 ? 1 : 0;
      const fp = getBuildingFootprint(def, rot);

      const inBounds =
        !inLandMode &&
        b.gx + fp.width >= bounds.minGx &&
        b.gx <= bounds.maxGx &&
        b.gy + fp.height >= bounds.minGy &&
        b.gy <= bounds.maxGy;

      let sprite = this.buildingSprites.get(b.id);
      const ref = getBuildingSpriteRef(def.id, b.level, rot);
      if (!sprite) {
        sprite = this.add.image(0, 0, ref.textureKey, ref.frame).setOrigin(0.5, 1);
        this.buildingSprites.set(b.id, sprite);
      }

      if (!inBounds) {
        sprite.setVisible(false);
        this.statusMarkers.get(b.id)?.setVisible(false);
        this.activityBadges.get(b.id)?.setVisible(false);
        continue;
      }

      const elev = this.getTileElev(b.gx, b.gy);
      const plantationGeom = def.isAutomatedTreePlantation
        ? TreePlantationSystem.getGeometry(rot)
        : null;
      const southX = b.gx + (plantationGeom ? plantationGeom.mainWidth : fp.width) - 1;
      const southY = b.gy + (plantationGeom ? plantationGeom.mainHeight : fp.height) - 1;
      const anchor = gridToIso(southX, southY, elev);

      const isBeingMoved = this.tool.mode === 'move' && this.tool.buildingId === b.id;
      if (b.status === 'constructing') {
        sprite.setTexture(ATLAS_KEY, 'bldg_constructing').setScale(1);
      } else {
        sprite.setTexture(ref.textureKey, ref.frame).setScale(isHalfResBuildingFrame(ref.frame) ? 2 : 1);
      }
      sprite
        .setPosition(anchor.sx, anchor.sy + 32)
        .setDepth((southX + southY) * 100 + elev * 2 + 25)
        .setTint(isBeingMoved ? 0x93c5fd : 0xffffff)
        .setAlpha(isBeingMoved ? 0.42 : b.enabled ? 1 : 0.6)
        .setVisible(true);

      let marker = this.statusMarkers.get(b.id);
      const showMarker =
        b.status === 'constructing' ||
        b.status === 'no_workers' ||
        b.status === 'no_road' ||
        b.status === 'no_inputs' ||
        b.status === 'no_power' ||
        b.status === 'no_water' ||
        b.status === 'storage_full' ||
        b.status === 'deposit_depleted';

      if (showMarker) {
        if (!marker) {
          marker = this.add
            .text(0, 0, '', {
              fontSize: '10px',
              fontStyle: 'bold',
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              color: '#fde047',
              padding: { x: 4, y: 2 },
            })
            .setOrigin(0.5, 1);
          this.statusMarkers.set(b.id, marker);
        }
        const label =
          b.status === 'constructing'
            ? `${Math.round(b.buildProgress * 100)}%`
            : b.status === 'no_workers'
              ? 'NO WORKERS'
              : b.status === 'no_road'
                ? 'NO ROAD'
                : b.status === 'no_power'
                  ? 'NO POWER'
                  : b.status === 'no_water'
                    ? 'NO WATER'
                    : b.status === 'storage_full'
                      ? 'STORAGE FULL'
                      : b.status === 'deposit_depleted'
                        ? 'DEPLETED'
                        : 'NO INPUT';
        marker
          .setText(label)
          .setPosition(anchor.sx, anchor.sy - 20)
          .setDepth(sprite.depth + 2)
          .setVisible(true);
      } else if (marker) {
        marker.setVisible(false);
      }

      const isEnclosedActive =
        b.status === 'active' &&
        b.entranceValid === false &&
        (b.assignedWorkers > 0 || def.category === 'residential');
      let badge = this.activityBadges.get(b.id);
      if (isEnclosedActive) {
        if (!badge) {
          badge = this.add
            .text(0, 0, getIndoorActivityEmoji(def.category, def.id), {
              fontSize: '12px',
              backgroundColor: 'rgba(6, 18, 12, 0.72)',
              padding: { x: 3, y: 1 },
            })
            .setOrigin(0.5, 1);
          this.activityBadges.set(b.id, badge);
        } else {
          badge.setText(getIndoorActivityEmoji(def.category, def.id));
        }
        badge
          .setPosition(anchor.sx, anchor.sy - (def.isLargeFactory ? 36 : 22))
          .setDepth(sprite.depth + 3)
          .setVisible(true);
      } else if (badge) {
        badge.setVisible(false);
      }
    }

    // Sync Automated Tree Plantation Factory live trees inside owned 20x50 plantation yards
    let ptIdx = 0;
    if (!inLandMode) {
      for (const b of this.engine.state.buildings) {
        if (b.status === 'constructing') continue;
        const def = BUILDINGS[b.defId];
        if (!def?.isAutomatedTreePlantation) continue;
        const ps = this.engine.state.treePlantations?.[b.id];
        if (!ps?.stages) continue;

        const rot: 0 | 1 = b.rotation === 1 ? 1 : 0;
        const fp = getBuildingFootprint(def, rot);
        if (
          b.gx + fp.width < bounds.minGx ||
          b.gx > bounds.maxGx ||
          b.gy + fp.height < bounds.minGy ||
          b.gy > bounds.maxGy
        ) {
          continue;
        }

        const offsets = TreePlantationSystem.getSlotOffsets(rot);
        for (let i = 0; i < offsets.length && ptIdx < this.plantationTreeSprites.length; i++) {
          const stage = ps.stages[i];
          if (!stage || stage <= 0) continue;
          const off = offsets[i];
          const tx = b.gx + off.dx;
          const ty = b.gy + off.dy;
          if (tx < bounds.minGx || tx > bounds.maxGx || ty < bounds.minGy || ty > bounds.maxGy) continue;

          const tElev = this.getTileElev(tx, ty);
          const iso = gridToIso(tx, ty, tElev);
          if (iso.sx < fMinX || iso.sx > fMaxX || iso.sy < fMinY || iso.sy > fMaxY) continue;

          let frame: string;
          if (stage === 1) {
            frame = `feat_${FeatureType.Sapling}`;
          } else if (stage === 2) {
            frame = `feat_${FeatureType.MediumTree}`;
          } else {
            const v = (b.id + i) % 3;
            frame =
              v === 0
                ? `feat_${FeatureType.PineTree}`
                : v === 1
                  ? `feat_${FeatureType.OakTree}`
                  : `feat_${FeatureType.JungleHardwood}`;
          }

          const pt = this.plantationTreeSprites[ptIdx];
          this.plantationTreeCoords[ptIdx] = { gx: tx, gy: ty };
          ptIdx++;
          pt.setFrame(frame)
            .setPosition(iso.sx, iso.sy + 24)
            .setDepth((tx + ty) * 100 + tElev * 2 + 15)
            .setAlpha(b.enabled ? 1 : 0.78)
            .setVisible(true);
        }
      }
    }
    this.activePlantationTreeCount = ptIdx;
    for (let i = ptIdx; i < this.plantationTreeSprites.length; i++) {
      this.plantationTreeSprites[i].setVisible(false);
    }

    for (const [id, sprite] of this.buildingSprites.entries()) {
      if (!activeIds.has(id)) {
        sprite.destroy();
        this.buildingSprites.delete(id);
        this.statusMarkers.get(id)?.destroy();
        this.statusMarkers.delete(id);
        this.activityBadges.get(id)?.destroy();
        this.activityBadges.delete(id);
      }
    }

    this.renderMapOverlay();
  }

  private renderMapOverlay(): void {
    const gfx = this.overlayGraphics;
    if (!gfx) return;
    gfx.clear();

    const inLandMode = this.isInLandMode();
    const showZoneLayer =
      this.overlayMode === 'zones' ||
      Boolean(this.engine.state.showZoneBorders) ||
      inLandMode ||
      (this.tool.mode === 'terrain_brush' && this.tool.brush === 'zone');

    const bounds = this.getVisibleGridBounds();

    // Draw clear compound & 10x20 main-hall borders for placed Automated Tree Plantation Factories
    if (!inLandMode) {
      for (const b of this.engine.state.buildings) {
        const def = BUILDINGS[b.defId];
        if (!def?.isAutomatedTreePlantation) continue;
        const rot: 0 | 1 = b.rotation === 1 ? 1 : 0;
        const fp = getBuildingFootprint(def, rot);
        if (
          b.gx + fp.width < bounds.minGx ||
          b.gx > bounds.maxGx ||
          b.gy + fp.height < bounds.minGy ||
          b.gy > bounds.maxGy
        ) {
          continue;
        }
        const geom = TreePlantationSystem.getGeometry(rot);
        const elev = this.getTileElev(b.gx, b.gy);
        const pTop = gridToIso(b.gx, b.gy, elev);
        const pRight = gridToIso(b.gx + fp.width, b.gy, elev);
        const pBottom = gridToIso(b.gx + fp.width, b.gy + fp.height, elev);
        const pLeft = gridToIso(b.gx, b.gy + fp.height, elev);

        gfx.fillStyle(0x16a34a, 0.08);
        gfx.lineStyle(2, 0x22c55e, 0.72);
        gfx.beginPath();
        gfx.moveTo(pTop.sx, pTop.sy);
        gfx.lineTo(pRight.sx, pRight.sy);
        gfx.lineTo(pBottom.sx, pBottom.sy);
        gfx.lineTo(pLeft.sx, pLeft.sy);
        gfx.closePath();
        gfx.fillPath();
        gfx.strokePath();

        // Main 10x20 (or 20x10) factory hall concrete pad outline
        const mRight = gridToIso(b.gx + geom.mainWidth, b.gy, elev);
        const mBottom = gridToIso(b.gx + geom.mainWidth, b.gy + geom.mainHeight, elev);
        const mLeft = gridToIso(b.gx, b.gy + geom.mainHeight, elev);
        gfx.fillStyle(0x64748b, 0.14);
        gfx.lineStyle(1.6, 0x94a3b8, 0.65);
        gfx.beginPath();
        gfx.moveTo(pTop.sx, pTop.sy);
        gfx.lineTo(mRight.sx, mRight.sy);
        gfx.lineTo(mBottom.sx, mBottom.sy);
        gfx.lineTo(mLeft.sx, mLeft.sy);
        gfx.closePath();
        gfx.fillPath();
        gfx.strokePath();
      }
    }

    if (this.overlayMode === 'none' && !showZoneLayer) return;
    const DEP_COLORS: Record<number, number> = {
      [DepositType.Stone]: 0x94a3b8,
      [DepositType.Clay]: 0xd97706,
      [DepositType.Sand]: 0xfde68a,
      [DepositType.IronOre]: 0x60a5fa,
      [DepositType.CopperOre]: 0xfb923c,
      [DepositType.Coal]: 0xcbd5e1,
      [DepositType.Silver]: 0xe2e8f0,
      [DepositType.Gold]: 0xfacc15,
    };

    if (this.overlayMode === 'power' || this.overlayMode === 'water') {
      const isPower = this.overlayMode === 'power';
      const lineFlag = isPower ? UtilityFlag.PowerLine : UtilityFlag.WaterPipe;
      const hubFlag = isPower ? UtilityFlag.PowerSubstation : UtilityFlag.WaterPump;
      const activeColor = isPower ? 0xfacc15 : 0x38bdf8;
      const hubColor = isPower ? 0xfef08a : 0xbae6fd;
      const netSnap = UtilityNetworkSystem.getLastSnapshot();
      const tileNetMap = netSnap ? (isPower ? netSnap.powerTileNet : netSnap.waterTileNet) : null;
      const overloadedNets = netSnap ? (isPower ? netSnap.powerOverloadedNets : netSnap.waterOverloadedNets) : null;

      const getLineTint = (gx: number, gy: number): number => {
        if (!tileNetMap) return activeColor;
        const netId = tileNetMap.get(tileKey(gx, gy));
        if (!netId) return 0xef4444; // Disconnected wire/pipe segment (no source attached)
        if (overloadedNets?.has(netId)) return 0xf97316; // Overloaded distribution section
        return activeColor;
      };

      for (let gy = bounds.minGy; gy <= bounds.maxGy; gy++) {
        for (let gx = bounds.minGx; gx <= bounds.maxGx; gx++) {
          const chunk = this.engine.chunks.getLoadedChunkForGrid(gx, gy);
          if (!chunk) continue;
          const index = localTileIndex(gx, gy);
          const u = chunk.utilityNet[index];
          if ((u & (lineFlag | hubFlag)) === 0) continue;

          const elev = chunk.elevation[index];
          const { sx, sy } = gridToIso(gx, gy, elev);
          const cx = sx;
          const cy = sy + 16;
          const tint = getLineTint(gx, gy);

          gfx.lineStyle(2.4, tint, 0.92);
          const rightC = this.engine.chunks.getLoadedChunkForGrid(gx + 1, gy);
          if (rightC) {
            const rIdx = localTileIndex(gx + 1, gy);
            if ((rightC.utilityNet[rIdx] & (lineFlag | hubFlag)) !== 0) {
              const nbIso = gridToIso(gx + 1, gy, rightC.elevation[rIdx]);
              gfx.lineBetween(cx, cy, nbIso.sx, nbIso.sy + 16);
            }
          }
          const downC = this.engine.chunks.getLoadedChunkForGrid(gx, gy + 1);
          if (downC) {
            const dIdx = localTileIndex(gx, gy + 1);
            if ((downC.utilityNet[dIdx] & (lineFlag | hubFlag)) !== 0) {
              const nbIso = gridToIso(gx, gy + 1, downC.elevation[dIdx]);
              gfx.lineBetween(cx, cy, nbIso.sx, nbIso.sy + 16);
            }
          }

          if ((u & hubFlag) !== 0) {
            gfx.fillStyle(tint === activeColor ? hubColor : tint, 0.96);
            gfx.fillCircle(cx, cy, 4.8);
            gfx.lineStyle(1.6, tint, 0.9);
            gfx.strokeCircle(cx, cy, 8);
          } else {
            gfx.fillStyle(tint, 0.92);
            gfx.fillCircle(cx, cy, 2.9);
          }
        }
      }

      for (const b of this.engine.state.buildings) {
        const def = BUILDINGS[b.defId];
        if (!def) continue;
        const fp = getBuildingFootprint(def, b.rotation ?? 0);
        if (
          b.gx + fp.width < bounds.minGx ||
          b.gx > bounds.maxGx ||
          b.gy + fp.height < bounds.minGy ||
          b.gy > bounds.maxGy
        ) {
          continue;
        }
        const relevant = isPower
          ? (def.powerDemand ?? 0) > 0 || (def.powerOutput ?? 0) > 0
          : (def.waterDemand ?? 0) > 0 || (def.waterOutput ?? 0) > 0;
        if (!relevant) continue;

        const connected = isPower ? b.powerConnected : b.waterConnected;
        const sat = (isPower ? b.powerSatisfaction : b.waterSatisfaction) ?? (connected ? 1 : 0);
        const outlineColor = !connected ? 0xef4444 : sat < 0.99 ? 0xf59e0b : 0x22c55e;

        const elev = this.getTileElev(b.gx, b.gy);
        const top = gridToIso(b.gx, b.gy, elev);
        const right = gridToIso(b.gx + fp.width, b.gy, elev);
        const bottom = gridToIso(b.gx + fp.width, b.gy + fp.height, elev);
        const left = gridToIso(b.gx, b.gy + fp.height, elev);

        gfx.fillStyle(outlineColor, 0.18);
        gfx.lineStyle(2, outlineColor, 0.92);
        gfx.beginPath();
        gfx.moveTo(top.sx, top.sy);
        gfx.lineTo(right.sx, right.sy);
        gfx.lineTo(bottom.sx, bottom.sy);
        gfx.lineTo(left.sx, left.sy);
        gfx.closePath();
        gfx.fillPath();
        gfx.strokePath();
      }
      return;
    }

    if (showZoneLayer || this.overlayMode === 'deposits') {
      for (let gy = bounds.minGy; gy <= bounds.maxGy; gy++) {
        for (let gx = bounds.minGx; gx <= bounds.maxGx; gx++) {
          const chunk = this.engine.chunks.getLoadedChunkForGrid(gx, gy);
          if (!chunk) continue;
          const index = localTileIndex(gx, gy);
          const elev = chunk.elevation[index];
          const { sx, sy } = gridToIso(gx, gy, elev);
          const unlocked = (chunk.flags[index] & TileFlag.Unlocked) !== 0;

          if (this.overlayMode === 'deposits') {
            const dep = chunk.depositType[index] as DepositType;
            const explored = (chunk.flags[index] & TileFlag.Explored) !== 0;
            if ((unlocked || explored) && dep !== DepositType.None && chunk.depositQty[index] > 0) {
              const color = DEP_COLORS[dep] ?? 0xfacc15;
              gfx.fillStyle(color, 0.22);
              gfx.lineStyle(2, color, 0.95);
              gfx.beginPath();
              gfx.moveTo(sx, sy + 2);
              gfx.lineTo(sx + 28, sy + 16);
              gfx.lineTo(sx, sy + 30);
              gfx.lineTo(sx - 28, sy + 16);
              gfx.closePath();
              gfx.fillPath();
              gfx.strokePath();
            }
          }

          if (showZoneLayer && unlocked) {
            const z = chunk.zoneType[index];
            const zType = ZONE_ID_TO_TYPE[z] ?? 'none';
            if (zType !== 'none') {
              const color = ZONE_META[zType]?.colorNum ?? 0x64748b;
              const fillAlpha = this.overlayMode === 'zones' ? 0.26 : 0.09;
              const strokeAlpha = this.engine.state.showZoneBorders || this.overlayMode === 'zones' ? 0.85 : 0.45;
              gfx.fillStyle(color, fillAlpha);
              gfx.lineStyle(1.3, color, strokeAlpha);
              gfx.beginPath();
              gfx.moveTo(sx, sy);
              gfx.lineTo(sx + 32, sy + 16);
              gfx.lineTo(sx, sy + 32);
              gfx.lineTo(sx - 32, sy + 16);
              gfx.closePath();
              gfx.fillPath();
              gfx.strokePath();
            }
          }
        }
      }
      if (this.overlayMode !== 'paths' && this.overlayMode !== 'traffic') return;
    }

    if (this.overlayMode === 'traffic') {
      const roadNet = this.engine.roadNet;
      for (let gy = bounds.minGy; gy <= bounds.maxGy; gy++) {
        for (let gx = bounds.minGx; gx <= bounds.maxGx; gx++) {
          const chunk = this.engine.chunks.getLoadedChunkForGrid(gx, gy);
          if (!chunk) continue;
          const index = localTileIndex(gx, gy);
          const rt = chunk.roadType[index] as RoadType;
          if (rt === RoadType.None || rt === RoadType.Rail) continue;

          const elev = chunk.elevation[index];
          const { sx, sy } = gridToIso(gx, gy, elev);
          const disconnected = roadNet.isRoadDisconnected(gx, gy);
          const cong = roadNet.getTileCongestion(gx, gy);

          const fillCol = disconnected
            ? 0xf97316
            : cong >= 0.6
              ? 0xef4444
              : cong >= 0.25
                ? 0xf59e0b
                : 0x22c55e;
          const strokeCol = disconnected ? 0xfef08a : fillCol;
          const alpha = disconnected ? 0.36 : cong >= 0.25 ? 0.4 : 0.22;

          gfx.fillStyle(fillCol, alpha);
          gfx.lineStyle(1.4, strokeCol, 0.85);
          gfx.beginPath();
          gfx.moveTo(sx, sy + 2);
          gfx.lineTo(sx + 29, sy + 16);
          gfx.lineTo(sx, sy + 30);
          gfx.lineTo(sx - 29, sy + 16);
          gfx.closePath();
          gfx.fillPath();
          gfx.strokePath();

          if (roadNet.hasTrafficSignal(gx, gy, this.engine.chunks)) {
            const nsSig = roadNet.getSignalState(gx, gy, 0, 1, this.animClockSec);
            const ewSig = roadNet.getSignalState(gx, gy, 1, 0, this.animClockSec);
            const sigCol = (s: string) => (s === 'green' ? 0x22c55e : s === 'yellow' ? 0xfacc15 : 0xef4444);
            gfx.fillStyle(0x0f172a, 0.9);
            gfx.fillRoundedRect(sx - 9, sy + 11, 18, 8, 3);
            gfx.fillStyle(sigCol(nsSig), 1);
            gfx.fillCircle(sx - 4, sy + 15, 2.6);
            gfx.fillStyle(sigCol(ewSig), 1);
            gfx.fillCircle(sx + 4, sy + 15, 2.6);
          }
        }
      }

      for (const b of this.engine.state.buildings) {
        const def = BUILDINGS[b.defId];
        if (!def) continue;
        const fp = getBuildingFootprint(def, b.rotation ?? 0);
        if (
          b.gx + fp.width < bounds.minGx ||
          b.gx > bounds.maxGx ||
          b.gy + fp.height < bounds.minGy ||
          b.gy > bounds.maxGy
        ) {
          continue;
        }
        const access = roadNet.getCachedRoadAccess(b, this.engine.chunks);
        const needsHeavy =
          def.category === 'industrial' ||
          def.category === 'storage' ||
          Boolean(def.isLargeFactory) ||
          def.subCategory === 'trade_port';
        const outlineColor =
          access.accessPoints.length === 0
            ? def.requiresRoad
              ? 0xef4444
              : 0x94a3b8
            : needsHeavy && !access.heavyTruckSuitable
              ? 0xf59e0b
              : 0x22c55e;

        const elev = this.getTileElev(b.gx, b.gy);
        const top = gridToIso(b.gx, b.gy, elev);
        const right = gridToIso(b.gx + fp.width, b.gy, elev);
        const bottom = gridToIso(b.gx + fp.width, b.gy + fp.height, elev);
        const left = gridToIso(b.gx, b.gy + fp.height, elev);
        gfx.lineStyle(1.6, outlineColor, 0.85);
        gfx.beginPath();
        gfx.moveTo(top.sx, top.sy);
        gfx.lineTo(right.sx, right.sy);
        gfx.lineTo(bottom.sx, bottom.sy);
        gfx.lineTo(left.sx, left.sy);
        gfx.closePath();
        gfx.strokePath();
      }

      for (const rv of this.engine.logistics.roadVehicles) {
        if (!rv.route || rv.routeIdx >= rv.route.length) continue;
        const col = rv.vehicleClass === 'emergency' ? 0xf87171 : rv.vehicleClass === 'heavy_truck' ? 0xfbbf24 : 0x38bdf8;
        gfx.lineStyle(1.5, col, 0.65);
        const sElev = this.getTileElev(Math.round(rv.gx), Math.round(rv.gy));
        const sIso = gridToIso(rv.gx, rv.gy, sElev);
        gfx.beginPath();
        gfx.moveTo(sIso.sx, sIso.sy + 16);
        const end = Math.min(rv.route.length, rv.routeIdx + 12);
        for (let i = rv.routeIdx; i < end; i++) {
          const wp = rv.route[i];
          const wElev = this.getTileElev(wp.gx, wp.gy);
          const wIso = gridToIso(wp.gx, wp.gy, wElev);
          gfx.lineTo(wIso.sx, wIso.sy + 16);
        }
        gfx.strokePath();
      }
      return;
    }

    if (this.overlayMode === 'paths') {
      for (const a of this.engine.citizens.agents) {
        if (!a.path || a.path.length === 0) continue;
        const lineColor = a.carrying !== 'none' || a.task === 'chopping' ? 0xfbbf24 : 0x38bdf8;
        gfx.lineStyle(1.8, lineColor, 0.85);
        const startElev = this.getTileElev(Math.round(a.gx), Math.round(a.gy));
        const startIso = gridToIso(a.gx, a.gy, startElev);
        gfx.beginPath();
        gfx.moveTo(startIso.sx, startIso.sy + 16);
        const tgtElev = this.getTileElev(Math.round(a.targetGx), Math.round(a.targetGy));
        const tgtIso = gridToIso(a.targetGx, a.targetGy, tgtElev);
        gfx.lineTo(tgtIso.sx, tgtIso.sy + 16);
        for (let i = 0; i < a.path.length; i++) {
          const wp = a.path[i];
          const wpElev = this.getTileElev(wp.gx, wp.gy);
          const wpIso = gridToIso(wp.gx, wp.gy, wpElev);
          gfx.lineTo(wpIso.sx, wpIso.sy + 16);
        }
        gfx.strokePath();
      }
    }
  }

  private syncCitizens(): void {
    if (this.isInLandMode()) {
      for (let i = 0; i < this.citizenSprites.length; i++) {
        this.citizenSprites[i].setVisible(false);
        this.cargoSprites[i].setVisible(false);
      }
      return;
    }

    const atlasTex = this.textures.get(ATLAS_KEY);
    const agents = this.engine.citizens.agents;
    const count = Math.min(agents.length, this.citizenSprites.length);

    for (let i = 0; i < count; i++) {
      const a = agents[i];
      const cs = this.citizenSprites[i];
      const cg = this.cargoSprites[i];

      const tileGx = Math.round(a.gx);
      const tileGy = Math.round(a.gy);
      const chunk = this.engine.chunks.getLoadedChunkForGrid(tileGx, tileGy) ?? this.engine.chunks.getTile(tileGx, tileGy).chunk;
      const index = localTileIndex(tileGx, tileGy);
      const elev = chunk.elevation[index];
      const { sx, sy } = gridToIso(a.gx, a.gy, elev);
      const isIdleStill = a.task === 'working' || a.task === 'idle_rest';
      const bob = isIdleStill ? 0 : Math.abs(Math.sin(a.stridePhase)) * 1.1;
      const strideIdx = Math.floor(a.stridePhase) % 2;

      // Offset pedestrians laterally onto road sidewalks when walking along drivable roads
      let sidewalkOx = 0;
      let sidewalkOy = 0;
      const rt = chunk.roadType[index] as RoadType;
      if (rt !== RoadType.None && rt !== RoadType.Rail) {
        const dx = a.targetGx - a.gx;
        const dy = a.targetGy - a.gy;
        let dsx = (dx - dy) * 32;
        let dsy = (dx + dy) * 16;
        if (Math.hypot(dsx, dsy) < 1) {
          const mask = this.engine.roadNet.getRoadBitmask(tileGx, tileGy, this.engine.chunks);
          if ((mask & 5) !== 0 && (mask & 10) === 0) {
            dsx = 32;
            dsy = -16;
          } else {
            dsx = 32;
            dsy = 16;
          }
        }
        const len = Math.hypot(dsx, dsy) || 1;
        const sideSign = a.id % 2 === 0 ? 1 : -1;
        sidewalkOx = (-dsy / len) * 9.8 * sideSign;
        sidewalkOy = (dsx / len) * 9.8 * sideSign;
      }

      const profFrame = `cit_${a.role}_${isIdleStill ? 0 : strideIdx}`;
      let frame = atlasTex?.has(profFrame) ? profFrame : `cit_normal_${isIdleStill ? 0 : strideIdx}`;
      if (a.task === 'chopping' && Math.sin(a.stridePhase * 1.4) > 0) {
        frame = 'cit_laborer_chop';
      }

      const depth = (tileGx + tileGy) * 100 + elev * 2 + 28;
      const citScale = a.role === 'child' || a.role === 'teenager' ? 0.27 : 0.33;
      cs.setFrame(frame)
        .setScale(citScale)
        .setPosition(sx + sidewalkOx, sy + 18 - bob + sidewalkOy)
        .setFlipX(a.facing < 0)
        .setDepth(depth)
        .setVisible(true);

      if (a.carrying !== 'none') {
        cg.setFrame(`cargo_${a.carrying}`)
          .setScale(0.38)
          .setPosition(sx + sidewalkOx + a.facing * 2.5, sy + 12.5 - bob + sidewalkOy)
          .setDepth(depth + 1)
          .setVisible(true);
      } else {
        cg.setVisible(false);
      }
    }

    for (let i = count; i < this.citizenSprites.length; i++) {
      this.citizenSprites[i].setVisible(false);
      this.cargoSprites[i].setVisible(false);
    }
  }

  private syncVehiclesAndTrains(): void {
    if (this.isInLandMode()) {
      for (const v of this.vehicleSprites) v.setVisible(false);
      for (const t of this.trainSprites) t.setVisible(false);
      return;
    }

    const log = this.engine.logistics;
    const atlasTex = this.textures.get(ATLAS_KEY);
    let vIdx = 0;

    const getRightLanePixelOffset = (vx: number | undefined, vy: number | undefined, laneOffset: number | undefined): { ox: number; oy: number } => {
      if (!laneOffset || (!vx && !vy)) return { ox: 0, oy: 0 };
      const dsx = ((vx ?? 0) - (vy ?? 0)) * 32;
      const dsy = ((vx ?? 0) + (vy ?? 0)) * 16;
      const len = Math.hypot(dsx, dsy) || 1;
      const px = -dsy / len;
      const py = dsx / len;
      const distPx = laneOffset * 16;
      return { ox: px * distPx, oy: py * distPx };
    };

    for (const rv of log.roadVehicles) {
      if (vIdx >= this.vehicleSprites.length) break;
      const rx = Math.round(rv.gx);
      const ry = Math.round(rv.gy);
      const chunk = this.engine.chunks.getLoadedChunkForGrid(rx, ry) ?? this.engine.chunks.getTile(rx, ry).chunk;
      const elev = chunk.elevation[localTileIndex(rx, ry)];
      const { sx, sy } = gridToIso(rv.gx, rv.gy, elev);
      const off = getRightLanePixelOffset(rv.vx, rv.vy, rv.laneOffset);
      const isLoaded = (rv.cargoAmount ?? 0) > 0 && !rv.returning && Boolean(rv.cargoResource);
      const stateKey = `veh_${rv.kind}_${isLoaded ? 'loaded' : 'empty'}`;
      const baseKey = `veh_${rv.kind}`;
      const frame = atlasTex?.has(stateKey) ? stateKey : atlasTex?.has(baseKey) ? baseKey : 'veh_taxi';
      const scale =
        rv.kind === 'car' || rv.kind === 'taxi'
          ? 0.5
          : rv.kind === 'delivery_van' || rv.kind === 'fish_van' || rv.kind === 'emergency' || rv.kind === 'tractor'
            ? 0.58
            : 0.65;
      this.vehicleSprites[vIdx++]
        .setFrame(frame)
        .setPosition(sx + off.ox, sy + 18 + off.oy)
        .setFlipX(rv.facing < 0)
        .setScale(scale)
        .setDepth((rx + ry) * 100 + elev * 2 + 29)
        .setVisible(true);
    }

    for (let i = vIdx; i < this.vehicleSprites.length; i++) {
      this.vehicleSprites[i].setVisible(false);
    }

    let tIdx = 0;
    for (const tr of log.trains) {
      if (tIdx >= this.trainSprites.length) break;
      const tx = Math.round(tr.gx);
      const ty = Math.round(tr.gy);
      const chunk = this.engine.chunks.getLoadedChunkForGrid(tx, ty) ?? this.engine.chunks.getTile(tx, ty).chunk;
      const elev = chunk.elevation[localTileIndex(tx, ty)];
      const { sx, sy } = gridToIso(tr.gx, tr.gy, elev);
      this.trainSprites[tIdx++]
        .setFrame(`train_${tr.kind}`)
        .setPosition(sx, sy + 18)
        .setFlipX(tr.facing < 0)
        .setScale(0.85)
        .setDepth((Math.round(tr.gx) + Math.round(tr.gy)) * 100 + elev * 2 + 30)
        .setVisible(true);
    }
    for (let i = tIdx; i < this.trainSprites.length; i++) {
      this.trainSprites[i].setVisible(false);
    }
  }

  private updateWaterAndSmoke(): void {
    const inLandMode = this.isInLandMode();
    const reduced = inLandMode || this.lowPowerMode || this.engine.state.settings.reducedAnimations;
    const t = this.animClockSec;

    // 1. Subtle wind sway on dense forest canopy
    if (!reduced) {
      const swayAmp = this.engine.state.weather === 'storm' ? 0.055 : 0.024;
      for (let i = 0; i < this.activeFeatureCount; i++) {
        const coord = this.featureCoords[i];
        this.featureSprites[i].setRotation(
          Math.sin(t * 1.7 + coord.gx * 0.65 + coord.gy * 0.45) * swayAmp
        );
      }
      for (let i = 0; i < this.activePlantationTreeCount; i++) {
        const coord = this.plantationTreeCoords[i];
        this.plantationTreeSprites[i].setRotation(
          Math.sin(t * 1.7 + coord.gx * 0.65 + coord.gy * 0.45) * swayAmp
        );
      }
    } else {
      for (let i = 0; i < this.activeFeatureCount; i++) {
        this.featureSprites[i].setRotation(0);
      }
      for (let i = 0; i < this.activePlantationTreeCount; i++) {
        this.plantationTreeSprites[i].setRotation(0);
      }
    }

    // 2. Animated flowing water ripples across River & DeepWater tiles
    let wIdx = 0;
    if (!reduced) {
      const maxRipples = Math.min(this.waterTileCenters.length, this.waterRippleSprites.length);
      for (let i = 0; i < maxRipples; i++) {
        const tile = this.waterTileCenters[i];
        const phase = t * 1.3 + tile.gx * 0.8 + tile.gy * 0.6;
        const driftX = ((phase * 8) % 18) - 9;
        const driftY = driftX * 0.42;
        const alpha = 0.22 + (Math.sin(phase * 2.1) * 0.5 + 0.5) * 0.45;
        this.waterRippleSprites[wIdx++]
          .setPosition(tile.sx + driftX, tile.sy + driftY)
          .setAlpha(alpha)
          .setScale(0.75 + Math.sin(phase) * 0.12)
          .setVisible(true);
      }
    }
    for (let i = wIdx; i < this.waterRippleSprites.length; i++) {
      this.waterRippleSprites[i].setVisible(false);
    }

    // 3. River boats gliding along nearby river tiles
    let boatIdx = 0;
    if (!reduced && this.waterTileCenters.length >= 3) {
      for (const b of this.boatSprites) {
        const tile = this.waterTileCenters[(boatIdx * 3) % this.waterTileCenters.length];
        const p = t * 0.65 + b.phase;
        b.img
          .setPosition(tile.sx + Math.sin(p) * 14, tile.sy - 2 + Math.cos(p * 1.3) * 5)
          .setDepth((tile.gx + tile.gy) * 100 + 8)
          .setFlipX(Math.cos(p) < 0)
          .setVisible(true);
        boatIdx++;
      }
    }
    for (let i = boatIdx; i < this.boatSprites.length; i++) {
      this.boatSprites[i].img.setVisible(false);
    }

    // 4. Chimney smoke puffs rising from active cottages/bakeries/factories
    let sIdx = 0;
    if (!reduced) {
      for (const b of this.engine.state.buildings) {
        if (b.status !== 'active' || !SMOKE_BUILDINGS.has(b.defId)) continue;
        const def = BUILDINGS[b.defId];
        if (!def) continue;
        const fp = getBuildingFootprint(def, b.rotation ?? 0);
        const elev = this.getTileElev(b.gx, b.gy);
        const anchor = gridToIso(b.gx + fp.width - 1, b.gy + fp.height - 1, elev);
        for (let k = 0; k < 2 && sIdx < this.smokeSprites.length; k++) {
          const p = (t * 0.55 + b.id * 0.37 + k * 0.5) % 1;
          this.smokeSprites[sIdx++]
            .setPosition(anchor.sx + 4 + p * 9, anchor.sy - 22 - p * 26)
            .setAlpha((1 - p) * 0.52)
            .setScale(0.55 + p * 0.9)
            .setDepth((b.gx + b.gy + fp.width) * 100 + 60)
            .setVisible(true);
        }
      }
    }
    for (let i = sIdx; i < this.smokeSprites.length; i++) {
      this.smokeSprites[i].setVisible(false);
    }
  }

  private updateDayNightLightingAndWeather(dtSec: number): void {
    const inLandMode = this.isInLandMode();
    const reduced = inLandMode || this.lowPowerMode || this.engine.state.settings.reducedAnimations;
    for (const a of this.ambientSprites) {
      if (reduced) {
        a.img.setVisible(false);
        continue;
      }
      a.phase += dtSec * 0.85;
      a.img
        .setPosition(a.baseX + Math.sin(a.phase) * 140, a.baseY + Math.cos(a.phase * 0.7) * 70)
        .setVisible(true);
    }

    const timeMode = this.engine.state.settings.timeMode ?? 'normal';
    const h =
      inLandMode
        ? 12.0
        : timeMode === 'always_day'
          ? 12.0
          : timeMode === 'always_night'
            ? 22.0
            : this.engine.state.timeOfDayHours;
    const isDay = h >= 6.5 && h < 18.5;
    for (const d of this.deerSprites) {
      if (reduced || !isDay) {
        d.img.setVisible(false);
        continue;
      }
      d.phase += dtSec * 0.35;
      const gx = d.gx + Math.sin(d.phase) * 1.1;
      const gy = d.gy + Math.cos(d.phase * 0.8) * 1.1;
      const { chunk, index } = this.engine.chunks.getTile(Math.round(gx), Math.round(gy));
      if (this.engine.chunks.isWaterBiome(chunk.biomeId[index])) {
        d.img.setVisible(false);
        continue;
      }
      const { sx, sy } = gridToIso(gx, gy, chunk.elevation[index]);
      d.img
        .setPosition(sx, sy + 18)
        .setFlipX(Math.cos(d.phase) < 0)
        .setDepth((Math.round(gx) + Math.round(gy)) * 100 + 20)
        .setVisible(true);
    }

    const isDuskOrNight = h >= 18.0 || h < 5.5;
    for (const ff of this.fireflySprites) {
      if (reduced || !isDuskOrNight) {
        ff.img.setVisible(false);
        continue;
      }
      ff.phase += dtSec * 1.4;
      ff.img
        .setPosition(ff.baseX + Math.sin(ff.phase) * 38, ff.baseY + Math.cos(ff.phase * 1.3) * 24)
        .setAlpha(0.35 + (Math.sin(ff.phase * 2.5) * 0.5 + 0.5) * 0.65)
        .setVisible(true);
    }

    const festivalActive = (this.engine.state.festivalTicksRemaining ?? 0) > 0;
    for (const lan of this.lanternSprites) {
      if (reduced || !festivalActive) {
        lan.img.setVisible(false);
        continue;
      }
      lan.phase += dtSec * 0.55;
      const rise = ((lan.phase * 36) % 180);
      lan.img
        .setPosition(lan.baseX + Math.sin(lan.phase * 2) * 14, lan.baseY + 80 - rise)
        .setAlpha(Math.min(1, (180 - rise) / 45) * 0.9)
        .setVisible(true);
    }

    // Real-time 5-minute 24h Day/Night 6-Phase Atmospheric Lighting Curve
    let overlayColor = 0x040b1d;
    let overlayAlpha = 0;
    let washColor = 0xf97316;
    let washAlpha = 0;
    let skyHex = '#07150e';
    let lampPower = 0;
    let starOpacity = 0;

    if (h >= 19.75 || h < 4.25) {
      // Phase 6: Deep Starlit Moonlit Night
      overlayColor = 0x040b1d;
      overlayAlpha = 0.62;
      washAlpha = 0;
      skyHex = '#020612';
      lampPower = 1.0;
      starOpacity = 0.92;
    } else if (h >= 4.25 && h < 6.0) {
      // Phase 1: Dawn Rose & Indigo Sunrise
      const k = (h - 4.25) / 1.75;
      overlayColor = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0x040b1d),
        Phaser.Display.Color.ValueToColor(0x7c2d12),
        100,
        Math.round(k * 100)
      ).color;
      overlayAlpha = 0.62 - k * 0.42;
      washColor = 0xfb7185;
      washAlpha = Math.sin(k * Math.PI) * 0.14;
      skyHex = '#191024';
      lampPower = 1.0 - k * 0.65;
      starOpacity = Math.max(0, 0.92 * (1 - k * 1.4));
    } else if (h >= 6.0 && h < 8.0) {
      // Phase 2: Warm Morning Gold -> Crisp Daylight
      const k = (h - 6.0) / 2.0;
      overlayColor = 0xfbbf24;
      overlayAlpha = 0.16 * (1 - k);
      washColor = 0xfde68a;
      washAlpha = 0.08 * (1 - k);
      skyHex = '#0a1f15';
      lampPower = Math.max(0, 0.35 * (1 - k * 1.3));
      starOpacity = 0;
    } else if (h >= 16.0 && h < 18.25) {
      // Phase 4: Golden Hour Amber Sunset
      const k = (h - 16.0) / 2.25;
      overlayColor = 0xd97706;
      overlayAlpha = k * 0.28;
      washColor = 0xea580c;
      washAlpha = Math.sin(k * Math.PI * 0.7) * 0.14;
      skyHex = '#231312';
      lampPower = k * 0.72;
      starOpacity = 0;
    } else if (h >= 18.25 && h < 19.75) {
      // Phase 5: Violet Dusk / Twilight -> Night
      const k = (h - 18.25) / 1.5;
      overlayColor = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(0x6b21a8),
        Phaser.Display.Color.ValueToColor(0x040b1d),
        100,
        Math.round(k * 100)
      ).color;
      overlayAlpha = 0.28 + k * 0.34;
      washColor = 0xc026d3;
      washAlpha = (1 - k) * 0.12;
      skyHex = '#090b1d';
      lampPower = 0.72 + k * 0.28;
      starOpacity = Math.max(0, (k - 0.2) * 1.15);
    } else {
      // Phase 3: Crisp Sunlit Tropical Midday (08:00 .. 16:00)
      overlayAlpha = 0;
      washAlpha = 0;
      skyHex = '#07150e';
      lampPower = 0;
      starOpacity = 0;
    }

    const cam = this.cameras.main;
    cam.setBackgroundColor(skyHex);
    this.ambientOverlay.setFillStyle(overlayColor, overlayAlpha);
    this.skyWashOverlay.setFillStyle(washColor, washAlpha);

    // Twinkling stars across the upper sky during twilight & night
    if (!reduced && starOpacity > 0.04) {
      for (const st of this.starSprites) {
        const twinkle = 0.45 + (Math.sin(this.animClockSec * 2.4 + st.phase) * 0.5 + 0.5) * 0.55;
        st.img
          .setPosition(st.rx * cam.width, st.ry * cam.height)
          .setAlpha(starOpacity * twinkle)
          .setScale(0.65 + twinkle * 0.4)
          .setVisible(true);
      }
    } else {
      for (const st of this.starSprites) {
        st.img.setVisible(false);
      }
    }

    // Warm glowing lights on buildings, illuminated windows, streetlights & citizen lanterns at dusk/night
    let lIdx = 0;
    let wIdx = 0;
    if (lampPower > 0.04) {
      for (const b of this.engine.state.buildings) {
        if (b.status === 'constructing' || !b.enabled) continue;
        const def = BUILDINGS[b.defId];
        if (!def) continue;
        const rot: 0 | 1 = b.rotation === 1 ? 1 : 0;
        const fp = getBuildingFootprint(def, rot);
        const pGeom = def.isAutomatedTreePlantation ? TreePlantationSystem.getGeometry(rot) : null;
        const elev = this.getTileElev(b.gx, b.gy);
        const anchor = gridToIso(
          b.gx + (pGeom ? pGeom.mainWidth : fp.width) - 1,
          b.gy + (pGeom ? pGeom.mainHeight : fp.height) - 1,
          elev
        );
        const flicker = 0.92 + Math.sin(this.animClockSec * 3.4 + b.id * 1.7) * 0.08;
        const isNightMarket = def.id === 'night_market' || def.id === 'festival_plaza' || def.id === 'fountain_plaza';

        if (lIdx < this.lightSprites.length) {
          this.lightSprites[lIdx++]
            .setPosition(anchor.sx, anchor.sy + 2)
            .setScale((0.72 + fp.width * 0.34 + (isNightMarket ? 0.35 : 0)) * flicker)
            .setAlpha(lampPower * (isNightMarket ? 0.88 : 0.72))
            .setVisible(true);
        }

        if (!this.lowPowerMode && wIdx < this.windowLightSprites.length) {
          this.windowLightSprites[wIdx++]
            .setPosition(anchor.sx, anchor.sy + 14)
            .setScale(0.75 + fp.width * 0.16)
            .setAlpha(lampPower * 0.85 * flicker)
            .setVisible(true);
        }
      }

      for (const r of this.roadLightTiles) {
        if (lIdx >= this.lightSprites.length) break;
        this.lightSprites[lIdx++]
          .setPosition(r.sx, r.sy)
          .setScale(0.58)
          .setAlpha(lampPower * 0.52)
          .setVisible(true);
      }

      for (let i = 0; i < this.engine.citizens.agents.length && lIdx < this.lightSprites.length; i += 2) {
        const a = this.engine.citizens.agents[i];
        const ax = Math.round(a.gx);
        const ay = Math.round(a.gy);
        const c = this.engine.chunks.getLoadedChunkForGrid(ax, ay);
        const elev = c ? c.elevation[localTileIndex(ax, ay)] : 2;
        const { sx, sy } = gridToIso(a.gx, a.gy, elev);
        this.lightSprites[lIdx++]
          .setPosition(sx, sy + 8)
          .setScale(0.38)
          .setAlpha(lampPower * 0.56)
          .setVisible(true);
      }
    }
    for (let i = lIdx; i < this.lightSprites.length; i++) {
      this.lightSprites[i].setVisible(false);
    }
    for (let i = wIdx; i < this.windowLightSprites.length; i++) {
      this.windowLightSprites[i].setVisible(false);
    }

    // Weather tint & animated rain/snow precipitation streaks
    if (this.lowPowerMode || reduced) {
      this.weatherOverlay.setFillStyle(0x0f172a, 0);
      for (const drop of this.weatherDrops) drop.rect.setVisible(false);
      return;
    }
    const w = this.engine.state.weather;
    if (w === 'rain') {
      this.weatherOverlay.setFillStyle(0x0c4a6e, 0.14);
    } else if (w === 'storm') {
      this.weatherOverlay.setFillStyle(0x0f172a, 0.24);
    } else if (w === 'drought') {
      this.weatherOverlay.setFillStyle(0xb45309, 0.11);
    } else if (w === 'snow') {
      this.weatherOverlay.setFillStyle(0xe2e8f0, 0.14);
    } else {
      this.weatherOverlay.setFillStyle(0x0f172a, 0);
    }

    if (w === 'rain' || w === 'storm' || w === 'snow') {
      const isSnow = w === 'snow';
      const isStorm = w === 'storm';
      const activeDrops = isStorm ? this.weatherDrops.length : 28;
      for (let i = 0; i < this.weatherDrops.length; i++) {
        const drop = this.weatherDrops[i];
        if (i >= activeDrops) {
          drop.rect.setVisible(false);
          continue;
        }
        drop.ry = (drop.ry + dtSec * (isSnow ? 0.18 : isStorm ? 1.4 : 0.95) * drop.speed) % 1;
        drop.rx = (drop.rx + dtSec * (isSnow ? Math.sin(this.animClockSec * 2 + i) * 0.04 : -0.18) + 1) % 1;
        drop.rect
          .setSize(isSnow ? 3.5 : 1.6, isSnow ? 3.5 : isStorm ? 16 : 11)
          .setFillStyle(isSnow ? 0xf8fafc : 0xbae6fd, isSnow ? 0.72 : isStorm ? 0.58 : 0.42)
          .setRotation(isSnow ? 0 : 0.22)
          .setPosition(drop.rx * cam.width, drop.ry * cam.height)
          .setVisible(true);
      }
    } else {
      for (const drop of this.weatherDrops) {
        drop.rect.setVisible(false);
      }
    }
  }
}
