import type { ResourceId } from '../data/resources.data';
import type { BuildingCategory, WorkerClass } from '../data/buildings.data';
import type { PolicyId } from '../data/policies.data';
import type { RoadType } from '../data/roads.data';

export const SCHEMA_VERSION = 4;
export const DAYS_PER_WEEK = 7;
export const WEEKS_PER_MONTH = 4;
export const MONTHS_PER_YEAR = 12;
export const MONTHS_PER_SEASON = 3;

export interface GrowingTreeRecord {
  gx: number;
  gy: number;
  stage: 0 | 1; // 0 = Sapling, 1 = MediumTree
  elapsedSec: number;
  matureType: number; // FeatureType value for mature stage
}

export type WorldEventId =
  | 'merchant_caravan'
  | 'bountiful_harvest'
  | 'gold_rush'
  | 'scholar_symposium';

export interface ActiveWorldEvent {
  id: WorldEventId;
  title: string;
  description: string;
  ticksRemaining: number;
}

export const enum BiomeId {
  DeepWater = 0,
  River = 1,
  Beach = 2,
  Grassland = 3,
  Fertile = 4,
  Jungle = 5,
  Forest = 6,
  Swamp = 7,
  Desert = 8,
  Mountain = 9,
}

export const enum TileFlag {
  Unlocked = 1 << 0,
  Explored = 1 << 1,
  Irrigated = 1 << 2,
}

export const enum UtilityFlag {
  None = 0,
  PowerLine = 1 << 0,
  PowerSubstation = 1 << 1,
  WaterPipe = 1 << 2,
  WaterPump = 1 << 3,
}

export const enum ZoneId {
  None = 0,
  Residential = 1,
  Industrial = 2,
  Commercial = 3,
  Agricultural = 4,
  SEZ = 5,
  Government = 6,
  EPZ = 7,
  HeavyIndustrial = 8,
  Financial = 9,
  Fishing = 10,
  Mining = 11,
  Forestry = 12,
  Logistics = 13,
  Port = 14,
  TechPark = 15,
  Research = 16,
}

export type ZoneType =
  | 'none'
  | 'residential'
  | 'industrial'
  | 'commercial'
  | 'agricultural'
  | 'sez'
  | 'government'
  | 'epz'
  | 'heavy_industrial'
  | 'financial'
  | 'fishing'
  | 'mining'
  | 'forestry'
  | 'logistics'
  | 'port'
  | 'tech_park'
  | 'research';

export const ZONE_ID_TO_TYPE: Record<number, ZoneType> = {
  [ZoneId.None]: 'none',
  [ZoneId.Residential]: 'residential',
  [ZoneId.Industrial]: 'industrial',
  [ZoneId.Commercial]: 'commercial',
  [ZoneId.Agricultural]: 'agricultural',
  [ZoneId.SEZ]: 'sez',
  [ZoneId.Government]: 'government',
  [ZoneId.EPZ]: 'epz',
  [ZoneId.HeavyIndustrial]: 'heavy_industrial',
  [ZoneId.Financial]: 'financial',
  [ZoneId.Fishing]: 'fishing',
  [ZoneId.Mining]: 'mining',
  [ZoneId.Forestry]: 'forestry',
  [ZoneId.Logistics]: 'logistics',
  [ZoneId.Port]: 'port',
  [ZoneId.TechPark]: 'tech_park',
  [ZoneId.Research]: 'research',
};

export const ZONE_TYPE_TO_ID: Record<ZoneType, ZoneId> = {
  none: ZoneId.None,
  residential: ZoneId.Residential,
  industrial: ZoneId.Industrial,
  commercial: ZoneId.Commercial,
  agricultural: ZoneId.Agricultural,
  sez: ZoneId.SEZ,
  government: ZoneId.Government,
  epz: ZoneId.EPZ,
  heavy_industrial: ZoneId.HeavyIndustrial,
  financial: ZoneId.Financial,
  fishing: ZoneId.Fishing,
  mining: ZoneId.Mining,
  forestry: ZoneId.Forestry,
  logistics: ZoneId.Logistics,
  port: ZoneId.Port,
  tech_park: ZoneId.TechPark,
  research: ZoneId.Research,
};

export const ZONE_META: Record<
  ZoneType,
  { id: ZoneId; name: string; colorHex: string; colorNum: number; bonusText: string }
> = {
  none: { id: ZoneId.None, name: 'Unzoned', colorHex: '#64748b', colorNum: 0x64748b, bonusText: 'Standard' },
  residential: { id: ZoneId.Residential, name: 'Residential Zone', colorHex: '#22c55e', colorNum: 0x22c55e, bonusText: '+12% Housing Growth' },
  industrial: { id: ZoneId.Industrial, name: 'Industrial Zone', colorHex: '#f59e0b', colorNum: 0xf59e0b, bonusText: '+12% Factory Output' },
  commercial: { id: ZoneId.Commercial, name: 'Commercial Zone', colorHex: '#3b82f6', colorNum: 0x3b82f6, bonusText: '+15% Market Revenue' },
  agricultural: { id: ZoneId.Agricultural, name: 'Agricultural Zone', colorHex: '#84cc16', colorNum: 0x84cc16, bonusText: '+18% Farm Yield' },
  sez: { id: ZoneId.SEZ, name: 'Special Economic Zone (SEZ)', colorHex: '#a855f7', colorNum: 0xa855f7, bonusText: '+20% Tax & Output (Any)' },
  government: { id: ZoneId.Government, name: 'Government Zone', colorHex: '#eab308', colorNum: 0xeab308, bonusText: '+20% Civic Efficiency' },
  epz: { id: ZoneId.EPZ, name: 'Export Processing Zone (EPZ)', colorHex: '#ec4899', colorNum: 0xec4899, bonusText: '+25% Export & Forex' },
  heavy_industrial: { id: ZoneId.HeavyIndustrial, name: 'Heavy Industrial Zone', colorHex: '#ea580c', colorNum: 0xea580c, bonusText: '+22% Mega-Factory Speed' },
  financial: { id: ZoneId.Financial, name: 'Financial District', colorHex: '#06b6d4', colorNum: 0x06b6d4, bonusText: '+25% Corp Tax & Banking' },
  fishing: { id: ZoneId.Fishing, name: 'Fishing Zone', colorHex: '#0ea5e9', colorNum: 0x0ea5e9, bonusText: '+25% Catch & Processing' },
  mining: { id: ZoneId.Mining, name: 'Mining Zone', colorHex: '#78716c', colorNum: 0x78716c, bonusText: '+22% Ore & Quarry Yield' },
  forestry: { id: ZoneId.Forestry, name: 'Forestry Zone', colorHex: '#15803d', colorNum: 0x15803d, bonusText: '+25% Timber & Plantation Yield' },
  logistics: { id: ZoneId.Logistics, name: 'Logistics Zone', colorHex: '#f97316', colorNum: 0xf97316, bonusText: '+20% Truck & Depot Cap' },
  port: { id: ZoneId.Port, name: 'Port Zone', colorHex: '#1d4ed8', colorNum: 0x1d4ed8, bonusText: '+22% Shipping & Customs' },
  tech_park: { id: ZoneId.TechPark, name: 'Technology Park', colorHex: '#8b5cf6', colorNum: 0x8b5cf6, bonusText: '+25% Tech & Electronics' },
  research: { id: ZoneId.Research, name: 'Research Zone', colorHex: '#14b8a6', colorNum: 0x14b8a6, bonusText: '+30% Research Points' },
};

export type CitizenProfession =
  | 'executive'
  | 'office_worker'
  | 'factory_worker'
  | 'farmer'
  | 'fisherman'
  | 'engineer'
  | 'construction_worker'
  | 'student'
  | 'teacher'
  | 'doctor'
  | 'nurse'
  | 'police'
  | 'firefighter'
  | 'gov_officer'
  | 'shopkeeper'
  | 'chef'
  | 'miner'
  | 'forester'
  | 'courier'
  | 'tourist'
  | 'child'
  | 'teenager'
  | 'adult'
  | 'elderly';

export const enum RoadDirection {
  TwoWay = 0,
  OneWayN = 1, // dy = -1
  OneWayE = 2, // dx = +1
  OneWayS = 3, // dy = +1
  OneWayW = 4, // dx = -1
}

export type RoadVehicleKind =
  | 'car'
  | 'taxi'
  | 'bus'
  | 'delivery_van'
  | 'fish_van'
  | 'cargo_truck'
  | 'container_truck'
  | 'tractor'
  | 'construction_truck'
  | 'emergency';

export type VehicleClass = 'car' | 'van' | 'heavy_truck' | 'bus' | 'emergency';

export type UtilityFailureReason =
  | 'ok'
  | 'not_connected_to_network'
  | 'disconnected_section_no_source'
  | 'source_inactive'
  | 'distribution_overloaded'
  | 'insufficient_supply';

export interface TreePlantationState {
  buildingId: number;
  stages: number[]; // length 800 (0=empty, 1=sapling, 2=young, 3=mature)
  progress: number[]; // length 800 (0..100%)
  activeTrees: number;
  saplingCount: number;
  youngCount: number;
  matureCount: number;
  maxTreeCap: number;
  plantedTotal: number;
  harvestedTotal: number;
  woodProducedTotal: number;
  lastAction: 'planting' | 'growing' | 'harvesting' | 'idle' | 'blocked';
}

export interface TrainAgent {
  id: number;
  kind: 'passenger' | 'freight';
  gx: number;
  gy: number;
  prevGx: number;
  prevGy: number;
  progress: number;
  facing: number;
  cars: number;
}

export interface RoadVehicleAgent {
  id: number;
  kind: RoadVehicleKind;
  vehicleClass: VehicleClass;
  gx: number;
  gy: number;
  prevGx: number;
  prevGy: number;
  nextGx: number;
  nextGy: number;
  progress: number;
  facing: number;
  vx: number;
  vy: number;
  laneOffset: number;
  speed: number;
  maxSpeed: number;
  state: 'en_route' | 'loading' | 'unloading' | 'waiting_signal' | 'waiting_traffic' | 'idle';
  waitTimer: number;
  blockedSec: number;
  route: Array<{ gx: number; gy: number }>;
  routeIdx: number;
  routeVersion: number;
  sourceBuildingId?: number;
  destBuildingId?: number;
  cargoResource?: ResourceId;
  cargoAmount?: number;
  returning?: boolean;
  statusReason?: string;
}

export interface CorporateSectorStats {
  sector: string;
  buildings: number;
  workers: number;
  profitPerMin: number;
  marketSharePct: number;
}

export interface ChunkData {
  cx: number;
  cy: number;
  key: string;
  isModified: boolean;
  lastTouchedTick: number;
  biomeId: Uint8Array;
  elevation: Uint8Array;
  moisture: Uint8Array;
  flags: Uint8Array;
  featureType: Uint8Array;
  featureHp: Uint16Array;
  depositType: Uint8Array;
  depositQty: Uint16Array;
  roadType: Uint8Array;
  buildingRef: Int32Array;
  pollution: Uint8Array;
  // Schema v2 per-tile layers (saved across 16x16 chunk boundaries)
  utilityNet: Uint8Array;
  cityRef: Uint16Array;
  zoneType: Uint8Array;
  // Road lane/one-way direction metadata (0=TwoWay, 1=N, 2=E, 3=S, 4=W)
  roadDir: Uint8Array;
}

export type BuildingStatus =
  | 'constructing'
  | 'active'
  | 'no_workers'
  | 'no_inputs'
  | 'storage_full'
  | 'no_road'
  | 'no_power'
  | 'no_water'
  | 'deposit_depleted'
  | 'disabled';

export interface BuildingInstance {
  id: number;
  defId: string;
  gx: number;
  gy: number;
  rotation?: 0 | 1; // 0 = default WxH, 1 = swapped HxW
  cityId?: number;
  level: number;
  status: BuildingStatus;
  buildProgress: number; // 0..1
  prodProgress: number; // 0..1
  assignedWorkers: number;
  lockedWorkers: number | null; // null = auto
  enabled: boolean;
  connectedRoadCluster: number;
  powerConnected?: boolean;
  waterConnected?: boolean;
  powerNetworkId?: number;
  waterNetworkId?: number;
  powerSatisfaction?: number; // 0..1
  waterSatisfaction?: number; // 0..1
  entranceValid?: boolean;
  congestionFactor?: number; // 0.5..1.0
  theoreticalHourlyRate?: number;
  actualHourlyRate?: number;
  realizedOutputTotal?: number;
  productionBottleneck?: string;
  powerReason?: UtilityFailureReason;
  waterReason?: UtilityFailureReason;
  roadReason?: string;
}

export interface CityRecord {
  id: number;
  name: string;
  color: string;
  createdTick: number;
  taxRate: number;
  unlockedTiles: number;
}

export interface DistrictZoneRecord {
  id: number;
  cityId: number;
  name: string;
  zoneType: ZoneType;
  taxModifier: number;
}

export interface CityEconomySnapshot {
  cityId: number;
  taxIncome: number;
  upkeepExpense: number;
  wageExpense: number;
  net: number;
  buildingCount: number;
}

export interface UtilityGridSummary {
  networkId: number;
  kind?: 'power' | 'water';
  tileCount: number;
  producerCount: number;
  consumerCount: number;
  installedCapacity: number;
  availableGeneration: number;
  connectedDemand: number;
  delivered: number;
  unservedDemand: number;
  availabilityPct: number;
}

export interface UtilityNetworkSummary {
  powerConnectedCount: number;
  powerDisconnectedCount: number;
  powerBrownoutCount: number;
  waterConnectedCount: number;
  waterDisconnectedCount: number;
  waterShortageCount: number;
  serviceCoveragePct: number;
  powerInstalledCapacity?: number;
  powerConnectedDemand?: number;
  powerUnservedDemand?: number;
  powerAvailabilityPct?: number;
  waterInstalledCapacity?: number;
  waterConnectedDemand?: number;
  waterUnservedDemand?: number;
  waterAvailabilityPct?: number;
  powerNetworks?: UtilityGridSummary[];
  waterNetworks?: UtilityGridSummary[];
}

export interface CalendarState {
  dayOfWeek: number; // 1..7 within week
  weekOfMonth: number; // 1..4 within month
  month: number; // 1..12 within year
  year: number; // starts at 1
  totalDaysElapsed: number;
}

export type CurrencyCode = 'LOCAL' | 'FX';

export interface CurrencyConversionPreview {
  valid: boolean;
  direction: 'local_to_fx' | 'fx_to_local';
  inputAmount: number;
  outputAmount: number;
  fxRate: number;
  reason?: string;
}

export type FinancialTransactionType =
  | 'fx_convert'
  | 'trade_export'
  | 'trade_import'
  | 'tax_revenue'
  | 'upkeep_expense'
  | 'external_flow';

export interface FinancialTransaction {
  id: number;
  tick: number;
  monthKey: string;
  type: FinancialTransactionType;
  currency: CurrencyCode;
  amount: number;
  counterCurrency?: CurrencyCode;
  counterAmount?: number;
  fxRateUsed: number;
  summary: string;
  localBalanceAfter: number;
  fxBalanceAfter: number;
}

export interface FxRateHistoryEntry {
  monthKey: string;
  year: number;
  month: number;
  rate: number; // Local currency per 1 FX unit
  deltaPct: number;
  gdpAtClose: number;
  inflationAtClose: number;
  tradeBalanceAtClose: number;
  factors: string[];
}

export interface GdpBreakdown {
  productionValue: number;
  commercialValue: number;
  servicesValue: number;
  netExportsValue: number;
}

export interface EconomyMacroState {
  fxRate: number;
  fxHistory: FxRateHistoryEntry[];
  gdpCurrent: number;
  gdpPrevious: number;
  gdpGrowthPct: number;
  gdpBreakdown: GdpBreakdown;
  inflationRate: number;
  inflationDrivers: string[];
  moneySupplyBaseline: number;
  transactions: FinancialTransaction[];
  lastUpdatedMonthKey: string;
}

export type AgeGroup = 'child' | 'underage' | 'adult' | 'elderly';
export type EmploymentStatus = 'employed' | 'unemployed' | 'student' | 'homemaker' | 'retired';

/**
 * Authoritative citizen cohort entry:
 * Every resident belongs to exactly one cityId, one homeBuildingId (or null if homeless),
 * one ageGroup, and one employmentStatus + optional workplaceOrSchoolId.
 */
export interface CitizenCohort {
  id: string;
  cityId: number;
  homeBuildingId: number | null;
  ageGroup: AgeGroup;
  employmentStatus: EmploymentStatus;
  workerClass: WorkerClass;
  workplaceOrSchoolId: number | null;
  count: number;
}

export type SeasonType = 'spring' | 'summer' | 'autumn' | 'winter';
export type WeatherType = 'clear' | 'rain' | 'storm' | 'drought' | 'snow';
export type GameSpeed = 0 | 1 | 2 | 3;

export interface AutoTradeRule {
  resourceId: ResourceId;
  mode: 'none' | 'sell_excess' | 'buy_below';
  /** Legacy flat threshold (kept optional for backward compatibility/migration) */
  threshold: number;
  /** Target keep percentage of max storage capacity (0..100). For sell_excess, sells anything above floor(cap * keepPct / 100). */
  keepPct?: number;
}

export interface HappinessDriver {
  id: string;
  label: string;
  delta: number; // positive or negative impact points
  detail: string;
  category: 'food' | 'water' | 'tax' | 'service' | 'housing' | 'environment' | 'policy';
  actionLabel?: string;
  actionSheet?: 'build' | 'economy' | 'population' | 'inventory' | 'land' | 'tech';
  recommendedDefId?: string;
}

export interface HappinessReport {
  score: number;
  base: number;
  drivers: HappinessDriver[];
  recommendations: HappinessDriver[];
}

export interface OfflineSummary {
  elapsedSeconds: number;
  effectiveMinutes: number;
  coinsEarned: number;
  resourcesProduced: number;
  topResourceName?: string;
  topResourceAmount?: number;
}

export interface EconomyLedgerEntry {
  tick: number;
  taxIncome: number;
  tradeIncome: number;
  upkeepExpense: number;
  wageExpense: number;
  net: number;
}

export interface NotificationItem {
  id: number;
  tick: number;
  severity: 'critical' | 'warning' | 'milestone' | 'info';
  title: string;
  message: string;
}

export interface GameSettings {
  cityName: string;
  difficulty: 'standard' | 'relaxed';
  masterVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  graphicsMode: 'auto' | 'high' | 'low_power';
  crowdDensity: 'auto' | 'low' | 'medium' | 'high';
  reducedAnimations: boolean;
  mildDisasters: boolean;
  haptics: boolean;
  timeMode: 'normal' | 'always_day' | 'always_night';
  weatherMode: 'random' | 'always_clear';
}

export interface CumulativeStats {
  treesCut: number;
  unlockedTiles: number;
  buildingsBuilt: number;
  roadsBuilt: number;
  maxPopulation: number;
  totalCoinsEarned: number;
  tradesCompleted: number;
  playTimeSeconds: number;
  ruinsExplored: number;
  festivalsHeld: number;
  buildingsMoved: number;
}

export interface PopulationState {
  total: number;
  capacity: number;
  happiness: number;
  classes: Record<WorkerClass, number>;
  employed: number;
  unemployed: number;
  homeless: number;
  availableWorkforce?: number;
  totalJobs?: number;
  occupiedJobs?: number;
  vacantJobs?: number;
  ageBreakdown: Record<AgeGroup, number>;
  cohorts: CitizenCohort[];
  growthAccumulator: number;
  needs: {
    food: number; // 0..1
    water: number; // 0..1
    healthcare: number; // 0..1
    education: number; // 0..1
    safety: number; // 0..1
    recreation: number; // 0..1
  };
}

export interface EnvironmentState {
  forestCoveragePct: number;
  avgPollution: number;
  waterQuality: number;
  biodiversity: number;
  sustainability: number;
}

export interface WorldEngineState {
  schemaVersion: number;
  worldSeed: number;
  tick: number;
  speed: GameSpeed;
  coins: number;
  xp: number;
  level: number;
  researchPoints: number;
  activeTechId: string | null;
  activeTechProgress: number;
  unlockedTechIds: string[];
  completedQuestIds: string[];
  trackedQuestId?: string | null;
  unlockedAchievements: string[];
  resources: Record<ResourceId, number>;
  capacities: Record<ResourceId, number>;
  netRatesPerMin: Partial<Record<ResourceId, number>>;
  buildings: BuildingInstance[];
  nextBuildingId: number;
  unlockedBuildingLevels: Record<string, number>;
  cities: CityRecord[];
  activeCityId: number;
  nextCityId: number;
  zones: DistrictZoneRecord[];
  workforcePriorities: Record<BuildingCategory, number>;
  workforceAutoAssign: boolean;
  emergencyWorkTicksRemaining: number;
  taxRate: number; // 0.5, 1.0, 1.5, 2.0
  marketPrices: Record<ResourceId, number>;
  marketPrevPrices?: Partial<Record<ResourceId, number>>;
  autoTradeRules: Partial<Record<ResourceId, AutoTradeRule>>;
  ledger: EconomyLedgerEntry[];
  cityEconomy: Record<number, CityEconomySnapshot>;
  season: SeasonType;
  dayInSeason: number;
  year: number;
  calendar: CalendarState;
  economy: EconomyMacroState;
  timeOfDayHours: number; // 0..24 (1 in-game hour = 60s at 1x; 24 real min = 24h cycle)
  weather: WeatherType;
  nextWeather: WeatherType;
  weatherTicksRemaining: number;
  activePolicies: PolicyId[];
  festivalTicksRemaining: number;
  festivalCooldownTicks: number;
  activeEvent: ActiveWorldEvent | null;
  population: PopulationState;
  environment: EnvironmentState;
  powerInstalledCapacity?: number;
  powerGenerated: number;
  powerAvailableGen?: number;
  powerDistCapacity?: number;
  powerConnectedDemand?: number;
  powerDelivered?: number;
  powerUnservedDemand?: number;
  powerDemand: number;
  waterInstalledCapacity?: number;
  waterGenerated: number;
  waterAvailableGen?: number;
  waterDistCapacity?: number;
  waterConnectedDemand?: number;
  waterDelivered?: number;
  waterUnservedDemand?: number;
  waterDemand: number;
  utilitySummary: UtilityNetworkSummary;
  roadConnectedCount: number;
  stats: CumulativeStats;
  camera: { x: number; y: number; zoom: number };
  settings: GameSettings;
  lastSavedAt?: number;
  foreignCurrency?: number;
  tradeBalance?: number;
  customsFeeRate?: number;
  lifeExpectancy?: number;
  sicknessRate?: number;
  showZoneBorders?: boolean;
  landModeActive?: boolean;
  corporateStats?: CorporateSectorStats[];
  treePlantations?: Record<number, TreePlantationState>;
  growingTrees?: GrowingTreeRecord[];
}

export interface TileInspection {
  gx: number;
  gy: number;
  biomeId: BiomeId;
  biomeName: string;
  elevation: number;
  moisture: number;
  unlocked: boolean;
  canUnlock: boolean;
  unlockCost: number;
  featureType: number;
  featureHp: number;
  featureMaxHp: number;
  depositType: number;
  depositQty: number;
  roadType: RoadType;
  building: BuildingInstance | null;
  pollution: number;
  cityId: number;
  cityName: string;
  zoneType: ZoneType;
  utilityNet: number;
  roadDirection?: RoadDirection;
  roadClusterId?: number;
  roadIntersectionKind?: string;
  roadCongestion?: number;
  roadDisconnected?: boolean;
}
