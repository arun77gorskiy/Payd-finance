/* =================================================================
   PAYD Finance — IntelligenceScheduler
   Расписание обновлений данных: Пн / Ср / Пт.
   Использует IntelligenceDatabase для исторических снимков.
   Триггеры:
     - автоматический (по расписанию)
     - ручной (forceUpdate)
     - при загрузке (onLoad)
   ================================================================= */

(function (global) {
    'use strict';

    const DAYS = {
        MONDAY:    1,
        WEDNESDAY: 3,
        FRIDAY:    5,
    };

    const DEFAULT_SCHEDULE_HOURS = [9, 9, 9]; // 09:00 для Пн, Ср, Пт

    const DEFAULT_UPDATE_TYPES = [
        'market',
        'defi',
        'unlocks',
        'github',
    ];

    class IntelligenceScheduler {
        /**
         * @param {Object} config
         * @param {Object} config.store — UnifiedDataStore
         * @param {Object} config.database — IntelligenceDatabase
         * @param {Array<Object>} [config.projects] — список проектов для обновления
         * @param {Array<number>} [config.scheduleHours] — часы запуска для [Пн, Ср, Пт]
         * @param {Array<number>} [config.scheduleDays] — дни недели (1=Пн, 3=Ср, 5=Пт)
         * @param {Array<string>} [config.updateTypes] — какие категории обновлять
         * @param {boolean} [config.autoStart=true] — запустить расписание сразу
         * @param {number} [config.checkIntervalMs=60000] — как часто проверять расписание
         */
        constructor(config = {}) {
            if (!config.store) {
                throw new Error('[IntelligenceScheduler] store is required');
            }
            if (!config.database) {
                throw new Error('[IntelligenceScheduler] database is required');
            }

            this.store = config.store;
            this.database = config.database;
            this.projects = config.projects || [];
            this.scheduleHours = config.scheduleHours || DEFAULT_SCHEDULE_HOURS;
            this.scheduleDays = config.scheduleDays || [DAYS.MONDAY, DAYS.WEDNESDAY, DAYS.FRIDAY];
            this.updateTypes = config.updateTypes || DEFAULT_UPDATE_TYPES;
            this.checkIntervalMs = config.checkIntervalMs || 60000;
            this.autoStart = config.autoStart !== false;

            this._intervalId = null;
            this._isRunning = false;
            this._isUpdating = false;
            this._history = [];
            this._lastCheckAt = null;
            this._lastUpdateAt = null;
            this._nextRunAt = null;
            this._listeners = {
                updateStart: [],
                updateComplete: [],
                updateError: [],
                tick: [],
            };

            this._recomputeNextRun();

            if (this.autoStart) {
                this.start();
            }
        }

        /**
         * Запустить планировщик.
         */
        start() {
            if (this._intervalId) return;
            this._isRunning = true;
            this._intervalId = setInterval(() => this._tick(), this.checkIntervalMs);
            // Первый тик — сразу
            this._tick();
        }

        /**
         * Остановить планировщик.
         */
        stop() {
            if (this._intervalId) {
                clearInterval(this._intervalId);
                this._intervalId = null;
            }
            this._isRunning = false;
        }

        /**
         * Принудительное обновление всех проектов прямо сейчас.
         * @param {Array<string>} [updateTypes] — какие категории обновлять
         * @returns {Promise<Object>} — результат
         */
        async forceUpdate(updateTypes = null) {
            return this._runUpdate({
                trigger: 'manual',
                types: updateTypes || this.updateTypes,
            });
        }

        /**
         * Обновить только конкретный проект.
         * @param {string} projectId
         * @param {Array<string>} [updateTypes]
         */
        async forceUpdateProject(projectId, updateTypes = null) {
            return this._runUpdate({
                trigger: 'manual_project',
                projectIds: [projectId],
                types: updateTypes || this.updateTypes,
            });
        }

        /**
         * Установить список проектов для обновления.
         * @param {Array<Object>} projects
         */
        setProjects(projects) {
            this.projects = Array.isArray(projects) ? projects.slice() : [];
        }

        /**
         * Добавить проект в расписание.
         * @param {Object} projectMeta
         */
        addProject(projectMeta) {
            if (!projectMeta) return;
            const id = projectMeta.coinId || projectMeta.symbol || projectMeta.id;
            if (!id) return;
            const exists = this.projects.find(p =>
                (p.coinId || p.symbol) === id
            );
            if (!exists) {
                this.projects.push(projectMeta);
            }
        }

        /**
         * Удалить проект из расписания.
         * @param {string} projectId
         */
        removeProject(projectId) {
            this.projects = this.projects.filter(p =>
                (p.coinId || p.symbol || p.id) !== projectId
            );
        }

        /**
         * Подписка на события.
         * @param {string} event — 'updateStart' | 'updateComplete' | 'updateError' | 'tick'
         * @param {Function} callback
         */
        on(event, callback) {
            if (this._listeners[event] && typeof callback === 'function') {
                this._listeners[event].push(callback);
            }
        }

        off(event, callback) {
            if (this._listeners[event]) {
                this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
            }
        }

        /**
         * Получить полный статус планировщика.
         */
        getStatus() {
            return {
                isRunning: this._isRunning,
                isUpdating: this._isUpdating,
                schedule: {
                    days: this.scheduleDays.map(d => this._dayName(d)),
                    hours: this.scheduleHours.slice(),
                },
                projectsCount: this.projects.length,
                projects: this.projects.map(p => p.coinId || p.symbol || p.id),
                updateTypes: this.updateTypes.slice(),
                nextRunAt: this._nextRunAt,
                nextRunAtISO: this._nextRunAt ? new Date(this._nextRunAt).toISOString() : null,
                lastCheckAt: this._lastCheckAt,
                lastCheckAtISO: this._lastCheckAt ? new Date(this._lastCheckAt).toISOString() : null,
                lastUpdateAt: this._lastUpdateAt,
                lastUpdateAtISO: this._lastUpdateAt ? new Date(this._lastUpdateAt).toISOString() : null,
                historyCount: this._history.length,
                lastHistory: this._history.slice(-5).map(h => ({
                    at: new Date(h.at).toISOString(),
                    trigger: h.trigger,
                    success: h.success,
                    projectsUpdated: h.projectsUpdated,
                    duration: h.duration,
                })),
            };
        }

        /**
         * Получить историю обновлений.
         * @param {number} [limit=20]
         */
        getHistory(limit = 20) {
            return this._history.slice(-limit).reverse();
        }

        // -------------------- внутренние методы --------------------

        _emit(event, payload) {
            if (!this._listeners[event]) return;
            this._listeners[event].forEach(cb => {
                try {
                    cb(payload);
                } catch (e) {
                    console.error(`[IntelligenceScheduler] listener error (${event}):`, e);
                }
            });
        }

        _dayName(dayNumber) {
            return {
                0: 'Sun', 1: 'Mon', 2: 'Tue', 3: 'Wed',
                4: 'Thu', 5: 'Fri', 6: 'Sat',
            }[dayNumber] || `Day${dayNumber}`;
        }

        _recomputeNextRun() {
            const now = Date.now();
            let next = null;

            // Ищем ближайший запланированный запуск в пределах ближайших 8 дней
            for (let i = 0; i < 8; i++) {
                const candidate = new Date(now);
                candidate.setDate(candidate.getDate() + i);
                candidate.setSeconds(0, 0);

                const dayIndex = candidate.getDay();
                const scheduleDayIndex = this.scheduleDays.indexOf(dayIndex);

                if (scheduleDayIndex === -1) continue;

                const targetHour = this.scheduleHours[scheduleDayIndex] || 9;
                candidate.setHours(targetHour, 0, 0, 0);

                if (candidate.getTime() > now) {
                    next = candidate.getTime();
                    break;
                }
            }

            this._nextRunAt = next;
            return next;
        }

        _tick() {
            this._lastCheckAt = Date.now();
            this._recomputeNextRun();
            this._emit('tick', {
                now: this._lastCheckAt,
                nextRunAt: this._nextRunAt,
            });

            if (!this._nextRunAt) return;
            if (this._isUpdating) return;

            const now = Date.now();
            // Запускаем, если время подошло (с окном ±1 минута)
            if (now >= this._nextRunAt && now < this._nextRunAt + 60 * 1000) {
                this._runUpdate({
                    trigger: 'scheduled',
                    types: this.updateTypes,
                });
            }
        }

        async _runUpdate({ trigger, types, projectIds = null }) {
            if (this._isUpdating) {
                return {
                    success: false,
                    reason: 'already_updating',
                };
            }

            this._isUpdating = true;
            const startedAt = Date.now();
            const historyEntry = {
                at: startedAt,
                trigger,
                types: types.slice(),
                success: false,
                projectsUpdated: 0,
                projectsFailed: 0,
                snapshots: 0,
                error: null,
                duration: 0,
            };

            this._emit('updateStart', { trigger, types, startedAt });

            try {
                const targets = projectIds
                    ? this.projects.filter(p =>
                        projectIds.includes(p.coinId || p.symbol || p.id)
                    )
                    : this.projects;

                if (targets.length === 0) {
                    historyEntry.success = true;
                    historyEntry.error = 'no_projects';
                    return {
                        success: true,
                        updated: 0,
                        message: 'No projects to update',
                    };
                }

                const concurrency = 3;
                const queue = [...targets];
                const results = [];

                const workers = Array.from({ length: concurrency }, async () => {
                    while (queue.length > 0) {
                        const meta = queue.shift();
                        if (!meta) break;
                        try {
                            const project = await this.store.loadProject(meta);
                            const projectId = project.id || meta.coinId || meta.symbol;
                            // Пересчитать все 4 scores с историей
                            const allScores = await this.store.calculateAllScores(project, {
                                history: this.database.getScoreHistory(projectId),
                                runId: `run_${Date.now()}`,
                                trigger,
                                saveToDb: true,
                            });
                            // Сохранить снимок в IntelligenceDatabase
                            const snapshotId = this.database.saveSnapshot(projectId, {
                                ...project,
                                scores: allScores,
                                paidScore: allScores.payd,
                            });
                            results.push({
                                id: projectId,
                                success: true,
                                snapshotId,
                                scores: {
                                    payd: allScores.payd ? allScores.payd.value : null,
                                    conviction: allScores.conviction ? allScores.conviction.value : null,
                                    alpha: allScores.alpha ? allScores.alpha.value : null,
                                },
                            });
                            historyEntry.projectsUpdated++;
                            if (snapshotId) historyEntry.snapshots++;
                        } catch (e) {
                            results.push({
                                id: meta.coinId || meta.symbol,
                                success: false,
                                error: e.message,
                            });
                            historyEntry.projectsFailed++;
                        }
                    }
                });

                await Promise.all(workers);

                historyEntry.success = historyEntry.projectsFailed === 0;
                historyEntry.duration = Date.now() - startedAt;

                this._lastUpdateAt = Date.now();
                this._recomputeNextRun();

                this._emit('updateComplete', {
                    trigger,
                    results,
                    duration: historyEntry.duration,
                });

                return {
                    success: historyEntry.success,
                    updated: historyEntry.projectsUpdated,
                    failed: historyEntry.projectsFailed,
                    duration: historyEntry.duration,
                    results,
                };
            } catch (e) {
                historyEntry.success = false;
                historyEntry.error = e.message;
                historyEntry.duration = Date.now() - startedAt;
                this._emit('updateError', { trigger, error: e.message });
                return {
                    success: false,
                    error: e.message,
                };
            } finally {
                this._isUpdating = false;
                this._history.push(historyEntry);
                // Храним не более 50 последних запусков
                if (this._history.length > 50) {
                    this._history = this._history.slice(-50);
                }
            }
        }

        /**
         * Уничтожить планировщик.
         */
        destroy() {
            this.stop();
            this._listeners = {
                updateStart: [],
                updateComplete: [],
                updateError: [],
                tick: [],
            };
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.IntelligenceScheduler = IntelligenceScheduler;
    global.PAYD_INTEL.SCHEDULE_DAYS = DAYS;

})(window);
