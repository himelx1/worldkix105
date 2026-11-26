import type { ResourceId } from './resources.data';

export const enum RoadType {
  None = 0,
  Dirt = 1,
  Gravel = 2,
  Stone = 3,
  Paved = 4,
  Highway = 5,
  Bridge = 6,
  Rail = 7,
  SmallRoad = 8,
  ResidentialRoad = 9,
  TwoLane = 10,
  FourLane = 11,
  SixLane = 12,
  EightLane = 13,
  IndustrialRoad = 14,
  CommercialBlvd = 15,
  Expressway = 16,
  ElevatedHighway = 17,
  UndergroundRoad = 18,
  Interchange = 19,
  Roundabout = 20,
  ParkingLot = 21,
  ThreeLane = 22,
}

export interface RoadDef {
  id: RoadType;
  key: string;
  name: string;
  unlockLevel: number;
  requiredTech?: string;
  coinCost: number;
  materialCost: Partial<Record<ResourceId, number>>;
  speedMultiplier: number;
  tierRank?: number;
  allowedOnWater: boolean;
  color: string;
  trimColor: string;
  xpYield: number;
}

export const ROADS: Record<RoadType, RoadDef> = {
  [RoadType.None]: {
    id: RoadType.None,
    key: 'none',
    name: 'None',
    unlockLevel: 1,
    coinCost: 0,
    materialCost: {},
    speedMultiplier: 1.0,
    tierRank: 0,
    allowedOnWater: false,
    color: '#000000',
    trimColor: '#000000',
    xpYield: 0,
  },
  [RoadType.Dirt]: {
    id: RoadType.Dirt,
    key: 'dirt',
    name: 'Dirt Road',
    unlockLevel: 1,
    coinCost: 4,
    materialCost: {},
    speedMultiplier: 1.0,
    tierRank: 1,
    allowedOnWater: false,
    color: '#9c7349',
    trimColor: '#785633',
    xpYield: 2,
  },
  [RoadType.Gravel]: {
    id: RoadType.Gravel,
    key: 'gravel',
    name: 'Gravel Road',
    unlockLevel: 3,
    requiredTech: 'wheel_axle',
    coinCost: 10,
    materialCost: { stone: 1 },
    speedMultiplier: 1.2,
    tierRank: 2,
    allowedOnWater: false,
    color: '#8f9396',
    trimColor: '#696e72',
    xpYield: 4,
  },
  [RoadType.Stone]: {
    id: RoadType.Stone,
    key: 'stone',
    name: 'Stone Road',
    unlockLevel: 6,
    requiredTech: 'masonry_1',
    coinCost: 22,
    materialCost: { stone: 2 },
    speedMultiplier: 1.45,
    tierRank: 3,
    allowedOnWater: false,
    color: '#a8a29e',
    trimColor: '#57534e',
    xpYield: 6,
  },
  [RoadType.Paved]: {
    id: RoadType.Paved,
    key: 'paved',
    name: 'Paved Road',
    unlockLevel: 14,
    requiredTech: 'paved_highways',
    coinCost: 45,
    materialCost: { cement: 1 },
    speedMultiplier: 1.85,
    tierRank: 5,
    allowedOnWater: false,
    color: '#3f3f46',
    trimColor: '#d4d4d8',
    xpYield: 10,
  },
  [RoadType.Highway]: {
    id: RoadType.Highway,
    key: 'highway',
    name: 'Highway',
    unlockLevel: 18,
    requiredTech: 'paved_highways',
    coinCost: 90,
    materialCost: { cement: 2, steel: 1 },
    speedMultiplier: 2.35,
    tierRank: 8,
    allowedOnWater: false,
    color: '#27272a',
    trimColor: '#facc15',
    xpYield: 16,
  },
  [RoadType.Bridge]: {
    id: RoadType.Bridge,
    key: 'bridge',
    name: 'Bridge',
    unlockLevel: 4,
    requiredTech: 'arch_engineering',
    coinCost: 35,
    materialCost: { wood: 4, stone: 2 },
    speedMultiplier: 1.35,
    tierRank: 3,
    allowedOnWater: true,
    color: '#854d0e',
    trimColor: '#b45309',
    xpYield: 12,
  },
  [RoadType.Rail]: {
    id: RoadType.Rail,
    key: 'rail',
    name: 'Railway Track',
    unlockLevel: 16,
    requiredTech: 'steam_locomotion',
    coinCost: 65,
    materialCost: { steel: 2, wood: 2 },
    speedMultiplier: 2.5,
    tierRank: 9,
    allowedOnWater: false,
    color: '#52525b',
    trimColor: '#a16207',
    xpYield: 18,
  },
  [RoadType.SmallRoad]: {
    id: RoadType.SmallRoad,
    key: 'small_road',
    name: 'Small Road',
    unlockLevel: 1,
    coinCost: 8,
    materialCost: {},
    speedMultiplier: 1.1,
    tierRank: 2,
    allowedOnWater: false,
    color: '#78716c',
    trimColor: '#57534e',
    xpYield: 3,
  },
  [RoadType.ResidentialRoad]: {
    id: RoadType.ResidentialRoad,
    key: 'residential_road',
    name: 'Residential Road',
    unlockLevel: 2,
    coinCost: 16,
    materialCost: { stone: 1 },
    speedMultiplier: 1.25,
    tierRank: 3,
    allowedOnWater: false,
    color: '#64748b',
    trimColor: '#cbd5e1',
    xpYield: 5,
  },
  [RoadType.TwoLane]: {
    id: RoadType.TwoLane,
    key: 'two_lane',
    name: 'Two-Lane Road',
    unlockLevel: 4,
    coinCost: 28,
    materialCost: { stone: 2 },
    speedMultiplier: 1.55,
    tierRank: 4,
    allowedOnWater: false,
    color: '#475569',
    trimColor: '#e2e8f0',
    xpYield: 7,
  },
  [RoadType.FourLane]: {
    id: RoadType.FourLane,
    key: 'four_lane',
    name: 'Four-Lane Road',
    unlockLevel: 7,
    coinCost: 52,
    materialCost: { stone: 2, cement: 1 },
    speedMultiplier: 1.9,
    tierRank: 6,
    allowedOnWater: false,
    color: '#334155',
    trimColor: '#f8fafc',
    xpYield: 11,
  },
  [RoadType.SixLane]: {
    id: RoadType.SixLane,
    key: 'six_lane',
    name: 'Six-Lane Road',
    unlockLevel: 10,
    coinCost: 78,
    materialCost: { cement: 2 },
    speedMultiplier: 2.1,
    tierRank: 7,
    allowedOnWater: false,
    color: '#1e293b',
    trimColor: '#fbbf24',
    xpYield: 14,
  },
  [RoadType.EightLane]: {
    id: RoadType.EightLane,
    key: 'eight_lane',
    name: 'Eight-Lane Road',
    unlockLevel: 14,
    coinCost: 110,
    materialCost: { cement: 2, steel: 1 },
    speedMultiplier: 2.45,
    tierRank: 8,
    allowedOnWater: false,
    color: '#18181b',
    trimColor: '#facc15',
    xpYield: 18,
  },
  [RoadType.IndustrialRoad]: {
    id: RoadType.IndustrialRoad,
    key: 'industrial_road',
    name: 'Industrial Road',
    unlockLevel: 5,
    coinCost: 34,
    materialCost: { stone: 2 },
    speedMultiplier: 1.68,
    tierRank: 5,
    allowedOnWater: false,
    color: '#52525b',
    trimColor: '#f59e0b',
    xpYield: 9,
  },
  [RoadType.CommercialBlvd]: {
    id: RoadType.CommercialBlvd,
    key: 'commercial_blvd',
    name: 'Commercial Boulevard',
    unlockLevel: 6,
    coinCost: 48,
    materialCost: { stone: 2 },
    speedMultiplier: 1.95,
    tierRank: 6,
    allowedOnWater: false,
    color: '#3f3f46',
    trimColor: '#38bdf8',
    xpYield: 12,
  },
  [RoadType.Expressway]: {
    id: RoadType.Expressway,
    key: 'expressway',
    name: 'Expressway',
    unlockLevel: 16,
    coinCost: 130,
    materialCost: { cement: 3, steel: 1 },
    speedMultiplier: 2.7,
    tierRank: 9,
    allowedOnWater: false,
    color: '#0f172a',
    trimColor: '#fde047',
    xpYield: 20,
  },
  [RoadType.ElevatedHighway]: {
    id: RoadType.ElevatedHighway,
    key: 'elevated_highway',
    name: 'Elevated Highway',
    unlockLevel: 18,
    coinCost: 165,
    materialCost: { cement: 3, steel: 2 },
    speedMultiplier: 2.9,
    tierRank: 10,
    allowedOnWater: true,
    color: '#1e293b',
    trimColor: '#38bdf8',
    xpYield: 24,
  },
  [RoadType.UndergroundRoad]: {
    id: RoadType.UndergroundRoad,
    key: 'underground_road',
    name: 'Underground Road',
    unlockLevel: 18,
    coinCost: 155,
    materialCost: { cement: 3, steel: 2 },
    speedMultiplier: 2.75,
    tierRank: 10,
    allowedOnWater: true,
    color: '#1e1b4b',
    trimColor: '#818cf8',
    xpYield: 22,
  },
  [RoadType.Interchange]: {
    id: RoadType.Interchange,
    key: 'interchange',
    name: 'Highway Interchange',
    unlockLevel: 18,
    coinCost: 180,
    materialCost: { cement: 4, steel: 2 },
    speedMultiplier: 3.1,
    tierRank: 11,
    allowedOnWater: false,
    color: '#09090b',
    trimColor: '#fb923c',
    xpYield: 28,
  },
  [RoadType.Roundabout]: {
    id: RoadType.Roundabout,
    key: 'roundabout',
    name: 'Roundabout',
    unlockLevel: 5,
    coinCost: 40,
    materialCost: { stone: 2 },
    speedMultiplier: 1.8,
    tierRank: 5,
    allowedOnWater: false,
    color: '#3f3f46',
    trimColor: '#4ade80',
    xpYield: 10,
  },
  [RoadType.ParkingLot]: {
    id: RoadType.ParkingLot,
    key: 'parking_lot',
    name: 'Roadside Parking',
    unlockLevel: 3,
    coinCost: 20,
    materialCost: { stone: 1 },
    speedMultiplier: 1.15,
    tierRank: 2,
    allowedOnWater: false,
    color: '#334155',
    trimColor: '#60a5fa',
    xpYield: 5,
  },
  [RoadType.ThreeLane]: {
    id: RoadType.ThreeLane,
    key: 'three_lane',
    name: 'Three-Lane Road',
    unlockLevel: 5,
    coinCost: 38,
    materialCost: { stone: 2 },
    speedMultiplier: 1.72,
    tierRank: 5,
    allowedOnWater: false,
    color: '#3b4754',
    trimColor: '#e2e8f0',
    xpYield: 9,
  },
};

export const BUILDABLE_ROADS: RoadDef[] = [
  ROADS[RoadType.Dirt],
  ROADS[RoadType.SmallRoad],
  ROADS[RoadType.Gravel],
  ROADS[RoadType.ResidentialRoad],
  ROADS[RoadType.Stone],
  ROADS[RoadType.TwoLane],
  ROADS[RoadType.ThreeLane],
  ROADS[RoadType.IndustrialRoad],
  ROADS[RoadType.Roundabout],
  ROADS[RoadType.ParkingLot],
  ROADS[RoadType.Paved],
  ROADS[RoadType.FourLane],
  ROADS[RoadType.CommercialBlvd],
  ROADS[RoadType.SixLane],
  ROADS[RoadType.EightLane],
  ROADS[RoadType.Highway],
  ROADS[RoadType.Expressway],
  ROADS[RoadType.ElevatedHighway],
  ROADS[RoadType.UndergroundRoad],
  ROADS[RoadType.Interchange],
  ROADS[RoadType.Bridge],
  ROADS[RoadType.Rail],
];

export const ROAD_UPGRADE_TIERS: RoadDef[] = BUILDABLE_ROADS.filter(
  (r) => !r.allowedOnWater && r.id !== RoadType.Rail
);

export interface RoadProperties {
  lanesPerDirection: number;
  totalLanes: number;
  widthClass: 'narrow' | 'medium' | 'wide' | 'highway';
  heavyTruckFriendly: boolean;
  heavyTruckRestricted: boolean;
  supportsSignals: boolean;
  capacityPerTile: number;
}

export function getRoadProperties(roadType: RoadType): RoadProperties {
  switch (roadType) {
    case RoadType.Dirt:
    case RoadType.SmallRoad:
      return { lanesPerDirection: 1, totalLanes: 1, widthClass: 'narrow', heavyTruckFriendly: false, heavyTruckRestricted: true, supportsSignals: false, capacityPerTile: 3 };
    case RoadType.Gravel:
    case RoadType.Stone:
    case RoadType.Bridge:
    case RoadType.ParkingLot:
      return { lanesPerDirection: 1, totalLanes: 2, widthClass: 'narrow', heavyTruckFriendly: false, heavyTruckRestricted: false, supportsSignals: false, capacityPerTile: 5 };
    case RoadType.ResidentialRoad:
      return { lanesPerDirection: 1, totalLanes: 2, widthClass: 'medium', heavyTruckFriendly: false, heavyTruckRestricted: true, supportsSignals: false, capacityPerTile: 6 };
    case RoadType.TwoLane:
      return { lanesPerDirection: 1, totalLanes: 2, widthClass: 'medium', heavyTruckFriendly: true, heavyTruckRestricted: false, supportsSignals: true, capacityPerTile: 8 };
    case RoadType.ThreeLane:
      return { lanesPerDirection: 2, totalLanes: 3, widthClass: 'wide', heavyTruckFriendly: true, heavyTruckRestricted: false, supportsSignals: true, capacityPerTile: 12 };
    case RoadType.IndustrialRoad:
      return { lanesPerDirection: 1, totalLanes: 2, widthClass: 'medium', heavyTruckFriendly: true, heavyTruckRestricted: false, supportsSignals: true, capacityPerTile: 10 };
    case RoadType.Roundabout:
      return { lanesPerDirection: 1, totalLanes: 2, widthClass: 'wide', heavyTruckFriendly: true, heavyTruckRestricted: false, supportsSignals: false, capacityPerTile: 14 };
    case RoadType.Paved:
    case RoadType.FourLane:
    case RoadType.CommercialBlvd:
    case RoadType.UndergroundRoad:
      return { lanesPerDirection: 2, totalLanes: 4, widthClass: 'wide', heavyTruckFriendly: true, heavyTruckRestricted: false, supportsSignals: true, capacityPerTile: 16 };
    case RoadType.SixLane:
      return { lanesPerDirection: 3, totalLanes: 6, widthClass: 'wide', heavyTruckFriendly: true, heavyTruckRestricted: false, supportsSignals: true, capacityPerTile: 22 };
    case RoadType.EightLane:
    case RoadType.Highway:
    case RoadType.Expressway:
    case RoadType.ElevatedHighway:
      return { lanesPerDirection: 4, totalLanes: 8, widthClass: 'highway', heavyTruckFriendly: true, heavyTruckRestricted: false, supportsSignals: true, capacityPerTile: 28 };
    case RoadType.Interchange:
      return { lanesPerDirection: 4, totalLanes: 8, widthClass: 'highway', heavyTruckFriendly: true, heavyTruckRestricted: false, supportsSignals: false, capacityPerTile: 32 };
    case RoadType.Rail:
      return { lanesPerDirection: 1, totalLanes: 1, widthClass: 'medium', heavyTruckFriendly: true, heavyTruckRestricted: false, supportsSignals: false, capacityPerTile: 16 };
    default:
      return { lanesPerDirection: 1, totalLanes: 2, widthClass: 'medium', heavyTruckFriendly: true, heavyTruckRestricted: false, supportsSignals: false, capacityPerTile: 6 };
  }
}

