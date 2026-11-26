import type { BuildingCategory } from '../data/buildings.data';
import type { PolicyId } from '../data/policies.data';
import type { ResourceId } from '../data/resources.data';
import type { RoadType } from '../data/roads.data';
import type { AutoTradeRule, GameSettings, GameSpeed, RoadDirection, UtilityFlag, ZoneType } from './GameState';

export type GameCommand =
  | { type: 'CHOP_TILE'; gx: number; gy: number; isManualTap: boolean }
  | { type: 'REPLANT_TILE'; gx: number; gy: number }
  | { type: 'EXPLORE_RUIN'; gx: number; gy: number }
  | { type: 'UNLOCK_TILE'; gx: number; gy: number }
  | { type: 'UNLOCK_BATCH_FRONTIER'; centerGx: number; centerGy: number; radius: number }
  | { type: 'UNLOCK_CHUNK'; cx: number; cy: number }
  | { type: 'PLACE_BUILDING'; defId: string; gx: number; gy: number; rotation?: 0 | 1; targetLevel?: number }
  | { type: 'MOVE_BUILDING'; buildingId: number; gx: number; gy: number; rotation?: 0 | 1 }
  | { type: 'PLACE_ROAD'; roadType: RoadType; gx: number; gy: number }
  | { type: 'REMOVE_ROAD'; gx: number; gy: number }
  | { type: 'SET_ROAD_DIRECTION'; gx: number; gy: number; direction: RoadDirection }
  | { type: 'UPGRADE_BUILDING'; buildingId: number }
  | { type: 'UPGRADE_BLUEPRINT'; defId: string }
  | { type: 'DEMOLISH_BUILDING'; buildingId: number }
  | { type: 'TOGGLE_BUILDING'; buildingId: number }
  | { type: 'RESUME_ALL_BUILDINGS' }
  | { type: 'SET_BUILDING_WORKERS'; buildingId: number; lockedWorkers: number | null }
  | { type: 'SET_WORKFORCE_PRIORITY'; category: BuildingCategory; priority: number }
  | { type: 'SET_WORKFORCE_AUTO'; enabled: boolean }
  | { type: 'RECRUIT_WORKERS'; cityId: number; count: number }
  | { type: 'DISPATCH_EMERGENCY_WORKERS' }
  | { type: 'SET_TAX_RATE'; rate: number }
  | { type: 'TOGGLE_POLICY'; policyId: PolicyId }
  | { type: 'START_FESTIVAL' }
  | { type: 'BUY_MISSING_FOR_BUILDING'; defId: string; allowEmergency?: boolean }
  | { type: 'RUSH_CONSTRUCTION'; buildingId: number }
  | { type: 'CLEAR_AREA_OBSTACLES'; tiles: Array<{ gx: number; gy: number }> }
  | { type: 'BUY_RESOURCE'; resourceId: ResourceId; amount: number }
  | { type: 'SELL_RESOURCE'; resourceId: ResourceId; amount: number }
  | { type: 'SELL_ALL_EXCESS'; keepAmount: number }
  | { type: 'SELL_EXCESS_BY_PCT'; keepPct: number }
  | { type: 'SET_AUTO_TRADE'; rule: AutoTradeRule }
  | { type: 'START_TECH'; techId: string }
  | { type: 'SET_SPEED'; speed: GameSpeed }
  | { type: 'SET_TIME_OF_DAY'; hours: number }
  | { type: 'UPDATE_SETTINGS'; partial: Partial<GameSettings> }
  | { type: 'SET_CAMERA'; x: number; y: number; zoom: number }
  | { type: 'SET_TRACKED_QUEST'; questId: string | null }
  | { type: 'TERRAFORM_TILE'; gx: number; gy: number; action: 'to_water' | 'to_land'; confirmDemolish?: boolean }
  | { type: 'CREATE_CITY'; name: string; color?: string }
  | { type: 'RENAME_CITY'; cityId: number; name: string }
  | { type: 'SET_ACTIVE_CITY'; cityId: number }
  | { type: 'ASSIGN_TILE_CITY_ZONE'; gx: number; gy: number; cityId?: number; zoneType?: ZoneType }
  | { type: 'SET_UTILITY_TILE'; gx: number; gy: number; flag: UtilityFlag; enabled: boolean }
  | { type: 'PLACE_UTILITY'; kind: 'power_line' | 'substation' | 'water_pipe' | 'water_pump'; gx: number; gy: number }
  | { type: 'REMOVE_UTILITY'; kind: 'power' | 'water'; gx: number; gy: number }
  | { type: 'UNLOCK_RECTANGLE'; startGx: number; startGy: number; width: number; height: number }
  | {
      type: 'BUILD_ROAD_GRID';
      startGx: number;
      startGy: number;
      width: number;
      height: number;
      spacing: number;
      roadType: RoadType;
    }
  | { type: 'UPGRADE_CONNECTED_ROADS'; gx: number; gy: number; targetRoadType: RoadType }
  | {
      type: 'PAINT_TERRAIN_BRUSH';
      gx: number;
      gy: number;
      radius: number;
      brush: 'water' | 'land' | 'unlock' | 'zone';
      zoneType?: ZoneType;
    }
  | { type: 'TOGGLE_ZONE_BORDERS'; enabled: boolean }
  | { type: 'TOGGLE_LAND_MODE'; enabled: boolean }
  | { type: 'CONVERT_CURRENCY'; direction: 'local_to_fx' | 'fx_to_local'; amount: number };

export interface CommandResult {
  ok: boolean;
  reason?: string;
  needsConfirm?: boolean;
}
