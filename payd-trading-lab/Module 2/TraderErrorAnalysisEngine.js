/**
 * TraderErrorAnalysisEngine — Module 3 (Error Analysis & Trading Psychology).
 *
 * Назначение:
 *   Разбирает ошибки трейдера после принятия решения. Объясняет психологию
 *   решения и показывает, какие сигналы Module X были проигнорированы.
 *
 *   НЕ анализирует график самостоятельно — использует ТОЛЬКО результат
 *   Module X (CoreAnalysisEngine).
 *
 * Вход: {
 *   marketAnalysis: <результат Module 1>,        // включает moduleXOutput
 *   userDecision: <id решения из каталога>,      // 'long' | 'wait' | 'aggressive-long' | и т.д.
 *   userEvidence: [<id подтверждений>],           // что отметил пользователь
 *   verdict: <вердикт Module 2>                  // для контекста ошибки
 * }
 *
 * Выход: {
 *   errorType: '...'                  // тип ошибки (premature_entry, ignored_signal, и т.д.)
 *   severity: 'critical'|'moderate'|'minor'|'none'
 *   psychology: { ... }               // психологический профиль решения
 *   missedSignals: [...]              // какие сигналы Module X были проигнорированы
 *   whatToDoNext: [...]               // конкретные рекомендации
 *   educationalNotes: [...]           // объяснения для обучения
 *   meta: { ... }
 * }
 *
 * Зависимости:
 *   - CoreAnalysisEngine (Module X) — данные о рынке
 *   - DecisionOptionsCatalog (опционально) — для справки по решениям
 */
(function (global) {
    'use strict';

    // ================================================================
    // Классификации ошибок
    // ================================================================

    const ERROR_TYPES = {
        PREMATURE_ENTRY:     'premature_entry',      // вход до подтверждения
        WRONG_DIRECTION:     'wrong_direction',      // против тренда
        IGNORED_STRUCTURE:   'ignored_structure',    // игнорирование структуры
        IGNORED_VOLUME:      'ignored_volume',       // вход на низком объёме
        IGNORED_MOMENTUM:    'ignored_momentum',     // вход против моментума
        OVERSIZE_POSITION:  'oversize_position',    // слишком большой риск
        FOMO_ENTRY:          'fomo_entry',           // вход из страха упустить
        REVENGE_TRADE:       'revenge_trade',        // попытка отыграться
        IMPULSIVE_EXIT:      'impulsive_exit',       // импульсивный выход (wait → enter)
        NO_CONFIRMATION:     'no_confirmation',      // вход без подтверждения
        PERFECT_DECISION:    'perfect_decision',     // ошибки нет
        NO_TRADE_CORRECT:    'no_trade_correct'      // правильное "no trade"
    };

    const PSYCHOLOGY_PATTERNS = {
        FOMO: {
            name: 'FOMO (Fear Of Missing Out)',
            description: 'Страх упустить движение. Трейдер входит до подтверждения, потому что «уже упустил момент».',
            symptoms: ['Вход против текущего моментума', 'Игнорирование объёма', 'Преждевременный вход в надежде на быстрый профит']
        },
        REVENGE: {
            name: 'Revenge Trading',
            description: 'Попытка отыграть предыдущую потерю. Принятие импульсивных решений.',
            symptoms: ['Увеличение размера позиции', 'Вход без сетапа', 'Повторные ошибки одного типа']
        },
        ANALYSIS_PARALYSIS: {
            name: 'Analysis Paralysis',
            description: 'Избыточный анализ, который мешает принять решение. Трейдер видит сетап, но не входит.',
            symptoms: ['Ожидание идеального момента', 'Слишком много подтверждений в чек-листе', 'Пропуск прибыльных сетапов']
        },
        OVERCONFIDENCE: {
            name: 'Overconfidence',
            description: 'Излишняя самоуверенность после серии прибыльных сделок. Игнорирование рисков.',
            symptoms: ['Вход без подтверждения', 'Увеличение размера позиции', 'Игнорирование структуры']
        },
        HERD_MENTALITY: {
            name: 'Herd Mentality',
            description: 'Следование за толпой. Вход только потому, что «все входят».',
            symptoms: ['Вход на пике объёма', 'Игнорирование собственного анализа', 'Следование за движением без сетапа']
        },
        LOSS_AVERSION: {
            name: 'Loss Aversion',
            description: 'Страх потери больше, чем желание прибыли. Трейдер закрывает прибыль слишком рано или держит убыточную позицию.',
            symptoms: ['Ранний выход из прибыльной сделки', 'Удержание убыточной позиции', 'Избегание риска при ясном сетапе']
        },
        PATIENCE: {
            name: 'Patience',
            description: 'Осознанное ожидание. Решение «wait» или «no trade» принято на основе ясного анализа.',
            symptoms: ['Сохранение капитала', 'Ожидание подтверждения', 'Дисциплинированный подход']
        }
    };

    // ================================================================
    // Анализ ошибок
    // ================================================================

    /**
     * Определяет, какие сигналы Module X были проигнорированы пользователем.
     */
    function findMissedSignals(x, userDecision, userEvidence) {
        const missed = [];
        const candles = x.inputMeta ? null : null; // нет прямого доступа к candles в moduleXOutput
        const xVolume = x.volume;
        const xStructure = x.structure;
        const xMomentum = x.momentum;
        const xTrend = x.trend;
        const xVolatility = x.volatility;
        const xSMC = x.smc;
        const xProbability = x.probability;

        // 1. Игнорирование тренда
        if (userDecision === 'short' && xTrend.type.includes('bull')) {
            missed.push({
                signal: 'trend',
                title: 'Вход против тренда',
                description: 'Тренд бычий, но выбран Short. Это контртрендовая сделка с повышенным риском.',
                severity: 'high',
                moduleXSource: 'trend.type = ' + xTrend.type
            });
        }
        if (userDecision === 'long' && xTrend.type.includes('bear')) {
            missed.push({
                signal: 'trend',
                title: 'Вход против тренда',
                description: 'Тренд медвежий, но выбран Long. Контртрендовая сделка требует узкого стопа.',
                severity: 'high',
                moduleXSource: 'trend.type = ' + xTrend.type
            });
        }

        // 2. Игнорирование объёма
        if (xVolume.ratio < 0.7 && userDecision !== 'wait' && userDecision !== 'no-trade') {
            missed.push({
                signal: 'volume',
                title: 'Низкий объём',
                description: 'Объём составляет ' + xVolume.ratio + '× от среднего. Движение может быть неподтверждённым.',
                severity: 'medium',
                moduleXSource: 'volume.ratio = ' + xVolume.ratio
            });
        }
        if (xVolume.divergence.bullish && userDecision === 'short') {
            missed.push({
                signal: 'volume_divergence',
                title: 'Бычья дивергенция по объёму',
                description: 'Цена падает, но объём растёт — крупные игроки могут накапливать.',
                severity: 'medium',
                moduleXSource: 'volume.divergence.bullish = true'
            });
        }
        if (xVolume.divergence.bearish && userDecision === 'long') {
            missed.push({
                signal: 'volume_divergence',
                title: 'Медвежья дивергенция по объёму',
                description: 'Цена растёт, но объём падает — рост может быть исчерпывающим.',
                severity: 'medium',
                moduleXSource: 'volume.divergence.bearish = true'
            });
        }

        // 3. Игнорирование моментума
        if (xMomentum.rsi > 75 && userDecision === 'long') {
            missed.push({
                signal: 'momentum',
                title: 'Перекупленность',
                description: 'RSI = ' + xMomentum.rsi + '. Вход в лонг в зоне перекупленности рискован.',
                severity: 'high',
                moduleXSource: 'momentum.rsi = ' + xMomentum.rsi
            });
        }
        if (xMomentum.rsi < 25 && userDecision === 'short') {
            missed.push({
                signal: 'momentum',
                title: 'Перепроданность',
                description: 'RSI = ' + xMomentum.rsi + '. Вход в шорт в зоне перепроданности рискован.',
                severity: 'high',
                moduleXSource: 'momentum.rsi = ' + xMomentum.rsi
            });
        }
        if (xMomentum.exhaustion.detected && userDecision !== 'wait' && userDecision !== 'no-trade') {
            missed.push({
                signal: 'momentum_exhaustion',
                title: 'Истощение моментума',
                description: 'Обнаружено истощение моментума (' + xMomentum.exhaustion.side + '). Возможен разворот.',
                severity: 'high',
                moduleXSource: 'momentum.exhaustion.side = ' + xMomentum.exhaustion.side
            });
        }

        // 4. Игнорирование структуры
        if (xStructure.structureShift && xStructure.structureShift.type && userDecision !== 'wait' && userDecision !== 'no-trade') {
            const shiftType = xStructure.structureShift.type;
            const userDir = (userDecision.includes('long') || userDecision === 'long') ? 'long' : 'short';
            const shiftDir = shiftType === 'CHoCH' ? 'neutral' : (shiftType === 'BOS' ? 'unknown' : 'unknown');
            if ((userDir === 'long' && xTrend.type.includes('bear')) ||
                (userDir === 'short' && xTrend.type.includes('bull'))) {
                missed.push({
                    signal: 'structure_shift',
                    title: 'Игнорирование смены структуры',
                    description: 'Обнаружен ' + shiftType + ' — структура изменилась. Решение должно учитывать это.',
                    severity: 'high',
                    moduleXSource: 'structure.structureShift.type = ' + shiftType
                });
            }
        }

        // 5. Игнорирование уровня
        // (нет прямого доступа к level в moduleXOutput, но мы можем проверить позицию)

        // 6. Игнорирование SMC
        if (xSMC.liquiditySweeps.length > 0 && userDecision !== 'wait' && userDecision !== 'no-trade') {
            const lastSweep = xSMC.liquiditySweeps[xSMC.liquiditySweeps.length - 1];
            missed.push({
                signal: 'liquidity_sweep',
                title: 'Liquidity Sweep',
                description: 'Произошёл ' + lastSweep.side + ' sweep ликвидности. Возможен разворот после снятия стопов.',
                severity: 'medium',
                moduleXSource: 'smc.liquiditySweeps'
            });
        }

        // 7. Игнорирование evidence (что не отметил пользователь)
        const evidenceMissed = [];
        if (!userEvidence.includes('breakout') && !userEvidence.includes('retest')) {
            evidenceMissed.push('Не отмечен ни пробой, ни ретест — нет чёткого сигнала входа');
        }
        if (!userEvidence.includes('high-volume') && xVolume.ratio > 1.2) {
            evidenceMissed.push('Высокий объём не отмечен, хотя он есть на графике');
        }
        if (!userEvidence.includes('impulse') && (userDecision === 'long' || userDecision === 'short')) {
            evidenceMissed.push('Нет подтверждения импульса для направленного входа');
        }

        return { missed: missed, evidenceMissed: evidenceMissed };
    }

    /**
     * Классифицирует ошибку и определяет её серьёзность.
     */
    function classifyError(missed, userDecision, verdict, x) {
        if (userDecision === 'no-trade' || userDecision === 'wait') {
            return {
                type: ERROR_TYPES.NO_TRADE_CORRECT,
                severity: 'none',
                summary: 'Осознанное решение не торговать — признак дисциплины.'
            };
        }

        if (verdict && verdict.verdict === 'correct' && missed.missed.length === 0) {
            return {
                type: ERROR_TYPES.PERFECT_DECISION,
                severity: 'none',
                summary: 'Идеальное решение — учтены все ключевые сигналы Module X.'
            };
        }

        // Определяем основной тип ошибки
        let primaryType = null;
        let maxSeverity = 'none';

        if (missed.missed.length === 0) {
            return {
                type: 'good_decision',
                severity: 'none',
                summary: 'Решение принято с учётом ключевых сигналов Module X.'
            };
        }

        // Ищем самую серьёзную пропущенную сигналу
        const severities = missed.missed.map(m => m.severity);
        if (severities.includes('high')) maxSeverity = 'high';
        else if (severities.includes('medium')) maxSeverity = 'medium';
        else maxSeverity = 'low';

        if (missed.missed.some(m => m.signal === 'trend' || m.signal === 'structure_shift')) {
            primaryType = ERROR_TYPES.WRONG_DIRECTION;
        } else if (missed.missed.some(m => m.signal === 'momentum' || m.signal === 'momentum_exhaustion')) {
            primaryType = ERROR_TYPES.IGNORED_MOMENTUM;
        } else if (missed.missed.some(m => m.signal === 'volume' || m.signal === 'volume_divergence')) {
            primaryType = ERROR_TYPES.IGNORED_VOLUME;
        } else if (missed.missed.some(m => m.signal === 'liquidity_sweep')) {
            primaryType = ERROR_TYPES.IGNORED_STRUCTURE;
        } else {
            primaryType = ERROR_TYPES.PREMATURE_ENTRY;
        }

        return {
            type: primaryType,
            severity: maxSeverity,
            summary: generateErrorSummary(primaryType, missed.missed.length)
        };
    }

    function generateErrorSummary(type, missedCount) {
        const summaries = {
            'wrong_direction':      'Вход против тренда — ' + missedCount + ' критических сигналов Module X проигнорировано.',
            'ignored_momentum':     'Игнорирование моментума — ' + missedCount + ' сигнал(ов) указывали на истощение/перекупленность.',
            'ignored_volume':       'Игнорирование объёма — ' + missedCount + ' сигнал(ов) по объёму не учтены.',
            'ignored_structure':    'Игнорирование структуры — ' + missedCount + ' сигнал(ов) SMC/структуры проигнорировано.',
            'premature_entry':      'Преждевременный вход — ' + missedCount + ' условий для подтверждения не выполнено.',
            'oversize_position':    'Размер позиции не соответствует риску.',
            'fomo_entry':           'Вход из страха упустить движение.',
            'revenge_trade':        'Вход в состоянии revenge trading.'
        };
        return summaries[type] || 'Решение требует анализа ошибок.';
    }

    /**
     * Определяет психологический профиль решения.
     */
    function detectPsychologyPattern(userDecision, missed, verdict, x) {
        // FOMO: вход при перекупленности/перепроданности
        if (missed.missed.some(m => m.signal === 'momentum' || m.signal === 'momentum_exhaustion')) {
            return PSYCHOLOGY_PATTERNS.FOMO;
        }

        // Herd mentality: вход на пике объёма без структуры
        if (x.volume.spike.detected && missed.missed.some(m => m.signal === 'volume')) {
            return PSYCHOLOGY_PATTERNS.HERD_MENTALITY;
        }

        // Overconfidence: вход против тренда
        if (missed.missed.some(m => m.signal === 'trend')) {
            return PSYCHOLOGY_PATTERNS.OVERCONFIDENCE;
        }

        // Wait / no-trade — паттерн терпения
        if (userDecision === 'wait' || userDecision === 'no-trade') {
            return PSYCHOLOGY_PATTERNS.PATIENCE;
        }

        // Анализ paralysis: вход без evidence
        if (missed.evidenceMissed.length > 2) {
            return PSYCHOLOGY_PATTERNS.ANALYSIS_PARALYSIS;
        }

        return null;
    }

    /**
     * Генерирует конкретные рекомендации «что делать дальше».
     */
    function generateRecommendations(errorType, missed, x, userDecision) {
        const recs = [];

        if (errorType === ERROR_TYPES.WRONG_DIRECTION) {
            recs.push('Дождитесь подтверждения смены тренда: новый HH в восходящем или LL в нисходящем.');
            recs.push('Используйте контртрендовые сетапы только с узким стопом (1× ATR) и R:R минимум 1:2.');
            recs.push('Проверьте моментум: при трендовом входе моментум должен поддерживать направление.');
        } else if (errorType === ERROR_TYPES.IGNORED_MOMENTUM) {
            recs.push('Проверьте RSI перед входом: значения выше 70 или ниже 30 — зоны риска.');
            recs.push('Ищите дивергенции: расхождение цены и моментума — ранний сигнал разворота.');
            recs.push('Используйте ожидание: при истощении моментума лучше пропустить вход.');
        } else if (errorType === ERROR_TYPES.IGNORED_VOLUME) {
            recs.push('Сравните текущий объём со средним: ratio > 1.2 подтверждает движение, < 0.8 — слабость.');
            recs.push('Ищите дивергенции объёма: цена вверх, объём вниз — откат вероятен.');
            recs.push('При низком объёме лучше уменьшить размер позиции или подождать подтверждения.');
        } else if (errorType === ERROR_TYPES.PREMATURE_ENTRY) {
            recs.push('Дождитесь минимум двух подтверждений: пробой + объём, или ретест + удержание.');
            recs.push('Используйте чек-лист: каждый вход должен соответствовать минимум 3 критериям из 5.');
            recs.push('Не входите в первые 1–2 свечи после события — дождитесь реакции.');
        } else if (errorType === ERROR_TYPES.IGNORED_STRUCTURE) {
            recs.push('Проверьте SMC: BOS / CHoCH / order blocks дают точные уровни входа.');
            recs.push('Liquidity Sweep — не входите сразу после снятия ликвидности, ждите реакции.');
            recs.push('Order Block — лучшая зона входа после импульса с откатом к противоположной свече.');
        } else if (errorType === ERROR_TYPES.NO_TRADE_CORRECT) {
            recs.push('Дисциплина — это главный актив трейдера. No Trade при отсутствии сетапа = сохранение капитала.');
            recs.push('Следующий сетап будет. Капитал сохранён для лучшей возможности.');
        } else if (errorType === ERROR_TYPES.PERFECT_DECISION) {
            recs.push('Отличное решение. Все ключевые сигналы учтены.');
            recs.push('Закрепите паттерн: запишите, какие именно сигналы привели к этому решению.');
        }

        // Дополнительные рекомендации на основе SMC
        if (x.smc.orderBlocks.length > 0 && userDecision !== 'wait') {
            const lastOB = x.smc.orderBlocks[x.smc.orderBlocks.length - 1];
            recs.push('Найден ' + lastOB.type + ' order block — это зона интереса для входа после ретеста.');
        }

        if (x.smc.fairValueGaps.length > 0 && userDecision !== 'wait') {
            recs.push('Обнаружены FVG зоны — вход на ретесте FVG часто даёт лучший R:R.');
        }

        return recs;
    }

    /**
     * Создаёт образовательные заметки для долгосрочного обучения.
     */
    function generateEducationalNotes(errorType, missed, x, psychology) {
        const notes = [];

        notes.push({
            topic: 'Использование Module X',
            content: 'Module X анализирует график один раз и передаёт структурированные данные всем модулям. Module 3 (этот разбор) использует только эти данные — никакой параллельный анализ.'
        });

        if (missed.missed.length > 0) {
            notes.push({
                topic: 'Игнорированные сигналы',
                content: missed.missed.map(m => '• ' + m.title + ': ' + m.description).join('\n')
            });
        }

        if (psychology) {
            notes.push({
                topic: 'Психология решения',
                content: 'Паттерн: ' + psychology.name + '.\n' + psychology.description + '\n\nСимптомы: ' + psychology.symptoms.join(', ')
            });
        }

        notes.push({
            topic: 'Что показывает Module X',
            content: 'Market Structure: ' + x.structure.type + ' (' +
                     'HH:' + x.structure.hh + ', HL:' + x.structure.hl +
                     ', LH:' + x.structure.lh + ', LL:' + x.structure.ll + ')\n' +
                     'Trend: ' + x.trend.type + ' (сила ' + x.trend.strength + '%)\n' +
                     'Momentum: RSI=' + x.momentum.rsi + ' (' + x.momentum.description + ')\n' +
                     'Volume: ratio=' + x.volume.ratio + ' (' + x.volume.description + ')\n' +
                     'Volatility: ' + x.volatility.level + ' (ATR%=' + x.volatility.atrPercent + ')\n' +
                     'Probability: bullish=' + x.probability.bullish + '%, bearish=' + x.probability.bearish + '%, confidence=' + x.probability.confidence + '%'
        });

        if (x.smc.bos.length > 0 || x.smc.choch.length > 0) {
            const events = [];
            if (x.smc.bos.length > 0) events.push(x.smc.bos.length + ' BOS');
            if (x.smc.choch.length > 0) events.push(x.smc.choch.length + ' CHoCH');
            if (x.smc.liquiditySweeps.length > 0) events.push(x.smc.liquiditySweeps.length + ' Liquidity Sweep');
            if (x.smc.orderBlocks.length > 0) events.push(x.smc.orderBlocks.length + ' Order Block');
            if (x.smc.fairValueGaps.length > 0) events.push(x.smc.fairValueGaps.length + ' FVG');
            notes.push({
                topic: 'SMC-события Module X',
                content: 'Обнаружено: ' + events.join(', ') + '. Эти элементы дают точные уровни входа и стопа.'
            });
        }

        return notes;
    }

    // ================================================================
    // Главная функция analyze
    // ================================================================

    function analyze(input) {
        const marketAnalysis = input && input.marketAnalysis;
        const userDecision = input && input.userDecision;
        const userEvidence = (input && input.userEvidence) || [];
        const verdict = input && input.verdict;

        if (!marketAnalysis) {
            return { error: 'marketAnalysis required' };
        }

        // Получаем Module X output
        const x = marketAnalysis.moduleXOutput || marketAnalysis.extended;
        if (!x || !x.structure) {
            return { error: 'Module X output not available in marketAnalysis' };
        }

        // 1. Ищем проигнорированные сигналы
        const missed = findMissedSignals(x, userDecision, userEvidence);

        // 2. Классифицируем ошибку
        const error = classifyError(missed, userDecision, verdict, x);

        // 3. Определяем психологический паттерн
        const psychology = detectPsychologyPattern(userDecision, missed, verdict, x);

        // 4. Генерируем рекомендации
        const recommendations = generateRecommendations(error.type, missed, x, userDecision);

        // 5. Образовательные заметки
        const educationalNotes = generateEducationalNotes(error.type, missed, x, psychology);

        return {
            // Идентификация ошибки
            errorType: error.type,
            severity: error.severity,
            summary: error.summary,

            // Проигнорированные сигналы
            missedSignals: missed.missed,
            evidenceMissed: missed.evidenceMissed,

            // Психология
            psychology: psychology ? {
                name: psychology.name,
                description: psychology.description,
                symptoms: psychology.symptoms,
                recognized: true
            } : {
                name: 'Unknown',
                description: 'Не удалось определить психологический паттерн.',
                symptoms: [],
                recognized: false
            },

            // Что делать
            whatToDoNext: recommendations,

            // Образовательные заметки
            educationalNotes: educationalNotes,

            // Метаданные
            meta: {
                analyzedAt: new Date().toISOString(),
                poweredBy: 'Module X + Module 3 (TraderErrorAnalysisEngine)',
                userDecision: userDecision,
                missedCount: missed.missed.length,
                evidenceMissedCount: missed.evidenceMissed.length
            }
        };
    }

    // ================================================================
    // Экспорт
    // ================================================================

    global.TraderErrorAnalysisEngine = {
        analyze: analyze,
        ERROR_TYPES: ERROR_TYPES,
        PSYCHOLOGY_PATTERNS: PSYCHOLOGY_PATTERNS
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.TraderErrorAnalysisEngine;
    }

})(typeof window !== 'undefined' ? window : globalThis);
