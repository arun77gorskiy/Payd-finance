/* =================================================================
   PAYD Finance — Scoring Engine Registry
   Реестр всех scoring engines.
   Позволяет регистрировать/извлекать движки и считать несколько scores
   параллельно с учётом их полной изоляции.
   ================================================================= */

(function (global) {
    'use strict';

    class ScoringEngineRegistry {
        constructor() {
            this._engines = new Map();
        }

        /**
         * Зарегистрировать движок.
         * @param {BaseEngine} engine
         */
        register(engine) {
            if (!engine || !engine.name) {
                throw new Error('[ScoringEngineRegistry] engine.name is required');
            }
            if (this._engines.has(engine.name)) {
                console.warn(`[ScoringEngineRegistry] engine "${engine.name}" already registered, replacing`);
            }
            this._engines.set(engine.name, engine);
            return this;
        }

        /**
         * Получить движок по имени.
         */
        get(name) {
            return this._engines.get(name);
        }

        /**
         * Список всех зарегистрированных движков.
         */
        list() {
            return Array.from(this._engines.keys());
        }

        /**
         * Проверить, зарегистрирован ли движок.
         */
        has(name) {
            return this._engines.has(name);
        }

        /**
         * Удалить движок.
         */
        unregister(name) {
            return this._engines.delete(name);
        }

        /**
         * Запустить один движок.
         * @param {string} name
         * @param {Object} project
         * @param {Object} [context]
         */
        async runOne(name, project, context = {}) {
            const engine = this._engines.get(name);
            if (!engine) {
                throw new Error(`[ScoringEngineRegistry] engine "${name}" not found`);
            }
            if (!engine.enabled) {
                return {
                    engine: name,
                    value: null,
                    error: 'engine_disabled',
                };
            }
            try {
                const result = engine.calculate(project, context);
                if (DataModel && DataModel.verified) {
                    return DataModel.verified(result, `${name}_engine`, Date.now());
                }
                return result;
            } catch (e) {
                console.error(`[ScoringEngineRegistry] engine "${name}" failed:`, e);
                return {
                    engine: name,
                    value: null,
                    error: e.message,
                    timestamp: Date.now(),
                };
            }
        }

        /**
         * Запустить все движки параллельно. Каждый — независим.
         * @param {Object} project
         * @param {Object} [context]
         * @returns {Object} { payd, conviction, alpha, ... }
         */
        async runAll(project, context = {}) {
            const names = Array.from(this._engines.keys());
            const results = await Promise.all(
                names.map(n => this.runOne(n, project, context))
            );
            const out = {};
            results.forEach((r, i) => {
                out[names[i]] = r;
            });
            return out;
        }
    }

    const DataModel = global.PAYD_INTEL && global.PAYD_INTEL.DataModel;

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.ScoringEngineRegistry = ScoringEngineRegistry;

})(window);
