import assert from 'node:assert/strict';
import { CoreEngine } from './src/core/CoreEngine';
import { BiomeId, TileFlag } from './src/core/GameState';
import { gridToChunk } from './src/core/IsoMath';
import { BUILDING_LIST, BUILDINGS, getBuildingFootprint } from './src/data/buildings.data';
import { RoadType } from './src/data/roads.data';
import { FeatureType, isMatureTreeFeature, TREE_SPECIES } from './src/data/trees.data';
import { TECH_MAP } from './src/data/techTree.data';
import { SaveMigrator } from './src/persistence/SaveMigrator';
import {
  BuildingCostCalculator,
  getBuildingSimSnapshot,
  getBuildingStatsAtLevel,
  getDynamicBuildingSummary,
  getEffectiveMaxLevel,
  getLevelUpCatalog,
  getStorageSystemSummary,
} from './src/systems/BuildingSimulation';
import { BuildingSystem } from './src/systems/BuildingSystem';
import { EnvironmentSystem } from './src/systems/EnvironmentSystem';
import { ResourceSystem } from './src/systems/ResourceSystem';
import { StatisticsSystem } from './src/systems/StatisticsSystem';
import { TreeGrowthSystem } from './src/systems/TreeGrowthSystem';
import { UtilityNetworkSystem } from './src/systems/UtilityNetworkSystem';

function clearPlot(engine: CoreEngine, gx: number, gy: number, w: number, h: number): void {
  for (let dx = 0; dx < w; dx++) {
    for (let dy = 0; dy < h; dy++) {
      const tx = gx + dx;
      const ty = gy + dy;
      const { cx, cy, index } = gridToChunk(tx, ty);
      const chunk = engine.chunks.getOrCreateChunk(cx, cy);
      chunk.flags[index] |= TileFlag.Unlocked | TileFlag.Flattened;
      if (engine.chunks.isWaterBiome(chunk.biomeId[index])) {
        chunk.biomeId[index] = BiomeId.Grassland;
      }
      chunk.featureType[index] = FeatureType.None;
      chunk.featureHp[index] = 0;
      chunk.roadType[index] = RoadType.None;
      chunk.buildingRef[index] = -1;
      chunk.cityRef[index] = engine.state.activeCityId || 1;
    }
  }
}

function makeRichEngine(): CoreEngine {
  const engine = new CoreEngine();
  engine.state.level = 30;
  engine.state.coins = 10_000_000;
  engine.state.unlockedTechIds = Object.keys(TECH_MAP);
  for (const k of Object.keys(engine.state.resources) as Array<keyof typeof engine.state.resources>) {
    engine.state.capacities[k] = 100_000;
    engine.state.resources[k] = 50_000;
  }
  return engine;
}

// 1. Verify maxLevel normalization across all building definitions
for (const def of BUILDING_LIST) {
  const expected = def.category === 'storage' ? 4 : 5;
  assert.equal(def.maxLevel, expected, `${def.id} def.maxLevel must be ${expected}`);
  assert.equal(getEffectiveMaxLevel(def), expected, `${def.id} effective maxLevel must be ${expected}`);
}
console.log(`PASS 1: All ${BUILDING_LIST.length} buildings normalized (Storage=4, Normal=5).`);

// 2. Verify all 6 Crop & Material storage buildings + footprints + rotability + Crop/Material separation + non-truncation on demolish
{
  const engine = makeRichEngine();
  for (const id of ['granary', 'medium_granary', 'large_granary', 'warehouse', 'medium_warehouse', 'large_warehouse']) {
    const def = BUILDINGS[id];
    assert.ok(def, `Missing storage def: ${id}`);
    assert.equal(def.category, 'storage');
    assert.equal(def.maxLevel, 4);
    if (def.width !== def.height) {
      assert.ok(def.footprintRotatable, `${id} should be rotatable`);
    }
  }
  assert.deepEqual(getBuildingFootprint(BUILDINGS.granary, 0), { width: 1, height: 2 });
  assert.deepEqual(getBuildingFootprint(BUILDINGS.granary, 1), { width: 2, height: 1 });
  assert.deepEqual(getBuildingFootprint(BUILDINGS.medium_granary, 0), { width: 1, height: 4 });
  assert.deepEqual(getBuildingFootprint(BUILDINGS.medium_granary, 1), { width: 4, height: 1 });
  assert.deepEqual(getBuildingFootprint(BUILDINGS.large_granary, 0), { width: 2, height: 4 });
  assert.deepEqual(getBuildingFootprint(BUILDINGS.warehouse, 0), { width: 2, height: 2 });
  assert.deepEqual(getBuildingFootprint(BUILDINGS.medium_warehouse, 0), { width: 2, height: 4 });
  assert.deepEqual(getBuildingFootprint(BUILDINGS.large_warehouse, 0), { width: 2, height: 8 });
  assert.deepEqual(getBuildingFootprint(BUILDINGS.large_warehouse, 1), { width: 8, height: 2 });

  // Place crop storage (large_granary) & material storage (large_warehouse)
  clearPlot(engine, 20, 20, 12, 12);
  const gRes = engine.buildingSys.placeBuilding('large_granary', 20, 20, engine.state, engine.chunks, engine.roadNet, 0);
  assert.ok(gRes.ok && gRes.building, gRes.reason);
  const wRes = engine.buildingSys.placeBuilding('large_warehouse', 24, 20, engine.state, engine.chunks, engine.roadNet, 0);
  assert.ok(wRes.ok && wRes.building, wRes.reason);

  // Rush both to active
  gRes.building!.status = 'active';
  gRes.building!.buildProgress = 1;
  wRes.building!.status = 'active';
  wRes.building!.buildProgress = 1;

  ResourceSystem.recalculateCapacities(engine.state);
  const wheatCapL1 = engine.state.capacities.wheat;
  const bricksCapL1 = engine.state.capacities.bricks;
  assert.ok(wheatCapL1 > 800, 'large_granary should raise crop cap');
  assert.ok(bricksCapL1 > 900, 'large_warehouse should raise material cap');

  // Upgrade large_granary to Lv.4 -> wheat cap increases, bricks cap stays same
  for (let i = 0; i < 3; i++) {
    const up = engine.dispatch({ type: 'UPGRADE_BUILDING', buildingId: gRes.building!.id });
    assert.ok(up.ok, up.reason);
  }
  assert.equal(gRes.building!.level, 4);
  const upOver = engine.dispatch({ type: 'UPGRADE_BUILDING', buildingId: gRes.building!.id });
  assert.equal(upOver.ok, false, 'Storage cannot upgrade past Lv.4');

  assert.ok(engine.state.capacities.wheat > wheatCapL1, 'Upgraded granary must increase crop capacity');
  assert.equal(engine.state.capacities.bricks, bricksCapL1, 'Granary upgrade must NOT alter material capacity');

  // Fill wheat to cap - 5, verify non-truncation when demolishing granary
  engine.state.resources.wheat = engine.state.capacities.wheat - 2;
  const savedWheat = engine.state.resources.wheat;
  const demo = engine.dispatch({ type: 'DEMOLISH_BUILDING', buildingId: gRes.building!.id });
  assert.ok(demo.ok);
  assert.equal(engine.state.resources.wheat, savedWheat, 'Demolishing storage must preserve stored wheat above reduced cap');
  assert.ok(engine.state.capacities.wheat < savedWheat, 'Reduced wheat cap should now be below stored stock');

  const summary = getStorageSystemSummary(engine.state);
  assert.ok(summary.crop.overflowItems.some((i) => i.resourceId === 'wheat'));
  assert.equal(ResourceSystem.hasSpaceForAll(engine.state, { wheat: 1 }), false, 'Full storage blocks additional production');
  console.log('PASS 2: All 6 Crop & Material storage tiers, Lv.4 cap, separation, and non-destructive demolition verified.');
}

// 3. Permanent Monotonic Building IDs & Copy-at-Level Cost/Behavior
{
  const engine = makeRichEngine();
  clearPlot(engine, 30, 30, 20, 20);
  const b1 = engine.buildingSys.placeBuilding('timber_cottage', 30, 30, engine.state, engine.chunks, engine.roadNet, 0);
  assert.ok(b1.ok && b1.building);
  const id1 = b1.building!.id;

  // Upgrade b1 to Lv.3
  b1.building!.status = 'active';
  b1.building!.buildProgress = 1;
  assert.ok(engine.dispatch({ type: 'UPGRADE_BUILDING', buildingId: id1 }).ok);
  assert.ok(engine.dispatch({ type: 'UPGRADE_BUILDING', buildingId: id1 }).ok);
  assert.equal(b1.building!.level, 3);

  // Demolish b1 -> next building must NOT reuse id1
  assert.ok(engine.dispatch({ type: 'DEMOLISH_BUILDING', buildingId: id1 }).ok);
  const b2 = engine.buildingSys.placeBuilding('timber_cottage', 30, 30, engine.state, engine.chunks, engine.roadNet, 0);
  assert.ok(b2.ok && b2.building);
  assert.ok(b2.building!.id > id1, `New ID ${b2.building!.id} must be strictly > deleted ID ${id1}`);

  // Copy at targetLevel = 4: verify coins deducted match cumulative Lv.4 cost
  const def = BUILDINGS.bakery;
  const expectedCopyCost = BuildingCostCalculator.getCopyCost(def, 4);
  const coinsBefore = engine.state.coins;
  const copyRes = engine.dispatch({
    type: 'PLACE_BUILDING',
    defId: 'bakery',
    gx: 35,
    gy: 35,
    rotation: 0,
    targetLevel: 4,
  });
  assert.ok(copyRes.ok, copyRes.reason);
  const copied = engine.state.buildings[engine.state.buildings.length - 1];
  assert.equal(copied.level, 4, 'Copied building must preserve target level 4');
  assert.equal(coinsBefore - engine.state.coins, expectedCopyCost.coinCost, 'Copy must charge exact cumulative Lv.4 coin cost');
  console.log('PASS 3: Permanent monotonic IDs & Copy-at-level cumulative cost verified.');
}

// 4. Simulation Parity across Categories on Upgrades (Power, Water, Housing, Workforce, School, Hospital, Economy, Production, Stats)
{
  const engine = makeRichEngine();
  clearPlot(engine, 48, 48, 25, 25);
  // Place road next to buildings
  engine.chunks.getOrCreateChunk(3, 3);
  for (let x = 50; x < 64; x++) {
    const { cx, cy, index } = gridToChunk(x, 53);
    const ch = engine.chunks.getOrCreateChunk(cx, cy);
    ch.roadType[index] = RoadType.Paved;
  }

  const testCases: Array<{ defId: string; gx: number; gy: number; check: (l1: ReturnType<typeof getBuildingStatsAtLevel>, l5: ReturnType<typeof getBuildingStatsAtLevel>) => void }> = [
    {
      defId: 'timber_cottage',
      gx: 50,
      gy: 50,
      check: (l1, l5) => assert.ok(l5.housingCapacity > l1.housingCapacity && l5.taxPerMin > l1.taxPerMin),
    },
    {
      defId: 'coal_power_plant',
      gx: 54,
      gy: 49,
      check: (l1, l5) => assert.ok(l5.powerOutput > l1.powerOutput),
    },
    {
      defId: 'water_tower',
      gx: 58,
      gy: 50,
      check: (l1, l5) => assert.ok(l5.waterOutput > l1.waterOutput),
    },
    {
      defId: 'school',
      gx: 50,
      gy: 54,
      check: (l1, l5) => assert.ok(l5.educationBonus > l1.educationBonus && l5.rpPerMin > l1.rpPerMin),
    },
    {
      defId: 'hospital',
      gx: 54,
      gy: 54,
      check: (l1, l5) => assert.ok(l5.healthcareBonus > l1.healthcareBonus && l5.maxWorkers > l1.maxWorkers),
    },
    {
      defId: 'bakery',
      gx: 58,
      gy: 54,
      check: (l1, l5) => assert.ok(l5.totalHourlyOutput > l1.totalHourlyOutput && l5.maxWorkers > l1.maxWorkers),
    },
  ];

  for (const tc of testCases) {
    const res = engine.buildingSys.placeBuilding(tc.defId, tc.gx, tc.gy, engine.state, engine.chunks, engine.roadNet, 0);
    assert.ok(res.ok && res.building, `${tc.defId}: ${res.reason}`);
    res.building!.status = 'active';
    res.building!.buildProgress = 1;

    const l1Stats = getBuildingStatsAtLevel(BUILDINGS[tc.defId], 1);
    for (let i = 0; i < 4; i++) {
      assert.ok(engine.dispatch({ type: 'UPGRADE_BUILDING', buildingId: res.building!.id }).ok);
    }
    const l5Stats = getBuildingStatsAtLevel(BUILDINGS[tc.defId], 5);
    tc.check(l1Stats, l5Stats);

    const simSnap = getBuildingSimSnapshot(res.building!, engine.state);
    assert.ok(simSnap && simSnap.level === 5 && simSnap.maxLevel === 5);
    const dyn = getDynamicBuildingSummary(BUILDINGS[tc.defId], 5, res.building!, engine.state);
    assert.ok(dyn.headline.startsWith('Lv.5/5'), `Dynamic headline must reflect Lv.5/5: ${dyn.headline}`);
  }

  // Give city residents & workers so coal power plant and buildings staff up
  engine.populationSys.tickPopulation(engine.state, 1);
  engine.dispatch({ type: 'RECRUIT_WORKERS', cityId: engine.state.activeCityId || 1, count: 40 });
  engine.workforce.assignWorkers(engine.state, engine.chunks);
  UtilityNetworkSystem.markDirty();
  UtilityNetworkSystem.evaluateNetworks(engine.state, engine.chunks, EnvironmentSystem.getClimateModifiers(engine.state));
  const expectedPowerL5 = getBuildingStatsAtLevel(BUILDINGS.coal_power_plant, 5).powerOutput;
  const expectedWaterL5 = getBuildingStatsAtLevel(BUILDINGS.water_tower, 5).waterOutput;
  assert.equal(engine.state.powerGenerated, expectedPowerL5, 'Power generated must equal upgraded L5 coal plant output');
  assert.equal(engine.state.waterGenerated, expectedWaterL5, 'Water generated must equal upgraded L5 water tower output');
  assert.equal(
    engine.state.population.capacity,
    getBuildingStatsAtLevel(BUILDINGS.timber_cottage, 5).housingCapacity,
    'Population capacity must equal upgraded L5 timber cottage capacity'
  );
  const stats = StatisticsSystem.computeSnapshot(engine.state, engine.chunks);
  assert.ok(stats.capacity === engine.state.population.capacity && stats.totalJobs > 0);
  const catalog = getLevelUpCatalog(engine.state);
  assert.ok(catalog.length === testCases.length && catalog.every((e) => e.status === 'max_level'));
  console.log('PASS 4: Upgrade scaling, dynamic summaries, StatisticsSystem, and LevelUpCatalog parity verified.');
}

// 5. Player-Planted Sapling Growth & Mature-Only Worker Harvesting + Locked-Land Safety
{
  const engine = makeRichEngine();
  const gx = 12;
  const gy = 12;
  clearPlot(engine, gx, gy, 3, 3);

  // Replant player sapling
  const rep = engine.dispatch({ type: 'REPLANT_TILE', gx, gy });
  assert.ok(rep.ok, rep.reason);

  const { chunk, index } = gridToChunk(gx, gy);
  assert.equal(chunk.featureType[index], FeatureType.Sapling);
  assert.ok(TreeGrowthSystem.getGrowthInfo(engine.state, gx, gy, FeatureType.Sapling));

  // Workers must NOT chop sapling!
  const workerChopSapling = BuildingSystem.chopTile(gx, gy, engine.state, engine.chunks, 20, { allowImmature: false });
  assert.equal(workerChopSapling.ok, false, 'Workers must not harvest immature saplings');
  assert.equal(chunk.featureType[index], FeatureType.Sapling);

  // Simulate growth ticks -> MediumTree -> Mature tree
  for (let sec = 0; sec < 120; sec++) {
    TreeGrowthSystem.tick(engine.state, engine.chunks);
    if (isMatureTreeFeature(chunk.featureType[index] as FeatureType)) break;
  }
  const grownType = chunk.featureType[index] as FeatureType;
  assert.ok(isMatureTreeFeature(grownType), `Expected mature tree, got ${TREE_SPECIES[grownType]?.name}`);

  // Now workers CAN harvest mature tree!
  const workerChopMature = BuildingSystem.chopTile(gx, gy, engine.state, engine.chunks, 999, { allowImmature: false });
  assert.ok(workerChopMature.ok && workerChopMature.cleared && workerChopMature.wood > 0);

  // Locked tile must NEVER grow saplings
  const lockedGx = 900;
  const lockedGy = 900;
  const { cx: lcx, cy: lcy, index: lidx } = gridToChunk(lockedGx, lockedGy);
  const lch = engine.chunks.getOrCreateChunk(lcx, lcy);
  lch.flags[lidx] &= ~TileFlag.Unlocked;
  lch.biomeId[lidx] = BiomeId.Grassland;
  lch.featureType[lidx] = FeatureType.Sapling;
  engine.state.growingTrees ??= [];
  engine.state.growingTrees.push({ gx: lockedGx, gy: lockedGy, stage: 0, elapsedSec: 30, matureType: FeatureType.OakTree });
  TreeGrowthSystem.tick(engine.state, engine.chunks);
  assert.equal(lch.featureType[lidx], FeatureType.Sapling, 'Locked tile must never advance sapling growth');
  console.log('PASS 5: Player sapling growth stages, mature-only worker harvesting, and locked-land safety verified.');
}

// 6. Save Migration (v2 -> v3) + Duplicate Building ID Repair + Reload Idempotency
{
  const engine = makeRichEngine();
  clearPlot(engine, 40, 40, 6, 6);
  engine.buildingSys.placeBuilding('timber_cottage', 40, 40, engine.state, engine.chunks, engine.roadNet, 0);
  engine.buildingSys.placeBuilding('granary', 42, 40, engine.state, engine.chunks, engine.roadNet, 0);

  // Corrupt snapshot like an old v2 save with duplicate IDs and out-of-range storage level
  const raw = JSON.parse(JSON.stringify(engine.exportSnapshotState()));
  raw.schemaVersion = 2;
  delete raw.growingTrees;
  raw.buildings[0].id = 5;
  raw.buildings[1].id = 5; // duplicate!
  raw.buildings[1].level = 5; // invalid for storage (max 4)
  raw.nextBuildingId = 2; // stale counter!

  const migrated = SaveMigrator.migrate(raw);
  assert.ok(migrated.ok && migrated.state);
  const ids = migrated.state!.buildings.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length, 'SaveMigrator must deduplicate building IDs');
  assert.ok(migrated.state!.nextBuildingId > Math.max(...ids), 'nextBuildingId must advance past max ID');
  const granary = migrated.state!.buildings.find((b) => b.defId === 'granary')!;
  assert.equal(granary.level, 4, 'Storage building level must clamp to max 4 on migration');
  assert.ok(Array.isArray(migrated.state!.growingTrees), 'growingTrees must initialize cleanly');

  const reloadEngine = new CoreEngine();
  reloadEngine.loadState(migrated.state!, engine.exportModifiedChunks());
  const loadedIds = reloadEngine.state.buildings.map((b) => b.id);
  assert.equal(new Set(loadedIds).size, loadedIds.length);
  console.log('PASS 6: Save migration v2->v3, duplicate ID repair, and reload idempotency verified.');
}

console.log('ALL VERIFICATION CHECKS PASSED.');
