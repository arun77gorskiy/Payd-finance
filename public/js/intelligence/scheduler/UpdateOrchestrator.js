/* =================================================================
   PAYD Intelligence — UpdateOrchestrator
   Главный оркестратор пайплайна обновления Intelligence.

   Пайплайн (6 STEP'ов):
     STEP 1 — REFRESH VERIFIED DATA
       Получить свежие данные от всех провайдеров.
     STEP 2 — VALIDATE DATA
       Проверить каждый проект. Невалидированные — заменить.
     STEP 3 — AI ANALYSIS
       Пересчитать все scores (Payd, Conviction, Alpha, Risk, ...).
     STEP 4 — UPDATE RANKINGS
       Переместить проекты Core/Watchlist/Emerging/Archive.
     STEP 5 — GENERATE INTELLIGENCE
       Сгенерировать еженедельные отчёты и intelligence.
     STEP 6 — SAVE HISTORY
       Сохранить snapshot в append-only хранилище.

   Особенности:
     - Полностью асинхронный pipeline
     - Retry-логика с exponential backoff
     - Защита от двойного запуска (lock)
     - Подробное логирование каждого STEP
     - Событийная модель (on/stepStart, on/stepComplete, on/error, on/complete)
   ================================================================= */

(function (global) {
    'use strict';

    const PIPELINE_STEPS = [
        'STEP_1_REFRESH_DATA',
        'STEP_2_VALIDATE',
        'STEP_3_AI_ANALYSIS',
        'STEP_4_UPDATE_RANKINGS',
        'STEP_5_GENERATE_INTELLIGENCE',
        'STEP_6_SAVE_HISTORY',
    ];

    class UpdateOrchestrator {
        /**
         * @param {Object} config
         * @param {Object} config.scheduler — IScheduler instance
         * @param {Object} config.dataAggregator — DataAggregator instance
         * @param {Object} config.validator — MarketDataValidationService instance
         * @param {Object} config.replacementService — ProjectReplacementService instance
         * @param {Object} config.scoringEngines — Object { payd, conviction, alpha, ... }
         * @param {Object} config.rankingEngine — RankingEngine instance
         * @param {Object} config.intelligenceGenerators — Object с генераторами
         * @param {Object} config.historyStore — HistoryStore instance
         * @param {number} [config.maxRetries=3]
         * @param {number} [config.retryBaseDelayMs=1000]
         */
        constructor(config = {}) {
            this.scheduler = config.scheduler;
            this.dataAggregator = config.dataAggregator;
            this.validator = config.validator;
            this.replacementService = config.replacementService;
            this.scoringEngines = config.scoringEngines || {};
            this.rankingEngine = config.rankingEngine;
            this.intelligenceGenerators = config.intelligenceGenerators || {};
            this.historyStore = config.historyStore;
            this.maxRetries = config.maxRetries || 3;
            this.retryBaseDelayMs = config.retryBaseDelayMs || 1000;

            this._isRunning = false;
            this._currentCycle = null;
            this._listeners = {
                cycleStart: [],
                cycleComplete: [],
                cycleError: [],
                stepStart: [],
                stepComplete: [],
                stepError: [],
            };
        }

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

        _emit(event, payload) {
            if (!this._listeners[event]) return;
            for (const cb of this._listeners[event]) {
                try { cb(payload); } catch (e) {
                    console.error(`[UpdateOrchestrator] listener error (${event}):`, e);
                }
            }
        }

        isRunning() { return this._isRunning; }
        getCurrentCycle() { return this._currentCycle; }

        /**
         * Запустить полный цикл обновления.
         * @param {Object} [opts]
         * @param {string} [opts.trigger='manual'] — manual | scheduled | api
         * @returns {Promise<{ success, cycleId, steps, duration }>}
         */
        async runCycle(opts = {}) {
            if (this._isRunning) {
                return { success: false, error: 'already_running' };
            }

            this._isRunning = true;
            const cycleId = `cycle_${Date.now()}`;
            const startedAt = Date.now();
            const trigger = opts.trigger || 'manual';
            this._currentCycle = {
                cycleId, trigger, startedAt, currentStep: null,
                steps: {}, status: 'running',
            };

            this._emit('cycleStart', { cycleId, trigger, startedAt });

            try {
                for (const stepName of PIPELINE_STEPS) {
                    this._currentCycle.currentStep = stepName;
                    const stepResult = await this._runStepWithRetry(stepName, cycleId);
                    this._currentCycle.steps[stepName] = stepResult;
                    if (!stepResult.success) {
                        this._currentCycle.status = 'failed';
                        this._emit('cycleError', { cycleId, stepName, error: stepResult.error });
                        return {
                            success: false,
                            cycleId,
                            failedStep: stepName,
                            error: stepResult.error,
                            steps: this._currentCycle.steps,
                            duration: Date.now() - startedAt,
                        };
                    }
                }

                this._currentCycle.status = 'completed';
                this._currentCycle.completedAt = Date.now();
                const duration = Date.now() - startedAt;

                this._emit('cycleComplete', {
                    cycleId, duration, steps: this._currentCycle.steps,
                });

                return {
                    success: true, cycleId, duration,
                    steps: this._currentCycle.steps,
                };
            } catch (e) {
                this._currentCycle.status = 'error';
                this._emit('cycleError', { cycleId, error: e.message });
                return { success: false, cycleId, error: e.message, duration: Date.now() - startedAt };
            } finally {
                this._isRunning = false;
                // currentCycle остаётся для аудита, но сбрасывается через 5 минут
                setTimeout(() => {
                    if (this._currentCycle && this._currentCycle.cycleId === cycleId) {
                        this._currentCycle = null;
                    }
                }, 5 * 60 * 1000);
            }
        }

        async _runStepWithRetry(stepName, cycleId) {
            const startedAt = Date.now();
            let lastError = null;
            for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
                this._emit('stepStart', { cycleId, stepName, attempt });
                try {
                    const result = await this._runStep(stepName, cycleId);
                    const duration = Date.now() - startedAt;
                    this._emit('stepComplete', {
                        cycleId, stepName, attempt, duration, result,
                    });
                    return {
                        success: true, stepName, attempt, duration, result,
                    };
                } catch (e) {
                    lastError = e;
                    console.error(`[UpdateOrchestrator] ${stepName} attempt ${attempt} failed:`, e);
                    this._emit('stepError', {
                        cycleId, stepName, attempt, error: e.message,
                    });
                    if (attempt < this.maxRetries) {
                        // Exponential backoff: 1s, 2s, 4s
                        const delay = this.retryBaseDelayMs * Math.pow(2, attempt - 1);
                        await new Promise(r => setTimeout(r, delay));
                    }
                }
            }
            return {
                success: false, stepName,
                error: lastError ? lastError.message : 'unknown',
                attempts: this.maxRetries,
                duration: Date.now() - startedAt,
            };
        }

        async _runStep(stepName, cycleId) {
            switch (stepName) {
                case 'STEP_1_REFRESH_DATA':
                    return this._step1RefreshData(cycleId);
                case 'STEP_2_VALIDATE':
                    return this._step2Validate(cycleId);
                case 'STEP_3_AI_ANALYSIS':
                    return this._step3AiAnalysis(cycleId);
                case 'STEP_4_UPDATE_RANKINGS':
                    return this._step4UpdateRankings(cycleId);
                case 'STEP_5_GENERATE_INTELLIGENCE':
                    return this._step5GenerateIntelligence(cycleId);
                case 'STEP_6_SAVE_HISTORY':
                    return this._step6SaveHistory(cycleId);
                default:
                    throw new Error(`Unknown step: ${stepName}`);
            }
        }

        // -------------------- STEP 1 --------------------

        async _step1RefreshData(cycleId) {
            if (!this.dataAggregator) {
                throw new Error('dataAggregator is required for STEP 1');
            }
            const result = await this.dataAggregator.refreshAll();
            return {
                projectsUpdated: result.projectsUpdated || 0,
                providers: result.providers || [],
                fields: result.fields || [],
                duration: result.duration || 0,
            };
        }

        // -------------------- STEP 2 --------------------

        async _step2Validate(cycleId) {
            if (!this.validator) {
                throw new Error('validator is required for STEP 2');
            }
            if (!this.dataAggregator) {
                throw new Error('dataAggregator is required for STEP 2');
            }
            const validation = await this.validator.validateAll(this.dataAggregator);
            let replaced = 0;
            if (validation.invalidProjects && validation.invalidProjects.length > 0) {
                if (!this.replacementService) {
                    throw new Error('replacementService is required to handle invalid projects');
                }
                for (const invalid of validation.invalidProjects) {
                    const replacement = await this.replacementService.replaceProject(invalid);
                    if (replacement && replacement.success) {
                        replaced++;
                    }
                }
            }
            return {
                totalChecked: validation.totalChecked || 0,
                valid: validation.valid || 0,
                invalid: (validation.invalidProjects || []).length,
                replaced,
            };
        }

        // -------------------- STEP 3 --------------------

        async _step3AiAnalysis(cycleId) {
            const engines = this.scoringEngines;
            if (!engines || Object.keys(engines).length === 0) {
                throw new Error('scoringEngines are required for STEP 3');
            }
            if (!this.dataAggregator) {
                throw new Error('dataAggregator is required for STEP 3');
            }
            const results = {};
            for (const [name, engine] of Object.entries(engines)) {
                if (typeof engine.runForAll !== 'function') {
                    continue;
                }
                const r = await engine.runForAll({ cycleId, aggregator: this.dataAggregator });
                results[name] = {
                    success: r.success !== false,
                    projectsScored: r.projectsScored || 0,
                };
            }
            return { engines: results };
        }

        // -------------------- STEP 4 --------------------

        async _step4UpdateRankings(cycleId) {
            if (!this.rankingEngine) {
                throw new Error('rankingEngine is required for STEP 4');
            }
            // Собираем scoresByProject из кэшей analysis engines
            // и приводим к формату, который ожидает RankingEngine: { payd, fundamental, risk, opportunity }
            const scoresByProject = {};
            const engines = this.scoringEngines || {};
            const projectIds = this.dataAggregator ? Object.keys(this.dataAggregator.getAllData()) : [];
            for (const projectId of projectIds) {
                const scores = {};
                for (const [name, engine] of Object.entries(engines)) {
                    const cached = engine.getCached ? engine.getCached(projectId) : null;
                    if (cached && typeof cached.score === 'number') {
                        scores[name] = cached.score;
                    }
                }
                // Маппинг имён engines в канонические ключи
                const risk = scores.RiskAssessmentEngine || 0;
                const fundamental = scores.FundamentalAnalysisEngine || 0;
                const opportunity = scores.OpportunityAnalysisEngine || 0;
                const growth = scores.GrowthAnalysisEngine || 0;
                const investment = scores.InvestmentSummaryEngine || 0;
                // Агрегированный Payd Score (среднее по доступным)
                const components = [risk, fundamental, opportunity, growth, investment].filter(s => s > 0);
                const payd = components.length > 0
                    ? components.reduce((a, b) => a + b, 0) / components.length
                    : 0;
                if (payd > 0 || fundamental > 0 || risk > 0) {
                    scoresByProject[projectId] = {
                        payd,
                        fundamental,
                        risk,
                        opportunity,
                        growth,
                        investment,
                    };
                }
            }
            const result = await this.rankingEngine.updateAllRankings({
                cycleId,
                aggregator: this.dataAggregator,
                scoresByProject,
            });
            return {
                promoted: result.promoted || 0,
                demoted: result.demoted || 0,
                unchanged: result.unchanged || 0,
            };
        }

        // -------------------- STEP 5 --------------------

        async _step5GenerateIntelligence(cycleId) {
            const gens = this.intelligenceGenerators;
            if (!gens || Object.keys(gens).length === 0) {
                return { generators: 0, message: 'no generators configured' };
            }
            const results = {};
            for (const [name, gen] of Object.entries(gens)) {
                if (typeof gen.generate !== 'function') continue;
                try {
                    const r = await gen.generate({ cycleId });
                    results[name] = { success: r.success !== false, items: r.items || 0 };
                } catch (e) {
                    results[name] = { success: false, error: e.message };
                }
            }
            return { generators: results };
        }

        // -------------------- STEP 6 --------------------

        async _step6SaveHistory(cycleId) {
            if (!this.historyStore) {
                throw new Error('historyStore is required for STEP 6');
            }
            const cycle = this._currentCycle;
            await this.historyStore.appendCycle({
                cycleId,
                startedAt: cycle.startedAt,
                completedAt: Date.now(),
                trigger: cycle.trigger,
                steps: cycle.steps,
            });
            return { saved: true, cycleId };
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.UpdateOrchestrator = UpdateOrchestrator;
    global.PAYD_INTEL.PIPELINE_STEPS = PIPELINE_STEPS;

})(window);
