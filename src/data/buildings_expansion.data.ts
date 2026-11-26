import type { BuildingDef, ProductionRecipe } from './buildings.data';

export const CORPORATE_LEVEL_NAMES: Record<number, string> = {
  1: 'Small Office',
  2: 'Regional Office',
  3: 'Corporate Headquarters',
  4: 'National Headquarters',
  5: 'International Headquarters',
};

export function getCorporateLevelTitle(level: number): string {
  const clamped = Math.max(1, Math.min(5, Math.floor(level)));
  return CORPORATE_LEVEL_NAMES[clamped] ?? 'International Headquarters';
}

function mkBldg(def: BuildingDef): BuildingDef {
  return {
    ...def,
    maxLevel: def.category === 'storage' ? 4 : 5,
  };
}

function govBldg(
  id: string,
  name: string,
  desc: string,
  opts: Partial<BuildingDef> & { width?: number; height?: number; unlockLevel?: number; coinCost?: number }
): BuildingDef {
  return mkBldg({
    id,
    name,
    category: 'government',
    subCategory: 'gov_civic',
    description: desc,
    unlockLevel: opts.unlockLevel ?? 3,
    coinCost: opts.coinCost ?? 600,
    materialCost: opts.materialCost ?? { stone: 12, wood: 10 },
    width: opts.width ?? 2,
    height: opts.height ?? 2,
    footprintRotatable: true,
    buildTime: opts.buildTime ?? 18,
    minWorkers: opts.minWorkers ?? 2,
    maxWorkers: opts.maxWorkers ?? 8,
    workerClass: opts.workerClass ?? 'engineer',
    upkeepPerMin: opts.upkeepPerMin ?? 14,
    maxLevel: 5,
    requiresRoad: true,
    powerDemand: opts.powerDemand ?? 3,
    waterDemand: opts.waterDemand ?? 2,
    serviceRadius: opts.serviceRadius ?? 18,
    taxPerMin: opts.taxPerMin ?? 12,
    happinessBonus: opts.happinessBonus ?? 3,
    safetyBonus: opts.safetyBonus,
    educationBonus: opts.educationBonus,
    logisticsBoost: opts.logisticsBoost,
    rpPerMin: opts.rpPerMin,
    isSubOffice: true,
    accentColor: opts.accentColor ?? '#fbbf24',
    roofColor: opts.roofColor ?? '#1e3a8a',
    wallColor: opts.wallColor ?? '#f1f5f9',
    xpOnBuild: opts.xpOnBuild ?? 160,
    ...opts,
  });
}

function marketTradeBldg(
  id: string,
  name: string,
  sub: 'market' | 'trade_port',
  desc: string,
  opts: Partial<BuildingDef> = {}
): BuildingDef {
  return mkBldg({
    id,
    name,
    category: sub === 'trade_port' && opts.warehouseBonus ? 'storage' : 'commercial',
    subCategory: sub,
    description: desc,
    unlockLevel: opts.unlockLevel ?? (sub === 'trade_port' ? 6 : 2),
    coinCost: opts.coinCost ?? (sub === 'trade_port' ? 900 : 320),
    materialCost: opts.materialCost ?? { wood: 10, stone: 8 },
    width: opts.width ?? (sub === 'trade_port' ? 3 : 2),
    height: opts.height ?? 2,
    footprintRotatable: true,
    buildTime: opts.buildTime ?? 16,
    minWorkers: opts.minWorkers ?? 2,
    maxWorkers: opts.maxWorkers ?? (sub === 'trade_port' ? 14 : 8),
    workerClass: opts.workerClass ?? 'artisan',
    upkeepPerMin: opts.upkeepPerMin ?? (sub === 'trade_port' ? 16 : 8),
    maxLevel: 5,
    requiresRoad: true,
    powerDemand: opts.powerDemand ?? 2,
    waterDemand: opts.waterDemand ?? 1,
    taxPerMin: opts.taxPerMin ?? (sub === 'trade_port' ? 28 : 16),
    tradeCapacity: opts.tradeCapacity ?? (sub === 'trade_port' ? 80 : 30),
    happinessBonus: opts.happinessBonus ?? 2,
    accentColor: opts.accentColor ?? '#f59e0b',
    roofColor: opts.roofColor ?? (sub === 'trade_port' ? '#0f766e' : '#b45309'),
    wallColor: opts.wallColor ?? '#fef3c7',
    xpOnBuild: opts.xpOnBuild ?? 140,
    ...opts,
  });
}

function corpBldg(
  id: string,
  name: string,
  sector: string,
  workerClass: BuildingDef['workerClass'],
  desc: string,
  accentColor: string,
  roofColor: string,
  unlockLevel = 5
): BuildingDef {
  return mkBldg({
    id,
    name,
    category: 'commercial',
    subCategory: 'corporate',
    corporateSector: sector,
    description: `${desc} Tiers: Small Office → Regional → Corporate HQ → National HQ → International HQ.`,
    unlockLevel,
    coinCost: 850 + unlockLevel * 90,
    materialCost: { stone: 16, bricks: 12, glass: 4 },
    width: 2,
    height: 3,
    footprintRotatable: true,
    buildTime: 22,
    minWorkers: 4,
    maxWorkers: 24,
    workerClass,
    upkeepPerMin: 20,
    maxLevel: 5,
    requiresRoad: true,
    powerDemand: 5,
    waterDemand: 3,
    taxPerMin: 42,
    tradeCapacity: 25,
    allowedZones: ['commercial', 'financial', 'tech_park', 'sez', 'government', 'industrial'],
    accentColor,
    roofColor,
    wallColor: '#cbd5e1',
    xpOnBuild: 220,
  });
}

function megaFactoryBldg(
  id: string,
  name: string,
  width: number,
  height: number,
  desc: string,
  recipe: ProductionRecipe,
  opts: Partial<BuildingDef> = {}
): BuildingDef {
  return mkBldg({
    id,
    name,
    category: opts.category ?? 'industrial',
    subCategory: 'mega_factory',
    description: desc,
    unlockLevel: opts.unlockLevel ?? 6,
    coinCost: opts.coinCost ?? Math.round(1100 + width * height * 28),
    materialCost: opts.materialCost ?? { building_materials: 35, stone: 25, bricks: 20 },
    width,
    height,
    footprintRotatable: true,
    isLargeFactory: true,
    buildTime: opts.buildTime ?? 28,
    minWorkers: opts.minWorkers ?? 6,
    maxWorkers: opts.maxWorkers ?? Math.min(200, Math.max(16, Math.round(width * height * 0.8))),
    workerClass: opts.workerClass ?? 'engineer',
    upkeepPerMin: opts.upkeepPerMin ?? Math.round(18 + width * height * 0.45),
    maxLevel: 5,
    requiresRoad: true,
    minRoadTier: opts.minRoadTier ?? 2,
    powerDemand: opts.powerDemand ?? Math.round(4 + width * height * 0.12),
    waterDemand: opts.waterDemand ?? Math.round(2 + width * height * 0.08),
    pollutionDelta: opts.pollutionDelta ?? 6,
    truckCapacity: opts.truckCapacity ?? Math.max(4, Math.round((width + height) * 0.6)),
    warehouseBonus: opts.warehouseBonus ?? Math.round(width * height * 3),
    storageCapacityBonus: opts.storageCapacityBonus ?? Math.round(width * height * 4),
    recipe,
    accentColor: opts.accentColor ?? '#f59e0b',
    roofColor: opts.roofColor ?? '#334155',
    wallColor: opts.wallColor ?? '#64748b',
    xpOnBuild: opts.xpOnBuild ?? Math.round(220 + width * height * 4),
    ...opts,
  });
}

function farmBldg(
  id: string,
  name: string,
  desc: string,
  recipe: ProductionRecipe | undefined,
  opts: Partial<BuildingDef> = {}
): BuildingDef {
  return mkBldg({
    id,
    name,
    category: 'agricultural',
    subCategory: 'farming',
    description: desc,
    unlockLevel: opts.unlockLevel ?? 2,
    coinCost: opts.coinCost ?? 160,
    materialCost: opts.materialCost ?? { wood: 10 },
    width: opts.width ?? 2,
    height: opts.height ?? 2,
    footprintRotatable: true,
    buildTime: opts.buildTime ?? 10,
    minWorkers: opts.minWorkers ?? 1,
    maxWorkers: opts.maxWorkers ?? 6,
    workerClass: opts.workerClass ?? 'laborer',
    upkeepPerMin: opts.upkeepPerMin ?? 4,
    maxLevel: 5,
    requiresRoad: opts.requiresRoad ?? true,
    waterDemand: opts.waterDemand ?? 2,
    recipe,
    accentColor: opts.accentColor ?? '#84cc16',
    roofColor: opts.roofColor ?? '#b45309',
    wallColor: opts.wallColor ?? '#fef3c7',
    xpOnBuild: opts.xpOnBuild ?? 65,
    ...opts,
  });
}

function fishBldg(
  id: string,
  name: string,
  desc: string,
  recipe: ProductionRecipe | undefined,
  opts: Partial<BuildingDef> = {}
): BuildingDef {
  return mkBldg({
    id,
    name,
    category: 'agricultural',
    subCategory: 'fishing',
    description: desc,
    unlockLevel: opts.unlockLevel ?? 2,
    coinCost: opts.coinCost ?? 220,
    materialCost: opts.materialCost ?? { wood: 14, stone: 4 },
    width: opts.width ?? 2,
    height: opts.height ?? 2,
    footprintRotatable: true,
    buildTime: opts.buildTime ?? 12,
    minWorkers: opts.minWorkers ?? 2,
    maxWorkers: opts.maxWorkers ?? 8,
    workerClass: opts.workerClass ?? 'laborer',
    upkeepPerMin: opts.upkeepPerMin ?? 6,
    maxLevel: 5,
    requiresRoad: opts.requiresRoad ?? true,
    requiresCoast: opts.requiresCoast ?? true,
    allowedZones: ['fishing', 'port', 'agricultural', 'sez'],
    recipe,
    accentColor: opts.accentColor ?? '#38bdf8',
    roofColor: opts.roofColor ?? '#0369a1',
    wallColor: opts.wallColor ?? '#e0f2fe',
    xpOnBuild: opts.xpOnBuild ?? 80,
    ...opts,
  });
}

function transitBldg(
  id: string,
  name: string,
  transitKind: BuildingDef['transitKind'],
  desc: string,
  opts: Partial<BuildingDef> = {}
): BuildingDef {
  return mkBldg({
    id,
    name,
    category: 'transportation',
    subCategory: 'transit',
    transitKind,
    description: desc,
    unlockLevel: opts.unlockLevel ?? 3,
    coinCost: opts.coinCost ?? 280,
    materialCost: opts.materialCost ?? { stone: 10, building_materials: 6 },
    width: opts.width ?? 2,
    height: opts.height ?? 1,
    footprintRotatable: true,
    buildTime: opts.buildTime ?? 12,
    minWorkers: opts.minWorkers ?? 1,
    maxWorkers: opts.maxWorkers ?? 6,
    workerClass: opts.workerClass ?? 'artisan',
    upkeepPerMin: opts.upkeepPerMin ?? 8,
    maxLevel: 5,
    requiresRoad: true,
    powerDemand: opts.powerDemand ?? 2,
    logisticsBoost: opts.logisticsBoost ?? 0.08,
    happinessBonus: opts.happinessBonus ?? 3,
    taxPerMin: opts.taxPerMin ?? 8,
    accentColor: opts.accentColor ?? '#38bdf8',
    roofColor: opts.roofColor ?? '#1e40af',
    wallColor: opts.wallColor ?? '#e2e8f0',
    xpOnBuild: opts.xpOnBuild ?? 95,
    ...opts,
  });
}

function resTowerBldg(
  id: string,
  name: string,
  housingCapacity: number,
  width: number,
  height: number,
  desc: string,
  opts: Partial<BuildingDef> = {}
): BuildingDef {
  return mkBldg({
    id,
    name,
    category: 'residential',
    subCategory: 'skyscraper',
    description: desc,
    unlockLevel: opts.unlockLevel ?? (housingCapacity >= 300 ? 12 : housingCapacity >= 80 ? 7 : 2),
    coinCost: opts.coinCost ?? Math.round(120 + housingCapacity * 6),
    materialCost: opts.materialCost ?? {
      wood: Math.min(40, Math.max(8, Math.round(housingCapacity * 0.12))),
      bricks: Math.min(60, Math.max(0, Math.round(housingCapacity * 0.08))),
    },
    width,
    height,
    footprintRotatable: width !== height,
    buildTime: opts.buildTime ?? Math.min(45, Math.max(8, Math.round(8 + housingCapacity * 0.03))),
    minWorkers: 0,
    maxWorkers: 0,
    workerClass: 'laborer',
    upkeepPerMin: Math.max(2, Math.round(housingCapacity * 0.04)),
    maxLevel: 5,
    requiresRoad: true,
    powerDemand: Math.max(1, Math.round(housingCapacity * 0.03)),
    waterDemand: Math.max(1, Math.round(housingCapacity * 0.04)),
    housingCapacity,
    taxPerMin: Math.max(4, Math.round(housingCapacity * 0.25)),
    happinessBonus: opts.happinessBonus ?? (housingCapacity >= 500 ? 5 : 2),
    accentColor: opts.accentColor ?? '#38bdf8',
    roofColor: opts.roofColor ?? '#1e293b',
    wallColor: opts.wallColor ?? '#cbd5e1',
    xpOnBuild: Math.max(45, Math.round(40 + housingCapacity * 0.6)),
    ...opts,
  });
}

export const EXPANSION_BUILDINGS: Record<string, BuildingDef> = {
  // =========================================================================
  // 1. GOVERNMENT & ADMINISTRATION (16)
  // =========================================================================
  city_hall: govBldg('city_hall', 'City Hall', 'Municipal seat managing local taxes, charters, and civic growth.', {
    unlockLevel: 2,
    coinCost: 480,
    width: 3,
    height: 3,
    taxPerMin: 22,
    happinessBonus: 6,
    safetyBonus: 5,
    serviceRadius: 24,
    roofColor: '#1e40af',
  }),
  gov_hq: govBldg('gov_hq', 'Government Headquarters', 'Central administrative headquarters boosting district efficiency.', {
    unlockLevel: 5,
    coinCost: 1150,
    width: 3,
    height: 3,
    taxPerMin: 35,
    happinessBonus: 7,
    serviceRadius: 28,
    roofColor: '#0f172a',
  }),
  parliament: govBldg('parliament', 'Parliament Building', 'Grand legislative assembly boosting city stability and policy yield.', {
    unlockLevel: 8,
    coinCost: 1850,
    width: 4,
    height: 3,
    taxPerMin: 48,
    happinessBonus: 10,
    safetyBonus: 8,
    serviceRadius: 32,
    roofColor: '#b45309',
  }),
  ministry_finance: govBldg('ministry_finance', 'Ministry of Finance', 'Regulates treasury reserves, tax collection, and banking output.', {
    unlockLevel: 6,
    coinCost: 920,
    taxPerMin: 45,
    tradeCapacity: 30,
    roofColor: '#065f46',
  }),
  ministry_trade: govBldg('ministry_trade', 'Ministry of Trade', 'Expands international export quotas and lowers customs friction.', {
    unlockLevel: 6,
    coinCost: 940,
    tradeCapacity: 85,
    exportsSurplus: true,
    taxPerMin: 26,
    roofColor: '#0e7490',
  }),
  ministry_agriculture: govBldg('ministry_agriculture', 'Ministry of Agriculture', 'Coordinates national grain, orchard, and farm productivity.', {
    unlockLevel: 4,
    coinCost: 680,
    granaryBonus: 200,
    happinessBonus: 4,
    roofColor: '#15803d',
  }),
  ministry_transport: govBldg('ministry_transport', 'Ministry of Transport', 'Coordinates road, rail, and port logistics throughput.', {
    unlockLevel: 5,
    coinCost: 820,
    logisticsBoost: 0.18,
    taxPerMin: 18,
    roofColor: '#1d4ed8',
  }),
  regional_tax_office: govBldg('regional_tax_office', 'Revenue Tax Office', 'Audits corporate and commercial tax collection across districts.', {
    unlockLevel: 3,
    coinCost: 420,
    taxPerMin: 36,
    happinessBonus: 0,
    roofColor: '#ca8a04',
  }),
  immigration_office: govBldg('immigration_office', 'Immigration Office', 'Attracts skilled professionals and accelerates population growth.', {
    unlockLevel: 4,
    coinCost: 560,
    happinessBonus: 5,
    housingCapacity: 20,
    roofColor: '#0284c7',
  }),
  employment_office: govBldg('employment_office', 'Employment Office', 'Matches unemployed citizens to factories, offices, and services.', {
    unlockLevel: 3,
    coinCost: 440,
    logisticsBoost: 0.08,
    happinessBonus: 4,
    roofColor: '#4f46e5',
  }),
  courthouse: govBldg('courthouse', 'Court House', 'Upholds civic law, contract enforcement, and public safety.', {
    unlockLevel: 5,
    coinCost: 780,
    safetyBonus: 18,
    happinessBonus: 5,
    roofColor: '#475569',
  }),
  police_hq: govBldg('police_hq', 'Police Headquarters', 'City-wide policing command raising district safety coverage.', {
    unlockLevel: 4,
    coinCost: 720,
    safetyBonus: 28,
    happinessBonus: 4,
    serviceRadius: 26,
    roofColor: '#1e3a8a',
  }),
  fire_department: govBldg('fire_department', 'Fire Department', 'Protects factories and skyscrapers, reducing building upkeep.', {
    unlockLevel: 3,
    coinCost: 540,
    safetyBonus: 16,
    happinessBonus: 4,
    serviceRadius: 22,
    roofColor: '#dc2626',
  }),
  post_office: govBldg('post_office', 'Post Office', 'Speeds up civic mail, parcel delivery, and neighborhood satisfaction.', {
    unlockLevel: 2,
    coinCost: 290,
    width: 2,
    height: 1,
    logisticsBoost: 0.06,
    happinessBonus: 3,
    roofColor: '#b91c1c',
  }),
  census_office: govBldg('census_office', 'Census Office', 'Tracks live citizen demographics, professions, and district data.', {
    unlockLevel: 3,
    coinCost: 410,
    rpPerMin: 6,
    taxPerMin: 10,
    roofColor: '#0f766e',
  }),
  public_records_office: govBldg('public_records_office', 'Public Records Office', 'Maintains land deeds, corporate registries, and municipal archives.', {
    unlockLevel: 4,
    coinCost: 460,
    rpPerMin: 8,
    taxPerMin: 12,
    roofColor: '#334155',
  }),

  // =========================================================================
  // 2. MARKETS, EXPORT & IMPORT (28)
  // =========================================================================
  street_market: marketTradeBldg('street_market', 'Street Market', 'market', 'Bustling neighborhood stalls selling local farm & craft goods.', {
    unlockLevel: 1,
    coinCost: 140,
    width: 2,
    height: 1,
    taxPerMin: 10,
    tradeCapacity: 15,
  }),
  farmers_market: marketTradeBldg('farmers_market', 'Farmers Market', 'market', 'Direct agricultural produce exchange connecting farms and households.', {
    unlockLevel: 2,
    coinCost: 240,
    taxPerMin: 15,
    granaryBonus: 60,
    tradeCapacity: 25,
    roofColor: '#15803d',
  }),
  fish_market: marketTradeBldg('fish_market', 'Fish Market', 'market', 'Fresh coastal catch exchange supporting seafood demand.', {
    unlockLevel: 2,
    coinCost: 260,
    taxPerMin: 16,
    granaryBonus: 50,
    tradeCapacity: 25,
    roofColor: '#0284c7',
  }),
  meat_market: marketTradeBldg('meat_market', 'Meat Market', 'market', 'Butchery and livestock meat distribution stall.', {
    unlockLevel: 4,
    coinCost: 340,
    taxPerMin: 18,
    granaryBonus: 50,
    roofColor: '#991b1b',
  }),
  wholesale_market: marketTradeBldg('wholesale_market', 'Wholesale Market', 'market', 'Bulk commercial distribution hub supplying shops and restaurants.', {
    unlockLevel: 4,
    coinCost: 480,
    width: 3,
    height: 2,
    taxPerMin: 28,
    warehouseBonus: 120,
    tradeCapacity: 50,
  }),
  central_food_market: marketTradeBldg('central_food_market', 'Central Food Market', 'market', 'Large covered food hall increasing food access & retail tax.', {
    unlockLevel: 5,
    coinCost: 620,
    width: 3,
    height: 2,
    taxPerMin: 32,
    granaryBonus: 180,
    happinessBonus: 5,
  }),
  shopping_mall: marketTradeBldg('shopping_mall', 'Shopping Mall', 'market', 'Multi-store indoor mall driving retail tax and recreation.', {
    unlockLevel: 7,
    coinCost: 1150,
    width: 3,
    height: 3,
    taxPerMin: 56,
    recreationBonus: 10,
    happinessBonus: 6,
    roofColor: '#7c3aed',
  }),
  department_store: marketTradeBldg('department_store', 'Department Store', 'market', 'Multi-floor urban emporium retailing clothing, furniture & tools.', {
    unlockLevel: 6,
    coinCost: 820,
    taxPerMin: 40,
    tradeCapacity: 40,
    roofColor: '#4f46e5',
  }),
  supermarket: marketTradeBldg('supermarket', 'Supermarket', 'market', 'Modern grocery store distributing bread, milk, produce & packaged food.', {
    unlockLevel: 5,
    coinCost: 590,
    taxPerMin: 30,
    granaryBonus: 120,
    roofColor: '#059669',
  }),
  hypermarket: marketTradeBldg('hypermarket', 'Hypermarket', 'market', 'Massive retail warehouse combining food and consumer goods.', {
    unlockLevel: 9,
    coinCost: 1450,
    width: 4,
    height: 3,
    taxPerMin: 72,
    warehouseBonus: 200,
    granaryBonus: 150,
    roofColor: '#1d4ed8',
  }),
  industrial_supply_market: marketTradeBldg('industrial_supply_market', 'Industrial Supply Market', 'market', 'Supplies tools, steel, and industrial parts directly to factories.', {
    unlockLevel: 7,
    coinCost: 780,
    taxPerMin: 34,
    warehouseBonus: 160,
    importsUnavailable: true,
    tradeCapacity: 60,
  }),
  construction_materials_market: marketTradeBldg('construction_materials_market', 'Construction Materials Market', 'market', 'Supplies bricks, cement, glass, and timber for rapid city growth.', {
    unlockLevel: 5,
    coinCost: 620,
    taxPerMin: 28,
    warehouseBonus: 180,
    tradeCapacity: 55,
  }),
  furniture_market: marketTradeBldg('furniture_market', 'Furniture Market', 'market', 'Showroom retailing plywood crafts and fine wood furniture.', {
    unlockLevel: 6,
    coinCost: 540,
    taxPerMin: 30,
    tradeCapacity: 35,
  }),
  electronics_market: marketTradeBldg('electronics_market', 'Electronics Market', 'market', 'High-tech marketplace retailing appliances, computers & chips.', {
    unlockLevel: 10,
    coinCost: 980,
    taxPerMin: 55,
    tradeCapacity: 50,
    roofColor: '#0284c7',
  }),
  automobile_market: marketTradeBldg('automobile_market', 'Automobile Market', 'market', 'Dealership showroom selling cars, trucks, and transit buses.', {
    unlockLevel: 12,
    coinCost: 1250,
    width: 3,
    height: 2,
    taxPerMin: 68,
    tradeCapacity: 60,
    roofColor: '#b91c1c',
  }),
  international_trade_center: marketTradeBldg('international_trade_center', 'International Trade Center', 'trade_port', 'Flagship commerce tower executing automated foreign exports and forex deals.', {
    unlockLevel: 8,
    coinCost: 1650,
    width: 3,
    height: 3,
    tradeCapacity: 180,
    exportsSurplus: true,
    importsUnavailable: true,
    taxPerMin: 80,
    allowedZones: ['commercial', 'epz', 'financial', 'port', 'sez'],
  }),
  export_processing_center: marketTradeBldg('export_processing_center', 'Export Processing Center', 'trade_port', 'Packages surplus factory production and earns foreign currency.', {
    unlockLevel: 6,
    coinCost: 1050,
    tradeCapacity: 140,
    exportsSurplus: true,
    warehouseBonus: 150,
    allowedZones: ['epz', 'industrial', 'port', 'logistics', 'sez'],
  }),
  import_distribution_center: marketTradeBldg('import_distribution_center', 'Import Distribution Center', 'trade_port', 'Automatically imports scarce raw inputs required by local factories.', {
    unlockLevel: 6,
    coinCost: 1020,
    tradeCapacity: 130,
    importsUnavailable: true,
    warehouseBonus: 150,
    allowedZones: ['logistics', 'port', 'commercial', 'industrial', 'sez'],
  }),
  customs_clearance_office: marketTradeBldg('customs_clearance_office', 'Customs Clearance Office', 'trade_port', 'Manages import/export inspection capacity and reduces customs tariff loss.', {
    unlockLevel: 5,
    coinCost: 760,
    tradeCapacity: 120,
    isCustoms: true,
    taxPerMin: 32,
  }),
  container_freight_terminal: marketTradeBldg('container_freight_terminal', 'Container Freight Terminal', 'trade_port', 'Intermodal yard staging export containers and factory freight.', {
    unlockLevel: 8,
    coinCost: 1350,
    width: 4,
    height: 3,
    tradeCapacity: 200,
    warehouseBonus: 320,
    exportsSurplus: true,
    logisticsBoost: 0.15,
  }),
  international_shipping_port: marketTradeBldg('international_shipping_port', 'International Shipping Port', 'trade_port', 'Deep-water container port handling overseas bulk exports & imports.', {
    unlockLevel: 7,
    coinCost: 1800,
    width: 4,
    height: 3,
    requiresCoast: true,
    tradeCapacity: 280,
    exportsSurplus: true,
    importsUnavailable: true,
    warehouseBonus: 360,
    allowedZones: ['port', 'epz', 'logistics', 'sez'],
  }),
  cargo_airport: marketTradeBldg('cargo_airport', 'Cargo Airport', 'trade_port', 'High-speed air-freight hub exporting electronics and luxury goods.', {
    unlockLevel: 12,
    coinCost: 2600,
    width: 5,
    height: 4,
    isLargeFactory: true,
    tradeCapacity: 320,
    exportsSurplus: true,
    importsUnavailable: true,
    warehouseBonus: 300,
    allowedZones: ['logistics', 'epz', 'commercial', 'industrial', 'sez'],
  }),
  inland_container_depot: marketTradeBldg('inland_container_depot', 'Inland Container Depot', 'trade_port', 'Dry-port logistics hub storing and sorting container cargo.', {
    unlockLevel: 7,
    coinCost: 980,
    width: 3,
    height: 3,
    warehouseBonus: 420,
    tradeCapacity: 110,
    logisticsBoost: 0.12,
  }),
  export_warehouse: marketTradeBldg('export_warehouse', 'Export Warehouse', 'trade_port', 'Dedicated export storage staging surplus goods for foreign buyers.', {
    unlockLevel: 5,
    coinCost: 620,
    warehouseBonus: 350,
    exportsSurplus: true,
    tradeCapacity: 90,
  }),
  import_warehouse: marketTradeBldg('import_warehouse', 'Import Warehouse', 'trade_port', 'Buffers imported industrial raw materials and spare components.', {
    unlockLevel: 5,
    coinCost: 620,
    warehouseBonus: 350,
    importsUnavailable: true,
    tradeCapacity: 90,
  }),
  cold_storage_export_center: marketTradeBldg('cold_storage_export_center', 'Cold Storage Export Center', 'trade_port', 'Refrigerated export facility for seafood, meat, dairy, and produce.', {
    unlockLevel: 6,
    coinCost: 840,
    granaryBonus: 420,
    exportsSurplus: true,
    tradeCapacity: 110,
  }),
  international_trade_bank: marketTradeBldg('international_trade_bank', 'International Trade Bank', 'trade_port', 'Finances letters of credit, boosts export profit, and earns forex yield.', {
    unlockLevel: 9,
    coinCost: 1450,
    taxPerMin: 75,
    tradeCapacity: 140,
    exportsSurplus: true,
    allowedZones: ['financial', 'commercial', 'epz', 'sez'],
  }),
  commodity_exchange_center: marketTradeBldg('commodity_exchange_center', 'Commodity Exchange Center', 'trade_port', 'Real-time commodities trading floor stabilizing prices and margins.', {
    unlockLevel: 10,
    coinCost: 1580,
    width: 3,
    height: 3,
    taxPerMin: 82,
    tradeCapacity: 200,
    exportsSurplus: true,
    allowedZones: ['financial', 'commercial', 'epz', 'sez'],
  }),

  // =========================================================================
  // 3. CORPORATE OFFICES (18 organizations, Lv.1..5)
  // =========================================================================
  corp_general_hq: corpBldg('corp_general_hq', 'Corporate Headquarters', 'General Commerce', 'engineer', 'Multi-sector management group employing executives and analysts.', '#f59e0b', '#1e293b', 4),
  corp_banking_hq: corpBldg('corp_banking_hq', 'Banking Headquarters', 'Banking & Finance', 'engineer', 'Commercial and investment banking hub fueling business expansion.', '#22c55e', '#064e3b', 5),
  corp_tech_hq: corpBldg('corp_tech_hq', 'Technology Headquarters', 'Technology', 'engineer', 'Software and hardware corporation driving innovation and electronics.', '#38bdf8', '#312e81', 7),
  corp_engineering: corpBldg('corp_engineering', 'Engineering Company', 'Engineering', 'engineer', 'Civil and industrial engineering consultancy boosting infrastructure.', '#06b6d4', '#0f172a', 5),
  corp_construction: corpBldg('corp_construction', 'Construction Company', 'Construction', 'artisan', 'Major contractor accelerating urban and factory development.', '#f97316', '#7c2d12', 4),
  corp_logistics_hq: corpBldg('corp_logistics_hq', 'Logistics Headquarters', 'Logistics', 'artisan', 'Coordinates national trucking fleets and supply-chain warehouses.', '#eab308', '#422006', 5),
  corp_shipping: corpBldg('corp_shipping', 'Shipping Company', 'Maritime Shipping', 'artisan', 'International freight carrier increasing export earnings.', '#0ea5e9', '#0c4a6e', 6),
  corp_agricultural: corpBldg('corp_agricultural', 'Agricultural Corporation', 'Agribusiness', 'laborer', 'Agribusiness syndicate boosting grain, produce, and livestock yields.', '#84cc16', '#365314', 4),
  corp_fishing: corpBldg('corp_fishing', 'Fishing Corporation', 'Commercial Fishing', 'laborer', 'Deep-sea trawler fleet operator raising seafood output and exports.', '#0284c7', '#164e63', 4),
  corp_manufacturing_hq: corpBldg('corp_manufacturing_hq', 'Manufacturing Headquarters', 'Manufacturing', 'engineer', 'Industrial conglomerate optimizing factory throughput.', '#fb923c', '#431407', 7),
  corp_energy: corpBldg('corp_energy', 'Energy Corporation', 'Energy & Power', 'engineer', 'Power utility and renewables operator stabilizing grid supply.', '#facc15', '#1e293b', 6),
  corp_mining: corpBldg('corp_mining', 'Mining Corporation', 'Mining & Metals', 'laborer', 'Resource extraction firm managing quarries, mines, and smelters.', '#94a3b8', '#27272a', 6),
  corp_media_hq: corpBldg('corp_media_hq', 'Media Headquarters', 'Media & Press', 'artisan', 'Broadcast and publishing house lifting civic awareness and commerce.', '#ec4899', '#500724', 6),
  corp_insurance: corpBldg('corp_insurance', 'Insurance Company', 'Insurance', 'artisan', 'Underwrites business risk and generates steady financial returns.', '#10b981', '#065f46', 5),
  corp_research_hq: corpBldg('corp_research_hq', 'Research Headquarters', 'R&D', 'engineer', 'Corporate R&D campus generating Research Points and patents.', '#a855f7', '#3b0764', 8),
  corp_real_estate_hq: corpBldg('corp_real_estate_hq', 'Real Estate Headquarters', 'Real Estate', 'artisan', 'Property developer boosting residential towers and land values.', '#f43f5e', '#4c0519', 5),
  corp_telecom: corpBldg('corp_telecom', 'Telecommunications Office', 'Telecommunications', 'engineer', 'Operates fiber, cellular towers, and enterprise networks.', '#6366f1', '#1e1b4b', 7),
  corp_aviation_hq: corpBldg('corp_aviation_hq', 'Aviation Headquarters', 'Aviation', 'engineer', 'Regional airline and cargo flight operations headquarters.', '#3b82f6', '#0f172a', 9),

  // =========================================================================
  // 4. NEW INDUSTRIES & MEGA-FACTORIES (5x5, 8x10, 8x15, 10x7)
  // =========================================================================
  // --- TIMBER INDUSTRY ---

  sawmill_mega: megaFactoryBldg(
    'sawmill_mega',
    'Industrial Sawmill',
    5,
    5,
    '5×5 high-throughput sawmill processing harvested logs into precision lumber & building materials.',
    { inputs: { wood: 25 }, outputs: { building_materials: 45 }, cycleSeconds: 18, xpPerCycle: 28 },
    { unlockLevel: 4, workerClass: 'artisan', allowedZones: ['forestry', 'industrial', 'sez'], roofColor: '#92400e' }
  ),
  plywood_factory: megaFactoryBldg(
    'plywood_factory',
    'Plywood Factory',
    5,
    5,
    '5×5 engineered wood plant pressing timber veneers into industrial Plywood.',
    { inputs: { wood: 22 }, outputs: { plywood: 32 }, cycleSeconds: 20, xpPerCycle: 26 },
    { unlockLevel: 5, workerClass: 'artisan', allowedZones: ['forestry', 'industrial', 'sez'], roofColor: '#a16207' }
  ),
  mega_furniture_factory: megaFactoryBldg(
    'mega_furniture_factory',
    'Mega Furniture Factory',
    8,
    10,
    '8×10 mass-production furniture complex crafting Plywood & textiles into fine Furniture.',
    { inputs: { plywood: 16, wood: 14, textiles: 6 }, outputs: { furniture: 42 }, cycleSeconds: 24, xpPerCycle: 44 },
    { unlockLevel: 7, workerClass: 'artisan', allowedZones: ['industrial', 'heavy_industrial', 'epz', 'sez'], roofColor: '#78350f' }
  ),
  mega_paper_factory: megaFactoryBldg(
    'mega_paper_factory',
    'Mega Paper Factory',
    5,
    5,
    '5×5 automated pulp & paper mill supplying Paper to schools, offices, and printing.',
    { inputs: { wood: 20, chemicals: 2 }, outputs: { paper: 40 }, cycleSeconds: 20, xpPerCycle: 30 },
    { unlockLevel: 6, workerClass: 'artisan', allowedZones: ['forestry', 'industrial', 'sez'], roofColor: '#cbd5e1' }
  ),

  // --- MINING INDUSTRY ---
  regional_stone_quarry: megaFactoryBldg(
    'regional_stone_quarry',
    'Mega Stone Quarry',
    5,
    5,
    '5×5 mechanized open-pit quarry extracting high volumes of structural Stone.',
    { inputs: {}, outputs: { stone: 65 }, cycleSeconds: 18, xpPerCycle: 25 },
    { unlockLevel: 3, workerClass: 'laborer', allowedZones: ['mining', 'industrial', 'heavy_industrial', 'sez'], roofColor: '#57534e' }
  ),
  deep_iron_mine: megaFactoryBldg(
    'deep_iron_mine',
    'Deep Iron Mine',
    5,
    5,
    '5×5 industrial shaft mine extracting continuous Iron Ore.',
    { inputs: {}, outputs: { iron_ore: 55 }, cycleSeconds: 20, xpPerCycle: 32 },
    { unlockLevel: 6, workerClass: 'laborer', allowedZones: ['mining', 'industrial', 'heavy_industrial', 'sez'], roofColor: '#475569' }
  ),
  deep_coal_mine: megaFactoryBldg(
    'deep_coal_mine',
    'Deep Coal Mine',
    5,
    5,
    '5×5 mechanized coal extraction plant fueling smelters and power stations.',
    { inputs: {}, outputs: { coal: 60 }, cycleSeconds: 18, xpPerCycle: 30 },
    { unlockLevel: 6, workerClass: 'laborer', allowedZones: ['mining', 'industrial', 'heavy_industrial', 'sez'], roofColor: '#1e293b' }
  ),
  deep_copper_mine: megaFactoryBldg(
    'deep_copper_mine',
    'Deep Copper Mine',
    5,
    5,
    '5×5 automated copper shaft supplying wiring and electronics plants.',
    { inputs: {}, outputs: { copper_ore: 50 }, cycleSeconds: 20, xpPerCycle: 32 },
    { unlockLevel: 7, workerClass: 'laborer', allowedZones: ['mining', 'industrial', 'heavy_industrial', 'sez'], roofColor: '#9a3412' }
  ),
  mineral_processing_plant: megaFactoryBldg(
    'mineral_processing_plant',
    'Mineral Processing Plant',
    8,
    10,
    '8×10 ore concentrator refining raw ores into Iron Ingots, Copper Ingots, and Silver.',
    { inputs: { iron_ore: 16, copper_ore: 12, coal: 8 }, outputs: { iron_ingots: 28, copper_ingots: 22 }, cycleSeconds: 24, xpPerCycle: 48 },
    { unlockLevel: 8, workerClass: 'engineer', allowedZones: ['mining', 'heavy_industrial', 'industrial', 'sez'], roofColor: '#0f172a' }
  ),

  // --- STEEL INDUSTRY ---
  heavy_iron_smelter: megaFactoryBldg(
    'heavy_iron_smelter',
    'Heavy Iron Smelter',
    5,
    5,
    '5×5 blast furnace smelting Iron Ore and Coal into Iron Ingots.',
    { inputs: { iron_ore: 20, coal: 10 }, outputs: { iron_ingots: 32 }, cycleSeconds: 20, xpPerCycle: 34 },
    { unlockLevel: 7, allowedZones: ['heavy_industrial', 'industrial', 'mining', 'sez'], roofColor: '#7c2d12' }
  ),
  steel_mill_mega: megaFactoryBldg(
    'steel_mill_mega',
    'Steel Mill Complex',
    8,
    10,
    '8×10 basic-oxygen steelworks producing high-grade Steel beams.',
    { inputs: { iron_ingots: 22, coal: 12 }, outputs: { steel: 44 }, cycleSeconds: 22, xpPerCycle: 52 },
    { unlockLevel: 10, allowedZones: ['heavy_industrial', 'industrial', 'sez'], roofColor: '#334155' }
  ),
  metal_processing_factory: megaFactoryBldg(
    'metal_processing_factory',
    'Metal Processing Factory',
    10,
    7,
    '10×7 rolling & stamping plant fabricating Tools and Auto Parts.',
    { inputs: { steel: 18, copper_ingots: 10 }, outputs: { tools: 28, car_parts: 24 }, cycleSeconds: 24, xpPerCycle: 55 },
    { unlockLevel: 11, allowedZones: ['heavy_industrial', 'industrial', 'epz', 'sez'], roofColor: '#475569' }
  ),
  heavy_machinery_factory: megaFactoryBldg(
    'heavy_machinery_factory',
    'Heavy Machinery Factory',
    8,
    15,
    '8×15 mega engineering works manufacturing heavy industrial Machinery.',
    { inputs: { steel: 30, iron_ingots: 20, electronics: 8 }, outputs: { machinery: 38 }, cycleSeconds: 28, xpPerCycle: 72 },
    { unlockLevel: 14, maxWorkers: 180, allowedZones: ['heavy_industrial', 'industrial', 'sez'], roofColor: '#1e293b' }
  ),

  // --- AUTOMOTIVE INDUSTRY ---
  auto_parts_factory: megaFactoryBldg(
    'auto_parts_factory',
    'Automobile Parts Factory',
    5,
    5,
    '5×5 precision plant stamping engines, transmissions, and Auto Parts.',
    { inputs: { steel: 14, rubber: 8, glass: 6 }, outputs: { car_parts: 32 }, cycleSeconds: 20, xpPerCycle: 38 },
    { unlockLevel: 11, roofColor: '#475569' }
  ),
  car_factory: megaFactoryBldg(
    'car_factory',
    'Car Assembly Mega-Factory',
    8,
    10,
    '8×10 robotic assembly plant producing consumer Automobiles for domestic sale & export.',
    { inputs: { car_parts: 20, steel: 12, electronics: 6 }, outputs: { cars: 22 }, cycleSeconds: 26, xpPerCycle: 68 },
    { unlockLevel: 13, exportsSurplus: true, roofColor: '#b91c1c' }
  ),
  truck_factory: megaFactoryBldg(
    'truck_factory',
    'Heavy Truck Factory',
    8,
    10,
    '8×10 commercial vehicle plant assembling Heavy Trucks for industrial logistics.',
    { inputs: { car_parts: 22, steel: 18, machinery: 6 }, outputs: { trucks: 18 }, cycleSeconds: 28, xpPerCycle: 74 },
    { unlockLevel: 14, exportsSurplus: true, roofColor: '#ea580c' }
  ),
  bus_factory: megaFactoryBldg(
    'bus_factory',
    'Transit Bus Factory',
    10,
    7,
    '10×7 coachbuilding complex manufacturing city Transit Buses.',
    { inputs: { car_parts: 18, steel: 16, glass: 8 }, outputs: { buses: 16 }, cycleSeconds: 26, xpPerCycle: 66 },
    { unlockLevel: 14, roofColor: '#1d4ed8' }
  ),

  // --- FOOD & AGRICULTURAL INDUSTRIES ---
  mega_grain_mill: megaFactoryBldg(
    'mega_grain_mill',
    'Mega Grain Mill',
    5,
    5,
    '5×5 automated roller mill grinding Wheat and Corn into enriched Flour.',
    { inputs: { wheat: 24 }, outputs: { flour: 36 }, cycleSeconds: 16, xpPerCycle: 24 },
    { unlockLevel: 4, category: 'production', workerClass: 'artisan', pollutionDelta: 1, roofColor: '#d97706' }
  ),
  industrial_bakery: megaFactoryBldg(
    'industrial_bakery',
    'Industrial Bakery',
    5,
    5,
    '5×5 continuous tunnel-oven complex producing city-scale Bread supply.',
    { inputs: { flour: 22, sugar: 6 }, outputs: { bread: 65 }, cycleSeconds: 18, xpPerCycle: 30 },
    { unlockLevel: 5, category: 'production', workerClass: 'artisan', pollutionDelta: 2, roofColor: '#b45309' }
  ),
  food_processing_plant: megaFactoryBldg(
    'food_processing_plant',
    'Food Processing Plant',
    8,
    10,
    '8×10 automated cannery and packaging line producing Processed Food.',
    { inputs: { vegetables: 18, corn: 14, sugar: 6 }, outputs: { processed_food: 54 }, cycleSeconds: 22, xpPerCycle: 44 },
    { unlockLevel: 6, workerClass: 'artisan', pollutionDelta: 3, roofColor: '#ea580c' }
  ),
  meat_processing_plant: megaFactoryBldg(
    'meat_processing_plant',
    'Meat Processing Plant',
    5,
    5,
    '5×5 cold-chain meat packing plant producing high-nutrition Meat & Processed Food.',
    { inputs: { corn: 12 }, outputs: { meat: 32, processed_food: 16 }, cycleSeconds: 20, xpPerCycle: 32 },
    { unlockLevel: 7, workerClass: 'artisan', pollutionDelta: 3, roofColor: '#991b1b' }
  ),
  dairy_processing_factory: megaFactoryBldg(
    'dairy_processing_factory',
    'Dairy Processing Factory',
    5,
    5,
    '5×5 pasteurization and bottling facility processing Milk & Processed Food.',
    { inputs: { milk: 18 }, outputs: { processed_food: 36 }, cycleSeconds: 18, xpPerCycle: 28 },
    { unlockLevel: 6, workerClass: 'artisan', pollutionDelta: 2, roofColor: '#0284c7' }
  ),
  grain_mega_farm: megaFactoryBldg(
    'grain_mega_farm',
    'Grain Mega-Farm',
    8,
    10,
    '8×10 mechanized agricultural estate harvesting massive Wheat & Corn yields.',
    { inputs: { fertilizer: 4 }, outputs: { wheat: 85, corn: 45 }, cycleSeconds: 20, xpPerCycle: 46 },
    { unlockLevel: 5, category: 'agricultural', workerClass: 'laborer', pollutionDelta: 1, allowedZones: ['agricultural', 'sez'], roofColor: '#ca8a04' }
  ),
  vegetable_processing_plant: megaFactoryBldg(
    'vegetable_processing_plant',
    'Vegetable Processing Plant',
    5,
    5,
    '5×5 sorting, washing, and flash-freezing plant for fresh Vegetables.',
    { inputs: { vegetables: 24 }, outputs: { processed_food: 38 }, cycleSeconds: 18, xpPerCycle: 28 },
    { unlockLevel: 5, workerClass: 'artisan', pollutionDelta: 2, roofColor: '#16a34a' }
  ),
  fruit_processing_factory: megaFactoryBldg(
    'fruit_processing_factory',
    'Fruit Processing Factory',
    5,
    5,
    '5×5 juice & preserves plant processing Fruits & Sugar.',
    { inputs: { fruits: 20, sugar: 8 }, outputs: { processed_food: 38 }, cycleSeconds: 18, xpPerCycle: 28 },
    { unlockLevel: 6, workerClass: 'artisan', pollutionDelta: 2, roofColor: '#f97316' }
  ),
  cotton_processing_plant: megaFactoryBldg(
    'cotton_processing_plant',
    'Cotton Processing Plant',
    5,
    5,
    '5×5 automated ginning plant refining raw harvest into Cotton & Textiles.',
    { inputs: {}, outputs: { cotton: 48 }, cycleSeconds: 18, xpPerCycle: 26 },
    { unlockLevel: 6, category: 'agricultural', workerClass: 'laborer', pollutionDelta: 2, roofColor: '#e2e8f0' }
  ),
  sugar_processing_factory: megaFactoryBldg(
    'sugar_processing_factory',
    'Sugar Processing Factory',
    5,
    5,
    '5×5 sugarcane refinery producing bulk Sugar.',
    { inputs: {}, outputs: { sugar: 55 }, cycleSeconds: 18, xpPerCycle: 26 },
    { unlockLevel: 5, workerClass: 'artisan', pollutionDelta: 3, roofColor: '#facc15' }
  ),

  // --- FISHING INDUSTRY ---
  fishing_port: megaFactoryBldg(
    'fishing_port',
    'Industrial Fishing Port',
    5,
    5,
    '5×5 coastal trawler dock hauling large daily Fish catches.',
    { inputs: {}, outputs: { fish: 75 }, cycleSeconds: 18, xpPerCycle: 32 },
    { unlockLevel: 4, category: 'agricultural', requiresCoast: true, workerClass: 'laborer', pollutionDelta: 2, allowedZones: ['fishing', 'port', 'sez'], roofColor: '#0284c7' }
  ),
  fish_processing_factory: megaFactoryBldg(
    'fish_processing_factory',
    'Fish Processing Factory',
    5,
    5,
    '5×5 filleting and canning plant converting Fish into Packaged Seafood.',
    { inputs: { fish: 24 }, outputs: { packaged_seafood: 36 }, cycleSeconds: 18, xpPerCycle: 30 },
    { unlockLevel: 5, allowedZones: ['fishing', 'port', 'industrial', 'epz', 'sez'], workerClass: 'artisan', pollutionDelta: 3, roofColor: '#0369a1' }
  ),
  seafood_packaging_factory: megaFactoryBldg(
    'seafood_packaging_factory',
    'Seafood Packaging Factory',
    5,
    5,
    '5×5 automated export-grade seafood cannery and vacuum packer.',
    { inputs: { fish: 20, paper: 6 }, outputs: { packaged_seafood: 42 }, cycleSeconds: 20, xpPerCycle: 34 },
    { unlockLevel: 6, exportsSurplus: true, allowedZones: ['fishing', 'port', 'epz', 'industrial', 'sez'], workerClass: 'artisan', pollutionDelta: 2, roofColor: '#0891b2' }
  ),
  fish_cold_storage: megaFactoryBldg(
    'fish_cold_storage',
    'Fish Cold Storage Complex',
    5,
    5,
    '5×5 industrial freezer facility expanding city Crop & Material storage capacity.',
    { inputs: {}, outputs: {}, cycleSeconds: 60, xpPerCycle: 10 },
    { unlockLevel: 5, category: 'storage', granaryBonus: 600, warehouseBonus: 200, pollutionDelta: 1, allowedZones: ['fishing', 'port', 'logistics', 'sez'], roofColor: '#38bdf8' }
  ),

  // --- TEXTILE INDUSTRY ---
  cotton_mill: megaFactoryBldg(
    'cotton_mill',
    'Cotton Mill',
    5,
    5,
    '5×5 spinning mill weaving raw Cotton into industrial Textiles.',
    { inputs: { cotton: 24 }, outputs: { textiles: 36 }, cycleSeconds: 18, xpPerCycle: 30 },
    { unlockLevel: 6, workerClass: 'artisan', pollutionDelta: 3, roofColor: '#7c3aed' }
  ),
  textile_factory: megaFactoryBldg(
    'textile_factory',
    'Mega Textile Factory',
    8,
    10,
    '8×10 weaving & dyeing complex outputting Textiles and Silk.',
    { inputs: { cotton: 28, chemicals: 4 }, outputs: { textiles: 56, silk: 14 }, cycleSeconds: 22, xpPerCycle: 48 },
    { unlockLevel: 7, exportsSurplus: true, workerClass: 'artisan', pollutionDelta: 5, roofColor: '#9333ea' }
  ),
  garment_factory: megaFactoryBldg(
    'garment_factory',
    'Garment Factory',
    5,
    5,
    '5×5 apparel assembly plant tailoring Textiles into Clothing.',
    { inputs: { textiles: 22 }, outputs: { clothing: 42 }, cycleSeconds: 18, xpPerCycle: 34 },
    { unlockLevel: 7, workerClass: 'artisan', pollutionDelta: 2, roofColor: '#6366f1' }
  ),
  clothing_distribution_center: megaFactoryBldg(
    'clothing_distribution_center',
    'Clothing Distribution Center',
    10,
    7,
    '10×7 apparel logistics hub adding +700 storage and exporting surplus Clothing.',
    { inputs: { textiles: 12 }, outputs: { clothing: 28 }, cycleSeconds: 22, xpPerCycle: 40 },
    { unlockLevel: 8, warehouseBonus: 700, exportsSurplus: true, tradeCapacity: 110, roofColor: '#4f46e5' }
  ),

  // --- ELECTRONICS INDUSTRY ---
  mega_electronics_factory: megaFactoryBldg(
    'mega_electronics_factory',
    'Mega Electronics Factory',
    8,
    10,
    '8×10 SMT assembly complex producing high-value Electronics.',
    { inputs: { copper_ingots: 16, glass: 10, semiconductors: 6 }, outputs: { electronics: 36 }, cycleSeconds: 24, xpPerCycle: 68 },
    { unlockLevel: 14, allowedZones: ['tech_park', 'epz', 'industrial', 'heavy_industrial', 'sez'], roofColor: '#059669' }
  ),
  semiconductor_plant: megaFactoryBldg(
    'semiconductor_plant',
    'Semiconductor Fabrication Plant',
    8,
    15,
    '8×15 ultra-clean wafer fab manufacturing Semiconductors.',
    { inputs: { sand: 22, copper_ingots: 12, chemicals: 10 }, outputs: { semiconductors: 32 }, cycleSeconds: 26, xpPerCycle: 82 },
    { unlockLevel: 15, maxWorkers: 180, allowedZones: ['tech_park', 'research', 'industrial', 'sez'], roofColor: '#0284c7' }
  ),
  computer_factory: megaFactoryBldg(
    'computer_factory',
    'Computer Factory',
    10,
    7,
    '10×7 computer hardware assembly plant manufacturing Computers for export.',
    { inputs: { semiconductors: 14, electronics: 12, glass: 8 }, outputs: { computers: 24 }, cycleSeconds: 26, xpPerCycle: 78 },
    { unlockLevel: 16, exportsSurplus: true, allowedZones: ['tech_park', 'epz', 'industrial', 'sez'], roofColor: '#4338ca' }
  ),
  electrical_equipment_factory: megaFactoryBldg(
    'electrical_equipment_factory',
    'Electrical Equipment Factory',
    5,
    5,
    '5×5 industrial transformer & switchgear works producing Electronics & Machinery.',
    { inputs: { copper_ingots: 18, steel: 10 }, outputs: { electronics: 18, machinery: 10 }, cycleSeconds: 22, xpPerCycle: 48 },
    { unlockLevel: 12, roofColor: '#0f766e' }
  ),

  // --- CHEMICAL INDUSTRY ---
  chemical_processing_plant: megaFactoryBldg(
    'chemical_processing_plant',
    'Chemical Processing Plant',
    8,
    10,
    '8×10 industrial chemical complex synthesizing Chemicals and Medicine.',
    { inputs: { coal: 16, herbs: 12 }, outputs: { chemicals: 38, medicine: 18 }, cycleSeconds: 24, xpPerCycle: 54 },
    { unlockLevel: 10, pollutionDelta: 10, roofColor: '#65a30d' }
  ),
  fertilizer_factory: megaFactoryBldg(
    'fertilizer_factory',
    'Fertilizer Factory',
    5,
    5,
    '5×5 agricultural chemistry plant producing high-yield Fertilizer.',
    { inputs: { coal: 10, chemicals: 6 }, outputs: { fertilizer: 42 }, cycleSeconds: 18, xpPerCycle: 32 },
    { unlockLevel: 8, pollutionDelta: 5, roofColor: '#15803d' }
  ),
  industrial_chemical_factory: megaFactoryBldg(
    'industrial_chemical_factory',
    'Industrial Chemical Factory',
    10,
    7,
    '10×7 petrochemical synthesis complex generating Industrial Chemicals.',
    { inputs: { coal: 24, sand: 10 }, outputs: { chemicals: 54 }, cycleSeconds: 22, xpPerCycle: 58 },
    { unlockLevel: 11, pollutionDelta: 12, roofColor: '#4d7c0f' }
  ),

  // --- CONSTRUCTION INDUSTRY ---
  mega_cement_factory: megaFactoryBldg(
    'mega_cement_factory',
    'Mega Cement Factory',
    5,
    5,
    '5×5 rotary-kiln plant producing massive Cement supply.',
    { inputs: { stone: 22, coal: 8 }, outputs: { cement: 46 }, cycleSeconds: 20, xpPerCycle: 36 },
    { unlockLevel: 8, pollutionDelta: 8, roofColor: '#78716c' }
  ),
  mega_brick_factory: megaFactoryBldg(
    'mega_brick_factory',
    'Mega Brick Factory',
    5,
    5,
    '5×5 continuous-tunnel kiln baking Bricks at industrial scale.',
    { inputs: { clay: 22, coal: 6 }, outputs: { bricks: 55 }, cycleSeconds: 18, xpPerCycle: 32 },
    { unlockLevel: 5, pollutionDelta: 6, roofColor: '#991b1b' }
  ),
  mega_glass_factory: megaFactoryBldg(
    'mega_glass_factory',
    'Mega Glass Factory',
    5,
    5,
    '5×5 float-glass furnace producing architectural Glass.',
    { inputs: { sand: 22, coal: 6 }, outputs: { glass: 42 }, cycleSeconds: 20, xpPerCycle: 34 },
    { unlockLevel: 8, pollutionDelta: 5, roofColor: '#0284c7' }
  ),
  construction_materials_factory: megaFactoryBldg(
    'construction_materials_factory',
    'Construction Materials Factory',
    8,
    10,
    '8×10 prefab assembly plant turning Wood, Stone & Cement into Building Materials.',
    { inputs: { wood: 24, stone: 20, cement: 10 }, outputs: { building_materials: 80 }, cycleSeconds: 20, xpPerCycle: 52 },
    { unlockLevel: 6, roofColor: '#b45309' }
  ),

  // --- ENERGY MANUFACTURING INDUSTRY ---
  battery_factory: megaFactoryBldg(
    'battery_factory',
    'Battery Gigafactory',
    5,
    5,
    '5×5 clean-energy storage plant producing industrial Batteries.',
    { inputs: { copper_ingots: 12, chemicals: 10 }, outputs: { batteries: 28 }, cycleSeconds: 22, xpPerCycle: 50 },
    { unlockLevel: 13, allowedZones: ['tech_park', 'industrial', 'heavy_industrial', 'sez'], roofColor: '#ca8a04' }
  ),
  solar_panel_factory: megaFactoryBldg(
    'solar_panel_factory',
    'Solar Panel Factory',
    8,
    10,
    '8×10 photovoltaic manufacturing plant assembling Solar Panels.',
    { inputs: { glass: 16, semiconductors: 8, copper_ingots: 10 }, outputs: { solar_panels: 26 }, cycleSeconds: 24, xpPerCycle: 62 },
    { unlockLevel: 14, allowedZones: ['tech_park', 'industrial', 'epz', 'sez'], roofColor: '#0369a1' }
  ),
  wind_turbine_factory: megaFactoryBldg(
    'wind_turbine_factory',
    'Wind Turbine Manufacturing Plant',
    8,
    15,
    '8×15 heavy clean-tech plant fabricating mega Wind Turbines.',
    { inputs: { steel: 28, machinery: 10, copper_ingots: 14 }, outputs: { wind_turbines: 16 }, cycleSeconds: 28, xpPerCycle: 76 },
    { unlockLevel: 15, maxWorkers: 160, allowedZones: ['heavy_industrial', 'tech_park', 'industrial', 'sez'], roofColor: '#e2e8f0' }
  ),

  // =========================================================================
  // 5. FARMING (15) & FISHING (8) SYSTEMS
  // =========================================================================
  small_farm: farmBldg('small_farm', 'Small Farm', 'Family homestead plot harvesting fresh Berries and Vegetables.', {
    inputs: {}, outputs: { berries: 8, vegetables: 6 }, cycleSeconds: 18, xpPerCycle: 6,
  }, { unlockLevel: 1, coinCost: 90 }),
  crop_farm: farmBldg('crop_farm', 'Crop Farm', 'Irrigated arable plot yielding Wheat and Vegetables.', {
    inputs: {}, outputs: { wheat: 14, vegetables: 10 }, cycleSeconds: 20, xpPerCycle: 9,
  }, { unlockLevel: 2, coinCost: 140 }),
  rice_farm: farmBldg('rice_farm', 'Rice Paddy Farm', 'High-yield wetland paddy cultivating staple grain.', {
    inputs: {}, outputs: { wheat: 18 }, cycleSeconds: 18, xpPerCycle: 9,
  }, { unlockLevel: 2, coinCost: 150, waterDemand: 4 }),
  wheat_farm_ext: farmBldg('wheat_farm_ext', 'Commercial Wheat Farm', 'Mechanized grain plot producing high volumes of Wheat.', {
    inputs: {}, outputs: { wheat: 24 }, cycleSeconds: 18, xpPerCycle: 11,
  }, { unlockLevel: 3, coinCost: 220 }),
  vegetable_farm_ext: farmBldg('vegetable_farm_ext', 'Vegetable Farm', 'Market garden growing crisp seasonal Vegetables.', {
    inputs: {}, outputs: { vegetables: 20 }, cycleSeconds: 18, xpPerCycle: 10,
  }, { unlockLevel: 3, coinCost: 200 }),
  fruit_orchard_ext: farmBldg('fruit_orchard_ext', 'Fruit Orchard', 'Terraced fruit trees harvesting sweet Fruits.', {
    inputs: {}, outputs: { fruits: 18 }, cycleSeconds: 20, xpPerCycle: 11,
  }, { unlockLevel: 4, coinCost: 240 }),
  dairy_farm_ext: farmBldg('dairy_farm_ext', 'Dairy Farm', 'Pasture barn producing fresh Milk daily.', {
    inputs: { wheat: 4 }, outputs: { milk: 16 }, cycleSeconds: 20, xpPerCycle: 12,
  }, { unlockLevel: 5, coinCost: 310 }),
  cattle_ranch: farmBldg('cattle_ranch', 'Cattle Ranch', 'Open-pasture ranch raising beef cattle and dairy herds.', {
    inputs: { corn: 4 }, outputs: { meat: 14, milk: 8 }, cycleSeconds: 22, xpPerCycle: 14,
  }, { unlockLevel: 6, coinCost: 380, width: 3, height: 2 }),
  poultry_farm: farmBldg('poultry_farm', 'Poultry Farm', 'Modern coop supplying Eggs and poultry Meat.', {
    inputs: { corn: 3 }, outputs: { eggs: 20, meat: 6 }, cycleSeconds: 18, xpPerCycle: 12,
  }, { unlockLevel: 4, coinCost: 260 }),
  pig_farm: farmBldg('pig_farm', 'Pig Farm', 'Managed livestock barn producing high-protein Meat.', {
    inputs: { vegetables: 4 }, outputs: { meat: 18 }, cycleSeconds: 20, xpPerCycle: 13,
  }, { unlockLevel: 6, coinCost: 340 }),
  sheep_farm: farmBldg('sheep_farm', 'Sheep Farm', 'Highland wool pasture producing Textiles and Meat.', {
    inputs: {}, outputs: { textiles: 10, meat: 8 }, cycleSeconds: 22, xpPerCycle: 12,
  }, { unlockLevel: 5, coinCost: 290 }),
  agro_greenhouse_ext: farmBldg('agro_greenhouse_ext', 'Climate Greenhouse', 'All-season glasshouse growing Fruits, Vegetables, and Herbs year-round.', {
    inputs: {}, outputs: { fruits: 12, vegetables: 14, herbs: 6 }, cycleSeconds: 18, xpPerCycle: 16,
  }, { unlockLevel: 5, coinCost: 420 }),
  irrigation_station: farmBldg('irrigation_station', 'Irrigation Station', 'Pumps river water across nearby farms (+150 Water supply).', undefined, {
    unlockLevel: 3, coinCost: 300, waterOutput: 150, waterDemand: 0, width: 2, height: 1,
  }),
  grain_silo: farmBldg('grain_silo', 'Agricultural Grain Silo', 'Bulk agricultural grain silo expanding city Crop Storage reserves.', undefined, {
    unlockLevel: 2, category: 'storage', coinCost: 260, granaryBonus: 450, waterDemand: 0, width: 2, height: 1,
  }),
  farm_equipment_depot: farmBldg('farm_equipment_depot', 'Farm Equipment Depot', 'Dispatches tractors & harvesters, boosting farm logistics.', undefined, {
    unlockLevel: 4, coinCost: 380, logisticsBoost: 0.12, truckCapacity: 6,
  }),

  // --- FISHING (8) ---
  fishing_dock: fishBldg('fishing_dock', 'Fishing Dock', 'Timber pier with local skiffs netting fresh Fish.', {
    inputs: {}, outputs: { fish: 18 }, cycleSeconds: 16, xpPerCycle: 9,
  }, { unlockLevel: 2, coinCost: 150 }),
  fishing_boatyard: fishBldg('fishing_boatyard', 'Fishing Boatyard', 'Builds and repairs coastal fishing trawlers, raising seafood output.', {
    inputs: { wood: 4 }, outputs: { fish: 26 }, cycleSeconds: 18, xpPerCycle: 14,
  }, { unlockLevel: 4, coinCost: 360 }),
  fish_market_hall: fishBldg('fish_market_hall', 'Harbor Fish Auction Hall', 'Direct harbor fish market earning tax and processing fresh catch.', {
    inputs: { fish: 6 }, outputs: { packaged_seafood: 10 }, cycleSeconds: 18, xpPerCycle: 12,
  }, { unlockLevel: 3, coinCost: 280, taxPerMin: 20 }),
  fish_drying_yard: fishBldg('fish_drying_yard', 'Fish Drying Yard', 'Traditional sun-curing racks preserving catch into Packaged Seafood.', {
    inputs: { fish: 10 }, outputs: { packaged_seafood: 14 }, cycleSeconds: 18, xpPerCycle: 11,
  }, { unlockLevel: 3, coinCost: 220, requiresCoast: false }),
  fish_farming_pond: fishBldg('fish_farming_pond', 'Fish Farming Pond', 'Inland aquaculture pond raising freshwater Fish safely.', {
    inputs: {}, outputs: { fish: 22 }, cycleSeconds: 18, xpPerCycle: 11,
  }, { unlockLevel: 3, coinCost: 260, requiresCoast: false }),
  aquaculture_center: fishBldg('aquaculture_center', 'Aquaculture Center', 'Scientific marine hatchery multiplying Fish & Packaged Seafood.', {
    inputs: {}, outputs: { fish: 32, packaged_seafood: 10 }, cycleSeconds: 20, xpPerCycle: 18,
  }, { unlockLevel: 6, coinCost: 580, width: 3, height: 2, requiresCoast: false }),
  deep_sea_fishing_harbor: fishBldg('deep_sea_fishing_harbor', 'Deep Sea Fishing Harbor', 'Oceanic fleet harbor landing massive commercial Fish harvests.', {
    inputs: {}, outputs: { fish: 56 }, cycleSeconds: 20, xpPerCycle: 26,
  }, { unlockLevel: 7, coinCost: 890, width: 3, height: 3 }),
  seafood_cold_storage: fishBldg('seafood_cold_storage', 'Seafood Cold Storage', 'Harbor chiller facility expanding city Crop & Food storage capacity.', undefined, {
    unlockLevel: 4, category: 'storage', coinCost: 360, granaryBonus: 350, requiresCoast: false,
  }),

  // =========================================================================
  // 6. TRANSPORTATION & PUBLIC TRANSIT (12)
  // =========================================================================
  bus_stop: transitBldg('bus_stop', 'Bus Stop', 'bus', 'Neighborhood bus shelter enabling commuter bus routes.', {
    unlockLevel: 2, coinCost: 90, width: 1, height: 1, maxWorkers: 1, minWorkers: 0, logisticsBoost: 0.03,
  }),
  bus_terminal: transitBldg('bus_terminal', 'Bus Terminal', 'bus', 'Central coach station dispatching city buses along paved roads.', {
    unlockLevel: 4, coinCost: 420, width: 3, height: 2, logisticsBoost: 0.12, taxPerMin: 18,
  }),
  taxi_stand: transitBldg('taxi_stand', 'Taxi Stand', 'taxi', 'Street-side taxi rank dispatching rapid passenger cabs.', {
    unlockLevel: 3, coinCost: 140, width: 1, height: 1, maxWorkers: 2, minWorkers: 0, logisticsBoost: 0.04,
  }),
  taxi_depot: transitBldg('taxi_depot', 'Taxi Depot', 'taxi', 'Fleet garage maintaining and dispatching city taxis.', {
    unlockLevel: 5, coinCost: 480, width: 2, height: 2, logisticsBoost: 0.1, taxPerMin: 20,
  }),
  passenger_rail_station: transitBldg('passenger_rail_station', 'Passenger Rail Station', 'rail', 'Links connected railway tracks with animated passenger trains.', {
    unlockLevel: 6, coinCost: 650, width: 3, height: 2, logisticsBoost: 0.15, happinessBonus: 5,
  }),
  central_rail_terminal: transitBldg('central_rail_terminal', 'Central Rail Terminal', 'rail', 'Grand multi-track rail terminal handling intercity commuters.', {
    unlockLevel: 10, coinCost: 1450, width: 4, height: 3, logisticsBoost: 0.25, taxPerMin: 42, happinessBonus: 8,
  }),
  freight_rail_yard: transitBldg('freight_rail_yard', 'Freight Rail Yard', 'rail', 'Automated rail freight yard hauling raw ore, steel, and timber by train.', {
    unlockLevel: 9, coinCost: 1200, width: 4, height: 3, logisticsBoost: 0.22, warehouseBonus: 260, tradeCapacity: 90,
  }),
  metro_station: transitBldg('metro_station', 'Metro Station', 'metro', 'Subway entrance slashing road congestion across nearby districts.', {
    unlockLevel: 9, coinCost: 780, width: 2, height: 1, logisticsBoost: 0.16, happinessBonus: 6,
  }),
  underground_metro_hub: transitBldg('underground_metro_hub', 'Underground Metro Hub', 'metro', 'High-capacity subterranean transit interchange serving skyscrapers.', {
    unlockLevel: 13, coinCost: 1650, width: 3, height: 2, logisticsBoost: 0.28, taxPerMin: 36, happinessBonus: 9,
  }),
  regional_airport: transitBldg('regional_airport', 'Regional Airport', 'air', 'Domestic passenger & business aviation runway attracting executives and tourists.', {
    unlockLevel: 11, coinCost: 2200, width: 5, height: 4, isLargeFactory: true, logisticsBoost: 0.25, tradeCapacity: 140, taxPerMin: 75, happinessBonus: 8,
  }),
  cargo_rail_air_hub: transitBldg('cargo_rail_air_hub', 'Cargo Rail/Air Hub', 'air', 'Intermodal freight complex linking rail tracks to air cargo jets.', {
    unlockLevel: 14, coinCost: 2800, width: 5, height: 4, isLargeFactory: true, logisticsBoost: 0.3, tradeCapacity: 240, exportsSurplus: true, warehouseBonus: 380,
  }),
  seaport_passenger_terminal: transitBldg('seaport_passenger_terminal', 'Seaport Passenger Terminal', 'sea', 'Coastal ferry & cruise terminal welcoming regional travelers and tourists.', {
    unlockLevel: 6, coinCost: 920, width: 3, height: 2, requiresCoast: true, logisticsBoost: 0.14, taxPerMin: 34, happinessBonus: 6,
  }),

  // =========================================================================
  // 7. RESIDENTIAL BUILDINGS & SKYSCRAPERS (11)
  // =========================================================================
  small_house: resTowerBldg('small_house', 'Small House', 4, 1, 1, 'Cozy 1-story home housing 1–5 citizens.', {
    unlockLevel: 1, coinCost: 70, roofColor: '#b45309', wallColor: '#fef3c7',
  }),
  family_house: resTowerBldg('family_house', 'Family House', 8, 2, 1, 'Spacious two-story family residence housing 5–10 citizens.', {
    unlockLevel: 2, coinCost: 135, roofColor: '#991b1b', wallColor: '#fde68a',
  }),
  residential_apartment: resTowerBldg('residential_apartment', 'Residential Apartment', 36, 2, 2, 'Mid-rise urban apartment block housing 20–50 citizens.', {
    unlockLevel: 4, coinCost: 340, roofColor: '#475569', wallColor: '#e2e8f0',
  }),
  large_apartment_tower: resTowerBldg('large_apartment_tower', 'Large Apartment Tower', 150, 2, 3, 'High-rise residential block housing 100–200 citizens.', {
    unlockLevel: 6, coinCost: 860, roofColor: '#334155', wallColor: '#cbd5e1',
  }),
  residential_skyscraper: resTowerBldg('residential_skyscraper', 'Residential Skyscraper', 400, 3, 3, 'Glass-curtain residential high-rise housing 300–500 citizens.', {
    unlockLevel: 9, coinCost: 2100, roofColor: '#0284c7', wallColor: '#94a3b8',
  }),
  luxury_residential_tower: resTowerBldg('luxury_residential_tower', 'Luxury Residential Tower', 650, 3, 3, 'Penthouse luxury spire housing 500–800 affluent citizens.', {
    unlockLevel: 12, coinCost: 3400, happinessBonus: 8, taxPerMin: 210, roofColor: '#fbbf24', wallColor: '#f8fafc',
  }),
  mega_residential_complex: resTowerBldg('mega_residential_complex', 'Mega Residential Complex', 1200, 4, 4, 'Monumental twin-tower arcology housing 1,000+ residents.', {
    unlockLevel: 14, coinCost: 5800, isLargeFactory: true, happinessBonus: 10, roofColor: '#38bdf8', wallColor: '#e2e8f0',
  }),
  government_housing: resTowerBldg('government_housing', 'Government Housing', 180, 3, 2, 'Subsidized public apartment complex lowering homelessness rapidly.', {
    unlockLevel: 5, coinCost: 720, allowedZones: ['residential', 'government', 'sez'], roofColor: '#1e40af', wallColor: '#dbeafe',
  }),
  worker_housing: resTowerBldg('worker_housing', 'Worker Housing', 220, 3, 2, 'Durable workforce dormitories near factories & logistics parks.', {
    unlockLevel: 4, coinCost: 780, allowedZones: ['residential', 'industrial', 'heavy_industrial', 'mining', 'forestry', 'sez'], roofColor: '#d97706', wallColor: '#fef3c7',
  }),
  student_dormitory: resTowerBldg('student_dormitory', 'Student Dormitory', 160, 2, 2, 'Campus residence supporting high-school, college, and university students.', {
    unlockLevel: 5, coinCost: 680, educationBonus: 4, roofColor: '#4f46e5', wallColor: '#e0e7ff',
  }),
  senior_living_complex: resTowerBldg('senior_living_complex', 'Senior Living Complex', 140, 2, 2, 'Peaceful garden complex improving senior care and life expectancy.', {
    unlockLevel: 6, coinCost: 740, healthcareBonus: 6, lifeExpectancyBonus: 2.5, roofColor: '#059669', wallColor: '#ecfdf5',
  }),

  // =========================================================================
  // 8. UTILITIES & PUBLIC INFRASTRUCTURE (10)
  // =========================================================================
  large_power_station: mkBldg({
    id: 'large_power_station', name: 'Large Power Station', category: 'energy', subCategory: 'utility',
    description: 'Heavy thermal power station generating +240 MW electricity.',
    unlockLevel: 6, coinCost: 1150, materialCost: { stone: 25, steel: 10 }, width: 3, height: 3, footprintRotatable: true,
    buildTime: 22, minWorkers: 4, maxWorkers: 14, workerClass: 'engineer', upkeepPerMin: 28, maxLevel: 5, requiresRoad: true,
    powerOutput: 240, waterDemand: 8, pollutionDelta: 14, accentColor: '#facc15', roofColor: '#334155', wallColor: '#475569', xpOnBuild: 240,
  }),
  solar_power_farm: mkBldg({
    id: 'solar_power_farm', name: 'Solar Power Farm', category: 'energy', subCategory: 'utility',
    description: 'Zero-emission photovoltaic array generating +140 MW clean power.',
    unlockLevel: 7, coinCost: 1200, materialCost: { glass: 16, electronics: 6 }, width: 4, height: 3, footprintRotatable: true,
    buildTime: 18, minWorkers: 2, maxWorkers: 8, workerClass: 'engineer', upkeepPerMin: 12, maxLevel: 5, requiresRoad: true,
    powerOutput: 140, pollutionDelta: -4, accentColor: '#38bdf8', roofColor: '#0369a1', wallColor: '#1e293b', xpOnBuild: 230,
  }),
  wind_turbine_farm: mkBldg({
    id: 'wind_turbine_farm', name: 'Wind Turbine Farm', category: 'energy', subCategory: 'utility',
    description: 'Multi-rotor clean wind farm generating +180 MW electricity.',
    unlockLevel: 8, coinCost: 1420, materialCost: { steel: 14, building_materials: 16 }, width: 4, height: 3, footprintRotatable: true,
    buildTime: 20, minWorkers: 2, maxWorkers: 8, workerClass: 'engineer', upkeepPerMin: 14, maxLevel: 5, requiresRoad: true,
    powerOutput: 180, pollutionDelta: -5, accentColor: '#f8fafc', roofColor: '#e2e8f0', wallColor: '#94a3b8', xpOnBuild: 260,
  }),
  nuclear_power_plant: mkBldg({
    id: 'nuclear_power_plant', name: 'Nuclear Power Plant', category: 'energy', subCategory: 'utility',
    description: '5×5 flagship zero-carbon reactor complex generating +650 MW grid power.',
    unlockLevel: 14, coinCost: 3600, materialCost: { cement: 45, steel: 30, electronics: 16 }, width: 5, height: 5, isLargeFactory: true,
    buildTime: 36, minWorkers: 12, maxWorkers: 40, workerClass: 'engineer', upkeepPerMin: 65, maxLevel: 5, requiresRoad: true,
    powerOutput: 650, waterDemand: 24, pollutionDelta: 1, accentColor: '#22d3ee', roofColor: '#475569', wallColor: '#cbd5e1', xpOnBuild: 600,
  }),
  water_treatment_plant: mkBldg({
    id: 'water_treatment_plant', name: 'Water Treatment Plant', category: 'energy', subCategory: 'utility',
    description: 'High-capacity filtration works delivering +320 clean water & purifying pollution.',
    unlockLevel: 5, coinCost: 820, materialCost: { stone: 20, bricks: 12 }, width: 3, height: 2, footprintRotatable: true,
    buildTime: 18, minWorkers: 3, maxWorkers: 10, workerClass: 'engineer', upkeepPerMin: 16, maxLevel: 5, requiresRoad: true,
    waterOutput: 320, powerDemand: 5, pollutionDelta: -8, accentColor: '#38bdf8', roofColor: '#0284c7', wallColor: '#e2e8f0', xpOnBuild: 180,
  }),
  water_reservoir: mkBldg({
    id: 'water_reservoir', name: 'Water Reservoir', category: 'energy', subCategory: 'utility',
    description: 'Large municipal basin supplying +420 steady water pressure.',
    unlockLevel: 7, coinCost: 1100, materialCost: { stone: 30, cement: 12 }, width: 4, height: 3, footprintRotatable: true,
    buildTime: 22, minWorkers: 2, maxWorkers: 8, workerClass: 'engineer', upkeepPerMin: 14, maxLevel: 5, requiresRoad: true,
    waterOutput: 420, powerDemand: 3, pollutionDelta: -4, accentColor: '#0ea5e9', roofColor: '#0369a1', wallColor: '#94a3b8', xpOnBuild: 220,
  }),
  sewage_treatment_plant: mkBldg({
    id: 'sewage_treatment_plant', name: 'Sewage Treatment Plant', category: 'environmental', subCategory: 'utility',
    description: 'Treats urban wastewater, cutting sickness and lowering pollution (-14).',
    unlockLevel: 5, coinCost: 780, materialCost: { bricks: 18, stone: 15 }, width: 3, height: 2, footprintRotatable: true,
    buildTime: 16, minWorkers: 3, maxWorkers: 10, workerClass: 'engineer', upkeepPerMin: 15, maxLevel: 5, requiresRoad: true,
    powerDemand: 4, waterDemand: 4, healthcareBonus: 8, pollutionDelta: -14, lifeExpectancyBonus: 2.0, accentColor: '#14b8a6', roofColor: '#0f766e', wallColor: '#94a3b8', xpOnBuild: 175,
  }),
  waste_recycling_center: mkBldg({
    id: 'waste_recycling_center', name: 'Waste Recycling Center', category: 'environmental', subCategory: 'utility',
    description: 'Recovers Building Materials & Steel from city waste while scrubbing pollution (-18).',
    unlockLevel: 6, coinCost: 890, materialCost: { stone: 16, steel: 6 }, width: 3, height: 2, footprintRotatable: true,
    buildTime: 18, minWorkers: 4, maxWorkers: 14, workerClass: 'laborer', upkeepPerMin: 14, maxLevel: 5, requiresRoad: true,
    powerDemand: 4, pollutionDelta: -18, lifeExpectancyBonus: 1.5,
    recipe: { inputs: {}, outputs: { building_materials: 12, steel: 4 }, cycleSeconds: 24, xpPerCycle: 18 },
    accentColor: '#22c55e', roofColor: '#15803d', wallColor: '#cbd5e1', xpOnBuild: 190,
  }),
  garbage_incinerator: mkBldg({
    id: 'garbage_incinerator', name: 'Garbage Incinerator', category: 'environmental', subCategory: 'utility',
    description: 'Waste-to-energy incinerator generating +95 MW power while clearing solid waste.',
    unlockLevel: 7, coinCost: 960, materialCost: { bricks: 24, steel: 10 }, width: 3, height: 2, footprintRotatable: true,
    buildTime: 18, minWorkers: 4, maxWorkers: 12, workerClass: 'engineer', upkeepPerMin: 18, maxLevel: 5, requiresRoad: true,
    powerOutput: 95, pollutionDelta: 6, accentColor: '#f97316', roofColor: '#7c2d12', wallColor: '#475569', xpOnBuild: 185,
  }),
  electricity_substation: mkBldg({
    id: 'electricity_substation', name: 'Electricity Substation', category: 'energy', subCategory: 'utility',
    description: 'Step-down transformer station stabilizing +45 MW local distribution.',
    unlockLevel: 3, coinCost: 320, materialCost: { stone: 8, copper_ingots: 2 }, width: 1, height: 1,
    buildTime: 8, minWorkers: 1, maxWorkers: 3, workerClass: 'engineer', upkeepPerMin: 5, maxLevel: 5, requiresRoad: true,
    powerOutput: 45, isSubOffice: true, serviceRadius: 16, accentColor: '#fde047', roofColor: '#334155', wallColor: '#94a3b8', xpOnBuild: 85,
  }),

  // =========================================================================
  // 9. EDUCATION (8) & HEALTHCARE (5) & PARKS/PUBLIC SPACES (10)
  // =========================================================================
  primary_school: mkBldg({
    id: 'primary_school', name: 'Primary School', category: 'educational', subCategory: 'edu',
    description: 'Educates children and lifts family happiness.',
    unlockLevel: 2, coinCost: 260, materialCost: { wood: 14, stone: 8 }, width: 2, height: 2,
    buildTime: 12, minWorkers: 2, maxWorkers: 6, workerClass: 'artisan', upkeepPerMin: 8, maxLevel: 5, requiresRoad: true,
    educationBonus: 18, happinessBonus: 4, rpPerMin: 6, accentColor: '#60a5fa', roofColor: '#1d4ed8', wallColor: '#fef3c7', xpOnBuild: 110,
  }),
  secondary_school: mkBldg({
    id: 'secondary_school', name: 'Secondary School', category: 'educational', subCategory: 'edu',
    description: 'Trains teenagers toward skilled artisan & service careers.',
    unlockLevel: 4, coinCost: 420, materialCost: { wood: 16, bricks: 10 }, width: 2, height: 2,
    buildTime: 14, minWorkers: 3, maxWorkers: 8, workerClass: 'artisan', upkeepPerMin: 12, maxLevel: 5, requiresRoad: true,
    educationBonus: 26, happinessBonus: 4, rpPerMin: 10, accentColor: '#818cf8', roofColor: '#3730a3', wallColor: '#f1f5f9', xpOnBuild: 145,
  }),
  high_school: mkBldg({
    id: 'high_school', name: 'High School', category: 'educational', subCategory: 'edu',
    description: 'Comprehensive secondary academy elevating city literacy & RP.',
    unlockLevel: 5, coinCost: 560, materialCost: { bricks: 16, stone: 12 }, width: 3, height: 2, footprintRotatable: true,
    buildTime: 16, minWorkers: 4, maxWorkers: 12, workerClass: 'artisan', upkeepPerMin: 15, maxLevel: 5, requiresRoad: true,
    educationBonus: 34, happinessBonus: 5, rpPerMin: 14, accentColor: '#6366f1', roofColor: '#312e81', wallColor: '#e2e8f0', xpOnBuild: 180,
  }),
  technical_college: mkBldg({
    id: 'technical_college', name: 'Technical College', category: 'educational', subCategory: 'edu',
    description: 'Vocational academy training machinists, factory technicians, and electricians.',
    unlockLevel: 6, coinCost: 780, materialCost: { bricks: 20, glass: 6 }, width: 3, height: 2, footprintRotatable: true,
    buildTime: 18, minWorkers: 5, maxWorkers: 14, workerClass: 'engineer', upkeepPerMin: 18, maxLevel: 5, requiresRoad: true,
    educationBonus: 42, rpPerMin: 20, happinessBonus: 5, accentColor: '#06b6d4', roofColor: '#155e75', wallColor: '#f8fafc', xpOnBuild: 210,
  }),
  city_university: mkBldg({
    id: 'city_university', name: 'University', category: 'educational', subCategory: 'edu',
    description: '4×3 flagship university training doctors, executives, teachers & engineers.',
    unlockLevel: 8, coinCost: 1450, materialCost: { bricks: 32, glass: 10, marble: 6 }, width: 4, height: 3, footprintRotatable: true,
    buildTime: 26, minWorkers: 8, maxWorkers: 24, workerClass: 'engineer', upkeepPerMin: 32, maxLevel: 5, requiresRoad: true,
    educationBonus: 65, rpPerMin: 36, happinessBonus: 8, allowedZones: ['research', 'tech_park', 'residential', 'government', 'sez'],
    accentColor: '#a855f7', roofColor: '#4c1d95', wallColor: '#f8fafc', xpOnBuild: 360,
  }),
  engineering_university: mkBldg({
    id: 'engineering_university', name: 'Engineering University', category: 'educational', subCategory: 'edu',
    description: 'Specialized engineering school powering mega-factories & infrastructure R&D.',
    unlockLevel: 10, coinCost: 1750, materialCost: { cement: 20, steel: 10, glass: 10 }, width: 4, height: 3, footprintRotatable: true,
    buildTime: 28, minWorkers: 8, maxWorkers: 26, workerClass: 'engineer', upkeepPerMin: 36, maxLevel: 5, requiresRoad: true,
    educationBonus: 72, rpPerMin: 44, allowedZones: ['research', 'tech_park', 'industrial', 'sez'],
    accentColor: '#38bdf8', roofColor: '#1e3a8a', wallColor: '#e2e8f0', xpOnBuild: 400,
  }),
  agricultural_university: mkBldg({
    id: 'agricultural_university', name: 'Agricultural University', category: 'educational', subCategory: 'edu',
    description: 'Agronomy campus training agricultural scientists and boosting farm research.',
    unlockLevel: 7, coinCost: 1120, materialCost: { bricks: 22, wood: 18 }, width: 3, height: 3,
    buildTime: 22, minWorkers: 6, maxWorkers: 18, workerClass: 'engineer', upkeepPerMin: 24, maxLevel: 5, requiresRoad: true,
    educationBonus: 48, rpPerMin: 28, allowedZones: ['agricultural', 'research', 'sez'],
    accentColor: '#84cc16', roofColor: '#3f6212', wallColor: '#fef9c3', xpOnBuild: 280,
  }),
  research_institute: mkBldg({
    id: 'research_institute', name: 'Research Institute', category: 'educational', subCategory: 'edu',
    description: 'National science campus generating +65 Research Points/min.',
    unlockLevel: 11, coinCost: 2100, materialCost: { cement: 24, glass: 16, electronics: 8 }, width: 4, height: 3, footprintRotatable: true,
    buildTime: 28, minWorkers: 10, maxWorkers: 28, workerClass: 'engineer', upkeepPerMin: 42, maxLevel: 5, requiresRoad: true,
    educationBonus: 55, rpPerMin: 65, allowedZones: ['research', 'tech_park', 'sez'],
    accentColor: '#14b8a6', roofColor: '#0f766e', wallColor: '#f1f5f9', xpOnBuild: 450,
  }),

  // --- HEALTHCARE (5) ---
  small_clinic: mkBldg({
    id: 'small_clinic', name: 'Small Clinic', category: 'healthcare', subCategory: 'health',
    description: 'Neighborhood medical clinic treating minor illnesses (+2 yr life expectancy).',
    unlockLevel: 2, coinCost: 240, materialCost: { wood: 10, stone: 8 }, width: 2, height: 1, footprintRotatable: true,
    buildTime: 10, minWorkers: 2, maxWorkers: 5, workerClass: 'artisan', upkeepPerMin: 8, maxLevel: 5, requiresRoad: true,
    healthcareBonus: 18, happinessBonus: 4, lifeExpectancyBonus: 2.0, accentColor: '#ef4444', roofColor: '#dc2626', wallColor: '#f8fafc', xpOnBuild: 95,
  }),
  general_hospital: mkBldg({
    id: 'general_hospital', name: 'General Hospital', category: 'healthcare', subCategory: 'health',
    description: 'Full-service hospital slashing sickness and raising life expectancy (+5 yrs).',
    unlockLevel: 6, coinCost: 980, materialCost: { bricks: 24, glass: 8, medicine: 6 }, width: 3, height: 3,
    buildTime: 22, minWorkers: 6, maxWorkers: 22, workerClass: 'engineer', upkeepPerMin: 26, maxLevel: 5, requiresRoad: true,
    healthcareBonus: 45, happinessBonus: 8, lifeExpectancyBonus: 5.0, accentColor: '#ef4444', roofColor: '#f8fafc', wallColor: '#e2e8f0', xpOnBuild: 260,
  }),
  specialist_hospital: mkBldg({
    id: 'specialist_hospital', name: 'Specialist Hospital', category: 'healthcare', subCategory: 'health',
    description: 'Advanced surgical & cardiac center boosting health coverage (+7 yrs life expectancy).',
    unlockLevel: 10, coinCost: 1680, materialCost: { cement: 24, glass: 12, electronics: 6 }, width: 3, height: 3,
    buildTime: 26, minWorkers: 8, maxWorkers: 28, workerClass: 'engineer', upkeepPerMin: 36, maxLevel: 5, requiresRoad: true,
    healthcareBonus: 65, happinessBonus: 10, lifeExpectancyBonus: 7.0, accentColor: '#38bdf8', roofColor: '#0284c7', wallColor: '#f8fafc', xpOnBuild: 360,
  }),
  medical_research_center: mkBldg({
    id: 'medical_research_center', name: 'Medical Research Center', category: 'healthcare', subCategory: 'health',
    description: 'Biomedical lab producing Medicine, Research Points, and +4 yrs life expectancy.',
    unlockLevel: 9, coinCost: 1480, materialCost: { bricks: 24, glass: 12 }, width: 3, height: 3,
    buildTime: 24, minWorkers: 6, maxWorkers: 18, workerClass: 'engineer', upkeepPerMin: 28, maxLevel: 5, requiresRoad: true,
    healthcareBonus: 40, rpPerMin: 24, lifeExpectancyBonus: 4.0,
    recipe: { inputs: { herbs: 8, chemicals: 4 }, outputs: { medicine: 20 }, cycleSeconds: 20, xpPerCycle: 24 },
    accentColor: '#10b981', roofColor: '#047857', wallColor: '#f1f5f9', xpOnBuild: 320,
  }),
  emergency_center: mkBldg({
    id: 'emergency_center', name: 'Emergency Center', category: 'healthcare', subCategory: 'health',
    description: 'Rapid ambulance & trauma response hub boosting safety & health.',
    unlockLevel: 5, coinCost: 680, materialCost: { bricks: 16, steel: 6 }, width: 2, height: 2,
    buildTime: 14, minWorkers: 4, maxWorkers: 12, workerClass: 'artisan', upkeepPerMin: 18, maxLevel: 5, requiresRoad: true,
    healthcareBonus: 30, safetyBonus: 14, lifeExpectancyBonus: 3.0, accentColor: '#f97316', roofColor: '#b91c1c', wallColor: '#f8fafc', xpOnBuild: 190,
  }),

  // --- PARKS & PUBLIC SPACES (10) ---
  city_park: mkBldg({
    id: 'city_park', name: 'City Park', category: 'recreational', subCategory: 'park',
    description: 'Landscaped urban park absorbing pollution and lifting happiness.',
    unlockLevel: 2, coinCost: 180, materialCost: { wood: 8 }, width: 2, height: 2,
    buildTime: 8, minWorkers: 0, maxWorkers: 1, workerClass: 'laborer', upkeepPerMin: 4, maxLevel: 5, requiresRoad: true,
    recreationBonus: 16, happinessBonus: 6, pollutionDelta: -6, accentColor: '#22c55e', roofColor: '#16a34a', wallColor: '#86efac', xpOnBuild: 80,
  }),
  central_botanical_garden: mkBldg({
    id: 'central_botanical_garden', name: 'Botanical Garden', category: 'recreational', subCategory: 'park',
    description: 'Glass conservatory & arboretum purifying air (-10 pollution) and raising tourism.',
    unlockLevel: 5, coinCost: 580, materialCost: { glass: 10, wood: 14 }, width: 3, height: 3,
    buildTime: 16, minWorkers: 2, maxWorkers: 6, workerClass: 'artisan', upkeepPerMin: 10, maxLevel: 5, requiresRoad: true,
    recreationBonus: 28, happinessBonus: 9, pollutionDelta: -10, taxPerMin: 14, accentColor: '#4ade80', roofColor: '#bae6fd', wallColor: '#15803d', xpOnBuild: 180,
  }),
  national_park: mkBldg({
    id: 'national_park', name: 'National Park Preserve', category: 'recreational', subCategory: 'park',
    description: '5×5 protected wildlife sanctuary boosting biodiversity & happiness.',
    unlockLevel: 7, coinCost: 1200, materialCost: { wood: 24, stone: 12 }, width: 5, height: 5, isLargeFactory: true,
    buildTime: 18, minWorkers: 2, maxWorkers: 8, workerClass: 'laborer', upkeepPerMin: 12, maxLevel: 5, requiresRoad: true,
    recreationBonus: 55, happinessBonus: 14, pollutionDelta: -22, taxPerMin: 24, accentColor: '#16a34a', roofColor: '#14532d', wallColor: '#4ade80', xpOnBuild: 320,
  }),
  sports_stadium: mkBldg({
    id: 'sports_stadium', name: 'Sports Stadium', category: 'recreational', subCategory: 'park',
    description: '5×5 multi-sport arena generating ticket revenue & huge citizen recreation.',
    unlockLevel: 9, coinCost: 2200, materialCost: { cement: 30, steel: 18, bricks: 24 }, width: 5, height: 5, isLargeFactory: true,
    buildTime: 28, minWorkers: 6, maxWorkers: 20, workerClass: 'artisan', upkeepPerMin: 34, maxLevel: 5, requiresRoad: true,
    powerDemand: 10, waterDemand: 6, recreationBonus: 65, happinessBonus: 14, taxPerMin: 95, accentColor: '#38bdf8', roofColor: '#0284c7', wallColor: '#e2e8f0', xpOnBuild: 480,
  }),
  football_stadium: mkBldg({
    id: 'football_stadium', name: 'Football Stadium', category: 'recreational', subCategory: 'park',
    description: '6×4 premier football arena hosting matches and boosting city morale.',
    unlockLevel: 10, coinCost: 2600, materialCost: { cement: 34, steel: 22, glass: 10 }, width: 6, height: 4, isLargeFactory: true, footprintRotatable: true,
    buildTime: 30, minWorkers: 8, maxWorkers: 24, workerClass: 'artisan', upkeepPerMin: 38, maxLevel: 5, requiresRoad: true,
    powerDemand: 12, waterDemand: 6, recreationBonus: 75, happinessBonus: 16, taxPerMin: 115, accentColor: '#22c55e', roofColor: '#15803d', wallColor: '#f8fafc', xpOnBuild: 520,
  }),
  public_library: mkBldg({
    id: 'public_library', name: 'Public Library', category: 'recreational', subCategory: 'park',
    description: 'Civic reading hall lifting both education and recreation.',
    unlockLevel: 3, coinCost: 340, materialCost: { wood: 14, bricks: 10 }, width: 2, height: 2,
    buildTime: 12, minWorkers: 2, maxWorkers: 6, workerClass: 'artisan', upkeepPerMin: 8, maxLevel: 5, requiresRoad: true,
    educationBonus: 16, recreationBonus: 14, rpPerMin: 10, happinessBonus: 5, accentColor: '#fbbf24', roofColor: '#78350f', wallColor: '#fef3c7', xpOnBuild: 120,
  }),
  city_museum: mkBldg({
    id: 'city_museum', name: 'Heritage Museum', category: 'recreational', subCategory: 'park',
    description: 'Displays ancient ruins, marble sculptures, and attracts tourists.',
    unlockLevel: 5, coinCost: 760, materialCost: { marble: 8, stone: 18 }, width: 3, height: 2, footprintRotatable: true,
    buildTime: 18, minWorkers: 3, maxWorkers: 10, workerClass: 'artisan', upkeepPerMin: 14, maxLevel: 5, requiresRoad: true,
    recreationBonus: 26, educationBonus: 12, taxPerMin: 26, happinessBonus: 7, accentColor: '#eab308', roofColor: '#f8fafc', wallColor: '#e2e8f0', xpOnBuild: 210,
  }),
  convention_center: mkBldg({
    id: 'convention_center', name: 'Convention Center', category: 'recreational', subCategory: 'park',
    description: 'Hosts trade summits, corporate expos, and international visitors.',
    unlockLevel: 8, coinCost: 1450, materialCost: { steel: 14, glass: 14, cement: 18 }, width: 4, height: 3, footprintRotatable: true,
    buildTime: 24, minWorkers: 5, maxWorkers: 18, workerClass: 'artisan', upkeepPerMin: 26, maxLevel: 5, requiresRoad: true,
    recreationBonus: 36, tradeCapacity: 60, taxPerMin: 68, happinessBonus: 8, accentColor: '#6366f1', roofColor: '#312e81', wallColor: '#cbd5e1', xpOnBuild: 320,
  }),
  exhibition_center: mkBldg({
    id: 'exhibition_center', name: 'Exhibition Center', category: 'recreational', subCategory: 'park',
    description: 'Showcases domestic manufacturing, robotics, and cultural art.',
    unlockLevel: 7, coinCost: 1180, materialCost: { steel: 10, glass: 12, bricks: 16 }, width: 4, height: 3, footprintRotatable: true,
    buildTime: 22, minWorkers: 4, maxWorkers: 14, workerClass: 'artisan', upkeepPerMin: 22, maxLevel: 5, requiresRoad: true,
    recreationBonus: 32, tradeCapacity: 45, taxPerMin: 52, happinessBonus: 7, accentColor: '#ec4899', roofColor: '#831843', wallColor: '#f1f5f9', xpOnBuild: 270,
  }),
  community_center: mkBldg({
    id: 'community_center', name: 'Community Center', category: 'recreational', subCategory: 'park',
    description: 'Neighborhood hall hosting events, clubs, and citizen services.',
    unlockLevel: 2, coinCost: 220, materialCost: { wood: 12, stone: 8 }, width: 2, height: 2,
    buildTime: 10, minWorkers: 1, maxWorkers: 4, workerClass: 'laborer', upkeepPerMin: 6, maxLevel: 5, requiresRoad: true,
    recreationBonus: 18, happinessBonus: 7, accentColor: '#f59e0b', roofColor: '#b45309', wallColor: '#fef3c7', xpOnBuild: 95,
  }),
};
