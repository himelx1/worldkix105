import { BUILDINGS } from '../data/buildings.data';
import { RESOURCE_LIST, RESOURCES, ResourceId } from '../data/resources.data';
import type {
  CurrencyCode,
  CurrencyConversionPreview,
  EconomyMacroState,
  FinancialTransaction,
  FinancialTransactionType,
  GdpBreakdown,
  WorldEngineState,
} from '../core/GameState';
import { EnvironmentSystem } from './EnvironmentSystem';

export interface FinancialSnapshot {
  localCoins: number;
  foreignCurrency: number;
  fxRate: number;
  gdpCurrent: number;
  gdpPrevious: number;
  gdpGrowthPct: number;
  gdpBreakdown: GdpBreakdown;
  inflationRate: number;
  inflationDrivers: string[];
  tradeBalance: number;
  lastUpdatedMonthKey: string;
}

/**
 * Shared financial interface (Part 2) designed so Part 3 Trade House & ICF
 * integrate directly without duplicating currency or accounting state.
 */
export interface NationalFinanceService {
  getFinancialSnapshot(state: WorldEngineState): FinancialSnapshot;
  previewCurrencyConversion(
    state: WorldEngineState,
    direction: 'local_to_fx' | 'fx_to_local',
    amount: number
  ): CurrencyConversionPreview;
  convertCurrency(
    state: WorldEngineState,
    direction: 'local_to_fx' | 'fx_to_local',
    amount: number
  ): { ok: boolean; reason?: string; spent: number; received: number };
  recordTradeSettlement(
    state: WorldEngineState,
    currency: CurrencyCode,
    netDelta: number,
    summary: string
  ): void;
  recordExternalCapitalFlow(
    state: WorldEngineState,
    currency: CurrencyCode,
    netDelta: number,
    summary: string
  ): void;
  onCalendarMonthChanged(state: WorldEngineState): boolean;
}

const MIN_FX_RATE = 2.0;
const MAX_FX_RATE = 50.0;
const DEFAULT_FX_RATE = 10.0;
const MAX_TRANSACTIONS = 120;
const MAX_FX_HISTORY = 36;

export class FinanceSystem {
  public static createInitialEconomyState(initialCoins = 680, initialFx = 0): EconomyMacroState {
    const fxRate = DEFAULT_FX_RATE;
    const baseline = Math.max(500, Math.round(initialCoins + initialFx * fxRate));
    return {
      fxRate,
      fxHistory: [
        {
          monthKey: 'Y1-M01',
          year: 1,
          month: 1,
          rate: fxRate,
          deltaPct: 0,
          gdpAtClose: 0,
          inflationAtClose: 0,
          tradeBalanceAtClose: 0,
          factors: ['Initial central bank exchange peg (10.00 Local = 1.00 FX)'],
        },
      ],
      gdpCurrent: 0,
      gdpPrevious: 0,
      gdpGrowthPct: 0,
      gdpBreakdown: {
        productionValue: 0,
        commercialValue: 0,
        servicesValue: 0,
        netExportsValue: 0,
      },
      inflationRate: 0,
      inflationDrivers: ['Price stability: balanced supply and money growth'],
      moneySupplyBaseline: baseline,
      transactions: [],
      lastUpdatedMonthKey: 'Y1-M01',
    };
  }

  public static ensureEconomyState(state: WorldEngineState): EconomyMacroState {
    if (!state.economy) {
      state.economy = this.createInitialEconomyState(state.coins, state.foreignCurrency ?? 0);
    }
    state.economy.fxRate = this.clampFxRate(state.economy.fxRate || DEFAULT_FX_RATE);
    state.economy.fxHistory ??= [];
    state.economy.transactions ??= [];
    state.economy.inflationDrivers ??= [];
    state.economy.gdpBreakdown ??= {
      productionValue: 0,
      commercialValue: 0,
      servicesValue: 0,
      netExportsValue: 0,
    };
    return state.economy;
  }

  private static clampFxRate(rate: number): number {
    if (!Number.isFinite(rate) || rate <= 0) return DEFAULT_FX_RATE;
    return Number(Math.max(MIN_FX_RATE, Math.min(MAX_FX_RATE, rate)).toFixed(2));
  }

  private static roundFxAmount(val: number): number {
    return Number((Math.floor(val * 100 + 1e-9) / 100).toFixed(2));
  }

  public static recordTransaction(
    state: WorldEngineState,
    entry: Omit<FinancialTransaction, 'id' | 'tick' | 'monthKey' | 'localBalanceAfter' | 'fxBalanceAfter'>
  ): FinancialTransaction {
    const econ = this.ensureEconomyState(state);
    const cal = state.calendar ?? { year: state.year || 1, month: 1, weekOfMonth: 1, dayOfWeek: 1, totalDaysElapsed: 0 };
    const monthKey = EnvironmentSystem.getCalendarMonthKey(cal);
    const nextSeq = (econ.transactions[econ.transactions.length - 1]?.id ?? 0) + 1;
    const tx: FinancialTransaction = {
      id: nextSeq,
      tick: state.tick,
      monthKey,
      ...entry,
      localBalanceAfter: Number(state.coins.toFixed(2)),
      fxBalanceAfter: Number((state.foreignCurrency ?? 0).toFixed(2)),
    };
    econ.transactions.push(tx);
    if (econ.transactions.length > MAX_TRANSACTIONS) {
      econ.transactions.splice(0, econ.transactions.length - MAX_TRANSACTIONS);
    }
    return tx;
  }

  public static previewCurrencyConversion(
    state: WorldEngineState,
    direction: 'local_to_fx' | 'fx_to_local',
    rawAmount: number
  ): CurrencyConversionPreview {
    const econ = this.ensureEconomyState(state);
    const fxRate = econ.fxRate;

    if (!Number.isFinite(rawAmount) || rawAmount <= 0) {
      return {
        valid: false,
        direction,
        inputAmount: 0,
        outputAmount: 0,
        fxRate,
        reason: 'Enter a positive amount to convert',
      };
    }

    if (direction === 'local_to_fx') {
      const localIn = Math.floor(rawAmount);
      if (localIn <= 0) {
        return {
          valid: false,
          direction,
          inputAmount: 0,
          outputAmount: 0,
          fxRate,
          reason: 'Minimum Local conversion is 1 Coin',
        };
      }
      if (state.coins + 1e-6 < localIn) {
        return {
          valid: false,
          direction,
          inputAmount: localIn,
          outputAmount: 0,
          fxRate,
          reason: `Insufficient Local Coins (have ${Math.floor(state.coins).toLocaleString()})`,
        };
      }
      // Floor FX output to 2 decimal places so round-trip conversions never produce rounding profit.
      const fxOut = this.roundFxAmount(localIn / fxRate);
      if (fxOut <= 0) {
        return {
          valid: false,
          direction,
          inputAmount: localIn,
          outputAmount: 0,
          fxRate,
          reason: `Amount too small at rate ${fxRate.toFixed(2)} Local / 1 FX`,
        };
      }
      return {
        valid: true,
        direction,
        inputAmount: localIn,
        outputAmount: fxOut,
        fxRate,
      };
    }

    const fxIn = this.roundFxAmount(rawAmount);
    if (fxIn <= 0) {
      return {
        valid: false,
        direction,
        inputAmount: 0,
        outputAmount: 0,
        fxRate,
        reason: 'Minimum FX conversion is 0.01 FX',
      };
    }
    const haveFx = Number((state.foreignCurrency ?? 0).toFixed(2));
    if (haveFx + 1e-6 < fxIn) {
      return {
        valid: false,
        direction,
        inputAmount: fxIn,
        outputAmount: 0,
        fxRate,
        reason: `Insufficient Foreign Reserve (have ${haveFx.toFixed(2)} FX)`,
      };
    }
    // Floor Local output to whole Coin so FX -> Local -> FX can never yield extra FX.
    const localOut = Math.floor(fxIn * fxRate + 1e-9);
    if (localOut <= 0) {
      return {
        valid: false,
        direction,
        inputAmount: fxIn,
        outputAmount: 0,
        fxRate,
        reason: `Amount too small at rate ${fxRate.toFixed(2)} Local / 1 FX`,
      };
    }
    return {
      valid: true,
      direction,
      inputAmount: fxIn,
      outputAmount: localOut,
      fxRate,
    };
  }

  public static convertCurrency(
    state: WorldEngineState,
    direction: 'local_to_fx' | 'fx_to_local',
    rawAmount: number
  ): { ok: boolean; reason?: string; spent: number; received: number } {
    const preview = this.previewCurrencyConversion(state, direction, rawAmount);
    if (!preview.valid) {
      return { ok: false, reason: preview.reason, spent: 0, received: 0 };
    }

    if (direction === 'local_to_fx') {
      state.coins = Math.max(0, state.coins - preview.inputAmount);
      state.foreignCurrency = Number(((state.foreignCurrency ?? 0) + preview.outputAmount).toFixed(2));
      this.recordTransaction(state, {
        type: 'fx_convert',
        currency: 'LOCAL',
        amount: -preview.inputAmount,
        counterCurrency: 'FX',
        counterAmount: preview.outputAmount,
        fxRateUsed: preview.fxRate,
        summary: `Converted ${preview.inputAmount.toLocaleString()} Local -> ${preview.outputAmount.toFixed(2)} FX @ ${preview.fxRate.toFixed(2)}`,
      });
      return { ok: true, spent: preview.inputAmount, received: preview.outputAmount };
    }

    state.foreignCurrency = Math.max(0, Number(((state.foreignCurrency ?? 0) - preview.inputAmount).toFixed(2)));
    state.coins += preview.outputAmount;
    this.recordTransaction(state, {
      type: 'fx_convert',
      currency: 'FX',
      amount: -preview.inputAmount,
      counterCurrency: 'LOCAL',
      counterAmount: preview.outputAmount,
      fxRateUsed: preview.fxRate,
      summary: `Converted ${preview.inputAmount.toFixed(2)} FX -> ${preview.outputAmount.toLocaleString()} Local @ ${preview.fxRate.toFixed(2)}`,
    });
    return { ok: true, spent: preview.inputAmount, received: preview.outputAmount };
  }

  public static computeGDP(state: WorldEngineState): {
    gdpCurrent: number;
    gdpGrowthPct: number;
    breakdown: GdpBreakdown;
  } {
    const econ = this.ensureEconomyState(state);
    let productionValue = 0;
    let commercialValue = 0;
    let servicesValue = 0;

    for (let i = 0; i < state.buildings.length; i++) {
      const b = state.buildings[i];
      if (b.status !== 'active' || !b.enabled) continue;
      const def = BUILDINGS[b.defId];
      if (!def) continue;

      const levelFactor = 1 + Math.max(0, b.level - 1) * 0.2;

      if (def.isAutomatedTreePlantation) {
        const rate = b.actualHourlyRate ?? 0;
        const unitPrice = state.marketPrices.wood ?? RESOURCES.wood.basePrice;
        productionValue += rate * unitPrice * 0.45;
      } else if (def.recipe && (b.actualHourlyRate ?? 0) > 0) {
        let outUnits = 0;
        let outWeightedVal = 0;
        for (const [rid, qty] of Object.entries(def.recipe.outputs)) {
          if (!qty) continue;
          const p = state.marketPrices[rid as ResourceId] ?? RESOURCES[rid as ResourceId]?.basePrice ?? 5;
          outUnits += qty;
          outWeightedVal += qty * p;
        }
        const avgOutPrice = outUnits > 0 ? outWeightedVal / outUnits : 5;
        productionValue += (b.actualHourlyRate ?? 0) * avgOutPrice * 0.45;
      } else if (def.powerOutput && def.powerOutput > 0) {
        const pSat = (state.powerDemand ?? 0) > 0 ? Math.min(1, (state.powerDelivered ?? 0) / Math.max(1, state.powerDemand)) : 0.25;
        servicesValue += def.powerOutput * levelFactor * pSat * 1.4;
      } else if (def.waterOutput && def.waterOutput > 0) {
        const wSat = (state.waterDemand ?? 0) > 0 ? Math.min(1, (state.waterDelivered ?? 0) / Math.max(1, state.waterDemand)) : 0.25;
        servicesValue += def.waterOutput * levelFactor * wSat * 1.1;
      }

      if (def.category === 'commercial' || def.subCategory === 'trade_port') {
        commercialValue += ((def.taxPerMin ?? 16) * levelFactor + b.assignedWorkers * 8) * 1.25;
      } else if (
        def.category === 'educational' ||
        def.category === 'healthcare' ||
        def.category === 'government' ||
        def.category === 'transportation' ||
        def.category === 'recreational'
      ) {
        servicesValue += Math.max(12, b.assignedWorkers * 7.5 * levelFactor);
      } else if (def.category === 'residential' && (state.population.total ?? 0) > 0) {
        const occRatio =
          state.population.capacity > 0
            ? Math.min(1, state.population.total / state.population.capacity)
            : 0;
        commercialValue += (def.taxPerMin ?? 6) * levelFactor * occRatio * 0.7;
      }
    }

    // Export surplus contributes positively, import deficit reduces slightly (clamped so GDP stays >= 0)
    const netExportsValue = Math.round((state.tradeBalance ?? 0) * 0.4);

    const breakdown: GdpBreakdown = {
      productionValue: Math.round(productionValue),
      commercialValue: Math.round(commercialValue),
      servicesValue: Math.round(servicesValue),
      netExportsValue,
    };

    const gdpCurrent = Math.max(
      0,
      Math.round(
        breakdown.productionValue +
          breakdown.commercialValue +
          breakdown.servicesValue +
          breakdown.netExportsValue
      )
    );

    const gdpPrevious = Math.max(0, econ.gdpPrevious ?? 0);
    // Avoid fake infinite spikes or division by zero when previous GDP is 0
    const gdpGrowthPct =
      gdpPrevious > 0
        ? Number((((gdpCurrent - gdpPrevious) / gdpPrevious) * 100).toFixed(2))
        : 0;

    return { gdpCurrent, gdpGrowthPct, breakdown };
  }

  public static computeInflation(state: WorldEngineState, gdpCurrent: number): {
    inflationRate: number;
    inflationDrivers: string[];
  } {
    const econ = this.ensureEconomyState(state);
    const drivers: string[] = [];

    // 1. Market price drift relative to base prices
    let ratioSum = 0;
    let ratioCount = 0;
    for (let i = 0; i < RESOURCE_LIST.length; i++) {
      const r = RESOURCE_LIST[i];
      const cur = state.marketPrices[r.id] ?? r.basePrice;
      ratioSum += cur / Math.max(1, r.basePrice);
      ratioCount += 1;
    }
    const avgPriceRatio = ratioCount > 0 ? ratioSum / ratioCount : 1;
    const marketInflation = (avgPriceRatio - 1) * 18;
    if (marketInflation >= 0.4) {
      drivers.push(`Rising market commodity prices (+${marketInflation.toFixed(1)}%)`);
    } else if (marketInflation <= -0.4) {
      drivers.push(`Lower commodity market prices (${marketInflation.toFixed(1)}%)`);
    }

    // 2. Monetary expansion vs real output
    const totalMoneySupply = state.coins + (state.foreignCurrency ?? 0) * econ.fxRate;
    const baseline = Math.max(500, econ.moneySupplyBaseline || 500);
    const supplyExcessRatio = (totalMoneySupply - baseline) / baseline;
    const outputBackstop = Math.max(1, gdpCurrent / 400);
    const monetaryInflation = Math.max(-2.0, Math.min(8.0, (supplyExcessRatio * 4.5) / outputBackstop));
    if (monetaryInflation >= 0.4) {
      drivers.push(`Money supply growth outpacing output (+${monetaryInflation.toFixed(1)}%)`);
    } else if (monetaryInflation <= -0.4) {
      drivers.push(`Tight money liquidity (${monetaryInflation.toFixed(1)}%)`);
    }

    // 3. Utility & production bottleneck scarcity
    const pDem = state.powerDemand ?? 0;
    const pDel = state.powerDelivered ?? 0;
    const wDem = state.waterDemand ?? 0;
    const wDel = state.waterDelivered ?? 0;
    const pShort = pDem > 0 ? Math.max(0, 1 - pDel / pDem) : 0;
    const wShort = wDem > 0 ? Math.max(0, 1 - wDel / wDem) : 0;
    const scarcityInflation = (pShort * 3.0 + wShort * 2.5);
    if (scarcityInflation >= 0.35) {
      drivers.push(`Utility shortage cost-push (+${scarcityInflation.toFixed(1)}%)`);
    }

    // 4. Tax / wage cost pressure
    const taxPressure = state.taxRate > 1.05 ? (state.taxRate - 1.05) * 2.5 : state.taxRate < 0.7 ? -0.3 : 0;
    if (taxPressure >= 0.35) {
      drivers.push(`Elevated tax cost pass-through (+${taxPressure.toFixed(1)}%)`);
    }

    const rawInflation = marketInflation + monetaryInflation + scarcityInflation + taxPressure;
    const inflationRate = Number(Math.max(-5.0, Math.min(25.0, rawInflation)).toFixed(1));

    if (drivers.length === 0) {
      drivers.push('Price stability: balanced supply and money growth');
    }

    return { inflationRate, inflationDrivers: drivers };
  }

  public static refreshMacroMetrics(state: WorldEngineState): void {
    const econ = this.ensureEconomyState(state);
    const { gdpCurrent, gdpGrowthPct, breakdown } = this.computeGDP(state);
    const { inflationRate, inflationDrivers } = this.computeInflation(state, gdpCurrent);

    econ.gdpCurrent = gdpCurrent;
    econ.gdpGrowthPct = gdpGrowthPct;
    econ.gdpBreakdown = breakdown;
    econ.inflationRate = inflationRate;
    econ.inflationDrivers = inflationDrivers;
  }

  /**
   * Monthly FX update & GDP closing hook. Guarded by monthKey so it runs strictly once per calendar month.
   */
  public static onCalendarMonthChanged(state: WorldEngineState): boolean {
    const econ = this.ensureEconomyState(state);
    const cal = state.calendar ?? { year: state.year || 1, month: 1, weekOfMonth: 1, dayOfWeek: 1, totalDaysElapsed: 0 };
    const monthKey = EnvironmentSystem.getCalendarMonthKey(cal);

    if (econ.lastUpdatedMonthKey === monthKey) {
      return false;
    }

    // Close previous month's GDP snapshot, then evaluate current month's metrics
    econ.gdpPrevious = econ.gdpCurrent;
    const { gdpCurrent, gdpGrowthPct, breakdown } = this.computeGDP(state);
    const { inflationRate, inflationDrivers } = this.computeInflation(state, gdpCurrent);

    econ.gdpCurrent = gdpCurrent;
    econ.gdpGrowthPct = gdpGrowthPct;
    econ.gdpBreakdown = breakdown;
    econ.inflationRate = inflationRate;
    econ.inflationDrivers = inflationDrivers;

    // Causal monthly FX adjustment (Local per 1 FX):
    // Positive GDP growth, trade surplus, low inflation strengthen Local (decrease FX rate).
    // High inflation, trade deficit, or economic contraction weaken Local (increase FX rate).
    const factors: string[] = [];
    let fxDeltaPct = 0;

    if (gdpGrowthPct > 1) {
      const shift = -Math.min(0.025, gdpGrowthPct * 0.0012);
      fxDeltaPct += shift;
      factors.push(`GDP expansion (+${gdpGrowthPct.toFixed(1)}%) strengthened Local`);
    } else if (gdpGrowthPct < -1) {
      const shift = Math.min(0.025, Math.abs(gdpGrowthPct) * 0.0012);
      fxDeltaPct += shift;
      factors.push(`GDP contraction (${gdpGrowthPct.toFixed(1)}%) weakened Local`);
    }

    const tb = state.tradeBalance ?? 0;
    if (tb > 50) {
      const shift = -Math.min(0.022, tb / 25000);
      fxDeltaPct += shift;
      factors.push(`Trade surplus (+${tb.toLocaleString()}) lifted Local demand`);
    } else if (tb < -50) {
      const shift = Math.min(0.022, Math.abs(tb) / 25000);
      fxDeltaPct += shift;
      factors.push(`Trade deficit (${tb.toLocaleString()}) pressured Local`);
    }

    if (inflationRate > 2.5) {
      const shift = Math.min(0.03, (inflationRate - 2.0) * 0.0025);
      fxDeltaPct += shift;
      factors.push(`Inflation (${inflationRate.toFixed(1)}%) eroded Local purchasing power`);
    } else if (inflationRate < -0.5) {
      fxDeltaPct -= 0.005;
      factors.push(`Low inflation (${inflationRate.toFixed(1)}%) supported Local stability`);
    }

    const pDem = state.powerDemand ?? 0;
    const pDel = state.powerDelivered ?? 0;
    const wDem = state.waterDemand ?? 0;
    const wDel = state.waterDelivered ?? 0;
    if ((pDem > 0 && pDel / pDem < 0.75) || (wDem > 0 && wDel / wDem < 0.75)) {
      fxDeltaPct += 0.008;
      factors.push('Infrastructure utility bottlenecks weighed on output');
    } else if (gdpCurrent > 0 && pDem > 0 && pDel >= pDem && (wDem === 0 || wDel >= wDem)) {
      fxDeltaPct -= 0.004;
      factors.push('Full utility reliability backed industrial stability');
    }

    if (factors.length === 0) {
      factors.push('Macro indicators neutral — steady exchange rate');
    }

    // Clamp single-month FX move to +-6%
    fxDeltaPct = Math.max(-0.06, Math.min(0.06, fxDeltaPct));
    const prevFx = econ.fxRate;
    const nextFx = this.clampFxRate(prevFx * (1 + fxDeltaPct));
    const actualDeltaPct = prevFx > 0 ? Number((((nextFx - prevFx) / prevFx) * 100).toFixed(2)) : 0;

    econ.fxRate = nextFx;
    econ.lastUpdatedMonthKey = monthKey;

    econ.fxHistory.push({
      monthKey,
      year: cal.year,
      month: cal.month,
      rate: nextFx,
      deltaPct: actualDeltaPct,
      gdpAtClose: gdpCurrent,
      inflationAtClose: inflationRate,
      tradeBalanceAtClose: tb,
      factors,
    });
    if (econ.fxHistory.length > MAX_FX_HISTORY) {
      econ.fxHistory.splice(0, econ.fxHistory.length - MAX_FX_HISTORY);
    }

    // Gradually adapt money supply baseline as the real economy grows
    const curLiquidity = state.coins + (state.foreignCurrency ?? 0) * nextFx;
    econ.moneySupplyBaseline = Math.max(500, Math.round(econ.moneySupplyBaseline * 0.8 + curLiquidity * 0.2));

    return true;
  }

  public static recordTradeSettlement(
    state: WorldEngineState,
    currency: CurrencyCode,
    netDelta: number,
    summary: string,
    txType: FinancialTransactionType = netDelta >= 0 ? 'trade_export' : 'trade_import'
  ): void {
    if (currency === 'LOCAL') {
      if (netDelta >= 0) {
        state.coins += netDelta;
        state.stats.totalCoinsEarned += netDelta;
      } else {
        state.coins = Math.max(0, state.coins + netDelta);
      }
    } else {
      state.foreignCurrency = Math.max(0, Number(((state.foreignCurrency ?? 0) + netDelta).toFixed(2)));
    }
    this.recordTransaction(state, {
      type: txType,
      currency,
      amount: Number(netDelta.toFixed(2)),
      fxRateUsed: this.ensureEconomyState(state).fxRate,
      summary,
    });
  }

  public static recordExternalCapitalFlow(
    state: WorldEngineState,
    currency: CurrencyCode,
    netDelta: number,
    summary: string
  ): void {
    this.recordTradeSettlement(state, currency, netDelta, summary, 'external_flow');
  }

  public static getFinancialSnapshot(state: WorldEngineState): FinancialSnapshot {
    const econ = this.ensureEconomyState(state);
    return {
      localCoins: Number(state.coins.toFixed(2)),
      foreignCurrency: Number((state.foreignCurrency ?? 0).toFixed(2)),
      fxRate: econ.fxRate,
      gdpCurrent: econ.gdpCurrent,
      gdpPrevious: econ.gdpPrevious,
      gdpGrowthPct: econ.gdpGrowthPct,
      gdpBreakdown: econ.gdpBreakdown,
      inflationRate: econ.inflationRate,
      inflationDrivers: econ.inflationDrivers,
      tradeBalance: state.tradeBalance ?? 0,
      lastUpdatedMonthKey: econ.lastUpdatedMonthKey,
    };
  }
}

export const SharedFinanceService: NationalFinanceService = {
  getFinancialSnapshot: (state) => FinanceSystem.getFinancialSnapshot(state),
  previewCurrencyConversion: (state, direction, amount) =>
    FinanceSystem.previewCurrencyConversion(state, direction, amount),
  convertCurrency: (state, direction, amount) =>
    FinanceSystem.convertCurrency(state, direction, amount),
  recordTradeSettlement: (state, currency, netDelta, summary) =>
    FinanceSystem.recordTradeSettlement(state, currency, netDelta, summary),
  recordExternalCapitalFlow: (state, currency, netDelta, summary) =>
    FinanceSystem.recordExternalCapitalFlow(state, currency, netDelta, summary),
  onCalendarMonthChanged: (state) => FinanceSystem.onCalendarMonthChanged(state),
};
