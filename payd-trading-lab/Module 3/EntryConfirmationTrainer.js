/**
 * EntryConfirmationTrainer — оркестратор двух модулей.
 *
 * Архитектура:
 *
 *   EntryConfirmationTrainer (оркестратор)
 *     ├── Module 1 — MarketAnalysisEngine
 *     │     • Анализирует ТОЛЬКО исторические свечи
 *     │     • Возвращает контекст рынка (без оценки действий пользователя)
 *     │     • Показывает структуру, моментум, объём, уровни, вероятности
 *     │
 *     └── Module 2 — DecisionEvaluationEngine
 *           • Валидирует решение пользователя (LONG / SHORT / WAIT / NO TRADE)
 *           • На основании ВЫВОДА Module 1 (не анализирует график заново)
 *           • Сравнивает: market context vs user decision vs user evidence
 *
 * Принципы:
 *   - Module 1 НЕ знает о решениях пользователя
 *   - Module 2 НЕ пересчитывает тренд/структуру — использует только то,
 *     что выдал Module 1
 *   - Тренер — оркестратор: запускает движки, передаёт данные между ними
 *     и отрисовывает UI
 *
 * Режимы работы (параметр moduleMode в конструкторе):
 *   'module1' — Market Intelligence (только анализ рынка)
 *   'module2' — Entry Confirmation (анализ → решение → оценка)
 *
 * Использует глобальный класс LightweightCharts (lwc) от CDN.
 * Использует глобальные классы MarketAnalysisEngine и DecisionEvaluationEngine.
 */
(function (global) {
    'use strict';

    // ================================================================
    // Чекбоксы подтверждений (общий список для Module 2)
    // ================================================================
    const EVIDENCE_OPTIONS = [
        { id: 'breakout',         label: 'Есть пробой уровня' },
        { id: 'close-above',      label: 'Есть закрытие за уровнем' },
        { id: 'high-volume',      label: 'Есть повышенный объём' },
        { id: 'retest',           label: 'Есть ретест' },
        { id: 'hold',             label: 'Есть удержание уровня' },
        { id: 'impulse',          label: 'Есть импульс' },
        { id: 'insufficient',     label: 'Подтверждения недостаточно' }
    ];

    // ================================================================
    // Утилиты
    // ================================================================
    function round(n) {
        return Math.round(n * 100) / 100;
    }

    function mkCandle(time, open, close, range, vol) {
        const high = Math.max(open, close) + range;
        const low = Math.min(open, close) - range * 0.6;
        return {
            time: time,
            open: round(open),
            high: round(high),
            low: round(low),
            close: round(close),
            volume: round(vol)
        };
    }

    // ================================================================
    // Генерация трёх сценариев
    // (источник данных для Module 1; Module 2 использует их же)
    // ================================================================

    /**
     * Сценарий 1: «Пробой без ретеста».
     * Цена у сопротивления, есть пробой телом, повышенный объём,
     * но ретеста ещё не было. Лучшее решение — WAIT.
     */
    function buildScenario1BreakoutNoRetest() {
        const startTs = Math.floor(new Date('2024-05-01T10:00:00Z').getTime() / 1000);
        const hour = 3600;
        const level = 67500;

        const history = [];
        const future = [];
        let price = 65800;

        for (let i = 0; i < 50; i++) {
            const cycle = Math.floor(i / 8);
            const inCycle = i % 8;
            let drift;
            if (cycle < 3) drift = 80 + cycle * 20;
            else if (cycle < 5) drift = -40 - inCycle * 8;
            else drift = -10 + inCycle * 5;
            const noise = Math.sin(i * 1.7) * 30 + Math.cos(i * 0.9) * 20;
            const open = price;
            const close = price + drift + noise;
            const high = Math.max(open, close) + Math.abs(noise) * 0.5 + 40;
            const low = Math.min(open, close) - Math.abs(noise) * 0.5 - 40;
            const volume = 800 + Math.abs(noise) * 10 + (cycle < 3 ? 200 : 0);
            history.push({
                time: startTs + i * hour,
                open: round(open),
                high: round(high),
                low: round(low),
                close: round(close),
                volume: round(volume)
            });
            price = close;
        }

        const futureSpec = [
            { dir: 30,  range: 50,  vol: 600  },
            { dir: 180, range: 80,  vol: 1200 },
            { dir: -120, range: 70, vol: 700 },
            { dir: 90,  range: 40,  vol: 900 },
            { dir: 150, range: 60,  vol: 1000 },
            { dir: 200, range: 70,  vol: 1500 },
            { dir: 180, range: 60,  vol: 1300 },
            { dir: 160, range: 50,  vol: 1100 },
            { dir: 140, range: 50,  vol: 1000 },
            { dir: 120, range: 40,  vol: 900 },
            { dir: 100, range: 40,  vol: 800 },
            { dir: 90,  range: 35,  vol: 700 }
        ];
        let lastClose = history[49].close;
        for (let i = 0; i < futureSpec.length; i++) {
            const f = futureSpec[i];
            const candle = mkCandle(
                startTs + (50 + i) * hour,
                lastClose,
                lastClose + f.dir,
                f.range,
                f.vol
            );
            future.push(candle);
            lastClose = candle.close;
        }

        return {
            id: 'breakout-no-retest',
            symbol: 'BTC/USDT',
            timeframe: '1H',
            title: 'Пробой без ретеста',
            level: level,
            decisionPoint: 49,
            history: history,
            future: future,
            keyMoments: {
                resistanceLevel: level,
                touchCandle: 50,
                breakoutCandle: 51,
                pullbackCandle: 52,
                retestCandle: 53,
                impulseCandle: 54
            }
        };
    }

    /**
     * Сценарий 2: «Пробой + ретест + удержание».
     * Лучшее решение — LONG (подтверждение полностью сформировано).
     */
    function buildScenario2BreakoutRetestHold() {
        const startTs = Math.floor(new Date('2024-06-15T08:00:00Z').getTime() / 1000);
        const hour = 3600;
        const level = 42800;

        const history = [];
        const future = [];
        let price = 41200;

        for (let i = 0; i < 50; i++) {
            const cycle = Math.floor(i / 10);
            const inCycle = i % 10;
            let drift;
            if (cycle < 2) drift = 90 + cycle * 15;
            else if (cycle === 2) drift = 50 - inCycle * 6;
            else if (cycle === 3) drift = -60 + inCycle * 4;
            else drift = -5 + inCycle * 2;
            const noise = Math.sin(i * 1.3) * 25 + Math.cos(i * 0.7) * 18;
            const open = price;
            const close = price + drift + noise;
            const high = Math.max(open, close) + Math.abs(noise) * 0.5 + 35;
            const low = Math.min(open, close) - Math.abs(noise) * 0.5 - 35;
            const volume = 900 + Math.abs(noise) * 12 + (cycle === 4 ? 150 : 0);
            history.push({
                time: startTs + i * hour,
                open: round(open),
                high: round(high),
                low: round(low),
                close: round(close),
                volume: round(volume)
            });
            price = close;
        }
        history[49] = {
            time: startTs + 49 * hour,
            open: round(price - 10),
            high: round(level + 50),
            low: round(level - 80),
            close: round(level - 20),
            volume: 1100
        };

        const futureSpec = [
            { dir: 140, range: 70,  vol: 1300 },
            { dir: -60, range: 50,  vol: 700 },
            { dir: 80,  range: 35,  vol: 950 },
            { dir: 50,  range: 30,  vol: 850 },
            { dir: 130, range: 55,  vol: 1100 },
            { dir: 160, range: 60,  vol: 1300 },
            { dir: 180, range: 65,  vol: 1500 },
            { dir: 170, range: 60,  vol: 1400 },
            { dir: 150, range: 55,  vol: 1200 },
            { dir: 140, range: 50,  vol: 1100 },
            { dir: 130, range: 45,  vol: 1000 },
            { dir: 120, range: 40,  vol: 900 }
        ];
        let lastClose = history[49].close;
        for (let i = 0; i < futureSpec.length; i++) {
            const f = futureSpec[i];
            const candle = mkCandle(
                startTs + (50 + i) * hour,
                lastClose,
                lastClose + f.dir,
                f.range,
                f.vol
            );
            future.push(candle);
            lastClose = candle.close;
        }

        return {
            id: 'breakout-retest-hold',
            symbol: 'ETH/USDT',
            timeframe: '1H',
            title: 'Пробой + ретест + удержание',
            level: level,
            decisionPoint: 49,
            history: history,
            future: future,
            keyMoments: {
                resistanceLevel: level,
                breakoutCandle: 50,
                pullbackCandle: 51,
                retestCandle: 52,
                holdCandle: 53,
                impulseCandle: 54
            }
        };
    }

    /**
     * Сценарий 3: «Ложный пробой».
     * Цена проколола уровень, объём не подтвердил, возврат под уровень.
     * Лучшее решение — NO TRADE.
     */
    function buildScenario3FalseBreakout() {
        const startTs = Math.floor(new Date('2024-08-10T12:00:00Z').getTime() / 1000);
        const hour = 3600;
        const level = 61200;

        const history = [];
        const future = [];
        let price = 59800;

        for (let i = 0; i < 50; i++) {
            const cycle = Math.floor(i / 10);
            const inCycle = i % 10;
            let drift;
            if (cycle < 3) drift = 70 + cycle * 12;
            else if (cycle === 3) drift = 30 - inCycle * 5;
            else drift = -15 + inCycle * 4;
            const noise = Math.sin(i * 1.5) * 22 + Math.cos(i * 0.8) * 16;
            const open = price;
            const close = price + drift + noise;
            const high = Math.max(open, close) + Math.abs(noise) * 0.5 + 30;
            const low = Math.min(open, close) - Math.abs(noise) * 0.5 - 30;
            const volume = 850 + Math.abs(noise) * 10;
            history.push({
                time: startTs + i * hour,
                open: round(open),
                high: round(high),
                low: round(low),
                close: round(close),
                volume: round(volume)
            });
            price = close;
        }

        const futureSpec = [
            { dir: 60,  range: 80,  vol: 600  },
            { dir: -150, range: 70, vol: 900 },
            { dir: -80, range: 50,  vol: 750 },
            { dir: -110, range: 60, vol: 850 },
            { dir: -90, range: 50,  vol: 700 },
            { dir: -120, range: 55, vol: 800 },
            { dir: -100, range: 50, vol: 700 },
            { dir: -80, range: 40,  vol: 600 },
            { dir: -90, range: 45,  vol: 650 },
            { dir: -70, range: 40,  vol: 550 },
            { dir: -80, range: 40,  vol: 600 },
            { dir: -60, range: 35,  vol: 500 }
        ];
        let lastClose = history[49].close;
        for (let i = 0; i < futureSpec.length; i++) {
            const f = futureSpec[i];
            const candle = mkCandle(
                startTs + (50 + i) * hour,
                lastClose,
                lastClose + f.dir,
                f.range,
                f.vol
            );
            future.push(candle);
            lastClose = candle.close;
        }

        return {
            id: 'false-breakout',
            symbol: 'SOL/USDT',
            timeframe: '1H',
            title: 'Ложный пробой',
            level: level,
            decisionPoint: 49,
            history: history,
            future: future,
            keyMoments: {
                resistanceLevel: level,
                falseBreakoutCandle: 50,
                rejectionCandle: 51,
                impulseCandle: 52
            }
        };
    }

    // ================================================================
    // Реестр сценариев
    // ================================================================
    const SCENARIOS = [
        buildScenario1BreakoutNoRetest(),
        buildScenario2BreakoutRetestHold(),
        buildScenario3FalseBreakout()
    ];

    // ================================================================
    // Helpers для отображения
    // ================================================================

    function contextLabel(ctx) {
        const map = {
            'uptrend':          'восходящий тренд',
            'downtrend':        'нисходящий тренд',
            'range':            'боковик',
            'testing_resistance':'тест сопротивления',
            'testing_support':  'тест поддержки',
            'transition':       'переходная фаза'
        };
        return map[ctx] || ctx;
    }

    function biasLabel(bias) {
        const map = {
            'bullish': 'бычий',
            'bearish': 'медвежий',
            'neutral': 'нейтральный'
        };
        return map[bias] || bias;
    }

    function signalLabel(sig) {
        const map = {
            'uptrend_structure': 'восходящая структура',
            'downtrend_structure': 'нисходящая структура',
            'range_structure': 'боковая структура',
            'strong_bullish_momentum': 'сильный бычий моментум',
            'strong_bearish_momentum': 'сильный медвежий моментум',
            'volume_climax': 'резкий рост объёма',
            'low_volume': 'низкий объём',
            'at_key_level': 'позиция у ключевого уровня',
            'multiple_level_touches': 'множественные касания уровня',
            'potential_breakout': 'потенциал пробоя',
            'price_above_resistance': 'цена выше сопротивления',
            'price_below_support': 'цена ниже поддержки'
        };
        return map[sig] || sig;
    }

    function decisionLabel(decision) {
        const map = {
            'long':     'LONG',
            'short':    'SHORT',
            'wait':     'WAIT',
            'no-trade': 'NO TRADE'
        };
        return map[decision] || decision;
    }

    function verdictToUi(verdict) {
        switch (verdict) {
            case 'correct':   return { label: 'Correct Decision',   icon: '✓', bg: 'bg-green-500/20',  text: 'text-green-400' };
            case 'risky':     return { label: 'Risky Decision',     icon: '~', bg: 'bg-yellow-500/20', text: 'text-yellow-400' };
            case 'incorrect': return { label: 'Incorrect Decision', icon: '✗', bg: 'bg-red-500/20',    text: 'text-red-400' };
            default:          return { label: 'Решение',            icon: '?', bg: 'bg-bg-700',        text: 'text-white' };
        }
    }

    // ================================================================
    // Компонент EntryConfirmationTrainer (оркестратор)
    // ================================================================

    class EntryConfirmationTrainer {
        constructor(opts) {
            this.opts = opts || {};

            // === Режим работы ===
            // 'module1' — Market Intelligence (только анализ)
            // 'module2' — Entry Confirmation (анализ → решение → оценка)
            this.moduleMode = opts.moduleMode === 'module1' ? 'module1' : 'module2';

            this.chartContainerId   = opts.chartContainerId;
            this.decisionContainerId = opts.decisionContainerId;
            this.resultContainerId  = opts.resultContainerId;
            this.reviewContainerId  = opts.reviewContainerId;
            this.statusContainerId  = opts.statusContainerId;
            this.actionContainerId  = opts.actionContainerId;

            // === Состояние ===
            this.scenarioIndex = 0;
            this.scenario = null;
            this.chart = null;
            this.candleSeries = null;
            this.volumeSeries = null;
            this.priceLine = null;
            this.markers = [];

            // === Состояние Module 2 ===
            this.selectedEvidence = new Set();
            this.selectedDecision = null;
            this.confirmed = false;
            this.playbackIndex = -1;
            this.playbackTimer = null;
            this.playbackSpeed = 850;
            this.reviewActive = false;
            this.reviewStep = 0;

            // === Состояние Module 1 ===
            this.marketAnalysis = null;          // результат MarketAnalysisEngine.analyze
            this.analysisComplete = false;        // Module 1: анализ показан
            this.showingAllCandles = false;       // Module 1: показывать ли будущие свечи

            this.allCandles = [];
            this.shownCandles = [];
        }

        // ===== Инициализация =====

        init() {
            this._loadScenario(this.scenarioIndex);
        }

        _loadScenario(index) {
            this.scenario = SCENARIOS[index];
            this.allCandles = [...this.scenario.history, ...this.scenario.future];
            this.shownCandles = [...this.scenario.history];

            // Сброс Module 2 state
            this.selectedEvidence = new Set();
            this.selectedDecision = null;
            this.confirmed = false;
            this.playbackIndex = -1;
            if (this.playbackTimer) {
                clearTimeout(this.playbackTimer);
                this.playbackTimer = null;
            }
            this.reviewActive = false;
            this.reviewStep = 0;
            this.markers = [];

            // Сброс Module 1 state
            this.marketAnalysis = null;
            this.analysisComplete = false;
            this.showingAllCandles = false;

            this._initChart();
            this._renderDecisionPanel();
            this._renderActionPanel();

            // Очистить панели результатов
            const resultEl = document.getElementById(this.resultContainerId);
            if (resultEl) { resultEl.classList.add('hidden'); resultEl.innerHTML = ''; }
            const reviewEl = document.getElementById(this.reviewContainerId);
            if (reviewEl) { reviewEl.classList.add('hidden'); reviewEl.innerHTML = ''; }

            // Сообщение о статусе зависит от режима
            if (this.moduleMode === 'module1') {
                this._updateStatus('Нажмите «Анализ рынка», чтобы получить контекст от Module 1.');
            } else {
                this._updateStatus('Шаг 1/3: Определите подтверждения на графике.');
            }
            this._updateScenarioProgress();
        }

        // ===== ScenarioChart =====

        _initChart() {
            const container = document.getElementById(this.chartContainerId);
            if (!container) {
                console.error('[ECT] chart container not found:', this.chartContainerId);
                return;
            }

            if (this.chart) {
                try { this.chart.remove(); } catch (e) { /* noop */ }
                this.chart = null;
            }
            container.innerHTML = '';

            this.chart = LightweightCharts.createChart(container, {
                width: container.clientWidth,
                height: 460,
                layout: {
                    background: { type: 'solid', color: '#050508' },
                    textColor: '#8a8a9a',
                    fontSize: 11,
                    fontFamily: 'Inter, sans-serif'
                },
                grid: {
                    vertLines: { color: 'rgba(255,255,255,0.03)' },
                    horzLines: { color: 'rgba(255,255,255,0.03)' }
                },
                crosshair: {
                    mode: LightweightCharts.CrosshairMode.Normal,
                    vertLine: { color: '#6366f1', width: 1, style: 2 },
                    horzLine: { color: '#6366f1', width: 1, style: 2 }
                },
                rightPriceScale: { borderColor: '#2a2a3a' },
                timeScale: {
                    borderColor: '#2a2a3a',
                    timeVisible: true,
                    secondsVisible: false
                }
            });

            this.candleSeries = this.chart.addCandlestickSeries({
                upColor: '#10b981',
                downColor: '#ef4444',
                borderUpColor: '#10b981',
                borderDownColor: '#ef4444',
                wickUpColor: '#10b981',
                wickDownColor: '#ef4444'
            });

            this.volumeSeries = this.chart.addHistogramSeries({
                priceFormat: { type: 'volume' },
                priceScaleId: '',
                scaleMargins: { top: 0.85, bottom: 0 }
            });
            this.volumeSeries.priceScale().applyOptions({
                scaleMargins: { top: 0.85, bottom: 0 }
            });

            this.candleSeries.setData(this.shownCandles.map(c => ({
                time: c.time, open: c.open, high: c.high, low: c.low, close: c.close
            })));
            this.volumeSeries.setData(this.shownCandles.map(c => ({
                time: c.time,
                value: c.volume,
                color: c.close >= c.open ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'
            })));

            this.priceLine = this.candleSeries.createPriceLine({
                price: this.scenario.level,
                color: '#ef4444',
                lineWidth: 1,
                lineStyle: 2,
                axisLabelVisible: true,
                title: 'Уровень $' + this.scenario.level.toLocaleString('en-US')
            });

            this._setMarker(49, 'Момент анализа', 'belowBar', '#6366f1');

            const ro = new ResizeObserver(() => {
                if (this.chart && container.clientWidth > 0) {
                    this.chart.applyOptions({ width: container.clientWidth });
                }
            });
            ro.observe(container);

            this.chart.timeScale().fitContent();
            this._setScenarioHeader();
        }

        _setMarker(idx, text, position, color) {
            const candle = this.allCandles[idx];
            if (!candle) return;
            this.markers = this.markers.filter(m => m.text !== text);
            this.markers.push({
                time: candle.time,
                position: position,
                color: color,
                shape: 'circle',
                text: text
            });
            this.markers.sort((a, b) => a.time - b.time);
            if (this.candleSeries) this.candleSeries.setMarkers(this.markers);
        }

        _clearMarkers() {
            this.markers = [];
            if (this.candleSeries) this.candleSeries.setMarkers([]);
        }

        _setScenarioHeader() {
            const titleEl = document.querySelector('[data-scenario-title]');
            if (titleEl) titleEl.textContent = this.scenario.title;
            const levelEl = document.querySelector('[data-level-price]');
            if (levelEl) levelEl.textContent = '$' + this.scenario.level.toLocaleString('en-US');
            const symbolEl = document.querySelector('[data-scenario-symbol]');
            if (symbolEl) symbolEl.textContent = this.scenario.symbol + ' • ' + this.scenario.timeframe;

            // Module badge в шапке
            const progressEl = document.querySelector('[data-scenario-progress]');
            if (progressEl) {
                const moduleLabel = this.moduleMode === 'module1' ? 'Module 1: Анализ' : 'Module 2: Подтверждение';
                progressEl.textContent = `${moduleLabel} • Сценарий ${this.scenarioIndex + 1} / ${SCENARIOS.length}`;
            }
        }

        _updateScenarioProgress() {
            const counter = document.querySelector('[data-scenario-progress]');
            if (counter) {
                const moduleLabel = this.moduleMode === 'module1' ? 'Module 1: Анализ' : 'Module 2: Подтверждение';
                counter.textContent = `${moduleLabel} • Сценарий ${this.scenarioIndex + 1} / ${SCENARIOS.length}`;
            }
        }

        // ============================================================
        // Module 1 — MarketAnalysisEngine
        // ============================================================

        /**
         * Запускает Module 1: MarketAnalysisEngine на исторических свечах.
         * Возвращает структурированный контекст рынка.
         */
        _runMarketAnalysis() {
            if (!global.MarketAnalysisEngine || typeof global.MarketAnalysisEngine.analyze !== 'function') {
                console.error('[ECT] MarketAnalysisEngine is not available');
                return null;
            }

            const result = global.MarketAnalysisEngine.analyze({
                history: this.scenario.history,
                level: this.scenario.level
            });

            this.marketAnalysis = result;
            this.analysisComplete = true;
            this._renderAnalysisPanel(result);
            this._renderActionPanel();
            this._updateStatus('Анализ рынка завершён. Контекст показан.');
            return result;
        }

        /**
         * Module 1: показать/скрыть будущие свечи на графике.
         * Позволяет увидеть, что произошло после анализа.
         */
        _toggleFutureCandles() {
            if (this.showingAllCandles) {
                this.shownCandles = [...this.scenario.history];
                this.showingAllCandles = false;
            } else {
                this.shownCandles = [...this.allCandles];
                this.showingAllCandles = true;
            }
            this.candleSeries.setData(this.shownCandles.map(c => ({
                time: c.time, open: c.open, high: c.high, low: c.low, close: c.close
            })));
            this.volumeSeries.setData(this.shownCandles.map(c => ({
                time: c.time,
                value: c.volume,
                color: c.close >= c.open ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'
            })));
            this.chart.timeScale().fitContent();
            this._renderActionPanel();
        }

        /**
         * Module 1: рендер панели с контекстом рынка.
         */
        _renderAnalysisPanel(analysis) {
            const resultEl = document.getElementById(this.resultContainerId);
            if (!resultEl) return;
            resultEl.classList.remove('hidden');

            const biasColor =
                analysis.bias === 'bullish' ? 'text-green-400' :
                analysis.bias === 'bearish' ? 'text-red-400' :
                'text-yellow-400';

            const signalsList = analysis.keySignals.length > 0
                ? analysis.keySignals.map(s =>
                    `<li class="flex items-start gap-2"><span class="text-accent-500">•</span><span>${signalLabel(s)}</span></li>`
                  ).join('')
                : '<li class="text-text-500">Явных сигналов не обнаружено.</li>';

            const reasonsList = analysis.reasons.map(r =>
                `<li class="text-sm text-text-500 leading-relaxed">— ${r}</li>`
            ).join('');

            const contextHtml = `
                <div class="space-y-4 animate-fade-slide">
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-xs font-semibold text-accent-500 uppercase tracking-wider">Module 1 — Market Context</span>
                        </div>
                        <h3 class="text-xl font-bold text-white mb-1">
                            ${contextLabel(analysis.context)}
                        </h3>
                        <p class="text-sm">
                            <span class="${biasColor} font-semibold uppercase tracking-wider">Bias: ${biasLabel(analysis.bias)}</span>
                            <span class="text-text-500"> • Уверенность: ${analysis.confidence}%</span>
                        </p>
                    </div>

                    <div class="grid grid-cols-2 gap-3">
                        <div class="bg-bg-900 rounded-xl p-3 border border-border-700">
                            <p class="text-xs text-text-500 mb-1">Структура</p>
                            <p class="text-white text-sm font-medium">${contextLabel(analysis.structure.type)}</p>
                            <p class="text-xs text-text-500 mt-1">HH:${analysis.structure.hh} HL:${analysis.structure.hl} · LH:${analysis.structure.lh} LL:${analysis.structure.ll}</p>
                        </div>
                        <div class="bg-bg-900 rounded-xl p-3 border border-border-700">
                            <p class="text-xs text-text-500 mb-1">Моментум</p>
                            <p class="text-white text-sm font-medium">${analysis.momentum.description}</p>
                            <p class="text-xs text-text-500 mt-1">Сила: ${analysis.momentum.strength}</p>
                        </div>
                        <div class="bg-bg-900 rounded-xl p-3 border border-border-700">
                            <p class="text-xs text-text-500 mb-1">Объём</p>
                            <p class="text-white text-sm font-medium">${analysis.volume.description}</p>
                            <p class="text-xs text-text-500 mt-1">×${analysis.volume.ratio} к среднему</p>
                        </div>
                        <div class="bg-bg-900 rounded-xl p-3 border border-border-700">
                            <p class="text-xs text-text-500 mb-1">Волатильность</p>
                            <p class="text-white text-sm font-medium">${analysis.volatility.description}</p>
                            <p class="text-xs text-text-500 mt-1">ATR ≈ ${analysis.volatility.atr} (${analysis.volatility.percent}%)</p>
                        </div>
                    </div>

                    <div>
                        <p class="text-xs font-semibold text-accent-500 uppercase tracking-wider mb-2">Вероятности</p>
                        <div class="flex items-center gap-3">
                            <div class="flex-1">
                                <div class="flex justify-between text-xs mb-1">
                                    <span class="text-green-400">Продолжение</span>
                                    <span class="text-white">${analysis.probabilities.continuation}%</span>
                                </div>
                                <div class="w-full bg-bg-700 rounded-full h-2">
                                    <div class="h-2 bg-green-500 rounded-full" style="width:${analysis.probabilities.continuation}%"></div>
                                </div>
                            </div>
                            <div class="flex-1">
                                <div class="flex justify-between text-xs mb-1">
                                    <span class="text-red-400">Разворот</span>
                                    <span class="text-white">${analysis.probabilities.reversal}%</span>
                                </div>
                                <div class="w-full bg-bg-700 rounded-full h-2">
                                    <div class="h-2 bg-red-500 rounded-full" style="width:${analysis.probabilities.reversal}%"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <p class="text-xs font-semibold text-accent-500 uppercase tracking-wider mb-2">Ключевые сигналы</p>
                        <ul class="space-y-1">${signalsList}</ul>
                    </div>

                    <div>
                        <p class="text-xs font-semibold text-accent-500 uppercase tracking-wider mb-2">Вывод Module 1</p>
                        <ul class="space-y-1.5 bg-bg-900 rounded-xl p-3 border border-border-700">
                            ${reasonsList}
                        </ul>
                    </div>

                    <div class="bg-bg-900 rounded-xl p-3 border border-border-700 text-xs text-text-500">
                        ⓘ Module 1 не оценивает действия пользователя и не даёт торговых рекомендаций.
                        Он только описывает состояние рынка на основе исторических свечей.
                    </div>
                </div>
            `;

            resultEl.innerHTML = contextHtml;
        }

        // ============================================================
        // UI рендеринг (общий)
        // ============================================================

        _renderDecisionPanel() {
            const el = document.getElementById(this.decisionContainerId);
            if (!el) return;

            // Module 1: только кнопка «Анализ рынка»
            if (this.moduleMode === 'module1') {
                el.innerHTML = `
                    <div class="space-y-4">
                        <div>
                            <div class="flex items-center gap-2 mb-2">
                                <span class="text-xs font-semibold text-accent-500 uppercase tracking-wider">Module 1</span>
                                <span class="text-xs text-text-500">Market Intelligence</span>
                            </div>
                            <h3 class="text-base font-semibold text-white mb-1">Получить контекст рынка</h3>
                            <p class="text-text-500 text-xs mb-3">
                                Module 1 проанализирует график и выдаст структурированный контекст:
                                тренд, моментум, объём, волатильность, уровни и вероятности.
                            </p>
                            <button id="run-analysis-btn" class="w-full py-3 bg-accent-500 text-white rounded-lg font-medium hover:bg-accent-600 transition-colors">
                                🔍 Анализ рынка
                            </button>
                            <p id="analysis-help-text" class="text-xs text-text-500 text-center mt-2">
                                Анализ работает ТОЛЬКО на исторических свечах — будущее не учитывается.
                            </p>
                        </div>
                    </div>
                `;
                const runBtn = document.getElementById('run-analysis-btn');
                if (runBtn) runBtn.addEventListener('click', () => this._runMarketAnalysis());
                return;
            }

            // Module 2: чекбоксы подтверждений + кнопки решения + подтверждение
            const checkboxesHtml = EVIDENCE_OPTIONS.map(opt => `
                <label class="flex items-center gap-3 py-2 px-3 bg-bg-900 rounded-lg cursor-pointer hover:bg-bg-700 transition-colors border border-transparent hover:border-border-700">
                    <input type="checkbox" data-evidence="${opt.id}" class="ect-checkbox w-4 h-4 accent-accent-500 cursor-pointer" />
                    <span class="text-text-500 text-sm">${opt.label}</span>
                </label>
            `).join('');

            // Запустить Module 1 ДО рендера панели решений, чтобы получить контекст
            // для динамического выбора подходящих вариантов.
            if (!this.marketAnalysis) {
                this._runMarketAnalysis();
            }

            // Получить динамический набор вариантов
            const options = this._selectDynamicOptions();

            el.innerHTML = `
                <div class="space-y-5">
                    <div id="module1-context-summary"></div>

                    <!-- Этап 1: Анализ ситуации -->
                    <div>
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-xs font-semibold text-accent-500 uppercase tracking-wider">Шаг 1 из 3</span>
                            <span class="text-xs text-text-500">Анализ</span>
                        </div>
                        <h3 class="text-base font-semibold text-white mb-1">Какие подтверждения уже присутствуют?</h3>
                        <p class="text-text-500 text-xs mb-3">Отметьте всё, что видите на графике. Можно выбрать несколько вариантов.</p>
                        <div class="space-y-1.5" id="evidence-list">
                            ${checkboxesHtml}
                        </div>
                    </div>

                    <!-- Этап 2: Принятие решения -->
                    <div class="pt-4 border-t border-border-700">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-xs font-semibold text-accent-500 uppercase tracking-wider">Шаг 2 из 3</span>
                            <span class="text-xs text-text-500">Решение</span>
                        </div>
                        <h3 class="text-base font-semibold text-white mb-1">Какое решение сейчас наиболее оправдано?</h3>
                        <p class="text-text-500 text-xs mb-3">
                            ${options.length} вариантов, подобранных под текущий контекст.
                        </p>
                        <div class="space-y-2" id="decision-buttons">
                            ${this._renderDynamicOptions(options)}
                        </div>

                        <!-- Карточка деталей выбранного решения -->
                        <div id="decision-detail-card" class="hidden mt-3"></div>
                    </div>

                    <!-- Этап 3: Подтверждение -->
                    <div class="pt-4 border-t border-border-700">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-xs font-semibold text-accent-500 uppercase tracking-wider">Шаг 3 из 3</span>
                            <span class="text-xs text-text-500">Подтверждение</span>
                        </div>
                        <button id="confirm-decision-btn" class="w-full py-3 bg-accent-500 text-white rounded-lg font-medium hover:bg-accent-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed" disabled>
                            Подтвердить решение
                        </button>
                        <p id="decision-locked-note" class="text-xs text-text-500 text-center mt-2 hidden">
                            Решение зафиксировано. Подождите окончания проигрывания.
                        </p>
                    </div>
                </div>
            `;

            el.querySelectorAll('.ect-checkbox').forEach(cb => {
                cb.addEventListener('change', (e) => this._toggleEvidence(e.target.dataset.evidence, e.target.checked));
            });
            el.querySelectorAll('.decision-btn').forEach(btn => {
                btn.addEventListener('click', () => this._selectDecision(btn.dataset.decision));
            });
            const confirmBtn = document.getElementById('confirm-decision-btn');
            if (confirmBtn) confirmBtn.addEventListener('click', () => this._confirmDecision());

            this._renderModule1CompactSummary();
        }

        /**
         * Module 2: получить динамический набор вариантов решений,
         * подходящих под текущий контекст рынка.
         */
        _selectDynamicOptions() {
            if (!global.DecisionOptionsCatalog) {
                console.error('[ECT] DecisionOptionsCatalog not available');
                return [];
            }
            if (!this.marketAnalysis) {
                this._runMarketAnalysis();
            }
            const options = global.DecisionOptionsCatalog.selectOptions(this.marketAnalysis, {
                maxOptions: 7,
                minOptions: 5
            });
            this.currentOptions = options;
            return options;
        }

        /**
         * Module 2: рендер кнопок динамических решений.
         * Каждая кнопка показывает: иконку, короткое название, риск-бейдж, R:R.
         */
        _renderDynamicOptions(options) {
            const colorMap = {
                'green':  { bg: 'bg-green-500/10',  border: 'border-green-500/30',  hover: 'hover:bg-green-500/20' },
                'red':    { bg: 'bg-red-500/10',    border: 'border-red-500/30',    hover: 'hover:bg-red-500/20' },
                'yellow': { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', hover: 'hover:bg-yellow-500/20' },
                'blue':   { bg: 'bg-blue-500/10',   border: 'border-blue-500/30',   hover: 'hover:bg-blue-500/20' },
                'gray':   { bg: 'bg-gray-500/10',   border: 'border-gray-500/30',   hover: 'hover:bg-gray-500/20' },
                'orange': { bg: 'bg-orange-500/10', border: 'border-orange-500/30', hover: 'hover:bg-orange-500/20' },
                'purple': { bg: 'bg-purple-500/10', border: 'border-purple-500/30', hover: 'hover:bg-purple-500/20' }
            };

            const riskBadge = {
                'low':    { text: 'Низкий риск',  cls: 'text-green-400' },
                'medium': { text: 'Средний риск', cls: 'text-yellow-400' },
                'high':   { text: 'Высокий риск', cls: 'text-red-400' }
            };

            return options.map(opt => {
                const colors = colorMap[opt.color] || colorMap.gray;
                const risk = riskBadge[opt.riskLevel] || riskBadge.medium;
                return `
                    <button data-decision="${opt.id}"
                            class="decision-btn w-full text-left p-3 rounded-lg transition-colors border ${colors.border} ${colors.bg} ${colors.hover}">
                        <div class="flex items-center justify-between gap-3">
                            <div class="flex items-center gap-2 min-w-0">
                                <span class="text-lg">${opt.icon}</span>
                                <div class="min-w-0">
                                    <div class="text-white font-semibold text-sm">${opt.shortLabel}</div>
                                    <div class="text-text-500 text-xs truncate">${opt.description}</div>
                                </div>
                            </div>
                            <div class="text-right flex-shrink-0">
                                <div class="text-xs ${risk.cls} font-medium">${risk.text}</div>
                                <div class="text-xs text-text-500">R:R ${opt.rrExpectation}</div>
                            </div>
                        </div>
                    </button>
                `;
            }).join('');
        }

        /**
         * Module 2: детальная карточка выбранного решения.
         * Показывает: риск, способ входа, требуемые/рекомендованные подтверждения.
         */
        _renderDecisionDetail() {
            const card = document.getElementById('decision-detail-card');
            if (!card) return;
            if (!this.selectedDecisionId || !global.DecisionOptionsCatalog) {
                card.classList.add('hidden');
                card.innerHTML = '';
                return;
            }
            const opt = global.DecisionOptionsCatalog.getDecisionById(this.selectedDecisionId);
            if (!opt) {
                card.classList.add('hidden');
                return;
            }

            const required = opt.requiredEvidence || [];
            const recommended = opt.recommendedEvidence || [];
            const userSet = this.selectedEvidence;

            const evidenceLabels = {
                'breakout':     'пробой',
                'close-above':  'закрытие за уровнем',
                'high-volume':  'объём',
                'retest':       'ретест',
                'hold':         'удержание',
                'impulse':      'импульс',
                'insufficient': 'недостаточно'
            };

            const renderBadge = (id) => {
                const checked = userSet.has(id);
                const label = evidenceLabels[id] || id;
                const isReq = required.includes(id);
                let colorClass;
                if (checked && isReq)       colorClass = 'bg-green-500/20 text-green-400 border-green-500/40';
                else if (checked && !isReq)  colorClass = 'bg-blue-500/20 text-blue-400 border-blue-500/40';
                else if (!checked && isReq)  colorClass = 'bg-red-500/20 text-red-400 border-red-500/40';
                else                          colorClass = 'bg-bg-950 text-text-500 border-border-700';
                const icon = checked ? '✓' : (isReq ? '!' : '·');
                return `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${colorClass}">
                            <span class="font-bold">${icon}</span>${label}${isReq ? ' *' : ''}
                        </span>`;
            };

            const riskColor = opt.riskLevel === 'high' ? 'text-red-400'
                            : opt.riskLevel === 'low'  ? 'text-green-400'
                            : 'text-yellow-400';

            const entryStyleLabel = {
                'immediate':   'Сразу по рынку',
                'on-pullback': 'На откате',
                'on-breakout': 'На пробое',
                'gradual':     'Поэтапно (2–3 входа)',
                'conditional': 'После подтверждения'
            };

            card.classList.remove('hidden');
            card.innerHTML = `
                <div class="bg-bg-900 rounded-xl p-4 border border-border-700 space-y-3">
                    <div>
                        <div class="text-xs font-semibold text-accent-500 uppercase tracking-wider mb-1">${opt.label}</div>
                        <p class="text-sm text-text-500">${opt.logic}</p>
                    </div>

                    <div class="grid grid-cols-3 gap-2 text-xs">
                        <div>
                            <p class="text-text-500">Риск</p>
                            <p class="${riskColor} font-semibold">${
                                opt.riskLevel === 'high' ? 'Высокий' :
                                opt.riskLevel === 'low'  ? 'Низкий'  : 'Средний'
                            }</p>
                        </div>
                        <div>
                            <p class="text-text-500">Способ входа</p>
                            <p class="text-white font-medium">${entryStyleLabel[opt.entryStyle] || opt.entryStyle}</p>
                        </div>
                        <div>
                            <p class="text-text-500">R:R</p>
                            <p class="text-white font-medium">${opt.rrExpectation}</p>
                        </div>
                    </div>

                    ${required.length > 0 ? `
                    <div>
                        <p class="text-xs text-text-500 mb-1">Обязательные подтверждения <span class="text-red-400">*</span></p>
                        <div class="flex flex-wrap gap-1.5">${required.map(renderBadge).join('')}</div>
                    </div>` : ''}

                    ${recommended.length > 0 ? `
                    <div>
                        <p class="text-xs text-text-500 mb-1">Рекомендованные подтверждения</p>
                        <div class="flex flex-wrap gap-1.5">${recommended.map(renderBadge).join('')}</div>
                    </div>` : ''}

                    ${required.length > 0 ? `
                    <div class="text-xs text-text-500 bg-bg-950 rounded-lg p-2 border border-border-700">
                        <span class="text-red-400 font-semibold">*</span> — обязательное подтверждение.
                        Если не отмечено — оценка будет ниже.
                    </div>` : ''}
                </div>
            `;
        }

        /**
         * Module 2: показать краткую сводку Module 1 над панелью подтверждений.
         * Это НЕ переоценка графика — это просто компактный показ результата Module 1.
         */
        _renderModule1CompactSummary() {
            const wrap = document.getElementById('module1-context-summary');
            if (!wrap || !this.marketAnalysis) return;
            const a = this.marketAnalysis;
            const biasColor = a.bias === 'bullish' ? 'text-green-400'
                            : a.bias === 'bearish' ? 'text-red-400'
                            : 'text-yellow-400';
            wrap.innerHTML = `
                <div class="bg-bg-900 rounded-xl p-3 border border-border-700">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-semibold text-accent-500 uppercase tracking-wider">Module 1 → Контекст</span>
                        <span class="text-xs ${biasColor} font-semibold uppercase">${biasLabel(a.bias)}</span>
                    </div>
                    <p class="text-sm text-white">${contextLabel(a.context)} <span class="text-text-500">· ${a.confidence}% уверенности</span></p>
                    <p class="text-xs text-text-500 mt-1">${a.momentum.description} · ${a.volume.description}</p>
                    <p class="text-xs text-text-500">Продолжение ≈ ${a.probabilities.continuation}% · Разворот ≈ ${a.probabilities.reversal}%</p>
                </div>
            `;
        }

        _toggleEvidence(id, checked) {
            if (this.confirmed) return;
            if (checked) this.selectedEvidence.add(id);
            else this.selectedEvidence.delete(id);
            this._updateConfirmButton();

            const insufBox = document.querySelector('[data-evidence="insufficient"]');
            if (insufBox) {
                if (this.selectedEvidence.has('insufficient') && this.selectedEvidence.size > 1) {
                    insufBox.parentElement.classList.add('ring-1', 'ring-yellow-500/50');
                } else {
                    insufBox.parentElement.classList.remove('ring-1', 'ring-yellow-500/50');
                }
            }
        }

        _selectDecision(value) {
            if (this.confirmed) return;
            this.selectedDecision = value;
            this.selectedDecisionId = value;
            const btns = document.querySelectorAll('#' + this.decisionContainerId + ' .decision-btn');
            btns.forEach(b => {
                const active = b.dataset.decision === value;
                b.classList.remove(
                    'bg-bg-600', 'text-white', 'border-accent-500',
                    'bg-bg-700', 'text-text-500'
                );
                if (active) {
                    b.classList.add('bg-bg-600', 'text-white', 'border-accent-500');
                } else {
                    b.classList.add('bg-bg-700', 'text-text-500');
                }
            });
            this._renderDecisionDetail();
            this._updateConfirmButton();
        }

        _updateConfirmButton() {
            const btn = document.getElementById('confirm-decision-btn');
            if (!btn) return;
            btn.disabled = !(this.selectedDecision && this.selectedEvidence.size > 0);
        }

        _confirmDecision() {
            if (!this.selectedDecision || this.confirmed) return;
            if (this.selectedEvidence.size === 0) return;

            // Проверить, что Module 1 отработал
            if (!this.marketAnalysis) {
                this._runMarketAnalysis();
            }
            this.confirmed = true;

            document.querySelectorAll('#' + this.decisionContainerId + ' .ect-checkbox').forEach(cb => {
                cb.disabled = true;
                cb.parentElement.classList.add('opacity-60', 'pointer-events-none');
            });
            const btns = document.querySelectorAll('#' + this.decisionContainerId + ' .decision-btn');
            btns.forEach(b => {
                b.disabled = true;
                b.classList.add('opacity-50', 'cursor-not-allowed');
            });
            const confirmBtn = document.getElementById('confirm-decision-btn');
            if (confirmBtn) {
                confirmBtn.disabled = true;
                confirmBtn.classList.add('opacity-50', 'cursor-not-allowed');
            }
            const note = document.getElementById('decision-locked-note');
            if (note) note.classList.remove('hidden');

            this._updateStatus('Проигрывание сценария…');
            this._startPlayback();
        }

        // ===== PlaybackEngine =====

        _startPlayback() {
            this.playbackIndex = this.scenario.decisionPoint;
            this._stepPlayback();
        }

        _stepPlayback() {
            this.playbackIndex++;
            if (this.playbackIndex >= this.allCandles.length) {
                this._onPlaybackComplete();
                return;
            }

            const candle = this.allCandles[this.playbackIndex];
            this.shownCandles.push(candle);

            this.candleSeries.update({
                time: candle.time,
                open: candle.open, high: candle.high,
                low: candle.low, close: candle.close
            });
            this.volumeSeries.update({
                time: candle.time,
                value: candle.volume,
                color: candle.close >= candle.open ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'
            });

            this.chart.timeScale().fitContent();

            this.playbackTimer = setTimeout(() => this._stepPlayback(), this.playbackSpeed);
        }

        _onPlaybackComplete() {
            this.playbackTimer = null;
            this._updateStatus('Сценарий завершён.');
            this._showResult();
        }

        // ============================================================
        // Module 2 — DecisionEvaluationEngine
        // ============================================================

        /**
         * Вызывается после проигрывания. Запускает DecisionEvaluationEngine
         * на основе результата Module 1 (НЕ пересчитывая рынок).
         */
        _showResult() {
            if (!global.DecisionEvaluationEngine || typeof global.DecisionEvaluationEngine.evaluate !== 'function') {
                console.error('[ECT] DecisionEvaluationEngine is not available');
                return;
            }
            if (!this.marketAnalysis) {
                console.error('[ECT] Module 1 output missing — Module 2 cannot evaluate');
                return;
            }

            const verdict = global.DecisionEvaluationEngine.evaluate({
                marketAnalysis: this.marketAnalysis,
                userDecision: this.selectedDecision,
                userEvidence: Array.from(this.selectedEvidence)
            });

            const el = document.getElementById(this.resultContainerId);
            if (!el) return;

            el.classList.remove('hidden');
            el.innerHTML = this._renderVerdictHtml(verdict);
            this._renderActionPanel();
        }

        _renderVerdictHtml(verdict) {
            const ui = verdictToUi(verdict.verdict);
            const exp = verdict.explanation || {};

            const matchBlock = (exp.evidence && exp.evidence.length > 0)
                ? `
                <div class="pt-3 border-t border-border-700">
                    <p class="text-xs font-semibold uppercase tracking-wider text-text-500 mb-2">Аргументы Module 1</p>
                    <ul class="space-y-1.5">
                        ${exp.evidence.map(t => `<li class="text-xs text-text-500 leading-relaxed">— ${t}</li>`).join('')}
                    </ul>
                </div>`
                : '';

            const altBlock = exp.betterAlternative
                ? `<div class="bg-bg-900 rounded-xl p-3 border border-border-700 mt-3">
                       <p class="text-xs text-text-500">Альтернатива</p>
                       <p class="text-white font-medium">
                           ${(exp.betterAlternative.shortLabel || exp.betterAlternative.label || exp.betterAlternative.id || '—')}
                       </p>
                       ${exp.betterAlternative.logic
                           ? `<p class="text-xs text-text-500 mt-1">${exp.betterAlternative.logic}</p>`
                           : ''}
                   </div>`
                : '';

            return `
                <div class="space-y-4 animate-fade-slide">
                    <div class="text-center">
                        <div class="inline-flex items-center justify-center w-14 h-14 rounded-full ${ui.bg} mb-3">
                            <span class="text-2xl">${ui.icon}</span>
                        </div>
                        <h3 class="text-xl font-bold ${ui.text}">${ui.label}</h3>
                        <p class="text-xs text-text-500 mt-1">
                            Score: ${verdict.score} · Market Context: ${contextLabel(verdict.meta.marketContext)}
                            · Bias: ${biasLabel(verdict.meta.bias)} (${verdict.meta.confidence}%)
                        </p>
                    </div>

                    <div class="bg-bg-900 rounded-xl p-3 border border-border-700">
                        <p class="text-xs font-semibold uppercase tracking-wider text-accent-500 mb-1">Соответствие контексту</p>
                        <p class="text-sm text-white leading-relaxed">${exp.match || '—'}</p>
                    </div>

                    ${matchBlock}

                    <div class="bg-bg-900 rounded-xl p-3 border border-border-700">
                        <p class="text-xs font-semibold uppercase tracking-wider text-text-500 mb-1">Оценка риска</p>
                        <p class="text-sm text-text-500 leading-relaxed">${exp.risk || '—'}</p>
                    </div>

                    ${altBlock}

                    <div class="text-xs text-text-500 bg-bg-900 rounded-xl p-3 border border-border-700">
                        ⓘ Вердикт выдан Module 2 на основании контекста, предоставленного Module 1.
                        График после момента решения НЕ анализировался.
                    </div>
                </div>
            `;
        }

        // ===== Action Panel =====

        _renderActionPanel() {
            const el = document.getElementById(this.actionContainerId);
            if (!el) return;

            // === Module 1: кнопки ===
            if (this.moduleMode === 'module1') {
                if (this.analysisComplete) {
                    el.innerHTML = `
                        <div class="grid grid-cols-2 gap-2">
                            <button id="toggle-future-btn" class="py-3 bg-bg-700 text-white rounded-lg font-medium hover:bg-accent-500 transition-colors border border-border-700">
                                ${this.showingAllCandles ? 'Скрыть будущие свечи' : 'Показать будущие свечи'}
                            </button>
                            <button id="next-scenario-btn" class="py-3 bg-bg-700 text-white rounded-lg font-medium hover:bg-accent-500 transition-colors border border-border-700">
                                ${this.scenarioIndex >= SCENARIOS.length - 1 ? 'Начать сначала' : 'Следующий сценарий'}
                            </button>
                        </div>
                        <button id="restart-btn" class="w-full mt-2 py-2 bg-transparent text-text-500 text-xs rounded-lg font-medium hover:text-white transition-colors">
                            Повторить этот сценарий
                        </button>
                    `;
                    const futureBtn = document.getElementById('toggle-future-btn');
                    if (futureBtn) futureBtn.addEventListener('click', () => this._toggleFutureCandles());
                    document.getElementById('next-scenario-btn').addEventListener('click', () => this._nextScenario());
                    document.getElementById('restart-btn').addEventListener('click', () => this.restart());
                } else {
                    el.innerHTML = '';
                }
                return;
            }

            // === Module 2: кнопки ===
            if (this.confirmed && this.playbackTimer === null && !this.reviewActive) {
                const isLastScenario = this.scenarioIndex >= SCENARIOS.length - 1;
                el.innerHTML = `
                    <div class="grid grid-cols-2 gap-2">
                        <button id="review-btn" class="py-3 bg-bg-700 text-white rounded-lg font-medium hover:bg-accent-500 transition-colors border border-border-700">
                            Показать разбор
                        </button>
                        <button id="next-scenario-btn" class="py-3 bg-bg-700 text-white rounded-lg font-medium hover:bg-accent-500 transition-colors border border-border-700">
                            ${isLastScenario ? 'Начать сначала' : 'Следующий сценарий'}
                        </button>
                    </div>
                    <button id="restart-btn" class="w-full mt-2 py-2 bg-transparent text-text-500 text-xs rounded-lg font-medium hover:text-white transition-colors">
                        Повторить этот сценарий
                    </button>
                `;
                document.getElementById('review-btn').addEventListener('click', () => this._startReview());
                document.getElementById('next-scenario-btn').addEventListener('click', () => this._nextScenario());
                document.getElementById('restart-btn').addEventListener('click', () => this.restart());
            } else {
                el.innerHTML = '';
            }
        }

        _nextScenario() {
            this.scenarioIndex = (this.scenarioIndex + 1) % SCENARIOS.length;
            this._loadScenario(this.scenarioIndex);
        }

        // ===== ReviewPanel (Module 2) =====

        _startReview() {
            this.reviewActive = true;
            this.reviewStep = 0;
            this._updateStatus('Разбор сценария. Нажимайте «Далее».');

            const el = document.getElementById(this.reviewContainerId);
            el.classList.remove('hidden');
            el.innerHTML = `
                <div class="space-y-3">
                    <p class="text-sm text-text-500" id="review-text">
                        Разбор ключевых моментов сценария.
                    </p>
                    <div class="flex items-center gap-2">
                        <button id="review-next-btn" class="px-4 py-2 bg-accent-500 text-white rounded-lg text-sm font-medium hover:bg-accent-600 transition-colors">
                            Далее
                        </button>
                        <span class="text-xs text-text-500" id="review-step-indicator"></span>
                    </div>
                </div>
            `;
            document.getElementById('review-next-btn').addEventListener('click', () => this._reviewNext());
            this._applyReviewStep(0);
            this._renderActionPanel();
        }

        _reviewNext() {
            const totalSteps = this._reviewTotalSteps();
            this.reviewStep++;
            if (this.reviewStep >= totalSteps) {
                this._endReview();
                return;
            }
            this._applyReviewStep(this.reviewStep);
        }

        _reviewTotalSteps() {
            const km = this.scenario.keyMoments;
            let count = 1;
            ['touchCandle', 'falseBreakoutCandle', 'breakoutCandle', 'pullbackCandle', 'retestCandle', 'holdCandle', 'rejectionCandle', 'impulseCandle']
                .forEach(k => { if (km[k] !== undefined) count++; });
            return count;
        }

        _applyReviewStep(step) {
            const text = document.getElementById('review-text');
            const indicator = document.getElementById('review-step-indicator');
            const km = this.scenario.keyMoments;
            const total = this._reviewTotalSteps();

            this._clearMarkers();

            if (step === 0) {
                text.textContent = 'Шаг 1 / ' + total + ': ключевой уровень $' + km.resistanceLevel.toLocaleString('en-US') + '. На момент решения цена находилась именно здесь.';
                indicator.textContent = '1 / ' + total;
                if (this.priceLine) this.priceLine.applyOptions({ color: '#ef4444', lineWidth: 2 });
                return;
            }

            const order = [
                { key: 'touchCandle',          label: 'Касание',           color: '#f59e0b',
                  desc: 'Первая реакция цены — касание уровня. Это ещё не подтверждение.' },
                { key: 'falseBreakoutCandle',  label: 'Ложный пробой',     color: '#f59e0b',
                  desc: 'Тонкая свеча проколола уровень — это ложный пробой. Объём не подтвердил движение.' },
                { key: 'breakoutCandle',       label: 'Пробой',            color: '#3b82f6',
                  desc: 'Импульс через уровень. Без ретеста это ещё не сигнал — пробои часто оказываются ложными.' },
                { key: 'pullbackCandle',       label: 'Откат',             color: '#a855f7',
                  desc: 'Откат к пробитому уровню. Именно здесь формируется проверка истинности пробоя.' },
                { key: 'retestCandle',         label: 'Ретест (вход)',     color: '#10b981',
                  desc: 'Ретест уровня сверху. Это качественная точка входа — подтверждение = ретест.' },
                { key: 'holdCandle',           label: 'Удержание',         color: '#10b981',
                  desc: 'Удержание над уровнем. Покупатели сохраняют контроль — структура подтверждена.' },
                { key: 'rejectionCandle',      label: 'Отбой',             color: '#ef4444',
                  desc: 'Резкий отбой от уровня. Сопротивление устояло — сделки против тренда не оправданы.' },
                { key: 'impulseCandle',        label: 'Импульс',           color: '#10b981',
                  desc: 'После подтверждения цена уходит в импульс. Это и есть вознаграждение за ожидание.' }
            ];

            const idx = step - 1;
            const found = [];
            for (const item of order) {
                if (km[item.key] !== undefined) found.push({ ...item, candleIdx: km[item.key] });
            }
            if (idx < found.length) {
                const f = found[idx];
                text.textContent = 'Шаг ' + (step + 1) + ' / ' + total + ': ' + f.desc;
                indicator.textContent = (step + 1) + ' / ' + total;
                this._setMarker(f.candleIdx, f.label, 'aboveBar', f.color);
                if (this.priceLine) this.priceLine.applyOptions({ color: '#ef4444', lineWidth: 2 });
            }
        }

        _endReview() {
            this.reviewActive = false;
            this._clearMarkers();
            const el = document.getElementById(this.reviewContainerId);
            if (el) {
                el.innerHTML = '';
                el.classList.add('hidden');
            }
            this._updateStatus('Разбор завершён.');
            this._renderActionPanel();
        }

        // ===== Restart =====

        restart() {
            if (this.playbackTimer) {
                clearTimeout(this.playbackTimer);
                this.playbackTimer = null;
            }
            this._loadScenario(this.scenarioIndex);
        }

        // ===== Helpers =====

        _updateStatus(text) {
            const el = document.getElementById(this.statusContainerId);
            if (el) el.textContent = text;
        }
    }

    // Глобальный экспорт
    global.EntryConfirmationTrainer = EntryConfirmationTrainer;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = EntryConfirmationTrainer;
    }
})(typeof window !== 'undefined' ? window : globalThis);
