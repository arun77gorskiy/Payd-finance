/**
 * DecisionOptionsCatalog — каталог вариантов торговых решений
 * и динамический выбор подходящих вариантов для текущего рыночного контекста.
 *
 * Назначение:
 *   Хранит полный набор возможных торговых решений с их характеристиками:
 *     - направление (long / short / neutral)
 *     - категория (directional / neutral / conditional / risk-managed / counter-trend)
 *     - уровень риска (low / medium / high)
 *     - способ входа (immediate / on-pullback / on-breakout / gradual / conditional)
 *     - требуемые подтверждения (requiredEvidence)
 *     - ожидаемое R:R
 *     - базовая вероятность успеха
 *
 *   Метод selectOptions(context, signals) возвращает 5–7 вариантов,
 *   подходящих для конкретной рыночной ситуации, определённой
 *   MarketAnalysisEngine.
 *
 *   Логика выбора НЕ показывает все варианты сразу — каждый вариант
 *   имеет правила применимости, и пользователь видит только те,
 *   которые осмысленны в текущем контексте.
 *
 * Используется:
 *   - EntryConfirmationTrainer (Module 2) — для рендера панели решений
 *   - DecisionEvaluationEngine — для скоринга выбранного решения
 */
(function (global) {
    'use strict';

    // ================================================================
    // Каталог всех возможных решений
    // ================================================================
    //
    // Характеристики каждого решения:
    //   id              — уникальный идентификатор
    //   label           — полное название для UI
    //   shortLabel      — короткое название для кнопки
    //   direction       — 'long' | 'short' | 'neutral'
    //   category        — 'directional' | 'neutral' | 'conditional' | 'risk-managed' | 'counter-trend'
    //   riskLevel       — 'low' | 'medium' | 'high'
    //   entryStyle      — 'immediate' | 'on-pullback' | 'on-breakout' | 'gradual' | 'conditional'
    //   requiredEvidence — массив ID подтверждений, при которых решение осмысленно
    //   recommendedEvidence — какие подтверждения должны быть отмечены для оптимального входа
    //   rrExpectation   — ожидаемое соотношение риск/прибыль (например '1:2')
    //   baseWinRate     — базовая вероятность успеха (0..1), корректируется контекстом
    //   icon            — иконка для UI
    //   color           — цветовая группа для UI ('green' | 'red' | 'yellow' | 'blue' | 'gray' | 'orange' | 'purple')
    //   description     — краткое описание логики решения
    //   logic           — детальное объяснение рисков и логики
    //   applicable      — функция (context, signals) -> boolean
    //                     если возвращает true — решение имеет смысл показывать
    //   priority        — базовый приоритет в выдаче (выше = выше в списке)
    //
    const DECISION_CATALOG = [
        // -------------------------------------------------------
        // БАЗОВЫЕ РЕШЕНИЯ (направленные)
        // -------------------------------------------------------
        {
            id: 'long',
            label: 'Long (стандартный вход)',
            shortLabel: 'LONG',
            direction: 'long',
            category: 'directional',
            riskLevel: 'medium',
            entryStyle: 'immediate',
            requiredEvidence: ['breakout'],
            recommendedEvidence: ['breakout', 'high-volume', 'close-above'],
            rrExpectation: '1:2',
            baseWinRate: 0.45,
            icon: '▲',
            color: 'green',
            description: 'Стандартный вход в лонг при подтверждённом пробое.',
            logic: 'Базовый вход по направлению тренда. Требует подтверждения пробоя. Средний риск, классический R:R 1:2.',
            applicable: (ctx, signals) =>
                ctx === 'uptrend' || ctx === 'testing_resistance' ||
                signals.includes('uptrend_structure') ||
                signals.includes('strong_bullish_momentum'),
            priority: 70
        },
        {
            id: 'short',
            label: 'Short (стандартный вход)',
            shortLabel: 'SHORT',
            direction: 'short',
            category: 'directional',
            riskLevel: 'medium',
            entryStyle: 'immediate',
            requiredEvidence: ['breakout'],
            recommendedEvidence: ['breakout', 'high-volume', 'close-above'],
            rrExpectation: '1:2',
            baseWinRate: 0.45,
            icon: '▼',
            color: 'red',
            description: 'Стандартный вход в шорт при подтверждённом пробое вниз.',
            logic: 'Базовый вход против движения. Требует подтверждения пробоя поддержки. Средний риск.',
            applicable: (ctx, signals) =>
                ctx === 'downtrend' || ctx === 'testing_support' ||
                signals.includes('downtrend_structure') ||
                signals.includes('strong_bearish_momentum'),
            priority: 70
        },

        // -------------------------------------------------------
        // УСЛОВНЫЕ ВХОДЫ
        // -------------------------------------------------------
        {
            id: 'breakout-entry',
            label: 'Breakout Entry',
            shortLabel: 'BREAKOUT',
            direction: 'long',
            category: 'conditional',
            riskLevel: 'medium',
            entryStyle: 'on-breakout',
            requiredEvidence: ['breakout', 'close-above', 'high-volume'],
            recommendedEvidence: ['breakout', 'close-above', 'high-volume', 'retest'],
            rrExpectation: '1:2.5',
            baseWinRate: 0.40,
            icon: '⤴',
            color: 'blue',
            description: 'Вход сразу после подтверждённого пробоя уровня.',
            logic: 'Более агрессивный вариант обычного LONG: вход БЕЗ ожидания ретеста, на импульсе пробоя. Повышенный риск (часть пробоев ложная), но лучшая точка входа при истинном пробое.',
            applicable: (ctx, signals) =>
                ctx === 'testing_resistance' ||
                (ctx === 'uptrend' && (signals.includes('potential_breakout') || signals.includes('at_key_level'))),
            priority: 85
        },
        {
            id: 'pullback-entry',
            label: 'Pullback Entry',
            shortLabel: 'PULLBACK',
            direction: 'long',
            category: 'conditional',
            riskLevel: 'low',
            entryStyle: 'on-pullback',
            requiredEvidence: ['retest', 'hold'],
            recommendedEvidence: ['retest', 'hold', 'high-volume'],
            rrExpectation: '1:2.5',
            baseWinRate: 0.55,
            icon: '↩',
            color: 'green',
            description: 'Ожидание отката к пробитому уровню и вход на ретесте.',
            logic: 'Консервативный вход: ждём откат к только что пробитому уровню, входим на удержании. Лучшее R:R и более высокая вероятность — но можно пропустить движение, если отката не будет.',
            applicable: (ctx, signals) =>
                ctx === 'uptrend' || ctx === 'testing_resistance' ||
                signals.includes('uptrend_structure') ||
                signals.includes('strong_bullish_momentum') ||
                signals.includes('potential_breakout'),
            priority: 90
        },
        {
            id: 'conservative-long',
            label: 'Conservative Long',
            shortLabel: 'CONS. LONG',
            direction: 'long',
            category: 'conditional',
            riskLevel: 'low',
            entryStyle: 'conditional',
            requiredEvidence: ['breakout', 'retest', 'hold'],
            recommendedEvidence: ['breakout', 'retest', 'hold', 'high-volume', 'close-above'],
            rrExpectation: '1:3',
            baseWinRate: 0.60,
            icon: '🛡',
            color: 'green',
            description: 'Вход только после ПОЛНОГО подтверждения: пробой + ретест + удержание.',
            logic: 'Самый безопасный вариант LONG: ждём всю структуру подтверждения. Высокая вероятность успеха и хорошее R:R, но повышенный риск пропустить движение, если цена уйдёт без отката.',
            applicable: (ctx, signals) =>
                ctx === 'uptrend' || ctx === 'testing_resistance' ||
                signals.includes('uptrend_structure') ||
                signals.includes('strong_bullish_momentum'),
            priority: 95
        },

        // -------------------------------------------------------
        // АГРЕССИВНЫЕ ВАРИАНТЫ
        // -------------------------------------------------------
        {
            id: 'aggressive-long',
            label: 'Aggressive Long',
            shortLabel: 'AGGR. LONG',
            direction: 'long',
            category: 'directional',
            riskLevel: 'high',
            entryStyle: 'immediate',
            requiredEvidence: ['breakout'],
            recommendedEvidence: ['breakout', 'impulse'],
            rrExpectation: '1:1.5',
            baseWinRate: 0.30,
            icon: '⚡',
            color: 'orange',
            description: 'Ранний вход в лонг на первом импульсе, до полного подтверждения.',
            logic: 'Высокий риск: входим на ранней фазе движения, не дожидаясь ретеста. Потенциально лучшая цена входа, но много ложных пробоев. Только при очень сильных сигналах и импульсе.',
            applicable: (ctx, signals) =>
                (ctx === 'uptrend' && signals.includes('strong_bullish_momentum')) ||
                signals.includes('strong_bullish_momentum') ||
                signals.includes('potential_breakout'),
            priority: 50
        },

        // -------------------------------------------------------
        // УПРАВЛЕНИЕ ПОЗИЦИЕЙ
        // -------------------------------------------------------
        {
            id: 'scale-in',
            label: 'Scale In',
            shortLabel: 'SCALE IN',
            direction: 'long',
            category: 'risk-managed',
            riskLevel: 'medium',
            entryStyle: 'gradual',
            requiredEvidence: ['breakout'],
            recommendedEvidence: ['breakout', 'retest'],
            rrExpectation: '1:2',
            baseWinRate: 0.50,
            icon: '⊞',
            color: 'blue',
            description: 'Поэтапный набор позиции: 2–3 входа по мере подтверждения.',
            logic: 'Разбиваем позицию на части: первый вход на пробое, второй на ретесте, третий на удержании. Средняя цена входа становится лучше, психологически проще. Подходит при умеренной уверенности в направлении.',
            applicable: (ctx, signals) =>
                ctx === 'uptrend' || ctx === 'testing_resistance' ||
                signals.includes('uptrend_structure') ||
                signals.includes('potential_breakout'),
            priority: 75
        },
        {
            id: 'partial-position',
            label: 'Partial Position',
            shortLabel: 'PARTIAL',
            direction: 'long',
            category: 'risk-managed',
            riskLevel: 'low',
            entryStyle: 'conditional',
            requiredEvidence: ['breakout'],
            recommendedEvidence: ['breakout', 'close-above'],
            rrExpectation: '1:2',
            baseWinRate: 0.55,
            icon: '◐',
            color: 'purple',
            description: 'Вход неполным объёмом из-за неопределённости (½ или ⅓ позиции).',
            logic: 'Уменьшаем размер позиции из-за неопределённости (рядом уровень, объём спорный, контекст неидеальный). Сохраняем участие в движении, но снижаем риск. Хорошо работает в слабых трендах и у ключевых уровней.',
            applicable: (ctx, signals) =>
                signals.includes('at_key_level') ||
                signals.includes('multiple_level_touches') ||
                signals.includes('low_volume') ||
                signals.includes('volume_climax'),
            priority: 65
        },

        // -------------------------------------------------------
        // КОНТРТРЕНД
        // -------------------------------------------------------
        {
            id: 'counter-trend',
            label: 'Counter-Trend Trade',
            shortLabel: 'COUNTER',
            direction: 'short',
            category: 'counter-trend',
            riskLevel: 'high',
            entryStyle: 'immediate',
            requiredEvidence: ['retest', 'hold'],
            recommendedEvidence: ['retest', 'hold'],
            rrExpectation: '1:3',
            baseWinRate: 0.25,
            icon: '↯',
            color: 'red',
            description: 'Контртрендовая сделка против основного движения с объяснением риска.',
            logic: 'Самый рискованный вариант: торгуем против тренда в расчёте на разворот. Требует очень сильных сигналов разворота (отбой от сильного уровня, дивергенция, истощение тренда). Высокий R:R при успехе, но низкая вероятность — большинство таких сделок убыточны.',
            applicable: (ctx, signals) =>
                (ctx === 'testing_resistance' && signals.includes('strong_bearish_momentum')) ||
                (ctx === 'testing_support' && signals.includes('strong_bullish_momentum')) ||
                (ctx === 'transition'),
            priority: 40
        },

        // -------------------------------------------------------
        // НЕЙТРАЛЬНЫЕ РЕШЕНИЯ
        // -------------------------------------------------------
        {
            id: 'wait',
            label: 'Wait (ожидание подтверждения)',
            shortLabel: 'WAIT',
            direction: 'neutral',
            category: 'neutral',
            riskLevel: 'low',
            entryStyle: 'conditional',
            requiredEvidence: [],
            recommendedEvidence: [],
            rrExpectation: '—',
            baseWinRate: 1.0,
            icon: '⏳',
            color: 'yellow',
            description: 'Не входить сейчас, ждать более чёткой структуры.',
            logic: 'Дисциплинированный отказ от сделки при неопределённости. Не упускаем возможность полностью, но и не рискуем в условиях слабого подтверждения.',
            applicable: () => true,
            priority: 60
        },
        {
            id: 'no-trade',
            label: 'No Trade (рынок не даёт преимущества)',
            shortLabel: 'NO TRADE',
            direction: 'neutral',
            category: 'neutral',
            riskLevel: 'low',
            entryStyle: 'conditional',
            requiredEvidence: [],
            recommendedEvidence: [],
            rrExpectation: '—',
            baseWinRate: 1.0,
            icon: '✕',
            color: 'gray',
            description: 'Полный отказ от сделки — рынок не даёт статистического преимущества.',
            logic: 'Капитал сохраняется. Используется, когда ни одно из направлений не подтверждено, волатильность низкая или рынок у сильного уровня без реакции.',
            applicable: (ctx, signals) =>
                ctx === 'range' || ctx === 'transition' ||
                signals.includes('low_volume') ||
                (signals.includes('at_key_level') && !signals.includes('strong_bullish_momentum') && !signals.includes('strong_bearish_momentum')),
            priority: 55
        }
    ];

    // ================================================================
    // Динамический выбор подходящих вариантов
    // ================================================================

    /**
     * Возвращает 5–7 наиболее подходящих вариантов решений
     * для текущего рыночного контекста.
     *
     * @param {Object} marketAnalysis — результат MarketAnalysisEngine.analyze()
     * @param {Object} [opts] — дополнительные опции
     * @param {number} [opts.maxOptions=7] — максимальное количество вариантов (5–7)
     * @param {number} [opts.minOptions=5] — минимальное количество вариантов
     * @returns {Array} отсортированный массив объектов решений
     */
    function selectOptions(marketAnalysis, opts) {
        opts = opts || {};
        const maxOptions = opts.maxOptions || 7;
        const minOptions = opts.minOptions || 5;

        const ctx = marketAnalysis ? marketAnalysis.context : 'range';
        const signals = (marketAnalysis && marketAnalysis.keySignals) || [];
        const bias = marketAnalysis ? marketAnalysis.bias : 'neutral';

        // 1) Фильтруем по применимости
        const applicable = DECISION_CATALOG.filter(d => {
            try { return d.applicable(ctx, signals); } catch (e) { return false; }
        });

        // 2) Если применимых меньше минимума — расширяем пул.
        //
        // Приоритеты добавления:
        //   a) Нейтральные решения (wait, no-trade, partial-position) — всегда осмысленны.
        //   b) Risk-managed (scale-in) — обычно осмысленны.
        //   c) Если всё ещё мало — добираем из каталога по убыванию priority.
        //
        // Цель: гарантировать 5–7 вариантов в любом сценарии, чтобы обучение
        // оставалось содержательным даже в узких контекстах (ложный пробой, боковик).
        if (applicable.length < minOptions) {
            const fallbackPool = [
                // Нейтральные (всегда)
                ...DECISION_CATALOG.filter(d => d.category === 'neutral'),
                // Risk-managed (обычно осмысленны)
                ...DECISION_CATALOG.filter(d => d.category === 'risk-managed')
            ];

            fallbackPool.forEach(f => {
                if (!applicable.find(a => a.id === f.id)) applicable.push(f);
            });
        }

        // 3) Если всё ещё мало — добираем из полного каталога по priority
        if (applicable.length < minOptions) {
            const sortedAll = DECISION_CATALOG.slice().sort((a, b) =>
                (b.priority || 50) - (a.priority || 50)
            );
            sortedAll.forEach(d => {
                if (applicable.length >= minOptions) return;
                if (!applicable.find(a => a.id === d.id)) applicable.push(d);
            });
        }

        // 3) Скоринг и сортировка
        const scored = applicable.map(d => {
            let score = d.priority || 50;
            // Бонус за соответствие bias
            if (d.direction === bias) score += 25;
            // Бонус за учёт текущего контекста
            if (d.id === 'breakout-entry' && signals.includes('potential_breakout')) score += 15;
            if (d.id === 'pullback-entry'  && ctx === 'uptrend')                       score += 10;
            if (d.id === 'conservative-long' && signals.includes('at_key_level'))      score += 10;
            if (d.id === 'partial-position' && signals.includes('multiple_level_touches')) score += 20;
            if (d.id === 'scale-in'         && signals.includes('low_volume'))         score += 10;
            if (d.id === 'aggressive-long'  && signals.includes('strong_bullish_momentum')) score += 10;
            if (d.id === 'no-trade'         && signals.includes('low_volume'))         score += 15;
            if (d.id === 'counter-trend'    && ctx === 'transition')                   score += 5;
            // Штраф за риск в неопределённости
            if (d.riskLevel === 'high' && (signals.includes('low_volume') || signals.includes('at_key_level'))) score -= 10;
            // Контекст нейтральный — нейтральные решения в приоритете
            if (bias === 'neutral' && (d.id === 'wait' || d.id === 'no-trade' || d.id === 'partial-position')) score += 15;
            return { decision: d, score };
        });

        scored.sort((a, b) => b.score - a.score);

        // 4) Возвращаем top-N
        return scored.slice(0, maxOptions).map(s => s.decision);
    }

    /**
     * Возвращает полный объект решения по его ID.
     */
    function getDecisionById(id) {
        return DECISION_CATALOG.find(d => d.id === id) || null;
    }

    /**
     * Возвращает все решения каталога (для справки/тестирования).
     */
    function getAllDecisions() {
        return DECISION_CATALOG.slice();
    }

    // ================================================================
    // Экспорт
    // ================================================================

    global.DecisionOptionsCatalog = {
        selectOptions: selectOptions,
        getDecisionById: getDecisionById,
        getAllDecisions: getAllDecisions,
        CATALOG: DECISION_CATALOG
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = global.DecisionOptionsCatalog;
    }

})(typeof window !== 'undefined' ? window : globalThis);
