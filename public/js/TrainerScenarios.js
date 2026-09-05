/**
 * TrainerScenarios — Библиотека обучающих сценариев для PAYD Trading Lab.
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  ВАЖНО (v3):
 *    Сценарии больше НЕ содержат искусственно сгенерированных свечей.
 *    Каждый сценарий описывает:
 *      - symbol      : тикер (BTCUSDT, ETHUSDT, ...)
 *      - interval    : таймфрейм ('15m', '1h', '4h', '1d')
 *      - anchorDaysAgo : "точка остановки" — N дней назад от текущего момента
 *      - visibleCount  : сколько реальных свечей показать ДО anchorTime
 *      - level        : индекс уровня обучения (0-5), соответствующий
 *                       EducationContent.LEVELS[level]
 *
 *    При старте сценария Trainer вызывает RealMarketData.loadScenarioCandles()
 *    и получает РЕАЛЬНЫЕ исторические свечи с Binance. Никаких синтетических
 *    данных — пользователь учится работать с настоящим рынком.
 *
 *  Уровни обучения:
 *    0 = Пробой уровня          (breakout, BOS, CHoCH, momentum)
 *    1 = Отскок от уровня       (reversal, engulfing, pin-bar, OB)
 *    2 = Тренд + ретест         (trend, pullback, MA, retest)
 *    3 = Дивергенция            (divergence, RSI, MACD)
 *    4 = Волатильность          (volatility, ATR, BB, squeeze)
 *    5 = Мультитаймфрейм        (multi-timeframe, confluence, MTF)
 * ════════════════════════════════════════════════════════════════════════════
 */

(function (global) {
    'use strict';

    if (!global) {
        throw new Error('[TrainerScenarios] global is required');
    }

    // ================================================================
    // СЦЕНАРИИ (v3 — на реальных рыночных данных, с привязкой к уровням)
    // ================================================================
    //
    // anchorDaysAgo выбраны так, чтобы попадать в исторические периоды
    // с ярко выраженными сетапами соответствующего уровня.
    //
    // correctAnalysisHint используется для UI-оценки и подсказок
    // пользователю после его ответа.

    const SCENARIOS = [

        {
            id: 'sc-bos-01',
            name: 'Bullish Break of Structure (BTC)',
            description: 'Реальный рынок BTC/USDT, 1H. Идентифицируйте бычий BOS и продолжение тренда.',
            difficulty: 'intermediate',
            symbol: 'BTCUSDT',
            interval: '1h',
            anchorDaysAgo: 45,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'long',
            tags: ['BOS', 'Market Structure', 'BTC', 'breakout'],
            correctAnalysisHint: {
                pattern: 'Bullish BOS',
                expectedBias: 'bullish',
                reasoning: 'После формирования Higher Low на 1H произошёл пробой последнего локального High — это подтверждение бычьей структуры.',
                keyLevel: 'BOS level — пробой последнего HH на 1H'
            }
        },
        {
            id: 'sc-choch-01',
            name: 'Bearish Change of Character (BTC)',
            description: 'Реальный рынок BTC/USDT, 1H. Смена характера движения с бычьего на медвежий.',
            difficulty: 'intermediate',
            symbol: 'BTCUSDT',
            interval: '1h',
            anchorDaysAgo: 50,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'short',
            tags: ['CHoCH', 'Trend Reversal', 'BTC', 'breakout'],
            correctAnalysisHint: {
                pattern: 'Bearish CHoCH',
                expectedBias: 'bearish',
                reasoning: 'После восходящего тренда цена пробила последний Higher Low — это сигнал смены характера движения.',
                keyLevel: 'CHoCH level — пробой последнего HL'
            }
        },
        {
            id: 'sc-bos-02',
            name: 'Bearish BOS (ETH)',
            description: 'Реальный рынок ETH/USDT, 4H. Медвежий пробой структуры — продолжение нисходящего тренда.',
            difficulty: 'intermediate',
            symbol: 'ETHUSDT',
            interval: '4h',
            anchorDaysAgo: 80,
            visibleCount: 70,
            hiddenCount: 12,
            correctDecision: 'short',
            tags: ['BOS', 'Bearish', 'ETH', 'breakout'],
            correctAnalysisHint: {
                pattern: 'Bearish BOS',
                expectedBias: 'bearish',
                reasoning: 'Цена пробила последний Lower Low — это подтверждение медвежьей структуры на 4H.',
                keyLevel: 'BOS level — пробой последнего LL'
            }
        },
        {
            id: 'sc-bos-03',
            name: 'Bullish BOS on BNB 4H',
            description: 'Реальный рынок BNB/USDT, 4H. Бычий пробой ключевого сопротивления с подтверждением объёмом.',
            difficulty: 'intermediate',
            symbol: 'BNBUSDT',
            interval: '4h',
            anchorDaysAgo: 30,
            visibleCount: 60,
            hiddenCount: 10,
            correctDecision: 'long',
            tags: ['BOS', 'Bullish', 'BNB', 'breakout', 'volume'],
            correctAnalysisHint: {
                pattern: 'Bullish BOS with volume',
                expectedBias: 'bullish',
                reasoning: 'Пробой сопротивления на 4H с повышенным объёмом — подтверждение бычьего BOS.',
                keyLevel: 'Resistance breakout level'
            }
        },
        {
            id: 'sc-breakout-01',
            name: 'Range Breakout (SOL)',
            description: 'Реальный рынок SOL/USDT, 1H. Пробой верхней границы боковика.',
            difficulty: 'intermediate',
            symbol: 'SOLUSDT',
            interval: '1h',
            anchorDaysAgo: 20,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'long',
            tags: ['Breakout', 'Range', 'SOL', 'momentum'],
            correctAnalysisHint: {
                pattern: 'Range Breakout',
                expectedBias: 'bullish',
                reasoning: 'Цена вышла за верхнюю границу диапазона с увеличенным объёмом — продолжение восходящего движения.',
                keyLevel: 'Range High — пробитый уровень сопротивления'
            }
        },
        {
            id: 'sc-breakout-02',
            name: 'Range Breakdown (ETH)',
            description: 'Реальный рынок ETH/USDT, 4H. Пробой нижней границы диапазона — продолжение снижения.',
            difficulty: 'intermediate',
            symbol: 'ETHUSDT',
            interval: '4h',
            anchorDaysAgo: 65,
            visibleCount: 60,
            hiddenCount: 10,
            correctDecision: 'short',
            tags: ['Breakdown', 'Range', 'ETH', 'momentum'],
            correctAnalysisHint: {
                pattern: 'Range Breakdown',
                expectedBias: 'bearish',
                reasoning: 'Цена пробила нижнюю границу диапазона с увеличенным объёмом — продолжение нисходящего движения.',
                keyLevel: 'Range Low — пробитый уровень поддержки'
            }
        },
        {
            id: 'sc-momentum-01',
            name: 'High Volume Breakout (BTC)',
            description: 'Реальный рынок BTC/USDT, 1H. Пробой уровня на повышенном объёме — сильный моментум.',
            difficulty: 'intermediate',
            symbol: 'BTCUSDT',
            interval: '1h',
            anchorDaysAgo: 15,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'long',
            tags: ['Volume', 'Breakout', 'BTC', 'momentum', 'confirmation'],
            correctAnalysisHint: {
                pattern: 'High Volume Breakout',
                expectedBias: 'bullish',
                reasoning: 'Пробой сопротивления с объёмом в 3 раза выше среднего — сильный моментум вверх.',
                keyLevel: 'Resistance level with volume confirmation'
            }
        },
        {
            id: 'sc-fakeout-01',
            name: 'Fakeout Below Support (ETH)',
            description: 'Реальный рынок ETH/USDT, 1H. Ложный пробой поддержки с возвратом цены обратно.',
            difficulty: 'advanced',
            symbol: 'ETHUSDT',
            interval: '1h',
            anchorDaysAgo: 28,
            visibleCount: 80,
            hiddenCount: 14,
            correctDecision: 'long',
            tags: ['Fakeout', 'Support', 'ETH', 'reversal'],
            correctAnalysisHint: {
                pattern: 'Bullish Fakeout',
                expectedBias: 'bullish',
                reasoning: 'Цена на короткое время пробила поддержку, но быстро вернулась выше — классический ложный пробой.',
                keyLevel: 'Support level with fake breakout'
            }
        },
        {
            id: 'sc-breakout-03',
            name: 'Round Number Breakout (BTC)',
            description: 'Реальный рынок BTC/USDT, 1D. Пробой психологически важного круглого уровня.',
            difficulty: 'advanced',
            symbol: 'BTCUSDT',
            interval: '1d',
            anchorDaysAgo: 110,
            visibleCount: 50,
            hiddenCount: 10,
            correctDecision: 'long',
            tags: ['Breakout', 'Round Number', 'BTC', 'psychological'],
            correctAnalysisHint: {
                pattern: 'Round Number Breakout',
                expectedBias: 'bullish',
                reasoning: 'Пробой круглого числа ($60k) с закреплением выше — сильный бычий сигнал.',
                keyLevel: 'Psychological round number level'
            }
        },
        {
            id: 'sc-bos-04',
            name: 'Bullish CHoCH (SOL)',
            description: 'Реальный рынок SOL/USDT, 4H. Смена тренда с медвежьего на бычий — CHoCH вверх.',
            difficulty: 'advanced',
            symbol: 'SOLUSDT',
            interval: '4h',
            anchorDaysAgo: 55,
            visibleCount: 70,
            hiddenCount: 12,
            correctDecision: 'long',
            tags: ['CHoCH', 'Bullish', 'SOL', 'reversal'],
            correctAnalysisHint: {
                pattern: 'Bullish CHoCH',
                expectedBias: 'bullish',
                reasoning: 'После нисходящего тренда цена пробила последний Lower High — первая смена характера движения.',
                keyLevel: 'CHoCH level — пробой последнего LH'
            }
        },

        {
            id: 'sc-engulf-01',
            name: 'Bullish Engulfing at Support (BNB)',
            description: 'Реальный рынок BNB/USDT, 4H. Бычье поглощение на ключевом уровне поддержки.',
            difficulty: 'beginner',
            symbol: 'BNBUSDT',
            interval: '4h',
            anchorDaysAgo: 40,
            visibleCount: 60,
            hiddenCount: 10,
            correctDecision: 'long',
            tags: ['Engulfing', 'Support', 'BNB', 'reversal'],
            correctAnalysisHint: {
                pattern: 'Bullish Engulfing',
                expectedBias: 'bullish',
                reasoning: 'На уровне поддержки сформировалась бычья поглощающая свеча — это разворотный сетап.',
                keyLevel: 'Support level'
            }
        },
        {
            id: 'sc-pb-01',
            name: 'Pullback to Order Block (ETH)',
            description: 'Реальный рынок ETH/USDT, 4H. Цена откатывает к бычьему ордер-блоку в восходящем тренде.',
            difficulty: 'beginner',
            symbol: 'ETHUSDT',
            interval: '4h',
            anchorDaysAgo: 60,
            visibleCount: 60,
            hiddenCount: 10,
            correctDecision: 'long',
            tags: ['Order Block', 'Pullback', 'ETH', 'reversal'],
            correctAnalysisHint: {
                pattern: 'Bullish Pullback to OB',
                expectedBias: 'bullish',
                reasoning: 'В рамках бычьего тренда цена вернулась к зоне бычьего ордер-блока, что создаёт возможность для входа в лонг.',
                keyLevel: 'OB zone — последний бычий импульс перед коррекцией'
            }
        },
        {
            id: 'sc-fvg-01',
            name: 'Bearish FVG Rejection (BTC)',
            description: 'Реальный рынок BTC/USDT, 15M. Цена вернулась в зону Fair Value Gap с медвежьим отклонением.',
            difficulty: 'advanced',
            symbol: 'BTCUSDT',
            interval: '15m',
            anchorDaysAgo: 25,
            visibleCount: 100,
            hiddenCount: 16,
            correctDecision: 'short',
            tags: ['FVG', 'Rejection', 'BTC', 'reversal'],
            correctAnalysisHint: {
                pattern: 'Bearish FVG Rejection',
                expectedBias: 'bearish',
                reasoning: 'Цена заполнила FVG-зону снизу и получила медвежье отклонение — это сетап для входа в шорт.',
                keyLevel: 'FVG zone (gap между импульсными свечами)'
            }
        },
        {
            id: 'sc-liq-01',
            name: 'Liquidity Sweep Reversal (SOL)',
            description: 'Реальный рынок SOL/USDT, 1H. Снятие ликвидности с последующим разворотом.',
            difficulty: 'advanced',
            symbol: 'SOLUSDT',
            interval: '1h',
            anchorDaysAgo: 35,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'long',
            tags: ['Liquidity', 'Reversal', 'SOL', 'sweep'],
            correctAnalysisHint: {
                pattern: 'Bullish Liquidity Sweep',
                expectedBias: 'bullish',
                reasoning: 'Маркет-мейкер снял ликвидность ниже локального минимума и вернул цену выше — это разворотный сетап.',
                keyLevel: 'Liquidity pool ниже LL'
            }
        },
        {
            id: 'sc-pinbar-01',
            name: 'Bullish Pin Bar at Support (BTC)',
            description: 'Реальный рынок BTC/USDT, 4H. Бычий Pin Bar на уровне поддержки.',
            difficulty: 'beginner',
            symbol: 'BTCUSDT',
            interval: '4h',
            anchorDaysAgo: 18,
            visibleCount: 60,
            hiddenCount: 10,
            correctDecision: 'long',
            tags: ['Pin Bar', 'Support', 'BTC', 'reversal'],
            correctAnalysisHint: {
                pattern: 'Bullish Pin Bar',
                expectedBias: 'bullish',
                reasoning: 'Длинный нижний хвост на поддержке — сильный сигнал отскока вверх.',
                keyLevel: 'Support level with long wick'
            }
        },
        {
            id: 'sc-pinbar-02',
            name: 'Bearish Pin Bar at Resistance (ETH)',
            description: 'Реальный рынок ETH/USDT, 4H. Медвежий Pin Bar на уровне сопротивления.',
            difficulty: 'beginner',
            symbol: 'ETHUSDT',
            interval: '4h',
            anchorDaysAgo: 70,
            visibleCount: 60,
            hiddenCount: 10,
            correctDecision: 'short',
            tags: ['Pin Bar', 'Resistance', 'ETH', 'reversal'],
            correctAnalysisHint: {
                pattern: 'Bearish Pin Bar',
                expectedBias: 'bearish',
                reasoning: 'Длинный верхний хвост на сопротивлении — сильный сигнал отскока вниз.',
                keyLevel: 'Resistance level with long wick'
            }
        },
        {
            id: 'sc-engulf-02',
            name: 'Bearish Engulfing at Resistance (BTC)',
            description: 'Реальный рынок BTC/USDT, 1D. Медвежье поглощение на дневном сопротивлении.',
            difficulty: 'intermediate',
            symbol: 'BTCUSDT',
            interval: '1d',
            anchorDaysAgo: 95,
            visibleCount: 50,
            hiddenCount: 8,
            correctDecision: 'short',
            tags: ['Engulfing', 'Resistance', 'BTC', 'reversal'],
            correctAnalysisHint: {
                pattern: 'Bearish Engulfing',
                expectedBias: 'bearish',
                reasoning: 'На дневном сопротивлении сформировалась медвежья поглощающая свеча — разворотный сетап.',
                keyLevel: 'Daily resistance level'
            }
        },
        {
            id: 'sc-doji-01',
            name: 'Doji at Support (SOL)',
            description: 'Реальный рынок SOL/USDT, 1H. Доджи на поддержке — нерешительность перед отскоком.',
            difficulty: 'intermediate',
            symbol: 'SOLUSDT',
            interval: '1h',
            anchorDaysAgo: 12,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'long',
            tags: ['Doji', 'Support', 'SOL', 'indecision'],
            correctAnalysisHint: {
                pattern: 'Doji reversal',
                expectedBias: 'bullish',
                reasoning: 'Доджи на поддержке указывает на возможный разворот. Следующая свеча подтвердит направление.',
                keyLevel: 'Support level with doji'
            }
        },
        {
            id: 'sc-ob-01',
            name: 'Order Block Rejection (BNB)',
            description: 'Реальный рынок BNB/USDT, 4H. Отбой от неотработанного ордер-блока.',
            difficulty: 'intermediate',
            symbol: 'BNBUSDT',
            interval: '4h',
            anchorDaysAgo: 22,
            visibleCount: 60,
            hiddenCount: 10,
            correctDecision: 'long',
            tags: ['Order Block', 'BNB', 'rejection'],
            correctAnalysisHint: {
                pattern: 'Order Block Rejection',
                expectedBias: 'bullish',
                reasoning: 'Цена дошла до неотработанного бычьего ордер-блока и получила реакцию вверх.',
                keyLevel: 'Unmitigated bullish OB'
            }
        },
        {
            id: 'sc-harami-01',
            name: 'Bullish Harami at Support (ETH)',
            description: 'Реальный рынок ETH/USDT, 1H. Бычий харами на уровне поддержки после нисходящего движения.',
            difficulty: 'intermediate',
            symbol: 'ETHUSDT',
            interval: '1h',
            anchorDaysAgo: 38,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'long',
            tags: ['Harami', 'Support', 'ETH', 'reversal'],
            correctAnalysisHint: {
                pattern: 'Bullish Harami',
                expectedBias: 'bullish',
                reasoning: 'Маленькая зелёная свеча внутри красной на поддержке — замедление тренда, возможен разворот.',
                keyLevel: 'Support level with harami'
            }
        },

        {
            id: 'sc-trend-01',
            name: 'Higher Low Formation (BTC)',
            description: 'Реальный рынок BTC/USDT, 4H. Формирование Higher Low в восходящем тренде — точка входа.',
            difficulty: 'intermediate',
            symbol: 'BTCUSDT',
            interval: '4h',
            anchorDaysAgo: 32,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'long',
            tags: ['Trend', 'Higher Low', 'BTC', 'pullback'],
            correctAnalysisHint: {
                pattern: 'Higher Low in Uptrend',
                expectedBias: 'bullish',
                reasoning: 'В восходящем тренде формируется новый Higher Low — это идеальная точка для входа в лонг.',
                keyLevel: 'Higher Low zone with confirmation'
            }
        },
        {
            id: 'sc-trend-02',
            name: 'Lower High Rejection (ETH)',
            description: 'Реальный рынок ETH/USDT, 4H. Формирование Lower High в нисходящем тренде.',
            difficulty: 'intermediate',
            symbol: 'ETHUSDT',
            interval: '4h',
            anchorDaysAgo: 75,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'short',
            tags: ['Trend', 'Lower High', 'ETH', 'rejection'],
            correctAnalysisHint: {
                pattern: 'Lower High in Downtrend',
                expectedBias: 'bearish',
                reasoning: 'В нисходящем тренде формируется Lower High — точка входа в шорт.',
                keyLevel: 'Lower High resistance zone'
            }
        },
        {
            id: 'sc-retest-01',
            name: 'Retest of Broken Resistance (BTC)',
            description: 'Реальный рынок BTC/USDT, 1D. Ретест пробитого сопротивления в роли поддержки.',
            difficulty: 'intermediate',
            symbol: 'BTCUSDT',
            interval: '1d',
            anchorDaysAgo: 100,
            visibleCount: 50,
            hiddenCount: 8,
            correctDecision: 'long',
            tags: ['Retest', 'Support', 'BTC', 'pullback'],
            correctAnalysisHint: {
                pattern: 'Retest of broken level',
                expectedBias: 'bullish',
                reasoning: 'Пробитое сопротивление теперь выступает поддержкой. На ретесте — идеальная точка входа.',
                keyLevel: 'Flipped support level'
            }
        },
        {
            id: 'sc-ma-01',
            name: 'MA 50 Bounce (SOL)',
            description: 'Реальный рынок SOL/USDT, 4H. Отскок от динамической поддержки MA 50.',
            difficulty: 'intermediate',
            symbol: 'SOLUSDT',
            interval: '4h',
            anchorDaysAgo: 42,
            visibleCount: 60,
            hiddenCount: 10,
            correctDecision: 'long',
            tags: ['MA 50', 'Bounce', 'SOL', 'pullback'],
            correctAnalysisHint: {
                pattern: 'Moving Average Bounce',
                expectedBias: 'bullish',
                reasoning: 'Цена откатила к MA 50 (динамическая поддержка) и отскочила вверх.',
                keyLevel: 'MA 50 dynamic support'
            }
        },
        {
            id: 'sc-trend-03',
            name: 'Trendline Bounce (BNB)',
            description: 'Реальный рынок BNB/USDT, 1H. Отскок от трендовой линии поддержки.',
            difficulty: 'intermediate',
            symbol: 'BNBUSDT',
            interval: '1h',
            anchorDaysAgo: 25,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'long',
            tags: ['Trendline', 'Bounce', 'BNB', 'pullback'],
            correctAnalysisHint: {
                pattern: 'Trendline Bounce',
                expectedBias: 'bullish',
                reasoning: 'Цена третий раз касается трендовой линии и отбивается — сильная динамическая поддержка.',
                keyLevel: 'Trendline support'
            }
        },
        {
            id: 'sc-pb-02',
            name: 'Pullback to Fibonacci 0.5 (ETH)',
            description: 'Реальный рынок ETH/USDT, 1D. Откат к уровню 50% Фибоначчи в восходящем тренде.',
            difficulty: 'advanced',
            symbol: 'ETHUSDT',
            interval: '1d',
            anchorDaysAgo: 120,
            visibleCount: 50,
            hiddenCount: 8,
            correctDecision: 'long',
            tags: ['Fibonacci', 'Pullback', 'ETH'],
            correctAnalysisHint: {
                pattern: 'Fibonacci 50% Retracement',
                expectedBias: 'bullish',
                reasoning: 'Цена откатила ровно к 50% по Фибоначчи — это сильная зона поддержки в рамках тренда.',
                keyLevel: 'Fib 0.5 level'
            }
        },
        {
            id: 'sc-trend-04',
            name: 'Pullback to EMA 20 (BTC)',
            description: 'Реальный рынок BTC/USDT, 15M. Краткосрочный откат к EMA 20.',
            difficulty: 'beginner',
            symbol: 'BTCUSDT',
            interval: '15m',
            anchorDaysAgo: 5,
            visibleCount: 100,
            hiddenCount: 16,
            correctDecision: 'long',
            tags: ['EMA 20', 'Pullback', 'BTC', 'scalping'],
            correctAnalysisHint: {
                pattern: 'EMA 20 Pullback',
                expectedBias: 'bullish',
                reasoning: 'В краткосрочном восходящем тренде цена откатила к EMA 20 — точка входа в лонг.',
                keyLevel: 'EMA 20 dynamic support'
            }
        },
        {
            id: 'sc-trend-05',
            name: 'Lower High in Downtrend (BTC)',
            description: 'Реальный рынок BTC/USDT, 4H. Lower High на трендовой линии сопротивления.',
            difficulty: 'intermediate',
            symbol: 'BTCUSDT',
            interval: '4h',
            anchorDaysAgo: 88,
            visibleCount: 60,
            hiddenCount: 10,
            correctDecision: 'short',
            tags: ['Trend', 'Lower High', 'BTC', 'rejection'],
            correctAnalysisHint: {
                pattern: 'Lower High Rejection',
                expectedBias: 'bearish',
                reasoning: 'В нисходящем тренде цена сформировала Lower High на трендовой линии — продолжение снижения.',
                keyLevel: 'Trendline resistance'
            }
        },

        {
            id: 'sc-div-rsi-01',
            name: 'Bullish RSI Divergence (BTC)',
            description: 'Реальный рынок BTC/USDT, 4H. Бычья дивергенция на RSI — разворот вверх.',
            difficulty: 'advanced',
            symbol: 'BTCUSDT',
            interval: '4h',
            anchorDaysAgo: 58,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'long',
            tags: ['RSI', 'Divergence', 'BTC', 'bullish'],
            correctAnalysisHint: {
                pattern: 'Bullish RSI Divergence',
                expectedBias: 'bullish',
                reasoning: 'Цена сделала новый минимум, а RSI — нет. Моментум ослабевает, готовится разворот вверх.',
                keyLevel: 'Previous support + RSI Higher Low'
            }
        },
        {
            id: 'sc-div-rsi-02',
            name: 'Bearish RSI Divergence (ETH)',
            description: 'Реальный рынок ETH/USDT, 4H. Медвежья дивергенция на RSI — разворот вниз.',
            difficulty: 'advanced',
            symbol: 'ETHUSDT',
            interval: '4h',
            anchorDaysAgo: 92,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'short',
            tags: ['RSI', 'Divergence', 'ETH', 'bearish'],
            correctAnalysisHint: {
                pattern: 'Bearish RSI Divergence',
                expectedBias: 'bearish',
                reasoning: 'Цена сделала новый максимум, а RSI — нет. Моментум ослабевает, готовится разворот вниз.',
                keyLevel: 'Previous resistance + RSI Lower High'
            }
        },
        {
            id: 'sc-div-macd-01',
            name: 'Bullish MACD Divergence (SOL)',
            description: 'Реальный рынок SOL/USDT, 1D. Бычья дивергенция на MACD на дневном графике.',
            difficulty: 'advanced',
            symbol: 'SOLUSDT',
            interval: '1d',
            anchorDaysAgo: 130,
            visibleCount: 50,
            hiddenCount: 8,
            correctDecision: 'long',
            tags: ['MACD', 'Divergence', 'SOL', 'bullish'],
            correctAnalysisHint: {
                pattern: 'Bullish MACD Divergence',
                expectedBias: 'bullish',
                reasoning: 'Цена сделала новый минимум, а гистограмма MACD — нет. Сильный разворотный сигнал.',
                keyLevel: 'Daily support + MACD divergence'
            }
        },
        {
            id: 'sc-div-hidden-01',
            name: 'Hidden Bullish Divergence (BTC)',
            description: 'Реальный рынок BTC/USDT, 1H. Скрытая бычья дивергенция — продолжение тренда.',
            difficulty: 'advanced',
            symbol: 'BTCUSDT',
            interval: '1h',
            anchorDaysAgo: 14,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'long',
            tags: ['Hidden Divergence', 'BTC', 'continuation'],
            correctAnalysisHint: {
                pattern: 'Hidden Bullish Divergence',
                expectedBias: 'bullish',
                reasoning: 'Цена сформировала Higher Low, а RSI — Lower Low. Восходящий тренд продолжится.',
                keyLevel: 'Higher Low with hidden divergence'
            }
        },
        {
            id: 'sc-div-hidden-02',
            name: 'Hidden Bearish Divergence (ETH)',
            description: 'Реальный рынок ETH/USDT, 1H. Скрытая медвежья дивергенция.',
            difficulty: 'advanced',
            symbol: 'ETHUSDT',
            interval: '1h',
            anchorDaysAgo: 33,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'short',
            tags: ['Hidden Divergence', 'ETH', 'continuation'],
            correctAnalysisHint: {
                pattern: 'Hidden Bearish Divergence',
                expectedBias: 'bearish',
                reasoning: 'Цена сформировала Lower High, а RSI — Higher High. Нисходящий тренд продолжится.',
                keyLevel: 'Lower High with hidden divergence'
            }
        },
        {
            id: 'sc-div-bnb-01',
            name: 'Bearish Divergence at Resistance (BNB)',
            description: 'Реальный рынок BNB/USDT, 4H. Медвежья дивергенция на уровне сопротивления.',
            difficulty: 'advanced',
            symbol: 'BNBUSDT',
            interval: '4h',
            anchorDaysAgo: 48,
            visibleCount: 70,
            hiddenCount: 12,
            correctDecision: 'short',
            tags: ['Divergence', 'Resistance', 'BNB', 'bearish'],
            correctAnalysisHint: {
                pattern: 'Bearish Divergence + Resistance',
                expectedBias: 'bearish',
                reasoning: 'На сопротивлении дивергенция — двойной сигнал разворота вниз.',
                keyLevel: 'Resistance + RSI Lower High'
            }
        },
        {
            id: 'sc-div-multi-01',
            name: 'Multi-Oscillator Divergence (BTC)',
            description: 'Реальный рынок BTC/USDT, 1D. Дивергенция одновременно на RSI и MACD.',
            difficulty: 'advanced',
            symbol: 'BTCUSDT',
            interval: '1d',
            anchorDaysAgo: 145,
            visibleCount: 50,
            hiddenCount: 8,
            correctDecision: 'long',
            tags: ['RSI', 'MACD', 'Multi-Indicator', 'BTC'],
            correctAnalysisHint: {
                pattern: 'Multi-Oscillator Bullish Divergence',
                expectedBias: 'bullish',
                reasoning: 'Дивергенция одновременно на RSI и MACD — очень сильный сигнал разворота.',
                keyLevel: 'Daily bottom with multi-confirmation'
            }
        },

        {
            id: 'sc-wait-01',
            name: 'Low Volatility Range (BTC)',
            description: 'Реальный рынок BTC/USDT, 1D. Низкая волатильность и узкий диапазон. Лучшее решение — ждать.',
            difficulty: 'beginner',
            symbol: 'BTCUSDT',
            interval: '1d',
            anchorDaysAgo: 90,
            visibleCount: 50,
            hiddenCount: 8,
            correctDecision: 'wait',
            tags: ['Range', 'Low Volatility', 'BTC', 'squeeze'],
            correctAnalysisHint: {
                pattern: 'Range / No clear setup',
                expectedBias: 'neutral',
                reasoning: 'Рынок находится в узком диапазоне с низкой волатильностью. Нет чётких сетапов для входа.',
                keyLevel: 'Range High / Range Low'
            }
        },
        {
            id: 'sc-vol-squeeze-01',
            name: 'Bollinger Squeeze (ETH)',
            description: 'Реальный рынок ETH/USDT, 1H. Сжатие Bollinger Bands — готовится импульс.',
            difficulty: 'intermediate',
            symbol: 'ETHUSDT',
            interval: '1h',
            anchorDaysAgo: 8,
            visibleCount: 100,
            hiddenCount: 16,
            correctDecision: 'wait',
            tags: ['Bollinger', 'Squeeze', 'ETH', 'volatility'],
            correctAnalysisHint: {
                pattern: 'Bollinger Squeeze',
                expectedBias: 'neutral',
                reasoning: 'Bollinger Bands сильно сжались — готовится импульс, но направление пока неясно. Лучше подождать пробоя.',
                keyLevel: 'Squeeze zone — ждём пробоя'
            }
        },
        {
            id: 'sc-vol-expansion-01',
            name: 'Volatility Expansion (BTC)',
            description: 'Реальный рынок BTC/USDT, 4H. Резкое расширение волатильности — продолжение импульса.',
            difficulty: 'intermediate',
            symbol: 'BTCUSDT',
            interval: '4h',
            anchorDaysAgo: 17,
            visibleCount: 60,
            hiddenCount: 10,
            correctDecision: 'long',
            tags: ['Expansion', 'Volatility', 'BTC', 'momentum'],
            correctAnalysisHint: {
                pattern: 'Volatility Expansion',
                expectedBias: 'bullish',
                reasoning: 'После сжатия — резкое расширение волатильности вверх. ATR растёт, моментум сильный.',
                keyLevel: 'Breakout level with volume'
            }
        },
        {
            id: 'sc-vol-range-01',
            name: 'Range Trading (SOL)',
            description: 'Реальный рынок SOL/USDT, 4H. Боковик с высокой волатильностью — диапазонная торговля.',
            difficulty: 'intermediate',
            symbol: 'SOLUSDT',
            interval: '4h',
            anchorDaysAgo: 63,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'wait',
            tags: ['Range', 'Volatility', 'SOL'],
            correctAnalysisHint: {
                pattern: 'High Volatility Range',
                expectedBias: 'neutral',
                reasoning: 'Высокая волатильность в диапазоне — нет направленного движения. Вне диапазона — ждать пробоя.',
                keyLevel: 'Range boundaries'
            }
        },
        {
            id: 'sc-vol-atr-01',
            name: 'ATR Stop Calculation (ETH)',
            description: 'Реальный рынок ETH/USDT, 1H. Расчёт стоп-лосса на основе ATR.',
            difficulty: 'intermediate',
            symbol: 'ETHUSDT',
            interval: '1h',
            anchorDaysAgo: 22,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'long',
            tags: ['ATR', 'ETH', 'volatility'],
            correctAnalysisHint: {
                pattern: 'ATR-based stop',
                expectedBias: 'bullish',
                reasoning: 'ATR даёт адекватный размер стопа для текущей волатильности. Используйте ATR × 1.5 для стопа.',
                keyLevel: 'Entry with ATR-based SL'
            }
        },
        {
            id: 'sc-vol-bb-01',
            name: 'Bollinger Band Bounce (BTC)',
            description: 'Реальный рынок BTC/USDT, 4H. Отскок от нижней полосы Bollinger Bands.',
            difficulty: 'intermediate',
            symbol: 'BTCUSDT',
            interval: '4h',
            anchorDaysAgo: 41,
            visibleCount: 60,
            hiddenCount: 10,
            correctDecision: 'long',
            tags: ['Bollinger', 'Bounce', 'BTC'],
            correctAnalysisHint: {
                pattern: 'Bollinger Bounce',
                expectedBias: 'bullish',
                reasoning: 'Цена коснулась нижней полосы BB и сформировала бычью свечу — отскок вверх.',
                keyLevel: 'Lower Bollinger Band'
            }
        },
        {
            id: 'sc-vol-bb-02',
            name: 'Bollinger Band Rejection (BNB)',
            description: 'Реальный рынок BNB/USDT, 4H. Отбой от верхней полосы Bollinger Bands.',
            difficulty: 'intermediate',
            symbol: 'BNBUSDT',
            interval: '4h',
            anchorDaysAgo: 52,
            visibleCount: 60,
            hiddenCount: 10,
            correctDecision: 'short',
            tags: ['Bollinger', 'Rejection', 'BNB'],
            correctAnalysisHint: {
                pattern: 'Bollinger Rejection',
                expectedBias: 'bearish',
                reasoning: 'Цена коснулась верхней полосы BB и получила медвежье отклонение.',
                keyLevel: 'Upper Bollinger Band'
            }
        },
        {
            id: 'sc-vol-climax-01',
            name: 'Volume Climax (SOL)',
            description: 'Реальный рынок SOL/USDT, 1H. Кульминация объёма — возможен разворот.',
            difficulty: 'advanced',
            symbol: 'SOLUSDT',
            interval: '1h',
            anchorDaysAgo: 11,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'wait',
            tags: ['Volume', 'Climax', 'SOL', 'volatility'],
            correctAnalysisHint: {
                pattern: 'Volume Climax',
                expectedBias: 'neutral',
                reasoning: 'Экстремальный объём часто знаменует кульминацию движения. Лучше подождать разворота.',
                keyLevel: 'Climactic volume bar'
            }
        },

        {
            id: 'sc-mtf-01',
            name: 'MTF Confluence (BTC)',
            description: 'Реальный рынок BTC/USDT, 4H. Уровень совпадает на 4H и D — высокая вероятность.',
            difficulty: 'advanced',
            symbol: 'BTCUSDT',
            interval: '4h',
            anchorDaysAgo: 47,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'long',
            tags: ['MTF', 'Confluence', 'BTC'],
            correctAnalysisHint: {
                pattern: 'Multi-Timeframe Confluence',
                expectedBias: 'bullish',
                reasoning: 'Уровень поддержки совпадает на 4H и D — это зона высокой вероятности. Вход на 4H после подтверждения на 1H.',
                keyLevel: 'Multi-TF support zone'
            }
        },
        {
            id: 'sc-mtf-02',
            name: 'Top-Down Analysis (ETH)',
            description: 'Реальный рынок ETH/USDT, 4H. Top-down анализ: D тренд вверх, H4 — коррекция, вход в H4.',
            difficulty: 'advanced',
            symbol: 'ETHUSDT',
            interval: '4h',
            anchorDaysAgo: 78,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'long',
            tags: ['MTF', 'Top-Down', 'ETH', 'pullback'],
            correctAnalysisHint: {
                pattern: 'Top-Down Analysis',
                expectedBias: 'bullish',
                reasoning: 'На D — восходящий тренд. На H4 — коррекция к поддержке. Идеальная точка входа в направлении D.',
                keyLevel: 'H4 support in uptrend'
            }
        },
        {
            id: 'sc-mtf-03',
            name: 'Counter-Trend Warning (BTC)',
            description: 'Реальный рынок BTC/USDT, 1H. Сетап на 1H против тренда D — пропустить сделку.',
            difficulty: 'advanced',
            symbol: 'BTCUSDT',
            interval: '1h',
            anchorDaysAgo: 36,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'no_trade',
            tags: ['MTF', 'Counter-Trend', 'BTC'],
            correctAnalysisHint: {
                pattern: 'Counter-Trend Setup',
                expectedBias: 'neutral',
                reasoning: 'На 1H медвежий сетап, но D — бычий. Торговать против D нельзя. Правильное решение — не входить.',
                keyLevel: 'No valid setup with D trend'
            }
        },
        {
            id: 'sc-mtf-04',
            name: 'Aligned Timeframes (SOL)',
            description: 'Реальный рынок SOL/USDT, 1H. Все таймфреймы в одном направлении — сильный вход.',
            difficulty: 'advanced',
            symbol: 'SOLUSDT',
            interval: '1h',
            anchorDaysAgo: 24,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'long',
            tags: ['MTF', 'Aligned', 'SOL'],
            correctAnalysisHint: {
                pattern: 'Fully Aligned Timeframes',
                expectedBias: 'bullish',
                reasoning: 'D, H4 и H1 все в восходящем тренде + сетап на H1. Максимальная согласованность — входим.',
                keyLevel: 'Multi-TF aligned support'
            }
        },
        {
            id: 'sc-mtf-05',
            name: 'Higher TF Resistance (ETH)',
            description: 'Реальный рынок ETH/USDT, 4H. Подход к сопротивлению старшего ТФ.',
            difficulty: 'advanced',
            symbol: 'ETHUSDT',
            interval: '4h',
            anchorDaysAgo: 105,
            visibleCount: 70,
            hiddenCount: 12,
            correctDecision: 'short',
            tags: ['MTF', 'Resistance', 'ETH'],
            correctAnalysisHint: {
                pattern: 'Higher TF Resistance Rejection',
                expectedBias: 'bearish',
                reasoning: 'Цена подходит к дневному сопротивлению, на H4 формируется медвежий сетап.',
                keyLevel: 'Daily resistance zone'
            }
        },
        {
            id: 'sc-mtf-06',
            name: 'Confluence Zone (BNB)',
            description: 'Реальный рынок BNB/USDT, 1H. Зона конфлюэнции: уровень + MA 200 + трендовая.',
            difficulty: 'advanced',
            symbol: 'BNBUSDT',
            interval: '1h',
            anchorDaysAgo: 16,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'long',
            tags: ['MTF', 'Confluence', 'BNB', 'MA 200'],
            correctAnalysisHint: {
                pattern: 'Triple Confluence Zone',
                expectedBias: 'bullish',
                reasoning: 'Уровень поддержки + MA 200 + трендовая линия в одной зоне — сильная конфлюэнция.',
                keyLevel: 'Triple confluence support'
            }
        },
        {
            id: 'sc-mtf-07',
            name: 'Mixed Signals (BTC)',
            description: 'Реальный рынок BTC/USDT, 1H. Противоречивые сигналы между таймфреймами.',
            difficulty: 'advanced',
            symbol: 'BTCUSDT',
            interval: '1h',
            anchorDaysAgo: 68,
            visibleCount: 80,
            hiddenCount: 12,
            correctDecision: 'no_trade',
            tags: ['MTF', 'Mixed', 'BTC', 'no-trade'],
            correctAnalysisHint: {
                pattern: 'Mixed MTF Signals',
                expectedBias: 'neutral',
                reasoning: 'D бычий, H4 медвежий, H1 смешанный. Без согласия таймфреймов лучше не входить.',
                keyLevel: 'No clear multi-TF setup'
            }
        },
        {
            id: 'sc-mtf-08',
            name: 'Daily Level Hold (SOL)',
            description: 'Реальный рынок SOL/USDT, 4H. Дневной уровень удерживает коррекцию.',
            difficulty: 'advanced',
            symbol: 'SOLUSDT',
            interval: '4h',
            anchorDaysAgo: 53,
            visibleCount: 70,
            hiddenCount: 12,
            correctDecision: 'long',
            tags: ['MTF', 'Daily Level', 'SOL'],
            correctAnalysisHint: {
                pattern: 'Daily Level Hold',
                expectedBias: 'bullish',
                reasoning: 'Коррекция на H4 остановилась на дневной поддержке — продолжение восходящего тренда.',
                keyLevel: 'Daily support hold'
            }
        }
    ];

    // ================================================================
    // ХЕЛПЕРЫ
    // ================================================================

    /**
     * Преобразовать сценарий в "resolved" сценарий с реальными свечами.
     * @param {object} scenario
     * @returns {Promise<object>} — сценарий с заполненными candles / futureCandles
     */
    async function resolveScenario(scenario) {
        if (!scenario) return null;
        if (!global.RealMarketData) {
            throw new Error('[TrainerScenarios] RealMarketData не загружен');
        }
        const anchorTime = global.RealMarketData.getRecentAnchorTime(scenario.anchorDaysAgo);
        const data = await global.RealMarketData.loadScenarioCandles({
            symbol: scenario.symbol,
            interval: scenario.interval,
            anchorTime: anchorTime,
            visibleCount: scenario.visibleCount,
            hiddenCount: scenario.hiddenCount
        });

        return Object.assign({}, scenario, {
            candles: data.visible,
            futureCandles: data.hidden,
            anchorTime: anchorTime,
            visibleEndTime: data.visibleEndTime
        });
    }

    /**
     * Синхронная версия resolveScenario (если данные уже загружены вызывающим кодом)
     */
    function attachCandles(scenario, candles, futureCandles, anchorTime) {
        return Object.assign({}, scenario, {
            candles: candles || [],
            futureCandles: futureCandles || [],
            anchorTime: anchorTime || (candles && candles.length ? candles[candles.length - 1].time : null)
        });
    }

    // ================================================================
    // ЭКСПОРТ
    // ================================================================

    const api = {
        SCENARIOS: SCENARIOS,
        getCount: () => SCENARIOS.length,
        getByIndex: (i) => SCENARIOS[i % SCENARIOS.length],
        getById: (id) => SCENARIOS.find(s => s.id === id),
        resolveScenario: resolveScenario,
        attachCandles: attachCandles
    };

    global.TrainerScenarios = api;

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this)));
