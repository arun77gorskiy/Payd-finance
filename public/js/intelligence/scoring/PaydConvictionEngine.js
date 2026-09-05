/* =================================================================
   PAYD Finance — PaydConvictionEngine
   Независимый движок оценки УВЕРЕННОСТИ в анализе.
   Диапазон: 0-100.
   Факторы:
     • Покрытие данных (сколько ключевых полей заполнено)
     • Количество независимых verified-источников
     • Согласованность confidence-уровней по полям
     • Согласованность исторических трендов (если доступна)
     • Качество самих confidence-уровней
   ================================================================= */

(function (global) {
    'use strict';

    const BaseEngine = global.PAYD_INTEL.BaseEngine;

    // Ключевые поля, которые мы ожидаем увидеть у каждого проекта
    const KEY_FIELDS = {
        market: ['price', 'marketCap', 'volume24h', 'change24h', 'change7d'],
        development: ['commits', 'activeDevelopers', 'stars', 'releases', 'contributors'],
        defi: ['tvl'],
        unlocks: ['unlockedPct', 'riskLevel', 'nextUnlockDays'],
    };

    class PaydConvictionEngine extends BaseEngine {
        constructor(config = {}) {
            super(config);
            this.name = 'conviction';
            this.label = 'Payd Conviction Score';
            this.description = 'Confidence in analysis';
            this.range = [0, 100];
        }

        calculate(project, context = {}) {
            const breakdown = {};
            const factors = [];
            const allSources = new Set();

            // 1. DATA COVERAGE (40 баллов)
            const coverage = computeCoverage(project);
            breakdown.coverage = coverage.score;
            factors.push({
                name: 'Data Coverage',
                value: coverage.score,
                max: 40,
                delta: coverage.score - 20,
                direction: coverage.score >= 25 ? 'positive' : coverage.score >= 15 ? 'neutral' : 'negative',
                detail: `${coverage.filled}/${coverage.total} ключевых полей заполнено`,
            });

            // 2. SOURCE DIVERSITY (20 баллов) — сколько разных verified-источников
            const sources = collectSources(project);
            const sourceScore = Math.min(20, sources.size * 4);
            breakdown.sourceDiversity = sourceScore;
            factors.push({
                name: 'Source Diversity',
                value: sourceScore,
                max: 20,
                delta: sourceScore - 10,
                direction: sourceScore >= 14 ? 'positive' : sourceScore >= 8 ? 'neutral' : 'negative',
                detail: `${sources.size} verified-источников: ${Array.from(sources).join(', ')}`,
            });

            // 3. CONFIDENCE QUALITY (25 баллов) — среднее confidence-уровней полей
            const confQuality = computeConfidenceQuality(project);
            breakdown.confidenceQuality = confQuality.score;
            factors.push({
                name: 'Confidence Quality',
                value: confQuality.score,
                max: 25,
                delta: confQuality.score - 12.5,
                direction: confQuality.score >= 18 ? 'positive' : confQuality.score >= 10 ? 'neutral' : 'negative',
                detail: `High: ${confQuality.high}, Medium: ${confQuality.medium}, Low: ${confQuality.low}`,
            });

            // 4. HISTORICAL CONSISTENCY (15 баллов) — если есть история
            const histConsistency = computeHistoricalConsistency(project, context);
            breakdown.historicalConsistency = histConsistency.score;
            factors.push({
                name: 'Historical Consistency',
                value: histConsistency.score,
                max: 15,
                delta: histConsistency.score - 7.5,
                direction: histConsistency.score >= 11 ? 'positive' : histConsistency.score >= 5 ? 'neutral' : 'negative',
                detail: histConsistency.detail,
            });

            // ---- ИТОГО ----
            const total = coverage.score + sourceScore + confQuality.score + histConsistency.score;
            const value = Math.max(0, Math.min(100, Math.round(total)));

            // ---- CONFIDENCE ----
            // Conviction score сам по себе — confidence.
            const confidence = value >= 80 ? 'high' : value >= 50 ? 'medium' : 'low';
            const confidenceScore = value;

            const explanation = buildExplanation({ value, coverage, sources, confQuality, histConsistency });

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

    // ---------------- helpers ----------------

    function computeCoverage(project) {
        let filled = 0;
        let total = 0;
        for (const section in KEY_FIELDS) {
            const block = project[section] || {};
            for (const f of KEY_FIELDS[section]) {
                total++;
                const val = block[f];
                if (val === undefined || val === null) continue;
                if (typeof val === 'object' && 'value' in val) {
                    if (val.value !== null && val.value !== undefined) filled++;
                } else if (val !== null && val !== undefined) {
                    filled++;
                }
            }
        }
        const score = total === 0 ? 0 : Math.round((filled / total) * 40);
        return { score, filled, total };
    }

    function collectSources(project) {
        const sources = new Set();
        for (const section in KEY_FIELDS) {
            const block = project[section] || {};
            for (const f of KEY_FIELDS[section]) {
                const val = block[f];
                if (val && typeof val === 'object' && val.source) {
                    sources.add(val.source);
                }
            }
        }
        return sources;
    }

    function computeConfidenceQuality(project) {
        let high = 0, medium = 0, low = 0;
        for (const section in KEY_FIELDS) {
            const block = project[section] || {};
            for (const f of KEY_FIELDS[section]) {
                const val = block[f];
                if (val && typeof val === 'object' && 'confidence' in val) {
                    if (val.confidence === 'high') high++;
                    else if (val.confidence === 'medium') medium++;
                    else if (val.confidence === 'low') low++;
                }
            }
        }
        const total = high + medium + low;
        if (total === 0) return { score: 0, high, medium, low };
        // Weighted score: high=1, medium=0.5, low=0
        const weighted = (high * 1 + medium * 0.5 + low * 0) / total;
        return { score: Math.round(weighted * 25), high, medium, low };
    }

    function computeHistoricalConsistency(project, context) {
        const history = context.history || (project._history) || null;
        if (!history || !Array.isArray(history) || history.length < 2) {
            return {
                score: 0,
                detail: 'Недостаточно исторических данных (нужно ≥2 снимка)',
            };
        }
        // Согласованность = насколько стабильны значения между снимками
        // Берём дельты по marketCap и TVL
        let consistency = 0;
        let samples = 0;
        const fields = ['marketCap', 'tvl', 'commits', 'activeDevelopers'];
        for (const f of fields) {
            const series = extractSeries(history, f);
            if (series.length < 2) continue;
            const cv = coefficientOfVariation(series);
            if (cv !== null) {
                // Меньше variation -> выше consistency
                const cons = Math.max(0, 1 - cv);
                consistency += cons;
                samples++;
            }
        }
        if (samples === 0) {
            return { score: 0, detail: 'Нет полей для анализа согласованности' };
        }
        const avg = consistency / samples;
        return {
            score: Math.round(avg * 15),
            detail: `Согласованность по ${samples} полям: ${(avg * 100).toFixed(0)}%`,
        };
    }

    function extractSeries(history, field) {
        // Поддержка двух форматов: history = [{snapshot: project, scores:{payd:..}}]
        // или history = [projectModel, ...]
        const out = [];
        for (const h of history) {
            const project = h.snapshot || h;
            // Сначала ищем в market/defi
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

    function coefficientOfVariation(values) {
        if (values.length < 2) return null;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        if (mean === 0) return null;
        const variance = values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length;
        const std = Math.sqrt(variance);
        return std / Math.abs(mean);
    }

    function buildExplanation({ value, coverage, sources, confQuality, histConsistency }) {
        const parts = [];
        if (value >= 80) parts.push('Высокая уверенность: данные надёжны.');
        else if (value >= 60) parts.push('Умеренная уверенность: данных достаточно.');
        else if (value >= 40) parts.push('Уверенность ограничена.');
        else parts.push('Уверенность низкая: данных недостаточно.');

        parts.push(`Покрытие ${coverage.filled}/${coverage.total} полей.`);
        if (sources.size > 0) {
            parts.push(`${sources.size} независимых verified-источников.`);
        }
        if (confQuality.high > 0) {
            parts.push(`${confQuality.high} полей с высокой степенью уверенности.`);
        }
        if (histConsistency.score > 0) {
            parts.push(`Историческая согласованность: ${histConsistency.detail}.`);
        }
        return parts.join(' ');
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.PaydConvictionEngine = PaydConvictionEngine;

})(window);
