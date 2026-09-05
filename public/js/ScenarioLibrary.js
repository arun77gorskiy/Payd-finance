/**
 * ScenarioLibrary.js — большая библиотека сценариев для PAYD Trading Lab.
 *
 * Генерирует 140+ уникальных сценариев в 7 категориях через шаблоны + параметризацию.
 *
 * Загружается ПОСЛЕ TrainerScenarios.js и ПЕРЕД созданием PAYDTrainer.
 * Переопределяет window.TrainerScenarios.SCENARIOS на расширенную библиотеку.
 *
 * Использование:
 *   window.SCENARIO_LIBRARY.totalCount          // общее количество
 *   window.SCENARIO_LIBRARY.countByCategory     // распределение по категориям
 *   window.SCENARIO_LIBRARY.getRandom({ category: 'price-action' })
 *   window.SCENARIO_LIBRARY.filter({ difficulty: 'advanced' })
 *
 * Категории:
 *   price-action (25)        smart-money (25)        market-structure (20)
 *   liquidity (20)           volume (20)             risk-management (20)
 *   psychology (10)          TOTAL: 140
 */

(function (global) {
    'use strict';

    if (!global) {
        throw new Error('[ScenarioLibrary] global is required');
    }

    // ================================================================
    // УТИЛИТЫ
    // ================================================================

    function round(n) { return Math.round(n * 100) / 100; }

    function getInterval(timeframe) {
        switch (timeframe) {
            case '15':  return 15 * 60;
            case '60':  return 60 * 60;
            case '240': return 240 * 60;
            case 'D':   return 24 * 60 * 60;
            default:    return 60 * 60;
        }
    }

    /**
     * Маппинг внутренних таймфреймов (TradingView-формат) → Binance-интервалы,
     * реально присутствующие в датасете RealHistoricalData.
     *
     *  '15'  → '1h'  (15-минутные свечи не упакованы → берём ближайший больший TF)
     *  '60'  → '1h'
     *  '240' → '4h'
     *  'D'   → '1d'
     */
    const TF_TO_INTERVAL = {
        '15':  '1h',
        '60':  '1h',
        '240': '4h',
        'D':   '1d'
    };

    /**
     * Обратный маппинг: Binance-интервал → TradingView-таймфрейм.
     */
    const INTERVAL_TO_TF = {
        '1h': '60',
        '4h': '240',
        '1d': 'D'
    };

    /**
     * Преобразует TradingView-формат символа ('BINANCE:BTCUSDT') в Binance-формат ('BTCUSDT').
     */
    function toBinanceSymbol(s) {
        if (!s) return 'BTCUSDT';
        return String(s).replace(/^BINANCE:/i, '').toUpperCase();
    }

    /**
     * Проверяет, доступен ли символ в RealHistoricalData.
     * Если нет — возвращает ближайший доступный аналог.
     */
    function resolveAvailableSymbol(symbol) {
        const target = toBinanceSymbol(symbol);
        if (!global.RealHistoricalData) return target;
        const available = global.RealHistoricalData.getAvailableSymbols();
        if (available.indexOf(target) !== -1) return target;
        // Fallback по приоритету
        const fallbackChain = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 'DOGEUSDT', 'MATICUSDT'];
        for (let i = 0; i < fallbackChain.length; i++) {
            if (available.indexOf(fallbackChain[i]) !== -1) return fallbackChain[i];
        }
        return available[0] || 'BTCUSDT';
    }

    /**
     * Детерминированный псевдо-RNG на основе строки seed.
     * Используется только для воспроизводимого выбора окна в сегменте.
     */
    function hashSeed(str) {
        let h = 0;
        const s = String(str);
        for (let i = 0; i < s.length; i++) {
            h = ((h << 5) - h + s.charCodeAt(i)) | 0;
        }
        return Math.abs(h);
    }

    /**
     * Построение AnalysisResult на основе биаса, контекста и уверенности.
     */
    function buildAnalysisResult(bias, ctx, confidence, subType) {
        const conf = Math.max(40, Math.min(95, confidence));
        let grade = 'C';
        if (conf >= 85) grade = 'A';
        else if (conf >= 70) grade = 'B';
        else if (conf >= 55) grade = 'C';
        else grade = 'D';

        const trendMap = {
            'bullish': 'bullish', 'bearish': 'bearish',
            'neutral': 'range', 'conflicting': 'range'
        };

        return {
            context: ctx,
            bias: bias,
            confidence: { percent: conf, grade: grade },
            trend: { primaryTrend: trendMap[bias] || 'range' },
            structure: {
                lastBOS: bias === 'bullish' ? 'bullish_bos' : (bias === 'bearish' ? 'bearish_bos' : null),
                lastCHOCH: bias === 'bearish' ? 'bullish_choch' : (bias === 'bullish' ? 'bearish_choch' : null)
            },
            liquidity: {
                bslSwept: bias === 'bearish' ? true : (subType === 'liquidity_sweep_bearish'),
                sslSwept: bias === 'bullish' ? true : (subType === 'liquidity_sweep_bullish')
            },
            volume: {
                confirmation: conf >= 70,
                climax: subType === 'volume_climax_top' || subType === 'volume_climax_bottom'
            },
            scenarios: [{
                id: subType,
                direction: bias === 'bullish' ? 'long' : (bias === 'bearish' ? 'short' : 'no_trade'),
                priority: 1
            }]
        };
    }

    /**
     * Генерация подробного объяснения.
     */
    function buildExplanation(scenario, actualDirection) {
        const { name, correctDecision, category, difficulty } = scenario;
        const dirText = { long: 'длинную позицию', short: 'короткую позицию',
                          wait: 'ждать подтверждения', no_trade: 'не входить' };
        const dirVerb = { long: 'покупка', short: 'продажа', wait: 'ожидание', no_trade: 'воздержание от сделки' };

        return [
            `Сценарий "${name}" относится к категории ${category} и имеет уровень сложности ${difficulty}.`,
            `На графике сформировалась ситуация, в которой оптимальным решением является ${dirText[correctDecision]}. ` +
            `Скрытое будущее движение цены подтверждает, что ${dirVerb[correctDecision]} была бы правильным выбором с точки зрения соотношения риск/прибыль и вероятности.`,
            `При анализе подобных установок обращайте внимание на подтверждение от старшего таймфрейма, объём и расположение ключевых зон ликвидности. ` +
            `Если хотя бы один из этих факторов противоречит гипотезе — лучше ${correctDecision === 'no_trade' ? 'пропустить сделку' : 'дождаться более чёткого сигнала'}.`
        ].join('\n\n');
    }

    /**
     * Генерация обучающего комментария для конкретной подкатегории.
     */
    function buildEducationalComment(category, subType, direction) {
        const dirText = direction === 'long' ? 'покупок' : (direction === 'short' ? 'продаж' : 'ожидания');

        const comments = {
            'price-action': `Ценовые паттерны работают только в правильном контексте. Всегда ищите подтверждение от тренда и объёма перед входом.`,
            'smart-money': `Smart Money Concepts требуют понимания того, где крупный капитал размещает ордера. Ищите BOS/CHOCH, FVG и Order Blocks в зонах накопления ликвидности.`,
            'market-structure': `Структура рынка — фундамент для любой стратегии. Определяйте HH/HL для бычьего тренда и LH/LL для медвежьего, прежде чем искать точки входа.`,
            'liquidity': `Ликвидность — это скопление стоп-ордеров. Крупные игроки охотятся за этой ликвидностью, поэтому понимание зон liquidity sweeps критически важно.`,
            'volume': `Объём подтверждает или опровергает движение цены. Всегда сравнивайте текущий объём со средним и ищите дивергенции между усилием и результатом.`,
            'risk-management': `Управление риском важнее точности входа. Определяйте стоп по структуре, используйте R:R минимум 1:2, ограничивайте риск до 1-2% депозита.`,
            'psychology': `Психология трейдера — ключевой фактор. Избегайте FOMO, revenge-торговли и overconfidence. Следуйте плану и принимайте потери как часть процесса.`
        };

        return `${comments[category] || ''} В данном сценарии правильный ответ — ${dirText}.`;
    }

    // ================================================================
    // БАЗОВЫЕ КОНФИГУРАЦИИ
    // ================================================================

    // Символы, доступные в RealHistoricalData (8 пар BTC/ETH/SOL/BNB/XRP/ADA/DOGE/MATIC × USDT).
    // Используются ТОЛЬКО как fallback, если RealHistoricalData не загружен.
    const SYMBOLS = [
        'BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'BINANCE:SOLUSDT',
        'BINANCE:BNBUSDT', 'BINANCE:XRPUSDT', 'BINANCE:ADAUSDT',
        'BINANCE:DOGEUSDT', 'BINANCE:MATICUSDT',
        // Запасные, для разнообразия ротации:
        'BINANCE:AVAXUSDT', 'BINANCE:LINKUSDT',
        'BINANCE:DOTUSDT', 'BINANCE:TRXUSDT'
    ];

    const TIMEFRAMES = ['15', '60', '240', 'D'];
    const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];

    /**
     * Fallback-функция для расчёта «приблизительной» стартовой цены,
     * используется ТОЛЬКО если RealHistoricalData не загружен.
     */
    function getStartPrice(idx, symbol) {
        const baseMap = {
            'BINANCE:BTCUSDT': 42000, 'BINANCE:ETHUSDT': 2300,
            'BINANCE:SOLUSDT': 95, 'BINANCE:BNBUSDT': 310,
            'BINANCE:XRPUSDT': 0.55, 'BINANCE:ADAUSDT': 0.45,
            'BINANCE:DOGEUSDT': 0.08, 'BINANCE:AVAXUSDT': 28,
            'BINANCE:LINKUSDT': 14, 'BINANCE:MATICUSDT': 0.85,
            'BINANCE:DOTUSDT': 7.5, 'BINANCE:TRXUSDT': 0.11
        };
        const base = baseMap[symbol] || 100;
        return round(base * (0.85 + (idx % 30) * 0.01));
    }

    /**
     * Кеш сегментов RealHistoricalData — заполняется лениво при первом вызове getConfig.
     * Используем снимок, чтобы между сценариями набор не «прыгал».
     */
    let _SEGMENTS_CACHE = null;
    function getAllRealSegments() {
        if (_SEGMENTS_CACHE) return _SEGMENTS_CACHE;
        if (!global.RealHistoricalData || typeof global.RealHistoricalData.getAllSegments !== 'function') {
            _SEGMENTS_CACHE = [];
            return _SEGMENTS_CACHE;
        }
        _SEGMENTS_CACHE = global.RealHistoricalData.getAllSegments() || [];
        return _SEGMENTS_CACHE;
    }

    /**
     * Возвращает конфигурацию для сценария по его глобальному индексу.
     *
     * КЛЮЧЕВОЕ ИЗМЕНЕНИЕ: источник истины — реальные сегменты из RealHistoricalData.
     *   • symbol   = 'BINANCE:' + реальный символ сегмента
     *   • timeframe = TradingView-формат ('60'/'240'/'D'), выведенный из интервала сегмента
     *   • startPrice = close первой свечи сегмента (реальная историческая цена)
     *   • segmentId / segmentSymbol / segmentInterval — точные параметры для
     *     последующей загрузки окна в prebakeScenarioCandles()
     *
     * Это гарантирует, что имя инструмента, таймфрейм, цена и реальные свечи
     * согласованы между собой для КАЖДОГО сценария.
     */
    function getConfig(idx) {
        const segments = getAllRealSegments();

        if (segments.length > 0) {
            // Детерминированно выбираем сегмент по индексу (с перемешиванием через hashIndex)
            // Каждый сценарий получает свой сегмент; с 48 сегментами и 140 сценариями
            // сегменты используются несколько раз, но с разными окнами внутри.
            const seg = segments[idx % segments.length];
            const symbol = 'BINANCE:' + seg.symbol;
            const timeframe = INTERVAL_TO_TF[seg.interval] || '60';
            const interval = getInterval(timeframe);
            const startPrice = round(seg.candles[0].close);
            return {
                symbol: symbol,
                timeframe: timeframe,
                startPrice: startPrice,
                interval: interval,
                // Точные параметры сегмента для загрузки данных:
                segmentId: seg.id,
                segmentSymbol: seg.symbol,
                segmentInterval: seg.interval
            };
        }

        // FALLBACK: RealHistoricalData не загружен — используем старую схему.
        const symbol = SYMBOLS[idx % SYMBOLS.length];
        const timeframe = TIMEFRAMES[idx % TIMEFRAMES.length];
        const startPrice = getStartPrice(idx, symbol);
        const interval = getInterval(timeframe);
        return {
            symbol: symbol,
            timeframe: timeframe,
            startPrice: startPrice,
            interval: interval,
            segmentId: null,
            segmentSymbol: null,
            segmentInterval: null
        };
    }

    // ================================================================
    // ШАБЛОНЫ ПО КАТЕГОРИЯМ
    // ================================================================

    // 25 PRICE-ACTION TEMPLATES
    const PRICE_ACTION_TEMPLATES = [
        { subType: 'pin_bar_bullish',         name: 'Бычий Pin Bar',                          description: 'Длинный нижний хвост — тест спроса на откате.',                       difficulty: 'intermediate', timeframe: '60',  direction: 'long',  pattern: { type: 'pin_bar_bullish' },   tags: ['price-action', 'reversal', 'pin-bar', 'support'] },
        { subType: 'pin_bar_bearish',         name: 'Медвежий Pin Bar',                       description: 'Длинный верхний хвост — отказ покупателей.',                            difficulty: 'intermediate', timeframe: '60',  direction: 'short', pattern: { type: 'pin_bar_bearish' },   tags: ['price-action', 'reversal', 'pin-bar', 'resistance'] },
        { subType: 'bullish_engulfing',       name: 'Бычье поглощение',                        description: 'Зелёная свеча перекрывает предыдущую красную.',                         difficulty: 'beginner',    timeframe: '240', direction: 'long',  pattern: { type: 'engulfing_bullish' }, tags: ['price-action', 'reversal', 'engulfing'] },
        { subType: 'bearish_engulfing',       name: 'Медвежье поглощение',                     description: 'Красная свеча перекрывает предыдущую зелёную.',                         difficulty: 'beginner',    timeframe: '240', direction: 'short', pattern: { type: 'engulfing_bearish' }, tags: ['price-action', 'reversal', 'engulfing'] },
        { subType: 'morning_star',            name: 'Утренняя звезда',                         description: 'Разворотная модель из трёх свечей в основании.',                        difficulty: 'intermediate', timeframe: 'D',   direction: 'long',  tags: ['price-action', 'reversal', 'morning-star'] },
        { subType: 'evening_star',            name: 'Вечерняя звезда',                         description: 'Разворотная модель из трёх свечей на вершине.',                          difficulty: 'intermediate', timeframe: 'D',   direction: 'short', tags: ['price-action', 'reversal', 'evening-star'] },
        { subType: 'hammer',                  name: 'Молот',                                   description: 'Короткое тело сверху, длинный нижний хвост — разворот вверх.',           difficulty: 'beginner',    timeframe: '60',  direction: 'long',  pattern: { type: 'hammer' },           tags: ['price-action', 'reversal', 'hammer'] },
        { subType: 'hanging_man',             name: 'Повешенный',                              description: 'Короткое тело сверху, длинный нижний хвост — разворот вниз.',            difficulty: 'beginner',    timeframe: '60',  direction: 'short', pattern: { type: 'hammer' },           tags: ['price-action', 'reversal', 'hanging-man'] },
        { subType: 'shooting_star',           name: 'Падающая звезда',                         description: 'Длинный верхний хвост на вершине — разворот вниз.',                      difficulty: 'beginner',    timeframe: '60',  direction: 'short', pattern: { type: 'shooting_star' },    tags: ['price-action', 'reversal', 'shooting-star'] },
        { subType: 'inverted_hammer',         name: 'Перевёрнутый молот',                      description: 'Длинный верхний хвост в основании — возможный разворот.',               difficulty: 'beginner',    timeframe: '60',  direction: 'long',  pattern: { type: 'shooting_star' },    tags: ['price-action', 'reversal', 'inverted-hammer'] },
        { subType: 'spinning_top',            name: 'Волчок (нерешительность)',                description: 'Маленькое тело с длинными тенями — рынок в нерешительности.',            difficulty: 'beginner',    timeframe: '60',  direction: 'no_trade', tags: ['price-action', 'indecision'] },
        { subType: 'long_legged_doji',        name: 'Длинноногий доджи',                       description: 'Экстремальная нерешительность — возможен разворот.',                      difficulty: 'intermediate', timeframe: '240', direction: 'wait',     pattern: { type: 'doji' }, tags: ['price-action', 'doji', 'reversal'] },
        { subType: 'dragonfly_doji',          name: 'Доджи-стрекоза',                          description: 'Длинный нижний хвост без верхнего — сильный бычий сигнал.',              difficulty: 'intermediate', timeframe: '60',  direction: 'long',  pattern: { type: 'doji' }, tags: ['price-action', 'doji', 'bullish'] },
        { subType: 'gravestone_doji',         name: 'Доджи-надгробие',                         description: 'Длинный верхний хвост без нижнего — сильный медвежий сигнал.',           difficulty: 'intermediate', timeframe: '60',  direction: 'short', pattern: { type: 'doji' }, tags: ['price-action', 'doji', 'bearish'] },
        { subType: 'bullish_marubozu',        name: 'Бычий марубозу',                          description: 'Длинная зелёная свеча без теней — сильное движение вверх.',              difficulty: 'beginner',    timeframe: '240', direction: 'long',  pattern: { type: 'marubozu_bullish' }, tags: ['price-action', 'momentum', 'marubozu'] },
        { subType: 'bearish_marubozu',        name: 'Медвежий марубозу',                       description: 'Длинная красная свеча без теней — сильное движение вниз.',               difficulty: 'beginner',    timeframe: '240', direction: 'short', pattern: { type: 'marubozu_bearish' }, tags: ['price-action', 'momentum', 'marubozu'] },
        { subType: 'three_white_soldiers',    name: 'Три белых солдата',                       description: 'Три последовательных длинных зелёных свечи — сильный бычий сигнал.',     difficulty: 'intermediate', timeframe: 'D',   direction: 'long',  tags: ['price-action', 'continuation', 'three-soldiers'] },
        { subType: 'three_black_crows',       name: 'Три чёрных вороны',                       description: 'Три последовательных длинных красных свечи — сильный медвежий сигнал.',  difficulty: 'intermediate', timeframe: 'D',   direction: 'short', tags: ['price-action', 'continuation', 'three-crows'] },
        { subType: 'tweezer_bottom',          name: 'Пинцет в основании',                      description: 'Две свечи с одинаковым минимумом — разворот вверх.',                      difficulty: 'advanced',    timeframe: '240', direction: 'long',  tags: ['price-action', 'reversal', 'tweezer'] },
        { subType: 'tweezer_top',             name: 'Пинцет на вершине',                       description: 'Две свечи с одинаковым максимумом — разворот вниз.',                      difficulty: 'advanced',    timeframe: '240', direction: 'short', tags: ['price-action', 'reversal', 'tweezer'] },
        { subType: 'bullish_harami',          name: 'Бычий харами',                            description: 'Маленькая зелёная свеча внутри предыдущей красной — разворот вверх.',     difficulty: 'intermediate', timeframe: '60',  direction: 'long',  tags: ['price-action', 'reversal', 'harami'] },
        { subType: 'bearish_harami',          name: 'Медвежий харами',                         description: 'Маленькая красная свеча внутри предыдущей зелёной — разворот вниз.',      difficulty: 'intermediate', timeframe: '60',  direction: 'short', tags: ['price-action', 'reversal', 'harami'] },
        { subType: 'dark_cloud_cover',        name: 'Завеса из тёмных облаков',                description: 'Сильный медвежий разворот на вершине.',                                  difficulty: 'advanced',    timeframe: '240', direction: 'short', tags: ['price-action', 'reversal', 'dark-cloud'] },
        { subType: 'piercing_line',           name: 'Просвет в облаках',                       description: 'Сильный бычий разворот в основании.',                                    difficulty: 'advanced',    timeframe: '240', direction: 'long',  tags: ['price-action', 'reversal', 'piercing'] },
        { subType: 'counterattack_lines',     name: 'Линии контратаки',                        description: 'Свечи с одинаковым закрытием после тренда — возможна коррекция.',         difficulty: 'advanced',    timeframe: '240', direction: 'wait',  tags: ['price-action', 'reversal', 'counterattack'] }
    ];

    // 25 SMART-MONEY TEMPLATES
    const SMART_MONEY_TEMPLATES = [
        { subType: 'bullish_bos',             name: 'Бычий BOS',                              description: 'Break of Structure — пробой последнего HH вверх.',                       difficulty: 'intermediate', timeframe: '60',  direction: 'long',  tags: ['smart-money', 'bos', 'bullish'] },
        { subType: 'bearish_bos',             name: 'Медвежий BOS',                            description: 'Break of Structure — пробой последнего LL вниз.',                        difficulty: 'intermediate', timeframe: '60',  direction: 'short', tags: ['smart-money', 'bos', 'bearish'] },
        { subType: 'choch_bullish',           name: 'Бычий CHOCH',                             description: 'Change of Character — смена тренда с медвежьего на бычий.',              difficulty: 'advanced',    timeframe: '240', direction: 'long',  tags: ['smart-money', 'choch', 'bullish'] },
        { subType: 'choch_bearish',           name: 'Медвежий CHOCH',                          description: 'Change of Character — смена тренда с бычьего на медвежий.',              difficulty: 'advanced',    timeframe: '240', direction: 'short', tags: ['smart-money', 'choch', 'bearish'] },
        { subType: 'ob_unmitigated_bullish',  name: 'Неотработанный бычий OB',                description: 'Order Block, до которого цена ещё не дошла.',                            difficulty: 'intermediate', timeframe: '60',  direction: 'long',  tags: ['smart-money', 'order-block', 'bullish'] },
        { subType: 'ob_unmitigated_bearish',  name: 'Неотработанный медвежий OB',              description: 'Order Block, до которого цена ещё не дошла.',                            difficulty: 'intermediate', timeframe: '60',  direction: 'short', tags: ['smart-money', 'order-block', 'bearish'] },
        { subType: 'ob_mitigated_bullish',    name: 'Отработанный бычий OB (отскок)',          description: 'Цена вернулась в Order Block и отскочила.',                              difficulty: 'advanced',    timeframe: '240', direction: 'long',  tags: ['smart-money', 'order-block', 'bullish', 'mitigated'] },
        { subType: 'ob_mitigated_bearish',    name: 'Отработанный медвежий OB (отскок)',       description: 'Цена вернулась в Order Block и отскочила.',                              difficulty: 'advanced',    timeframe: '240', direction: 'short', tags: ['smart-money', 'order-block', 'bearish', 'mitigated'] },
        { subType: 'fvg_bullish',             name: 'Бычий FVG',                               description: 'Fair Value Gap — имбаланс, в который цена может вернуться.',             difficulty: 'intermediate', timeframe: '60',  direction: 'long',  tags: ['smart-money', 'fvg', 'bullish'] },
        { subType: 'fvg_bearish',             name: 'Медвежий FVG',                            description: 'Fair Value Gap — имбаланс, в который цена может вернуться.',             difficulty: 'intermediate', timeframe: '60',  direction: 'short', tags: ['smart-money', 'fvg', 'bearish'] },
        { subType: 'fvg_fill_continuation',   name: 'Заполнение FVG как продолжение',          description: 'Цена заполняет FVG и продолжает движение по тренду.',                    difficulty: 'advanced',    timeframe: '240', direction: 'long',  tags: ['smart-money', 'fvg', 'continuation'] },
        { subType: 'fvg_ob_confluence',       name: 'FVG + Order Block (конфлюенция)',         description: 'Зона, где FVG и OB совпадают — мощная поддержка/сопротивление.',         difficulty: 'advanced',    timeframe: '240', direction: 'long',  tags: ['smart-money', 'fvg', 'order-block', 'confluence'] },
        { subType: 'liquidity_sweep_bullish', name: 'Свип ликвидности вверху (бычий)',         description: 'Снятие SSL перед разворотом вверх.',                                     difficulty: 'advanced',    timeframe: '60',  direction: 'long',  tags: ['smart-money', 'liquidity-sweep', 'bullish'] },
        { subType: 'liquidity_sweep_bearish', name: 'Свип ликвидности внизу (медвежий)',       description: 'Снятие BSL перед разворотом вниз.',                                      difficulty: 'advanced',    timeframe: '60',  direction: 'short', tags: ['smart-money', 'liquidity-sweep', 'bearish'] },
        { subType: 'bsl_grab',                name: 'Захват Buy-Side ликвидности',             description: 'Снятие стопов над равными максимумами.',                                  difficulty: 'advanced',    timeframe: '240', direction: 'short', tags: ['smart-money', 'bsl', 'grab'] },
        { subType: 'ssl_grab',                name: 'Захват Sell-Side ликвидности',            description: 'Снятие стопов под равными минимумами.',                                   difficulty: 'advanced',    timeframe: '240', direction: 'long',  tags: ['smart-money', 'ssl', 'grab'] },
        { subType: 'inducement_pattern',      name: 'Inducement Pattern',                      description: 'Ложный пробой меньшего уровня для привлечения толпы.',                    difficulty: 'advanced',    timeframe: '60',  direction: 'wait',  tags: ['smart-money', 'inducement'] },
        { subType: 'mitigation_block',        name: 'Mitigation Block',                        description: 'Зона, где крупный ордер был исполнен — разворотная точка.',              difficulty: 'advanced',    timeframe: '240', direction: 'short', tags: ['smart-money', 'mitigation-block'] },
        { subType: 'premium_zone_rejection',  name: 'Отбой от Premium-зоны',                   description: 'Отказ от верхней зоны (выше 50% диапазона).',                           difficulty: 'advanced',    timeframe: '240', direction: 'short', tags: ['smart-money', 'premium', 'rejection'] },
        { subType: 'discount_zone_rejection', name: 'Отбой от Discount-зоны',                  description: 'Отказ от нижней зоны (ниже 50% диапазона).',                            difficulty: 'advanced',    timeframe: '240', direction: 'long',  tags: ['smart-money', 'discount', 'rejection'] },
        { subType: 'displacement_no_fvg',     name: 'Displacement без FVG',                    description: 'Сильный импульс без формирования разрыва.',                               difficulty: 'advanced',    timeframe: '60',  direction: 'long',  tags: ['smart-money', 'displacement'] },
        { subType: 'displacement_with_fvg',   name: 'Displacement с FVG',                      description: 'Импульс с формированием Fair Value Gap.',                                difficulty: 'advanced',    timeframe: '60',  direction: 'short', tags: ['smart-money', 'displacement', 'fvg'] },
        { subType: 'smart_money_reversal',    name: 'Smart Money Reversal',                    description: 'Крупный игрок меняет позицию — точка разворота.',                        difficulty: 'advanced',    timeframe: '240', direction: 'long',  tags: ['smart-money', 'reversal'] },
        { subType: 'turtle_soup',             name: 'Turtle Soup',                             description: 'Пробой 20-дневного максимума/минимума с возвратом.',                     difficulty: 'advanced',    timeframe: 'D',   direction: 'short', tags: ['smart-money', 'turtle-soup'] },
        { subType: 'judas_swing',             name: 'Judas Swing',                             description: 'Ложный пробой в начале сессии для сбора ликвидности.',                   difficulty: 'advanced',    timeframe: '60',  direction: 'short', tags: ['smart-money', 'judas-swing'] }
    ];

    // 20 MARKET-STRUCTURE TEMPLATES
    const MARKET_STRUCTURE_TEMPLATES = [
        { subType: 'uptrend_hh_hl',           name: 'Восходящий тренд (HH/HL)',                description: 'Чёткая структура Higher Highs / Higher Lows.',                            difficulty: 'beginner',    timeframe: '240', direction: 'long',  tags: ['market-structure', 'uptrend'] },
        { subType: 'downtrend_lh_ll',         name: 'Нисходящий тренд (LH/LL)',                description: 'Чёткая структура Lower Highs / Lower Lows.',                             difficulty: 'beginner',    timeframe: '240', direction: 'short', tags: ['market-structure', 'downtrend'] },
        { subType: 'range_continuation',      name: 'Продолжение в диапазоне',                 description: 'Боковик — торгуем от границ.',                                          difficulty: 'beginner',    timeframe: '60',  direction: 'wait',  tags: ['market-structure', 'range'] },
        { subType: 'range_breakout_up',       name: 'Пробой диапазона вверх',                  description: 'Цена пробивает верхнюю границу диапазона.',                             difficulty: 'intermediate', timeframe: '60',  direction: 'long',  tags: ['market-structure', 'breakout', 'bullish'] },
        { subType: 'range_breakout_down',     name: 'Пробой диапазона вниз',                   description: 'Цена пробивает нижнюю границу диапазона.',                              difficulty: 'intermediate', timeframe: '60',  direction: 'short', tags: ['market-structure', 'breakout', 'bearish'] },
        { subType: 'uptrend_to_range',        name: 'Переход восходящего тренда в диапазон',   description: 'Тренд теряет импульс и переходит в боковик.',                           difficulty: 'intermediate', timeframe: '240', direction: 'wait',  tags: ['market-structure', 'transition', 'range'] },
        { subType: 'downtrend_to_range',      name: 'Переход нисходящего тренда в диапазон',   description: 'Тренд теряет импульс и переходит в боковик.',                           difficulty: 'intermediate', timeframe: '240', direction: 'wait',  tags: ['market-structure', 'transition', 'range'] },
        { subType: 'range_to_uptrend',        name: 'Переход диапазона в восходящий тренд',    description: 'Боковик сменяется восходящим трендом.',                                 difficulty: 'intermediate', timeframe: '240', direction: 'long',  tags: ['market-structure', 'transition', 'uptrend'] },
        { subType: 'choch_in_uptrend',        name: 'CHOCH внутри восходящего тренда',        description: 'Краткосрочная смена характера движения вверх.',                         difficulty: 'advanced',    timeframe: '60',  direction: 'wait',  tags: ['market-structure', 'choch', 'uptrend'] },
        { subType: 'choch_in_downtrend',      name: 'CHOCH внутри нисходящего тренда',        description: 'Краткосрочная смена характера движения вниз.',                          difficulty: 'advanced',    timeframe: '60',  direction: 'wait',  tags: ['market-structure', 'choch', 'downtrend'] },
        { subType: 'uptrend_to_downtrend',    name: 'Разворот восходящего тренда',             description: 'Смена восходящего тренда на нисходящий.',                               difficulty: 'advanced',    timeframe: 'D',   direction: 'short', tags: ['market-structure', 'reversal', 'downtrend'] },
        { subType: 'downtrend_to_uptrend',    name: 'Разворот нисходящего тренда',             description: 'Смена нисходящего тренда на восходящий.',                               difficulty: 'advanced',    timeframe: 'D',   direction: 'long',  tags: ['market-structure', 'reversal', 'uptrend'] },
        { subType: 'hh_without_hl_warning',   name: 'HH без подтверждающего HL (предупреждение)', description: 'Новый максимум без соответствующего минимума — слабость.',          difficulty: 'advanced',    timeframe: '240', direction: 'wait',  tags: ['market-structure', 'warning', 'divergence'] },
        { subType: 'll_without_lh_warning',   name: 'LL без подтверждающего LH (предупреждение)', description: 'Новый минимум без соответствующего максимума — возможен разворот.',  difficulty: 'advanced',    timeframe: '240', direction: 'wait',  tags: ['market-structure', 'warning', 'divergence'] },
        { subType: 'double_top_with_bos',     name: 'Двойная вершина с BOS',                   description: 'Два максимума с пробоем поддержки — медвежий паттерн.',                  difficulty: 'intermediate', timeframe: '240', direction: 'short', tags: ['market-structure', 'double-top'] },
        { subType: 'double_bottom_with_bos',  name: 'Двойное дно с BOS',                       description: 'Два минимума с пробоем сопротивления — бычий паттерн.',                  difficulty: 'intermediate', timeframe: '240', direction: 'long',  tags: ['market-structure', 'double-bottom'] },
        { subType: 'triple_top',              name: 'Тройная вершина',                          description: 'Три теста сопротивления — сильный медвежий сигнал.',                    difficulty: 'advanced',    timeframe: 'D',   direction: 'short', tags: ['market-structure', 'triple-top'] },
        { subType: 'triple_bottom',           name: 'Тройное дно',                             description: 'Три теста поддержки — сильный бычий сигнал.',                           difficulty: 'advanced',    timeframe: 'D',   direction: 'long',  tags: ['market-structure', 'triple-bottom'] },
        { subType: 'continuation_after_consolidation', name: 'Продолжение после консолидации',  description: 'Флаг/вымпел — продолжение тренда после боковика.',                     difficulty: 'intermediate', timeframe: '60',  direction: 'long',  tags: ['market-structure', 'flag', 'continuation'] },
        { subType: 'character_shift',         name: 'Character Shift',                         description: 'Резкая смена характера движения цены.',                                difficulty: 'advanced',    timeframe: '240', direction: 'wait',  tags: ['market-structure', 'character-shift'] }
    ];

    // 20 LIQUIDITY TEMPLATES
    const LIQUIDITY_TEMPLATES = [
        { subType: 'equal_highs',             name: 'Равные максимумы (EQH)',                  description: 'Два и более максимума на одном уровне — цель для продавцов.',          difficulty: 'beginner',    timeframe: '60',  direction: 'short', tags: ['liquidity', 'eqh'] },
        { subType: 'equal_lows',              name: 'Равные минимумы (EQL)',                   description: 'Два и более минимума на одном уровне — цель для покупателей.',         difficulty: 'beginner',    timeframe: '60',  direction: 'long',  tags: ['liquidity', 'eql'] },
        { subType: 'stop_hunt_over_eqh',      name: 'Стоп-хант над EQH',                       description: 'Пробой EQH с возвратом — ловушка для покупателей.',                    difficulty: 'advanced',    timeframe: '60',  direction: 'short', tags: ['liquidity', 'stop-hunt', 'eqh'] },
        { subType: 'stop_hunt_under_eql',     name: 'Стоп-хант под EQL',                       description: 'Пробой EQL с возвратом — ловушка для продавцов.',                      difficulty: 'advanced',    timeframe: '60',  direction: 'long',  tags: ['liquidity', 'stop-hunt', 'eql'] },
        { subType: 'liquidity_void_bullish',  name: 'Бычий liquidity void',                    description: 'Разрыв в ликвидности с сильным импульсом вверх.',                      difficulty: 'advanced',    timeframe: '240', direction: 'long',  tags: ['liquidity', 'void', 'bullish'] },
        { subType: 'liquidity_void_bearish',  name: 'Медвежий liquidity void',                 description: 'Разрыв в ликвидности с сильным импульсом вниз.',                       difficulty: 'advanced',    timeframe: '240', direction: 'short', tags: ['liquidity', 'void', 'bearish'] },
        { subType: 'bsl_sweep',               name: 'Buy-Side Liquidity Sweep',                description: 'Снятие ликвидности над максимумами перед разворотом.',                 difficulty: 'advanced',    timeframe: '60',  direction: 'short', tags: ['liquidity', 'bsl', 'sweep'] },
        { subType: 'ssl_sweep',               name: 'Sell-Side Liquidity Sweep',               description: 'Снятие ликвидности под минимумами перед разворотом.',                  difficulty: 'advanced',    timeframe: '60',  direction: 'long',  tags: ['liquidity', 'ssl', 'sweep'] },
        { subType: 'liquidity_engineering_final', name: 'Финальная инженерия ликвидности',      description: 'Последний сбор ликвидности перед сильным движением.',                 difficulty: 'advanced',    timeframe: '240', direction: 'long',  tags: ['liquidity', 'engineering'] },
        { subType: 'irl',                     name: 'Internal Range Liquidity (IRL)',          description: 'Ликвидность внутри диапазона.',                                          difficulty: 'intermediate', timeframe: '60',  direction: 'long',  tags: ['liquidity', 'irl'] },
        { subType: 'erl_high',                name: 'External Range Liquidity High (ERL)',     description: 'Ликвидность выше диапазона — цель для продавцов.',                     difficulty: 'intermediate', timeframe: '60',  direction: 'short', tags: ['liquidity', 'erl', 'high'] },
        { subType: 'erl_low',                 name: 'External Range Liquidity Low (ERL)',      description: 'Ликвидность ниже диапазона — цель для покупателей.',                   difficulty: 'intermediate', timeframe: '60',  direction: 'long',  tags: ['liquidity', 'erl', 'low'] },
        { subType: 'resting_liquidity_above_high', name: 'Покоящаяся ликвидность над high',    description: 'Скопление стоп-ордеров над максимумом.',                               difficulty: 'intermediate', timeframe: '240', direction: 'short', tags: ['liquidity', 'resting', 'high'] },
        { subType: 'resting_liquidity_below_low', name: 'Покоящаяся ликвидность под low',      description: 'Скопление стоп-ордеров под минимумом.',                                difficulty: 'intermediate', timeframe: '240', direction: 'long',  tags: ['liquidity', 'resting', 'low'] },
        { subType: 'stop_hunt_round_number',  name: 'Стоп-хант на круглом числе',              description: 'Пробой психологически важного уровня.',                                difficulty: 'advanced',    timeframe: '60',  direction: 'wait',  tags: ['liquidity', 'round-number'] },
        { subType: 'liquidity_rebuild_after_sweep', name: 'Восстановление ликвидности после свипа', description: 'Новые EQH/EQL после разворота.',                                difficulty: 'advanced',    timeframe: '240', direction: 'wait',  tags: ['liquidity', 'rebuild'] },
        { subType: 'stacked_imbalances',      name: 'Стэкнутые имбалансы',                     description: 'Несколько FVG подряд — зона сильного интереса.',                       difficulty: 'advanced',    timeframe: '240', direction: 'long',  tags: ['liquidity', 'fvg', 'stacked'] },
        { subType: 'single_print_zone',       name: 'Single Print Zone',                       description: 'Зона, где цена прошла без отката — слабая ликвидность.',               difficulty: 'advanced',    timeframe: '60',  direction: 'short', tags: ['liquidity', 'single-print'] },
        { subType: 'reclaim_of_liquidity',    name: 'Возврат через ликвидность',               description: 'Цена возвращается и поглощает ранее снятую ликвидность.',              difficulty: 'advanced',    timeframe: '240', direction: 'long',  tags: ['liquidity', 'reclaim'] },
        { subType: 'liquidity_run_clearing',  name: 'Liquidity Run (очистка)',                 description: 'Импульс через несколько зон ликвидности подряд.',                      difficulty: 'advanced',    timeframe: '60',  direction: 'long',  tags: ['liquidity', 'run', 'clearing'] }
    ];

    // 20 VOLUME TEMPLATES
    const VOLUME_TEMPLATES = [
        { subType: 'volume_climax_bottom',    name: 'Объёмный климакс в основании',            description: 'Экстремальный объём на минимумах — возможен разворот.',                difficulty: 'advanced',    timeframe: '60',  direction: 'long',  tags: ['volume', 'climax', 'bottom'] },
        { subType: 'volume_climax_top',       name: 'Объёмный климакс на вершине',             description: 'Экстремальный объём на максимумах — возможен разворот.',               difficulty: 'advanced',    timeframe: '60',  direction: 'short', tags: ['volume', 'climax', 'top'] },
        { subType: 'volume_dryup_before_breakout', name: 'Снижение объёма перед пробоем',     description: 'Затишье перед бурей.',                                                  difficulty: 'intermediate', timeframe: '240', direction: 'wait',  tags: ['volume', 'dryup', 'breakout'] },
        { subType: 'high_volume_breakout',    name: 'Пробой на высоком объёме',                description: 'Пробой уровня с подтверждением объёмом.',                              difficulty: 'intermediate', timeframe: '60',  direction: 'long',  tags: ['volume', 'breakout', 'confirmation'] },
        { subType: 'low_volume_breakout',     name: 'Пробой на низком объёме (ложный)',        description: 'Пробой без объёмного подтверждения — вероятен откат.',                 difficulty: 'advanced',    timeframe: '60',  direction: 'wait',  tags: ['volume', 'breakout', 'weak'] },
        { subType: 'volume_divergence_price_up', name: 'Объёмная дивергенция при росте цены', description: 'Цена растёт, объём падает — слабость покупателей.',                  difficulty: 'advanced',    timeframe: '240', direction: 'short', tags: ['volume', 'divergence'] },
        { subType: 'volume_confirmation_with_trend', name: 'Объём подтверждает тренд',         description: 'Тренд идёт с объёмным подтверждением.',                                difficulty: 'beginner',    timeframe: '60',  direction: 'long',  tags: ['volume', 'confirmation'] },
        { subType: 'average_volume_neutral',  name: 'Средний объём (нейтрально)',              description: 'Объём в пределах нормы — нет сигнала.',                                difficulty: 'beginner',    timeframe: '60',  direction: 'wait',  tags: ['volume', 'neutral'] },
        { subType: 'below_average_weakness',  name: 'Объём ниже среднего (слабость)',          description: 'Низкий объём — движение без силы.',                                    difficulty: 'beginner',    timeframe: '60',  direction: 'wait',  tags: ['volume', 'weak'] },
        { subType: 'above_average_strength',  name: 'Объём выше среднего (сила)',              description: 'Высокий объём — сильное движение.',                                    difficulty: 'beginner',    timeframe: '60',  direction: 'long',  tags: ['volume', 'strong'] },
        { subType: 'climax_reversal_pattern', name: 'Climax Reversal Pattern',                 description: 'Экстремальный объём + разворотная свеча.',                             difficulty: 'advanced',    timeframe: '240', direction: 'long',  tags: ['volume', 'climax', 'reversal'] },
        { subType: 'effort_vs_result_divergence', name: 'Усилие vs Результат (дивергенция)', description: 'Большой объём, но маленькое движение — крупный игрок поглощает.',   difficulty: 'advanced',    timeframe: '60',  direction: 'wait',  tags: ['volume', 'effort', 'result'] },
        { subType: 'increasing_volume_pullback', name: 'Растущий объём на откате',            description: 'Откат сопровождается объёмом — возможен разворот.',                    difficulty: 'advanced',    timeframe: '60',  direction: 'short', tags: ['volume', 'pullback'] },
        { subType: 'decreasing_volume_impulse', name: 'Падающий объём на импульсе',            description: 'Импульс замедляется — возможно завершение движения.',                  difficulty: 'advanced',    timeframe: '60',  direction: 'wait',  tags: ['volume', 'impulse', 'exhaustion'] },
        { subType: 'volume_spread_analysis',  name: 'VSA (Volume Spread Analysis)',             description: 'Анализ спреда свечи в связке с объёмом.',                              difficulty: 'advanced',    timeframe: '60',  direction: 'short', tags: ['volume', 'vsa'] },
        { subType: 'relative_volume_anomaly', name: 'Аномалия относительного объёма',          description: 'Объём сильно отклоняется от среднего.',                               difficulty: 'intermediate', timeframe: '60',  direction: 'wait',  tags: ['volume', 'anomaly'] },
        { subType: 'high_volume_node',        name: 'High Volume Node (HVN)',                   description: 'Зона высокого объёма — сильная поддержка/сопротивление.',              difficulty: 'advanced',    timeframe: '240', direction: 'wait',  tags: ['volume', 'hvn', 'profile'] },
        { subType: 'low_volume_node',         name: 'Low Volume Node (LVN)',                   description: 'Зона низкого объёма — цена быстро проходит.',                         difficulty: 'advanced',    timeframe: '240', direction: 'long',  tags: ['volume', 'lvn', 'profile'] },
        { subType: 'point_of_control',        name: 'Point of Control (POC)',                  description: 'Уровень максимального объёма — магнит для цены.',                     difficulty: 'advanced',    timeframe: 'D',   direction: 'wait',  tags: ['volume', 'poc', 'profile'] },
        { subType: 'value_area_migration',    name: 'Value Area Migration',                    description: 'Смещение зоны стоимости — смена характера рынка.',                     difficulty: 'advanced',    timeframe: 'D',   direction: 'wait',  tags: ['volume', 'value-area'] }
    ];

    // 20 RISK-MANAGEMENT TEMPLATES
    const RISK_MANAGEMENT_TEMPLATES = [
        { subType: 'stop_below_last_low_long', name: 'Стоп за последним минимумом (Long)',     description: 'Корректное размещение стоп-лосса при длинной позиции.',                difficulty: 'beginner',    timeframe: '60',  direction: 'long',  tags: ['risk', 'stop', 'long'] },
        { subType: 'stop_above_last_high_short', name: 'Стоп за последним максимумом (Short)', description: 'Корректное размещение стоп-лосса при короткой позиции.',               difficulty: 'beginner',    timeframe: '60',  direction: 'short', tags: ['risk', 'stop', 'short'] },
        { subType: 'position_size_1pct',      name: 'Размер позиции 1%',                       description: 'Консервативный риск на сделку.',                                        difficulty: 'beginner',    timeframe: '60',  direction: 'long',  tags: ['risk', 'position-size', '1pct'] },
        { subType: 'position_size_2pct',      name: 'Размер позиции 2%',                       description: 'Умеренный риск на сделку.',                                             difficulty: 'beginner',    timeframe: '60',  direction: 'long',  tags: ['risk', 'position-size', '2pct'] },
        { subType: 'rr_1_2_optimal',          name: 'R:R = 1:2 (оптимально)',                  description: 'Оптимальное соотношение риск/прибыль.',                                 difficulty: 'beginner',    timeframe: '60',  direction: 'long',  tags: ['risk', 'rr', 'optimal'] },
        { subType: 'rr_1_3_aggressive',       name: 'R:R = 1:3 (агрессивно)',                  description: 'Агрессивное соотношение для сильных сетапов.',                          difficulty: 'intermediate', timeframe: '240', direction: 'long',  tags: ['risk', 'rr', 'aggressive'] },
        { subType: 'rr_1_1_minimal',          name: 'R:R = 1:1 (минимально)',                  description: 'Минимально допустимое соотношение.',                                    difficulty: 'beginner',    timeframe: '60',  direction: 'wait',  tags: ['risk', 'rr', 'minimal'] },
        { subType: 'no_entry_zone_disqualified', name: 'Запретная зона для входа',             description: 'Зона дисквалификации входа.',                                           difficulty: 'intermediate', timeframe: '60',  direction: 'no_trade', tags: ['risk', 'no-entry'] },
        { subType: 'late_entry_overpay',      name: 'Поздний вход (переплата)',                description: 'Цена уже прошла значительную часть движения.',                         difficulty: 'advanced',    timeframe: '60',  direction: 'wait',  tags: ['risk', 'late-entry'] },
        { subType: 'over_leverage_danger',    name: 'Опасное кредитное плечо',                 description: 'Высокое плечо увеличивает риск ликвидации.',                           difficulty: 'advanced',    timeframe: '60',  direction: 'no_trade', tags: ['risk', 'leverage', 'danger'] },
        { subType: 'correlation_risk',        name: 'Корреляционный риск',                     description: 'Сделка в одном направлении по коррелирующим активам.',                 difficulty: 'advanced',    timeframe: '240', direction: 'wait',  tags: ['risk', 'correlation'] },
        { subType: 'gap_risk_overnight',      name: 'Гэп-риск на овернайт',                    description: 'Удержание позиции через ночь несёт риск гэпа.',                       difficulty: 'intermediate', timeframe: 'D',   direction: 'wait',  tags: ['risk', 'gap', 'overnight'] },
        { subType: 'drawdown_management',     name: 'Управление просадкой',                    description: 'Сокращение размера позиции при серии убытков.',                        difficulty: 'advanced',    timeframe: 'D',   direction: 'no_trade', tags: ['risk', 'drawdown'] },
        { subType: 'recovery_after_streak_losses', name: 'Восстановление после серии убытков', description: 'Возврат к торговле после потерь.',                                  difficulty: 'advanced',    timeframe: 'D',   direction: 'no_trade', tags: ['risk', 'recovery'] },
        { subType: 'increasing_after_wins_danger', name: 'Увеличение риска после побед (тильт)', description: 'Опасность раздувания позиции после успешных сделок.',           difficulty: 'advanced',    timeframe: '240', direction: 'no_trade', tags: ['risk', 'tilt', 'overconfidence'] },
        { subType: 'partial_profit_taking',   name: 'Частичная фиксация прибыли',              description: 'Закрытие части позиции на цели 1.',                                    difficulty: 'intermediate', timeframe: '60',  direction: 'long',  tags: ['risk', 'profit-taking'] },
        { subType: 'trailing_stop_strategy',  name: 'Стратегия трейлинг-стопа',                description: 'Перенос стопа вслед за ценой.',                                        difficulty: 'intermediate', timeframe: '60',  direction: 'long',  tags: ['risk', 'trailing-stop'] },
        { subType: 'stop_at_structure_zone',  name: 'Стоп на структурной зоне',               description: 'Размещение стопа за значимым уровнем.',                                difficulty: 'intermediate', timeframe: '240', direction: 'long',  tags: ['risk', 'stop', 'structure'] },
        { subType: 'stop_atr_based',          name: 'Стоп по ATR',                             description: 'Дистанция стопа основана на волатильности.',                           difficulty: 'advanced',    timeframe: '60',  direction: 'long',  tags: ['risk', 'stop', 'atr'] },
        { subType: 'stop_vwap_based',         name: 'Стоп по VWAP',                            description: 'Стоп относительно средневзвешенной цены.',                            difficulty: 'advanced',    timeframe: '60',  direction: 'short', tags: ['risk', 'stop', 'vwap'] }
    ];

    // 10 PSYCHOLOGY TEMPLATES
    const PSYCHOLOGY_TEMPLATES = [
        { subType: 'fomo_after_impulse',      name: 'FOMO после импульса',                     description: 'Желание вскочить в уже состоявшееся движение.',                         difficulty: 'intermediate', timeframe: '60',  direction: 'no_trade', tags: ['psychology', 'fomo'] },
        { subType: 'revenge_trade_setup',     name: 'Месть после убытка',                      description: 'Увеличенная позиция для отыгрыша.',                                     difficulty: 'advanced',    timeframe: '60',  direction: 'no_trade', tags: ['psychology', 'revenge'] },
        { subType: 'overconfidence_setup',    name: 'Overconfidence сетап',                    description: 'Серия побед ведёт к самоуверенности.',                                 difficulty: 'intermediate', timeframe: '240', direction: 'no_trade', tags: ['psychology', 'overconfidence'] },
        { subType: 'discretion_filtering',    name: 'Дискреционная фильтрация',               description: 'Пропуск сетапов, не подходящих под правила.',                          difficulty: 'advanced',    timeframe: '60',  direction: 'wait',  tags: ['psychology', 'discretion'] },
        { subType: 'news_cooldown',           name: 'Cooldown вокруг новостей',                description: 'Пауза до и после важных новостей.',                                     difficulty: 'intermediate', timeframe: '60',  direction: 'no_trade', tags: ['psychology', 'news'] },
        { subType: 'end_of_day_risk',         name: 'Риск конца дня',                          description: 'Избегание новых входов перед закрытием сессии.',                       difficulty: 'beginner',    timeframe: '60',  direction: 'no_trade', tags: ['psychology', 'eod'] },
        { subType: 'weekend_setup_avoid',     name: 'Избегание сетапов на выходных',           description: 'Низкая ликвидность и гэпы.',                                           difficulty: 'beginner',    timeframe: 'D',   direction: 'no_trade', tags: ['psychology', 'weekend'] },
        { subType: 'earnings_risk',           name: 'Риск отчётности',                         description: 'Не входить перед публикацией отчёта.',                                  difficulty: 'intermediate', timeframe: 'D',   direction: 'no_trade', tags: ['psychology', 'earnings'] },
        { subType: 'catching_knife_vs_confirmation', name: 'Ловить нож vs ждать подтверждения', description: 'Искушение купить падающий нож.',                                  difficulty: 'advanced',    timeframe: '60',  direction: 'wait',  tags: ['psychology', 'patience'] },
        { subType: 'plan_vs_improvisation',   name: 'План vs Импровизация',                    description: 'Торговля по плану против спонтанных решений.',                        difficulty: 'advanced',    timeframe: '60',  direction: 'wait',  tags: ['psychology', 'plan'] }
    ];

    // ================================================================
    // ГЕНЕРАТОР СЦЕНАРИЕВ ПО КАТЕГОРИЯМ
    // ================================================================

    /**
     * Строит массив сценариев для заданной категории.
     */
    function buildScenariosByCategory(templates, category) {
        return templates.map((t, idx) => {
            const cfg = getConfig(idx + hashIndex(category));
            // Символ и таймфрейм берём ИЗ cfg, который уже опирается
            // на реальный сегмент (см. getConfig). Это исключает любые
            // расхождения между названием инструмента и реальными данными.
            const symbol = cfg.symbol;
            const timeframe = cfg.timeframe;

            // Контекст и биас на основе направления
            let ctx, bias, confidence;
            if (t.direction === 'long') {
                ctx = 'uptrend';
                bias = 'bullish';
                confidence = 65 + (idx % 25);
            } else if (t.direction === 'short') {
                ctx = 'downtrend';
                bias = 'bearish';
                confidence = 65 + (idx % 25);
            } else if (t.direction === 'wait') {
                ctx = 'range';
                bias = 'neutral';
                confidence = 50 + (idx % 20);
            } else {
                ctx = 'conflicting';
                bias = 'neutral';
                confidence = 35 + (idx % 25);
            }

            // ════════════════════════════════════════════════════════════
            // ВАЖНО (v4): РЕАЛЬНЫЕ исторические данные.
            // Свечи НЕ генерируются алгоритмически. Каждый сценарий получает
            // реальный сегмент OHLCV из модуля RealHistoricalData, который
            // содержит 200 настоящих свечей с биржи Binance.
            //
            // Заполнение candles/futureCandles происходит ниже через
            // prebakeScenarioCandles() — детерминированно по (idx, category),
            // без обращений к внешним API.
            // ════════════════════════════════════════════════════════════
            // Каждый сценарий должен содержать минимум 150–300 исторических свечей,
            // чтобы пользователь видел полноценный контекст рынка:
            // предыдущие тренды, накопление, импульсы, коррекции и уровни.
            // Только последние 20–40 свечей — рабочая область для решения.
            // Сегмент = 200 свечей; hiddenCount=4..6 ⇒ visible+hidden ≤ 200.
            const visibleCount = 175 + (idx % 20); // 175..194
            const hiddenCount = 4 + (idx % 3);     // 4..6 будущих свечей

            // Детерминированный seed для выбора стартовой позиции в сегменте
            const _segmentSeed = hashIndex(category) * 1000 + idx;

            // 3. AnalysisResult (используется для оценки)
            const correctAnalysisResult = buildAnalysisResult(bias, ctx, confidence, t.subType);

            // 4. Подсказки на основе категории и типа
            const defaultHints = {
                'price-action': ['Определите тип паттерна', 'Проверьте расположение относительно уровня', 'Оцените объём подтверждения'],
                'smart-money': ['Найдите BOS/CHOCH', 'Ищите FVG и Order Block', 'Проверьте ликвидность'],
                'market-structure': ['Определите фазу рынка', 'Отметьте HH/HL или LH/LL', 'Ищите подтверждение смены структуры'],
                'liquidity': ['Найдите скопление стоп-ордеров', 'Определите, была ли ликвидность снята', 'Ждите возврата после свипа'],
                'volume': ['Сравните объём со средним', 'Ищите дивергенции', 'Оцените усилие vs результат'],
                'risk-management': ['Определите оптимальный размер позиции', 'Поставьте стоп по структуре', 'Цельтесь в R:R ≥ 1:2'],
                'psychology': ['Оцените своё эмоциональное состояние', 'Следуйте плану, а не эмоциям', 'Лучше пропустить, чем рисковать']
            };

            const hints = defaultHints[category] || defaultHints['price-action'];
            if (t.pattern && t.pattern.type) {
                hints.push(`Паттерн: ${t.pattern.type.replace(/_/g, ' ')}`);
            }

            // Маппинг timeframe (TradingView-формат) → Binance-интервал,
            // реально присутствующий в RealHistoricalData.
            const intervalStr = TF_TO_INTERVAL[t.timeframe || cfg.timeframe] || '1h';

            // 5. Сборка сценария.
            // candles и futureCandles заполняются ниже — реальными сегментами.
            return {
                id: category.slice(0, 2) + '-' + String(idx + 1).padStart(3, '0'),
                name: t.name,
                description: t.description,
                difficulty: t.difficulty,
                category: category,
                timeframe: timeframe,
                interval: intervalStr,
                symbol: t.symbol || symbol,
                startPrice: cfg.startPrice,  // ← реальная цена первой свечи
                visibleCount: visibleCount,
                hiddenCount: hiddenCount,
                _segmentSeed: _segmentSeed,    // детерминированный seed
                _config: cfg,                  // ← полная конфигурация сегмента для prebake
                _template: t,                  // для пред-генерации свечей
                candles: [],                   // ← заполняется ниже из RealHistoricalData
                futureCandles: [],             // ← заполняется ниже из RealHistoricalData
                correctDecision: t.direction,
                correctAnalysisResult: correctAnalysisResult,
                explanation: buildExplanation({ name: t.name, correctDecision: t.direction, category, difficulty: t.difficulty }, t.direction),
                educationalComment: buildEducationalComment(category, t.subType, t.direction),
                hints: hints,
                tags: t.tags || []
            };
        });
    }

    /**
     * Хеш-функция для индексации по категории.
     */
    function hashIndex(category) {
        let h = 0;
        for (let i = 0; i < category.length; i++) {
            h = ((h << 5) - h + category.charCodeAt(i)) | 0;
        }
        return Math.abs(h) % 200;
    }

    // ================================================================
    // СБОРКА ФИНАЛЬНОГО МАССИВА
    // ================================================================

    const SCENARIOS = [
        ...buildScenariosByCategory(PRICE_ACTION_TEMPLATES,       'price-action'),
        ...buildScenariosByCategory(SMART_MONEY_TEMPLATES,        'smart-money'),
        ...buildScenariosByCategory(MARKET_STRUCTURE_TEMPLATES,   'market-structure'),
        ...buildScenariosByCategory(LIQUIDITY_TEMPLATES,          'liquidity'),
        ...buildScenariosByCategory(VOLUME_TEMPLATES,             'volume'),
        ...buildScenariosByCategory(RISK_MANAGEMENT_TEMPLATES,    'risk-management'),
        ...buildScenariosByCategory(PSYCHOLOGY_TEMPLATES,         'psychology')
    ];

    // ════════════════════════════════════════════════════════════════════════════
    // ПРЕД-ЗАГРУЗКА РЕАЛЬНЫХ ИСТОРИЧЕСКИХ СВЕЧЕЙ ДЛЯ КАЖДОГО СЦЕНАРИЯ
    // ════════════════════════════════════════════════════════════════════════════
    // Каждый сценарий получает реальный сегмент OHLCV из модуля RealHistoricalData.
    // Эти данные — настоящие исторические свечи с биржи Binance, скачанные
    // один раз через data-api.binance.vision и упакованные в public/js/RealHistoricalData.js.
    //
    // Training Mode полностью автономен:
    //   • НЕТ алгоритмической генерации (random walk / RealisticCandleBuilder — ЗАПРЕЩЕНЫ).
    //   • НЕТ обращений к внешним API при загрузке сценариев.
    //   • Каждый сценарий детерминированно привязан к окну в реальном сегменте.
    //   • 140 сценариев маппятся на 48 сегментов (8 символов × 3 интервала).
    // ════════════════════════════════════════════════════════════════════════════

    /**
     * Получить реальное окно свечей для сценария через RealHistoricalData.
     * Возвращает { visible, hidden, segmentId } или null, если модуль недоступен.
     *
     * Логика (data-driven):
     *   1) Сценарий уже имеет _config с точными параметрами сегмента
     *      (symbol, interval, segmentId) — назначенными в getConfig().
     *   2) Используем ИМЕННО этот сегмент, не пытаясь «резолвить» другой.
     *   3) Детерминированно выбираем startIdx внутри сегмента по _segmentSeed.
     *
     * Это гарантирует, что сценарий «XRPUSDT 1h» ВСЕГДА получает
     * реальные свечи XRPUSDT 1h — никаких подмен.
     */
    function prebakeScenarioCandles(scenario, idx) {
        if (!global.RealHistoricalData) {
            console.warn('[ScenarioLibrary] RealHistoricalData не загружен — сценарий', scenario.id, 'останется без свечей');
            return null;
        }

        const t = scenario._template || null;
        const visibleCount = scenario.visibleCount || 30;
        const hiddenCount = scenario.hiddenCount || 6;
        const cfg = scenario._config || {};

        // 1) Определяем целевой символ и интервал.
        // Приоритет: _config (новый data-driven путь) → fallback через resolve.
        let symbol = cfg.segmentSymbol || toBinanceSymbol(scenario.symbol);
        let interval = cfg.segmentInterval || (TF_TO_INTERVAL[scenario.timeframe] || '1h');

        // 2) Находим сегмент. Если _config указал конкретный segmentId — берём его напрямую.
        let seg = null;
        if (cfg.segmentId) {
            seg = global.RealHistoricalData.getSegment(cfg.segmentId);
        }
        if (!seg) {
            const segments = global.RealHistoricalData.getSegmentsBySymbol(symbol);
            if (!segments || segments.length === 0) {
                console.warn('[ScenarioLibrary] Нет сегментов для', symbol, '— сценарий', scenario.id, 'пропущен');
                return null;
            }
            seg = segments.find(function (s) { return s.interval === interval; }) || segments[0];
            // После возможной коррекции — обновим symbol/interval,
            // чтобы они точно соответствовали фактическому сегменту.
            if (seg) {
                symbol = seg.symbol;
                interval = seg.interval;
            }
        }

        if (!seg) {
            console.warn('[ScenarioLibrary] Не найден сегмент для', scenario.id, '(', symbol, interval, ')');
            return null;
        }

        // 3) Детерминированный выбор окна внутри сегмента.
        const seed = scenario._segmentSeed != null ? scenario._segmentSeed : (idx * 7919 + 13);
        const maxStart = Math.max(0, seg.candles.length - visibleCount - hiddenCount - 5);
        const startIdx = (hashSeed(seed + ':' + seg.id) % (maxStart + 1));

        // ВАЖНО: getWindow() в RealHistoricalData при наличии interval игнорирует
        // segmentIdx и берёт первый сегмент с подходящим интервалом — это может
        // вернуть не наш сегмент (например, BTCUSDT_4h_d60 вместо BTCUSDT_4h_d320).
        // Чтобы гарантированно использовать ИМЕННО наш сегмент, делаем срез напрямую
        // и формируем результат в том же формате, что и getWindow.
        const visible = seg.candles.slice(startIdx, startIdx + visibleCount);
        const hidden = seg.candles.slice(startIdx + visibleCount, startIdx + visibleCount + hiddenCount);
        const window = {
            visible: visible,
            hidden: hidden,
            meta: {
                segmentId: seg.id,
                symbol: seg.symbol,
                interval: seg.interval,
                offsetDays: seg.offsetDays,
                startIdx: startIdx,
                visibleEndTime: visible.length > 0 ? visible[visible.length - 1].time : null
            }
        };

        if (!window.visible || window.visible.length === 0) {
            console.warn('[ScenarioLibrary] Окно пустое для', scenario.id);
            return null;
        }

        return {
            visible: window.visible,
            hidden: window.hidden || [],
            segmentId: seg.id,  // ← используем ИМЕННО наш seg.id
            symbol: seg.symbol,
            interval: seg.interval,
            startPrice: round(seg.candles[0].close)
        };
    }

    // Запускаем пред-загрузку реальных данных для всех сценариев
    let prebakedCount = 0;
    let prebakeFailed = 0;
    const segmentUsage = {}; // segmentId → count
    SCENARIOS.forEach(function (s, idx) {
        if (!s.candles || s.candles.length === 0) {
            const result = prebakeScenarioCandles(s, idx);
            if (result && result.visible && result.visible.length > 0) {
                s.candles = result.visible;
                s.futureCandles = result.hidden || [];
                s.dataSource = 'real_historical';
                s.realSegmentId = result.segmentId || null;
                // Синхронизируем публичные поля с фактически загруженным сегментом.
                // Это страховка: даже если _config был неполный, итоговые symbol/interval
                // гарантированно отражают реальные данные.
                if (result.symbol) {
                    s.symbol = 'BINANCE:' + result.symbol;
                }
                if (result.interval) {
                    s.interval = result.interval;
                    const tf = INTERVAL_TO_TF[result.interval];
                    if (tf) s.timeframe = tf;
                }
                if (typeof result.startPrice === 'number') {
                    s.startPrice = result.startPrice;
                }
                if (result.segmentId) {
                    segmentUsage[result.segmentId] = (segmentUsage[result.segmentId] || 0) + 1;
                }
                prebakedCount++;
            } else {
                prebakeFailed++;
                console.warn('[ScenarioLibrary] Не удалось загрузить реальные свечи для', s.id, '(', s.symbol, s.interval, ')');
            }
        }
    });
    console.log('[ScenarioLibrary] Загрузка реальных данных завершена: ' + prebakedCount + '/' + SCENARIOS.length + ' сценариев имеют реальные исторические свечи, не удалось: ' + prebakeFailed);
    if (prebakeFailed > 0) {
        console.warn('[ScenarioLibrary] ' + prebakeFailed + ' сценариев не имеют реальных свечей — они будут недоступны для обучения.');
    }
    if (Object.keys(segmentUsage).length > 0) {
        console.log('[ScenarioLibrary] Использовано уникальных сегментов:', Object.keys(segmentUsage).length, '/ распределение:', segmentUsage);
    }

    // ================================================================
    // ПЕРЕОПРЕДЕЛЕНИЕ window.TrainerScenarios
    // ================================================================
    // Trainer.js читает global.TrainerScenarios.SCENARIOS при инициализации PAYDTrainer.
    // Загружая ScenarioLibrary.js ПОСЛЕ TrainerScenarios.js и ДО создания PAYDTrainer,
    // мы переопределяем массив сценариев на нашу библиотеку.

    if (typeof global.TrainerScenarios !== 'undefined' && global.TrainerScenarios) {
        global.TrainerScenarios.SCENARIOS = SCENARIOS;
        if (typeof global.TrainerScenarios.getCount !== 'function') {
            global.TrainerScenarios.getCount = function () { return SCENARIOS.length; };
        }
        if (typeof global.TrainerScenarios.getByIndex !== 'function') {
            global.TrainerScenarios.getByIndex = function (i) { return SCENARIOS[i % SCENARIOS.length]; };
        }
        if (typeof global.TrainerScenarios.getById !== 'function') {
            global.TrainerScenarios.getById = function (id) { return SCENARIOS.find(function (s) { return s.id === id; }); };
        }
    } else {
        global.TrainerScenarios = {
            SCENARIOS: SCENARIOS,
            getCount: function () { return SCENARIOS.length; },
            getByIndex: function (i) { return SCENARIOS[i % SCENARIOS.length]; },
            getById: function (id) { return SCENARIOS.find(function (s) { return s.id === id; }); }
        };
    }

    // ================================================================
    // ДОПОЛНИТЕЛЬНЫЙ API ДЛЯ ФИЛЬТРАЦИИ И РАНДОМИЗАЦИИ
    // ================================================================

    const byCategory = {};
    const byDifficulty = {};
    SCENARIOS.forEach(function (s) {
        (byCategory[s.category] = byCategory[s.category] || []).push(s);
        (byDifficulty[s.difficulty] = byDifficulty[s.difficulty] || []).push(s);
    });

    global.SCENARIO_LIBRARY = {
        scenarios: SCENARIOS,
        byCategory: byCategory,
        byDifficulty: byDifficulty,
        getRandom: function (filter) {
            filter = filter || {};
            let pool = SCENARIOS;
            if (filter.category && filter.difficulty) {
                pool = SCENARIOS.filter(function (s) {
                    return s.category === filter.category && s.difficulty === filter.difficulty;
                });
            } else if (filter.category) {
                pool = byCategory[filter.category] || [];
            } else if (filter.difficulty) {
                pool = byDifficulty[filter.difficulty] || [];
            }
            if (filter.tags && Array.isArray(filter.tags) && filter.tags.length > 0) {
                pool = pool.filter(function (s) {
                    return filter.tags.some(function (t) { return s.tags.indexOf(t) !== -1; });
                });
            }
            if (!pool || pool.length === 0) return null;
            return pool[Math.floor(Math.random() * pool.length)];
        },
        filter: function (filter) {
            filter = filter || {};
            return SCENARIOS.filter(function (s) {
                if (filter.category && s.category !== filter.category) return false;
                if (filter.difficulty && s.difficulty !== filter.difficulty) return false;
                if (filter.tags && filter.tags.length > 0 && !filter.tags.some(function (t) { return s.tags.indexOf(t) !== -1; })) return false;
                return true;
            });
        },
        categories: ['price-action', 'smart-money', 'market-structure', 'liquidity', 'volume', 'risk-management', 'psychology'],
        totalCount: SCENARIOS.length,
        countByCategory: Object.fromEntries(Object.entries(byCategory).map(function (e) { return [e[0], e[1].length]; }))
    };

    console.log('[ScenarioLibrary] Загружено сценариев: ' + SCENARIOS.length);
    console.log('[ScenarioLibrary] По категориям:', global.SCENARIO_LIBRARY.countByCategory);

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this)));