/* =================================================================
   PAYD Intelligence — SchedulerAdapters
   Заготовки адаптеров для будущих production-реализаций.
   Текущая версия работает в браузере (LocalBrowserScheduler),
   но эти адаптеры определяют КОНТРАКТ и подготовлены к подключению.

   Когда появится backend — нужно будет:
     1. Выбрать подходящий адаптер (например NodeCronAdapter)
     2. Реализовать _runJob, используя node-cron или REST API
     3. Заменить LocalBrowserScheduler на новую реализацию
   Frontend-код менять НЕ нужно — он работает через IScheduler.
   ================================================================= */

(function (global) {
    'use strict';

    const BaseScheduler = global.PAYD_INTEL.IScheduler.BaseScheduler;

    /**
     * Адаптер для Node.js с использованием node-cron или аналога.
     * Контракт:
     *   - _runJob вызывается через cron-триггер внутри Node.js процесса.
     *   - Handler может быть прямым вызовом функции или REST-запросом к API.
     */
    class NodeCronAdapter extends BaseScheduler {
        constructor(config = {}) {
            super(config);
            this.environment = 'node';
            this.cronLib = config.cronLib || null; // node-cron instance
        }

        /**
         * Зарегистрировать job в node-cron.
         * В production-режиме вызывается на старте Node.js процесса.
         */
        _attachToCron(job) {
            if (!this.cronLib || typeof this.cronLib.schedule !== 'function') {
                console.warn('[NodeCronAdapter] cronLib not provided, jobs will not auto-trigger');
                return;
            }
            this.cronLib.schedule(job.cron, () => {
                this._runJob(job, { trigger: 'node-cron' });
            }, { timezone: job.timezone || 'UTC' });
        }

        registerJob(spec) {
            const job = super.registerJob(spec);
            this._attachToCron(job);
            return job;
        }
    }

    /**
     * Адаптер для Linux/Unix cron.
     * Контракт:
     *   - При старте приложения генерируется crontab-файл.
     *   - Каждый job представлен строкой в crontab:
     *     "0 9 * * 1,3,5 /usr/bin/node /app/jobs/intelligence-update.js"
     *   - Скрипт-заглушка вызывает handler через локальный API или CLI-флаги.
     */
    class ServerCronAdapter extends BaseScheduler {
        constructor(config = {}) {
            super(config);
            this.environment = 'server-cron';
            this.crontabPath = config.crontabPath || '/etc/cron.d/payd-intelligence';
            this.executablePath = config.executablePath || '/usr/local/bin/payd-job-runner';
        }

        /**
         * Сгенерировать записи crontab для всех зарегистрированных jobs.
         * Возвращает строку, которую можно записать в crontab-файл.
         */
        generateCrontabEntries() {
            const lines = [
                '# PAYD Intelligence — auto-generated crontab',
                '# DO NOT EDIT — managed by SchedulerAdapters',
                'SHELL=/bin/bash',
                'PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
                '',
            ];
            for (const j of this._jobs.values()) {
                const cron = j.cron;
                const jobId = j.id;
                const env = `PAYD_JOB_ID=${jobId}`;
                lines.push(`${cron} ${env} ${this.executablePath} --job=${jobId} >> /var/log/payd-intel.log 2>&1`);
            }
            return lines.join('\n') + '\n';
        }

        /**
         * В production этот метод вызывается внешним job-runner'ом:
         *   payd-job-runner --job=intelligence-update
         * Скрипт запускает job с указанным id, передавая payload через env.
         */
        async runFromCli(jobId) {
            const j = this._jobs.get(jobId);
            if (!j) {
                return { success: false, error: 'job_not_found' };
            }
            return this._runJob(j, { trigger: 'server-cron' });
        }
    }

    /**
     * Универсальный адаптер для cloud-сервисов расписания
     * (например AWS EventBridge, Google Cloud Scheduler, Azure Logic Apps).
     * Контракт:
     *   - При регистрации job отправляется HTTP-запрос к scheduler API.
     *   - Триггер scheduler'а вызывает webhook на нашем backend'е.
     *   - Backend вызывает handler через runFromWebhook().
     */
    class CloudSchedulerAdapter extends BaseScheduler {
        constructor(config = {}) {
            super(config);
            this.environment = 'cloud';
            this.schedulerApiUrl = config.schedulerApiUrl || null;
            this.webhookBaseUrl = config.webhookBaseUrl || null;
            this.authHeader = config.authHeader || null;
        }

        /**
         * Зарегистрировать cron-триггер в cloud scheduler через REST API.
         * В production-режиме вызывается при добавлении нового job.
         */
        async registerJob(spec) {
            const job = super.registerJob(spec);
            if (!this.schedulerApiUrl) {
                console.warn('[CloudSchedulerAdapter] schedulerApiUrl not configured');
                return job;
            }
            try {
                const response = await fetch(this.schedulerApiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(this.authHeader ? { 'Authorization': this.authHeader } : {}),
                    },
                    body: JSON.stringify({
                        jobId: job.id,
                        name: job.name,
                        cron: job.cron,
                        timezone: job.timezone,
                        webhookUrl: `${this.webhookBaseUrl}/jobs/${job.id}/run`,
                    }),
                });
                if (!response.ok) {
                    console.error('[CloudSchedulerAdapter] failed to register:', response.status);
                }
            } catch (e) {
                console.error('[CloudSchedulerAdapter] register error:', e);
            }
            return job;
        }

        /**
         * Вызывается webhook'ом от cloud scheduler'а.
         */
        async runFromWebhook(jobId) {
            const j = this._jobs.get(jobId);
            if (!j) {
                return { success: false, error: 'job_not_found' };
            }
            return this._runJob(j, { trigger: 'cloud-webhook' });
        }
    }

    /**
     * Адаптер для in-memory ручного тестирования.
     * Не использует setInterval, не сохраняет состояние.
     * Полезен для unit-тестов.
     */
    class ManualScheduler extends BaseScheduler {
        constructor(config = {}) {
            super({ ...config, tickIntervalMs: 0 });
            this.environment = 'manual';
        }

        start() { /* noop */ }
        stop() { /* noop */ }

        async runOnce(jobId) {
            return this._runJob(this._jobs.get(jobId), { trigger: 'manual-test' });
        }
    }

    global.PAYD_INTEL.SchedulerAdapters = {
        NodeCronAdapter,
        ServerCronAdapter,
        CloudSchedulerAdapter,
        ManualScheduler,
    };

})(window);
