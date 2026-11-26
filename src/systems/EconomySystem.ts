import { BUILDINGS, getBuildingLevelMultiplier } from '../data/buildings.data';
import { POLICY_MAP } from '../data/policies.data';
import { RESOURCE_LIST, RESOURCES, ResourceId } from '../data/resources.data';
import type { AutoTradeRule, CityEconomySnapshot, WorldEngineState } from '../core/GameState';
import { getBuildingStatsAtLevel } from './BuildingSimulation';
import { ResourceSystem } from './ResourceSystem';
import { DistrictServiceSystem } from './DistrictServiceSystem';
import { FinanceSystem } from './FinanceSystem';

export interface MissingMaterialPurchaseItem {
  resourceId: ResourceId;
  amount: number;
}

export class EconomySystem {
  public static previewCurrencyConversion(
    state: WorldEngineState,
    direction: 'local_to_fx' | 'fx_to_local',
    amount: number
  ) {
    return FinanceSystem.previewCurrencyConversion(state, direction, amount);
  }

  public static convertCurrency(
    state: WorldEngineState,
    direction: 'local_to_fx' | 'fx_to_local',
    amount: number
  ) {
    return FinanceSystem.convertCurrency(state, direction, amount);
  }

  public static onCalendarMonthChanged(state: WorldEngineState): boolean {
    return FinanceSystem.onCalendarMonthChanged(state);
  }

  public static createInitialMarketPrices(): Record<ResourceId, number> {
    const prices = {} as Record<ResourceId, number>;
    for (const r of RESOURCE_LIST) {
      prices[r.id] = r.basePrice;
    }
    return prices;
  }

  public static getBuyPrice(state: WorldEngineState, id: ResourceId): number {
    return Math.max(1, Math.round((state.marketPrices[id] ?? RESOURCES[id].basePrice) * 1.15));
  }

  public static getEmergencyCourierBuyPrice(state: WorldEngineState, id: ResourceId): number {
    return Math.max(2, Math.round(this.getBuyPrice(state, id) * 1.45));
  }

  public static getSellPrice(state: WorldEngineState, id: ResourceId): number {
    let mult = 0.85;
    if (state.activePolicies?.includes('free_trade_act')) mult *= 1.12;
    if (state.activeEvent?.id === 'merchant_caravan') mult *= 1.25;
    return Math.max(1, Math.floor((state.marketPrices[id] ?? RESOURCES[id].basePrice) * mult));
  }

  public static getMarketTrend(state: WorldEngineState, id: ResourceId): 'up' | 'down' | 'flat' {
    const cur = state.marketPrices[id] ?? RESOURCES[id].basePrice;
    const prev = state.marketPrevPrices?.[id] ?? RESOURCES[id].basePrice;
    if (cur - prev > 0.25) return 'up';
    if (prev - cur > 0.25) return 'down';
    return 'flat';
  }

  public static getTradeCapacity(state: WorldEngineState): number {
    let cap = 0;
    for (const b of state.buildings) {
      if (b.status !== 'active') continue;
      const def = BUILDINGS[b.defId];
      if (!def) continue;
      const tradeCap = getBuildingStatsAtLevel(def, b.level).tradeCapacity;
      if (tradeCap > 0) {
        cap += tradeCap;
      }
    }
    if (cap > 0 && state.activePolicies?.includes('free_trade_act')) {
      cap = Math.round(cap * 1.3);
    }
    return cap;
  }

  public static getRuleKeepTarget(state: WorldEngineState, rule: AutoTradeRule): number {
    const storageCap = Math.max(1, state.capacities[rule.resourceId] ?? RESOURCES[rule.resourceId]?.baseCap ?? 100);
    if (typeof rule.keepPct === 'number' && Number.isFinite(rule.keepPct)) {
      const clampedPct = Math.max(0, Math.min(100, rule.keepPct));
      return Math.floor((storageCap * clampedPct) / 100);
    }
    return Math.max(0, Math.floor(rule.threshold ?? 0));
  }

  public static getTaxImpactPreview(
    state: WorldEngineState,
    candidateRate: number
  ): {
    taxPerMin: number;
    netPerMin: number;
    happinessDelta: number;
  } {
    const curTaxHappy =
      state.taxRate <= 0.6 ? 8 : state.taxRate <= 1.05 ? 0 : state.taxRate <= 1.55 ? -12 : -26;
    const candTaxHappy =
      candidateRate <= 0.6 ? 8 : candidateRate <= 1.05 ? 0 : candidateRate <= 1.55 ? -12 : -26;
    const lastLedger = state.ledger[state.ledger.length - 1];
    const baseTax = lastLedger?.taxIncome ?? 0;
    const ratio = state.taxRate > 0 ? candidateRate / state.taxRate : candidateRate;
    const estTax = Math.round(baseTax * ratio);
    const expenses = (lastLedger?.upkeepExpense ?? 0) + (lastLedger?.wageExpense ?? 0);
    return {
      taxPerMin: estTax,
      netPerMin: estTax - expenses,
      happinessDelta: candTaxHappy - curTaxHappy,
    };
  }

  public static quoteMissingMaterialsCost(
    state: WorldEngineState,
    items: MissingMaterialPurchaseItem[],
    useCourierIfNoTradePost = true
  ): {
    totalCost: number;
    usesCourierFee: boolean;
    hasTradePost: boolean;
    canPurchase: boolean;
    reason?: string;
  } {
    const hasTradePost = this.getTradeCapacity(state) > 0;
    if (!hasTradePost && !useCourierIfNoTradePost) {
      return {
        totalCost: 0,
        usesCourierFee: false,
        hasTradePost: false,
        canPurchase: false,
        reason: 'Build a Trading Post first',
      };
    }

    let totalCost = 0;
    for (const item of items) {
      if (item.amount <= 0) continue;
      const unit = hasTradePost
        ? this.getBuyPrice(state, item.resourceId)
        : this.getEmergencyCourierBuyPrice(state, item.resourceId);
      totalCost += unit * item.amount;
      const freeSpace = Math.floor((state.capacities[item.resourceId] ?? 100) - (state.resources[item.resourceId] ?? 0));
      if (freeSpace < item.amount) {
        return {
          totalCost,
          usesCourierFee: !hasTradePost,
          hasTradePost,
          canPurchase: false,
          reason: `Not enough storage space for ${RESOURCES[item.resourceId]?.name ?? item.resourceId} (build Granary/Warehouse)`,
        };
      }
    }

    return {
      totalCost,
      usesCourierFee: !hasTradePost,
      hasTradePost,
      canPurchase: state.coins >= totalCost && items.some((i) => i.amount > 0),
      reason: state.coins < totalCost ? `Need ${totalCost} Coins (have ${Math.floor(state.coins)})` : undefined,
    };
  }

  public static buyMissingMaterials(
    state: WorldEngineState,
    items: MissingMaterialPurchaseItem[],
    allowEmergencyCourier = true
  ): { ok: boolean; reason?: string; cost: number } {
    const quote = this.quoteMissingMaterialsCost(state, items, allowEmergencyCourier);
    if (!quote.canPurchase) {
      return { ok: false, reason: quote.reason ?? 'Cannot purchase missing materials', cost: 0 };
    }
    if (state.coins < quote.totalCost) {
      return { ok: false, reason: `Needs ${quote.totalCost} Coins`, cost: 0 };
    }

    state.coins -= quote.totalCost;
    for (const item of items) {
      if (item.amount <= 0) continue;
      ResourceSystem.addClamped(state, item.resourceId, item.amount);
    }
    state.stats.tradesCompleted += 1;
    FinanceSystem.recordTransaction(state, {
      type: 'trade_import',
      currency: 'LOCAL',
      amount: -quote.totalCost,
      fxRateUsed: FinanceSystem.ensureEconomyState(state).fxRate,
      summary: `Purchased missing build materials (${quote.totalCost.toLocaleString()} Local)`,
    });
    return { ok: true, cost: quote.totalCost };
  }

  public static buyResource(
    state: WorldEngineState,
    id: ResourceId,
    amount: number
  ): { ok: boolean; reason?: string; cost: number } {
    const qty = Math.max(1, Math.floor(amount));
    if (this.getTradeCapacity(state) <= 0) {
      return { ok: false, reason: 'Build a Trading Post or Harbor first', cost: 0 };
    }
    const freeSpace = Math.floor(state.capacities[id] - state.resources[id]);
    if (freeSpace <= 0) return { ok: false, reason: 'Storage full', cost: 0 };
    const actualQty = Math.min(qty, freeSpace);
    const unitPrice = this.getBuyPrice(state, id);
    const cost = actualQty * unitPrice;
    if (state.coins < cost) return { ok: false, reason: `Insufficient Coins (needs ${cost}C)`, cost: 0 };

    state.marketPrevPrices ??= {};
    state.marketPrevPrices[id] = state.marketPrices[id];

    state.coins -= cost;
    ResourceSystem.addClamped(state, id, actualQty);
    const base = RESOURCES[id].basePrice;
    state.marketPrices[id] = Math.min(base * 1.65, state.marketPrices[id] * (1 + Math.min(0.08, actualQty * 0.002)));
    state.stats.tradesCompleted += 1;
    FinanceSystem.recordTransaction(state, {
      type: 'trade_import',
      currency: 'LOCAL',
      amount: -cost,
      fxRateUsed: FinanceSystem.ensureEconomyState(state).fxRate,
      summary: `Bought ${actualQty} ${RESOURCES[id].name} (-${cost.toLocaleString()} Local)`,
    });
    return { ok: true, cost };
  }

  public static sellResource(
    state: WorldEngineState,
    id: ResourceId,
    amount: number
  ): { ok: boolean; reason?: string; earned: number } {
    const qty = Math.max(1, Math.floor(amount));
    if (this.getTradeCapacity(state) <= 0) {
      return { ok: false, reason: 'Build a Trading Post or Harbor first', earned: 0 };
    }
    const avail = Math.floor(state.resources[id]);
    if (avail <= 0) return { ok: false, reason: 'Nothing to sell', earned: 0 };
    const actualQty = Math.min(qty, avail);
    const unitPrice = this.getSellPrice(state, id);
    const earned = actualQty * unitPrice;

    state.marketPrevPrices ??= {};
    state.marketPrevPrices[id] = state.marketPrices[id];

    state.resources[id] -= actualQty;
    state.coins += earned;
    state.stats.totalCoinsEarned += earned;
    const base = RESOURCES[id].basePrice;
    state.marketPrices[id] = Math.max(base * 0.55, state.marketPrices[id] * (1 - Math.min(0.1, actualQty * 0.0025)));
    state.stats.tradesCompleted += 1;
    FinanceSystem.recordTransaction(state, {
      type: 'trade_export',
      currency: 'LOCAL',
      amount: earned,
      fxRateUsed: FinanceSystem.ensureEconomyState(state).fxRate,
      summary: `Sold ${actualQty} ${RESOURCES[id].name} (+${earned.toLocaleString()} Local)`,
    });
    return { ok: true, earned };
  }

  public static sellAllExcess(
    state: WorldEngineState,
    keepAmount = 30
  ): { ok: boolean; reason?: string; totalEarned: number; itemsSold: number } {
    if (this.getTradeCapacity(state) <= 0) {
      return { ok: false, reason: 'Build a Trading Post or Harbor first', totalEarned: 0, itemsSold: 0 };
    }
    let totalEarned = 0;
    let itemsSold = 0;
    const keep = Math.max(0, Math.floor(keepAmount));
    for (const r of RESOURCE_LIST) {
      const avail = Math.floor(state.resources[r.id] ?? 0);
      if (avail > keep) {
        const res = this.sellResource(state, r.id, avail - keep);
        if (res.ok) {
          totalEarned += res.earned;
          itemsSold += avail - keep;
        }
      }
    }
    if (itemsSold === 0) {
      return { ok: false, reason: `No goods exceed ${keep} units`, totalEarned: 0, itemsSold: 0 };
    }
    return { ok: true, totalEarned, itemsSold };
  }

  public static sellExcessByPct(
    state: WorldEngineState,
    keepPct = 40
  ): { ok: boolean; reason?: string; totalEarned: number; itemsSold: number } {
    if (this.getTradeCapacity(state) <= 0) {
      return { ok: false, reason: 'Build a Trading Post or Harbor first', totalEarned: 0, itemsSold: 0 };
    }
    const pct = Math.max(0, Math.min(100, keepPct));
    let totalEarned = 0;
    let itemsSold = 0;
    for (const r of RESOURCE_LIST) {
      const cap = Math.max(1, state.capacities[r.id] ?? r.baseCap);
      const keepUnits = Math.floor((cap * pct) / 100);
      const avail = Math.floor(state.resources[r.id] ?? 0);
      if (avail > keepUnits) {
        const qty = avail - keepUnits;
        const res = this.sellResource(state, r.id, qty);
        if (res.ok) {
          totalEarned += res.earned;
          itemsSold += qty;
        }
      }
    }
    if (itemsSold === 0) {
      return { ok: false, reason: `All storage items are at or below ${pct}% capacity`, totalEarned: 0, itemsSold: 0 };
    }
    return { ok: true, totalEarned, itemsSold };
  }

  public static getFireUpkeepDiscount(state: WorldEngineState): number {
    const fireStations = state.buildings.filter(
      (b) => b.defId === 'fire_station' && b.status === 'active'
    ).length;
    return Math.min(0.2, fireStations * 0.05);
  }

  public static tickEconomy(state: WorldEngineState): void {
    let taxPerMin = 0;
    let upkeepPerMin = 0;
    let wagesPerMin = 0;
    let hasShoppingBoost = false;

    const homes = state.buildings.filter(
      (b) => b.status !== 'constructing' && BUILDINGS[b.defId]?.category === 'residential'
    );

    for (const b of state.buildings) {
      if (b.status === 'constructing') continue;
      const def = BUILDINGS[b.defId];
      if (!def) continue;
      if (b.defId === 'shopping_district' && b.status === 'active') hasShoppingBoost = true;
    }

    const fireDiscount = 1 - this.getFireUpkeepDiscount(state);
    const festivalTaxMult = (state.festivalTicksRemaining ?? 0) > 0 ? 1.5 : 1.0;
    const isNightHours = state.timeOfDayHours >= 17.5 || state.timeOfDayHours < 5.5;
    const nightBazaarMult = state.activePolicies?.includes('night_bazaar_act') ? 1.3 : 1.0;

    const scenicNodes = state.buildings.filter(
      (b) =>
        b.status !== 'constructing' &&
        (b.defId === 'village_park' ||
          b.defId === 'botanical_garden' ||
          b.defId === 'fountain_plaza' ||
          b.defId === 'festival_plaza')
    );

    const cityEcon: Record<number, CityEconomySnapshot> = {};
    for (const c of state.cities) {
      cityEcon[c.id] = {
        cityId: c.id,
        taxIncome: 0,
        upkeepExpense: 0,
        wageExpense: 0,
        net: 0,
        buildingCount: 0,
      };
    }

    for (const b of state.buildings) {
      if (b.status === 'constructing') continue;
      const def = BUILDINGS[b.defId];
      if (!def) continue;

      const cid = b.cityId ?? state.activeCityId ?? 1;
      const citySnap =
        cityEcon[cid] ??
        (cityEcon[cid] = {
          cityId: cid,
          taxIncome: 0,
          upkeepExpense: 0,
          wageExpense: 0,
          net: 0,
          buildingCount: 0,
        });
      citySnap.buildingCount += 1;

      const stats = getBuildingStatsAtLevel(def, b.level);
      const cov = DistrictServiceSystem.getBuildingCoverage(b, state);
      let bTax = 0;
      if (stats.taxPerMin > 0 && (def.category === 'residential' || b.status === 'active')) {
        let t = stats.taxPerMin * cov.taxBonusMult;
        if (def.category === 'residential') {
          const fillRatio = state.population.capacity > 0 ? Math.min(1, state.population.total / state.population.capacity) : 0;
          const nearScenic = scenicNodes.some((s) => Math.abs(s.gx - b.gx) <= 3 && Math.abs(s.gy - b.gy) <= 3);
          t *= fillRatio * state.taxRate * (hasShoppingBoost ? 1.2 : 1.0) * (nearScenic ? 1.2 : 1.0);
        } else if (def.category === 'commercial' || b.defId === 'festival_plaza') {
          const nearHome = homes.some((h) => Math.abs(h.gx - b.gx) <= 3 && Math.abs(h.gy - b.gy) <= 3);
          if (nearHome) t *= 1.2;
          if (def.category === 'commercial') t *= nightBazaarMult;
          if (b.defId === 'night_market' && isNightHours) t *= 2.0;
        }
        bTax = t * festivalTaxMult;
        taxPerMin += bTax;
        citySnap.taxIncome += bTax;
      }

      if (b.enabled && stats.upkeepPerMin > 0) {
        const relaxedFactor = state.settings.difficulty === 'relaxed' ? 0.75 : 1.0;
        const bUpkeep = stats.upkeepPerMin * relaxedFactor * fireDiscount;
        upkeepPerMin += bUpkeep;
        citySnap.upkeepExpense += bUpkeep;
      }

      if (b.assignedWorkers > 0) {
        const wageRate = def.workerClass === 'engineer' ? 1.2 : def.workerClass === 'artisan' ? 0.7 : 0.35;
        const bWages = b.assignedWorkers * wageRate;
        wagesPerMin += bWages;
        citySnap.wageExpense += bWages;
      }
    }

    // Active civic policies upkeep
    for (const pid of state.activePolicies ?? []) {
      const pDef = POLICY_MAP[pid];
      if (pDef) upkeepPerMin += pDef.upkeepPerMin;
    }

    for (const snap of Object.values(cityEcon)) {
      snap.taxIncome = Math.round(snap.taxIncome);
      snap.upkeepExpense = Math.round(snap.upkeepExpense);
      snap.wageExpense = Math.round(snap.wageExpense);
      snap.net = snap.taxIncome - snap.upkeepExpense - snap.wageExpense;
    }
    state.cityEconomy = cityEcon;

    // Execute net budget per tick (1/60 of per-minute flow)
    const taxTick = taxPerMin / 60;
    const expenseTick = (upkeepPerMin + wagesPerMin) / 60;
    const netTick = taxTick - expenseTick;

    if (netTick >= 0) {
      state.coins += netTick;
      state.stats.totalCoinsEarned += netTick;
    } else {
      state.coins = Math.max(0, state.coins + netTick);
    }

    // Immediate percentage-of-capacity Auto-Trade execution on every tick so surplus never sits
    let tradeEarned = 0;
    let exportEarnedFx = 0;
    let importSpentCoins = 0;
    const cap = this.getTradeCapacity(state);
    const hasCustoms = state.buildings.some((b) => b.status === 'active' && BUILDINGS[b.defId]?.isCustoms);
    const hasMinistryTrade = state.buildings.some(
      (b) => b.status === 'active' && (b.defId === 'ministry_trade' || b.defId === 'international_trade_bank')
    );
    const customsEfficiency = (hasCustoms ? 1.18 : 1.0) * (hasMinistryTrade ? 1.12 : 1.0);
    state.customsFeeRate = hasCustoms ? 0.04 : 0.08;

    if (cap > 0) {
      let tradeBudget = cap;
      for (const rule of Object.values(state.autoTradeRules)) {
        if (!rule || rule.mode === 'none' || tradeBudget <= 0) continue;
        const avail = Math.floor(state.resources[rule.resourceId] ?? 0);
        const targetUnits = this.getRuleKeepTarget(state, rule);
        if (rule.mode === 'sell_excess' && avail > targetUnits) {
          const batch = Math.min(tradeBudget, avail - targetUnits);
          if (batch > 0) {
            const res = this.sellResource(state, rule.resourceId, batch);
            if (res.ok) {
              tradeEarned += res.earned;
              tradeBudget -= batch;
            }
          }
        } else if (rule.mode === 'buy_below' && state.tick % 5 === 0 && avail < targetUnits) {
          const batch = Math.min(tradeBudget, targetUnits - avail);
          if (batch > 0) {
            const res = this.buyResource(state, rule.resourceId, batch);
            if (res.ok) tradeBudget -= batch;
          }
        }
      }
    }

    // Export Centers & Ports automatically export surplus high-value goods every 6 ticks for Foreign Currency
    const exporters = state.buildings.filter(
      (b) => b.status === 'active' && BUILDINGS[b.defId]?.exportsSurplus
    );
    if (exporters.length > 0 && state.tick % 6 === 0) {
      let exportUnitsLeft = Math.min(40, exporters.length * 6);
      for (const r of RESOURCE_LIST) {
        if (exportUnitsLeft <= 0) break;
        const scap = Math.max(1, state.capacities[r.id] ?? r.baseCap);
        const cur = Math.floor(state.resources[r.id] ?? 0);
        const keepThreshold = Math.max(25, Math.floor(scap * 0.55));
        if (cur > keepThreshold) {
          const qty = Math.min(exportUnitsLeft, cur - keepThreshold);
          const sellPrice = this.getSellPrice(state, r.id);
          const grossFx = Math.max(1, Math.round(qty * sellPrice * 0.35 * customsEfficiency));
          const grossCoins = Math.round(qty * sellPrice * 0.75 * customsEfficiency);
          state.resources[r.id] -= qty;
          state.foreignCurrency = (state.foreignCurrency ?? 0) + grossFx;
          state.coins += grossCoins;
          state.stats.totalCoinsEarned += grossCoins;
          state.stats.tradesCompleted += 1;
          exportEarnedFx += grossFx;
          tradeEarned += grossCoins;
          exportUnitsLeft -= qty;
        }
      }
    }

    // Import Distribution Centers automatically supply scarce inputs to stalled factories every 8 ticks
    const importers = state.buildings.filter(
      (b) => b.status === 'active' && BUILDINGS[b.defId]?.importsUnavailable
    );
    if (importers.length > 0 && state.tick % 8 === 0) {
      let importSlots = Math.min(20, importers.length * 4);
      for (const fb of state.buildings) {
        if (importSlots <= 0) break;
        if (fb.status !== 'no_inputs') continue;
        const fDef = BUILDINGS[fb.defId];
        if (!fDef?.recipe?.inputs) continue;
        for (const [k, rawNeed] of Object.entries(fDef.recipe.inputs)) {
          if (importSlots <= 0) break;
          const rid = k as ResourceId;
          const need = rawNeed ?? 0;
          const have = state.resources[rid] ?? 0;
          if (have < need) {
            const buyQty = Math.min(importSlots, Math.ceil(need - have));
            const feeMult = 1 + (state.customsFeeRate ?? 0.08);
            const totalCost = Math.round(buyQty * this.getBuyPrice(state, rid) * feeMult);
            if (state.coins >= totalCost + 25) {
              state.coins -= totalCost;
              ResourceSystem.addClamped(state, rid, buyQty);
              importSpentCoins += totalCost;
              importSlots -= buyQty;
              state.stats.tradesCompleted += 1;
            } else if ((state.foreignCurrency ?? 0) >= Math.ceil(totalCost * 0.5)) {
              state.foreignCurrency = (state.foreignCurrency ?? 0) - Math.ceil(totalCost * 0.5);
              ResourceSystem.addClamped(state, rid, buyQty);
              importSpentCoins += totalCost;
              importSlots -= buyQty;
              state.stats.tradesCompleted += 1;
            }
          }
        }
      }
    }

    state.tradeBalance = Math.round((state.tradeBalance ?? 0) * 0.85 + (exportEarnedFx * 2 + tradeEarned - importSpentCoins));

    // Update Corporate Sector competition & market share stats every 5 ticks
    if (state.tick % 5 === 0) {
      const corpMap = new Map<string, { sector: string; buildings: number; workers: number; profitPerMin: number }>();
      let totalProfit = 0;
      for (const b of state.buildings) {
        if (b.status === 'constructing') continue;
        const def = BUILDINGS[b.defId];
        if (!def?.corporateSector) continue;
        const entry = corpMap.get(def.corporateSector) ?? {
          sector: def.corporateSector,
          buildings: 0,
          workers: 0,
          profitPerMin: 0,
        };
        entry.buildings += 1;
        entry.workers += b.assignedWorkers;
        const mult = getBuildingLevelMultiplier(b.level, def);
        const profit = Math.round((def.taxPerMin ?? 20) * mult * (b.status === 'active' ? 1 : 0.3));
        entry.profitPerMin += profit;
        totalProfit += profit;
        corpMap.set(def.corporateSector, entry);
      }
      state.corporateStats = Array.from(corpMap.values())
        .map((e) => ({
          ...e,
          marketSharePct: totalProfit > 0 ? Math.round((e.profitPerMin / totalProfit) * 100) : 0,
        }))
        .sort((a, b) => b.profitPerMin - a.profitPerMin);
    }

    // Dynamic international market price fluctuations & mean reversion every 15 ticks
    if (state.tick % 15 === 0) {
      state.marketPrevPrices ??= {};
      for (let i = 0; i < RESOURCE_LIST.length; i++) {
        const r = RESOURCE_LIST[i];
        const cur = state.marketPrices[r.id] ?? r.basePrice;
        state.marketPrevPrices[r.id] = cur;
        const wave = Math.sin(state.tick * 0.09 + i * 1.37 + state.worldSeed * 0.01) * 0.045;
        const reverted = cur + (r.basePrice - cur) * 0.08 + r.basePrice * wave;
        state.marketPrices[r.id] = Number(Math.max(r.basePrice * 0.6, Math.min(r.basePrice * 1.65, reverted)).toFixed(2));
      }
    }

    // Record financial snapshot every 10 ticks (rolling 24 entries)
    if (state.tick % 10 === 0) {
      state.ledger.push({
        tick: state.tick,
        taxIncome: Math.round(taxPerMin),
        tradeIncome: Math.round(tradeEarned * 2 + exportEarnedFx),
        upkeepExpense: Math.round(upkeepPerMin),
        wageExpense: Math.round(wagesPerMin),
        net: Math.round(taxPerMin - upkeepPerMin - wagesPerMin),
      });
      if (state.ledger.length > 24) state.ledger.shift();
    }

    // Keep live GDP and inflation synchronized with active production & prices
    FinanceSystem.refreshMacroMetrics(state);
  }
}
