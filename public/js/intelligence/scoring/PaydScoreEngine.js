/* =================================================================
   PAYD Finance — PaydScoreEngine
   Независимый движок оценки КАЧЕСТВА проекта.
   Диапазон: 0-100.
   Компоненты (по 25 баллов каждый):
     • market       — капитализация, объёмы, динамика
     • development  — GitHub-метрики (commits, devs, stars)
     • defi         — TVL (если применимо)
     • unlocks      — низкий риск разлоков

   НЕ зависит от других engines. Принимает только verified-данные.
   ================================================================= */

(function (global) {
    'use strict';

    const BaseEngine = global.PAYD_INTEL.BaseEngine;

    class PaydScoreEngine extends BaseEngine {
        constructor(config = {}) {
            super(config);
            this.name = 'payd';
            this.label = 'Payd Score';
            this.description = 'Quality';
            this.range = [0, 100];
            this.weights = Object.assign({
                market: 0.25,
                development: 0.25,
                defi: 0.25,
                unlocks: 0.25,
            }, config.weights || {});
        }

        calculate(project, context = {}) {
            const factors = [];
            const sources = new Set();
            const breakdown = {};

            // ---- MARKET (до 25) ----
            const mcap = this.unwrap(project.market && project.market.marketCap, 0);
            const vol = this.unwrap(project.market && project.market.volume24h, 0);
            const change7d = this.unwrap(project.market && project.market.change7d, 0);
            const price = this.unwrap(project.market && project.market.price, 0);

            if (project.market && project.market.marketCap && project.market.marketCap.source) {
                sources.add(project.market.marketCap.source);
            }

            let market = 0;
            if (mcap > 0) market += Math.min(15, Math.log10(mcap + 1) * 3);
            if (vol > 0 && mcap > 0) {
                const turnover = vol / mcap;
                market += Math.min(5, turnover * 50);
            }
            if (change7d > 0) market += Math.min(5, change7d / 5);
            else if (change7d < -10) market -= 3;

            market = Math.max(0, Math.min(25, market));
            breakdown.market = round(market, 1);
            factors.push(factor('Market', market, 25, market - 12.5,
                `MC=$${formatNum(mcap)}, Vol=$${formatNum(vol)}, 7d=${change7d.toFixed(2)}%`));

            // ---- DEVELOPMENT (до 25) ----
            const commits = this.unwrap(project.development && project.development.commits, 0);
            const activeDevs = this.unwrap(project.development && project.development.activeDevelopers, 0);
            const stars = this.unwrap(project.development && project.development.stars, 0);
            const releases = this.unwrap(project.development && project.development.releases, 0);
            const contributors = this.unwrap(project.development && project.development.contributors, 0);

            if (project.development && project.development.commits && project.development.commits.source) {
                sources.add(project.development.commits.source);
            }

            let development = 0;
            if (commits > 0)        development += Math.min(8,  Math.log10(commits + 1) * 2.5);
            if (activeDevs > 0)     development += Math.min(7,  Math.log10(activeDevs + 1) * 4);
            if (stars > 0)          development += Math.min(5,  Math.log10(stars + 1) * 2);
            if (releases > 0)       development += Math.min(3,  Math.log10(releases + 1) * 1.5);
            if (contributors > 0)   development += Math.min(2,  Math.log10(contributors + 1) * 1.0);
            development = Math.max(0, Math.min(25, development));

            breakdown.development = round(development, 1);
            factors.push(factor('Development', development, 25, development - 12.5,
                `Commits=${commits}, Devs=${activeDevs}, Stars=${stars}`));

            // ---- DEFI (до 25) ----
            const tvl = this.unwrap(project.defi && project.defi.tvl, 0);
            const tvlChange = this.unwrap(project.defi && project.defi.tvlChange24h, 0);

            if (project.defi && project.defi.tvl && project.defi.tvl.source) {
                sources.add(project.defi.tvl.source);
            }

            let defi = 0;
            if (tvl > 0) defi = Math.min(20, Math.log10(tvl + 1) * 4.5);
            if (tvlChange > 0) defi += Math.min(5, tvlChange / 5);
            defi = Math.max(0, Math.min(25, defi));

            breakdown.defi = round(defi, 1);
            factors.push(factor('DeFi', defi, 25, defi - 12.5,
                tvl > 0 ? `TVL=$${formatNum(tvl)}, 24h=${tvlChange.toFixed(2)}%` : 'No TVL data'));

            // ---- UNLOCKS (до 25; меньший риск = выше оценка) ----
            const unlockedPct = this.unwrap(project.unlocks && project.unlocks.unlockedPct, 0);
            const riskLevel = this.unwrap(project.unlocks && project.unlocks.riskLevel, 'Unknown');
            const nextUnlockDays = this.unwrap(project.unlocks && project.unlocks.nextUnlockDays, 999);

            if (project.unlocks && project.unlocks.unlockedPct && project.unlocks.unlockedPct.source) {
                sources.add(project.unlocks.unlockedPct.source);
            }

            let unlocks = 0;
            if (unlockedPct > 0) unlocks = Math.min(15, unlockedPct / 100 * 15);
            if (riskLevel === 'Low') unlocks += 10;
            else if (riskLevel === 'Medium') unlocks += 5;
            else if (riskLevel === 'High') unlocks += 0;
            if (nextUnlockDays < 30) unlocks -= 3;
            unlocks = Math.max(0, Math.min(25, unlocks));

            breakdown.unlocks = round(unlocks, 1);
            factors.push(factor('Unlocks', unlocks, 25, unlocks - 12.5,
                `Unlocked=${unlockedPct.toFixed(1)}%, Risk=${riskLevel}, Next=${nextUnlockDays}d`));

            // ---- ИТОГО ----
            const total = Math.round(market + development + defi + unlocks);
            const value = Math.max(0, Math.min(100, total));

            // ---- CONFIDENCE ----
            const filledFields = [
                mcap > 0, vol > 0, commits > 0, activeDevs > 0,
                tvl > 0, unlockedPct > 0, price > 0
            ].filter(Boolean).length;
            const confidenceScore = Math.round((filledFields / 7) * 100);
            const confidence = confidenceScore >= 80 ? 'high'
                             : confidenceScore >= 50 ? 'medium' : 'low';

            // ---- EXPLANATION ----
            const explanation = buildExplanation({
                value, market, development, defi, unlocks,
                mcap, tvl, commits, riskLevel
            });

            return this.buildResult({
                value,
                breakdown,
                factors,
                explanation,
                confidence,
                confidenceScore,
                sources: Array.from(sources),
            });
        }
    }

    // ---------- helpers ----------

    function factor(name, value, max, delta, detail) {
        return {
            name,
            value: round(value, 1),
            max,
            delta: round(delta, 1),
            direction: delta > 0.5 ? 'positive' : delta < -0.5 ? 'negative' : 'neutral',
            detail,
        };
    }

    function round(n, p = 2) {
        return Math.round(n * Math.pow(10, p)) / Math.pow(10, p);
    }

    function formatNum(n) {
        if (!n || n === 0) return '0';
        if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
        if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
        return n.toFixed(2);
    }

    function buildExplanation({ value, market, development, defi, unlocks, mcap, tvl, commits, riskLevel }) {
        const parts = [];
        if (value >= 80) parts.push('Fundamentals look strong.');
        else if (value >= 60) parts.push('Fundamentals are solid.');
        else if (value >= 40) parts.push('Fundamentals are mixed.');
        else parts.push('Fundamentals are weak.');

        if (market >= 18) parts.push(`Market cap ($${formatNum(mcap)}) indicates strong market presence.`);
        else if (market >= 10) parts.push(`Market cap ($${formatNum(mcap)}) is moderate.`);
        else if (market > 0) parts.push(`Market cap is small ($${formatNum(mcap)}).`);

        if (development >= 18) parts.push(`Development activity is high (${commits} commits).`);
        else if (development >= 10) parts.push(`Development activity is moderate.`);
        else if (development > 0) parts.push(`Development activity is limited.`);

        if (tvl > 0 && defi >= 10) parts.push(`DeFi presence is meaningful (TVL $${formatNum(tvl)}).`);

        if (riskLevel === 'Low') parts.push('Token unlock risk is low.');
        else if (riskLevel === 'High') parts.push('Token unlock risk is elevated.');

        return parts.join(' ');
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.PaydScoreEngine = PaydScoreEngine;

})(window);
