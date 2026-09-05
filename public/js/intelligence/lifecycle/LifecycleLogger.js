/* =================================================================
   PAYD Intelligence — LifecycleLogger
   Append-only логгер событий жизненного цикла проектов.
   Записывает: замены, повышения, понижения, добавления, удаления.
   В браузере — localStorage. В production — будет заменён на
   backend через тот же интерфейс.
   ================================================================= */

(function (global) {
    'use strict';

    const STORAGE_KEY = 'payd_intel_lifecycle_log';
    const MAX_INMEM_ENTRIES = 5000;

    class LifecycleLogger {
        constructor(config = {}) {
            this.storageKey = config.storageKey || STORAGE_KEY;
            this.persistent = config.persistent !== false;
            this._events = [];
            this._loadFromStorage();
        }

        _loadFromStorage() {
            if (!this.persistent) return;
            try {
                const raw = localStorage.getItem(this.storageKey);
                if (raw) {
                    const parsed = JSON.parse(raw);
                    if (Array.isArray(parsed)) {
                        this._events = parsed;
                    }
                }
            } catch (e) {
                // повреждённый лог — игнорируем
            }
        }

        _saveToStorage() {
            if (!this.persistent) return;
            try {
                // Сохраняем максимум последних MAX_INMEM_ENTRIES событий
                const toStore = this._events.slice(-MAX_INMEM_ENTRIES);
                localStorage.setItem(this.storageKey, JSON.stringify(toStore));
            } catch (e) {
                // localStorage переполнен или недоступен — игнорируем
            }
        }

        /**
         * Залогировать событие.
         * @param {Object} event
         *   { type, projectId, sector, reason, metadata, cycleId }
         *   type: 'replaced' | 'promoted' | 'demoted' | 'added' | 'archived' | 'verified' | 'invalidated'
         */
        log(event) {
            if (!event || !event.type) return;
            const entry = {
                id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                timestamp: new Date().toISOString(),
                ...event,
            };
            this._events.push(entry);
            this._saveToStorage();
            return entry;
        }

        /**
         * Получить события с фильтрацией.
         */
        getEvents(filter = {}) {
            let result = this._events.slice();
            if (filter.type) {
                result = result.filter(e => e.type === filter.type);
            }
            if (filter.projectId) {
                result = result.filter(e => e.projectId === filter.projectId);
            }
            if (filter.sector) {
                result = result.filter(e => e.sector === filter.sector);
            }
            if (filter.cycleId) {
                result = result.filter(e => e.cycleId === filter.cycleId);
            }
            if (filter.sinceTimestamp) {
                result = result.filter(e => e.timestamp >= filter.sinceTimestamp);
            }
            return result;
        }

        /**
         * Получить статистику.
         */
        getStats() {
            const byType = {};
            for (const e of this._events) {
                byType[e.type] = (byType[e.type] || 0) + 1;
            }
            return {
                total: this._events.length,
                byType,
                firstEvent: this._events.length > 0 ? this._events[0].timestamp : null,
                lastEvent: this._events.length > 0 ? this._events[this._events.length - 1].timestamp : null,
            };
        }

        /**
         * Экспортировать все события (для отправки на backend).
         */
        export() {
            return {
                version: 1,
                exportedAt: new Date().toISOString(),
                events: this._events.slice(),
            };
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.LifecycleLogger = LifecycleLogger;

})(window);
