/* =================================================================
   PAYD Intelligence — LocalBrowserScheduler
   Реализация IScheduler, работающая в браузере.
   Использует setInterval для проверки расписания.
   Подходит для текущей версии (frontend-only).
   Для production будет заменена на NodeCronAdapter / ServerCronAdapter.
   ================================================================= */

(function (global) {
    'use strict';

    const BaseScheduler = global.PAYD_INTEL.IScheduler.BaseScheduler;

    class LocalBrowserScheduler extends BaseScheduler {
        constructor(config = {}) {
            super(config);
            this.environment = 'browser';
            this.autoStart = config.autoStart !== false;
            this._storageKey = config.storageKey || 'payd_intel_scheduler_state';
            this._persistEnabled = config.persist !== false;
            if (this._persistEnabled) {
                this._loadState();
            }
            if (this.autoStart) {
                this.start();
            }
        }

        /**
         * Сохранить состояние расписания в localStorage,
         * чтобы пережить перезагрузку страницы.
         */
        _saveState() {
            if (!this._persistEnabled) return;
            try {
                const state = [];
                for (const j of this._jobs.values()) {
                    state.push({
                        id: j.id,
                        name: j.name,
                        cron: j.cron,
                        timezone: j.timezone,
                        status: j.status,
                        lastRunAt: j.lastRunAt,
                        lastResult: j.lastResult,
                        runCount: j.runCount,
                    });
                }
                localStorage.setItem(this._storageKey, JSON.stringify(state));
            } catch (e) {
                // localStorage недоступен — игнорируем
            }
        }

        _loadState() {
            if (!this._persistEnabled) return;
            try {
                const raw = localStorage.getItem(this._storageKey);
                if (!raw) return;
                const state = JSON.parse(raw);
                for (const s of state) {
                    this._jobs.set(s.id, {
                        ...s,
                        payload: null,
                        handler: null, // handler не сериализуется, восстанавливается позже
                        nextRunAt: global.PAYD_INTEL.IScheduler.nextRunFromCron(s.cron),
                    });
                }
            } catch (e) {
                // Повреждённое состояние — игнорируем
            }
        }

        async triggerNow(id) {
            const result = await super.triggerNow(id);
            this._saveState();
            return result;
        }

        cancel(id) {
            const ok = super.cancel(id);
            this._saveState();
            return ok;
        }

        pause(id) {
            const ok = super.pause(id);
            this._saveState();
            return ok;
        }

        resume(id) {
            const ok = super.resume(id);
            this._saveState();
            return ok;
        }

        registerJob(spec) {
            const job = super.registerJob(spec);
            this._saveState();
            return job;
        }

        /**
         * Привязать обработчик к уже зарегистрированному job.
         * Используется после _loadState, чтобы восстановить handler.
         */
        attachHandler(id, handler) {
            const j = this._jobs.get(id);
            if (!j) return false;
            j.handler = handler;
            return true;
        }
    }

    global.PAYD_INTEL.LocalBrowserScheduler = LocalBrowserScheduler;

})(window);
