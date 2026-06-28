/**
 * confluenceEngine.ts — Module X / Engine #1
 *
 * Назначение: объединяет результаты всех анализаторов и вычисляет силу
 *              совпадения сигналов (confluence score).
 *
 * Зависимости: marketStructure, trend, momentum, priceAction, smartMoney,
 *              volume, liquidity, volatility, supportResistance.
 * Используется: probabilityEngine, confidenceEngine, scenarioGenerator.
 *
 * Публичный API:
 *   - calculateConfluence(inputs: ConfluenceInputs): ConfluenceResult
 *
 * Логика:
 *   - Каждый сигнал взвешивается (weight) по важности источника.
 *   - Определяются направления (bullish/bearish/neutral).
 *   - Подсчитываются совпадающие и конфликтующие сигналы.
 *   - Итоговый score: 0..100 на основе weighted sum с учётом конфликтов.
 */

interface ConfluenceInputs {
    marketStructure?: { type: string; structureShift?: any; swings?: any[] };
    trend?: { primaryTrend: string; strength: number; adx?: number };
    momentum?: { rsi: number; macdHistogram: number; roc: number; momentumState?: string };
    priceAction?: { bullishPatterns: any[]; bearishPatterns: any[]; totalPatterns: number };
    smartMoney?: { bos: any[]; choch: any[]; mss: any[]; orderBlocks: any[]; fvg: any[]; sweeps: any[]; internalTrend?: string };
    volume?: { bias: string; regime: string; volumeSpike?: boolean; buyingPressure: number; sellingPressure: number; divergences?: any[] };
    liquidity?: { bias: string; stopHunts: any[]; liquidityGrabs: any[]; liquidityVoids: any[] };
    volatility?: { regime: string; bias: string; inSqueeze?: boolean; squeezeStrength?: number };
    supportResistance?: { pricePosition: string; nearestSupport?: any; nearestResistance?: any };
}

interface Signal {
    source: string;
    name: string;
    direction: 'bullish' | 'bearish' | 'neutral';
    weight: number;
    description: string;
}

interface ConfluenceGroup {
    name: string;
    signals: Signal[];
    direction: 'bullish' | 'bearish' | 'neutral';
    totalWeight: number;
    description: string;
}

interface ConfluenceResult {
    signals: Signal[];
    groups: ConfluenceGroup[];
    totalSignals: number;
    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
    conflictingCount: number;
    alignmentPercent: number;
    bullScore: number;
    bearScore: number;
    netScore: number;
    confluenceScore: number;
    strength: 'no_confluence' | 'weak' | 'moderate' | 'strong' | 'very_strong';
    dominantDirection: 'bullish' | 'bearish' | 'neutral';
    recommendation: 'high_confluence_long' | 'high_confluence_short' | 'reversal_zone' | 'conflict_no_trade' | 'wait_for_clarity';
    summary: string;
    conflicts: { signal1: Signal; signal2: Signal }[];
}

(function (global: any) {
    'use strict';

    // ============================================================
    // СБОР СИГНАЛОВ ИЗ КАЖДОГО АНАЛИЗАТОРА
    // ============================================================
    function extractSignals(inputs: ConfluenceInputs): Signal[] {
        const signals: Signal[] = [];

        if (inputs.marketStructure) {
            const ms = inputs.marketStructure;
            if (ms.type === 'uptrend') {
                signals.push({ source: 'marketStructure', name: 'Uptrend', direction: 'bullish', weight: 0.9, description: 'Структура восходящая' });
            } else if (ms.type === 'downtrend') {
                signals.push({ source: 'marketStructure', name: 'Downtrend', direction: 'bearish', weight: 0.9, description: 'Структура нисходящая' });
            } else if (ms.type === 'range') {
                signals.push({ source: 'marketStructure', name: 'Range', direction: 'neutral', weight: 0.4, description: 'Флэт / боковик' });
            }
            if (ms.structureShift?.type === 'bullish') {
                signals.push({ source: 'marketStructure', name: 'Structure Shift Bullish', direction: 'bullish', weight: 0.85, description: 'Смена структуры на бычью' });
            } else if (ms.structureShift?.type === 'bearish') {
                signals.push({ source: 'marketStructure', name: 'Structure Shift Bearish', direction: 'bearish', weight: 0.85, description: 'Смена структуры на медвежью' });
            }
        }

        if (inputs.trend) {
            const tr = inputs.trend;
            if (tr.primaryTrend === 'strong_bull' || tr.primaryTrend === 'bull') {
                signals.push({ source: 'trend', name: `Trend: ${tr.primaryTrend}`, direction: 'bullish', weight: 0.8 + (tr.strength || 0) * 0.1, description: `Тренд бычий, сила ${(tr.strength || 0).toFixed(2)}` });
            } else if (tr.primaryTrend === 'strong_bear' || tr.primaryTrend === 'bear') {
                signals.push({ source: 'trend', name: `Trend: ${tr.primaryTrend}`, direction: 'bearish', weight: 0.8 + (tr.strength || 0) * 0.1, description: `Тренд медвежий, сила ${(tr.strength || 0).toFixed(2)}` });
            } else if (tr.primaryTrend === 'neutral') {
                signals.push({ source: 'trend', name: 'Trend Neutral', direction: 'neutral', weight: 0.5, description: 'Нет выраженного тренда' });
            }
        }

        if (inputs.momentum) {
            const m = inputs.momentum;
            if (m.rsi < 30) {
                signals.push({ source: 'momentum', name: 'RSI Oversold', direction: 'bullish', weight: 0.6, description: `RSI ${m.rsi.toFixed(1)} (перепродан)` });
            } else if (m.rsi > 70) {
                signals.push({ source: 'momentum', name: 'RSI Overbought', direction: 'bearish', weight: 0.6, description: `RSI ${m.rsi.toFixed(1)} (перекуплен)` });
            }
            if (m.macdHistogram > 0) {
                signals.push({ source: 'momentum', name: 'MACD Positive', direction: 'bullish', weight: 0.55, description: 'MACD гистограмма > 0' });
            } else if (m.macdHistogram < 0) {
                signals.push({ source: 'momentum', name: 'MACD Negative', direction: 'bearish', weight: 0.55, description: 'MACD гистограмма < 0' });
            }
            if (m.roc > 0) {
                signals.push({ source: 'momentum', name: 'ROC Positive', direction: 'bullish', weight: 0.4, description: `ROC ${m.roc.toFixed(2)}` });
            } else if (m.roc < 0) {
                signals.push({ source: 'momentum', name: 'ROC Negative', direction: 'bearish', weight: 0.4, description: `ROC ${m.roc.toFixed(2)}` });
            }
        }

        if (inputs.priceAction) {
            const pa = inputs.priceAction;
            const bullishCount = (pa.bullishPatterns || []).length;
            const bearishCount = (pa.bearishPatterns || []).length;
            if (bullishCount > bearishCount && bullishCount > 0) {
                signals.push({ source: 'priceAction', name: `Bullish PA Patterns (${bullishCount})`, direction: 'bullish', weight: Math.min(0.8, 0.4 + bullishCount * 0.1), description: `${bullishCount} бычьих паттернов` });
            } else if (bearishCount > bullishCount && bearishCount > 0) {
                signals.push({ source: 'priceAction', name: `Bearish PA Patterns (${bearishCount})`, direction: 'bearish', weight: Math.min(0.8, 0.4 + bearishCount * 0.1), description: `${bearishCount} медвежьих паттернов` });
            }
        }

        if (inputs.smartMoney) {
            const sm = inputs.smartMoney;
            const recentBOS = (sm.bos || []).slice(-3);
            const recentCHoCH = (sm.choch || []).slice(-3);
            for (const b of recentBOS) {
                const dir = b.type === 'bullish' ? 'bullish' : 'bearish';
                const lvl = (b.level ?? b.price ?? 0);
                signals.push({ source: 'smartMoney', name: `BOS ${b.type}`, direction: dir, weight: 0.75, description: `BOS @ ${typeof lvl === 'number' ? lvl.toFixed(2) : 'n/a'}` });
            }
            for (const c of recentCHoCH) {
                const dir = c.type === 'bullish' ? 'bullish' : 'bearish';
                const lvl = (c.level ?? c.price ?? 0);
                signals.push({ source: 'smartMoney', name: `CHoCH ${c.type}`, direction: dir, weight: 0.85, description: `CHoCH @ ${typeof lvl === 'number' ? lvl.toFixed(2) : 'n/a'}` });
            }
            const recentOB = (sm.orderBlocks || []).slice(-3);
            for (const ob of recentOB) {
                const dir = ob.type === 'bullish' ? 'bullish' : 'bearish';
                const lo = (ob.low ?? ob.bottom ?? 0);
                const hi = (ob.high ?? ob.top ?? 0);
                signals.push({ source: 'smartMoney', name: `Order Block ${ob.type}`, direction: dir, weight: 0.65, description: `OB [${typeof lo === 'number' ? lo.toFixed(2) : 'n/a'} - ${typeof hi === 'number' ? hi.toFixed(2) : 'n/a'}]` });
            }
            const recentSweeps = (sm.sweeps || []).slice(-3);
            for (const s of recentSweeps) {
                const dir = s.side === 'sell_side' ? 'bullish' : 'bearish';
                const lvl = (s.sweptLevel ?? s.price ?? 0);
                signals.push({ source: 'smartMoney', name: `Liquidity Sweep ${s.side}`, direction: dir, weight: 0.7, description: `Sweep @ ${typeof lvl === 'number' ? lvl.toFixed(2) : 'n/a'}` });
            }
            if (sm.internalTrend === 'bullish') {
                signals.push({ source: 'smartMoney', name: 'Internal Trend Bullish', direction: 'bullish', weight: 0.7, description: 'Внутренний тренд бычий' });
            } else if (sm.internalTrend === 'bearish') {
                signals.push({ source: 'smartMoney', name: 'Internal Trend Bearish', direction: 'bearish', weight: 0.7, description: 'Внутренний тренд медвежий' });
            }
        }

        if (inputs.volume) {
            const v = inputs.volume;
            if (v.bias === 'bullish') {
                signals.push({ source: 'volume', name: 'Volume Bullish', direction: 'bullish', weight: 0.6, description: 'Давление покупателей' });
            } else if (v.bias === 'bearish') {
                signals.push({ source: 'volume', name: 'Volume Bearish', direction: 'bearish', weight: 0.6, description: 'Давление продавцов' });
            }
            if (v.volumeSpike) {
                signals.push({ source: 'volume', name: 'Volume Spike', direction: v.bias === 'bullish' ? 'bullish' : (v.bias === 'bearish' ? 'bearish' : 'neutral'), weight: 0.5, description: 'Спайк объёма' });
            }
            if (v.divergences) {
                for (const d of v.divergences) {
                    signals.push({ source: 'volume', name: `Volume Divergence ${d.type}`, direction: d.type, weight: 0.75, description: d.description });
                }
            }
        }

        if (inputs.liquidity) {
            const l = inputs.liquidity;
            if (l.bias === 'bullish') {
                signals.push({ source: 'liquidity', name: 'Liquidity Bias Bullish', direction: 'bullish', weight: 0.5, description: 'Свеп sell-side ликвидности' });
            } else if (l.bias === 'bearish') {
                signals.push({ source: 'liquidity', name: 'Liquidity Bias Bearish', direction: 'bearish', weight: 0.5, description: 'Свеп buy-side ликвидности' });
            }
            const recentHunts = (l.stopHunts || []).slice(-3);
            for (const h of recentHunts) {
                const dir = h.description?.includes('Buy-side') ? 'bearish' : 'bullish';
                signals.push({ source: 'liquidity', name: 'Stop Hunt', direction: dir, weight: 0.65, description: h.description });
            }
        }

        if (inputs.volatility) {
            const va = inputs.volatility;
            if (va.regime === 'extreme_low' || va.regime === 'low') {
                signals.push({ source: 'volatility', name: 'Low Volatility', direction: 'neutral', weight: 0.3, description: 'Низкая волатильность — ожидается пробой' });
            } else if (va.regime === 'extreme_high' || va.regime === 'high') {
                signals.push({ source: 'volatility', name: 'High Volatility', direction: 'neutral', weight: 0.3, description: 'Высокая волатильность' });
            }
            if (va.inSqueeze && va.squeezeStrength > 0.5) {
                signals.push({ source: 'volatility', name: 'Squeeze', direction: 'neutral', weight: 0.6, description: `Сжатие BB внутри KC (${(va.squeezeStrength * 100).toFixed(0)}%)` });
            }
        }

        if (inputs.supportResistance) {
            const sr = inputs.supportResistance;
            if (sr.pricePosition === 'in_supply') {
                signals.push({ source: 'supportResistance', name: 'Price in Supply', direction: 'bearish', weight: 0.55, description: 'Цена у зоны сопротивления' });
            } else if (sr.pricePosition === 'in_demand') {
                signals.push({ source: 'supportResistance', name: 'Price in Demand', direction: 'bullish', weight: 0.55, description: 'Цена у зоны поддержки' });
            } else if (sr.pricePosition === 'at_level') {
                signals.push({ source: 'supportResistance', name: 'Price at Key Level', direction: 'neutral', weight: 0.7, description: 'Цена на ключевом уровне' });
            }
        }

        return signals;
    }

    // ============================================================
    // ГРУППИРОВКА КОНФЛЮЭНЦИЙ
    // ============================================================
    function groupConfluences(signals: Signal[]): ConfluenceGroup[] {
        const groups: Map<string, ConfluenceGroup> = new Map();

        for (const sig of signals) {
            if (sig.direction === 'neutral') continue;
            const key = sig.direction;
            if (!groups.has(key)) {
                groups.set(key, {
                    name: key === 'bullish' ? 'Bullish Confluence Group' : 'Bearish Confluence Group',
                    signals: [],
                    direction: sig.direction,
                    totalWeight: 0,
                    description: ''
                });
            }
            const g = groups.get(key)!;
            g.signals.push(sig);
            g.totalWeight += sig.weight;
        }

        for (const g of groups.values()) {
            const sources = [...new Set(g.signals.map(s => s.source))];
            g.description = `${g.signals.length} сигналов из источников: ${sources.join(', ')}`;
        }

        return [...groups.values()];
    }

    // ============================================================
    // ОПРЕДЕЛЕНИЕ КОНФЛИКТОВ
    // ============================================================
    function findConflicts(signals: Signal[]): { signal1: Signal; signal2: Signal }[] {
        const conflicts: { signal1: Signal; signal2: Signal }[] = [];
        const directed = signals.filter(s => s.direction !== 'neutral');
        for (let i = 0; i < directed.length; i++) {
            for (let j = i + 1; j < directed.length; j++) {
                if (directed[i].direction !== directed[j].direction) {
                    conflicts.push({ signal1: directed[i], signal2: directed[j] });
                }
            }
        }
        return conflicts;
    }

    // ============================================================
    // ОСНОВНАЯ ФУНКЦИЯ
    // ============================================================
    function calculateConfluence(inputs: ConfluenceInputs): ConfluenceResult {
        const empty: ConfluenceResult = {
            signals: [], groups: [],
            totalSignals: 0, bullishCount: 0, bearishCount: 0, neutralCount: 0,
            conflictingCount: 0, alignmentPercent: 0,
            bullScore: 0, bearScore: 0, netScore: 0,
            confluenceScore: 0, strength: 'no_confluence',
            dominantDirection: 'neutral', recommendation: 'wait_for_clarity',
            summary: 'Нет данных для анализа',
            conflicts: []
        };

        if (!inputs) return empty;

        const signals = extractSignals(inputs);
        if (signals.length === 0) return { ...empty, summary: 'Сигналов не обнаружено' };

        const groups = groupConfluences(signals);

        let bullishCount = 0, bearishCount = 0, neutralCount = 0;
        let bullWeight = 0, bearWeight = 0;
        for (const s of signals) {
            if (s.direction === 'bullish') { bullishCount++; bullWeight += s.weight; }
            else if (s.direction === 'bearish') { bearishCount++; bearWeight += s.weight; }
            else neutralCount++;
        }

        const conflicts = findConflicts(signals);

        const totalDirected = bullishCount + bearishCount;
        const dominantCount = Math.max(bullishCount, bearishCount);
        const alignmentPercent = totalDirected > 0 ? (dominantCount / totalDirected) * 100 : 0;
        const totalWeight = bullWeight + bearWeight;
        const bullScore = totalWeight > 0 ? bullWeight / totalWeight : 0;
        const bearScore = totalWeight > 0 ? bearWeight / totalWeight : 0;
        const netScore = bullScore - bearScore;

        let confluenceScore = 0;
        confluenceScore += alignmentPercent * 0.4;
        confluenceScore += Math.abs(netScore) * 40;
        const sources = new Set(signals.filter(s => s.direction !== 'neutral').map(s => s.source));
        confluenceScore += Math.min(20, sources.size * 2.5);
        confluenceScore -= Math.min(30, conflicts.length * 3);
        confluenceScore = Math.max(0, Math.min(100, confluenceScore));

        let strength: ConfluenceResult['strength'];
        if (confluenceScore >= 80) strength = 'very_strong';
        else if (confluenceScore >= 60) strength = 'strong';
        else if (confluenceScore >= 40) strength = 'moderate';
        else if (confluenceScore >= 20) strength = 'weak';
        else strength = 'no_confluence';

        let dominantDirection: 'bullish' | 'bearish' | 'neutral';
        if (bullScore > bearScore + 0.1) dominantDirection = 'bullish';
        else if (bearScore > bullScore + 0.1) dominantDirection = 'bearish';
        else dominantDirection = 'neutral';

        let recommendation: ConfluenceResult['recommendation'];
        if (strength === 'very_strong' || strength === 'strong') {
            if (dominantDirection === 'bullish') recommendation = 'high_confluence_long';
            else if (dominantDirection === 'bearish') recommendation = 'high_confluence_short';
            else recommendation = 'wait_for_clarity';
        } else if (conflicts.length >= 3 && alignmentPercent < 60) {
            recommendation = 'conflict_no_trade';
        } else if (signals.some(s => s.name.includes('CHoCH') || s.name.includes('Structure Shift'))) {
            recommendation = 'reversal_zone';
        } else {
            recommendation = 'wait_for_clarity';
        }

        const summary = `${strength.toUpperCase()} confluence (${confluenceScore.toFixed(0)}/100), ${dominantDirection}, ${signals.length} сигналов из ${sources.size} источников, ${conflicts.length} конфликтов`;

        return {
            signals,
            groups,
            totalSignals: signals.length,
            bullishCount,
            bearishCount,
            neutralCount,
            conflictingCount: conflicts.length,
            alignmentPercent,
            bullScore,
            bearScore,
            netScore,
            confluenceScore,
            strength,
            dominantDirection,
            recommendation,
            summary,
            conflicts
        };
    }

    // ============================================================
    // ПУБЛИЧНЫЙ API
    // ============================================================
    const confluenceEngine = {
        calculate: calculateConfluence,
        calculateConfluence: calculateConfluence,
        VERSION: '2.0.0',
        _internal: { extractSignals, groupConfluences, findConflicts }
    };

    if (typeof global !== 'undefined') global.confluenceEngine = confluenceEngine;
    if (typeof window !== 'undefined') (window as any).confluenceEngine = confluenceEngine;
    if (typeof module !== 'undefined' && module.exports) module.exports = confluenceEngine;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : globalThis));
