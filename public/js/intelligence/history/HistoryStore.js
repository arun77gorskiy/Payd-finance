/* =================================================================
   PAYD Intelligence — HistoryStore
   Append-only хранилище истории обновлений Intelligence.
   В браузере использует localStorage с разделением по типам записей.
   В production будет заменён на backend через тот же интерфейс.

   Хранит:
     - scoreHistory     : { projectId, engineName, engineVersion, cycleId, score, components, metadata, timestamp }
     - marketHistory    : { projectId, snapshot, cycleId, timestamp }
     - labelEvents      : { projectId, from, to, direction, cycleId, timestamp }
     - reports          : { reportType, cycleId, generatedAt, payload }
     - cycleHistory     : { cycleId, startedAt, completedAt, trigger, steps, timestamp }

   Принципы:
     - Только INSERT, никаких UPDATE/DELETE
     - Каждая запись имеет timestamp, cycleId, version
     - Экспорт в JSON для последующей загрузки на backend
   ================================================================= */

(function (global) {
    'use strict';

    const STORAGE_KEYS = {
        scoreHistory: 'payd_history_scores',
        marketHistory: 'payd_history_market',
        labelEvents: 'payd_history_labels',
        reports: 'payd_history_reports',
        cycleHistory: 'payd_history_cycles',
    };

    const MAX_ENTRIES_PER_TYPE = 10000; // лимит в localStorage

    class HistoryStore {
        constructor(config = {}) {
            this.persistent = config.persistent !== false;
            this.maxEntries = config.maxEntries || MAX_ENTRIES_PER_TYPE;
            this.version = config.version || '1.0.0';
            this._init();
        }

        _init() {
            this._data = {};
            for (const [type, key] of Object.entries(STORAGE_KEYS)) {
                this._data[type] = this._load(key);
            }
        }

        _load(key) {
            if (!this.persistent) return [];
            try {
                const raw = localStorage.getItem(key);
                if (!raw) return [];
                const parsed = JSON.parse(raw);
                return Array.isArray(parsed) ? parsed : [];
            } catch (e) {
                return [];
            }
        }

        _save(type) {
            if (!this.persistent) return;
            try {
                const key = STORAGE_KEYS[type];
                if (!key) return;
                const arr = this._data[type] || [];
                const toStore = arr.slice(-this.maxEntries);
                localStorage.setItem(key, JSON.stringify(toStore));
            } catch (e) {
                console.warn(`[HistoryStore] failed to save ${type}:`, e.message);
            }
        }

        _append(type, entry) {
            if (!this._data[type]) this._data[type] = [];
            const record = {
                ...entry,
                timestamp: entry.timestamp || new Date().toISOString(),
                schemaVersion: this.version,
                id: `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            };
            this._data[type].push(record);
            this._save(type);
            return record;
        }

        // -------------------- Публичные API --------------------

        /**
         * Добавить запись в историю scores.
         */
        appendScore(entry) {
            return this._append('scoreHistory', entry);
        }

        /**
         * Добавить запись в market history.
         */
        appendMarketSnapshot(entry) {
            return this._append('marketHistory', entry);
        }

        /**
         * Добавить запись о ranking event (promotion/demotion).
         */
        appendLabelEvent(entry) {
            return this._append('labelEvents', entry);
        }

        /**
         * Добавить сгенерированный отчёт.
         */
        appendReport(entry) {
            return this._append('reports', entry);
        }

        /**
         * Добавить запись о завершённом цикле обновления.
         */
        appendCycle(entry) {
            return this._append('cycleHistory', entry);
        }

        // -------------------- Чтение --------------------

        getScoreHistory(filter = {}) {
            return this._filter(this._data.scoreHistory || [], filter);
        }

        getMarketHistory(filter = {}) {
            return this._filter(this._data.marketHistory || [], filter);
        }

        getLabelEvents(filter = {}) {
            return this._filter(this._data.labelEvents || [], filter);
        }

        getReports(filter = {}) {
            return this._filter(this._data.reports || [], filter);
        }

        getCycleHistory(filter = {}) {
            return this._filter(this._data.cycleHistory || [], filter);
        }

        getLatestCycle() {
            const cycles = this._data.cycleHistory || [];
            return cycles.length > 0 ? cycles[cycles.length - 1] : null;
        }

        getLatestReport(reportType) {
            const reports = (this._data.reports || []).filter(r => r.reportType === reportType);
            return reports.length > 0 ? reports[reports.length - 1] : null;
        }

        // -------------------- Аналитика --------------------

        /**
         * Получить историю score для конкретного проекта.
         * Возвращает массив { timestamp, score, engine }.
         */
        getProjectScoreTimeline(projectId, engineName = null) {
            const all = (this._data.scoreHistory || [])
                .filter(s => s.projectId === projectId)
                .filter(s => !engineName || s.engineName === engineName)
                .sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));
            return all;
        }

        /**
         * Получить последний score проекта по engine.
         */
        getLatestScore(projectId, engineName) {
            const all = (this._data.scoreHistory || [])
                .filter(s => s.projectId === projectId && s.engineName === engineName)
                .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
            return all.length > 0 ? all[0] : null;
        }

        // -------------------- Утилиты --------------------

        _filter(records, filter) {
            let result = records;
            if (filter.projectId) {
                result = result.filter(r => r.projectId === filter.projectId);
            }
            if (filter.cycleId) {
                result = result.filter(r => r.cycleId === filter.cycleId);
            }
            if (filter.engineName) {
                result = result.filter(r => r.engineName === filter.engineName);
            }
            if (filter.reportType) {
                result = result.filter(r => r.reportType === filter.reportType);
            }
            if (filter.sinceTimestamp) {
                result = result.filter(r => (r.timestamp || '') >= filter.sinceTimestamp);
            }
            if (filter.limit) {
                result = result.slice(-filter.limit);
            }
            return result;
        }

        /**
         * Экспортировать всю историю в один JSON.
         * Используется для отправки на backend.
         */
        exportAll() {
            return {
                version: this.version,
                exportedAt: new Date().toISOString(),
                scoreHistory: (this._data.scoreHistory || []).slice(),
                marketHistory: (this._data.marketHistory || []).slice(),
                labelEvents: (this._data.labelEvents || []).slice(),
                reports: (this._data.reports || []).slice(),
                cycleHistory: (this._data.cycleHistory || []).slice(),
            };
        }

        /**
         * Получить сводную статистику.
         */
        getStats() {
            return {
                scoreHistory: (this._data.scoreHistory || []).length,
                marketHistory: (this._data.marketHistory || []).length,
                labelEvents: (this._data.labelEvents || []).length,
                reports: (this._data.reports || []).length,
                cycleHistory: (this._data.cycleHistory || []).length,
                latestCycle: this.getLatestCycle(),
            };
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.HistoryStore = HistoryStore;

})(window);
