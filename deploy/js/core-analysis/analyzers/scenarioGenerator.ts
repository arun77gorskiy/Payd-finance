/**
 * scenarioGenerator.ts — Module X / Engine #4
 *
 * Назначение: автоматическая генерация торговых сценариев на основе результатов
 *              всех анализаторов Module X.
 *
 * Зависимости: confluenceEngine, probabilityEngine, все анализаторы.
 * Используется: executionPlanBuilder, invalidationBuilder.
 *
 * Публичный API:
 *   - generateScenarios(inputs: ScenarioInputs): Scenario[]
 *
 * Поддерживаемые сценарии (19):
 *   Long, Short, Wait, No Trade,
 *   Pullback Entry, Breakout Entry,
 *   BOS Continuation, CHoCH Reversal,
 *   Order Block Entry, FVG Retest, Liquidity Sweep Entry,
 *   Pin Bar Entry, Engulfing Entry,
 *   Conservative Long, Aggressive Long,
 *   Conservative Short, Aggressive Short,
 *   Scale In, Partial Position.
 */

interface SGCandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

interface SGInputs {
    candles?: SGCandle[];
    marketStructure?: { type: string; structureShift?: any };
    trend?: { primaryTrend: string; strength: number; adx?: number };
    smartMoney?: {
        bos: any[]; choch: any[]; mss: any[];
        orderBlocks: any[]; fairValueGaps: any[];
        liquiditySweeps: any[]; internalTrend?: string;
        equalHighs?: any[]; equalLows?: any[];
    };
    momentum?: { rsi: number; macdHistogram: number; roc: number };
    priceAction?: { bullishPatterns: any[]; bearishPatterns: any[]; totalPatterns: number };
    volume?: { bias: string; regime: string; buyingPressure: number; sellingPressure: number; volumeSpike?: boolean; divergences?: any[] };
    liquidity?: { bias: string; stopHunts: any[]; liquidityGrabs: any[]; liquidityVoids: any[] };
    volatility?: { regime: string; bias: string; inSqueeze?: boolean; squeezeStrength?: number };
    supportResistance?: { pricePosition: string; nearestSupport?: any; nearestResistance?: any };
    probabilities?: { bullish: number; bearish: number; neutral: number; confidence: number; expected: string };
    confluence?: any;
}

interface SGScenario {
    id: string;
    name: string;
    description: string;
    direction: 'long' | 'short' | 'neutral';
    category: string;
    riskLevel: 'low' | 'medium' | 'high';
    probability: number;            // 0..100
    confidence: number;             // 0..1
    entryZone?: { low: number; high: number } | null;
    stopLoss?: number | null;
    takeProfit?: number | null;
    riskRewardRatio?: number | null;
    reasons: string[];
    requiredConfirmations: string[];
    invalidationConditions: string[];
    priority: number;
    applicable: boolean;
}

(function (global: any) {
    'use strict';

    // ============================================================
    // ХЕЛПЕР: текущая цена
    // ============================================================
    function getCurrentPrice(candles: SGCandle[] | undefined): number {
        if (!candles || candles.length === 0) return 0;
        return candles[candles.length - 1].close;
    }

    // ============================================================
    // 1. NO TRADE — когда условий нет
    // ============================================================
    function scenarioNoTrade(inputs: SGInputs): SGScenario {
        return {
            id: 'no_trade',
            name: 'No Trade',
            description: 'Условия для входа не выполнены',
            direction: 'neutral',
            category: 'no_trade',
            riskLevel: 'low',
            probability: 0,
            confidence: 0,
            entryZone: null,
            stopLoss: null,
            takeProfit: null,
            riskRewardRatio: null,
            reasons: ['Недостаточно подтверждений', 'Низкая согласованность сигналов'],
            requiredConfirmations: ['Тренд', 'Структура', 'Минимум 3 направленных сигнала'],
            invalidationConditions: ['Всегда применимо — отсутствие сигналов'],
            priority: 0,
            applicable: true
        };
    }

    // ============================================================
    // 2. WAIT — ожидание подтверждения
    // ============================================================
    function scenarioWait(inputs: SGInputs): SGScenario {
        const prob = inputs.probabilities;
        const cur = getCurrentPrice(inputs.candles);
        return {
            id: 'wait',
            name: 'Wait',
            description: 'Ждать подтверждения — рынок в переходном состоянии',
            direction: 'neutral',
            category: 'wait',
            riskLevel: 'low',
            probability: prob?.neutral || 33,
            confidence: 0.4,
            entryZone: null,
            stopLoss: null,
            takeProfit: null,
            riskRewardRatio: null,
            reasons: [
                'Конфликтующие сигналы',
                'Структура неопределена',
                `Confluence score: ${inputs.confluence?.confluenceScore?.toFixed(0) || 0}/100`
            ],
            requiredConfirmations: ['BOS / CHoCH', 'PA подтверждение', 'Объём'],
            invalidationConditions: ['Любое направленное подтверждение'],
            priority: 5,
            applicable: !inputs.marketStructure || inputs.marketStructure.type === 'range'
        };
    }

    // ============================================================
    // 3. LONG
    // ============================================================
    function scenarioLong(inputs: SGInputs): SGScenario {
        const ms = inputs.marketStructure;
        const tr = inputs.trend;
        const sr = inputs.supportResistance;
        const sm = inputs.smartMoney;
        const pa = inputs.priceAction;
        const prob = inputs.probabilities;
        const cur = getCurrentPrice(inputs.candles);

        const bullishStructure = ms?.type === 'uptrend' || sm?.internalTrend === 'bullish';
        const bullishTrend = tr?.primaryTrend === 'strong_bull' || tr?.primaryTrend === 'bull';
        const srSupport = sr?.pricePosition === 'in_demand' || sr?.pricePosition === 'at_level';
        const bullishPA = (pa?.bullishPatterns?.length || 0) > 0;

        const reasons: string[] = [];
        if (bullishStructure) reasons.push('Структура бычья');
        if (bullishTrend) reasons.push(`Тренд: ${tr?.primaryTrend}`);
        if (srSupport && sr?.nearestSupport) reasons.push(`У поддержки ${sr.nearestSupport.price.toFixed(2)}`);
        if (bullishPA) reasons.push(`PA: ${pa?.bullishPatterns?.length || 0} бычьих паттернов`);
        if (sm?.bos?.some((b: any) => b.type === 'bullish')) reasons.push('BOS bullish');

        const confirmationsNeeded: string[] = ['BOS', 'PA', 'Volume', 'Liquidity'];
        const applicable = bullishStructure && bullishTrend && bullishPA;

        const entryLow = sr?.nearestSupport?.price || cur * 0.99;
        const entryHigh = cur * 1.005;
        const stopLoss = entryLow * 0.985;
        const takeProfit = cur * 1.03;
        const rr = takeProfit && stopLoss ? Math.abs((takeProfit - cur) / (cur - stopLoss)) : null;

        return {
            id: 'long',
            name: 'Long',
            description: 'Вход в длинную позицию с подтверждением восходящего движения',
            direction: 'long',
            category: 'directional',
            riskLevel: applicable ? 'medium' : 'high',
            probability: prob?.bullish || 50,
            confidence: applicable ? 0.7 : 0.4,
            entryZone: applicable ? { low: entryLow, high: entryHigh } : null,
            stopLoss,
            takeProfit,
            riskRewardRatio: rr,
            reasons,
            requiredConfirmations: confirmationsNeeded,
            invalidationConditions: ['CHoCH bearish', 'Пробой поддержки', 'BOS вниз'],
            priority: applicable ? 70 : 30,
            applicable
        };
    }

    // ============================================================
    // 4. SHORT
    // ============================================================
    function scenarioShort(inputs: SGInputs): SGScenario {
        const ms = inputs.marketStructure;
        const tr = inputs.trend;
        const sr = inputs.supportResistance;
        const sm = inputs.smartMoney;
        const pa = inputs.priceAction;
        const prob = inputs.probabilities;
        const cur = getCurrentPrice(inputs.candles);

        const bearishStructure = ms?.type === 'downtrend' || sm?.internalTrend === 'bearish';
        const bearishTrend = tr?.primaryTrend === 'strong_bear' || tr?.primaryTrend === 'bear';
        const srResistance = sr?.pricePosition === 'in_supply' || sr?.pricePosition === 'at_level';
        const bearishPA = (pa?.bearishPatterns?.length || 0) > 0;

        const reasons: string[] = [];
        if (bearishStructure) reasons.push('Структура медвежья');
        if (bearishTrend) reasons.push(`Тренд: ${tr?.primaryTrend}`);
        if (srResistance && sr?.nearestResistance) reasons.push(`У сопротивления ${sr.nearestResistance.price.toFixed(2)}`);
        if (bearishPA) reasons.push(`PA: ${pa?.bearishPatterns?.length || 0} медвежьих паттернов`);
        if (sm?.bos?.some((b: any) => b.type === 'bearish')) reasons.push('BOS bearish');

        const applicable = bearishStructure && bearishTrend && bearishPA;
        const entryHigh = sr?.nearestResistance?.price || cur * 1.01;
        const entryLow = cur * 0.995;
        const stopLoss = entryHigh * 1.015;
        const takeProfit = cur * 0.97;
        const rr = takeProfit && stopLoss ? Math.abs((cur - takeProfit) / (stopLoss - cur)) : null;

        return {
            id: 'short',
            name: 'Short',
            description: 'Вход в короткую позицию с подтверждением нисходящего движения',
            direction: 'short',
            category: 'directional',
            riskLevel: applicable ? 'medium' : 'high',
            probability: prob?.bearish || 50,
            confidence: applicable ? 0.7 : 0.4,
            entryZone: applicable ? { low: entryLow, high: entryHigh } : null,
            stopLoss,
            takeProfit,
            riskRewardRatio: rr,
            reasons,
            requiredConfirmations: ['BOS', 'PA', 'Volume', 'Liquidity'],
            invalidationConditions: ['CHoCH bullish', 'Пробой сопротивления', 'BOS вверх'],
            priority: applicable ? 70 : 30,
            applicable
        };
    }

    // ============================================================
    // 5. PULLBACK ENTRY
    // ============================================================
    function scenarioPullbackEntry(inputs: SGInputs): SGScenario {
        const tr = inputs.trend;
        const sr = inputs.supportResistance;
        const cur = getCurrentPrice(inputs.candles);
        const applicable = (tr?.primaryTrend === 'bull' || tr?.primaryTrend === 'strong_bull') && sr?.nearestSupport;
        const entry = sr?.nearestSupport?.price || cur * 0.985;

        return {
            id: 'pullback_entry',
            name: 'Pullback Entry',
            description: 'Вход на откате к поддержке в восходящем тренде',
            direction: 'long',
            category: 'entry_pattern',
            riskLevel: 'medium',
            probability: applicable ? 65 : 30,
            confidence: applicable ? 0.6 : 0.3,
            entryZone: applicable ? { low: entry * 0.998, high: entry * 1.005 } : null,
            stopLoss: entry * 0.985,
            takeProfit: cur * 1.025,
            riskRewardRatio: 2,
            reasons: applicable ? [`Тренд бычий (${tr?.primaryTrend})`, `Поддержка: ${entry.toFixed(2)}`] : ['Условия не выполнены'],
            requiredConfirmations: ['BOS бычий ранее', 'PA отскока', 'Объём при отскоке'],
            invalidationConditions: ['Пробой поддержки', 'CHoCH bearish'],
            priority: 60,
            applicable: !!applicable
        };
    }

    // ============================================================
    // 6. BREAKOUT ENTRY
    // ============================================================
    function scenarioBreakoutEntry(inputs: SGInputs): SGScenario {
        const sr = inputs.supportResistance;
        const vol = inputs.volatility;
        const cur = getCurrentPrice(inputs.candles);
        const applicable = vol?.inSqueeze && vol.squeezeStrength > 0.6;
        const resistance = sr?.nearestResistance?.price || cur * 1.02;

        return {
            id: 'breakout_entry',
            name: 'Breakout Entry',
            description: 'Вход на пробое сопротивления после сжатия',
            direction: 'long',
            category: 'entry_pattern',
            riskLevel: 'high',
            probability: applicable ? 55 : 25,
            confidence: applicable ? 0.55 : 0.3,
            entryZone: applicable ? { low: resistance, high: resistance * 1.005 } : null,
            stopLoss: resistance * 0.99,
            takeProfit: resistance * 1.03,
            riskRewardRatio: 3,
            reasons: applicable ? [`Squeeze detected (${(vol.squeezeStrength * 100).toFixed(0)}%)`, `Сопротивление: ${resistance.toFixed(2)}`] : ['Нет сжатия'],
            requiredConfirmations: ['Объём пробоя', 'BOS', 'PA продолжения'],
            invalidationConditions: ['Ложный пробой (возврат ниже)', 'Низкий объём'],
            priority: applicable ? 75 : 20,
            applicable: !!applicable
        };
    }

    // ============================================================
    // 7. BOS CONTINUATION
    // ============================================================
    function scenarioBOSContinuation(inputs: SGInputs): SGScenario {
        const sm = inputs.smartMoney;
        const cur = getCurrentPrice(inputs.candles);
        const lastBOS = sm?.bos?.[sm.bos.length - 1];
        const applicable = !!lastBOS;
        const direction = lastBOS?.type === 'bullish' ? 'long' : 'short';

        return {
            id: 'bos_continuation',
            name: 'BOS Continuation',
            description: `Продолжение тренда после последнего BOS (${lastBOS?.type || 'n/a'})`,
            direction,
            category: 'smc_pattern',
            riskLevel: 'medium',
            probability: applicable ? 60 : 30,
            confidence: applicable ? 0.65 : 0.3,
            entryZone: applicable ? { low: lastBOS.level * (direction === 'long' ? 0.998 : 1.002), high: lastBOS.level * (direction === 'long' ? 1.005 : 0.995) } : null,
            stopLoss: lastBOS ? lastBOS.level * (direction === 'long' ? 0.99 : 1.01) : null,
            takeProfit: lastBOS ? cur * (direction === 'long' ? 1.025 : 0.975) : null,
            riskRewardRatio: 2.5,
            reasons: applicable ? [`BOS ${lastBOS.type} @ ${lastBOS.level.toFixed(2)}`] : ['Нет BOS'],
            requiredConfirmations: ['Объём', 'PA продолжения', 'Нет CHoCH против'],
            invalidationConditions: ['CHoCH против тренда', 'Пробой уровня BOS'],
            priority: applicable ? 80 : 25,
            applicable: !!applicable
        };
    }

    // ============================================================
    // 8. CHoCH REVERSAL
    // ============================================================
    function scenarioCHoCHReversal(inputs: SGInputs): SGScenario {
        const sm = inputs.smartMoney;
        const lastCHoCH = sm?.choch?.[sm.choch.length - 1];
        const applicable = !!lastCHoCH;
        const direction = lastCHoCH?.type === 'bullish' ? 'long' : 'short';

        return {
            id: 'choch_reversal',
            name: 'CHoCH Reversal',
            description: `Разворот после CHoCH (${lastCHoCH?.type || 'n/a'})`,
            direction,
            category: 'smc_pattern',
            riskLevel: 'high',
            probability: applicable ? 55 : 25,
            confidence: applicable ? 0.6 : 0.3,
            entryZone: applicable ? { low: lastCHoCH.level * (direction === 'long' ? 0.999 : 1.001), high: lastCHoCH.level * (direction === 'long' ? 1.01 : 0.99) } : null,
            stopLoss: lastCHoCH ? lastCHoCH.level * (direction === 'long' ? 0.985 : 1.015) : null,
            takeProfit: lastCHoCH ? (direction === 'long' ? lastCHoCH.level * 1.05 : lastCHoCH.level * 0.95) : null,
            riskRewardRatio: 3,
            reasons: applicable ? [`CHoCH ${lastCHoCH.type} @ ${lastCHoCH.level.toFixed(2)}`, 'Смена структуры'] : ['Нет CHoCH'],
            requiredConfirmations: ['BOS новый', 'PA разворота', 'Объём'],
            invalidationConditions: ['Новый CHoCH против', 'Возврат к старой структуре'],
            priority: applicable ? 85 : 20,
            applicable: !!applicable
        };
    }

    // ============================================================
    // 9. ORDER BLOCK ENTRY
    // ============================================================
    function scenarioOBEntry(inputs: SGInputs): SGScenario {
        const sm = inputs.smartMoney;
        const lastOB = sm?.orderBlocks?.[sm.orderBlocks.length - 1];
        const applicable = !!lastOB && !lastOB.mitigated;
        const direction = lastOB?.type === 'bullish' ? 'long' : 'short';

        return {
            id: 'ob_entry',
            name: 'Order Block Entry',
            description: `Вход по Order Block (${lastOB?.type || 'n/a'})`,
            direction,
            category: 'smc_pattern',
            riskLevel: 'medium',
            probability: applicable ? 60 : 25,
            confidence: applicable ? 0.6 : 0.3,
            entryZone: applicable ? { low: lastOB.low, high: lastOB.high } : null,
            stopLoss: lastOB ? lastOB.low * (direction === 'long' ? 0.99 : 1.01) : null,
            takeProfit: lastOB ? (direction === 'long' ? lastOB.high * 1.025 : lastOB.low * 0.975) : null,
            riskRewardRatio: 2,
            reasons: applicable ? [`OB [${lastOB.low.toFixed(2)} - ${lastOB.high.toFixed(2)}]`, `Тип: ${lastOB.type}`] : ['Нет активных OB'],
            requiredConfirmations: ['PA реакции', 'Объём при касании'],
            invalidationConditions: ['Пробой OB', 'Mitigation'],
            priority: applicable ? 65 : 15,
            applicable: !!applicable
        };
    }

    // ============================================================
    // 10. FVG RETEST
    // ============================================================
    function scenarioFVGRetest(inputs: SGInputs): SGScenario {
        const sm = inputs.smartMoney;
        const lastFVG = sm?.fairValueGaps?.[sm.fairValueGaps.length - 1];
        const applicable = !!lastFVG && !lastFVG.filled;
        const direction = lastFVG?.type === 'bullish' ? 'long' : 'short';

        return {
            id: 'fvg_retest',
            name: 'FVG Retest',
            description: `Ретест Fair Value Gap (${lastFVG?.type || 'n/a'})`,
            direction,
            category: 'smc_pattern',
            riskLevel: 'medium',
            probability: applicable ? 55 : 20,
            confidence: applicable ? 0.55 : 0.25,
            entryZone: applicable ? { low: lastFVG.low, high: lastFVG.high } : null,
            stopLoss: lastFVG ? lastFVG.midpoint * (direction === 'long' ? 0.99 : 1.01) : null,
            takeProfit: lastFVG ? (direction === 'long' ? lastFVG.high * 1.02 : lastFVG.low * 0.98) : null,
            riskRewardRatio: 2,
            reasons: applicable ? [`FVG [${lastFVG.low.toFixed(2)} - ${lastFVG.high.toFixed(2)}]`, `Midpoint: ${lastFVG.midpoint.toFixed(2)}`] : ['Нет активных FVG'],
            requiredConfirmations: ['PA reaction', 'Объём'],
            invalidationConditions: ['Заполнение FVG'],
            priority: applicable ? 55 : 15,
            applicable: !!applicable
        };
    }

    // ============================================================
    // 11. LIQUIDITY SWEEP ENTRY
    // ============================================================
    function scenarioSweepEntry(inputs: SGInputs): SGScenario {
        const liq = inputs.liquidity;
        const lastHunt = liq?.stopHunts?.[liq.stopHunts.length - 1];
        const applicable = !!lastHunt;
        // Sweep sell-side → бычий вход, sweep buy-side → медвежий
        const direction = lastHunt?.description?.includes('Sell-side') || lastHunt?.description?.includes('below') ? 'long' : 'short';

        return {
            id: 'liquidity_sweep_entry',
            name: 'Liquidity Sweep Entry',
            description: `Вход после sweep ликвидности (${direction})`,
            direction,
            category: 'smc_pattern',
            riskLevel: 'high',
            probability: applicable ? 60 : 25,
            confidence: applicable ? 0.6 : 0.3,
            entryZone: applicable ? { low: lastHunt.price * (direction === 'long' ? 0.998 : 1.002), high: lastHunt.price * (direction === 'long' ? 1.005 : 0.995) } : null,
            stopLoss: lastHunt ? lastHunt.price * (direction === 'long' ? 0.99 : 1.01) : null,
            takeProfit: lastHunt ? (direction === 'long' ? lastHunt.price * 1.025 : lastHunt.price * 0.975) : null,
            riskRewardRatio: 2.5,
            reasons: applicable ? [lastHunt.description, 'Stop hunt завершён'] : ['Нет свежих sweep'],
            requiredConfirmations: ['PA reversal', 'BOS новый', 'Объём'],
            invalidationConditions: ['Новый sweep в том же направлении'],
            priority: applicable ? 75 : 20,
            applicable: !!applicable
        };
    }

    // ============================================================
    // 12. PIN BAR ENTRY
    // ============================================================
    function scenarioPinBarEntry(inputs: SGInputs): SGScenario {
        const pa = inputs.priceAction;
        const bullishPin = pa?.bullishPatterns?.some((p: any) => p.name?.toLowerCase().includes('pin'));
        const bearishPin = pa?.bearishPatterns?.some((p: any) => p.name?.toLowerCase().includes('pin'));
        const applicable = bullishPin || bearishPin;
        const direction = bullishPin ? 'long' : 'short';

        return {
            id: 'pin_bar_entry',
            name: 'Pin Bar Entry',
            description: 'Вход по пин-бару (rejection bar)',
            direction,
            category: 'pa_pattern',
            riskLevel: 'medium',
            probability: applicable ? 55 : 20,
            confidence: applicable ? 0.55 : 0.25,
            entryZone: null,
            stopLoss: null,
            takeProfit: null,
            riskRewardRatio: 2,
            reasons: applicable ? ['Pin bar обнаружен'] : ['Pin bar не обнаружен'],
            requiredConfirmations: ['Объём', 'S/R уровень'],
            invalidationConditions: ['Пробой high/low пин-бара'],
            priority: applicable ? 55 : 10,
            applicable: !!applicable
        };
    }

    // ============================================================
    // 13. ENGULFING ENTRY
    // ============================================================
    function scenarioEngulfingEntry(inputs: SGInputs): SGScenario {
        const pa = inputs.priceAction;
        const bullishEng = pa?.bullishPatterns?.some((p: any) => p.name?.toLowerCase().includes('engulf'));
        const bearishEng = pa?.bearishPatterns?.some((p: any) => p.name?.toLowerCase().includes('engulf'));
        const applicable = bullishEng || bearishEng;
        const direction = bullishEng ? 'long' : 'short';

        return {
            id: 'engulfing_entry',
            name: 'Engulfing Entry',
            description: 'Вход по паттерну поглощения',
            direction,
            category: 'pa_pattern',
            riskLevel: 'medium',
            probability: applicable ? 55 : 20,
            confidence: applicable ? 0.55 : 0.25,
            entryZone: null,
            stopLoss: null,
            takeProfit: null,
            riskRewardRatio: 2,
            reasons: applicable ? ['Engulfing обнаружен'] : ['Engulfing не обнаружен'],
            requiredConfirmations: ['Тренд', 'Объём'],
            invalidationConditions: ['Пробой high/low поглощения'],
            priority: applicable ? 55 : 10,
            applicable: !!applicable
        };
    }

    // ============================================================
    // 14-15. CONSERVATIVE / AGGRESSIVE LONG
    // ============================================================
    function scenarioConservativeLong(inputs: SGInputs): SGScenario {
        const long = scenarioLong(inputs);
        const prob = inputs.probabilities;
        return {
            ...long,
            id: 'conservative_long',
            name: 'Conservative Long',
            description: 'Длинная позиция с минимальным риском (только сильные подтверждения)',
            direction: 'long',
            riskLevel: 'low',
            probability: prob?.bullish || 50,
            confidence: (long.confidence || 0) * 0.9,
            entryZone: long.entryZone ? { low: long.entryZone.low * 0.997, high: long.entryZone.high * 0.998 } : null,
            stopLoss: long.stopLoss,
            takeProfit: long.takeProfit,
            riskRewardRatio: 3,
            reasons: [...long.reasons, 'Строгие правила входа'],
            requiredConfirmations: ['BOS', 'CHoCH', 'PA', 'Volume', 'S/R'],
            invalidationConditions: ['Любое противоречие'],
            priority: long.applicable ? 65 : 25,
            applicable: long.applicable && (prob?.bullish || 0) > 60
        };
    }

    function scenarioAggressiveLong(inputs: SGInputs): SGScenario {
        const long = scenarioLong(inputs);
        return {
            ...long,
            id: 'aggressive_long',
            name: 'Aggressive Long',
            description: 'Длинная позиция с повышенным риском (ранний вход)',
            direction: 'long',
            riskLevel: 'high',
            confidence: Math.min(0.9, (long.confidence || 0) + 0.1),
            entryZone: long.entryZone ? { low: long.entryZone.low * 1.005, high: long.entryZone.high * 1.01 } : null,
            stopLoss: long.stopLoss ? long.stopLoss * 0.995 : null,
            takeProfit: long.takeProfit ? (long.takeProfit || 0) * 1.03 : null,
            riskRewardRatio: 1.5,
            reasons: [...long.reasons, 'Ранний вход без ожидания полного подтверждения'],
            requiredConfirmations: ['Минимум 2 любых сигнала'],
            invalidationConditions: ['Быстрый разворот'],
            priority: long.applicable ? 50 : 40,
            applicable: long.applicable
        };
    }

    // ============================================================
    // 16-17. CONSERVATIVE / AGGRESSIVE SHORT
    // ============================================================
    function scenarioConservativeShort(inputs: SGInputs): SGScenario {
        const short = scenarioShort(inputs);
        const prob = inputs.probabilities;
        return {
            ...short,
            id: 'conservative_short',
            name: 'Conservative Short',
            description: 'Короткая позиция с минимальным риском',
            direction: 'short',
            riskLevel: 'low',
            probability: prob?.bearish || 50,
            confidence: (short.confidence || 0) * 0.9,
            entryZone: short.entryZone ? { low: short.entryZone.low * 1.002, high: short.entryZone.high * 1.003 } : null,
            stopLoss: short.stopLoss,
            takeProfit: short.takeProfit,
            riskRewardRatio: 3,
            reasons: [...short.reasons, 'Строгие правила входа'],
            requiredConfirmations: ['BOS', 'CHoCH', 'PA', 'Volume', 'S/R'],
            invalidationConditions: ['Любое противоречие'],
            priority: short.applicable ? 65 : 25,
            applicable: short.applicable && (prob?.bearish || 0) > 60
        };
    }

    function scenarioAggressiveShort(inputs: SGInputs): SGScenario {
        const short = scenarioShort(inputs);
        return {
            ...short,
            id: 'aggressive_short',
            name: 'Aggressive Short',
            description: 'Короткая позиция с повышенным риском (ранний вход)',
            direction: 'short',
            riskLevel: 'high',
            confidence: Math.min(0.9, (short.confidence || 0) + 0.1),
            entryZone: short.entryZone ? { low: short.entryZone.low * 0.99, high: short.entryZone.high * 0.995 } : null,
            stopLoss: short.stopLoss ? short.stopLoss * 1.005 : null,
            takeProfit: short.takeProfit ? (short.takeProfit || 0) * 0.97 : null,
            riskRewardRatio: 1.5,
            reasons: [...short.reasons, 'Ранний вход'],
            requiredConfirmations: ['Минимум 2 любых сигнала'],
            invalidationConditions: ['Быстрый разворот'],
            priority: short.applicable ? 50 : 40,
            applicable: short.applicable
        };
    }

    // ============================================================
    // 18. SCALE IN
    // ============================================================
    function scenarioScaleIn(inputs: SGInputs): SGScenario {
        const long = scenarioLong(inputs);
        const short = scenarioShort(inputs);
        const applicable = long.applicable || short.applicable;
        const direction = long.applicable ? 'long' : 'short';
        return {
            id: 'scale_in',
            name: 'Scale In',
            description: 'Постепенное наращивание позиции при подтверждении тренда',
            direction,
            category: 'position_management',
            riskLevel: 'medium',
            probability: 60,
            confidence: 0.6,
            entryZone: direction === 'long' ? long.entryZone : short.entryZone,
            stopLoss: direction === 'long' ? long.stopLoss : short.stopLoss,
            takeProfit: direction === 'long' ? long.takeProfit : short.takeProfit,
            riskRewardRatio: 2.5,
            reasons: ['Тренд подтверждён', 'Несколько входов для усреднения'],
            requiredConfirmations: ['Сильный тренд', 'Низкая волатильность'],
            invalidationConditions: ['CHoCH против тренда'],
            priority: 45,
            applicable: !!applicable
        };
    }

    // ============================================================
    // 19. PARTIAL POSITION
    // ============================================================
    function scenarioPartialPosition(inputs: SGInputs): SGScenario {
        const conf = inputs.confluence;
        const applicable = conf && conf.confluenceScore >= 50 && conf.confluenceScore < 80;
        const direction = conf?.dominantDirection === 'bullish' ? 'long' : (conf?.dominantDirection === 'bearish' ? 'short' : 'neutral');
        return {
            id: 'partial_position',
            name: 'Partial Position',
            description: 'Частичная позиция при средней уверенности',
            direction,
            category: 'position_management',
            riskLevel: 'low',
            probability: 55,
            confidence: 0.55,
            entryZone: null,
            stopLoss: null,
            takeProfit: null,
            riskRewardRatio: 2,
            reasons: applicable ? [`Confluence ${conf.confluenceScore.toFixed(0)}/100 — средняя уверенность`] : ['Низкая/высокая уверенность — полная позиция не рекомендована'],
            requiredConfirmations: ['Усиление confluence'],
            invalidationConditions: ['Падение confluence ниже 40'],
            priority: 35,
            applicable: !!applicable
        };
    }

    // ============================================================
    // ГЛАВНАЯ ФУНКЦИЯ: генерация всех сценариев
    // ============================================================
    function generateScenarios(inputs: SGInputs): SGScenario[] {
        if (!inputs) return [scenarioNoTrade(inputs)];

        const scenarios: SGScenario[] = [
            scenarioNoTrade(inputs),
            scenarioWait(inputs),
            scenarioLong(inputs),
            scenarioShort(inputs),
            scenarioPullbackEntry(inputs),
            scenarioBreakoutEntry(inputs),
            scenarioBOSContinuation(inputs),
            scenarioCHoCHReversal(inputs),
            scenarioOBEntry(inputs),
            scenarioFVGRetest(inputs),
            scenarioSweepEntry(inputs),
            scenarioPinBarEntry(inputs),
            scenarioEngulfingEntry(inputs),
            scenarioConservativeLong(inputs),
            scenarioAggressiveLong(inputs),
            scenarioConservativeShort(inputs),
            scenarioAggressiveShort(inputs),
            scenarioScaleIn(inputs),
            scenarioPartialPosition(inputs)
        ];

        // Сортировка по приоритету (убывание)
        scenarios.sort((a, b) => b.priority - a.priority);

        return scenarios;
    }

    // ============================================================
    // ПУБЛИЧНЫЙ API
    // ============================================================
    const scenarioGenerator = {
        generate: generateScenarios,
        generateScenarios: generateScenarios,
        VERSION: '2.0.0',
        _internal: {
            scenarioNoTrade, scenarioWait, scenarioLong, scenarioShort,
            scenarioPullbackEntry, scenarioBreakoutEntry,
            scenarioBOSContinuation, scenarioCHoCHReversal,
            scenarioOBEntry, scenarioFVGRetest, scenarioSweepEntry,
            scenarioPinBarEntry, scenarioEngulfingEntry,
            scenarioConservativeLong, scenarioAggressiveLong,
            scenarioConservativeShort, scenarioAggressiveShort,
            scenarioScaleIn, scenarioPartialPosition
        }
    };

    if (typeof global !== 'undefined') global.scenarioGenerator = scenarioGenerator;
    if (typeof window !== 'undefined') (window as any).scenarioGenerator = scenarioGenerator;
    if (typeof module !== 'undefined' && module.exports) module.exports = scenarioGenerator;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : globalThis));
