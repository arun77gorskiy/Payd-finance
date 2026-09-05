/* =================================================================
   PAYD Finance — Base Scoring Engine
   Базовый класс для всех scoring engines.
   Контракт:
     - engine.name        : string  ('payd' | 'conviction' | 'alpha' | ...)
     - engine.range       : [min, max]
     - engine.calculate(project, history) -> ScoreResult

   ScoreResult:
     {
       value:        number,         // итоговое значение
       range:        [min, max],     // диапазон
       classification: { tier, label, color },
       breakdown:    { ... },        // детали по компонентам
       factors:      [{ name, delta, weight, direction }],
       explanation:  string,         // человекочитаемое объяснение
       confidence:   'high' | 'medium' | 'low',
       confidenceScore: 0-100,
       sources:      string[],       // какие verified-источники использовались
       timestamp:    number
     }
   ================================================================= */

(function (global) {
    'use strict';

    const DataModel = global.PAYD_INTEL && global.PAYD_INTEL.DataModel;

    class BaseEngine {
        constructor(config = {}) {
            this.name = 'base';
            this.range = [0, 100];
            this.weight = config.weight || 1.0;
            this.enabled = config.enabled !== false;
        }

        /**
         * Главный метод. Должен быть переопределён в наследниках.
         * @param {Object} project — ProjectModel с verified-значениями
         * @param {Object} [context] — { history, snapshot, database }
         * @returns {Object} ScoreResult
         */
        calculate(project, context = {}) {
            throw new Error(`[${this.name}] calculate() must be implemented`);
        }

        // -------------------- helpers --------------------

        /**
         * Безопасно извлечь значение из verified-обёртки.
         */
        v(value, fallback = null) {
            if (value === undefined || value === null) return fallback;
            if (typeof value === 'object' && 'value' in value) return value.value;
            return value;
        }

        unwrap(field, fallback = 0) {
            if (field === undefined || field === null) return fallback;
            if (typeof field === 'object' && 'value' in field) return field.value;
            return field;
        }

        /**
         * Confidence значение verified-обёртки.
         */
        confidenceOf(field) {
            if (field && typeof field === 'object' && 'confidence' in field) {
                return field.confidence;
            }
            return 'unknown';
        }

        /**
         * Вспомогательная утилита — вычислить дельту между двумя точками (%).
         */
        pctDelta(current, previous) {
            if (!previous || previous === 0) return null;
            if (!current) return null;
            return ((current - previous) / Math.abs(previous)) * 100;
        }

        /**
         * Сформировать структуру ScoreResult.
         */
        buildResult({
            value,
            range = this.range,
            breakdown = {},
            factors = [],
            explanation = '',
            confidence = 'medium',
            confidenceScore = 50,
            sources = [],
        }) {
            return {
                engine: this.name,
                value: Math.max(range[0], Math.min(range[1], value)),
                range,
                classification: this.classify(value, range),
                breakdown,
                factors,
                explanation,
                confidence,
                confidenceScore: Math.max(0, Math.min(100, confidenceScore)),
                sources,
                timestamp: Date.now(),
            };
        }

        /**
         * Классификация по порогам.
         * Наследники могут переопределить.
         */
        classify(value, range = this.range) {
            const [min, max] = range;
            const span = max - min;
            const v = ((value - min) / span) * 100;

            if (v >= 90) return { tier: 'exceptional', label: 'Exceptional', color: '#D4AF37' };
            if (v >= 80) return { tier: 'very_high',    label: 'Very High',   color: '#22c55e' };
            if (v >= 70) return { tier: 'high',         label: 'High',        color: '#84cc16' };
            if (v >= 60) return { tier: 'moderate',     label: 'Moderate',    color: '#eab308' };
            if (v >= 50) return { tier: 'low',          label: 'Low',         color: '#f97316' };
            return                  { tier: 'weak',        label: 'Weak',        color: '#ef4444' };
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.BaseEngine = BaseEngine;

})(window);
