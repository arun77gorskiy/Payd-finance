/* =================================================================
   PAYD Finance — PaydAlphaEngine
   Независимый движок оценки ВЕРОЯТНОСТИ, что рынок НЕДООЦЕНИВАЕТ проект.

   Диапазон: 0-100.
   Классификация:
     95-100  Exceptional Alpha Opportunity
     90-94   Very High Alpha
     80-89   High Alpha
     70-79   Moderate Alpha
     60-69   Low Alpha
     <60     Fully Priced / Weak Alpha

   ПОВЫШАЕТ Score:
     + Быстрый рост GitHub
     + Рост активных разработчиков
     + Рост экосистемы (TVL, on-chain активность)
     + Рост пользователей
     + Ускорение revenue
     + Новые институциональные инвесторы
     + Стратегические партнёрства
     + Здоровая токеномика
     + Низкий unlock risk
     + Небольшая/средняя капитализация относительно фундаментала
     + Увеличение on-chain активности
     + Улучшение ликвидности
     + Устойчивый положительный тренд

   ПОНИЖАЕТ Score:
     - Замедление разработки
     - Стагнация пользователей
     - Снижение revenue
     - Приближение крупных unlock events
     - Ослабление ликвидности
     - Прекращение партнёрств
     - Падение GitHub активности
     - Рынок уже отражает фундаментал
     - Очень большая капитализация с ограниченным потенциалом роста
     - Высокая спекулятивная активность без фундаментальных улучшений
   ================================================================= */

(function (global) {
    'use strict';

    const BaseEngine = global.PAYD_INTEL.BaseEngine;

    class PaydAlphaEngine extends BaseEngine {
        constructor(config = {}) {
            super(config);
            this.name = 'alpha';
            this.label = 'Payd Alpha Score';
            this.description = 'Opportunity (undervalued?)';
            this.range = [0, 100];
        }

        /**
         * Переопределяем classify для специфических alpha-уровней.
         */
        classify(value, range = this.range) {
            if (value >= 95) return { tier: 'exceptional', label: 'Exceptional Alpha Opportunity', color: '#D4AF37' };
            if (value >= 90) return { tier: 'very_high',    label: 'Very High Alpha',                  color: '#22c55e' };
            if (value >= 80) return { tier: 'high',         label: 'High Alpha',                       color: '#84cc16' };
            if (value >= 70) return { tier: 'moderate',     label: 'Moderate Alpha',                   color: '#eab308' };
            if (value >= 60) return { tier: 'low',          label: 'Low Alpha',                        color: '#f97316' };
            return                  { tier: 'weak',        label: 'Fully Priced / Weak Alpha',        color: '#ef4444' };
        }

        calculate(project, context = {}) {
            const breakdown = {};
            const factors = [];
            const history = context.history || (project._history) || [];

            // ---- 1. GROWTH SIGNALS (30) ----
            const growth = computeGrowthSignals(project, history);
            breakdown.growth = growth.score;
            factors.push({
                name: 'Growth Signals',
                value: growth.score,
                max: 30,
                delta: growth.score - 15,
                direction: growth.score >= 20 ? 'positive' : growth.score >= 10 ? 'neutral' : 'negative',
                detail: growth.detail,
            });

            // ---- 2. UNDERVALUATION vs MARKET CAP (25) ----
            const underval = computeUndervaluation(project, history);
            breakdown.undervaluation = underval.score;
            factors.push({
                name: 'Undervaluation',
                value: underval.score,
                max: 25,
                delta: underval.score - 12.5,
                direction: underval.score >= 18 ? 'positive' : underval.score >= 10 ? 'neutral' : 'negative',
                detail: underval.detail,
            });

            // ---- 3. TOKENOMICS & UNLOCK HEALTH (15) ----
            const tokenomics = computeTokenomicsHealth(project);
            breakdown.tokenomics = tokenomics.score;
            factors.push({
                name: 'Tokenomics Health',
                value: tokenomics.score,
                max: 15,
                delta: tokenomics.score - 7.5,
                direction: tokenomics.score >= 11 ? 'positive' : tokenomics.score >= 5 ? 'neutral' : 'negative',
                detail: tokenomics.detail,
            });

            // ---- 4. ECOSYSTEM EXPANSION (15) ----
            const ecosystem = computeEcosystemExpansion(project, history);
            breakdown.ecosystem = ecosystem.score;
            factors.push({
                name: 'Ecosystem Expansion',
                value: ecosystem.score,
                max: 15,
                delta: ecosystem.score - 7.5,
                direction: ecosystem.score >= 11 ? 'positive' : ecosystem.score >= 5 ? 'neutral' : 'negative',
                detail: ecosystem.detail,
            });

            // ---- 5. SUSTAINED TREND (10) ----
            const trend = computeSustainedTrend(project, history);
            breakdown.sustainedTrend = trend.score;
            factors.push({
                name: 'Sustained Trend',
                value: trend.score,
                max: 10,
                delta: trend.score - 5,
                direction: trend.score >= 7 ? 'positive' : trend.score >= 3 ? 'neutral' : 'negative',
                detail: trend.detail,
            });

            // ---- 6. SPECULATIVE OVERHEAT PENALTY (-15..0) ----
            const overheat = computeSpeculativeOverheat(project);
            breakdown.speculativeOverheat = overheat.penalty;
            if (overheat.penalty < 0) {
                factors.push({
                    name: 'Speculative Overheat',
                    value: overheat.penalty,
                    max: 0,
                    delta: overheat.penalty,
                    direction: 'negative',
                    detail: overheat.detail,
                });
            }

            // ---- 7. EARLY-STAGE BONUS (0..5) ----
            const earlyStage = computeEarlyStageBonus(project);
            breakdown.earlyStage = earlyStage.score;
            if (earlyStage.score > 0) {
                factors.push({
                    name: 'Early Stage Bonus',
                    value: earlyStage.score,
                    max: 5,
                    delta: earlyStage.score,
                    direction: 'positive',
                    detail: earlyStage.detail,
                });
            }

            // ---- ИТОГО ----
            const total = growth.score + underval.score + tokenomics.score
                        + ecosystem.score + trend.score + overheat.penalty + earlyStage.score;
            const value = Math.max(0, Math.min(100, Math.round(total)));

            // ---- CONFIDENCE ----
            // Если мало истории — confidence ниже
            const hasHistory = Array.isArray(history) && history.length >= 2;
            const confidence = !hasHistory ? 'low'
                             : (growth.detail.includes('нет истории') ? 'medium' : 'high');
            const confidenceScore = !hasHistory ? 40 : 80;

            const explanation = buildExplanation({
                value, growth, underval, tokenomics, ecosystem, trend, overheat, earlyStage, project
            });

            return this.buildResult({
                value,
                breakdown,
                factors,
                explanation,
                confidence,
                confidenceScore,
                sources: ['github', 'coingecko', 'defillama', 'tokenunlocks', 'fallback_manager'],
            });
        }
    }

    // ================== COMPONENT FUNCTIONS ==================

    function computeGrowthSignals(project, history) {
        // Без истории — даём базовый балл на основе текущих метрик
        const commits = unwrap(project.development && project.development.commits, 0);
        const activeDevs = unwrap(project.development && project.development.activeDevelopers, 0);
        const stars = unwrap(project.development && project.development.stars, 0);
        const releases = unwrap(project.development && project.development.releases, 0);

        let score = 0;
        const details = [];

        // Базовая оценка без истории
        if (commits >= 500) { score += 8; details.push(`commits=${commits} (высоко)`); }
        else if (commits >= 100) { score += 5; details.push(`commits=${commits} (средне)`); }
        else if (commits > 0) { score += 2; details.push(`commits=${commits} (низко)`); }

        if (activeDevs >= 50) { score += 7; details.push(`devs=${activeDevs} (высоко)`); }
        else if (activeDevs >= 15) { score += 4; details.push(`devs=${activeDevs} (средне)`); }
        else if (activeDevs > 0) { score += 2; details.push(`devs=${activeDevs} (мало)`); }

        if (releases > 0) { score += 2; details.push(`releases=${releases}`); }
        if (stars >= 1000) { score += 3; details.push(`stars=${stars} (зрелый)`); }

        // Бонус за рост (если есть история)
        if (Array.isArray(history) && history.length >= 2) {
            const commitsSeries = extractSeries(history, 'commits');
            if (commitsSeries.length >= 2) {
                const growth = (commitsSeries[commitsSeries.length - 1] - commitsSeries[0]) / Math.max(commitsSeries[0], 1);
                if (growth > 0.3) { score += 5; details.push(`commits +${(growth*100).toFixed(0)}%`); }
                else if (growth > 0.1) { score += 3; details.push(`commits +${(growth*100).toFixed(0)}%`); }
                else if (growth < -0.1) { score -= 3; details.push(`commits ${(growth*100).toFixed(0)}% (спад)`); }
            }
            const devsSeries = extractSeries(history, 'activeDevelopers');
            if (devsSeries.length >= 2) {
                const growth = (devsSeries[devsSeries.length - 1] - devsSeries[0]) / Math.max(devsSeries[0], 1);
                if (growth > 0.2) { score += 4; details.push(`devs +${(growth*100).toFixed(0)}%`); }
                else if (growth < -0.1) { score -= 2; details.push(`devs ${(growth*100).toFixed(0)}%`); }
            }
        }

        return { score: Math.max(0, Math.min(30, score)), detail: details.join('; ') || 'нет данных' };
    }

    function computeUndervaluation(project, history) {
        const mcap = unwrap(project.market && project.market.marketCap, 0);
        const tvl = unwrap(project.defi && project.defi.tvl, 0);
        const vol = unwrap(project.market && project.market.volume24h, 0);
        const commits = unwrap(project.development && project.development.commits, 0);

        let score = 0;
        const details = [];

        // Небольшая/средняя капитализация = больше потенциал
        if (mcap > 0 && mcap < 50_000_000) { score += 8; details.push(`mcap=$${(mcap/1e6).toFixed(1)}M (small)`); }
        else if (mcap < 500_000_000) { score += 5; details.push(`mcap=$${(mcap/1e6).toFixed(0)}M (mid)`); }
        else if (mcap < 5_000_000_000) { score += 2; details.push(`mcap=$${(mcap/1e9).toFixed(1)}B (large)`); }
        else if (mcap >= 5_000_000_000) { score -= 3; details.push(`mcap=$${(mcap/1e9).toFixed(1)}B (very large)`); }

        // TVL/MCap ratio — высокий TVL относительно MCAP = недооценёнка
        if (tvl > 0 && mcap > 0) {
            const tvlMcapRatio = tvl / mcap;
            if (tvlMcapRatio > 0.5) { score += 6; details.push(`TVL/MCap=${(tvlMcapRatio*100).toFixed(0)}%`); }
            else if (tvlMcapRatio > 0.2) { score += 4; details.push(`TVL/MCap=${(tvlMcapRatio*100).toFixed(0)}%`); }
            else if (tvlMcapRatio > 0.05) { score += 2; details.push(`TVL/MCap=${(tvlMcapRatio*100).toFixed(0)}%`); }
        }

        // Volume / MCap turnover — ликвидность
        if (vol > 0 && mcap > 0) {
            const turnover = vol / mcap;
            if (turnover > 0.05) { score += 4; details.push(`turnover=${(turnover*100).toFixed(1)}%`); }
            else if (turnover > 0.01) { score += 2; details.push(`turnover=${(turnover*100).toFixed(1)}%`); }
            else if (turnover < 0.005) { score -= 2; details.push(`turnover низкий=${(turnover*100).toFixed(1)}%`); }
        }

        // Commits/MCap — фундаментал vs капитализация
        if (commits > 0 && mcap > 0) {
            const devIntensity = commits / Math.log10(mcap + 10);
            if (devIntensity > 100) { score += 4; details.push('dev intensity высокая'); }
            else if (devIntensity > 30) { score += 2; details.push('dev intensity средняя'); }
        }

        return { score: Math.max(0, Math.min(25, score)), detail: details.join('; ') || 'нет данных' };
    }

    function computeTokenomicsHealth(project) {
        const unlockedPct = unwrap(project.unlocks && project.unlocks.unlockedPct, 0);
        const riskLevel = unwrap(project.unlocks && project.unlocks.riskLevel, 'Unknown');
        const nextUnlockDays = unwrap(project.unlocks && project.unlocks.nextUnlockDays, 999);
        const fdvMcap = unwrap(project.tokenomics && project.tokenomics.fdvMcapRatio, 0);

        let score = 0;
        const details = [];

        if (unlockedPct > 0) {
            if (unlockedPct >= 60) { score += 5; details.push(`unlocked=${unlockedPct.toFixed(0)}%`); }
            else if (unlockedPct >= 30) { score += 3; details.push(`unlocked=${unlockedPct.toFixed(0)}%`); }
            else { score += 1; details.push(`unlocked=${unlockedPct.toFixed(0)}% (молодой)`); }
        }

        if (riskLevel === 'Low') { score += 5; details.push('risk=Low'); }
        else if (riskLevel === 'Medium') { score += 3; details.push('risk=Medium'); }
        else if (riskLevel === 'High') { score -= 2; details.push('risk=High'); }

        if (nextUnlockDays < 14) { score -= 5; details.push('unlock <14d!'); }
        else if (nextUnlockDays < 60) { score -= 2; details.push(`unlock in ${nextUnlockDays}d`); }
        else if (nextUnlockDays >= 180) { score += 2; details.push('unlock >180d'); }

        if (fdvMcap > 0 && fdvMcap < 1.5) { score += 3; details.push(`FDV/MCap=${fdvMcap.toFixed(2)}`); }
        else if (fdvMcap >= 5) { score -= 2; details.push(`FDV/MCap=${fdvMcap.toFixed(1)} (dilution)`); }

        return { score: Math.max(0, Math.min(15, score)), detail: details.join('; ') || 'нет данных' };
    }

    function computeEcosystemExpansion(project, history) {
        const tvl = unwrap(project.defi && project.defi.tvl, 0);
        const tvlChange = unwrap(project.defi && project.defi.tvlChange24h, 0);
        const chains = project.chains || [];
        const nodes = unwrap(project.defi && project.defi.nodes, 0);

        let score = 0;
        const details = [];

        if (tvl > 0) {
            if (tvlChange > 5) { score += 5; details.push(`TVL +${tvlChange.toFixed(1)}%/24h`); }
            else if (tvlChange > 0) { score += 3; details.push(`TVL +${tvlChange.toFixed(1)}%/24h`); }
            else if (tvlChange < -5) { score -= 3; details.push(`TVL ${tvlChange.toFixed(1)}%/24h (спад)`); }
            else { score += 1; details.push('TVL стабилен'); }
        }

        if (chains.length >= 5) { score += 4; details.push(`multi-chain (${chains.length})`); }
        else if (chains.length >= 2) { score += 2; details.push(`multi-chain (${chains.length})`); }
        else if (chains.length === 1) { score += 1; details.push('single chain'); }

        if (nodes > 0) {
            if (nodes > 1000) { score += 3; details.push(`nodes=${nodes}`); }
            else if (nodes > 100) { score += 2; details.push(`nodes=${nodes}`); }
        }

        // Рост TVL из истории
        if (Array.isArray(history) && history.length >= 2) {
            const tvlSeries = extractSeries(history, 'tvl');
            if (tvlSeries.length >= 2) {
                const growth = (tvlSeries[tvlSeries.length - 1] - tvlSeries[0]) / Math.max(tvlSeries[0], 1);
                if (growth > 0.2) { score += 3; details.push(`TVL growth +${(growth*100).toFixed(0)}%`); }
            }
        }

        return { score: Math.max(0, Math.min(15, score)), detail: details.join('; ') || 'нет данных' };
    }

    function computeSustainedTrend(project, history) {
        if (!Array.isArray(history) || history.length < 2) {
            return { score: 0, detail: 'нужно ≥2 снимка для оценки тренда' };
        }

        // Анализ последних N точек
        const lookback = Math.min(history.length, 5);
        const recent = history.slice(-lookback);
        let positive = 0;
        let negative = 0;

        for (let i = 1; i < recent.length; i++) {
            const prev = recent[i - 1];
            const cur = recent[i];
            const prevProject = prev.snapshot || prev;
            const curProject = cur.snapshot || cur;

            const prevScore = (prev.scores && prev.scores.payd && prev.scores.payd.value) || 0;
            const curScore = (cur.scores && cur.scores.payd && cur.scores.payd.value) || 0;

            if (curScore > prevScore + 1) positive++;
            else if (curScore < prevScore - 1) negative++;
        }

        const total = positive + negative;
        if (total === 0) return { score: 0, detail: 'недостаточно изменений' };

        const trend = (positive - negative) / total;
        const score = Math.max(0, Math.min(10, Math.round((trend + 1) * 5)));

        return {
            score,
            detail: `${positive}↑ ${negative}↓ из ${total} переходов (${(trend * 100).toFixed(0)}%)`,
        };
    }

    function computeSpeculativeOverheat(project) {
        const change7d = unwrap(project.market && project.market.change7d, 0);
        const change24h = unwrap(project.market && project.market.change24h, 0);
        const vol = unwrap(project.market && project.market.volume24h, 0);
        const mcap = unwrap(project.market && project.market.marketCap, 0);

        // Экстремальный рост без поддержки fundamentals = перегрев
        let penalty = 0;
        const details = [];

        if (change7d > 50 && mcap > 0 && vol / mcap > 0.3) {
            penalty -= 8;
            details.push(`+${change7d.toFixed(0)}% за 7d при turnover ${((vol/mcap)*100).toFixed(0)}%`);
        } else if (change7d > 30) {
            penalty -= 4;
            details.push(`+${change7d.toFixed(0)}% за 7d`);
        }

        if (change24h > 25) {
            penalty -= 4;
            details.push(`+${change24h.toFixed(0)}% за 24h`);
        }

        return { penalty, detail: details.join('; ') || 'без признаков перегрева' };
    }

    function computeEarlyStageBonus(project) {
        const mcap = unwrap(project.market && project.market.marketCap, 0);
        const unlockedPct = unwrap(project.unlocks && project.unlocks.unlockedPct, 0);

        let score = 0;
        const details = [];

        // Early stage = mcap < 100M AND unlocked < 50%
        if (mcap > 0 && mcap < 100_000_000) {
            score += 3;
            details.push('small-cap');
        }
        if (unlockedPct > 0 && unlockedPct < 50) {
            score += 2;
            details.push('token ещё vesting');
        }

        return { score, detail: details.join('; ') || '' };
    }

    // ================== SHARED HELPERS ==================

    function unwrap(field, fallback = 0) {
        if (field === undefined || field === null) return fallback;
        if (typeof field === 'object' && 'value' in field) return field.value;
        return field;
    }

    function extractSeries(history, field) {
        const out = [];
        for (const h of history) {
            const project = h.snapshot || h;
            const val = (project.market && project.market[field])
                     || (project.defi && project.defi[field])
                     || (project.development && project.development[field]);
            if (val === undefined) continue;
            const unwrapped = (typeof val === 'object' && 'value' in val) ? val.value : val;
            if (typeof unwrapped === 'number' && !isNaN(unwrapped)) {
                out.push(unwrapped);
            }
        }
        return out;
    }

    function buildExplanation({ value, growth, underval, tokenomics, ecosystem, trend, overheat, earlyStage, project }) {
        const parts = [];
        const tier = value >= 95 ? 'Exceptional Alpha Opportunity'
                   : value >= 90 ? 'Very High Alpha'
                   : value >= 80 ? 'High Alpha'
                   : value >= 70 ? 'Moderate Alpha'
                   : value >= 60 ? 'Low Alpha'
                   : 'Fully Priced';

        if (value >= 80) {
            parts.push(`Проект получает ${tier}.`);
        } else if (value >= 60) {
            parts.push(`Проект показывает ${tier}.`);
        } else {
            parts.push(`Проект, скорее всего, ${tier}.`);
        }

        // Что способствует Alpha
        if (growth.score >= 18) {
            parts.push('Активная разработка: ' + (growth.detail || 'сильный GitHub-рост') + '.');
        }
        if (underval.score >= 18) {
            parts.push('Соотношение фундаментала к капитализации указывает на потенциальную недооценённость.');
        }
        if (tokenomics.score >= 11) {
            parts.push('Здоровая токеномика с низким unlock-риском.');
        } else if (tokenomics.score <= 4) {
            parts.push('⚠️ Токеномика создаёт давление: ' + (tokenomics.detail || '') + '.');
        }
        if (ecosystem.score >= 11) {
            parts.push('Экосистема расширяется: ' + (ecosystem.detail || '') + '.');
        }
        if (trend.score >= 7) {
            parts.push('Положительный тренд сохраняется на нескольких циклах обновлений.');
        }
        if (overheat.penalty <= -4) {
            parts.push('⚠️ Признаки спекулятивного перегрева: ' + (overheat.detail || '') + '.');
        }
        if (earlyStage.score >= 3) {
            parts.push('Ранняя стадия развития: ' + (earlyStage.detail || '') + '.');
        }

        // Конкретные примеры для high alpha
        if (value >= 80) {
            const name = (project && (project.name || project.ticker)) || 'Проект';
            parts.push(`${name} демонстрирует сильные фундаментальные сигналы, которые рынок, возможно, ещё не полностью отразил в цене.`);
        }

        return parts.join(' ');
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.PaydAlphaEngine = PaydAlphaEngine;

})(window);
