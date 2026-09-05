/* =================================================================
   PAYD Intelligence — IScheduler
   Абстрактный интерфейс планировщика.
   Платформонезависимый: может быть реализован поверх server cron,
   Linux cron, Node.js scheduler (node-cron), cloud scheduler или
   встроенного браузерного таймера.

   Контракт:
     - registerJob(spec)  : spec = { id, name, cron, timezone?, payload }
     - listJobs()         : Array<JobState>
     - getJob(id)         : JobState | null
     - triggerNow(id)     : Promise<RunResult>
     - cancel(id)         : boolean
     - pause(id)          : boolean
     - resume(id)         : boolean
     - on(event, cb)      : 'runStart' | 'runComplete' | 'runError' | 'tick'
     - start()            : void  (запустить внутренний цикл, если есть)
     - stop()             : void

   JobState:
     {
       id, name, cron, timezone, status: 'idle'|'running'|'paused'|'disabled',
       lastRunAt, lastRunAtISO, nextRunAt, nextRunAtISO,
       lastResult: { success, duration, error? }
     }
   ================================================================= */

(function (global) {
    'use strict';

    const REQUIRED_METHODS = [
        'registerJob', 'listJobs', 'getJob',
        'triggerNow', 'cancel', 'pause', 'resume',
        'on', 'start', 'stop',
    ];

    function isIScheduler(obj) {
        if (!obj || typeof obj !== 'object') return false;
        for (const m of REQUIRED_METHODS) {
            if (typeof obj[m] !== 'function') return false;
        }
        return true;
    }

    /**
     * Утилита: вычислить следующий запуск cron-выражения.
     * Поддерживает только простой формат:
     *   "minute hour dayOfMonth month dayOfWeek"
     * где каждое поле — число, список (1,3,5), диапазон (1-5) или "*".
     * Этого достаточно для Пн/Ср/Пт расписания.
     */
    function nextRunFromCron(cronExpr, fromMs = Date.now()) {
        if (!cronExpr || typeof cronExpr !== 'string') return null;
        const parts = cronExpr.trim().split(/\s+/);
        if (parts.length !== 5) return null;
        const [minF, hourF, domF, monF, dowF] = parts;
        const now = new Date(fromMs);
        // Ищем в пределах 14 дней вперёд
        for (let i = 0; i < 14 * 24 * 60; i++) {
            const candidate = new Date(now.getTime() + i * 60 * 1000);
            if (!matchField(minF, candidate.getMinutes())) continue;
            if (!matchField(hourF, candidate.getHours())) continue;
            if (!matchField(domF, candidate.getDate())) continue;
            if (!matchField(monF, candidate.getMonth() + 1)) continue;
            if (!matchField(dowF, candidate.getDay())) continue;
            return candidate.getTime();
        }
        return null;
    }

    function matchField(field, value) {
        if (field === '*') return true;
        // список через запятую
        if (field.indexOf(',') !== -1) {
            return field.split(',').some(p => matchField(p.trim(), value));
        }
        // диапазон
        if (field.indexOf('-') !== -1) {
            const [a, b] = field.split('-').map(n => parseInt(n, 10));
            return value >= a && value <= b;
        }
        // шаг */N
        if (field.indexOf('/') !== -1) {
            const [base, step] = field.split('/');
            const stepN = parseInt(step, 10);
            if (base === '*') return value % stepN === 0;
            const baseN = parseInt(base, 10);
            return value >= baseN && (value - baseN) % stepN === 0;
        }
        // одиночное значение
        return parseInt(field, 10) === value;
    }

    /**
     * Предустановленные cron-выражения для стандартного расписания.
     */
    const STANDARD_CRON = {
        // Каждый понедельник, среду и пятницу в 09:00 UTC
        MON_WED_FRI_09: '0 9 * * 1,3,5',
        // Каждый день в 06:00 UTC
        DAILY_06: '0 6 * * *',
        // Каждый час
        HOURLY: '0 * * * *',
    };

    /**
     * Базовый класс-обёртка, общая логика для всех реализаций.
     * Конкретные scheduler'ы наследуются и реализуют _runJob().
     */
    class BaseScheduler {
        constructor(config = {}) {
            this._jobs = new Map();
            this._listeners = {
                runStart: [],
                runComplete: [],
                runError: [],
                tick: [],
            };
            this._tickIntervalId = null;
            this._tickIntervalMs = config.tickIntervalMs || 60000;
        }

        on(event, callback) {
            if (this._listeners[event] && typeof callback === 'function') {
                this._listeners[event].push(callback);
            }
        }

        _emit(event, payload) {
            if (!this._listeners[event]) return;
            for (const cb of this._listeners[event]) {
                try { cb(payload); } catch (e) {
                    console.error(`[Scheduler] listener error (${event}):`, e);
                }
            }
        }

        registerJob(spec) {
            if (!spec || !spec.id) {
                throw new Error('[IScheduler] registerJob: spec.id is required');
            }
            if (!spec.cron) {
                throw new Error('[IScheduler] registerJob: spec.cron is required');
            }
            const job = {
                id: spec.id,
                name: spec.name || spec.id,
                cron: spec.cron,
                timezone: spec.timezone || 'UTC',
                payload: spec.payload || null,
                handler: spec.handler || null,
                status: 'idle',
                lastRunAt: null,
                nextRunAt: nextRunFromCron(spec.cron),
                lastResult: null,
                runCount: 0,
            };
            this._jobs.set(job.id, job);
            return job;
        }

        listJobs() {
            const list = [];
            for (const j of this._jobs.values()) {
                list.push(this._snapshot(j));
            }
            return list;
        }

        getJob(id) {
            const j = this._jobs.get(id);
            return j ? this._snapshot(j) : null;
        }

        cancel(id) {
            return this._jobs.delete(id);
        }

        pause(id) {
            const j = this._jobs.get(id);
            if (!j) return false;
            j.status = 'paused';
            return true;
        }

        resume(id) {
            const j = this._jobs.get(id);
            if (!j) return false;
            j.status = 'idle';
            j.nextRunAt = nextRunFromCron(j.cron);
            return true;
        }

        _snapshot(j) {
            return {
                id: j.id,
                name: j.name,
                cron: j.cron,
                timezone: j.timezone,
                status: j.status,
                lastRunAt: j.lastRunAt,
                lastRunAtISO: j.lastRunAt ? new Date(j.lastRunAt).toISOString() : null,
                nextRunAt: j.nextRunAt,
                nextRunAtISO: j.nextRunAt ? new Date(j.nextRunAt).toISOString() : null,
                lastResult: j.lastResult,
                runCount: j.runCount,
            };
        }

        _recomputeAllNextRuns() {
            for (const j of this._jobs.values()) {
                if (j.status === 'idle') {
                    j.nextRunAt = nextRunFromCron(j.cron);
                }
            }
        }

        async triggerNow(id) {
            const j = this._jobs.get(id);
            if (!j) return { success: false, error: 'job_not_found' };
            return this._runJob(j, { trigger: 'manual' });
        }

        async _runJob(job, opts = {}) {
            if (job.status === 'running') {
                return { success: false, error: 'already_running' };
            }
            job.status = 'running';
            const startedAt = Date.now();
            this._emit('runStart', { id: job.id, startedAt, trigger: opts.trigger });
            try {
                let result = null;
                if (typeof job.handler === 'function') {
                    result = await job.handler(job.payload, opts);
                } else {
                    result = { success: true, message: 'no handler — noop' };
                }
                job.lastRunAt = Date.now();
                job.lastResult = {
                    success: result && result.success !== false,
                    duration: Date.now() - startedAt,
                    error: result && result.error ? result.error : null,
                };
                job.runCount++;
                job.nextRunAt = nextRunFromCron(job.cron);
                job.status = 'idle';
                this._emit('runComplete', {
                    id: job.id, duration: job.lastResult.duration,
                    result: job.lastResult, trigger: opts.trigger,
                });
                return job.lastResult;
            } catch (e) {
                job.lastRunAt = Date.now();
                job.lastResult = { success: false, duration: Date.now() - startedAt, error: e.message };
                job.runCount++;
                job.nextRunAt = nextRunFromCron(job.cron);
                job.status = 'idle';
                this._emit('runError', { id: job.id, error: e.message, trigger: opts.trigger });
                return job.lastResult;
            }
        }

        start() {
            if (this._tickIntervalId) return;
            this._tickIntervalId = setInterval(() => this._tick(), this._tickIntervalMs);
        }

        stop() {
            if (this._tickIntervalId) {
                clearInterval(this._tickIntervalId);
                this._tickIntervalId = null;
            }
        }

        _tick() {
            this._recomputeAllNextRuns();
            const now = Date.now();
            for (const j of this._jobs.values()) {
                if (j.status !== 'idle') continue;
                if (!j.nextRunAt) continue;
                if (now >= j.nextRunAt && now < j.nextRunAt + 60 * 1000) {
                    this._runJob(j, { trigger: 'scheduled' });
                }
            }
            this._emit('tick', { now });
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.IScheduler = {
        isIScheduler,
        nextRunFromCron,
        STANDARD_CRON,
        BaseScheduler,
    };

})(window);
