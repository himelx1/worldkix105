export type PolicyId =
  | 'double_shift'
  | 'green_charter'
  | 'scholar_grants'
  | 'free_bread'
  | 'timber_stewards'
  | 'free_trade_act'
  | 'night_bazaar_act'
  | 'eco_water_pact'
  | 'artisan_stipend';

export interface PolicyDef {
  id: PolicyId;
  name: string;
  effectText: string;
  tradeoffText: string;
  upkeepPerMin: number;
  unlockLevel: number;
}

export const CITY_POLICIES: PolicyDef[] = [
  {
    id: 'timber_stewards',
    name: 'Timber Guild Charter',
    effectText: '+35% Wood & Bamboo yields · 1.5× Regrowth',
    tradeoffText: '-4 Coins/min guild stipend',
    upkeepPerMin: 4,
    unlockLevel: 1,
  },
  {
    id: 'free_bread',
    name: 'Civic Bread Subsidy',
    effectText: '+10 Citizen Happiness',
    tradeoffText: '-12 Coins/min treasury subsidy',
    upkeepPerMin: 12,
    unlockLevel: 2,
  },
  {
    id: 'green_charter',
    name: 'Green Canopy Charter',
    effectText: '-30% Pollution · 2× Tree Regrowth',
    tradeoffText: '-10% Heavy Industry speed',
    upkeepPerMin: 4,
    unlockLevel: 3,
  },
  {
    id: 'double_shift',
    name: 'Double Shift Mandate',
    effectText: '+25% Production & Factory speed',
    tradeoffText: '-6 Citizen Happiness',
    upkeepPerMin: 0,
    unlockLevel: 4,
  },
  {
    id: 'scholar_grants',
    name: 'Royal Scholar Grants',
    effectText: '+35% Research speed',
    tradeoffText: '-10 Coins/min research grant',
    upkeepPerMin: 10,
    unlockLevel: 5,
  },
  {
    id: 'free_trade_act',
    name: 'Open Harbor Charter',
    effectText: '+30% Trade Capacity · +12% Sell prices',
    tradeoffText: '-8 Coins/min customs waiver',
    upkeepPerMin: 8,
    unlockLevel: 5,
  },
  {
    id: 'night_bazaar_act',
    name: 'Night Lantern Decree',
    effectText: '+30% Commercial Taxes · +4 Night Happiness',
    tradeoffText: '-6 Coins/min streetlamp fuel',
    upkeepPerMin: 6,
    unlockLevel: 4,
  },
  {
    id: 'eco_water_pact',
    name: 'Watershed Conservation',
    effectText: '-25% Water demand · +10 Water Quality',
    tradeoffText: '-5 Coins/min canal maintenance',
    upkeepPerMin: 5,
    unlockLevel: 3,
  },
  {
    id: 'artisan_stipend',
    name: 'Master Artisan Guild',
    effectText: '+25% Craft & Textile production speed',
    tradeoffText: '-12 Coins/min guild stipend',
    upkeepPerMin: 12,
    unlockLevel: 7,
  },
];

export const POLICY_MAP: Record<PolicyId, PolicyDef> = Object.fromEntries(
  CITY_POLICIES.map((p) => [p.id, p])
) as Record<PolicyId, PolicyDef>;
