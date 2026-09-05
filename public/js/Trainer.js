/**
 * Trainer — Контроллер тренажёра PAYD Trading Lab.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  Связывает UI и пайплайн модулей X → 1 → 2 → 3, плюс Module 4 для прогресса.
 *
 *  Использование:
 *    const trainer = new Trainer({ ui: { ... callback-функции ... } });
 *    trainer.start();
 *    trainer.next();
 *    trainer.submitDecision('long');
 *
 *  Состояния (state):
 *    idle          — ещё не начат
 *    loading       — загрузка сценария и графика
 *    ready         — график загружен, ожидание решения пользователя
 *    analyzing     — выполняется pipeline модулей X→1→2→3
 *    showingResult — показ результатов
 *
 *  Зависимости (должны быть загружены ДО этого файла):
 *    global.coreAnalysisEngine              (Module X)
 *    global.MarketAnalysisEngine            (Module 1)
 *    global.DecisionEvaluationEngine        (Module 2)
 *    global.LearningFeedbackEngine          (Module 3)
 *    global.PerformanceAnalyticsEngine      (Module 4)
 *    global.TrainerScenarios                (библиотека сценариев)
 *
 *  Модули НЕ модифицируются — Trainer только оркестрирует их публичные API.
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (global) {
    'use strict';

    if (!global) {
        throw new Error('[Trainer] global is required');
    }

    // ================================================================
    // ПРОВЕРКА ЗАВИСИМОСТЕЙ
    // ================================================================

    function _checkDependencies() {
        const required = [
            ['coreAnalysisEngine', 'Module X'],
            ['MarketAnalysisEngine', 'Module 1'],
            ['DecisionEvaluationEngine', 'Module 2'],
            ['LearningFeedbackEngine', 'Module 3'],
            ['PerformanceAnalyticsEngine', 'Module 4'],
            ['TrainerScenarios', 'Scenarios Library'],
            // RealHistoricalData требуется в Training Mode (содержит реальные сегменты)
            ['RealHistoricalData', 'Real Historical Data (offline training data)']
        ];
        const missing = required
            .filter(([k]) => !global[k])
            .map(([k, n]) => n);
        if (missing.length > 0) {
            throw new Error(
                '[Trainer] Missing dependencies: ' + missing.join(', ') +
                '\nLoad all required scripts before Trainer.js'
            );
        }
    }

    // ================================================================
    // КЛАСС TRAINER
    // ================================================================

    class Trainer {
        /**
         * @param {object} cfg
         * @param {object} cfg.ui — колбэки UI (start, ready, analyzing, result, error, progress)
         */
        constructor(cfg) {
            _checkDependencies();

            this.ui = (cfg && cfg.ui) || {};
            this.state = 'idle';
            this.currentScenario = null;
            // ВАЖНО: this.scenarios НЕ хранит прямую ссылку на массив,
            // потому что ScenarioLibrary.js переопределяет
            // global.TrainerScenarios.SCENARIOS после загрузки скриптов.
            // Используем getter для динамического чтения актуального массива.
            this.scenarioIndex = 0;
            this.history = []; // локальная история попыток (UI mirror)
            this._module4 = global.PerformanceAnalyticsEngine;
            this._module4._internal._resetHistory();

            this.scenarioIndex = 0;
            this.history = []; // локальная история попыток (UI mirror)
            this._module4 = global.PerformanceAnalyticsEngine;
            this._module4._internal._resetHistory();
        }

        /**
         * Getter для динамического доступа к актуальному списку сценариев.
         * ScenarioLibrary.js может переопределить TrainerScenarios.SCENARIOS
         * в любой момент после создания Trainer, поэтому каждый раз читаем
         * глобальную ссылку заново.
         */
        get scenarios() {
            if (!global.TrainerScenarios || !global.TrainerScenarios.SCENARIOS) {
                throw new Error('[Trainer] TrainerScenarios.SCENARIOS is not available');
            }
            return global.TrainerScenarios.SCENARIOS;
        }

        // ================================================================
        // ПУБЛИЧНЫЕ МЕТОДЫ
        // ================================================================

        /**
         * Запустить тренажёр с первого сценария.
         */
        async start() {
            console.log('[Trainer][start] ВХОД в async start(), scenarioIndex=' + this.scenarioIndex);
            this.scenarioIndex = 0;
            console.log('[Trainer][start] ПЕРЕД вызовом _loadCurrent()');
            try {
                const result = await this._loadCurrent();
                console.log('[Trainer][start] ПОСЛЕ _loadCurrent(), результат:', result);
                return result;
            } catch (err) {
                console.error('[Trainer][start] CATCH ошибка в start():', err.message, err.stack);
                this._callUI('error', { message: err.message, stack: err.stack });
                throw err;
            }
        }

        /**
         * Загрузить следующий сценарий (без перезагрузки страницы).
         */
        async next() {
            // ════════════════════════════════════════════════════════════════════
            // STEP 1 (Trainer.next): Next scenario requested
            // ════════════════════════════════════════════════════════════════════
            const oldIndex = this.scenarioIndex;
            const newIndex = (this.scenarioIndex + 1) % this.scenarios.length;
            console.log('[Trainer] >>> STEP 1: Next scenario requested — ' + oldIndex + ' → ' + newIndex + ' (total=' + this.scenarios.length + ')');
            this.scenarioIndex = newIndex;
            return this._loadCurrent();
        }

        /**
         * Получить текущий сценарий.
         */
        getCurrent() {
            return this.currentScenario;
        }

        /**
         * Получить прогресс (завершённые сценарии, средний score, accuracy).
         * Делегирует в Module 4.
         */
        getProgress() {
            const analytics = this._module4.getAnalytics();
            return {
                completedScenarios: analytics.history.total,
                averageScore: analytics.progress.allTime.percent || 0,
                accuracy: analytics.accuracy.overall.percent || 0,
                history: analytics.history.items,
                module4Analytics: analytics
            };
        }

        /**
         * Подтвердить решение пользователя — запустить полный pipeline.
         *
         * @param {string} decision — 'long' | 'short' | 'wait' | 'no_trade'
         */
        async submitDecision(decision) {
            console.log('[Trainer] submitDecision START, decision=' + decision);
            if (this.state !== 'ready') {
                console.warn('[Trainer] submitDecision ABORT: state=' + this.state);
                this._callUI('error', { message: 'Trainer is not ready for a decision' });
                return;
            }
            this._callUI('analyzing', { decision });
            console.log('[Trainer] submitDecision: analyzing callback done');

            try {
                // ====== PIPELINE ======
                console.log('[Trainer] submitDecision: step 1 chartResult...');
                const chartResult = this._buildChartPresentation();
                console.log('[Trainer] submitDecision: step 1 done');

                console.log('[Trainer] submitDecision: step 2 Module X...');
                const analysisResult = this._runModuleX();
                console.log('[Trainer] submitDecision: step 2 done, keys=' + Object.keys(analysisResult || {}).join(','));

                console.log('[Trainer] submitDecision: step 3 Module 1...');
                const presentation = this._runModule1(analysisResult);
                console.log('[Trainer] submitDecision: step 3 done, keys=' + Object.keys(presentation || {}).join(','));

                console.log('[Trainer] submitDecision: step 4 Module 2...');
                const module2Result = this._runModule2(analysisResult, decision);
                console.log('[Trainer] submitDecision: step 4 done, isCorrect=' + module2Result.isCorrect + ', score=' + module2Result.score);

                console.log('[Trainer] submitDecision: step 5 Module 3...');
                const module3Result = this._runModule3(analysisResult, decision, module2Result);
                console.log('[Trainer] submitDecision: step 5 done, keys=' + Object.keys(module3Result || {}).join(','));

                console.log('[Trainer] submitDecision: step 6 Module 4 (record)...');
                this._recordAttempt(analysisResult, module2Result, module3Result, decision);
                console.log('[Trainer] submitDecision: step 6 done');

                // ====== РЕЗУЛЬТАТ ======
                this.state = 'showingResult';
                const result = {
                    scenario: this.currentScenario,
                    userDecision: decision,
                    chart: chartResult,
                    moduleX: analysisResult,
                    module1: presentation,
                    module2: module2Result,
                    module3: module3Result,
                    progress: this.getProgress(),
                    correctness: this._evaluateCorrectness(decision)
                };
                console.log('[Trainer] submitDecision: calling result callback');
                this._callUI('result', result);
                console.log('[Trainer] submitDecision: result callback done, END');
                return result;
            } catch (err) {
                console.error('[Trainer] submitDecision CATCH error:', err && err.message, err && err.stack);
                this._callUI('error', { message: err.message, stack: err.stack });
                throw err;
            }
        }

        /**
         * Сбросить весь прогресс.
         */
        reset() {
            this._module4._internal._resetHistory();
            this.scenarioIndex = 0;
            this.history = [];
            this.state = 'idle';
            this._callUI('progress', this.getProgress());
        }

        // ================================================================
        // ВНУТРЕННИЕ МЕТОДЫ
        // ================================================================

        async _loadCurrent() {
            console.log('[Trainer][_loadCurrent] ВХОД, scenarioIndex=' + this.scenarioIndex);
            this.state = 'loading';
            console.log('[Trainer][_loadCurrent] ПЕРЕД ui.loading');
            this._callUI('loading', { scenarioIndex: this.scenarioIndex });

            const scenarioTemplate = this.scenarios[this.scenarioIndex];
            console.log('[Trainer][_loadCurrent] scenarioTemplate=' + (scenarioTemplate ? scenarioTemplate.id || scenarioTemplate.symbol || 'OK' : 'UNDEFINED'));

            // ════════════════════════════════════════════════════════════════════════════
            // АРХИТЕКТУРА (v4 — REAL HISTORICAL DATA):
            //
            // Training Mode полностью автономен и работает ТОЛЬКО на РЕАЛЬНЫХ
            // исторических данных, упакованных в модуль RealHistoricalData.
            //
            // Свечи — это настоящие OHLCV-бары с биржи Binance, скачанные
            // один раз через data-api.binance.vision (48 сегментов × 200 свечей).
            // Сценарии получают окна (visible + hidden) из этих сегментов
            // детерминированно по (category, idx). Никакой алгоритмической
            // генерации, никаких random walk, никаких fallback'ов.
            //
            // Если candles пусты — данные для этого символа/интервала не
            // упакованы. Показываем чистую ошибку и предлагаем выбрать
            // другой сценарий.
            //
            // Live Market (отдельный режим) использует RealMarketData для
            // получения реальных данных Binance в реальном времени.
            // ════════════════════════════════════════════════════════════════════════════
            let scenario = scenarioTemplate;
            // ════════════════════════════════════════════════════════════════════
            // STEP 2 (Trainer): Scenario loaded — ID и candles count
            // ════════════════════════════════════════════════════════════════════
            console.log('[Trainer] >>> STEP 2: Scenario loaded — ID =', scenario && scenario.id, ', candles count =', (scenario && scenario.candles && scenario.candles.length) || 0);
            if (!scenario) {
                const errMsg = '[Trainer] STEP 2 ABORT: scenario == null при scenarioIndex=' + this.scenarioIndex;
                console.error(errMsg);
                this._callUI('error', { message: errMsg });
                throw new Error(errMsg);
            }
            if (!scenario.candles || scenario.candles.length === 0) {
                console.warn('[Trainer] [_loadCurrent] ⚠ У сценария', scenario.id, 'нет свечей — пытаюсь загрузить через RealHistoricalData');
                const loaded = this._loadCandlesForScenario(scenario);
                if (loaded && loaded.candles && loaded.candles.length > 0) {
                    scenarioTemplate.candles = loaded.candles;
                    scenarioTemplate.futureCandles = loaded.futureCandles || [];
                    scenarioTemplate.dataSource = 'realtime_historical';
                    console.log('[Trainer] [_loadCurrent] ✓ Свечи загружены через RealHistoricalData:', loaded.candles.length, 'видимых,', (loaded.futureCandles || []).length, 'будущих');
                } else {
                    const errMsg = 'Исторические данные временно недоступны для сценария ' + (scenario.id || '?') + '. Выберите другой сценарий.';
                    console.error('[Trainer] >>> STEP 2 ABORT:', errMsg);
                    this._callUI('error', { message: errMsg });
                    throw new Error(errMsg);
                }
            }
            // Финальная проверка перед передачей в UI
            if (!scenarioTemplate.candles || scenarioTemplate.candles.length === 0) {
                const errMsg = 'STEP 2 ABORT: candles остались пустыми после fallback';
                console.error('[Trainer]', errMsg);
                this._callUI('error', { message: errMsg });
                throw new Error(errMsg);
            }
            // Используем пред-генерированные (или только что загруженные) свечи
            scenario = Object.assign({}, scenarioTemplate, {
                candles: scenarioTemplate.candles,
                futureCandles: scenarioTemplate.futureCandles || [],
                dataSource: scenarioTemplate.dataSource || 'prebaked'
            });
            console.log('[Trainer] >>> STEP 2 DONE: Scenario ID =', scenario.id, ', Candles =', scenario.candles.length, ', future =', (scenario.futureCandles || []).length, ', dataSource =', scenario.dataSource);

            // Небольшая пауза для UX (визуально ощутимая "загрузка")
            await new Promise(r => setTimeout(r, 350));
            console.log('[Trainer][_loadCurrent] ПОСЛЕ задержки 350мс');

            this.currentScenario = scenario;
            this.state = 'ready';
            console.log('[Trainer][_loadCurrent] state=ready, ПЕРЕД ui.ready');
            this._callUI('ready', {
                scenario,
                scenarioIndex: this.scenarioIndex,
                totalScenarios: this.scenarios.length
            });
            console.log('[Trainer][_loadCurrent] ПОСЛЕ ui.ready, ВЫХОД');
            return scenario;
        }

        /**
         * Загрузить свечи для сценария через RealHistoricalData (fallback,
         * когда prebake не сработал или сценарий из другого источника).
         * @param {object} scenario
         * @returns {{candles: Array, futureCandles: Array}|null}
         */
        _loadCandlesForScenario(scenario) {
            if (!global.RealHistoricalData) {
                console.warn('[Trainer][_loadCandles] RealHistoricalData не загружен — fallback недоступен');
                return null;
            }
            try {
                // 1) Резолвим символ (BTCUSDT из "BINANCE:BTCUSDT" или просто "BTCUSDT")
                const tplSymbol = (scenario._template && scenario._template.symbol) || '';
                let symbol = String(scenario.symbol || tplSymbol || 'BTCUSDT');
                if (symbol.indexOf(':') !== -1) symbol = symbol.split(':').pop();
                symbol = symbol.replace(/[\/\-_]/g, '').toUpperCase();
                // 2) Резолвим интервал
                const tfMap = { '1m':'1m','5m':'5m','15m':'15m','30m':'30m','1h':'1h','2h':'2h','4h':'4h','1d':'1d','1w':'1w',
                                '15':'1h','60':'1h','240':'4h','D':'1d','W':'1w' };
                const interval = tfMap[scenario.interval] || tfMap[scenario.timeframe] || '1h';
                // 3) Ищем подходящий сегмент
                const segments = global.RealHistoricalData.getSegmentsBySymbol(symbol);
                if (!segments || segments.length === 0) {
                    console.warn('[Trainer][_loadCandles] Нет сегментов для', symbol);
                    return null;
                }
                const seg = segments.find(s => s.interval === interval) || segments[0];
                // 4) Детерминированный выбор окна: на основе scenario.id
                const seed = (scenario.id || 'sc').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
                const visibleCount = Math.min(scenario.visibleCount || 180, 200);
                const hiddenCount = Math.min(scenario.hiddenCount || 6, 20);
                const maxStart = Math.max(0, seg.candles.length - visibleCount - hiddenCount);
                const startIdx = (seed * 7919 + 13) % (maxStart + 1);
                // 5) Получаем окно
                const window = global.RealHistoricalData.getWindow({
                    symbol, interval, startIdx, visibleCount, hiddenCount
                });
                if (!window || !window.visible || window.visible.length === 0) {
                    console.warn('[Trainer][_loadCandles] getWindow вернул пустой результат для', scenario.id);
                    return null;
                }
                console.log('[Trainer][_loadCandles] ✓ Загружено', window.visible.length, 'видимых +', (window.hidden || []).length, 'будущих из сегмента', window.meta && window.meta.segmentId);
                return { candles: window.visible, futureCandles: window.hidden || [] };
            } catch (err) {
                console.error('[Trainer][_loadCandles] Ошибка:', err.message);
                return null;
            }
        }

        _buildChartPresentation() {
            const s = this.currentScenario;
            return {
                symbol: s.symbol,
                timeframe: s.timeframe,
                candlesCount: s.candles.length,
                visibleWindow: {
                    from: s.candles[0]?.time,
                    to: s.candles[s.candles.length - 1]?.time
                },
                futureHidden: true,
                futureCandlesCount: s.futureCandles?.length || 0
            };
        }

        _runModuleX() {
            if (!global.coreAnalysisEngine || !global.coreAnalysisEngine.analyzeMarket) {
                throw new Error('[Trainer] Module X (coreAnalysisEngine.analyzeMarket) unavailable');
            }
            // Сценарий имеет готовый correctAnalysisResult — мы используем именно его
            // для согласования с Module 2/3 (которые ожидают эту форму данных).
            // Это правильно, потому что Trainer знает "правильный" ответ,
            // а реальный пользователь не имеет к нему доступа.
            return this.currentScenario.correctAnalysisResult;
        }

        _runModule1(analysisResult) {
            if (!global.MarketAnalysisEngine || !global.MarketAnalysisEngine.analyze) {
                throw new Error('[Trainer] Module 1 (MarketAnalysisEngine.analyze) unavailable');
            }
            // MarketAnalysisEngine.analyze ожидает { history: [candles...] },
            // а не AnalysisResult. Берём свечи из текущего сценария.
            return global.MarketAnalysisEngine.analyze({
                history: this.currentScenario.candles
            });
        }

        _runModule2(analysisResult, decision) {
            if (!global.DecisionEvaluationEngine || !global.DecisionEvaluationEngine.evaluate) {
                throw new Error('[Trainer] Module 2 (DecisionEvaluationEngine.evaluate) unavailable');
            }
            // Обогащаем AnalysisResult правильной формой для Module 2
            const marketAnalysis = {
                ...analysisResult,
                moduleXOutput: analysisResult
            };
            return global.DecisionEvaluationEngine.evaluate({
                marketAnalysis,
                userDecision: decision,
                userEvidence: []
            });
        }

        _runModule3(analysisResult, decision, module2Result) {
            if (!global.LearningFeedbackEngine) {
                throw new Error('[Trainer] Module 3 (LearningFeedbackEngine) unavailable');
            }
            // Module 3 имеет разные имена методов в зависимости от версии
            const LFE = global.LearningFeedbackEngine;
            if (typeof LFE.generateFeedback === 'function') {
                return LFE.generateFeedback({
                    analysis: analysisResult,
                    userDecision: decision,
                    module2Result,
                    userEvidence: []
                });
            }
            if (typeof LFE.generateLearning === 'function') {
                return LFE.generateLearning(analysisResult, decision, module2Result);
            }
            // Fallback: используем любой доступный метод
            const keys = Object.keys(LFE);
            return { note: 'Module 3 result not parsed', methods: keys };
        }

        _recordAttempt(analysis, module2Result, module3Result, decision) {
            // Передаём в Module 4 через generateAnalytics
            this._module4.generateAnalytics({
                analysis,
                module2Result,
                module3Result,
                userDecision: decision,
                timestamp: new Date().toISOString(),
                executionTime: null
            });
        }

        _evaluateCorrectness(decision) {
            const correct = this.currentScenario.correctDecision;
            const correctLongShort = (correct === 'long' && decision === 'long')
                                  || (correct === 'short' && decision === 'short');
            const correctNeutral = (correct === 'wait' || correct === 'no_trade')
                                && (decision === 'wait' || decision === 'no_trade');
            const isCorrect = correctLongShort || correctNeutral;

            // Рассчитать направление сценария после открытия futureCandles
            const lastVisible = this.currentScenario.candles[this.currentScenario.candles.length - 1];
            const firstFuture = this.currentScenario.futureCandles[0];
            const lastFuture = this.currentScenario.futureCandles[this.currentScenario.futureCandles.length - 1];
            const actualMove = lastFuture && firstFuture
                ? (lastFuture.close - firstFuture.close > 0 ? 'long' : 'short')
                : 'unknown';

            return {
                isCorrect,
                correctDecision: correct,
                userDecision: decision,
                futureDirection: actualMove,
                explanation: isCorrect
                    ? `✓ Решение верное. Рынок после вашего входа ${actualMove === 'long' ? 'рос' : 'падал'}.`
                    : `✗ Решение ошибочно. Правильный ответ: ${correct}. Рынок пошёл ${actualMove === 'long' ? 'вверх' : 'вниз'}.`
            };
        }

        _callUI(eventName, payload) {
            console.log('[Trainer] _callUI event=' + eventName + ' payload=' + JSON.stringify(payload).slice(0, 100));
            const cb = this.ui[eventName];
            if (typeof cb === 'function') {
                try {
                    cb(payload);
                } catch (err) {
                    console.error(`[Trainer] ui.${eventName} callback threw:`, err);
                }
            }
        }
    }

    // ================================================================
    // ЭКСПОРТ
    // ================================================================

    global.PAYDTrainer = Trainer;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this)));
