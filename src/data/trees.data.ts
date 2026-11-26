import type { ResourceId } from './resources.data';

export const enum FeatureType {
  None = 0,
  JungleHardwood = 1,
  TropicalPalm = 2,
  FruitTree = 3,
  AncientMahogany = 4,
  StoneOutcrop = 5,
  Sapling = 6,
  BambooCluster = 7,
  AncientRuin = 8,
  OakTree = 9,
  PineTree = 10,
  BirchTree = 11,
  CypressTree = 12,
  AcaciaTree = 13,
  MediumTree = 14,
}

export const enum DepositType {
  None = 0,
  Stone = 1,
  Clay = 2,
  Sand = 3,
  IronOre = 4,
  CopperOre = 5,
  Coal = 6,
  Gold = 7,
  Silver = 8,
}

export interface TreeSpeciesDef {
  featureType: FeatureType;
  name: string;
  maxHp: number;
  woodYield: number;
  bonusResource?: ResourceId;
  bonusAmount?: number;
  bonusChance?: number;
  coinYield: number;
  xpYield: number;
  minLevel: number;
}

export const TREE_SPECIES: Record<number, TreeSpeciesDef> = {
  [FeatureType.JungleHardwood]: {
    featureType: FeatureType.JungleHardwood,
    name: 'Jungle Hardwood',
    maxHp: 45,
    woodYield: 8,
    bonusResource: 'herbs',
    bonusAmount: 2,
    bonusChance: 0.2,
    coinYield: 12,
    xpYield: 8,
    minLevel: 1,
  },
  [FeatureType.TropicalPalm]: {
    featureType: FeatureType.TropicalPalm,
    name: 'Tropical Palm',
    maxHp: 30,
    woodYield: 5,
    bonusResource: 'berries',
    bonusAmount: 2,
    bonusChance: 0.25,
    coinYield: 8,
    xpYield: 6,
    minLevel: 1,
  },
  [FeatureType.FruitTree]: {
    featureType: FeatureType.FruitTree,
    name: 'Wild Fruit Tree',
    maxHp: 35,
    woodYield: 4,
    bonusResource: 'berries',
    bonusAmount: 4,
    bonusChance: 0.9,
    coinYield: 10,
    xpYield: 7,
    minLevel: 1,
  },
  [FeatureType.AncientMahogany]: {
    featureType: FeatureType.AncientMahogany,
    name: 'Ancient Mahogany',
    maxHp: 90,
    woodYield: 18,
    bonusResource: 'herbs',
    bonusAmount: 4,
    bonusChance: 0.5,
    coinYield: 28,
    xpYield: 20,
    minLevel: 1,
  },
  [FeatureType.StoneOutcrop]: {
    featureType: FeatureType.StoneOutcrop,
    name: 'Stone Boulder',
    maxHp: 60,
    woodYield: 0,
    bonusResource: 'stone',
    bonusAmount: 8,
    bonusChance: 1.0,
    coinYield: 14,
    xpYield: 10,
    minLevel: 1,
  },
  [FeatureType.Sapling]: {
    featureType: FeatureType.Sapling,
    name: 'Jungle Sapling',
    maxHp: 15,
    woodYield: 2,
    coinYield: 2,
    xpYield: 2,
    minLevel: 1,
  },
  [FeatureType.BambooCluster]: {
    featureType: FeatureType.BambooCluster,
    name: 'Wild Bamboo Grove',
    maxHp: 25,
    woodYield: 2,
    bonusResource: 'bamboo',
    bonusAmount: 6,
    bonusChance: 1.0,
    coinYield: 9,
    xpYield: 6,
    minLevel: 1,
  },
  [FeatureType.AncientRuin]: {
    featureType: FeatureType.AncientRuin,
    name: 'Ancient Jungle Ruin',
    maxHp: 50,
    woodYield: 0,
    bonusResource: 'stone',
    bonusAmount: 10,
    bonusChance: 1.0,
    coinYield: 95,
    xpYield: 35,
    minLevel: 1,
  },
  [FeatureType.OakTree]: {
    featureType: FeatureType.OakTree,
    name: 'Highland Oak',
    maxHp: 55,
    woodYield: 10,
    bonusResource: 'herbs',
    bonusAmount: 2,
    bonusChance: 0.25,
    coinYield: 14,
    xpYield: 9,
    minLevel: 1,
  },
  [FeatureType.PineTree]: {
    featureType: FeatureType.PineTree,
    name: 'Mountain Pine',
    maxHp: 45,
    woodYield: 9,
    coinYield: 11,
    xpYield: 8,
    minLevel: 1,
  },
  [FeatureType.BirchTree]: {
    featureType: FeatureType.BirchTree,
    name: 'Silver Birch',
    maxHp: 35,
    woodYield: 7,
    bonusResource: 'herbs',
    bonusAmount: 1,
    bonusChance: 0.3,
    coinYield: 10,
    xpYield: 7,
    minLevel: 1,
  },
  [FeatureType.CypressTree]: {
    featureType: FeatureType.CypressTree,
    name: 'Swamp Cypress',
    maxHp: 50,
    woodYield: 8,
    bonusResource: 'herbs',
    bonusAmount: 3,
    bonusChance: 0.4,
    coinYield: 13,
    xpYield: 9,
    minLevel: 1,
  },
  [FeatureType.AcaciaTree]: {
    featureType: FeatureType.AcaciaTree,
    name: 'Savanna Acacia',
    maxHp: 40,
    woodYield: 6,
    bonusResource: 'spices',
    bonusAmount: 2,
    bonusChance: 0.2,
    coinYield: 11,
    xpYield: 8,
    minLevel: 1,
  },
  [FeatureType.MediumTree]: {
    featureType: FeatureType.MediumTree,
    name: 'Young Timber Tree',
    maxHp: 26,
    woodYield: 4,
    coinYield: 5,
    xpYield: 4,
    minLevel: 1,
  },
};

/** Returns true ONLY for fully grown mature trees ready for harvesting (excludes Sapling and MediumTree). */
export function isMatureTreeFeature(ft: FeatureType): boolean {
  return (
    ft === FeatureType.JungleHardwood ||
    ft === FeatureType.TropicalPalm ||
    ft === FeatureType.FruitTree ||
    ft === FeatureType.AncientMahogany ||
    ft === FeatureType.BambooCluster ||
    ft === FeatureType.OakTree ||
    ft === FeatureType.PineTree ||
    ft === FeatureType.BirchTree ||
    ft === FeatureType.CypressTree ||
    ft === FeatureType.AcaciaTree
  );
}

/** Alias retained for existing callers checking harvestable mature trees; excludes Sapling & MediumTree. */
export function isTreeFeature(ft: FeatureType): boolean {
  return isMatureTreeFeature(ft);
}

/** Returns true for any tree stage (sapling, medium, or mature tree). */
export function isAnyTreeStageFeature(ft: FeatureType): boolean {
  return ft === FeatureType.Sapling || ft === FeatureType.MediumTree || isMatureTreeFeature(ft);
}

export interface MineralDepositDef {
  depositType: DepositType;
  name: string;
  resourceId: ResourceId;
  baseExtractionRate: number;
  defaultRichness: number;
  color: string;
}

export const DEPOSIT_NAMES: Record<DepositType, string> = {
  [DepositType.None]: 'None',
  [DepositType.Stone]: 'Stone Vein',
  [DepositType.Clay]: 'Clay Bed',
  [DepositType.Sand]: 'Silica Sand Bank',
  [DepositType.IronOre]: 'Iron Ore Seam',
  [DepositType.CopperOre]: 'Copper Vein',
  [DepositType.Coal]: 'Coal Deposit',
  [DepositType.Gold]: 'Gold Ore Vein',
  [DepositType.Silver]: 'Silver Ore Vein',
};

export const DEPOSIT_DEFS: Record<Exclude<DepositType, DepositType.None>, MineralDepositDef> = {
  [DepositType.Stone]: {
    depositType: DepositType.Stone,
    name: 'Stone Vein',
    resourceId: 'stone',
    baseExtractionRate: 4,
    defaultRichness: 1000,
    color: '#94a3b8',
  },
  [DepositType.Clay]: {
    depositType: DepositType.Clay,
    name: 'Clay Bed',
    resourceId: 'clay',
    baseExtractionRate: 4,
    defaultRichness: 900,
    color: '#d97706',
  },
  [DepositType.Sand]: {
    depositType: DepositType.Sand,
    name: 'Silica Sand Bank',
    resourceId: 'sand',
    baseExtractionRate: 4,
    defaultRichness: 1000,
    color: '#fde047',
  },
  [DepositType.IronOre]: {
    depositType: DepositType.IronOre,
    name: 'Iron Ore Seam',
    resourceId: 'iron_ore',
    baseExtractionRate: 3,
    defaultRichness: 1400,
    color: '#64748b',
  },
  [DepositType.CopperOre]: {
    depositType: DepositType.CopperOre,
    name: 'Copper Vein',
    resourceId: 'copper_ore',
    baseExtractionRate: 3,
    defaultRichness: 1400,
    color: '#fb923c',
  },
  [DepositType.Coal]: {
    depositType: DepositType.Coal,
    name: 'Coal Deposit',
    resourceId: 'coal',
    baseExtractionRate: 4,
    defaultRichness: 1600,
    color: '#334155',
  },
  [DepositType.Gold]: {
    depositType: DepositType.Gold,
    name: 'Gold Ore Vein',
    resourceId: 'gold_ore',
    baseExtractionRate: 2,
    defaultRichness: 1200,
    color: '#facc15',
  },
  [DepositType.Silver]: {
    depositType: DepositType.Silver,
    name: 'Silver Ore Vein',
    resourceId: 'silver_ore',
    baseExtractionRate: 3,
    defaultRichness: 1300,
    color: '#e2e8f0',
  },
};
