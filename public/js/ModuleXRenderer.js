/**
 * ModuleXRenderer — Отрисовка результатов анализа Module X непосредственно на графике.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  Принимает результат analyzeSMC() / analyzeMarketStructure() и рисует на
 *  графике Lightweight Charts:
 *    - HH / HL / LH / LL — горизонтальные пунктирные линии с подписями
 *    - BOS / CHoCH / MSS — стрелки-маркеры над/под свечами
 *    - Order Blocks — полупрозрачные прямоугольники
 *    - Fair Value Gaps — заштрихованные зоны
 *    - Liquidity Sweeps — крестики-маркеры
 *    - Equal Highs / Lows — горизонтальные пунктирные линии
 *    - Displacement — крупные маркеры-стрелки
 *
 *  Стиль: профессиональный, минималистичный (как индикаторы TradingView).
 *  Цветовая палитра:
 *    - Бычий: #26a69a (зелёный)
 *    - Медвежий: #ef5350 (красный)
 *    - Нейтральный: #d4af37 (золотой)
 *    - OB / FVG: rgba(...) с прозрачностью 0.15-0.25
 *
 *  Использование:
 *    const renderer = new ModuleXRenderer(chart, candleSeries);
 *    const handles = renderer.draw(moduleXResult);
 *    renderer.setEnabled(false); // скрыть, не удалять
 *    renderer.clear(); // удалить всё
 *
 *  События:
 *    chart.subscribeClick((params) => ...) — клик пользователя
 *    renderer.handleClick(params) — обрабатывает клик и возвращает info
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (global) {
    'use strict';

    if (!global) {
        throw new Error('[ModuleXRenderer] global is required');
    }

    // Цветовая палитра (TradingView-стиль)
    const COLORS = {
        bullish: '#26a69a',
        bullishSoft: 'rgba(38, 166, 154, 0.18)',
        bullishLine: 'rgba(38, 166, 154, 0.55)',
        bearish: '#ef5350',
        bearishSoft: 'rgba(239, 83, 80, 0.18)',
        bearishLine: 'rgba(239, 83, 80, 0.55)',
        neutral: '#d4af37',
        neutralSoft: 'rgba(212, 175, 55, 0.18)',
        neutralLine: 'rgba(212, 175, 55, 0.55)',
        background: 'rgba(20, 20, 28, 0.85)'
    };

    // Описания паттернов для интерактивной карточки
    const PATTERN_INFO = {
        HH: {
            name: 'Higher High',
            fullName: 'Higher High (Более высокий максимум)',
            category: 'Market Structure',
            description: 'Свеча, которая сформировала максимум выше предыдущего свинг-хая. Подтверждает восходящий тренд.',
            importance: 'Ключевой признак бычьего тренда. Вместе с HL формирует восходящую структуру.',
            impact: 'Подтверждает продолжение бычьего движения'
        },
        HL: {
            name: 'Higher Low',
            fullName: 'Higher Low (Более высокий минимум)',
            category: 'Market Structure',
            description: 'Свеча, которая сформировала минимум выше предыдущего свинг-лоя. Подтверждает восходящий тренд.',
            importance: 'Ключевой признак бычьего тренда. Показывает, что покупатели контролируют откаты.',
            impact: 'Подтверждает силу бычьего тренда'
        },
        LH: {
            name: 'Lower High',
            fullName: 'Lower High (Более низкий максимум)',
            category: 'Market Structure',
            description: 'Свеча, которая сформировала максимум ниже предыдущего свинг-хая. Признак нисходящего тренда.',
            importance: 'Первый признак возможной смены тренда или продолжения медвежьего движения.',
            impact: 'Сигнал ослабления бычьего давления'
        },
        LL: {
            name: 'Lower Low',
            fullName: 'Lower Low (Более низкий минимум)',
            category: 'Market Structure',
            description: 'Свеча, которая сформировала минимум ниже предыдущего свинг-лоя. Подтверждает нисходящий тренд.',
            importance: 'Ключевой признак медвежьего тренда. Показывает контроль продавцов.',
            impact: 'Подтверждает продолжение медвежьего движения'
        },
        BOS: {
            name: 'BOS',
            fullName: 'Break of Structure (Пробой структуры)',
            category: 'Smart Money',
            description: 'Пробой предыдущего свинг-хая (для бычьего BOS) или свинг-лоя (для медвежьего). Подтверждает продолжение текущего тренда.',
            importance: 'Сильнейший сигнал продолжения тренда. Часто сопровождается импульсом (displacement).',
            impact: 'Подтверждает направление текущего тренда'
        },
        CHoCH: {
            name: 'CHoCH',
            fullName: 'Change of Character (Смена характера)',
            category: 'Smart Money',
            description: 'Первый пробой структуры в противоположном направлении. Сигнал возможной смены тренда.',
            importance: 'Критический сигнал разворота. Означает, что тренд, возможно, сменился.',
            impact: 'Сигнал возможной смены тренда'
        },
        MSS: {
            name: 'MSS',
            fullName: 'Market Structure Shift (Сдвиг структуры)',
            category: 'Smart Money',
            description: 'Разновидность BOS, который происходит после смены характера движения. Более сильный сигнал разворота.',
            importance: 'Сильный сигнал смены тренда. Часто сопровождается образованием новых Order Block.',
            impact: 'Подтверждает смену тренда'
        },
        OB: {
            name: 'Order Block',
            fullName: 'Order Block (Зона институционального интереса)',
            category: 'Smart Money',
            description: 'Последняя противоположная свеча перед сильным импульсом (BOS). Зона, откуда институционалы открывали позиции.',
            importance: 'Ключевая зона для входа. Цена часто возвращается к Order Block для ретеста перед продолжением движения.',
            impact: 'Зона входа с высокой вероятностью отработки'
        },
        FVG: {
            name: 'FVG',
            fullName: 'Fair Value Gap (Зона справедливой цены)',
            category: 'Smart Money',
            description: 'Разрыв между экстремумами трёх последовательных свечей, где цена двигалась слишком быстро. Зона, которую цена часто "заполняет" перед продолжением.',
            importance: 'Зона ликвидности. Цена стремится вернуться и заполнить этот гэп.',
            impact: 'Зона возможного возврата цены'
        },
        LiquiditySweep: {
            name: 'Liquidity Sweep',
            fullName: 'Liquidity Sweep (Снятие ликвидности)',
            category: 'Smart Money',
            description: 'Ситуация, когда цена кратковременно пробивает значимый уровень (собирает стопы), а затем быстро возвращается. Ловушка для розничных трейдеров.',
            importance: 'Сигнал продолжения противоположного движения. Институционалы "пьют" стопы розницы.',
            impact: 'Подтверждает продолжение тренда'
        },
        EqualHighs: {
            name: 'Equal Highs',
            fullName: 'Equal Highs (Равные максимумы)',
            category: 'Liquidity',
            description: 'Две или более свечи с одинаковыми максимумами. Формируют зону скопления стоп-ордеров выше.',
            importance: 'Зона ликвидности. Высока вероятность снятия стопов выше этих максимумов.',
            impact: 'Потенциальная зона снятия ликвидности'
        },
        EqualLows: {
            name: 'Equal Lows',
            fullName: 'Equal Lows (Равные минимумы)',
            category: 'Liquidity',
            description: 'Две или более свечи с одинаковыми минимумами. Формируют зону скопления стоп-ордеров ниже.',
            importance: 'Зона ликвидности. Высока вероятность снятия стопов ниже этих минимумов.',
            impact: 'Потенциальная зона снятия ликвидности'
        },
        Displacement: {
            name: 'Displacement',
            fullName: 'Displacement (Импульсное движение)',
            category: 'Price Action',
            description: 'Серия крупных свечей в одном направлении, часто с FVG. Указывает на сильное институциональное движение.',
            importance: 'Сильный сигнал продолжения. Часто сопровождает BOS и формирует Order Block.',
            impact: 'Подтверждает силу текущего движения'
        }
    };

    class ModuleXRenderer {
        constructor(chart, candleSeries, options) {
            if (!chart) throw new Error('[ModuleXRenderer] chart is required');
            if (!candleSeries) throw new Error('[ModuleXRenderer] candleSeries is required');

            this.chart = chart;
            this.candleSeries = candleSeries;
            this.options = Object.assign({
                showMarketStructure: true,
                showSmartMoney: true,
                showLiquidity: true,
                showPriceAction: true,
                showOBZones: true,
                showFVGZones: true,
                enabled: true
            }, options || {});

            // Лимиты по умолчанию (минимум, чтобы график оставался чистым).
            // Настраиваются через UI через setLimits().
            this._limits = {
                fvg: 2,              // 2-3 FVG
                orderBlocks: 2,      // 2-3 Order Block
                bos: 1,              // только последний значимый
                choch: 1,            // только последний значимый
                mss: 1,              // только последний
                displacement: 2,     // 2 displacement
                liquiditySweep: 2,   // 2 снятия ликвидности
                equalHighsLows: 2,   // 2 зоны эквивалентных high/low
                support: 2,          // 2 уровня поддержки
                resistance: 2,       // 2 уровня сопротивления
                hh: 4, hl: 4, lh: 4, ll: 4,  // структурные точки (умеренно)
                onlyViewport: true   // рисовать только то, что попадает в видимую область
            };

            // Категории фильтров (Market Structure, Smart Money, Price Action, Volume, Liquidity, Support/Resistance)
            this._categoryFilter = {
                'Market Structure': true,
                'Smart Money': true,
                'Price Action': true,
                'Volume': true,
                'Liquidity': true,
                'Support/Resistance': true
            };

            // Массивы для хранения handles (для очистки)
            this._priceLines = [];
            this._markers = [];
            this._boxSeries = [];
            this._labels = []; // будущие custom-метки
            this._drawnPatterns = []; // список отрисованных паттернов с координатами
            this._lastModuleXResult = null; // для redraw
            this._lastCandles = null;        // для redraw
            this._viewportHandler = null;    // подписка на изменение viewport
            this._viewportSubscribed = false;
        }

        // ============================================================
        // ПУБЛИЧНЫЕ МЕТОДЫ
        // ============================================================

        /**
         * Отрисовать результат Module X на графике.
         * @param {object} moduleXResult — результат analyzeSMC() / analyzeMarketStructure()
         * @param {array} candles — массив свечей (для расчёта времени и цен)
         * @returns {object} — handles для очистки и список паттернов
         */
        draw(moduleXResult, candles) {
            if (!moduleXResult || !candles || candles.length === 0) {
                console.warn('[ModuleXRenderer] No data to draw');
                return { patterns: [], priceLines: [], markers: [] };
            }

            // Сохраняем для redraw (при изменении viewport, лимитов, фильтров)
            this._lastModuleXResult = moduleXResult;
            this._lastCandles = candles;

            // Очистить предыдущую отрисовку
            this.clear();

            if (!this.options.enabled) {
                return { patterns: [], priceLines: [], markers: [] };
            }

            // Подписываемся на viewport (один раз)
            this.subscribeToViewport();

            // 1. Market Structure: HH, HL, LH, LL
            if (this.options.showMarketStructure && this._isCategoryEnabled('Market Structure')) {
                this._drawMarketStructure(moduleXResult, candles);
            }

            // 2. Smart Money: BOS, CHoCH, MSS, OB
            if (this.options.showSmartMoney && this._isCategoryEnabled('Smart Money')) {
                this._drawBOS(moduleXResult, candles);
                this._drawCHoCH(moduleXResult, candles);
                this._drawMSS(moduleXResult, candles);
            }
            if (this.options.showOBZones && this._isCategoryEnabled('Smart Money')) {
                this._drawOrderBlocks(moduleXResult, candles);
            }

            // 3. FVG
            if (this.options.showFVGZones && this._isCategoryEnabled('Smart Money')) {
                this._drawFVG(moduleXResult, candles);
            }

            // 4. Liquidity: Sweeps, Equal Highs/Lows
            if (this.options.showLiquidity && this._isCategoryEnabled('Liquidity')) {
                this._drawLiquiditySweeps(moduleXResult, candles);
                this._drawEqualHighsLows(moduleXResult, candles);
            }

            // 5. Price Action: Displacement
            if (this.options.showPriceAction && this._isCategoryEnabled('Price Action')) {
                this._drawDisplacement(moduleXResult, candles);
            }

            // 6. Support / Resistance (новые категории)
            if (this._isCategoryEnabled('Support/Resistance')) {
                this._drawSupport(moduleXResult, candles);
                this._drawResistance(moduleXResult, candles);
            }

            // 7. Volume (базовая поддержка)
            if (this._isCategoryEnabled('Volume')) {
                this._drawVolume(moduleXResult, candles);
            }

            return {
                patterns: this._drawnPatterns,
                priceLines: this._priceLines,
                markers: this._markers
            };
        }

        /**
         * Включить/выключить отрисовку (без удаления handles).
         */
        setEnabled(enabled) {
            this.options.enabled = !!enabled;
            this._priceLines.forEach(h => {
                if (h && typeof h.applyOptions === 'function') {
                    try { h.applyOptions({ visible: this.options.enabled }); } catch (e) {}
                }
            });
            this._boxSeries.forEach(s => {
                if (s && typeof s.applyOptions === 'function') {
                    try { s.applyOptions({ visible: this.options.enabled }); } catch (e) {}
                }
            });
            if (this.candleSeries && typeof this.candleSeries.setMarkers === 'function') {
                try {
                    this.candleSeries.setMarkers(this.options.enabled ? this._markers : []);
                } catch (e) {}
            }
        }

        /**
         * Обновить опции отрисовки.
         */
        setOptions(opts) {
            this.options = Object.assign(this.options, opts || {});
        }

        /**
         * Очистить все нарисованные элементы.
         */
        clear() {
            // Удалить price lines
            this._priceLines.forEach(h => {
                if (h && typeof this.candleSeries.removePriceLine === 'function') {
                    try { this.candleSeries.removePriceLine(h); } catch (e) {}
                }
            });
            this._priceLines = [];

            // Удалить box series (OB, FVG)
            this._boxSeries.forEach(s => {
                if (s && typeof this.chart.removeSeries === 'function') {
                    try { this.chart.removeSeries(s); } catch (e) {}
                }
            });
            this._boxSeries = [];

            // Удалить markers
            if (this.candleSeries && typeof this.candleSeries.setMarkers === 'function') {
                try { this.candleSeries.setMarkers([]); } catch (e) {}
            }
            this._markers = [];

            this._drawnPatterns = [];
        }

        /**
         * Получить список отрисованных паттернов (для боковой панели).
         */
        getPatterns() {
            return this._drawnPatterns;
        }

        /**
         * Подсветить конкретный паттерн (для клика в боковой панели).
         */
        highlight(patternId) {
            // Можно реализовать мигание/усиление цены линии
            this._priceLines.forEach(h => {
                if (!h || !h._opts) return;
                const isMatch = h._patternId === patternId;
                try {
                    h.applyOptions({
                        lineWidth: isMatch ? 2 : 1,
                        color: isMatch ? COLORS.neutral : h._originalColor
                    });
                } catch (e) {}
            });
        }

        /**
         * Получить информацию о паттерне по ID.
         */
        getPatternInfo(patternId) {
            return this._drawnPatterns.find(p => p.id === patternId) || null;
        }

        /**
         * Установить лимиты на количество отображаемых объектов.
         * Лимиты применяются только на этапе визуализации, не затрагивая AnalysisResult.
         * @param {object} newLimits — { fvg: 2, orderBlocks: 2, bos: 1, ... }
         */
        setLimits(newLimits) {
            if (!newLimits || typeof newLimits !== 'object') return;
            this._limits = Object.assign({}, this._limits, newLimits);
            // Если есть данные — перерисовываем
            if (this._lastModuleXResult && this._lastCandles) {
                this.draw(this._lastModuleXResult, this._lastCandles);
            }
        }

        /**
         * Установить фильтры по категориям.
         * @param {object} categoryFilter — { 'Market Structure': true, 'Smart Money': false, ... }
         */
        setCategoryFilter(categoryFilter) {
            if (!categoryFilter || typeof categoryFilter !== 'object') return;
            this._categoryFilter = Object.assign({}, this._categoryFilter, categoryFilter);
            // Если есть данные — перерисовываем
            if (this._lastModuleXResult && this._lastCandles) {
                this.draw(this._lastModuleXResult, this._lastCandles);
            }
        }

        /**
         * Получить текущие лимиты.
         */
        getLimits() {
            return Object.assign({}, this._limits);
        }

        /**
         * Получить текущие фильтры категорий.
         */
        getCategoryFilter() {
            return Object.assign({}, this._categoryFilter);
        }

        /**
         * Перерисовка последнего результата (например, при изменении viewport).
         * Учитывает новые лимиты и фильтры.
         */
        redraw() {
            if (this._lastModuleXResult && this._lastCandles) {
                this.draw(this._lastModuleXResult, this._lastCandles);
            }
        }

        /**
         * Подписаться на изменение видимой области графика.
         * При скролле/зуме будет автоматически перерисовывать,
         * чтобы отображать только объекты в видимой области.
         * Безопасно вызывать много раз — подписка будет добавлена только один раз.
         */
        subscribeToViewport() {
            if (this._viewportSubscribed) return;
            if (!this.chart || typeof this.chart.timeScale !== 'function') return;
            const ts = this.chart.timeScale();
            // Не перерисовываем слишком часто — дебаунс через rAF
            let pending = false;
            this._viewportHandler = () => {
                if (pending) return;
                pending = true;
                const apply = () => {
                    pending = false;
                    if (this._limits.onlyViewport) {
                        this.redraw();
                    }
                };
                if (typeof requestAnimationFrame === 'function') {
                    requestAnimationFrame(apply);
                } else {
                    setTimeout(apply, 50);
                }
            };
            try {
                ts.subscribeVisibleTimeRangeChange(this._viewportHandler);
                this._viewportSubscribed = true;
            } catch (e) {
                console.warn('[ModuleXRenderer] subscribeVisibleTimeRangeChange failed:', e);
            }
        }

        /**
         * Отписаться от изменений viewport.
         */
        unsubscribeFromViewport() {
            if (!this.chart || !this._viewportHandler) return;
            try {
                this.chart.timeScale().unsubscribeVisibleTimeRangeChange(this._viewportHandler);
            } catch (e) {}
            this._viewportHandler = null;
            this._viewportSubscribed = false;
        }

        // ============================================================
        // ВНУТРЕННИЕ МЕТОДЫ: Market Structure
        // ============================================================

        _drawMarketStructure(result, candles) {
            // Поддержка двух форматов:
            // 1) result.swings[i].klass === 'HH'/'HL'/'LH'/'LL'  (из analyzeMarketStructure)
            // 2) result.higherHighs / result.higherLows / result.lowerHighs / result.lowerLows

            const swings = result.swings || [];
            // Применяем лимиты (последние N) и viewport-фильтрацию
            const hhList = this._takeLast(
                (result.higherHighs || swings.filter(s => s.klass === 'HH'))
                    .filter(s => this._isInViewport(s, candles)),
                this._limits.hh
            );
            const hlList = this._takeLast(
                (result.higherLows || swings.filter(s => s.klass === 'HL'))
                    .filter(s => this._isInViewport(s, candles)),
                this._limits.hl
            );
            const lhList = this._takeLast(
                (result.lowerHighs || swings.filter(s => s.klass === 'LH'))
                    .filter(s => this._isInViewport(s, candles)),
                this._limits.lh
            );
            const llList = this._takeLast(
                (result.lowerLows || swings.filter(s => s.klass === 'LL'))
                    .filter(s => this._isInViewport(s, candles)),
                this._limits.ll
            );

            // Отрисовка HH (зелёные, пунктир)
            hhList.forEach((s, idx) => {
                const t = this._resolveTime(s, candles);
                if (!t) return;
                const id = `hh-${idx}`;
                const line = this._createPriceLine({
                    price: s.price,
                    color: COLORS.bullishLine,
                    lineWidth: 1,
                    lineStyle: 2, // Dashed
                    axisLabelVisible: true,
                    title: 'HH'
                }, id);
                if (line) this._priceLines.push(line);
                this._drawnPatterns.push(this._buildPattern(id, 'HH', t, s.price, line));
            });

            // HL (зелёные, точечные)
            hlList.forEach((s, idx) => {
                const t = this._resolveTime(s, candles);
                if (!t) return;
                const id = `hl-${idx}`;
                const line = this._createPriceLine({
                    price: s.price,
                    color: COLORS.bullishLine,
                    lineWidth: 1,
                    lineStyle: 3, // Dotted
                    axisLabelVisible: true,
                    title: 'HL'
                }, id);
                if (line) this._priceLines.push(line);
                this._drawnPatterns.push(this._buildPattern(id, 'HL', t, s.price, line));
            });

            // LH (красные, точечные)
            lhList.forEach((s, idx) => {
                const t = this._resolveTime(s, candles);
                if (!t) return;
                const id = `lh-${idx}`;
                const line = this._createPriceLine({
                    price: s.price,
                    color: COLORS.bearishLine,
                    lineWidth: 1,
                    lineStyle: 3, // Dotted
                    axisLabelVisible: true,
                    title: 'LH'
                }, id);
                if (line) this._priceLines.push(line);
                this._drawnPatterns.push(this._buildPattern(id, 'LH', t, s.price, line));
            });

            // LL (красные, пунктир)
            llList.forEach((s, idx) => {
                const t = this._resolveTime(s, candles);
                if (!t) return;
                const id = `ll-${idx}`;
                const line = this._createPriceLine({
                    price: s.price,
                    color: COLORS.bearishLine,
                    lineWidth: 1,
                    lineStyle: 2, // Dashed
                    axisLabelVisible: true,
                    title: 'LL'
                }, id);
                if (line) this._priceLines.push(line);
                this._drawnPatterns.push(this._buildPattern(id, 'LL', t, s.price, line));
            });
        }

        // ============================================================
        // ВНУТРЕННИЕ МЕТОДЫ: Smart Money
        // ============================================================

        _drawBOS(result, candles) {
            const bosList = this._takeLast(
                (result.bos || []).filter(b => this._isInViewport(b, candles)),
                this._limits.bos
            );
            bosList.forEach((b, idx) => {
                const t = this._resolveTime(b, candles);
                if (!t) return;
                const isBull = b.type === 'bullish' || b.type === 'BOS_BULL';
                const id = `bos-${idx}`;
                this._markers.push({
                    time: t,
                    position: isBull ? 'belowBar' : 'aboveBar',
                    color: isBull ? COLORS.bullish : COLORS.bearish,
                    shape: isBull ? 'arrowUp' : 'arrowDown',
                    text: 'BOS'
                });
                this._drawnPatterns.push(this._buildPattern(id, 'BOS', t, b.level, null, {
                    bullish: isBull,
                    description: isBull
                        ? `Бычий BOS: пробой уровня ${this._formatPrice(b.level)}`
                        : `Медвежий BOS: пробой уровня ${this._formatPrice(b.level)}`
                }));
            });
        }

        _drawCHoCH(result, candles) {
            const chochList = this._takeLast(
                (result.choch || []).filter(c => this._isInViewport(c, candles)),
                this._limits.choch
            );
            chochList.forEach((c, idx) => {
                const t = this._resolveTime(c, candles);
                if (!t) return;
                const isBull = c.type === 'BULL' || c.type === 'bullish' || (c.type && c.type.includes('BULL'));
                const id = `choch-${idx}`;
                this._markers.push({
                    time: t,
                    position: isBull ? 'belowBar' : 'aboveBar',
                    color: isBull ? COLORS.bullish : COLORS.bearish,
                    shape: isBull ? 'arrowUp' : 'arrowDown',
                    text: 'CHoCH'
                });
                this._drawnPatterns.push(this._buildPattern(id, 'CHoCH', t, c.price, null, {
                    bullish: isBull,
                    description: c.type === 'CHoCH' || !c.type
                        ? `Смена характера движения на уровне ${this._formatPrice(c.price)}`
                        : `Смена характера движения на уровне ${this._formatPrice(c.price)}`
                }));
            });
        }

        _drawMSS(result, candles) {
            const mssList = this._takeLast(
                (result.mss || []).filter(m => this._isInViewport(m, candles)),
                this._limits.mss
            );
            mssList.forEach((m, idx) => {
                const t = this._resolveTime(m, candles);
                if (!t) return;
                const isBull = m.type === 'bullish' || m.type === 'BULL';
                const id = `mss-${idx}`;
                this._markers.push({
                    time: t,
                    position: isBull ? 'belowBar' : 'aboveBar',
                    color: isBull ? COLORS.bullish : COLORS.bearish,
                    shape: 'circle',
                    text: 'MSS'
                });
                this._drawnPatterns.push(this._buildPattern(id, 'MSS', t, m.price || m.level, null, {
                    bullish: isBull,
                    description: `Market Structure Shift на уровне ${this._formatPrice(m.price || m.level)}`
                }));
            });
        }

        _drawOrderBlocks(result, candles) {
            const obList = this._takeLast(
                (result.orderBlocks || []).filter(ob => this._isInViewport(ob, candles)),
                this._limits.orderBlocks
            );
            obList.forEach((ob, idx) => {
                if (ob.index === undefined || ob.index < 0 || ob.index >= candles.length) return;
                const candle = candles[ob.index];
                if (!candle) return;

                const isBull = ob.type === 'bullish' || ob.type === 'BULL';
                const top = Math.max(ob.high, ob.low);
                const bottom = Math.min(ob.high, ob.low);
                const id = `ob-${idx}`;

                // Создаём прямоугольник как отдельный series (Line с area)
                // Lightweight Charts v4 не имеет встроенных box series,
                // поэтому используем две горизонтальные price lines + area
                const topLine = this._createPriceLine({
                    price: top,
                    color: isBull ? COLORS.bullishLine : COLORS.bearishLine,
                    lineWidth: 1,
                    lineStyle: 0, // Solid
                    axisLabelVisible: false,
                    title: ''
                }, id + '-top');
                const bottomLine = this._createPriceLine({
                    price: bottom,
                    color: isBull ? COLORS.bullishLine : COLORS.bearishLine,
                    lineWidth: 1,
                    lineStyle: 0,
                    axisLabelVisible: true,
                    title: 'OB'
                }, id + '-bottom');
                if (topLine) this._priceLines.push(topLine);
                if (bottomLine) this._priceLines.push(bottomLine);

                // Метка "OB" на левой оси
                this._drawnPatterns.push(this._buildPattern(id, 'OB', candle.time, (top + bottom) / 2, bottomLine, {
                    bullish: isBull,
                    zone: { top, bottom, from: candle.time },
                    description: `${isBull ? 'Бычий' : 'Медвежий'} Order Block: зона ${this._formatPrice(bottom)} — ${this._formatPrice(top)}`
                }));
            });
        }

        _drawFVG(result, candles) {
            const fvgList = this._takeLast(
                (result.fairValueGaps || []).filter(fvg => this._isInViewport(fvg, candles)),
                this._limits.fvg
            );
            fvgList.forEach((fvg, idx) => {
                if (fvg.index === undefined || fvg.index < 0 || fvg.index >= candles.length) return;
                const candle = candles[fvg.index];
                if (!candle) return;

                const isBull = fvg.type === 'bullish' || fvg.type === 'BULL';
                const top = Math.max(fvg.high, fvg.low);
                const bottom = Math.min(fvg.high, fvg.low);
                const id = `fvg-${idx}`;

                const topLine = this._createPriceLine({
                    price: top,
                    color: COLORS.neutralLine,
                    lineWidth: 1,
                    lineStyle: 1, // Dotted (large)
                    axisLabelVisible: false,
                    title: ''
                }, id + '-top');
                const bottomLine = this._createPriceLine({
                    price: bottom,
                    color: COLORS.neutralLine,
                    lineWidth: 1,
                    lineStyle: 1,
                    axisLabelVisible: true,
                    title: 'FVG'
                }, id + '-bottom');
                if (topLine) this._priceLines.push(topLine);
                if (bottomLine) this._priceLines.push(bottomLine);

                this._drawnPatterns.push(this._buildPattern(id, 'FVG', candle.time, (top + bottom) / 2, bottomLine, {
                    bullish: isBull,
                    zone: { top, bottom, from: candle.time },
                    description: `${isBull ? 'Бычий' : 'Медвежий'} FVG: зона ${this._formatPrice(bottom)} — ${this._formatPrice(top)}`
                }));
            });
        }

        _drawLiquiditySweeps(result, candles) {
            const sweeps = this._takeLast(
                (result.liquiditySweeps || []).filter(s => this._isInViewport(s, candles)),
                this._limits.liquiditySweep
            );
            sweeps.forEach((s, idx) => {
                const t = this._resolveTime(s, candles);
                if (!t) return;
                const isBull = s.type === 'bullish' || s.type === 'BULL' || s.direction === 'up';
                const id = `ls-${idx}`;
                this._markers.push({
                    time: t,
                    position: isBull ? 'belowBar' : 'aboveBar',
                    color: COLORS.neutral,
                    shape: 'circle',
                    text: 'LS'
                });
                this._drawnPatterns.push(this._buildPattern(id, 'LiquiditySweep', t, s.price || s.level, null, {
                    bullish: isBull,
                    description: `Liquidity Sweep на уровне ${this._formatPrice(s.price || s.level)}`
                }));
            });
        }

        _drawEqualHighsLows(result, candles) {
            const eqH = this._takeLast(
                (result.equalHighs || []).filter(eq => this._isInViewport(eq, candles)),
                this._limits.equalHighsLows
            );
            const eqL = this._takeLast(
                (result.equalLows || []).filter(eq => this._isInViewport(eq, candles)),
                this._limits.equalHighsLows
            );

            eqH.forEach((eq, idx) => {
                const t = this._resolveTime(eq, candles);
                if (!t) return;
                const id = `eqh-${idx}`;
                const line = this._createPriceLine({
                    price: eq.price,
                    color: COLORS.neutralLine,
                    lineWidth: 1,
                    lineStyle: 2,
                    axisLabelVisible: true,
                    title: 'EqH'
                }, id);
                if (line) this._priceLines.push(line);
                this._drawnPatterns.push(this._buildPattern(id, 'EqualHighs', t, eq.price, line));
            });

            eqL.forEach((eq, idx) => {
                const t = this._resolveTime(eq, candles);
                if (!t) return;
                const id = `eql-${idx}`;
                const line = this._createPriceLine({
                    price: eq.price,
                    color: COLORS.neutralLine,
                    lineWidth: 1,
                    lineStyle: 2,
                    axisLabelVisible: true,
                    title: 'EqL'
                }, id);
                if (line) this._priceLines.push(line);
                this._drawnPatterns.push(this._buildPattern(id, 'EqualLows', t, eq.price, line));
            });
        }

        _drawDisplacement(result, candles) {
            const dispList = this._takeLast(
                (result.displacement || []).filter(d => this._isInViewport(d, candles)),
                this._limits.displacement
            );
            dispList.forEach((d, idx) => {
                const t = this._resolveTime(d, candles);
                if (!t) return;
                const isBull = d.type === 'bullish' || d.type === 'BULL' || d.direction === 'up';
                const id = `disp-${idx}`;
                this._markers.push({
                    time: t,
                    position: isBull ? 'belowBar' : 'aboveBar',
                    color: isBull ? COLORS.bullish : COLORS.bearish,
                    shape: 'square',
                    text: 'DSP'
                });
                this._drawnPatterns.push(this._buildPattern(id, 'Displacement', t, d.price || d.level, null, {
                    bullish: isBull,
                    description: `Импульсное движение на уровне ${this._formatPrice(d.price || d.level)}`
                }));
            });
        }

        /**
         * Volume — базовая поддержка.
         * В текущей итерации: если в candles есть поле volume, можно расширить
         * до Volume Profile / гистограммы. Пока — placeholder, чтобы категория
         * фильтра была активной.
         */
        _drawVolume(result, candles) {
            // Placeholder: полноценная Volume Profile будет добавлена позже.
            // Сейчас мы используем volume в _resolveTime и других расчётах,
            // но не рисуем дополнительных series, чтобы не перегружать график.
            // Если в candles есть volume — можно включить histogram series:
            //   const hist = this.chart.addHistogramSeries({ ... });
            //   hist.setData(candles.map(c => ({ time: c.time, value: c.volume, color: ... })));
            //   this._boxSeries.push(hist);
        }

        /**
         * Support — значимые минимумы (ниже текущей цены, недавние LL/HL).
         * Берёт последние N lows из Market Structure + sweep-уровни.
         */
        _drawSupport(result, candles) {
            const supportSources = [];
            // 1) Нижние свинги (LL, HL)
            const swings = result.swings || [];
            const lows = swings.filter(s => s.klass === 'LL' || s.klass === 'HL');
            lows.forEach(s => {
                if (this._isInViewport(s, candles)) {
                    supportSources.push({ price: s.price, index: s.index, time: s.time, source: 'swing' });
                }
            });
            // 2) Liquidity Sweeps (бычьи — снятие минимумов)
            (result.liquiditySweeps || []).forEach(ls => {
                if (this._isInViewport(ls, candles)) {
                    const isBull = ls.type === 'bullish' || ls.type === 'BULL' || ls.direction === 'up';
                    if (isBull && (ls.price || ls.level)) {
                        supportSources.push({
                            price: ls.price || ls.level,
                            index: ls.index,
                            time: ls.time,
                            source: 'sweep'
                        });
                    }
                }
            });
            // Лимит + дедупликация (по цене ±0.1%)
            const limited = this._takeLast(supportSources, this._limits.support, 'index');
            const seen = new Set();
            const final = limited.filter(s => {
                const key = s.price.toFixed(2);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            final.forEach((s, idx) => {
                const t = this._resolveTime(s, candles);
                if (!t) return;
                const id = `support-${idx}`;
                const line = this._createPriceLine({
                    price: s.price,
                    color: COLORS.bullishLine,
                    lineWidth: 2,
                    lineStyle: 2, // Dashed
                    axisLabelVisible: true,
                    title: 'Support'
                }, id);
                if (line) this._priceLines.push(line);
                this._drawnPatterns.push(this._buildPattern(id, 'Support', t, s.price, line, {
                    bullish: true,
                    description: `Уровень поддержки на ${this._formatPrice(s.price)} (источник: ${s.source})`
                }));
            });
        }

        /**
         * Resistance — значимые максимумы (выше текущей цены, недавние HH/LH).
         */
        _drawResistance(result, candles) {
            const resistanceSources = [];
            const swings = result.swings || [];
            const highs = swings.filter(s => s.klass === 'HH' || s.klass === 'LH');
            highs.forEach(s => {
                if (this._isInViewport(s, candles)) {
                    resistanceSources.push({ price: s.price, index: s.index, time: s.time, source: 'swing' });
                }
            });
            (result.liquiditySweeps || []).forEach(ls => {
                if (this._isInViewport(ls, candles)) {
                    const isBear = ls.type === 'bearish' || ls.type === 'BEAR' || ls.direction === 'down';
                    if (isBear && (ls.price || ls.level)) {
                        resistanceSources.push({
                            price: ls.price || ls.level,
                            index: ls.index,
                            time: ls.time,
                            source: 'sweep'
                        });
                    }
                }
            });
            const limited = this._takeLast(resistanceSources, this._limits.resistance, 'index');
            const seen = new Set();
            const final = limited.filter(s => {
                const key = s.price.toFixed(2);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            final.forEach((s, idx) => {
                const t = this._resolveTime(s, candles);
                if (!t) return;
                const id = `resistance-${idx}`;
                const line = this._createPriceLine({
                    price: s.price,
                    color: COLORS.bearishLine,
                    lineWidth: 2,
                    lineStyle: 2,
                    axisLabelVisible: true,
                    title: 'Resistance'
                }, id);
                if (line) this._priceLines.push(line);
                this._drawnPatterns.push(this._buildPattern(id, 'Resistance', t, s.price, line, {
                    bullish: false,
                    description: `Уровень сопротивления на ${this._formatPrice(s.price)} (источник: ${s.source})`
                }));
            });
        }

        // ============================================================
        // УТИЛИТЫ
        // ============================================================

        /**
         * Взять последние N элементов массива, отсортированных по index (или time).
         * @param {array} arr — массив объектов
         * @param {number} n — количество (>= 0)
         * @param {string} key — 'index' (по свече) или 'time' (по времени)
         * @returns {array}
         */
        _takeLast(arr, n, key) {
            if (!Array.isArray(arr) || arr.length === 0) return [];
            const k = key || 'index';
            const sorted = arr.slice().sort((a, b) => {
                let av, bv;
                if (k === 'time') {
                    av = (a && a.time !== undefined) ? a.time : 0;
                    bv = (b && b.time !== undefined) ? b.time : 0;
                } else {
                    av = (a && a.index !== undefined) ? a.index : 0;
                    bv = (b && b.index !== undefined) ? b.index : 0;
                }
                return av - bv;
            });
            if (typeof n !== 'number' || n <= 0) return [];
            return sorted.slice(-n);
        }

        /**
         * Проверить, попадает ли объект в видимую область графика.
         * @param {object} item — { index, time }
         * @param {array} candles — массив свечей
         * @returns {boolean}
         */
        _isInViewport(item, candles) {
            if (!this._limits.onlyViewport) return true;
            try {
                if (!this.chart || typeof this.chart.timeScale !== 'function') return true;
                const range = this.chart.timeScale().getVisibleLogicalRange();
                if (!range) return true;
                const from = range.from;
                const to = range.to;
                // Если есть index — используем его
                if (item && item.index !== undefined) {
                    return item.index >= from - 5 && item.index <= to + 5;
                }
                // Иначе по времени
                if (item && item.time !== undefined && candles) {
                    // candles обычно в формате Lightweight Charts
                    if (typeof item.time === 'number' && candles.length > 0) {
                        const first = candles[0].time;
                        const last = candles[candles.length - 1].time;
                        // Логический диапазон от 0 до candles.length
                        const logicalFrom = (item.time - first) / Math.max(1, (last - first)) * candles.length;
                        const logicalTo = logicalFrom;
                        return logicalFrom >= from - 5 && logicalTo <= to + 5;
                    }
                }
                return true;
            } catch (e) {
                return true;
            }
        }

        /**
         * Проверить, разрешена ли категория фильтром.
         * @param {string} category — 'Market Structure', 'Smart Money', ...
         * @returns {boolean}
         */
        _isCategoryEnabled(category) {
            if (!category) return true;
            if (!(category in this._categoryFilter)) return true;
            return !!this._categoryFilter[category];
        }

        _createPriceLine(options, patternId) {
            try {
                const originalColor = options.color;
                const line = this.candleSeries.createPriceLine(options);
                line._originalColor = originalColor;
                line._patternId = patternId;
                return line;
            } catch (e) {
                console.warn('[ModuleXRenderer] createPriceLine failed:', e);
                return null;
            }
        }

        _resolveTime(item, candles) {
            if (!item) return null;
            if (item.time !== undefined && item.time !== null) {
                if (typeof item.time === 'number') return item.time;
                if (typeof item.time === 'string') {
                    const ts = Date.parse(item.time);
                    if (!isNaN(ts)) return Math.floor(ts / 1000);
                }
                return item.time;
            }
            if (item.index !== undefined && item.index >= 0 && item.index < candles.length) {
                return candles[item.index].time;
            }
            return null;
        }

        _formatPrice(price) {
            if (price === null || price === undefined) return '—';
            if (price >= 1000) return price.toFixed(2);
            if (price >= 1) return price.toFixed(4);
            return price.toFixed(6);
        }

        _buildPattern(id, type, time, price, handle, extra) {
            const info = PATTERN_INFO[type] || {
                name: type,
                fullName: type,
                category: 'Other',
                description: 'Обнаруженный паттерн',
                importance: '',
                impact: ''
            };
            return Object.assign({
                id: id,
                type: type,
                name: info.name,
                fullName: info.fullName,
                category: info.category,
                description: extra && extra.description ? extra.description : info.description,
                importance: info.importance,
                impact: info.impact,
                time: time,
                price: price,
                handle: handle,
                bullish: extra ? extra.bullish : null,
                zone: extra && extra.zone ? extra.zone : null
            }, extra || {});
        }
    }

    ModuleXRenderer.COLORS = COLORS;
    ModuleXRenderer.PATTERN_INFO = PATTERN_INFO;

    global.ModuleXRenderer = ModuleXRenderer;

})(typeof window !== 'undefined' ? window : globalThis);
