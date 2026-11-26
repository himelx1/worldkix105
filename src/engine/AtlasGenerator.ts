import type Phaser from 'phaser';
import { BUILDING_LIST, BuildingDef } from '../data/buildings.data';
import { BUILDABLE_ROADS, RoadDef, RoadType } from '../data/roads.data';
import { DepositType, FeatureType } from '../data/trees.data';
import { BiomeId } from '../core/GameState';
import { TILE_HEIGHT, TILE_WIDTH } from '../core/IsoMath';

export const ATLAS_KEY = 'kukus-atlas';
export const BUILDING_ATLAS_PREFIX = 'kukus-buildings-';

export interface BuildingSpriteRef {
  textureKey: string;
  frame: string;
}

const buildingSpriteLookup = new Map<string, BuildingSpriteRef>();
const halfResBuildingFrames = new Set<string>();

export function isHalfResBuildingFrame(frame: string): boolean {
  return halfResBuildingFrames.has(frame);
}

export function getBuildingSpriteRef(
  defId: string,
  level = 1,
  rotation: 0 | 1 = 0
): BuildingSpriteRef {
  const tier = level >= 3 ? 3 : level === 2 ? 2 : 1;
  const key = `${defId}_t${tier}_r${rotation}`;
  return (
    buildingSpriteLookup.get(key) ??
    buildingSpriteLookup.get(`${defId}_t1_r${rotation}`) ??
    buildingSpriteLookup.get(`${defId}_t1_r0`) ?? {
      textureKey: `${BUILDING_ATLAS_PREFIX}0`,
      frame: 'bldg_leaf_hut_t1_r0',
    }
  );
}

interface BiomePalette {
  topA: string;
  topB: string;
  lip: string;
  left: string;
  right: string;
  strata: string;
  detailA: string;
  detailB: string;
}

const BIOME_PALETTES: Record<BiomeId, BiomePalette> = {
  [BiomeId.DeepWater]: {
    topA: '#13608a',
    topB: '#0b4263',
    lip: '#1c7db0',
    left: '#07304a',
    right: '#041f31',
    strata: '#0e4c70',
    detailA: '#38bdf8',
    detailB: '#bae6fd',
  },
  [BiomeId.River]: {
    topA: '#2892bf',
    topB: '#187099',
    lip: '#44aedb',
    left: '#105475',
    right: '#0a3a52',
    strata: '#1d759c',
    detailA: '#7dd3fc',
    detailB: '#e0f2fe',
  },
  [BiomeId.Beach]: {
    topA: '#f2dc9f',
    topB: '#dfc178',
    lip: '#faebbf',
    left: '#b59457',
    right: '#8a6c39',
    strata: '#9c7d44',
    detailA: '#fef08a',
    detailB: '#c29b57',
  },
  [BiomeId.Grassland]: {
    topA: '#6ec45a',
    topB: '#4ea344',
    lip: '#84d46e',
    left: '#785538',
    right: '#523823',
    strata: '#614229',
    detailA: '#bef264',
    detailB: '#fde047',
  },
  [BiomeId.Fertile]: {
    topA: '#45ad5c',
    topB: '#2f8a45',
    lip: '#5ec472',
    left: '#5f422b',
    right: '#3f2a1a',
    strata: '#4c3421',
    detailA: '#6ee7b7',
    detailB: '#34d399',
  },
  [BiomeId.Jungle]: {
    topA: '#318c48',
    topB: '#216b34',
    lip: '#44a35a',
    left: '#5c4028',
    right: '#3d2817',
    strata: '#4b331e',
    detailA: '#4ade80',
    detailB: '#166534',
  },
  [BiomeId.Forest]: {
    topA: '#469952',
    topB: '#32783e',
    lip: '#5bb067',
    left: '#684a31',
    right: '#46301e',
    strata: '#543b25',
    detailA: '#86efac',
    detailB: '#22c55e',
  },
  [BiomeId.Swamp]: {
    topA: '#4d754d',
    topB: '#375737',
    lip: '#5f8a5e',
    left: '#493d2b',
    right: '#2f271b',
    strata: '#3c3223',
    detailA: '#a3e635',
    detailB: '#65a30d',
  },
  [BiomeId.Desert]: {
    topA: '#e8bf6f',
    topB: '#cc9d4c',
    lip: '#f5d289',
    left: '#a37c3b',
    right: '#785826',
    strata: '#8c6930',
    detailA: '#fde68a',
    detailB: '#b45309',
  },
  [BiomeId.Mountain]: {
    topA: '#99a0a8',
    topB: '#737982',
    lip: '#b3bac2',
    left: '#575c63',
    right: '#3b3f45',
    strata: '#474b52',
    detailA: '#f1f5f9',
    detailB: '#475569',
  },
};

export function generateWorldAtlas(scene: Phaser.Scene): void {
  if (!scene.textures.exists(ATLAS_KEY)) {
    const ct = scene.textures.createCanvas(ATLAS_KEY, 2048, 2048);
    if (ct) {
      const ctx = ct.getContext();
      ctx.clearRect(0, 0, 2048, 2048);

      let curX = 2;
      let curY = 2;
      let rowH = 0;

      const alloc = (w: number, h: number, name: string): { x: number; y: number } => {
        if (curX + w + 2 > 2046) {
          curX = 2;
          curY += rowH + 2;
          rowH = 0;
        }
        const pos = { x: curX, y: curY };
        ct.add(name, 0, pos.x, pos.y, w, h);
        curX += w + 2;
        if (h > rowH) rowH = h;
        return pos;
      };

      // 1. Biome Tiles (64x56: 32px isometric diamond + 24px layered cliff skirt)
      const tileW = TILE_WIDTH;
      const tileH = 56;
      for (let b = 0; b <= 9; b++) {
        const pal = BIOME_PALETTES[b as BiomeId];
        const { x, y } = alloc(tileW, tileH, `biome_${b}`);
        drawIsoBlock(ctx, x, y, tileW, TILE_HEIGHT, 22, pal, b as BiomeId);
      }

      // 2. Tile overlays & surveyed perimeter borders
      // tile_owned uses crisp transparent fill so biome colors stay vivid and true!
      drawLockedWildernessTile(ctx, alloc(64, 34, 'tile_locked'));
      drawIsoDiamondOutline(
        ctx,
        alloc(64, 34, 'tile_owned'),
        64,
        32,
        'rgba(255, 255, 255, 0.0)',
        'rgba(255, 255, 255, 0.07)',
        0.7
      );
      drawFrontierSubtleTile(ctx, alloc(64, 34, 'tile_frontier_subtle'));
      drawIsoDiamondOutline(
        ctx,
        alloc(64, 34, 'tile_frontier'),
        64,
        32,
        'rgba(245, 158, 11, 0.28)',
        '#fbbf24',
        2
      );
      drawIsoDiamondOutline(
        ctx,
        alloc(64, 34, 'tile_selected'),
        64,
        32,
        'rgba(255, 255, 255, 0.16)',
        '#fef08a',
        2
      );
      drawIsoDiamondOutline(
        ctx,
        alloc(64, 34, 'tile_valid'),
        64,
        32,
        'rgba(34, 197, 94, 0.34)',
        '#4ade80',
        2
      );
      drawIsoDiamondOutline(
        ctx,
        alloc(64, 34, 'tile_invalid'),
        64,
        32,
        'rgba(239, 68, 68, 0.36)',
        '#f87171',
        2
      );

      // Surveyed estate border edges
      drawSurveyBorderEdge(ctx, alloc(64, 34, 'border_ne'), 'ne');
      drawSurveyBorderEdge(ctx, alloc(64, 34, 'border_nw'), 'nw');
      drawSurveyBorderEdge(ctx, alloc(64, 34, 'border_se'), 'se');
      drawSurveyBorderEdge(ctx, alloc(64, 34, 'border_sw'), 'sw');

      // 3. Seamless 16-Bitmask Roads, Bridges & Railways (64x36)
      for (const road of BUILDABLE_ROADS) {
        for (let mask = 0; mask < 16; mask++) {
          const pos = alloc(64, 36, `road_${road.id}_${mask}`);
          drawBitmaskRoadTile(ctx, pos.x, pos.y, road, mask);
        }
        // Fallback single-tile alias if anything inspects road_${id} directly
        const fallback = alloc(64, 36, `road_${road.id}`);
        drawBitmaskRoadTile(ctx, fallback.x, fallback.y, road, 10);
      }

      // 4. Lush Volumetric Trees, Bamboo, Ancient Ruins & Outcrops (76x92)
      drawTreeSprite(ctx, alloc(76, 92, `feat_${FeatureType.JungleHardwood}`), 'hardwood');
      drawTreeSprite(ctx, alloc(76, 92, `feat_${FeatureType.TropicalPalm}`), 'palm');
      drawTreeSprite(ctx, alloc(76, 92, `feat_${FeatureType.FruitTree}`), 'fruit');
      drawTreeSprite(ctx, alloc(76, 92, `feat_${FeatureType.AncientMahogany}`), 'mahogany');
      drawBoulderSprite(ctx, alloc(76, 92, `feat_${FeatureType.StoneOutcrop}`));
      drawTreeSprite(ctx, alloc(76, 92, `feat_${FeatureType.Sapling}`), 'sapling');
      drawTreeSprite(ctx, alloc(76, 92, `feat_${FeatureType.MediumTree}`), 'medium');
      drawBambooFeature(ctx, alloc(76, 92, `feat_${FeatureType.BambooCluster}`));
      drawAncientRuinFeature(ctx, alloc(76, 92, `feat_${FeatureType.AncientRuin}`));
      drawTreeSprite(ctx, alloc(76, 92, `feat_${FeatureType.OakTree}`), 'oak');
      drawTreeSprite(ctx, alloc(76, 92, `feat_${FeatureType.PineTree}`), 'pine');
      drawTreeSprite(ctx, alloc(76, 92, `feat_${FeatureType.BirchTree}`), 'birch');
      drawTreeSprite(ctx, alloc(76, 92, `feat_${FeatureType.CypressTree}`), 'cypress');
      drawTreeSprite(ctx, alloc(76, 92, `feat_${FeatureType.AcaciaTree}`), 'acacia');

      // 5. Mineral Deposits (48x30)
      drawDepositBadge(ctx, alloc(48, 30, `dep_${DepositType.Stone}`), '#cbd5e1', '#64748b', '#e2e8f0');
      drawDepositBadge(ctx, alloc(48, 30, `dep_${DepositType.Clay}`), '#d97706', '#92400e', '#fbbf24');
      drawDepositBadge(ctx, alloc(48, 30, `dep_${DepositType.Sand}`), '#fde047', '#ca8a04', '#fef9c3');
      drawDepositBadge(ctx, alloc(48, 30, `dep_${DepositType.IronOre}`), '#94a3b8', '#334155', '#38bdf8');
      drawDepositBadge(ctx, alloc(48, 30, `dep_${DepositType.CopperOre}`), '#fb923c', '#9a3412', '#fdba74');
      drawDepositBadge(ctx, alloc(48, 30, `dep_${DepositType.Coal}`), '#334155', '#0f172a', '#64748b');
      drawDepositBadge(ctx, alloc(48, 30, `dep_${DepositType.Gold}`), '#facc15', '#92400e', '#fef08a');
      drawDepositBadge(ctx, alloc(48, 30, `dep_${DepositType.Silver}`), '#f1f5f9', '#475569', '#ffffff');

      // 6. Construction scaffolding (72x64)
      drawConstructionFrame(ctx, alloc(72, 64, 'bldg_constructing'));

      // 7. Pooled ambient sprites
      drawAmbientSprites(ctx, alloc(24, 24, 'amb_bird'), 'bird');
      drawAmbientSprites(ctx, alloc(28, 24, 'amb_cart'), 'cart');
      drawRiverBoat(ctx, alloc(32, 22, 'amb_boat'));
      drawWildlifeDeer(ctx, alloc(26, 24, 'wild_deer'));
      drawFireflyGlow(ctx, alloc(16, 16, 'firefly_glow'));
      drawFestivalLantern(ctx, alloc(16, 22, 'festival_lantern'));

      // 8. 7 Distinct Clothed Citizen Roles (28x38)
      drawCitizenSprite(ctx, alloc(28, 38, 'cit_normal_0'), { role: 'normal', strideFrame: 0 });
      drawCitizenSprite(ctx, alloc(28, 38, 'cit_normal_1'), { role: 'normal', strideFrame: 1 });

      drawCitizenSprite(ctx, alloc(28, 38, 'cit_laborer_0'), { role: 'laborer', strideFrame: 0 });
      drawCitizenSprite(ctx, alloc(28, 38, 'cit_laborer_1'), { role: 'laborer', strideFrame: 1 });
      drawCitizenSprite(ctx, alloc(28, 38, 'cit_laborer_chop'), { role: 'laborer', strideFrame: 0, chopping: true });

      drawCitizenSprite(ctx, alloc(28, 38, 'cit_artisan_0'), { role: 'artisan', strideFrame: 0 });
      drawCitizenSprite(ctx, alloc(28, 38, 'cit_artisan_1'), { role: 'artisan', strideFrame: 1 });

      drawCitizenSprite(ctx, alloc(28, 38, 'cit_engineer_0'), { role: 'engineer', strideFrame: 0 });
      drawCitizenSprite(ctx, alloc(28, 38, 'cit_engineer_1'), { role: 'engineer', strideFrame: 1 });

      drawCitizenSprite(ctx, alloc(28, 38, 'cit_child_0'), { role: 'child', strideFrame: 0 });
      drawCitizenSprite(ctx, alloc(28, 38, 'cit_child_1'), { role: 'child', strideFrame: 1 });

      drawCitizenSprite(ctx, alloc(28, 38, 'cit_gov_officer_0'), { role: 'gov_officer', strideFrame: 0 });
      drawCitizenSprite(ctx, alloc(28, 38, 'cit_gov_officer_1'), { role: 'gov_officer', strideFrame: 1 });

      drawCitizenSprite(ctx, alloc(28, 38, 'cit_police_0'), { role: 'police', strideFrame: 0 });
      drawCitizenSprite(ctx, alloc(28, 38, 'cit_police_1'), { role: 'police', strideFrame: 1 });

      // Extended 24-profession citizen visual sprites
      const extraProfessions: Array<{
        prof: string;
        tunic: string;
        accent: string;
        hat: 'none' | 'helmet' | 'cap' | 'straw' | 'medical' | 'fire' | 'chef' | 'hard_yellow';
        scale?: number;
      }> = [
        { prof: 'executive', tunic: '#0f172a', accent: '#f59e0b', hat: 'none' },
        { prof: 'office_worker', tunic: '#334155', accent: '#93c5fd', hat: 'none' },
        { prof: 'factory_worker', tunic: '#c2410c', accent: '#fde047', hat: 'hard_yellow' },
        { prof: 'farmer', tunic: '#65a30d', accent: '#a16207', hat: 'straw' },
        { prof: 'fisherman', tunic: '#eab308', accent: '#0284c7', hat: 'cap' },
        { prof: 'construction_worker', tunic: '#ea580c', accent: '#facc15', hat: 'hard_yellow' },
        { prof: 'student', tunic: '#4f46e5', accent: '#e0e7ff', hat: 'none', scale: 0.9 },
        { prof: 'teacher', tunic: '#6d28d9', accent: '#fde68a', hat: 'none' },
        { prof: 'doctor', tunic: '#f8fafc', accent: '#ef4444', hat: 'medical' },
        { prof: 'nurse', tunic: '#ecfeff', accent: '#06b6d4', hat: 'medical' },
        { prof: 'firefighter', tunic: '#991b1b', accent: '#fde047', hat: 'fire' },
        { prof: 'shopkeeper', tunic: '#0d9488', accent: '#fef3c7', hat: 'cap' },
        { prof: 'chef', tunic: '#ffffff', accent: '#fb923c', hat: 'chef' },
        { prof: 'miner', tunic: '#44403c', accent: '#f59e0b', hat: 'helmet' },
        { prof: 'forester', tunic: '#15803d', accent: '#fde047', hat: 'cap' },
        { prof: 'courier', tunic: '#2563eb', accent: '#facc15', hat: 'cap' },
        { prof: 'tourist', tunic: '#ec4899', accent: '#fef08a', hat: 'straw' },
        { prof: 'teenager', tunic: '#0ea5e9', accent: '#bae6fd', hat: 'none', scale: 0.88 },
        { prof: 'adult', tunic: '#475569', accent: '#e2e8f0', hat: 'none' },
        { prof: 'elderly', tunic: '#78716c', accent: '#fef3c7', hat: 'none' },
      ];
      for (const ep of extraProfessions) {
        drawExtendedCitizenSprite(ctx, alloc(28, 38, `cit_${ep.prof}_0`), ep, 0);
        drawExtendedCitizenSprite(ctx, alloc(28, 38, `cit_${ep.prof}_1`), ep, 1);
      }

      // Vehicles & Trains (40x28), with explicit empty vs loaded cargo states
      const cargoKinds = [
        'cargo_truck',
        'container_truck',
        'construction_truck',
        'delivery_van',
        'fish_van',
      ] as const;
      for (const ck of cargoKinds) {
        drawVehicleSprite(ctx, alloc(40, 28, `veh_${ck}`), ck, 'loaded');
        drawVehicleSprite(ctx, alloc(40, 28, `veh_${ck}_empty`), ck, 'empty');
        drawVehicleSprite(ctx, alloc(40, 28, `veh_${ck}_loaded`), ck, 'loaded');
      }
      drawVehicleSprite(ctx, alloc(40, 28, 'veh_bus'), 'bus', 'loaded');
      drawVehicleSprite(ctx, alloc(40, 28, 'veh_taxi'), 'taxi', 'loaded');
      drawVehicleSprite(ctx, alloc(40, 28, 'veh_tractor'), 'tractor', 'loaded');
      drawVehicleSprite(ctx, alloc(40, 28, 'veh_car'), 'car', 'loaded');
      drawVehicleSprite(ctx, alloc(40, 28, 'veh_emergency'), 'emergency', 'loaded');
      drawVehicleSprite(ctx, alloc(44, 30, 'train_passenger'), 'train_passenger', 'loaded');
      drawVehicleSprite(ctx, alloc(44, 30, 'train_freight'), 'train_freight', 'loaded');

      // One-way road direction decals (32x20)
      drawRoadDirectionDecal(ctx, alloc(32, 20, 'road_dir_1'), 1);
      drawRoadDirectionDecal(ctx, alloc(32, 20, 'road_dir_2'), 2);
      drawRoadDirectionDecal(ctx, alloc(32, 20, 'road_dir_3'), 3);
      drawRoadDirectionDecal(ctx, alloc(32, 20, 'road_dir_4'), 4);

      drawCargoSprite(ctx, alloc(16, 14, 'cargo_wood'), 'wood');
      drawCargoSprite(ctx, alloc(16, 14, 'cargo_food'), 'food');
      drawCargoSprite(ctx, alloc(16, 14, 'cargo_stone'), 'stone');
      drawCargoSprite(ctx, alloc(16, 14, 'cargo_goods'), 'goods');

      drawWaterRipple(ctx, alloc(44, 20, 'water_ripple'));
      drawSmokePuff(ctx, alloc(24, 24, 'smoke_puff'));
      drawLightHalo(ctx, alloc(128, 128, 'light_halo'));
      drawWindowGlow(ctx, alloc(48, 36, 'window_glow'));
      drawSkyStar(ctx, alloc(12, 12, 'sky_star'));

      ct.refresh();
    }
  }

  generateBuildingAtlases(scene);
}

function generateBuildingAtlases(scene: Phaser.Scene): void {
  if (buildingSpriteLookup.size > 0 && scene.textures.exists(`${BUILDING_ATLAS_PREFIX}0`)) {
    return;
  }
  buildingSpriteLookup.clear();
  halfResBuildingFrames.clear();

  let pageIdx = 0;
  let ct = scene.textures.createCanvas(`${BUILDING_ATLAS_PREFIX}${pageIdx}`, 2048, 2048);
  if (!ct) return;
  let ctx = ct.getContext();
  ctx.clearRect(0, 0, 2048, 2048);

  let curX = 2;
  let curY = 2;
  let rowH = 0;

  const allocBuilding = (
    w: number,
    h: number,
    frameName: string
  ): { x: number; y: number; textureKey: string } => {
    if (curX + w + 2 > 2046) {
      curX = 2;
      curY += rowH + 2;
      rowH = 0;
    }
    if (curY + h + 2 > 2046) {
      ct!.refresh();
      pageIdx += 1;
      const nextKey = `${BUILDING_ATLAS_PREFIX}${pageIdx}`;
      if (scene.textures.exists(nextKey)) {
        ct = scene.textures.get(nextKey) as Phaser.Textures.CanvasTexture;
      } else {
        ct = scene.textures.createCanvas(nextKey, 2048, 2048);
      }
      ctx = ct!.getContext();
      ctx.clearRect(0, 0, 2048, 2048);
      curX = 2;
      curY = 2;
      rowH = 0;
    }
    const textureKey = `${BUILDING_ATLAS_PREFIX}${pageIdx}`;
    const pos = { x: curX, y: curY, textureKey };
    ct!.add(frameName, 0, pos.x, pos.y, w, h);
    curX += w + 2;
    if (h > rowH) rowH = h;
    return pos;
  };

  for (const def of BUILDING_LIST) {
    const rotations: Array<0 | 1> =
      def.width !== def.height && def.footprintRotatable !== false ? [0, 1] : [0];
    const isLargeSpan = def.width >= 4 || def.height >= 4;
    const isMegaSpan = def.width >= 6 || def.height >= 6;
    const maxTier = isLargeSpan ? 1 : Math.min(3, Math.max(1, def.maxLevel));

    for (const rot of rotations) {
      const effW = rot === 1 ? def.height : def.width;
      const effH = rot === 1 ? def.width : def.height;
      const renderW = def.isAutomatedTreePlantation ? (rot === 1 ? 20 : 10) : effW;
      const renderH = def.isAutomatedTreePlantation ? (rot === 1 ? 10 : 20) : effH;
      const effDef: BuildingDef =
        renderW !== def.width || renderH !== def.height
          ? { ...def, width: renderW, height: renderH }
          : def;

      for (let tier = 1; tier <= maxTier; tier++) {
        const span = renderW + renderH;
        const asymPad = Math.abs(renderW - renderH) * 32;
        const extraTierHeight = (tier - 1) * 14 + (def.subCategory === 'skyscraper' ? 38 : 0);
        const frameW = Math.max(76, span * 32 + asymPad + 16);
        const frameH = Math.max(94, span * 16 + 68 + extraTierHeight);
        const frameName = `bldg_${def.id}_t${tier}_r${rot}`;
        if (isMegaSpan) {
          const slotW = Math.ceil(frameW * 0.5);
          const slotH = Math.ceil(frameH * 0.5);
          const slot = allocBuilding(slotW, slotH, frameName);
          ctx.save();
          ctx.translate(slot.x, slot.y);
          ctx.scale(0.5, 0.5);
          drawBuildingSprite(ctx, 0, 0, frameW, frameH, effDef, tier as 1 | 2 | 3);
          ctx.restore();
          halfResBuildingFrames.add(frameName);
          buildingSpriteLookup.set(`${def.id}_t${tier}_r${rot}`, {
            textureKey: slot.textureKey,
            frame: frameName,
          });
        } else {
          const slot = allocBuilding(frameW, frameH, frameName);
          drawBuildingSprite(ctx, slot.x, slot.y, frameW, frameH, effDef, tier as 1 | 2 | 3);
          buildingSpriteLookup.set(`${def.id}_t${tier}_r${rot}`, {
            textureKey: slot.textureKey,
            frame: frameName,
          });
        }
      }
    }
  }

  ct.refresh();
}

function drawIsoBlock(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  w: number,
  h: number,
  depth: number,
  pal: BiomePalette,
  biome: BiomeId
): void {
  const hw = w / 2;
  const hh = h / 2;

  ctx.fillStyle = pal.left;
  ctx.beginPath();
  ctx.moveTo(ox, oy + hh);
  ctx.lineTo(ox + hw, oy + h);
  ctx.lineTo(ox + hw, oy + h + depth);
  ctx.lineTo(ox, oy + hh + depth);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = shadeHex(pal.topB, -18);
  ctx.beginPath();
  ctx.moveTo(ox, oy + hh);
  ctx.lineTo(ox + hw, oy + h);
  ctx.lineTo(ox + hw, oy + h + 3);
  ctx.lineTo(ox, oy + hh + 3);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = pal.strata;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.moveTo(ox, oy + hh + 9);
  ctx.lineTo(ox + hw, oy + h + 9);
  ctx.lineTo(ox + hw, oy + h + 13);
  ctx.lineTo(ox, oy + hh + 13);
  ctx.closePath();
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = pal.right;
  ctx.beginPath();
  ctx.moveTo(ox + hw, oy + h);
  ctx.lineTo(ox + w, oy + hh);
  ctx.lineTo(ox + w, oy + hh + depth);
  ctx.lineTo(ox + hw, oy + h + depth);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = shadeHex(pal.topB, -30);
  ctx.beginPath();
  ctx.moveTo(ox + hw, oy + h);
  ctx.lineTo(ox + w, oy + hh);
  ctx.lineTo(ox + w, oy + hh + 3);
  ctx.lineTo(ox + hw, oy + h + 3);
  ctx.closePath();
  ctx.fill();

  const grad = ctx.createLinearGradient(ox + 6, oy + 2, ox + w - 6, oy + h - 2);
  grad.addColorStop(0, pal.topA);
  grad.addColorStop(1, pal.topB);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(ox + hw, oy);
  ctx.lineTo(ox + w, oy + hh);
  ctx.lineTo(ox + hw, oy + h);
  ctx.lineTo(ox, oy + hh);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = pal.lip;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(ox + 1, oy + hh);
  ctx.lineTo(ox + hw, oy + 0.8);
  ctx.lineTo(ox + w - 1, oy + hh);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(ox + 1, oy + hh);
  ctx.lineTo(ox + hw, oy + h - 0.6);
  ctx.lineTo(ox + w - 1, oy + hh);
  ctx.stroke();

  if (biome === BiomeId.DeepWater || biome === BiomeId.River) {
    ctx.strokeStyle = pal.detailB;
    ctx.globalAlpha = 0.42;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(ox + 20, oy + 14);
    ctx.quadraticCurveTo(ox + 28, oy + 12, ox + 36, oy + 14);
    ctx.moveTo(ox + 26, oy + 21);
    ctx.quadraticCurveTo(ox + 34, oy + 19, ox + 42, oy + 21);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (biome === BiomeId.Mountain) {
    ctx.fillStyle = pal.detailA;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(ox + hw, oy + 6);
    ctx.lineTo(ox + hw + 10, oy + 14);
    ctx.lineTo(ox + hw, oy + 17);
    ctx.lineTo(ox + hw - 9, oy + 13);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (biome === BiomeId.Desert || biome === BiomeId.Beach) {
    ctx.strokeStyle = pal.detailA;
    ctx.globalAlpha = 0.4;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(ox + 18, oy + 16);
    ctx.quadraticCurveTo(ox + 32, oy + 12, ox + 45, oy + 16);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = pal.detailA;
    ctx.globalAlpha = 0.36;
    ctx.fillRect(ox + hw - 10, oy + hh - 3, 2, 3);
    ctx.fillRect(ox + hw - 7, oy + hh - 2, 2, 2);
    ctx.fillRect(ox + hw + 6, oy + hh + 2, 2, 3);
    ctx.fillStyle = pal.detailB;
    ctx.fillRect(ox + hw + 1, oy + hh - 6, 2, 2);
    ctx.globalAlpha = 1;
  }
}

function drawIsoDiamondOutline(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  w: number,
  h: number,
  fill: string,
  stroke: string,
  lineWidth: number
): void {
  const hw = w / 2;
  const hh = h / 2;
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.beginPath();
  ctx.moveTo(pos.x + hw, pos.y + 1);
  ctx.lineTo(pos.x + w - 1, pos.y + hh + 1);
  ctx.lineTo(pos.x + hw, pos.y + h + 1);
  ctx.lineTo(pos.x + 1, pos.y + hh + 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawLockedWildernessTile(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }): void {
  const w = 64;
  const h = 32;
  const hw = w / 2;
  const hh = h / 2;
  ctx.fillStyle = 'rgba(5, 19, 28, 0.54)';
  ctx.beginPath();
  ctx.moveTo(pos.x + hw, pos.y + 1);
  ctx.lineTo(pos.x + w - 1, pos.y + hh + 1);
  ctx.lineTo(pos.x + hw, pos.y + h + 1);
  ctx.lineTo(pos.x + 1, pos.y + hh + 1);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(148, 197, 214, 0.14)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pos.x + 18, pos.y + 14);
  ctx.lineTo(pos.x + 28, pos.y + 19);
  ctx.moveTo(pos.x + 34, pos.y + 13);
  ctx.lineTo(pos.x + 44, pos.y + 18);
  ctx.stroke();
}

function drawFrontierSubtleTile(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }): void {
  const w = 64;
  const h = 32;
  const hw = w / 2;
  const hh = h / 2;
  ctx.fillStyle = 'rgba(245, 158, 11, 0.08)';
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.34)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(pos.x + hw, pos.y + 2);
  ctx.lineTo(pos.x + w - 3, pos.y + hh + 1);
  ctx.lineTo(pos.x + hw, pos.y + h);
  ctx.lineTo(pos.x + 3, pos.y + hh + 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawSurveyBorderEdge(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  edge: 'ne' | 'nw' | 'se' | 'sw'
): void {
  const pTop = { x: pos.x + 32, y: pos.y + 1 };
  const pRight = { x: pos.x + 63, y: pos.y + 17 };
  const pBottom = { x: pos.x + 32, y: pos.y + 33 };
  const pLeft = { x: pos.x + 1, y: pos.y + 17 };

  const [a, b] =
    edge === 'ne'
      ? [pTop, pRight]
      : edge === 'nw'
        ? [pLeft, pTop]
        : edge === 'se'
          ? [pRight, pBottom]
          : [pLeft, pBottom];

  ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(a.x, a.y + 1);
  ctx.lineTo(b.x, b.y + 1);
  ctx.stroke();

  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();

  const mx = (a.x + b.x) * 0.5;
  const my = (a.y + b.y) * 0.5;
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.arc(mx, my, 1.8, 0, Math.PI * 2);
  ctx.fill();
}

/**
 * Seamless edge-to-edge bitmask road generator (no boxed tile border!).
 * Bit 1 = N (+16, -8), Bit 2 = E (+16, +8), Bit 4 = S (-16, +8), Bit 8 = W (-16, -8).
 * Supports smooth curved corners, multi-lane dividers, intersections, dead-end turnarounds, and roundabouts.
 */
function drawBitmaskRoadTile(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  road: RoadDef,
  mask: number
): void {
  const cx = ox + 32;
  const cy = oy + 17;

  const arms: Array<{ bit: number; ex: number; ey: number }> = [
    { bit: 1, ex: cx + 16, ey: cy - 8 }, // N edge midpoint
    { bit: 2, ex: cx + 16, ey: cy + 8 }, // E edge midpoint
    { bit: 4, ex: cx - 16, ey: cy + 8 }, // S edge midpoint
    { bit: 8, ex: cx - 16, ey: cy - 8 }, // W edge midpoint
  ];
  const activeArms = arms.filter((a) => (mask & a.bit) !== 0);
  const armCount = activeArms.length;
  const isCornerCurve = armCount === 2 && mask !== 5 && mask !== 10;
  const isStraight = armCount === 2 && (mask === 5 || mask === 10);
  const isJunction = armCount >= 3;

  const isHighway =
    road.id === RoadType.Highway ||
    road.id === RoadType.EightLane ||
    road.id === RoadType.Expressway ||
    road.id === RoadType.ElevatedHighway ||
    road.id === RoadType.Interchange;
  const isThreeLane = road.id === RoadType.ThreeLane;
  const isFourOrSixLane =
    road.id === RoadType.FourLane ||
    road.id === RoadType.SixLane ||
    road.id === RoadType.CommercialBlvd ||
    isHighway;
  const isMultiLane =
    isThreeLane ||
    isFourOrSixLane ||
    road.id === RoadType.Paved ||
    road.id === RoadType.UndergroundRoad;
  const isPaved =
    isMultiLane ||
    road.id === RoadType.ResidentialRoad ||
    road.id === RoadType.TwoLane ||
    road.id === RoadType.IndustrialRoad;
  const isSmallRoad = road.id === RoadType.SmallRoad;
  const isBridge = road.id === RoadType.Bridge;
  const isRail = road.id === RoadType.Rail;
  const isStone = road.id === RoadType.Stone;
  const isRoundabout = road.id === RoadType.Roundabout;
  const isParking = road.id === RoadType.ParkingLot;
  const hasSidewalk = isPaved || isSmallRoad || isStone || isRoundabout;

  const roadWidth =
    isParking
      ? 18
      : road.id === RoadType.SixLane ||
          road.id === RoadType.EightLane ||
          road.id === RoadType.Expressway ||
          road.id === RoadType.Interchange
        ? 18.5
        : isHighway || road.id === RoadType.FourLane || road.id === RoadType.CommercialBlvd
          ? 16.5
          : isThreeLane
            ? 15
            : isPaved || isBridge
              ? 13
              : isStone || isSmallRoad
                ? 11
                : isRail
                  ? 9
                  : 10;
  const sidewalkWidth = hasSidewalk ? roadWidth + 5.2 : roadWidth + 3.0;
  const curbWidth = hasSidewalk ? roadWidth + 1.6 : roadWidth + 1.8;

  // Clip cleanly to the isometric tile diamond so adjoining tiles fuse flush at edges
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(ox + 32, oy + 1);
  ctx.lineTo(ox + 63, oy + 17);
  ctx.lineTo(ox + 32, oy + 33);
  ctx.lineTo(ox + 1, oy + 17);
  ctx.closePath();
  ctx.clip();

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Parking lot full-pad bays
  if (isParking) {
    ctx.fillStyle = road.color;
    ctx.beginPath();
    ctx.moveTo(ox + 32, oy + 3);
    ctx.lineTo(ox + 58, oy + 17);
    ctx.lineTo(ox + 32, oy + 31);
    ctx.lineTo(ox + 6, oy + 17);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = road.trimColor;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    for (const dx of [-10, -3, 4, 11]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx, cy - 5);
      ctx.lineTo(cx + dx - 3, cy - 1);
      ctx.moveTo(cx + dx, cy + 5);
      ctx.lineTo(cx + dx + 3, cy + 1);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  const strokeRoadGeometry = (strokeStyle: string, width: number, fillCapRadiusScale: number) => {
    ctx.strokeStyle = strokeStyle;
    ctx.fillStyle = strokeStyle;
    ctx.lineWidth = width;

    if (armCount === 0) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, width * 0.56, width * 0.34, 0, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    if (armCount === 1) {
      // Dead-end / cul-de-sac rounded cap
      const a = activeArms[0];
      ctx.beginPath();
      ctx.ellipse(cx, cy, width * 0.62 * fillCapRadiusScale, width * 0.38 * fillCapRadiusScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(a.ex, a.ey);
      ctx.stroke();
      return;
    }

    if (isCornerCurve) {
      const a = activeArms[0];
      const b = activeArms[1];
      ctx.beginPath();
      ctx.moveTo(a.ex, a.ey);
      ctx.quadraticCurveTo(cx, cy, b.ex, b.ey);
      ctx.stroke();
      return;
    }

    if (isStraight) {
      const a = activeArms[0];
      const b = activeArms[1];
      ctx.beginPath();
      ctx.moveTo(a.ex, a.ey);
      ctx.lineTo(b.ex, b.ey);
      ctx.stroke();
      return;
    }

    // Junction hub (3 or 4 ways)
    ctx.beginPath();
    ctx.ellipse(cx, cy, width * 0.58, width * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const a of activeArms) {
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(a.ex, a.ey);
      ctx.stroke();
    }
  };

  // 1. Pedestrian sidewalk strip (outer) + curb separation line
  if (hasSidewalk) {
    const sidewalkCol = isStone ? '#a8a29e' : '#cbd5e1';
    strokeRoadGeometry(sidewalkCol, sidewalkWidth, 1.07);
    strokeRoadGeometry(road.trimColor, curbWidth, 1.02);
  } else {
    strokeRoadGeometry(road.trimColor, sidewalkWidth, 1.05);
  }

  // 2. Main vehicle carriageway fill
  strokeRoadGeometry(road.color, roadWidth, 1.0);

  // 3. Surface details per road tier
  if (road.id === RoadType.Dirt || road.id === RoadType.Gravel) {
    ctx.fillStyle = road.trimColor;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(cx - 4, cy - 2, 2, 1.5);
    ctx.fillRect(cx + 3, cy + 1, 2.5, 1.5);
    for (const a of activeArms) {
      ctx.fillRect((cx + a.ex) * 0.5 - 1, (cy + a.ey) * 0.5, 2, 1.5);
    }
    ctx.globalAlpha = 1;
  } else if (isStone) {
    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 1;
    for (const a of activeArms) {
      const mx = (cx + a.ex) * 0.5;
      const my = (cy + a.ey) * 0.5;
      const nx = -(a.ey - cy) * 0.32;
      const ny = (a.ex - cx) * 0.32;
      ctx.beginPath();
      ctx.moveTo(mx - nx, my - ny);
      ctx.lineTo(mx + nx, my + ny);
      ctx.stroke();
    }
  } else if (isBridge) {
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 1.6;
    const drawPlanks = (x0: number, y0: number, x1: number, y1: number) => {
      for (const t of [0.35, 0.7]) {
        const px = x0 + (x1 - x0) * t;
        const py = y0 + (y1 - y0) * t;
        const nx = -(y1 - y0) * 0.32;
        const ny = (x1 - x0) * 0.32;
        ctx.beginPath();
        ctx.moveTo(px - nx, py - ny);
        ctx.lineTo(px + nx, py + ny);
        ctx.stroke();
      }
    };
    for (const a of activeArms) {
      drawPlanks(cx, cy, a.ex, a.ey);
    }
  } else if (isRail) {
    for (const a of activeArms) {
      const dx = a.ex - cx;
      const dy = a.ey - cy;
      const len = Math.hypot(dx, dy) || 1;
      const px = (-dy / len) * 3.5;
      const py = (dx / len) * 3.5;

      ctx.strokeStyle = '#78350f';
      ctx.lineWidth = 1.6;
      for (const t of [0.25, 0.55, 0.85]) {
        const sx = cx + dx * t;
        const sy = cy + dy * t;
        ctx.beginPath();
        ctx.moveTo(sx - px, sy - py);
        ctx.lineTo(sx + px, sy + py);
        ctx.stroke();
      }

      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(cx - px * 0.6, cy - py * 0.6);
      ctx.lineTo(a.ex - px * 0.6, a.ey - py * 0.6);
      ctx.moveTo(cx + px * 0.6, cy + py * 0.6);
      ctx.lineTo(a.ex + px * 0.6, a.ey + py * 0.6);
      ctx.stroke();
    }
    if (mask === 0) {
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (isRoundabout) {
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 11.5, 6.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 5.5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  } else if (isPaved || isHighway || isSmallRoad) {
    const lineCol =
      road.id === RoadType.IndustrialRoad
        ? '#fb923c'
        : road.id === RoadType.CommercialBlvd
          ? '#60a5fa'
          : road.id === RoadType.UndergroundRoad
            ? '#a78bfa'
            : isHighway
              ? '#fde047'
              : '#facc15';

    // Helper for parallel lane divider offsets across straight & curved segments
    const drawOffsetLaneLine = (shiftFrac: number, color: string, width: number, dashed: boolean) => {
      const shift = roadWidth * shiftFrac;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dashed ? [2.2, 2.6] : []);
      if (isCornerCurve) {
        const a = activeArms[0];
        const b = activeArms[1];
        const naX = -(a.ey - cy) * (shiftFrac * 0.52);
        const naY = (a.ex - cx) * (shiftFrac * 0.52);
        const nbX = (b.ey - cy) * (shiftFrac * 0.52);
        const nbY = -(b.ex - cx) * (shiftFrac * 0.52);
        ctx.beginPath();
        ctx.moveTo(a.ex + naX, a.ey + naY);
        ctx.quadraticCurveTo(cx + (naX + nbX) * 0.5, cy + (naY + nbY) * 0.5, b.ex + nbX, b.ey + nbY);
        ctx.stroke();
      } else if (isStraight) {
        const a = activeArms[0];
        const b = activeArms[1];
        const dx = b.ex - a.ex;
        const dy = b.ey - a.ey;
        const len = Math.hypot(dx, dy) || 1;
        const px = (-dy / len) * shift;
        const py = (dx / len) * shift;
        ctx.beginPath();
        ctx.moveTo(a.ex + px, a.ey + py);
        ctx.lineTo(b.ex + px, b.ey + py);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    };

    if (isThreeLane && !isJunction) {
      // Explicit 3-lane markings: 2 dashed white lane dividers splitting carriageway into 3 lanes
      drawOffsetLaneLine(-0.17, 'rgba(248, 250, 252, 0.72)', 0.85, true);
      drawOffsetLaneLine(0.17, 'rgba(248, 250, 252, 0.72)', 0.85, true);
    } else if (isFourOrSixLane && !isJunction) {
      // 4-lane & 6-lane outer dashed lane lines
      drawOffsetLaneLine(-0.24, 'rgba(248, 250, 252, 0.55)', 0.85, true);
      drawOffsetLaneLine(0.24, 'rgba(248, 250, 252, 0.55)', 0.85, true);
      if (road.id === RoadType.SixLane || road.id === RoadType.EightLane || road.id === RoadType.Expressway) {
        drawOffsetLaneLine(-0.12, 'rgba(248, 250, 252, 0.42)', 0.75, true);
        drawOffsetLaneLine(0.12, 'rgba(248, 250, 252, 0.42)', 0.75, true);
      }
    }

    // Centerline markings (skipped on 3-lane straight/curve since 3 lanes have 2 dividers instead of center stripe)
    if (!isThreeLane || isJunction || armCount <= 1) {
      ctx.strokeStyle = lineCol;
      ctx.lineWidth = isHighway ? 1.7 : 1.2;
      ctx.setLineDash(isHighway ? [] : [3, 3]);
      if (isCornerCurve) {
        const a = activeArms[0];
        const b = activeArms[1];
        ctx.beginPath();
        ctx.moveTo(a.ex, a.ey);
        ctx.quadraticCurveTo(cx, cy, b.ex, b.ey);
        ctx.stroke();
      } else if (isStraight) {
        const a = activeArms[0];
        const b = activeArms[1];
        ctx.beginPath();
        ctx.moveTo(a.ex, a.ey);
        ctx.lineTo(b.ex, b.ey);
        ctx.stroke();
      } else if (!isJunction) {
        for (const a of activeArms) {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(a.ex, a.ey);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }

    // Intersection stop bars & crosswalk stripes for T-junctions & 4-way crosses
    if (isJunction && isPaved) {
      ctx.strokeStyle = 'rgba(248, 250, 252, 0.78)';
      ctx.lineWidth = 1.1;
      for (const a of activeArms) {
        const sx = cx + (a.ex - cx) * 0.54;
        const sy = cy + (a.ey - cy) * 0.54;
        const nx = -(a.ey - cy) * 0.24;
        const ny = (a.ex - cx) * 0.24;
        ctx.beginPath();
        ctx.moveTo(sx - nx, sy - ny);
        ctx.lineTo(sx + nx, sy + ny);
        ctx.stroke();
      }
    }

    if (road.id === RoadType.ElevatedHighway) {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(cx - 2, cy - 2, 4, 4);
    } else if (road.id === RoadType.Interchange) {
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 8, 4.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    } else if (mask === 0) {
      ctx.fillStyle = lineCol;
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawTreeSprite(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  kind: 'hardwood' | 'palm' | 'fruit' | 'mahogany' | 'sapling' | 'medium' | 'oak' | 'pine' | 'birch' | 'cypress' | 'acacia'
): void {
  const cx = pos.x + 38;
  const baseY = pos.y + 74;

  ctx.fillStyle = 'rgba(5, 16, 10, 0.34)';
  ctx.beginPath();
  ctx.ellipse(
    cx + 3,
    baseY + 1,
    kind === 'sapling' ? 7 : kind === 'medium' ? 12 : 17,
    kind === 'sapling' ? 3.5 : kind === 'medium' ? 5.8 : 8,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  if (kind === 'pine') {
    ctx.fillStyle = '#57331b';
    ctx.fillRect(cx - 2.5, baseY - 16, 5, 16);
    const tiers = [
      { y: baseY - 13, w: 18, h: 18, col: '#14532d' },
      { y: baseY - 25, w: 14, h: 17, col: '#166534' },
      { y: baseY - 37, w: 10, h: 16, col: '#15803d' },
    ];
    for (const t of tiers) {
      ctx.fillStyle = t.col;
      ctx.beginPath();
      ctx.moveTo(cx, t.y - t.h);
      ctx.lineTo(cx + t.w, t.y);
      ctx.lineTo(cx - t.w, t.y);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }

  if (kind === 'birch') {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(cx - 2.5, baseY - 26, 5, 26);
    ctx.fillStyle = '#334155';
    ctx.fillRect(cx - 2.5, baseY - 20, 3, 2);
    ctx.fillRect(cx - 0.5, baseY - 12, 3, 2);
    ctx.fillStyle = '#65a30d';
    ctx.beginPath();
    ctx.arc(cx - 5, baseY - 28, 10, 0, Math.PI * 2);
    ctx.arc(cx + 5, baseY - 27, 9, 0, Math.PI * 2);
    ctx.arc(cx, baseY - 36, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#bef264';
    ctx.beginPath();
    ctx.arc(cx - 2, baseY - 38, 5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (kind === 'cypress') {
    ctx.fillStyle = '#452b18';
    ctx.beginPath();
    ctx.moveTo(cx - 6, baseY);
    ctx.lineTo(cx - 2, baseY - 26);
    ctx.lineTo(cx + 2, baseY - 26);
    ctx.lineTo(cx + 6, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1e5631';
    ctx.beginPath();
    ctx.ellipse(cx, baseY - 34, 9, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a7d44';
    ctx.beginPath();
    ctx.ellipse(cx - 2, baseY - 36, 5, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (kind === 'acacia') {
    ctx.strokeStyle = '#6b4226';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(cx, baseY);
    ctx.lineTo(cx, baseY - 22);
    ctx.lineTo(cx - 10, baseY - 31);
    ctx.moveTo(cx, baseY - 20);
    ctx.lineTo(cx + 11, baseY - 30);
    ctx.stroke();
    ctx.fillStyle = '#4d7c0f';
    ctx.beginPath();
    ctx.ellipse(cx, baseY - 33, 21, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#84cc16';
    ctx.beginPath();
    ctx.ellipse(cx - 3, baseY - 35, 14, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (kind === 'oak') {
    ctx.fillStyle = '#5c3a21';
    ctx.fillRect(cx - 4, baseY - 22, 8, 22);
    ctx.fillStyle = '#15803d';
    ctx.beginPath();
    ctx.arc(cx - 10, baseY - 27, 12, 0, Math.PI * 2);
    ctx.arc(cx + 10, baseY - 27, 12, 0, Math.PI * 2);
    ctx.arc(cx, baseY - 37, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(cx - 4, baseY - 40, 7, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (kind === 'sapling') {
    ctx.fillStyle = '#78350f';
    ctx.fillRect(cx - 1.5, baseY - 14, 3, 14);
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.arc(cx - 3, baseY - 16, 5.5, 0, Math.PI * 2);
    ctx.arc(cx + 3, baseY - 17, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#86efac';
    ctx.beginPath();
    ctx.arc(cx - 1, baseY - 19, 3.2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (kind === 'medium') {
    ctx.fillStyle = '#6b3e1b';
    ctx.fillRect(cx - 2.5, baseY - 19, 5, 19);
    ctx.fillStyle = '#14532d';
    ctx.beginPath();
    ctx.arc(cx - 6, baseY - 21, 8.5, 0, Math.PI * 2);
    ctx.arc(cx + 6, baseY - 21, 8, 0, Math.PI * 2);
    ctx.arc(cx, baseY - 28, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.arc(cx - 4, baseY - 23, 7, 0, Math.PI * 2);
    ctx.arc(cx + 4, baseY - 23, 6.5, 0, Math.PI * 2);
    ctx.arc(cx, baseY - 30, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(cx - 3, baseY - 31, 4.5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (kind === 'palm') {
    ctx.strokeStyle = '#7c4a21';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, baseY);
    ctx.quadraticCurveTo(cx + 6, baseY - 22, cx - 2, baseY - 44);
    ctx.stroke();

    ctx.strokeStyle = '#a1622e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 1, baseY - 4);
    ctx.quadraticCurveTo(cx + 4, baseY - 22, cx - 3, baseY - 43);
    ctx.stroke();

    ctx.fillStyle = '#451a03';
    ctx.beginPath();
    ctx.arc(cx - 4, baseY - 42, 2.5, 0, Math.PI * 2);
    ctx.arc(cx + 1, baseY - 41, 2.5, 0, Math.PI * 2);
    ctx.fill();

    const fronds = [
      { dx: -26, dy: 12, color: '#15803d' },
      { dx: 26, dy: 12, color: '#15803d' },
      { dx: -20, dy: -8, color: '#22c55e' },
      { dx: 21, dy: -7, color: '#22c55e' },
      { dx: -9, dy: -16, color: '#4ade80' },
      { dx: 11, dy: -15, color: '#4ade80' },
    ];
    for (const f of fronds) {
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.moveTo(cx - 2, baseY - 45);
      ctx.quadraticCurveTo(cx + f.dx * 0.55, baseY - 54 + f.dy * 0.3, cx + f.dx, baseY - 42 + f.dy);
      ctx.quadraticCurveTo(cx + f.dx * 0.45, baseY - 45 + f.dy * 0.35, cx - 2, baseY - 43);
      ctx.closePath();
      ctx.fill();
    }
    return;
  }

  const trunkH = kind === 'mahogany' ? 30 : 21;
  const trunkW = kind === 'mahogany' ? 9 : 6.5;

  ctx.fillStyle = '#57331b';
  ctx.beginPath();
  ctx.moveTo(cx - trunkW * 0.9, baseY + 1);
  ctx.lineTo(cx - trunkW * 0.4, baseY - trunkH);
  ctx.lineTo(cx + trunkW * 0.4, baseY - trunkH);
  ctx.lineTo(cx + trunkW * 0.9, baseY + 1);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#85512c';
  ctx.fillRect(cx - trunkW * 0.35, baseY - trunkH, trunkW * 0.38, trunkH - 1);

  const deepColor = kind === 'mahogany' ? '#0f3d23' : '#14532d';
  const midColor = kind === 'mahogany' ? '#15803d' : kind === 'fruit' ? '#16a34a' : '#15803d';
  const hiColor = '#4ade80';
  const topY = baseY - trunkH;
  const scale = kind === 'mahogany' ? 1.24 : 1.0;

  const drawPuff = (px: number, py: number, r: number, col: string) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  };

  drawPuff(cx + 8 * scale, topY - 10 * scale, 13 * scale, deepColor);
  drawPuff(cx - 9 * scale, topY - 9 * scale, 13 * scale, deepColor);
  drawPuff(cx, topY - 19 * scale, 15 * scale, deepColor);

  drawPuff(cx - 8 * scale, topY - 13 * scale, 11 * scale, midColor);
  drawPuff(cx + 7 * scale, topY - 14 * scale, 10 * scale, midColor);
  drawPuff(cx - 1 * scale, topY - 22 * scale, 12.5 * scale, midColor);

  drawPuff(cx - 5 * scale, topY - 24 * scale, 8 * scale, hiColor);
  drawPuff(cx - 10 * scale, topY - 15 * scale, 5.5 * scale, hiColor);
  ctx.fillStyle = '#bbf7d0';
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(cx - 6 * scale, topY - 26 * scale, 3.8 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  if (kind === 'mahogany') {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(cx - 2, topY - 29, 2.2, 0, Math.PI * 2);
    ctx.arc(cx + 7, topY - 21, 2, 0, Math.PI * 2);
    ctx.arc(cx - 11, topY - 19, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'fruit') {
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.arc(cx - 7, topY - 12, 2.6, 0, Math.PI * 2);
    ctx.arc(cx + 6, topY - 14, 2.6, 0, Math.PI * 2);
    ctx.arc(cx + 1, topY - 22, 2.5, 0, Math.PI * 2);
    ctx.arc(cx - 2, topY - 8, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(cx - 8, topY - 13, 1.5, 1.5);
    ctx.fillRect(cx + 5, topY - 15, 1.5, 1.5);
  }
}

function drawBoulderSprite(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }): void {
  const cx = pos.x + 38;
  const by = pos.y + 74;

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx + 2, by, 17, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#475569';
  ctx.beginPath();
  ctx.moveTo(cx - 16, by - 2);
  ctx.lineTo(cx - 10, by - 22);
  ctx.lineTo(cx + 3, by - 25);
  ctx.lineTo(cx + 16, by - 6);
  ctx.lineTo(cx + 3, by + 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#94a3b8';
  ctx.beginPath();
  ctx.moveTo(cx - 16, by - 2);
  ctx.lineTo(cx - 10, by - 22);
  ctx.lineTo(cx + 3, by - 25);
  ctx.lineTo(cx - 1, by - 8);
  ctx.lineTo(cx - 11, by - 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#cbd5e1';
  ctx.beginPath();
  ctx.moveTo(cx - 9, by - 20);
  ctx.lineTo(cx + 3, by - 25);
  ctx.lineTo(cx + 6, by - 14);
  ctx.lineTo(cx - 4, by - 12);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#22c55e';
  ctx.fillRect(cx - 12, by - 5, 5, 3);
}

function drawDepositBadge(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  primary: string,
  dark: string,
  glint: string
): void {
  const cx = pos.x + 24;
  const cy = pos.y + 16;
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 5, 13, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy + 4);
  ctx.lineTo(cx - 5, cy - 8);
  ctx.lineTo(cx + 5, cy - 7);
  ctx.lineTo(cx + 12, cy + 4);
  ctx.lineTo(cx, cy + 8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = primary;
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy + 2);
  ctx.lineTo(cx - 5, cy - 8);
  ctx.lineTo(cx + 3, cy - 6);
  ctx.lineTo(cx, cy + 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = glint;
  ctx.fillRect(cx - 4, cy - 5, 3, 3);
  ctx.fillRect(cx + 3, cy - 2, 2.5, 2.5);
}

function drawConstructionFrame(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }): void {
  const cx = pos.x + 36;
  const by = pos.y + 52;

  ctx.fillStyle = '#785538';
  ctx.beginPath();
  ctx.moveTo(cx, by - 22);
  ctx.lineTo(cx + 26, by - 9);
  ctx.lineTo(cx, by + 4);
  ctx.lineTo(cx - 26, by - 9);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(cx - 16, by - 32, 32, 22);
  ctx.strokeStyle = '#d97706';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(cx - 16, by - 32);
  ctx.lineTo(cx + 16, by - 10);
  ctx.moveTo(cx + 16, by - 32);
  ctx.lineTo(cx - 16, by - 10);
  ctx.stroke();

  ctx.fillStyle = '#b45309';
  ctx.fillRect(cx - 18, by - 23, 36, 3);
}

function drawBuildingSprite(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  fw: number,
  fh: number,
  def: BuildingDef,
  tier: 1 | 2 | 3
): void {
  const halfTileW = TILE_WIDTH * 0.5;
  const halfTileH = TILE_HEIGHT * 0.5;

  const pBottom = { x: ox + fw * 0.5, y: oy + fh - 3 };
  const pTop = {
    x: pBottom.x - (def.width - def.height) * halfTileW,
    y: pBottom.y - (def.width + def.height) * halfTileH,
  };
  const pRight = { x: pTop.x + def.width * halfTileW, y: pTop.y + def.width * halfTileH };
  const pLeft = { x: pTop.x - def.height * halfTileW, y: pTop.y + def.height * halfTileH };

  ctx.fillStyle = 'rgba(4, 12, 8, 0.34)';
  ctx.beginPath();
  ctx.moveTo(pTop.x + 4, pTop.y + 3);
  ctx.lineTo(pRight.x + 5, pRight.y + 3);
  ctx.lineTo(pBottom.x + 4, pBottom.y + 3);
  ctx.lineTo(pLeft.x - 1, pLeft.y + 3);
  ctx.closePath();
  ctx.fill();

  const cx = (pTop.x + pBottom.x) * 0.5;
  const cy = (pTop.y + pBottom.y) * 0.5;

  if (def.category === 'agricultural' || def.id === 'village_park') {
    drawAgriculturalOrPark(ctx, pTop, pRight, pBottom, pLeft, cx, cy, def, tier);
    return;
  }

  drawIsoPlinth(ctx, pTop, pRight, pBottom, pLeft, 4 + (tier - 1), '#64748b', '#475569');

  if (def.id === 'leaf_hut') {
    drawLeafHut(ctx, cx, cy, tier);
    return;
  }
  if (def.id === 'windmill') {
    drawWindmill(ctx, cx, cy, def, tier);
    return;
  }
  if (def.id === 'wind_turbine') {
    drawWindTurbine(ctx, cx, cy, tier);
    return;
  }
  if (def.id === 'solar_array') {
    drawSolarPlant(ctx, pTop, pRight, pBottom, pLeft, def, tier);
    return;
  }
  if (def.id === 'water_well') {
    drawWaterWell(ctx, cx, cy, tier);
    return;
  }
  if (def.id === 'water_tower') {
    drawWaterTower(ctx, cx, cy, def, tier);
    return;
  }
  if (def.id === 'aqueduct_cistern') {
    drawAqueductCistern(ctx, pTop, pRight, pBottom, pLeft, cx, cy, def, tier);
    return;
  }
  if (def.id === 'water_treatment') {
    drawWaterTreatment(ctx, pTop, pRight, pBottom, pLeft, cx, cy, tier);
    return;
  }
  if (def.id === 'granary' || def.id === 'medium_granary' || def.id === 'large_granary') {
    drawGranarySilos(ctx, pTop, pRight, pBottom, pLeft, cx, cy, def, tier);
    return;
  }
  if (def.id === 'warehouse' || def.id === 'medium_warehouse' || def.id === 'large_warehouse') {
    drawWarehouseDepot(ctx, pTop, pRight, pBottom, pLeft, cx, cy, def, tier);
    return;
  }
  if (def.id === 'grand_monument') {
    drawGrandMonument(ctx, pTop, pRight, pBottom, pLeft, cx, cy, tier);
    return;
  }
  if (def.id === 'market_stall') {
    drawMarketStall(ctx, cx, cy, def, tier);
    return;
  }
  if (def.id === 'night_market') {
    drawNightMarket(ctx, pTop, pRight, pBottom, pLeft, cx, cy, def, tier);
    return;
  }
  if (def.id === 'festival_plaza') {
    drawFestivalPlaza(ctx, pTop, pRight, pBottom, pLeft, cx, cy, def, tier);
    return;
  }
  if (def.id === 'fountain_plaza') {
    drawFountainPlaza(ctx, pTop, pRight, pBottom, pLeft, cx, cy, tier);
    return;
  }
  if (def.id === 'botanical_garden') {
    drawBotanicalGarden(ctx, pTop, pRight, pBottom, pLeft, cx, cy, tier);
    return;
  }
  if (def.id === 'marble_quarry') {
    drawMarbleQuarry(ctx, pTop, pRight, pBottom, pLeft, cx, cy, tier);
    return;
  }
  if (
    def.id === 'stone_quarry' ||
    def.id === 'clay_pit' ||
    def.id === 'sand_quarry' ||
    def.id === 'iron_mine' ||
    def.id === 'copper_mine' ||
    def.id === 'coal_mine' ||
    def.id === 'gold_mine' ||
    def.id === 'silver_mine'
  ) {
    drawMineOrQuarry(ctx, pTop, pRight, pBottom, pLeft, cx, cy, def, tier);
    return;
  }
  if (
    def.id === 'fishing_pier' ||
    def.id === 'harbor_dock' ||
    def.id === 'fishing_port' ||
    def.id === 'international_shipping_port' ||
    def.id === 'container_freight_terminal' ||
    def.id === 'shipyard' ||
    def.id === 'shrimp_farm'
  ) {
    drawCoastalPort(ctx, pTop, pRight, pBottom, pLeft, cx, cy, def, tier);
    return;
  }
  if (def.isAutomatedTreePlantation) {
    drawPlantationFactoryHall(ctx, pTop, pRight, pBottom, pLeft, cx, cy, def, tier);
    return;
  }
  if (
    def.id === 'train_station' ||
    def.id === 'airport' ||
    def.id === 'cart_depot' ||
    def.subCategory === 'transit'
  ) {
    drawTransportHub(ctx, pTop, pRight, pBottom, pLeft, cx, cy, def, tier);
    return;
  }
  if (def.id === 'coal_power_plant' || def.id === 'nuclear_power_plant') {
    drawCoalPowerPlant(ctx, pTop, pRight, pBottom, pLeft, cx, cy, def, tier);
    return;
  }
  if (def.id === 'watchtower') {
    drawWatchtower(ctx, cx, cy, def, tier);
    return;
  }
  if (def.id === 'rubber_tapper') {
    drawRubberTapper(ctx, cx, cy, def, tier);
    return;
  }
  if (def.id === 'football_stadium' || def.id === 'sports_stadium') {
    drawStadiumComplex(ctx, pTop, pRight, pBottom, pLeft, cx, cy, def);
    return;
  }

  // Dedicated Large Multi-Block Industrial Complexes
  if (def.isLargeFactory) {
    drawLargeFactoryComplex(ctx, pTop, pRight, pBottom, pLeft, cx, cy, def, tier);
    return;
  }

  // Standard architectural buildings with distinct Tier 1 / Tier 2 / Tier 3 expansion
  const inset = 0.84;
  const lift = 4 + (tier - 1);
  const shrink = (pt: { x: number; y: number }, scale = inset, yOff = lift) => ({
    x: cx + (pt.x - cx) * scale,
    y: cy + (pt.y - cy) * scale - yOff,
  });

  const bTop = shrink(pTop);
  const bRight = shrink(pRight);
  const bBottom = shrink(pBottom);
  const bLeft = shrink(pLeft);

  const isSkyscraper = def.subCategory === 'skyscraper' || Boolean(def.corporateSector);
  const baseH = isSkyscraper
    ? def.id === 'supertall_skyscraper' || def.id === 'luxury_condominium_tower'
      ? 72
      : def.corporateSector
        ? 44
        : 54
    : def.isMainHq
      ? 36
      : def.id === 'modern_apartment'
        ? 42
        : def.id === 'brick_townhouse' ||
            def.id === 'hospital' ||
            def.id === 'town_hall' ||
            def.id === 'luxury_atelier' ||
            def.id === 'civic_theater' ||
            def.isSubOffice ||
            def.subCategory === 'gov_civic'
          ? 28
          : def.category === 'industrial' || def.category === 'energy' || def.category === 'educational'
            ? 24
            : 19;

  const bHeight = baseH + (tier - 1) * 10;

  drawLitIsoWalls(ctx, bTop, bRight, bBottom, bLeft, bHeight, def.wallColor);
  drawWallFacadeDetails(ctx, bLeft, bBottom, bRight, bHeight, def, tier);

  // Tier 2 & 3 Cornice Belt & Accent Trim
  if (tier >= 2) {
    ctx.strokeStyle = tier === 3 ? '#fbbf24' : shadeHex(def.accentColor, 20);
    ctx.lineWidth = tier === 3 ? 2 : 1.4;
    const beltY = baseH * 0.65;
    ctx.beginPath();
    ctx.moveTo(bLeft.x, bLeft.y - beltY);
    ctx.lineTo(bBottom.x, bBottom.y - beltY);
    ctx.lineTo(bRight.x, bRight.y - beltY);
    ctx.stroke();
  }

  if (def.id === 'timber_cottage' || def.id === 'brick_townhouse') {
    ctx.strokeStyle = def.id === 'timber_cottage' ? '#78350f' : '#e2e8f0';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(bLeft.x, bLeft.y - bHeight + 1);
    ctx.lineTo(bBottom.x, bBottom.y - bHeight + 1);
    ctx.lineTo(bRight.x, bRight.y - bHeight + 1);
    ctx.stroke();
  }

  if (
    def.category === 'residential' ||
    def.id === 'bakery' ||
    def.id === 'gatherer_hut' ||
    def.id === 'coffee_roastery'
  ) {
    if (def.id === 'modern_apartment') {
      drawFlatTerraceRoof(ctx, bTop, bRight, bBottom, bLeft, bHeight, def, tier);
    } else {
      drawGabledOverhangRoof(ctx, bTop, bRight, bBottom, bLeft, bHeight, def, tier);
      if (def.id === 'timber_cottage' || def.id === 'brick_townhouse' || def.id === 'bakery') {
        const chY = cy - lift - bHeight - 10;
        ctx.fillStyle = def.id === 'bakery' ? '#9a3412' : '#64748b';
        ctx.fillRect(cx + 6, chY - 9, 5, 11);
        ctx.fillStyle = '#cbd5e1';
        ctx.fillRect(cx + 5, chY - 10, 7, 2);
        if (tier >= 2) {
          ctx.fillRect(cx - 10, chY - 6, 4, 8);
        }
      }
      if (def.id === 'bakery') {
        ctx.fillStyle = '#c2410c';
        ctx.beginPath();
        ctx.arc(bBottom.x - 10, bBottom.y - 3, 5.5, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#fb923c';
        ctx.fillRect(bBottom.x - 12, bBottom.y - 6, 4, 3);
      }
    }
  } else if (def.id === 'herbalist_clinic' || def.id === 'hospital' || def.id === 'apothecary') {
    drawFlatTerraceRoof(ctx, bTop, bRight, bBottom, bLeft, bHeight, def, tier);
    const rx = cx;
    const ry = cy - lift - bHeight;
    if (def.id === 'hospital' || tier >= 2) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(rx, ry, 11, 5.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = def.id === 'apothecary' ? '#10b981' : '#ef4444';
    ctx.fillRect(rx - 2.5, ry - 7, 5, 14);
    ctx.fillRect(rx - 7, ry - 2.5, 14, 5);
  } else if (def.id === 'fire_station') {
    drawGabledOverhangRoof(ctx, bTop, bRight, bBottom, bLeft, bHeight, def, tier);
    const bayX = (bLeft.x + bBottom.x) * 0.5;
    const bayY = (bLeft.y + bBottom.y) * 0.5;
    ctx.fillStyle = '#991b1b';
    ctx.beginPath();
    ctx.arc(bayX, bayY - 7, 5.5, Math.PI, 0);
    ctx.lineTo(bayX + 5.5, bayY);
    ctx.lineTo(bayX - 5.5, bayY);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(cx - 5, cy - lift - bHeight - 17, 10, 13);
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(cx, cy - lift - bHeight - 10, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(cx, cy - lift - bHeight - 19, 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (
    def.id === 'university' ||
    def.id === 'library' ||
    def.id === 'observatory' ||
    def.id === 'royal_archive'
  ) {
    drawFlatTerraceRoof(ctx, bTop, bRight, bBottom, bLeft, bHeight, def, tier);
    drawCivicColumns(ctx, bLeft, bBottom, bHeight);
    const rx = cx;
    const ry = cy - lift - bHeight - 2;
    ctx.fillStyle =
      def.id === 'observatory'
        ? '#e2e8f0'
        : def.id === 'royal_archive'
          ? '#fbbf24'
          : def.id === 'university'
            ? '#38bdf8'
            : def.accentColor;
    ctx.beginPath();
    ctx.arc(rx, ry, def.id === 'observatory' || def.id === 'royal_archive' ? 12 : 10, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
  } else if (def.id === 'town_hall' || def.id === 'civic_theater' || def.isMainHq || def.isSubOffice) {
    drawGabledOverhangRoof(ctx, bTop, bRight, bBottom, bLeft, bHeight, def, tier);
    drawCivicColumns(ctx, bLeft, bBottom, bHeight);
    ctx.fillStyle = shadeHex(def.wallColor, 10);
    ctx.fillRect(cx - 5, cy - lift - bHeight - 22, 10, 14);
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(cx, cy - lift - bHeight - 15, 2.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = def.accentColor;
    ctx.beginPath();
    ctx.moveTo(cx, cy - lift - bHeight - 33);
    ctx.lineTo(cx + 8, cy - lift - bHeight - 22);
    ctx.lineTo(cx - 8, cy - lift - bHeight - 22);
    ctx.closePath();
    ctx.fill();
  } else if (
    def.category === 'industrial' ||
    def.id === 'brick_kiln' ||
    def.id === 'mint_foundry' ||
    def.id === 'silver_smelter' ||
    def.id === 'pottery_workshop'
  ) {
    drawFactoryRooftopAndGear(ctx, bTop, bRight, bBottom, bLeft, cx, cy - lift, bHeight, def, tier);
  } else {
    drawPitchedHipRoof(ctx, bTop, bRight, bBottom, bLeft, bHeight, def.roofColor, def.accentColor);
    if (tier >= 2) {
      drawSmokestack(ctx, cx + 8, cy - lift - bHeight - 2, 12 + tier * 3, def.accentColor);
    }
    if (def.id === 'lumber_mill') {
      const wx = bBottom.x - 10;
      const wy = bBottom.y - 9;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(wx, wy, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Tier 3 Golden Rooftop Crest / Beacon
  if (tier >= 3) {
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(cx, cy - lift - bHeight - 14, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }

  if (def.id === 'lumber_mill') {
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(bBottom.x - 10, bBottom.y - 2, 3, 0, Math.PI * 2);
    ctx.arc(bBottom.x - 6, bBottom.y - 2, 3, 0, Math.PI * 2);
    ctx.arc(bBottom.x - 8, bBottom.y - 5, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawLargeFactoryComplex(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  cx: number,
  cy: number,
  def: BuildingDef,
  tier: 1 | 2 | 3
): void {
  const shrink = (pt: { x: number; y: number }, s = 0.88, lift = 5) => ({
    x: cx + (pt.x - cx) * s,
    y: cy + (pt.y - cy) * s - lift,
  });

  // Main industrial plant hall
  const bTop = shrink(pTop);
  const bRight = shrink(pRight);
  const bBottom = shrink(pBottom);
  const bLeft = shrink(pLeft);
  const hallH = 26 + (tier - 1) * 12;

  drawLitIsoWalls(ctx, bTop, bRight, bBottom, bLeft, hallH, def.wallColor);
  drawWallFacadeDetails(ctx, bLeft, bBottom, bRight, hallH, def, tier);

  // Loading bay shutters on front wall
  const bayCount = Math.max(2, Math.min(4, def.width));
  for (let i = 1; i <= bayCount; i++) {
    const t = i / (bayCount + 1);
    const bx = bLeft.x + (bBottom.x - bLeft.x) * t;
    const by = bLeft.y + (bBottom.y - bLeft.y) * t;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(bx - 5, by - 11, 10, 11);
    ctx.fillStyle = def.accentColor;
    ctx.fillRect(bx - 5, by - 12, 10, 2);
  }

  if (def.id === 'advanced_agro_greenhouse') {
    // Translucent glasshouse conservatory roof with glowing hydroponic bays
    ctx.fillStyle = 'rgba(125, 211, 252, 0.55)';
    ctx.strokeStyle = '#e0f2fe';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(bTop.x, bTop.y - hallH);
    ctx.lineTo(bRight.x, bRight.y - hallH);
    ctx.lineTo(bBottom.x, bBottom.y - hallH);
    ctx.lineTo(bLeft.x, bLeft.y - hallH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Hydroponic ridge ribs
    for (let r = 0; r <= tier; r++) {
      const ry = cy - hallH - 8 - r * 5;
      ctx.fillStyle = r === tier ? '#4ade80' : '#bae6fd';
      ctx.beginPath();
      ctx.ellipse(cx, ry, 28 - r * 5, 11 - r * 2, 0, Math.PI, 0);
      ctx.fill();
    }
    return;
  }

  // Sawtooth industrial roof + stepped upper Tier 2 / Tier 3 wing
  drawFlatTerraceRoof(ctx, bTop, bRight, bBottom, bLeft, hallH, def, tier);

  if (tier >= 2) {
    const uTop = shrink(pTop, 0.56, hallH + 5);
    const uRight = shrink(pRight, 0.56, hallH + 5);
    const uBottom = shrink(pBottom, 0.56, hallH + 5);
    const uLeft = shrink(pLeft, 0.56, hallH + 5);
    drawLitIsoWalls(ctx, uTop, uRight, uBottom, uLeft, 14, shadeHex(def.wallColor, 14));
    drawFlatTerraceRoof(ctx, uTop, uRight, uBottom, uLeft, 14, def, tier);
  }

  const stackBaseY = cy - hallH - (tier >= 2 ? 18 : 4);
  const stackCount = tier === 1 ? 2 : tier === 2 ? 3 : 4;
  for (let i = 0; i < stackCount; i++) {
    const offset = (i - (stackCount - 1) / 2) * 14;
    drawSmokestack(ctx, cx + offset, stackBaseY + (i % 2) * 4, 20 + tier * 5, def.accentColor);
  }

  if (tier >= 3) {
    // Overhead yellow industrial gantry crane arm
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(cx - 24, stackBaseY - 12);
    ctx.lineTo(cx + 24, stackBaseY - 12);
    ctx.moveTo(cx + 16, stackBaseY - 12);
    ctx.lineTo(cx + 16, stackBaseY + 6);
    ctx.stroke();
  }
}

function drawCivicColumns(
  ctx: CanvasRenderingContext2D,
  bLeft: { x: number; y: number },
  bBottom: { x: number; y: number },
  bHeight: number
): void {
  ctx.fillStyle = '#f8fafc';
  for (const t of [0.22, 0.42, 0.62, 0.8]) {
    const px = bLeft.x + (bBottom.x - bLeft.x) * t;
    const py = bLeft.y + (bBottom.y - bLeft.y) * t;
    ctx.fillRect(px - 1.2, py - bHeight + 3, 2.4, bHeight - 3);
  }
}

function drawFactoryRooftopAndGear(
  ctx: CanvasRenderingContext2D,
  bTop: { x: number; y: number },
  bRight: { x: number; y: number },
  bBottom: { x: number; y: number },
  bLeft: { x: number; y: number },
  cx: number,
  baseCy: number,
  bHeight: number,
  def: BuildingDef,
  tier: 1 | 2 | 3
): void {
  drawFlatTerraceRoof(ctx, bTop, bRight, bBottom, bLeft, bHeight, def, tier);
  const stackY = baseCy - bHeight;

  if (def.id === 'machine_factory' || def.id === 'electronics_plant' || def.id === 'steelworks' || tier >= 2) {
    ctx.fillStyle = def.id === 'electronics_plant' ? '#38bdf8' : '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(cx - 14, stackY + 2);
    ctx.lineTo(cx - 6, stackY - 7);
    ctx.lineTo(cx + 12, stackY - 2);
    ctx.lineTo(cx + 4, stackY + 5);
    ctx.closePath();
    ctx.fill();
  }

  drawSmokestack(ctx, cx - 8, stackY, 18 + tier * 4, def.accentColor);
  if (def.width >= 2 || tier >= 2) {
    drawSmokestack(ctx, cx + 9, stackY + 3, 22 + tier * 4, def.accentColor);
  }
  if (tier >= 3) {
    drawSmokestack(ctx, cx + 1, stackY - 2, 28, '#fde047');
  }
}

function drawMineOrQuarry(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  cx: number,
  cy: number,
  def: BuildingDef,
  tier: 1 | 2 | 3
): void {
  const isPit = def.id === 'clay_pit' || def.id === 'sand_quarry' || def.id === 'stone_quarry';
  drawIsoPlinth(
    ctx,
    pTop,
    pRight,
    pBottom,
    pLeft,
    4 + (tier - 1),
    def.id === 'sand_quarry' ? '#fde68a' : def.id === 'clay_pit' ? '#b45309' : '#64748b',
    '#475569'
  );

  ctx.fillStyle = def.id === 'sand_quarry' ? '#d97706' : def.id === 'clay_pit' ? '#7c2d12' : '#1e293b';
  ctx.beginPath();
  ctx.ellipse(cx - 3, cy - 3, 18, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#cbd5e1';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy - 2);
  ctx.lineTo(cx + 15, cy + 5);
  ctx.moveTo(cx - 1, cy - 4);
  ctx.lineTo(cx + 19, cy + 2);
  ctx.stroke();

  if (isPit) {
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(cx + 8, cy);
    ctx.lineTo(cx + 8, cy - 24 - tier * 5);
    ctx.lineTo(cx - 7, cy - 18 - tier * 3);
    ctx.stroke();
    ctx.fillStyle = def.accentColor;
    ctx.fillRect(cx - 12, cy - 17, 9, 6);
  } else {
    ctx.strokeStyle = def.id === 'gold_mine' ? '#fbbf24' : '#94a3b8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx - 11, cy - 2);
    ctx.lineTo(cx - 1, cy - 32 - tier * 5);
    ctx.lineTo(cx + 9, cy - 2);
    ctx.stroke();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(cx - 1, cy - 28 - tier * 4, 4.5, 0, Math.PI * 2);
    ctx.stroke();
    drawSmallIsoBarn(ctx, cx - 15, cy - 4, def.wallColor, def.roofColor);
    if (tier >= 2) {
      drawSmallIsoBarn(ctx, cx + 14, cy - 5, def.wallColor, def.accentColor);
    }
  }
}

function drawCoastalPort(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  cx: number,
  cy: number,
  def: BuildingDef,
  tier: 1 | 2 | 3
): void {
  drawIsoPlinth(ctx, pTop, pRight, pBottom, pLeft, 4, '#92400e', '#78350f');
  if (def.id === 'fishing_pier') {
    ctx.fillStyle = '#b45309';
    ctx.fillRect(cx - 14, cy - 8, 28, 8);
    drawSmallIsoBarn(ctx, cx - 6, cy - 9, def.wallColor, def.roofColor);
    if (tier >= 2) {
      drawSmallIsoBarn(ctx, cx + 8, cy - 11, def.wallColor, def.accentColor);
    }
  } else {
    drawSmallIsoBarn(ctx, cx - 12, cy - 6, def.wallColor, def.roofColor);
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(cx + 10, cy);
    ctx.lineTo(cx + 10, cy - 30 - tier * 6);
    ctx.lineTo(cx + 26, cy - 25 - tier * 5);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(cx - 2, cy - 6, 10, 6);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(cx + 9, cy - 6, 10, 6);
  }
}

function drawPlantationFactoryHall(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  cx: number,
  cy: number,
  def: BuildingDef,
  tier: 1 | 2 | 3
): void {
  const lerp = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });
  const shrink = (pt: { x: number; y: number }, s = 0.88, lift = 5) => ({
    x: cx + (pt.x - cx) * s,
    y: cy + (pt.y - cy) * s - lift,
  });

  // Main 10x20 automated timber processing hall
  const bTop = shrink(pTop, 0.84, 5);
  const bRight = shrink(pRight, 0.84, 5);
  const bBottom = shrink(pBottom, 0.84, 5);
  const bLeft = shrink(pLeft, 0.84, 5);
  const hallH = 38 + (tier - 1) * 10;

  drawLitIsoWalls(ctx, bTop, bRight, bBottom, bLeft, hallH, def.wallColor);
  drawWallFacadeDetails(ctx, bLeft, bBottom, bRight, hallH, def, tier);

  // Forest-green & timber roof deck with solar skylight arrays
  drawFlatTerraceRoof(ctx, bTop, bRight, bBottom, bLeft, hallH, def, tier);

  // Twin greenhouse / nursery bays along the roof
  const rMidA = lerp(bTop, bBottom, 0.36);
  const rMidB = lerp(bTop, bBottom, 0.64);
  for (const pt of [rMidA, rMidB]) {
    ctx.fillStyle = '#15803d';
    ctx.strokeStyle = '#86efac';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(pt.x, pt.y - hallH - 2, 42, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Loading bay roller doors facing perimeter & plantation yard
  for (let i = 1; i <= 5; i++) {
    const t = i / 6;
    const bx = bLeft.x + (bBottom.x - bLeft.x) * t;
    const by = bLeft.y + (bBottom.y - bLeft.y) * t;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(bx - 7, by - 14, 14, 14);
    ctx.fillStyle = '#84cc16';
    ctx.fillRect(bx - 7, by - 16, 14, 3);
  }

  // Stacked timber log yard beside the loading dock
  for (let s = 0; s < 4; s++) {
    const lx = bBottom.x - 30 - s * 22;
    const ly = bBottom.y - 6 - s * 10;
    ctx.fillStyle = '#78350f';
    ctx.fillRect(lx - 10, ly - 8, 20, 9);
    ctx.fillStyle = '#d97706';
    ctx.beginPath();
    ctx.arc(lx - 10, ly - 4, 3.5, 0, Math.PI * 2);
    ctx.arc(lx - 4, ly - 4, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Yellow automated gantry crane beam over log intake
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(cx - 48, cy - hallH - 22);
  ctx.lineTo(cx + 48, cy - hallH - 22);
  ctx.moveTo(cx - 32, cy - hallH - 22);
  ctx.lineTo(cx - 32, cy - hallH + 4);
  ctx.moveTo(cx + 32, cy - hallH - 22);
  ctx.lineTo(cx + 32, cy - hallH + 4);
  ctx.stroke();

  // Eco-biomass exhaust stack
  drawSmokestack(ctx, bTop.x + 28, bTop.y - hallH + 14, 24, '#84cc16');
}

function drawTransportHub(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  cx: number,
  cy: number,
  def: BuildingDef,
  tier: 1 | 2 | 3
): void {
  drawIsoPlinth(ctx, pTop, pRight, pBottom, pLeft, 4, '#64748b', '#475569');
  if (def.id === 'airport') {
    ctx.fillStyle = '#334155';
    ctx.fillRect(cx - 28, cy - 4, 56, 8);
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(cx - 10, cy - 8, 16, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(cx + 12, cy - 34 - tier * 6, 8, 26 + tier * 6);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(cx + 9, cy - 40 - tier * 6, 14, 7);
  } else if (def.id === 'train_station') {
    drawLitIsoWalls(ctx, pTop, pRight, pBottom, pLeft, 16 + (tier - 1) * 6, def.wallColor);
    ctx.fillStyle = def.roofColor;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 18 - (tier - 1) * 6, 22, 11, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(cx, cy - 26 - (tier - 1) * 6, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    drawLitIsoWalls(ctx, pTop, pRight, pBottom, pLeft, 14 + (tier - 1) * 6, def.wallColor);
    drawGabledOverhangRoof(ctx, pTop, pRight, pBottom, pLeft, 14 + (tier - 1) * 6, def, tier);
    ctx.fillStyle = '#d97706';
    ctx.fillRect(cx - 6, cy - 7, 12, 6);
  }
}

function drawCoalPowerPlant(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  cx: number,
  cy: number,
  def: BuildingDef,
  tier: 1 | 2 | 3
): void {
  drawIsoPlinth(ctx, pTop, pRight, pBottom, pLeft, 4, '#475569', '#334155');
  drawLitIsoWalls(ctx, pTop, pRight, pBottom, pLeft, 16 + (tier - 1) * 6, def.wallColor);
  const towers = tier >= 2 ? [-14, 0, 14] : [-12, 10];
  for (const dx of towers) {
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(cx + dx - 8, cy - 14);
    ctx.quadraticCurveTo(cx + dx - 5, cy - 30 - tier * 4, cx + dx - 6, cy - 42 - tier * 5);
    ctx.lineTo(cx + dx + 6, cy - 42 - tier * 5);
    ctx.quadraticCurveTo(cx + dx + 5, cy - 30 - tier * 4, cx + dx + 8, cy - 14);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(cx + dx - 6, cy - 41 - tier * 5, 12, 3);
  }
}

function drawWaterTreatment(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  cx: number,
  cy: number,
  tier: 1 | 2 | 3
): void {
  drawIsoPlinth(ctx, pTop, pRight, pBottom, pLeft, 4 + (tier - 1), '#e2e8f0', '#94a3b8');
  for (const dx of [-12, 12]) {
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.ellipse(cx + dx, cy - 6, 12, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.ellipse(cx + dx, cy - 7, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (tier >= 2) {
    drawSmallIsoBarn(ctx, cx, cy - 16, '#cbd5e1', '#0284c7');
  }
}

function drawWatchtower(ctx: CanvasRenderingContext2D, cx: number, cy: number, def: BuildingDef, tier: 1 | 2 | 3): void {
  const h = 34 + (tier - 1) * 10;
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(cx - 8, cy - h - 2, 16, h);
  ctx.fillStyle = '#64748b';
  ctx.fillRect(cx, cy - h - 2, 8, h);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(cx - 10, cy - h - 8, 20, 6);
  ctx.fillStyle = def.roofColor;
  ctx.fillRect(cx - 6, cy - h - 15, 12, 7);
  ctx.fillStyle = '#f97316';
  ctx.beginPath();
  ctx.arc(cx, cy - h - 18, 3.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawIsoPlinth(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  h: number,
  topCol: string,
  sideCol: string
): void {
  ctx.fillStyle = sideCol;
  ctx.beginPath();
  ctx.moveTo(pLeft.x, pLeft.y);
  ctx.lineTo(pBottom.x, pBottom.y);
  ctx.lineTo(pBottom.x, pBottom.y - h);
  ctx.lineTo(pLeft.x, pLeft.y - h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = shadeHex(sideCol, -18);
  ctx.beginPath();
  ctx.moveTo(pBottom.x, pBottom.y);
  ctx.lineTo(pRight.x, pRight.y);
  ctx.lineTo(pRight.x, pRight.y - h);
  ctx.lineTo(pBottom.x, pBottom.y - h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = topCol;
  ctx.beginPath();
  ctx.moveTo(pTop.x, pTop.y - h);
  ctx.lineTo(pRight.x, pRight.y - h);
  ctx.lineTo(pBottom.x, pBottom.y - h);
  ctx.lineTo(pLeft.x, pLeft.y - h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawLitIsoWalls(
  ctx: CanvasRenderingContext2D,
  bTop: { x: number; y: number },
  bRight: { x: number; y: number },
  bBottom: { x: number; y: number },
  bLeft: { x: number; y: number },
  h: number,
  wallColor: string
): void {
  const gL = ctx.createLinearGradient(0, bLeft.y - h, 0, bBottom.y);
  gL.addColorStop(0, shadeHex(wallColor, 10));
  gL.addColorStop(1, shadeHex(wallColor, -10));
  ctx.fillStyle = gL;
  ctx.beginPath();
  ctx.moveTo(bLeft.x, bLeft.y);
  ctx.lineTo(bBottom.x, bBottom.y);
  ctx.lineTo(bBottom.x, bBottom.y - h);
  ctx.lineTo(bLeft.x, bLeft.y - h);
  ctx.closePath();
  ctx.fill();

  const gR = ctx.createLinearGradient(0, bBottom.y - h, 0, bRight.y);
  gR.addColorStop(0, shadeHex(wallColor, -18));
  gR.addColorStop(1, shadeHex(wallColor, -34));
  ctx.fillStyle = gR;
  ctx.beginPath();
  ctx.moveTo(bBottom.x, bBottom.y);
  ctx.lineTo(bRight.x, bRight.y);
  ctx.lineTo(bRight.x, bRight.y - h);
  ctx.lineTo(bBottom.x, bBottom.y - h);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bBottom.x, bBottom.y);
  ctx.lineTo(bBottom.x, bBottom.y - h);
  ctx.stroke();

  void bTop;
}

function drawWallFacadeDetails(
  ctx: CanvasRenderingContext2D,
  bLeft: { x: number; y: number },
  bBottom: { x: number; y: number },
  bRight: { x: number; y: number },
  bHeight: number,
  def: BuildingDef,
  tier: 1 | 2 | 3
): void {
  const floors = Math.min(4, (bHeight >= 36 ? 3 : bHeight >= 25 ? 2 : 1) + (tier > 1 ? 1 : 0));
  for (let f = 0; f < floors; f++) {
    const fy = bHeight * ((f + 0.6) / (floors + 0.3));
    const colsL = Math.max(1, Math.min(4, def.height));
    const colsR = Math.max(1, Math.min(4, def.width));
    for (let c = 0; c < colsL; c++) {
      const t = (c + 1) / (colsL + 1);
      const wxL = bLeft.x + (bBottom.x - bLeft.x) * t;
      const wyL = bLeft.y + (bBottom.y - bLeft.y) * t - fy;
      ctx.fillStyle = def.id === 'modern_apartment' ? '#bae6fd' : '#fef08a';
      ctx.fillRect(wxL - 2.5, wyL - 3, 5, 5);
      ctx.strokeStyle = 'rgba(15,23,42,0.45)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(wxL - 2.5, wyL - 3, 5, 5);
    }
    for (let c = 0; c < colsR; c++) {
      const t = (c + 1) / (colsR + 1);
      const wxR = bBottom.x + (bRight.x - bBottom.x) * t;
      const wyR = bBottom.y + (bRight.y - bBottom.y) * t - fy;
      ctx.fillStyle = def.id === 'modern_apartment' ? '#7dd3fc' : '#fde047';
      ctx.fillRect(wxR - 2.5, wyR - 3, 5, 5);
      ctx.strokeStyle = 'rgba(15,23,42,0.45)';
      ctx.lineWidth = 0.8;
      ctx.strokeRect(wxR - 2.5, wyR - 3, 5, 5);
    }
  }

  const dx = (bLeft.x + bBottom.x) * 0.5;
  const dy = (bLeft.y + bBottom.y) * 0.5;
  ctx.fillStyle = '#451a03';
  ctx.fillRect(dx - 3, dy - 9, 6, 9);
}

function drawGabledOverhangRoof(
  ctx: CanvasRenderingContext2D,
  bTop: { x: number; y: number },
  bRight: { x: number; y: number },
  bBottom: { x: number; y: number },
  bLeft: { x: number; y: number },
  h: number,
  def: BuildingDef,
  tier = 1
): void {
  const cx = (bTop.x + bBottom.x) * 0.5;
  const cy = (bTop.y + bBottom.y) * 0.5 - h;
  const expand = (pt: { x: number; y: number }) => ({
    x: cx + (pt.x - cx) * 1.14,
    y: cy + (pt.y - (bTop.y + bBottom.y) * 0.5) * 1.14,
  });
  const rTop = expand(bTop);
  const rRight = expand(bRight);
  const rBottom = expand(bBottom);
  const rLeft = expand(bLeft);
  const peakLift = 11 + (tier - 1) * 3;
  const ridgeA = { x: (rTop.x + rLeft.x) * 0.5, y: (rTop.y + rLeft.y) * 0.5 - peakLift };
  const ridgeB = { x: (rRight.x + rBottom.x) * 0.5, y: (rRight.y + rBottom.y) * 0.5 - peakLift };

  ctx.fillStyle = shadeHex(def.roofColor, 10);
  ctx.beginPath();
  ctx.moveTo(rLeft.x, rLeft.y + 2);
  ctx.lineTo(rBottom.x, rBottom.y + 2);
  ctx.lineTo(ridgeB.x, ridgeB.y);
  ctx.lineTo(ridgeA.x, ridgeA.y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = shadeHex(def.roofColor, -18);
  ctx.beginPath();
  ctx.moveTo(rTop.x, rTop.y + 2);
  ctx.lineTo(rRight.x, rRight.y + 2);
  ctx.lineTo(ridgeB.x, ridgeB.y);
  ctx.lineTo(ridgeA.x, ridgeA.y);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = shadeHex(def.wallColor, -6);
  ctx.beginPath();
  ctx.moveTo(rBottom.x, rBottom.y + 2);
  ctx.lineTo(rRight.x, rRight.y + 2);
  ctx.lineTo(ridgeB.x, ridgeB.y);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = tier >= 2 ? '#fde047' : shadeHex(def.accentColor, 20);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(ridgeA.x, ridgeA.y);
  ctx.lineTo(ridgeB.x, ridgeB.y);
  ctx.stroke();
}

function drawPitchedHipRoof(
  ctx: CanvasRenderingContext2D,
  bTop: { x: number; y: number },
  bRight: { x: number; y: number },
  bBottom: { x: number; y: number },
  bLeft: { x: number; y: number },
  h: number,
  roofColor: string,
  accent: string
): void {
  const cx = (bTop.x + bBottom.x) * 0.5;
  const cy = (bTop.y + bBottom.y) * 0.5 - h;
  const peakY = cy - 11;

  const slopes = [
    { a: bTop, b: bLeft, col: shadeHex(roofColor, 14) },
    { a: bLeft, b: bBottom, col: shadeHex(roofColor, 4) },
    { a: bBottom, b: bRight, col: shadeHex(roofColor, -22) },
    { a: bRight, b: bTop, col: shadeHex(roofColor, -10) },
  ];
  for (const s of slopes) {
    ctx.fillStyle = s.col;
    ctx.beginPath();
    ctx.moveTo(s.a.x, s.a.y - h);
    ctx.lineTo(s.b.x, s.b.y - h);
    ctx.lineTo(cx, peakY);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(cx, peakY, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawFlatTerraceRoof(
  ctx: CanvasRenderingContext2D,
  bTop: { x: number; y: number },
  bRight: { x: number; y: number },
  bBottom: { x: number; y: number },
  bLeft: { x: number; y: number },
  h: number,
  def: BuildingDef,
  tier = 1
): void {
  ctx.fillStyle = def.roofColor;
  ctx.beginPath();
  ctx.moveTo(bTop.x, bTop.y - h);
  ctx.lineTo(bRight.x, bRight.y - h);
  ctx.lineTo(bBottom.x, bBottom.y - h);
  ctx.lineTo(bLeft.x, bLeft.y - h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = tier >= 3 ? '#fbbf24' : def.accentColor;
  ctx.lineWidth = tier >= 2 ? 2.2 : 1.8;
  ctx.stroke();

  if (def.id === 'modern_apartment' || tier >= 2) {
    const cx = (bTop.x + bBottom.x) * 0.5;
    const cy = (bTop.y + bBottom.y) * 0.5 - h;
    if (def.id === 'modern_apartment') {
      ctx.fillStyle = '#16a34a';
      ctx.beginPath();
      ctx.ellipse(cx - 6, cy, 8, 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(cx + 4, cy - 6, 8, 6);
  }
}

function drawSmokestack(ctx: CanvasRenderingContext2D, x: number, baseY: number, h: number, band: string): void {
  ctx.fillStyle = '#334155';
  ctx.beginPath();
  ctx.moveTo(x - 4, baseY);
  ctx.lineTo(x + 4, baseY);
  ctx.lineTo(x + 2.8, baseY - h);
  ctx.lineTo(x - 2.8, baseY - h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = band;
  ctx.fillRect(x - 3.2, baseY - h + 2, 6.4, 3);
  ctx.fillStyle = '#e2e8f0';
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.arc(x + 2, baseY - h - 4, 3.2, 0, Math.PI * 2);
  ctx.arc(x + 5, baseY - h - 8, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawLeafHut(ctx: CanvasRenderingContext2D, cx: number, cy: number, tier: 1 | 2 | 3): void {
  const hExtra = (tier - 1) * 8;
  ctx.fillStyle = '#78350f';
  ctx.fillRect(cx - 12, cy - 10, 3, 12);
  ctx.fillRect(cx + 9, cy - 10, 3, 12);
  ctx.fillStyle = '#a16207';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 11, 14, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#92400e';
  ctx.fillRect(cx - 13, cy - 22 - hExtra, 26, 12 + hExtra);
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(cx - 4, cy - 17, 6, 8);
  if (tier >= 2) {
    ctx.fillRect(cx + 5, cy - 24, 4, 4);
  }

  ctx.fillStyle = '#3f6212';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 42 - hExtra);
  ctx.lineTo(cx + 21, cy - 19 - hExtra);
  ctx.quadraticCurveTo(cx, cy - 12 - hExtra, cx - 21, cy - 19 - hExtra);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#65a30d';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 42 - hExtra);
  ctx.lineTo(cx + 4, cy - 18 - hExtra);
  ctx.lineTo(cx - 21, cy - 19 - hExtra);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = tier >= 3 ? '#fde047' : '#a3e635';
  ctx.beginPath();
  ctx.arc(cx, cy - 42 - hExtra, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawWindmill(ctx: CanvasRenderingContext2D, cx: number, cy: number, def: BuildingDef, tier: 1 | 2 | 3): void {
  const h = 30 + (tier - 1) * 10;
  ctx.fillStyle = '#d6d3d1';
  ctx.beginPath();
  ctx.moveTo(cx - 13, cy + 2);
  ctx.lineTo(cx + 13, cy + 2);
  ctx.lineTo(cx + 8, cy - h);
  ctx.lineTo(cx - 8, cy - h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = def.roofColor;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h - 13);
  ctx.lineTo(cx + 11, cy - h + 1);
  ctx.lineTo(cx - 11, cy - h + 1);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 16, cy - h - 12);
  ctx.lineTo(cx + 16, cy - h + 16);
  ctx.moveTo(cx + 16, cy - h - 12);
  ctx.lineTo(cx - 16, cy - h + 16);
  ctx.stroke();

  ctx.fillStyle = 'rgba(254, 249, 195, 0.9)';
  ctx.fillRect(cx - 16, cy - h - 11, 7, 5);
  ctx.fillRect(cx + 9, cy - h - 11, 7, 5);
}

function drawWindTurbine(ctx: CanvasRenderingContext2D, cx: number, cy: number, tier: 1 | 2 | 3): void {
  const h = 44 + (tier - 1) * 10;
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy + 2);
  ctx.lineTo(cx + 4, cy + 2);
  ctx.lineTo(cx + 2, cy - h);
  ctx.lineTo(cx - 2, cy - h);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(cx, cy - h - 1, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h - 1);
  ctx.lineTo(cx, cy - h - 20);
  ctx.moveTo(cx, cy - h - 1);
  ctx.lineTo(cx - 16, cy - h + 10);
  ctx.moveTo(cx, cy - h - 1);
  ctx.lineTo(cx + 16, cy - h + 10);
  ctx.stroke();
}

function drawSolarPlant(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  def: BuildingDef,
  tier: 1 | 2 | 3
): void {
  drawIsoPlinth(ctx, pTop, pRight, pBottom, pLeft, 3, '#475569', '#334155');
  const cx = (pTop.x + pBottom.x) * 0.5;
  const cy = (pTop.y + pBottom.y) * 0.5 - 5;
  for (let row = -1; row <= 1; row++) {
    for (let col = -1; col <= 1; col++) {
      const px = cx + (col - row) * 14;
      const py = cy + (col + row) * 7;
      ctx.fillStyle = tier >= 2 ? '#0284c7' : '#1d4ed8';
      ctx.beginPath();
      ctx.moveTo(px - 8, py);
      ctx.lineTo(px + 2, py - 5);
      ctx.lineTo(px + 10, py + 1);
      ctx.lineTo(px, py + 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = def.accentColor;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }
}

function drawWaterWell(ctx: CanvasRenderingContext2D, cx: number, cy: number, tier: 1 | 2 | 3): void {
  ctx.fillStyle = '#64748b';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 4, 12, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#0ea5e9';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 6, 8, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  const h = 22 + (tier - 1) * 6;
  ctx.fillStyle = '#78350f';
  ctx.fillRect(cx - 10, cy - h, 2.5, h - 6);
  ctx.fillRect(cx + 7.5, cy - h, 2.5, h - 6);
  ctx.fillStyle = tier >= 2 ? '#0284c7' : '#b45309';
  ctx.beginPath();
  ctx.moveTo(cx, cy - h - 9);
  ctx.lineTo(cx + 14, cy - h + 2);
  ctx.lineTo(cx - 14, cy - h + 2);
  ctx.closePath();
  ctx.fill();
}

function drawWaterTower(ctx: CanvasRenderingContext2D, cx: number, cy: number, def: BuildingDef, tier: 1 | 2 | 3): void {
  const legH = 24 + (tier - 1) * 8;
  ctx.strokeStyle = '#64748b';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy);
  ctx.lineTo(cx - 6, cy - legH);
  ctx.moveTo(cx + 10, cy);
  ctx.lineTo(cx + 6, cy - legH);
  ctx.stroke();

  ctx.fillStyle = def.wallColor;
  ctx.fillRect(cx - 12, cy - legH - 14, 24, 15);
  ctx.fillStyle = def.roofColor;
  ctx.beginPath();
  ctx.moveTo(cx, cy - legH - 24);
  ctx.lineTo(cx + 14, cy - legH - 14);
  ctx.lineTo(cx - 14, cy - legH - 14);
  ctx.closePath();
  ctx.fill();
}

function drawGranarySilos(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  _cx: number,
  _cy: number,
  def: BuildingDef,
  tier: 1 | 2 | 3
): void {
  const isoPt = (u: number, v: number, z = 0) => ({
    x: pTop.x + (pRight.x - pTop.x) * u + (pLeft.x - pTop.x) * v,
    y: pTop.y + (pRight.y - pTop.y) * u + (pLeft.y - pTop.y) * v - z,
  });

  const cols = Math.max(1, Math.min(2, Math.round(def.width)));
  const rows = Math.max(2, Math.min(4, Math.round(def.height)));
  const longAlongX = def.width > def.height;
  const countU = longAlongX ? Math.max(2, Math.min(4, def.width)) : Math.max(1, Math.min(2, def.width));
  const countV = longAlongX ? Math.max(1, Math.min(2, def.height)) : Math.max(2, Math.min(4, def.height));
  const totalCols = Math.max(countU, cols === 2 && !longAlongX ? 2 : countU);
  const totalRows = Math.max(countV, rows);

  // Small grain-intake office at front-most corner
  const shedH = 11 + (tier - 1) * 2;
  const sTop = isoPt(0.08, 0.08, 4);
  const sRight = isoPt(0.32, 0.08, 4);
  const sBottom = isoPt(0.32, 0.32, 4);
  const sLeft = isoPt(0.08, 0.32, 4);
  drawLitIsoWalls(ctx, sTop, sRight, sBottom, sLeft, shedH, shadeHex(def.wallColor, -8));
  drawFlatTerraceRoof(ctx, sTop, sRight, sBottom, sLeft, shedH, def, tier);

  const siloH = 22 + (tier - 1) * 7 + (def.id === 'large_granary' ? 8 : def.id === 'medium_granary' ? 4 : 0);
  const siloRad = def.id === 'large_granary' ? 10 : 8.5;

  // Draw cylindrical silos from back-to-front in painter order
  for (let iu = 0; iu < totalCols; iu++) {
    for (let iv = 0; iv < totalRows; iv++) {
      const u = (iu + 0.5) / totalCols;
      const v = (iv + 0.5) / totalRows;
      const base = isoPt(u * 0.8 + 0.1, v * 0.8 + 0.1, 4);

      ctx.fillStyle = shadeHex(def.wallColor, (iu + iv) % 2 === 0 ? 4 : -10);
      ctx.fillRect(base.x - siloRad, base.y - siloH, siloRad * 2, siloH);
      ctx.fillStyle = shadeHex(def.wallColor, -22);
      ctx.fillRect(base.x, base.y - siloH, siloRad, siloH);

      // Silo bands
      ctx.fillStyle = def.accentColor;
      ctx.fillRect(base.x - siloRad, base.y - siloH * 0.55, siloRad * 2, 1.5);

      // Domed crop roof
      ctx.fillStyle = def.roofColor;
      ctx.beginPath();
      ctx.arc(base.x, base.y - siloH, siloRad, Math.PI, 0);
      ctx.closePath();
      ctx.fill();

      // Top vent cap
      ctx.fillStyle = shadeHex(def.accentColor, 20);
      ctx.fillRect(base.x - 2, base.y - siloH - siloRad - 2, 4, 3);
    }
  }
}

function drawWarehouseDepot(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  _cx: number,
  _cy: number,
  def: BuildingDef,
  tier: 1 | 2 | 3
): void {
  const isoPt = (u: number, v: number, z = 0) => ({
    x: pTop.x + (pRight.x - pTop.x) * u + (pLeft.x - pTop.x) * v,
    y: pTop.y + (pRight.y - pTop.y) * u + (pLeft.y - pTop.y) * v - z,
  });

  const lift = 4;
  const hTop = isoPt(0.08, 0.08, lift);
  const hRight = isoPt(0.92, 0.08, lift);
  const hBottom = isoPt(0.92, 0.92, lift);
  const hLeft = isoPt(0.08, 0.92, lift);

  const hallH =
    (def.id === 'large_warehouse' ? 28 : def.id === 'medium_warehouse' ? 23 : 19) + (tier - 1) * 6;

  drawLitIsoWalls(ctx, hTop, hRight, hBottom, hLeft, hallH, def.wallColor);
  drawFlatTerraceRoof(ctx, hTop, hRight, hBottom, hLeft, hallH, def, tier);

  // Corrugated skylights along the roof spine
  const longX = def.width >= def.height;
  const skyCount = Math.max(2, Math.min(6, Math.max(def.width, def.height)));
  for (let i = 0; i < skyCount; i++) {
    const t0 = (i + 0.2) / skyCount;
    const t1 = (i + 0.8) / skyCount;
    const sA = longX ? isoPt(t0, 0.36, lift + hallH + 1) : isoPt(0.36, t0, lift + hallH + 1);
    const sB = longX ? isoPt(t1, 0.36, lift + hallH + 1) : isoPt(0.64, t0, lift + hallH + 1);
    const sC = longX ? isoPt(t1, 0.64, lift + hallH + 1) : isoPt(0.64, t1, lift + hallH + 1);
    const sD = longX ? isoPt(t0, 0.64, lift + hallH + 1) : isoPt(0.36, t1, lift + hallH + 1);
    ctx.fillStyle = '#7dd3fc';
    ctx.beginPath();
    ctx.moveTo(sA.x, sA.y);
    ctx.lineTo(sB.x, sB.y);
    ctx.lineTo(sC.x, sC.y);
    ctx.lineTo(sD.x, sD.y);
    ctx.closePath();
    ctx.fill();
  }

  // Rolling cargo dock doors on front-left and front-right facades
  const leftBays = Math.max(1, Math.min(6, Math.round(def.height)));
  for (let i = 1; i <= leftBays; i++) {
    const t = i / (leftBays + 1);
    const bx = hLeft.x + (hBottom.x - hLeft.x) * t;
    const by = hLeft.y + (hBottom.y - hLeft.y) * t;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(bx - 5, by - 11, 10, 11);
    ctx.fillStyle = def.accentColor;
    ctx.fillRect(bx - 5, by - 12, 10, 2);
  }
  const rightBays = Math.max(1, Math.min(6, Math.round(def.width)));
  for (let i = 1; i <= rightBays; i++) {
    const t = i / (rightBays + 1);
    const bx = hBottom.x + (hRight.x - hBottom.x) * t;
    const by = hBottom.y + (hRight.y - hBottom.y) * t;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(bx - 4, by - 10, 8, 10);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(bx - 4, by - 11, 8, 2);
  }

  // Upper logistics mezzanine on Tier >= 2 or Large Warehouse
  if (tier >= 2 || def.id === 'large_warehouse') {
    const mTop = isoPt(0.22, 0.22, lift + hallH);
    const mRight = isoPt(0.58, 0.22, lift + hallH);
    const mBottom = isoPt(0.58, 0.58, lift + hallH);
    const mLeft = isoPt(0.22, 0.58, lift + hallH);
    drawLitIsoWalls(ctx, mTop, mRight, mBottom, mLeft, 9, shadeHex(def.wallColor, 14));
    drawFlatTerraceRoof(ctx, mTop, mRight, mBottom, mLeft, 9, def, tier);
  }
}

function drawMarketStall(ctx: CanvasRenderingContext2D, cx: number, cy: number, def: BuildingDef, tier: 1 | 2 | 3): void {
  ctx.fillStyle = '#78350f';
  ctx.fillRect(cx - 16, cy - 10, 32, 8);
  ctx.fillStyle = def.roofColor;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 28 - (tier - 1) * 7);
  ctx.lineTo(cx + 20, cy - 18);
  ctx.lineTo(cx - 20, cy - 18);
  ctx.closePath();
  ctx.fill();
  if (tier >= 2) {
    ctx.fillStyle = '#fde047';
    ctx.fillRect(cx - 12, cy - 22, 24, 3);
  }
}

function drawGrandMonument(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  cx: number,
  cy: number,
  tier: 1 | 2 | 3
): void {
  drawIsoPlinth(ctx, pTop, pRight, pBottom, pLeft, 6, '#e2e8f0', '#94a3b8');
  for (let t = 0; t < 3; t++) {
    const s = 0.72 - t * 0.18;
    const h = 11;
    const lift = 6 + t * h;
    const shrink = (pt: { x: number; y: number }) => ({
      x: cx + (pt.x - cx) * s,
      y: cy + (pt.y - cy) * s - lift,
    });
    drawLitIsoWalls(
      ctx,
      shrink(pTop),
      shrink(pRight),
      shrink(pBottom),
      shrink(pLeft),
      h,
      t === 2 ? '#fbbf24' : '#cbd5e1'
    );
  }
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 68 - (tier - 1) * 8);
  ctx.lineTo(cx + 6, cy - 39);
  ctx.lineTo(cx - 6, cy - 39);
  ctx.closePath();
  ctx.fill();
}

function drawAgriculturalOrPark(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  _cx: number,
  _cy: number,
  def: BuildingDef,
  tier: 1 | 2 | 3
): void {
  drawIsoPlinth(
    ctx,
    pTop,
    pRight,
    pBottom,
    pLeft,
    3,
    def.id === 'village_park' ? '#4ade80' : '#654321',
    '#4a3219'
  );

  ctx.fillStyle = def.roofColor;
  ctx.beginPath();
  ctx.moveTo(pTop.x, pTop.y - 1);
  ctx.lineTo(pRight.x - 5, pRight.y - 3);
  ctx.lineTo(pBottom.x, pBottom.y - 5);
  ctx.lineTo(pLeft.x + 5, pLeft.y - 3);
  ctx.closePath();
  ctx.fill();

  if (def.id === 'village_park') {
    const fx = (pTop.x + pBottom.x) * 0.5;
    const fy = (pTop.y + pBottom.y) * 0.5 - 3;
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.ellipse(fx, fy, 11 + tier * 2, 5.5 + tier, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.ellipse(fx, fy - 1, 7 + tier, 3.5 + tier * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#16a34a';
    ctx.beginPath();
    ctx.arc(pLeft.x + 14, pLeft.y - 9, 6, 0, Math.PI * 2);
    ctx.arc(pRight.x - 14, pRight.y - 9, 6, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  for (let i = 1; i <= 4; i++) {
    const t = i / 5;
    const x1 = pTop.x + (pLeft.x - pTop.x) * t + 4;
    const y1 = pTop.y + (pLeft.y - pTop.y) * t - 2;
    const x2 = pRight.x + (pBottom.x - pRight.x) * t - 4;
    const y2 = pRight.y + (pBottom.y - pRight.y) * t - 4;

    ctx.strokeStyle = '#3b2613';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.fillStyle = def.accentColor;
    for (let s = 1; s <= 4; s++) {
      const k = s / 5;
      ctx.beginPath();
      ctx.arc(x1 + (x2 - x1) * k, y1 + (y2 - y1) * k - 2, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawSmallIsoBarn(ctx, pTop.x, pTop.y + 8, def.wallColor, def.accentColor);
  if (tier >= 2) {
    drawSmallIsoBarn(ctx, pTop.x + 14, pTop.y + 14, shadeHex(def.wallColor, -10), '#fbbf24');
  }
}

function drawSmallIsoBarn(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  wall: string,
  roof: string
): void {
  ctx.fillStyle = wall;
  ctx.fillRect(cx - 8, cy - 11, 8, 10);
  ctx.fillStyle = shadeHex(wall, -20);
  ctx.fillRect(cx, cy - 11, 8, 10);
  ctx.fillStyle = roof;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 18);
  ctx.lineTo(cx + 10, cy - 11);
  ctx.lineTo(cx - 10, cy - 11);
  ctx.closePath();
  ctx.fill();
}

function drawAmbientSprites(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  kind: 'bird' | 'cart'
): void {
  const cx = pos.x + 12;
  const cy = pos.y + 12;
  if (kind === 'bird') {
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy);
    ctx.quadraticCurveTo(cx - 2, cy - 4, cx, cy);
    ctx.quadraticCurveTo(cx + 2, cy - 4, cx + 5, cy);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#92400e';
    ctx.fillRect(cx - 6, cy - 4, 12, 6);
    ctx.fillStyle = '#d97706';
    ctx.fillRect(cx - 4, cy - 7, 8, 3);
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.arc(cx - 4, cy + 3, 2.5, 0, Math.PI * 2);
    ctx.arc(cx + 4, cy + 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCitizenSprite(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  opts: {
    role: 'normal' | 'laborer' | 'artisan' | 'engineer' | 'child' | 'gov_officer' | 'police';
    strideFrame: 0 | 1;
    chopping?: boolean;
  }
): void {
  const cx = pos.x + 14;
  const by = pos.y + 34;
  const isChild = opts.role === 'child';
  const scale = isChild ? 0.78 : 1;

  // Ground shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, by, 6 * scale, 3 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  const pantsColor =
    opts.role === 'police'
      ? '#0f172a'
      : opts.role === 'gov_officer'
        ? '#1e293b'
        : opts.role === 'normal'
          ? '#334155'
          : '#1e293b';

  // Legs
  ctx.strokeStyle = pantsColor;
  ctx.lineWidth = 2.6 * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (opts.strideFrame === 0) {
    ctx.moveTo(cx - 2 * scale, by - 9 * scale);
    ctx.lineTo(cx - 4 * scale, by - 1);
    ctx.moveTo(cx + 2 * scale, by - 9 * scale);
    ctx.lineTo(cx + 4 * scale, by - 2);
  } else {
    ctx.moveTo(cx - 2 * scale, by - 9 * scale);
    ctx.lineTo(cx + 1 * scale, by - 1);
    ctx.moveTo(cx + 2 * scale, by - 9 * scale);
    ctx.lineTo(cx - 1 * scale, by - 3);
  }
  ctx.stroke();

  const tunicByRole: Record<typeof opts.role, string> = {
    normal: '#f8fafc',
    laborer: '#d97706',
    artisan: '#2563eb',
    engineer: '#0d9488',
    child: '#fb7185',
    gov_officer: '#1e3a8a',
    police: '#1d4ed8',
  };

  // Clothed Tunic / Uniform / Suit
  ctx.fillStyle = tunicByRole[opts.role];
  ctx.beginPath();
  ctx.roundRect(cx - 4.5 * scale, by - 21 * scale, 9 * scale, 13 * scale, 3 * scale);
  ctx.fill();

  // Role-specific clothing accents (apron, vest, sash, badge)
  if (opts.role === 'artisan') {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(cx - 2.5, by - 18, 5, 9);
  } else if (opts.role === 'engineer') {
    ctx.fillStyle = '#facc15';
    ctx.fillRect(cx - 4, by - 19, 8, 3);
  } else if (opts.role === 'gov_officer') {
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(cx - 1, by - 20, 2, 10);
  } else if (opts.role === 'police') {
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(cx + 1, by - 18, 2.5, 2.5);
  } else if (opts.role === 'normal') {
    ctx.fillStyle = '#10b981';
    ctx.fillRect(cx - 4.5, by - 15, 9, 4);
  }

  // Head
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(cx, by - 24.5 * scale, 4 * scale, 0, Math.PI * 2);
  ctx.fill();

  // Hair / Uniform Cap / Hard Hat
  if (opts.role === 'normal' || opts.role === 'child') {
    ctx.fillStyle = opts.role === 'child' ? '#facc15' : '#451a03';
    ctx.beginPath();
    ctx.arc(cx, by - 26.2 * scale, 4.1 * scale, Math.PI, 0);
    ctx.fill();
  } else if (opts.role === 'gov_officer' || opts.role === 'police') {
    ctx.fillStyle = opts.role === 'gov_officer' ? '#1e3a8a' : '#0f172a';
    ctx.fillRect(cx - 5, by - 29.5, 10, 3);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(cx - 1.5, by - 29.5, 3, 2);
    ctx.fillRect(cx - 5, by - 27, 10, 1.2);
  } else {
    const hatColor = opts.role === 'laborer' ? '#fde047' : opts.role === 'artisan' ? '#f8fafc' : '#facc15';
    ctx.fillStyle = hatColor;
    ctx.beginPath();
    ctx.ellipse(cx, by - 27.5, 6.2, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, by - 28.5, 3.4, Math.PI, 0);
    ctx.fill();
  }

  if (opts.chopping) {
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx + 3, by - 18);
    ctx.lineTo(cx + 10, by - 26);
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(cx + 8, by - 28);
    ctx.lineTo(cx + 12, by - 25);
    ctx.lineTo(cx + 9, by - 23);
    ctx.closePath();
    ctx.fill();
  }
}

function drawExtendedCitizenSprite(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  ep: {
    prof: string;
    tunic: string;
    accent: string;
    hat: 'none' | 'helmet' | 'cap' | 'straw' | 'medical' | 'fire' | 'chef' | 'hard_yellow';
    scale?: number;
  },
  strideFrame: 0 | 1
): void {
  const cx = pos.x + 14;
  const by = pos.y + 34;
  const s = ep.scale ?? 1;

  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, by, 6 * s, 3 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#1e293b';
  ctx.lineWidth = 2.6 * s;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (strideFrame === 0) {
    ctx.moveTo(cx - 2 * s, by - 9 * s);
    ctx.lineTo(cx - 4 * s, by - 1);
    ctx.moveTo(cx + 2 * s, by - 9 * s);
    ctx.lineTo(cx + 4 * s, by - 2);
  } else {
    ctx.moveTo(cx - 2 * s, by - 9 * s);
    ctx.lineTo(cx + 1 * s, by - 1);
    ctx.moveTo(cx + 2 * s, by - 9 * s);
    ctx.lineTo(cx - 1 * s, by - 3);
  }
  ctx.stroke();

  ctx.fillStyle = ep.tunic;
  ctx.beginPath();
  ctx.roundRect(cx - 4.5 * s, by - 21 * s, 9 * s, 13 * s, 3 * s);
  ctx.fill();

  ctx.fillStyle = ep.accent;
  ctx.fillRect(cx - 2 * s, by - 18 * s, 4 * s, 6 * s);

  ctx.fillStyle = '#f1c27d';
  ctx.beginPath();
  ctx.arc(cx, by - 24.5 * s, 4 * s, 0, Math.PI * 2);
  ctx.fill();

  if (ep.hat === 'none') {
    ctx.fillStyle = ep.prof === 'elderly' ? '#e2e8f0' : '#451a03';
    ctx.beginPath();
    ctx.arc(cx, by - 26.2 * s, 4.1 * s, Math.PI, 0);
    ctx.fill();
  } else if (ep.hat === 'straw') {
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.ellipse(cx, by - 27.5 * s, 7 * s, 2.2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, by - 28.5 * s, 3.6 * s, Math.PI, 0);
    ctx.fill();
  } else if (ep.hat === 'chef') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 4, by - 32, 8, 5);
    ctx.beginPath();
    ctx.arc(cx, by - 32, 4.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (ep.hat === 'medical') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 4, by - 29, 8, 3);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(cx - 1, by - 29, 2, 3);
    ctx.fillRect(cx - 2, by - 28, 4, 1);
  } else {
    const col =
      ep.hat === 'fire'
        ? '#dc2626'
        : ep.hat === 'hard_yellow'
          ? '#facc15'
          : ep.hat === 'helmet'
            ? '#78716c'
            : ep.accent;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(cx, by - 27.5 * s, 5.5 * s, 2 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, by - 28.5 * s, 3.4 * s, Math.PI, 0);
    ctx.fill();
    if (ep.hat === 'helmet') {
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(cx - 1, by - 31, 2.5, 2.5);
    }
  }
}

function drawRoadDirectionDecal(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  dir: 1 | 2 | 3 | 4
): void {
  const cx = pos.x + 16;
  const cy = pos.y + 10;
  // Isometric unit vectors: N(+16,-8), E(+16,+8), S(-16,+8), W(-16,-8)
  const vecs: Record<1 | 2 | 3 | 4, [number, number]> = {
    1: [0.894, -0.447],
    2: [0.894, 0.447],
    3: [-0.894, 0.447],
    4: [-0.894, -0.447],
  };
  const [vx, vy] = vecs[dir];
  const px = -vy;
  const py = vx;

  ctx.save();
  ctx.fillStyle = 'rgba(248, 250, 252, 0.88)';
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx + vx * 6.5, cy + vy * 6.5);
  ctx.lineTo(cx - vx * 2.5 + px * 3.8, cy - vy * 2.5 + py * 3.8);
  ctx.lineTo(cx - vx * 1.0, cy - vy * 1.0);
  ctx.lineTo(cx - vx * 2.5 - px * 3.8, cy - vy * 2.5 - py * 3.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawVehicleSprite(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  kind:
    | 'bus'
    | 'taxi'
    | 'tractor'
    | 'fish_van'
    | 'car'
    | 'delivery_van'
    | 'cargo_truck'
    | 'container_truck'
    | 'construction_truck'
    | 'emergency'
    | 'train_passenger'
    | 'train_freight',
  loadState: 'empty' | 'loaded' = 'loaded'
): void {
  const cx = pos.x + (kind.startsWith('train_') ? 22 : 20);
  const cy = pos.y + (kind.startsWith('train_') ? 17 : 15);
  const isLoaded = loadState === 'loaded';

  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 5, kind.startsWith('train_') ? 18 : 13, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  if (kind === 'train_passenger' || kind === 'train_freight') {
    const bodyCol = kind === 'train_passenger' ? '#2563eb' : '#b45309';
    const roofCol = kind === 'train_passenger' ? '#e2e8f0' : '#78350f';
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx - 17, cy + 1, 34, 4);
    ctx.fillStyle = bodyCol;
    ctx.beginPath();
    ctx.roundRect(cx - 16, cy - 8, 32, 10, 3);
    ctx.fill();
    ctx.fillStyle = roofCol;
    ctx.fillRect(cx - 15, cy - 11, 30, 3.5);
    if (kind === 'train_passenger') {
      ctx.fillStyle = '#fef08a';
      for (const wx of [-11, -4, 3, 10]) {
        ctx.fillRect(cx + wx, cy - 6, 4, 3);
      }
    } else {
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(cx - 12, cy - 7, 10, 6);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(cx + 1, cy - 7, 10, 6);
    }
    return;
  }

  // Wheels
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.arc(cx - 6, cy + 4, 3, 0, Math.PI * 2);
  ctx.arc(cx + 6, cy + 4, 3, 0, Math.PI * 2);
  ctx.fill();

  if (kind === 'bus') {
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.roundRect(cx - 12, cy - 7, 24, 10, 2.5);
    ctx.fill();
    ctx.fillStyle = '#e0f2fe';
    for (const wx of [-9, -3, 3, 8]) {
      ctx.fillRect(cx + wx, cy - 5, 3.5, 3);
    }
  } else if (kind === 'taxi') {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.roundRect(cx - 8, cy - 3, 16, 6, 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx - 3, cy - 6, 6, 3);
  } else if (kind === 'car') {
    ctx.fillStyle = '#3b82f6';
    ctx.beginPath();
    ctx.roundRect(cx - 8, cy - 3, 16, 6, 2);
    ctx.fill();
    ctx.fillStyle = '#93c5fd';
    ctx.fillRect(cx - 4, cy - 6, 8, 3);
  } else if (kind === 'delivery_van') {
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.roundRect(cx - 10, cy - 6, 20, 9, 2);
    ctx.fill();
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(cx - 8, cy - 3, 10, 2.5);
    ctx.fillStyle = '#bae6fd';
    ctx.fillRect(cx + 5, cy - 4, 3.5, 3);
    if (isLoaded) {
      // Roof parcel rack & crates when carrying delivery goods
      ctx.fillStyle = '#b45309';
      ctx.fillRect(cx - 8, cy - 9, 6, 3);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(cx - 1, cy - 8, 5, 2);
    }
  } else if (kind === 'cargo_truck') {
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(cx + 4, cy - 5, 8, 8);
    ctx.fillStyle = '#bae6fd';
    ctx.fillRect(cx + 8, cy - 4, 3, 3);
    if (isLoaded) {
      // Full tarped / palletized cargo bed
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(cx - 12, cy - 7, 15, 10);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(cx - 11, cy - 8.5, 6, 2.5);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(cx - 12, cy - 2, 15, 1.5);
    } else {
      // Empty low slatted flatbed
      ctx.fillStyle = '#475569';
      ctx.fillRect(cx - 12, cy + 0.5, 15, 2.5);
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.1;
      ctx.strokeRect(cx - 11.5, cy - 3, 14, 3.5);
    }
  } else if (kind === 'container_truck') {
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(cx + 5, cy - 5, 7, 8);
    ctx.fillStyle = '#bae6fd';
    ctx.fillRect(cx + 8, cy - 4, 3, 3);
    // Flatbed skeletal trailer
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(cx - 13, cy + 1, 17, 2.2);
    if (isLoaded) {
      // Full blue corrugated intermodal shipping container
      ctx.fillStyle = '#0ea5e9';
      ctx.fillRect(cx - 13, cy - 7, 17, 8.5);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(cx - 11, cy - 5, 13, 2);
    } else {
      // Empty twist-lock chassis pins only
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(cx - 13, cy - 0.5, 2, 1.5);
      ctx.fillRect(cx + 2, cy - 0.5, 2, 1.5);
    }
  } else if (kind === 'construction_truck') {
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(cx + 4, cy - 5, 8, 8);
    ctx.fillStyle = '#bae6fd';
    ctx.fillRect(cx + 8, cy - 4, 3, 3);
    if (isLoaded) {
      // Heaped gravel/stone mound rising from dump bed
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(cx - 4, cy - 6, 6, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.arc(cx - 5, cy - 7, 3.5, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillStyle = isLoaded ? '#d97706' : '#92400e';
    ctx.beginPath();
    ctx.moveTo(cx - 12, cy - 5);
    ctx.lineTo(cx + 3, cy - 5);
    ctx.lineTo(cx + 3, cy + 3);
    ctx.lineTo(cx - 10, cy + 3);
    ctx.closePath();
    ctx.fill();
  } else if (kind === 'emergency') {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(cx - 9, cy - 5, 18, 8, 2);
    ctx.fill();
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(cx - 9, cy - 1, 18, 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(cx - 2, cy - 7, 3, 2);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(cx + 1, cy - 7, 3, 2);
  } else if (kind === 'tractor') {
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(cx - 7, cy - 5, 13, 7);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(cx - 2, cy - 9, 6, 4);
  } else {
    // fish_van
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.roundRect(cx - 10, cy - 6, 20, 9, 2);
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(cx - 7, cy - 4, 9, 4);
    if (isLoaded) {
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(cx - 8, cy - 8.5, 7, 2.5);
      ctx.fillStyle = '#fb923c';
      ctx.fillRect(cx - 7, cy - 8, 3, 1.5);
    }
  }
}

function drawStadiumComplex(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  cx: number,
  cy: number,
  def: BuildingDef
): void {
  drawIsoPlinth(ctx, pTop, pRight, pBottom, pLeft, 6, '#e2e8f0', '#64748b');
  const rx = Math.max(24, (pRight.x - pLeft.x) * 0.38);
  const ry = Math.max(12, (pBottom.y - pTop.y) * 0.36);
  ctx.fillStyle = def.wallColor;
  ctx.beginPath();
  ctx.ellipse(cx, cy - 8, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 9, rx * 0.68, ry * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  for (const dx of [-rx * 0.7, rx * 0.7]) {
    ctx.fillStyle = '#fde047';
    ctx.fillRect(cx + dx - 1.5, cy - 26, 3, 14);
    ctx.beginPath();
    ctx.arc(cx + dx, cy - 28, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCargoSprite(
  ctx: CanvasRenderingContext2D,
  pos: { x: number; y: number },
  kind: 'wood' | 'food' | 'stone' | 'goods'
): void {
  const cx = pos.x + 8;
  const cy = pos.y + 7;
  if (kind === 'wood') {
    ctx.fillStyle = '#78350f';
    ctx.fillRect(cx - 6, cy - 3, 12, 6);
    ctx.fillStyle = '#d97706';
    ctx.fillRect(cx - 6, cy - 3, 3, 6);
  } else if (kind === 'food') {
    ctx.fillStyle = '#a16207';
    ctx.fillRect(cx - 5, cy - 1, 10, 5);
    ctx.fillStyle = '#fb923c';
    ctx.beginPath();
    ctx.arc(cx - 2, cy - 2, 2.5, 0, Math.PI * 2);
    ctx.arc(cx + 2, cy - 2, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === 'stone') {
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(cx - 5, cy - 3, 10, 6);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(cx - 4, cy - 3, 4, 3);
  } else {
    ctx.fillStyle = '#b45309';
    ctx.fillRect(cx - 5, cy - 3, 10, 6);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(cx - 2, cy - 2, 4, 4);
  }
}

function drawRiverBoat(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }): void {
  const cx = pos.x + 16;
  const cy = pos.y + 13;
  ctx.fillStyle = 'rgba(224, 242, 254, 0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 3, 13, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#78350f';
  ctx.beginPath();
  ctx.moveTo(cx - 11, cy);
  ctx.lineTo(cx + 11, cy);
  ctx.lineTo(cx + 7, cy + 4);
  ctx.lineTo(cx - 7, cy + 4);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 10);
  ctx.lineTo(cx + 6, cy - 1);
  ctx.lineTo(cx, cy - 1);
  ctx.closePath();
  ctx.fill();
}

function drawWaterRipple(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }): void {
  const cx = pos.x + 22;
  const cy = pos.y + 10;
  ctx.strokeStyle = 'rgba(224, 242, 254, 0.85)';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 12, cy);
  ctx.quadraticCurveTo(cx - 6, cy - 3, cx, cy);
  ctx.quadraticCurveTo(cx + 6, cy + 3, cx + 12, cy);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(125, 211, 252, 0.65)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(cx - 7, cy + 4);
  ctx.quadraticCurveTo(cx, cy + 2, cx + 8, cy + 4);
  ctx.stroke();
}

function drawSmokePuff(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }): void {
  const cx = pos.x + 12;
  const cy = pos.y + 12;
  const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, 10);
  grad.addColorStop(0, 'rgba(241, 245, 249, 0.65)');
  grad.addColorStop(1, 'rgba(241, 245, 249, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, 10, 0, Math.PI * 2);
  ctx.fill();
}

function drawLightHalo(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }): void {
  const cx = pos.x + 64;
  const cy = pos.y + 64;
  const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 62);
  grad.addColorStop(0, 'rgba(255, 240, 185, 0.94)');
  grad.addColorStop(0.28, 'rgba(251, 176, 64, 0.44)');
  grad.addColorStop(0.66, 'rgba(217, 119, 6, 0.14)');
  grad.addColorStop(1, 'rgba(217, 119, 6, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(pos.x, pos.y, 128, 128);
}

function drawWindowGlow(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }): void {
  const cx = pos.x + 24;
  const cy = pos.y + 18;
  const grad = ctx.createRadialGradient(cx, cy, 1, cx, cy, 21);
  grad.addColorStop(0, 'rgba(254, 240, 138, 0.85)');
  grad.addColorStop(0.45, 'rgba(245, 158, 11, 0.34)');
  grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(pos.x, pos.y, 48, 36);

  ctx.fillStyle = 'rgba(254, 249, 195, 0.96)';
  ctx.fillRect(cx - 7, cy - 3, 5, 5);
  ctx.fillRect(cx + 2, cy - 1, 5, 5);
}

function drawSkyStar(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }): void {
  const cx = pos.x + 6;
  const cy = pos.y + 6;
  const g = ctx.createRadialGradient(cx, cy, 0.4, cx, cy, 5);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
  g.addColorStop(0.4, 'rgba(186, 230, 253, 0.55)');
  g.addColorStop(1, 'rgba(186, 230, 253, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(pos.x, pos.y, 12, 12);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy);
  ctx.lineTo(cx + 4, cy);
  ctx.moveTo(cx, cy - 4);
  ctx.lineTo(cx, cy + 4);
  ctx.stroke();
}

function drawBambooFeature(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }): void {
  const cx = pos.x + 38;
  const baseY = pos.y + 74;
  ctx.fillStyle = 'rgba(5, 16, 10, 0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, baseY + 1, 14, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  const stalks = [
    { dx: -7, h: 38, tilt: -2 },
    { dx: -1, h: 44, tilt: 1 },
    { dx: 6, h: 35, tilt: 3 },
  ];
  for (const s of stalks) {
    ctx.strokeStyle = '#65a30d';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(cx + s.dx, baseY);
    ctx.lineTo(cx + s.dx + s.tilt, baseY - s.h);
    ctx.stroke();

    ctx.strokeStyle = '#bef264';
    ctx.lineWidth = 1.4;
    for (let y = 8; y < s.h; y += 9) {
      ctx.beginPath();
      ctx.moveTo(cx + s.dx - 2, baseY - y);
      ctx.lineTo(cx + s.dx + 2, baseY - y);
      ctx.stroke();
    }

    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.ellipse(cx + s.dx + s.tilt - 4, baseY - s.h + 4, 6, 2.2, -0.4, 0, Math.PI * 2);
    ctx.ellipse(cx + s.dx + s.tilt + 5, baseY - s.h + 8, 6, 2.2, 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAncientRuinFeature(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }): void {
  const cx = pos.x + 38;
  const by = pos.y + 74;
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.ellipse(cx, by + 1, 20, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#64748b';
  ctx.fillRect(cx - 17, by - 7, 34, 8);
  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(cx - 13, by - 26, 7, 20);
  ctx.fillRect(cx + 6, by - 26, 7, 20);
  ctx.fillStyle = '#cbd5e1';
  ctx.fillRect(cx - 15, by - 32, 30, 7);
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(cx, by - 16, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#22c55e';
  ctx.fillRect(cx - 14, by - 32, 9, 3);
  ctx.fillRect(cx + 6, by - 15, 6, 4);
}

function drawFestivalPlaza(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  cx: number,
  cy: number,
  def: BuildingDef,
  tier: 1 | 2 | 3
): void {
  drawIsoPlinth(ctx, pTop, pRight, pBottom, pLeft, 4, '#fef3c7', '#b45309');
  const h = 18 + (tier - 1) * 5;
  ctx.fillStyle = '#78350f';
  ctx.fillRect(cx - 12, cy - h, 2.5, h - 2);
  ctx.fillRect(cx + 9.5, cy - h, 2.5, h - 2);
  ctx.fillStyle = def.roofColor;
  ctx.beginPath();
  ctx.moveTo(cx, cy - h - 16);
  ctx.lineTo(cx + 18, cy - h);
  ctx.lineTo(cx - 18, cy - h);
  ctx.closePath();
  ctx.fill();
  for (const dx of [-13, -4, 4, 13]) {
    ctx.fillStyle = dx % 2 === 0 ? '#fde047' : '#ef4444';
    ctx.beginPath();
    ctx.arc(cx + dx, cy - h + 2, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBotanicalGarden(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  cx: number,
  cy: number,
  tier: 1 | 2 | 3
): void {
  drawIsoPlinth(ctx, pTop, pRight, pBottom, pLeft, 4, '#86efac', '#15803d');
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.arc(cx - 9, cy - 6, 6, 0, Math.PI * 2);
  ctx.arc(cx + 8, cy - 6, 6, 0, Math.PI * 2);
  ctx.arc(cx, cy - 11, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(125, 211, 252, 0.58)';
  ctx.strokeStyle = '#e0f2fe';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(cx, cy - 6, 22, 16 + (tier - 1) * 4, 0, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawWildlifeDeer(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }): void {
  const cx = pos.x + 13;
  const by = pos.y + 20;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(cx, by, 7, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - 4, by - 5);
  ctx.lineTo(cx - 4, by);
  ctx.moveTo(cx + 4, by - 5);
  ctx.lineTo(cx + 4, by);
  ctx.stroke();
  ctx.fillStyle = '#b45309';
  ctx.fillRect(cx - 5, by - 9, 10, 5);
  ctx.fillRect(cx + 3, by - 14, 3, 6);
  ctx.beginPath();
  ctx.arc(cx + 5, by - 14.5, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fef3c7';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx + 4, by - 17);
  ctx.lineTo(cx + 3, by - 20);
  ctx.moveTo(cx + 6, by - 17);
  ctx.lineTo(cx + 7, by - 20);
  ctx.stroke();
}

function drawFireflyGlow(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }): void {
  const cx = pos.x + 8;
  const cy = pos.y + 8;
  const g = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, 7);
  g.addColorStop(0, '#fef08a');
  g.addColorStop(0.5, 'rgba(190, 242, 100, 0.65)');
  g.addColorStop(1, 'rgba(190, 242, 100, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(cx, cy, 7, 0, Math.PI * 2);
  ctx.fill();
}

function drawFestivalLantern(ctx: CanvasRenderingContext2D, pos: { x: number; y: number }): void {
  const cx = pos.x + 8;
  const cy = pos.y + 11;
  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 5, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.ellipse(cx, cy + 1, 3, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawNightMarket(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  cx: number,
  cy: number,
  def: BuildingDef,
  tier: 1 | 2 | 3
): void {
  drawIsoPlinth(ctx, pTop, pRight, pBottom, pLeft, 4, '#78350f', '#451a03');
  const h = (tier - 1) * 6;
  for (const offset of [-14, 14]) {
    const sx = cx + offset;
    const sy = cy - 4;
    ctx.fillStyle = '#451a03';
    ctx.fillRect(sx - 10, sy - 11 - h, 20, 9 + h);
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(sx - 7, sy - 8, 14, 3);
    ctx.fillStyle = def.roofColor;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 25 - h);
    ctx.lineTo(sx + 15, sy - 13 - h);
    ctx.lineTo(sx - 15, sy - 13 - h);
    ctx.closePath();
    ctx.fill();
  }
}

function drawFountainPlaza(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  cx: number,
  cy: number,
  tier: 1 | 2 | 3
): void {
  drawIsoPlinth(ctx, pTop, pRight, pBottom, pLeft, 4, '#f8fafc', '#cbd5e1');
  ctx.fillStyle = '#e2e8f0';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 5, 19, 9.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.ellipse(cx, cy - 7, 14, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(cx - 3, cy - 20 - (tier - 1) * 5, 6, 13 + (tier - 1) * 5);
  ctx.fillStyle = '#bae6fd';
  ctx.beginPath();
  ctx.arc(cx, cy - 23 - (tier - 1) * 5, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawAqueductCistern(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  cx: number,
  cy: number,
  def: BuildingDef,
  tier: 1 | 2 | 3
): void {
  drawIsoPlinth(ctx, pTop, pRight, pBottom, pLeft, 5, '#e2e8f0', '#94a3b8');
  const bHeight = 20 + (tier - 1) * 7;
  drawLitIsoWalls(ctx, pTop, pRight, pBottom, pLeft, bHeight, def.wallColor);
  ctx.fillStyle = '#0284c7';
  ctx.beginPath();
  ctx.moveTo(pTop.x, pTop.y - bHeight + 2);
  ctx.lineTo(pRight.x - 6, pRight.y - bHeight + 2);
  ctx.lineTo(pBottom.x, pBottom.y - bHeight + 2);
  ctx.lineTo(pLeft.x + 6, pLeft.y - bHeight + 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#7dd3fc';
  ctx.fillRect(cx - 8, cy - bHeight - 1, 16, 2);
}

function drawMarbleQuarry(
  ctx: CanvasRenderingContext2D,
  pTop: { x: number; y: number },
  pRight: { x: number; y: number },
  pBottom: { x: number; y: number },
  pLeft: { x: number; y: number },
  cx: number,
  cy: number,
  tier: 1 | 2 | 3
): void {
  drawIsoPlinth(ctx, pTop, pRight, pBottom, pLeft, 4, '#f1f5f9', '#94a3b8');
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(cx - 22, cy - 16, 44, 14);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(cx - 16, cy - 26 - (tier - 1) * 4, 30, 11);
  ctx.strokeStyle = '#92400e';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(cx + 10, cy);
  ctx.lineTo(cx + 10, cy - 36 - (tier - 1) * 6);
  ctx.lineTo(cx - 8, cy - 28 - (tier - 1) * 4);
  ctx.stroke();
}

function drawRubberTapper(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  def: BuildingDef,
  tier: 1 | 2 | 3
): void {
  drawSmallIsoBarn(ctx, cx + 10, cy - 2, def.wallColor, def.roofColor);
  if (tier >= 2) {
    drawSmallIsoBarn(ctx, cx + 10, cy - 12, def.wallColor, '#fde047');
  }
  for (const dx of [-13, -2]) {
    const tx = cx + dx;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(tx - 2.5, cy - 24, 5, 22);
    ctx.fillStyle = '#15803d';
    ctx.beginPath();
    ctx.arc(tx, cy - 27, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(tx + 1, cy - 10, 3.5, 4);
  }
}

function shadeHex(hex: string, amount: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const num = parseInt(clean, 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 255) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + amount));
  const b = Math.max(0, Math.min(255, (num & 255) + amount));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}
