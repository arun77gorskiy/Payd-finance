/* =================================================================
   PAYD Intelligence — BaseAnalysisEngine
   Базовый класс для всех AI analysis engines.
   Гарантирует:
     - Работа только с verified data
     - Запрет на выдумывание цифр (verified fields only)
     - Сохранение результата в score_history
     - Стандартный интерфейс runForAll, runForProject
   ================================================================= */

(function (global) {
    'use strict';

    class BaseAnalysisEngine {
        constructor(config = {}) {
            this.name = config.name || 'BaseEngine';
            this.version = config.version || '1.0.0';
            this.historyStore = config.historyStore || null;
            this._cache = new Map();
        }

        /**
         * Запустить анализ для всех проектов.
         * @param {Object} [opts]
         * @param {string} [opts.cycleId]
         * @returns {Promise<{success, projectsScored}>}
         */
        async runForAll(opts = {}) {
            const aggregator = opts.aggregator;
            if (!aggregator) {
                return { success: false, error: 'no_aggregator' };
            }
            const allData = aggregator.getAllData();
            const projects = Object.keys(allData);
            let scored = 0;
            for (const projectId of projects) {
                const snapshot = allData[projectId];
                try {
                    const result = this._analyzeSnapshot(snapshot, opts);
                    if (result) {
                        scored++;
                        this._saveToHistory(projectId, result, opts.cycleId);
                    }
                } catch (e) {
                    console.error(`[${this.name}] failed for ${projectId}:`, e);
                }
            }
            return { success: true, projectsScored: scored };
        }

        /**
         * Запустить анализ для одного проекта.
         */
        async runForProject(projectId, snapshot, opts = {}) {
            const result = this._analyzeSnapshot(snapshot, opts);
            if (result) {
                this._saveToHistory(projectId, result, opts.cycleId);
            }
            return result;
        }

        /**
         * Анализ одного снимка. Переопределяется в наследниках.
         */
        _analyzeSnapshot(snapshot, opts) {
            throw new Error(`${this.name}._analyzeSnapshot must be implemented`);
        }

        /**
         * Безопасное чтение числового поля.
         * Возвращает null если значение невалидно.
         * КРИТИЧНО: используется во всех engines для предотвращения
         * выдумывания цифр.
         */
        _readNumber(obj, field) {
            if (!obj) return null;
            const v = obj[field];
            if (v === null || v === undefined) return null;
            if (typeof v !== 'number') return null;
            if (isNaN(v) || !isFinite(v)) return null;
            return v;
        }

        _readObject(obj, field) {
            if (!obj) return null;
            return obj[field] || null;
        }

        _saveToHistory(projectId, result, cycleId) {
            if (!this.historyStore) return;
            this.historyStore.appendScore({
                projectId,
                engineName: this.name,
                engineVersion: this.version,
                cycleId,
                score: result.score,
                components: result.components,
                metadata: result.metadata,
            });
            this._cache.set(projectId, result);
        }

        getCached(projectId) {
            return this._cache.get(projectId) || null;
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.BaseAnalysisEngine = BaseAnalysisEngine;

})(window);
