/**
 * PerformanceAnalyticsEngine — Module 4 (Performance Analytics).
 *
 * ════════════════════════════════════════════════════════════════════════════
 *  PAYD Trading Lab — Module 4 (финальный аналитический слой)
 * ════════════════════════════════════════════════════════════════════════════
 *
 *  Архитектурный контракт:
 *    ✗ НЕ анализирует график
 *    ✗ НЕ интерпретирует структуру / моментум / объём / SMC / волатильность
 *    ✗ НЕ вызывает coreAnalysisEngine.analyzeMarket()
 *    ✗ НЕ импортирует анализаторы
 *    ✗ НЕ вычисляет вероятности, тренды, силу сигналов
 *    ✗ НЕ оценивает решение пользователя (это Module 2)
 *    ✗ НЕ формирует обучающую обратную связь (это Module 3)
 *
 *    ✓ Только читает готовые поля AnalysisResult от Module X
 *    ✓ Использует результат Module 2 (verdict, explanation, evidenceAnalysis)
 *    ✓ Использует результат Module 3 (cognitiveBiases, missedSignals, lesson)
 *    ✓ Хранит историю попыток пользователя
 *    ✓ Считает точность, выявляет слабые места, строит Skill Map
 *    ✓ Предлагает адаптивное обучение и отслеживает прогресс
 *
 *  Вход:  {
 *           analysis:      AnalysisResult (от Module X),
 *           module2Result: Module2Result (от Module 2),
 *           module3Result: Module3Result (от Module 3),
 *           userDecision:  string (id решения),
 *           executionTime: number (мс, опционально),
 *           timestamp:     ISO-string (опционально)
 *         }
 *
 *  Выход (generateAnalytics):
 *    {
 *      timestamp,
 *      history: { total, recentItems[], ... },
 *      accuracy: {
 *        overall: { total, correct, percent, grade },
 *        byDecision: { long, short, wait, no_trade },
 *        byPhase: { trending, consolidation, transition, ranging },
 *        byScenario: groups derived from analysis.scenarios
 *      },
 *      weaknesses: {
 *        detected: [{ type, severity, occurrences, percent, examples }],
 *        summary: string
 *      },
 *      skillMap: {
 *        trendReading, marketStructure, smartMoney, priceAction,
 *        volumeAnalysis, liquidityAnalysis, momentumAnalysis,
 *        riskManagement, overall
 *      },
 *      adaptiveLearning: {
 *        recommendations: [...],
 *        focusAreas: [...],
 *        suggestedExercises: [...]
 *      },
 *      progress: { today, week, month, allTime },
 *      moduleVersion
 *    }
 */

(function (global) {
    'use strict';

    if (!global) {
        throw new Error('[PerformanceAnalyticsEngine] global is required');
    }

    // ================================================================
    // КОНСТАНТЫ
    // ================================================================

    const MODULE_VERSION = '1.0.0';
    const MAX_HISTORY_ITEMS = 1000;
    const SKILL_CATEGORIES = [
        'trendReading',
        'marketStructure',
        'smartMoney',
        'priceAction',
        'volumeAnalysis',
        'liquidityAnalysis',
        'momentumAnalysis',
        'riskManagement'
    ];

    /**
     * Паттерны слабых мест — ключ: тип, описание, эвристика детекции.
     */
    const WEAKNESS_PATTERNS = [
        {
            type: 'early_entry',
            label: 'Слишком ранние входы',
            description: 'Решение принимается до подтверждения ключевых сигналов Module X',
            detect: function (attempt, history) {
                if (!attempt.wasCorrect) return false;
                const r = attempt.analysisResult?.confidence?.percent || 0;
                const ev = attempt.module2Result?.evidenceAnalysis;
                const misses = ev?.misses?.length || 0;
                return r < 60 && misses >= 2;
            }
        },
        {
            type: 'against_trend',
            label: 'Торговля против тренда',
            description: 'Решение противоречит основному направлению Module X',
            detect: function (attempt) {
                if (attempt.wasCorrect) return false;
                const trend = (attempt.analysisResult?.trend?.primaryTrend || '').toLowerCase();
                const dec = (attempt.userDecision || '').toLowerCase();
                if (trend.includes('bull') && dec === 'short') return true;
                if (trend.includes('bear') && dec === 'long') return true;
                return false;
            }
        },
        {
            type: 'ignored_volume',
            label: 'Игнорирование объёма',
            description: 'Пропуск сигналов объёма, подтверждающих тренд',
            detect: function (attempt) {
                if (attempt.wasCorrect) return false;
                const a = attempt.analysisResult || {};
                const vol = a.volume;
                const sup = (a.evidence?.supporting || []).concat(
                    a.priceAction?.signals || []
                );
                const volSpikes = vol?.spikes || [];
                if (volSpikes.length === 0) return false;
                const ev = attempt.module2Result?.evidenceAnalysis;
                const matches = ev?.matches || [];
                const volMatched = matches.some((m) => /volume|spike/i.test(String(m)));
                return volSpikes.length > 0 && !volMatched;
            }
        },
        {
            type: 'ignored_liquidity',
            label: 'Игнорирование ликвидности',
            description: 'Пропуск уровней ликвидности при принятии решения',
            detect: function (attempt) {
                if (attempt.wasCorrect) return false;
                const liq = attempt.analysisResult?.liquidity;
                if (!liq) return false;
                const levels = (liq.levels || []).concat(liq.zones || []);
                if (levels.length === 0) return false;
                const ev = attempt.module2Result?.evidenceAnalysis;
                const matches = ev?.matches || [];
                return !matches.some((m) => /liq|liquidity/i.test(String(m)));
            }
        },
        {
            type: 'price_action_errors',
            label: 'Ошибки Price Action',
            description: 'Неверная интерпретация паттернов Price Action',
            detect: function (attempt) {
                if (attempt.wasCorrect) return false;
                const pa = attempt.analysisResult?.priceAction;
                if (!pa) return false;
                const pattern = (pa.pattern || '').toLowerCase();
                const dec = (attempt.userDecision || '').toLowerCase();
                if (!pattern || pattern === 'none' || pattern === 'doji') return false;
                const isBullPA = /bull|hammer|engulfing|pin/i.test(pattern);
                const isBearPA = /bear|shoot|star|engulfing_dark/i.test(pattern);
                if (isBullPA && dec === 'short') return true;
                if (isBearPA && dec === 'long') return true;
                return false;
            }
        },
        {
            type: 'low_confidence_misuse',
            label: 'Ошибки при низкой уверенности',
            description: 'Вход в сделку при низкой уверенности Module X',
            detect: function (attempt) {
                if (attempt.wasCorrect) return false;
                const c = attempt.analysisResult?.confidence?.percent || 0;
                const dec = (attempt.userDecision || '').toLowerCase();
                return c < 40 && dec !== 'wait' && dec !== 'no_trade';
            }
        },
        {
            type: 'overtrading',
            label: 'Избыточная торговля',
            description: 'Слишком много попыток за короткий период времени',
            detect: function (attempt, history) {
                const ts = new Date(attempt.timestamp).getTime();
                const oneHourAgo = ts - 60 * 60 * 1000;
                const recent = (history || []).filter((h) => {
                    const t = new Date(h.timestamp).getTime();
                    return t >= oneHourAgo && t <= ts;
                });
                return recent.length >= 8;
            }
        },
        {
            type: 'revenge_trading',
            label: 'Revenge trading',
            description: 'Повторный вход сразу после проигрышной попытки в противоположном направлении',
            detect: function (attempt, history) {
                if (!history || history.length === 0) return false;
                const last = history[history.length - 1];
                if (last.wasCorrect) return false;
                const lastDec = (last.userDecision || '').toLowerCase();
                const thisDec = (attempt.userDecision || '').toLowerCase();
                const lastTs = new Date(last.timestamp).getTime();
                const thisTs = new Date(attempt.timestamp).getTime();
                const diffSec = (thisTs - lastTs) / 1000;
                if (diffSec > 120) return false;
                return lastDec !== thisDec;
            }
        },
        {
            type: 'confirmation_bias',
            label: 'Confirmation bias',
            description: 'Игнорирование сигналов против выбранного направления',
            detect: function (attempt) {
                if (attempt.wasCorrect) return false;
                const against = attempt.analysisResult?.evidence?.against || [];
                if (against.length < 2) return false;
                const ev = attempt.module2Result?.evidenceAnalysis;
                const missMatches = (ev?.misses || []).length;
                return missMatches >= 2;
            }
        }
    ];

    /**
     * Профиль рекомендаций по слабым местам: какие темы повторить и какие
     * упражнения предложить.
     */
    const ADAPTIVE_RECOMMENDATIONS = {
        early_entry: {
            topics: ['Confirmation Models', 'Entry Triggers', 'Multi-timeframe Analysis'],
            exercises: ['Wait for Confirmation', 'Patience Trainer', 'Multi-signal Aggregator'],
            situations: ['Pullback entries with at least 2 confirmations']
        },
        against_trend: {
            topics: ['Trend Identification', 'Market Structure', 'HH/HL/LL/LH'],
            exercises: ['Trade With Trend', 'Counter-trend Avoidance'],
            situations: ['Re-entries only after structure shift']
        },
        ignored_volume: {
            topics: ['Volume Profile', 'Volume Spread Analysis', 'OBV'],
            exercises: ['Volume Confluence Trainer'],
            situations: ['Volume spike + structure']
        },
        ignored_liquidity: {
            topics: ['Liquidity Sweeps', 'Equal Highs/Lows', 'Stop Hunting'],
            exercises: ['Liquidity Map Trainer'],
            situations: ['Liquidity + Smart Money concept']
        },
        price_action_errors: {
            topics: ['Candlestick Patterns', 'Engulfing Recognition', 'Pin Bars'],
            exercises: ['Price Action Quiz'],
            situations: ['Single-pattern identification']
        },
        low_confidence_misuse: {
            topics: ['Risk Filters', 'Confidence Thresholds', 'Position Sizing'],
            exercises: ['Wait-or-Trade Filter'],
            situations: ['Trade only when confidence > 60%']
        },
        overtrading: {
            topics: ['Trading Discipline', 'Mindful Trading', 'Pomodoro Sessions'],
            exercises: ['Quality-over-Quantity Drill'],
            situations: ['Limit to 3 setups per day']
        },
        revenge_trading: {
            topics: ['Emotional Control', 'Loss Recovery Rules', 'Cooling-off Periods'],
            exercises: ['Post-Loss Pause'],
            situations: ['Mandatory 5-min cool-off after loss']
        },
        confirmation_bias: {
            topics: ['Bear/Bull Case Logic', 'Decision Trees', 'Anti-bias Checklists'],
            exercises: ['Counter-argument Trainer'],
            situations: ['Force counter-case analysis before each trade']
        }
    };

    // ================================================================
    // ХРАНИЛИЩЕ ИСТОРИИ (in-memory)
    // ================================================================

    let _history = [];
    let _recordedAt = null;

    function _trimHistory() {
        if (_history.length > MAX_HISTORY_ITEMS) {
            _history = _history.slice(-MAX_HISTORY_ITEMS);
        }
    }

    // ================================================================
    // ВСПОМОГАТЕЛЬНЫЕ ЧИТАТЕЛИ (read-only, не выполняют анализ)
    // ================================================================

    function _safeGet(obj, path, defaultValue) {
        if (!obj || typeof obj !== 'object') return defaultValue;
        const parts = path.split('.');
        let cur = obj;
        for (const p of parts) {
            if (cur == null) return defaultValue;
            cur = cur[p];
        }
        return cur == null ? defaultValue : cur;
    }

    function _normStr(s, fallback) {
        if (typeof s === 'string') return s.toLowerCase();
        return fallback;
    }

    /**
     * Нормализует direction решения пользователя к одному из: long/short/wait/no_trade.
     */
    function _normDecision(userDecision) {
        const d = _normStr(userDecision, '');
        if (!d) return 'unknown';
        if (d === 'long' || d === 'short' || d === 'wait' || d === 'no_trade' || d === 'no-trade') {
            return d === 'no-trade' ? 'no_trade' : d;
        }
        return d;
    }

    /**
     * Считывает bias из analysis.
     */
    function _readBias(analysis) {
        if (!analysis) return 'unknown';
        const t = _safeGet(analysis, 'trend.primaryTrend', '');
        const ms = _safeGet(analysis, 'marketStructure.type', '');
        const s = String(t || ms).toLowerCase();
        if (s.includes('bull') || s === 'uptrend') return 'bullish';
        if (s.includes('bear') || s === 'downtrend') return 'bearish';
        if (s === 'range' || s === '' || s === 'neutral') return 'range';
        return 'unknown';
    }

    /**
     * Считывает market phase.
     */
    function _readPhase(analysis) {
        if (!analysis) return 'unknown';
        const p = _safeGet(analysis, 'marketPhase.phase', '');
        if (!p) return 'unknown';
        const s = String(p).toLowerCase();
        if (/trend/i.test(s)) return 'trending';
        if (/consol|range/i.test(s)) return 'consolidation';
        if (/trans|shift/i.test(s)) return 'transition';
        return 'ranging';
    }

    /**
     * Считывает primary scenario id (если есть).
     */
    function _readPrimaryScenarioId(analysis) {
        const scenarios = _safeGet(analysis, 'scenarios', []);
        if (!Array.isArray(scenarios) || scenarios.length === 0) return null;
        const sorted = scenarios.slice().sort((a, b) => {
            const pa = (a.priority ?? 99);
            const pb = (b.priority ?? 99);
            return pa - pb;
        });
        return sorted[0]?.id || sorted[0]?.direction || null;
    }

    /**
     * Нормализация verdict из Module 2.
     */
    function _wasCorrectFromM2(module2Result) {
        if (!module2Result) return false;
        const v = _normStr(module2Result.verdict, '');
        if (v === 'correct') return true;
        if (module2Result.verdict === 'correct') return true;
        if (typeof module2Result.score === 'number') {
            return module2Result.score > 0;
        }
        return false;
    }

    /**
     * Извлекает ev-массив из Module 2 (matches).
     */
    function _readM2Matches(module2Result) {
        return _safeGet(module2Result, 'evidenceAnalysis.matches', []) || [];
    }

    function _readM2Misses(module2Result) {
        return _safeGet(module2Result, 'evidenceAnalysis.misses', []) || [];
    }

    // ================================================================
    // УНИФИЦИРОВАННАЯ ЗАПИСЬ ПОПЫТКИ
    // ================================================================

    /**
     * Нормализует входные данные попытки и формирует унифицированный
     * объект, который сохраняется в истории.
     */
    function _buildAttemptRecord(input) {
        const analysis = input.analysis || input.marketAnalysis || null;
        const module2Result = input.module2Result || null;
        const module3Result = input.module3Result || null;
        const userDecision = _normDecision(input.userDecision);
        const timestamp = input.timestamp || new Date().toISOString();
        const executionTime = typeof input.executionTime === 'number' ? input.executionTime : null;
        const wasCorrect = _wasCorrectFromM2(module2Result);
        const bias = _readBias(analysis);
        const phase = _readPhase(analysis);
        const scenarioId = _readPrimaryScenarioId(analysis);
        const confidence = _safeGet(analysis, 'confidence.percent', null);
        const verdict = _safeGet(module2Result, 'verdict', null);
        const score = _safeGet(module2Result, 'score', null);
        const biases3 = _safeGet(module3Result, 'cognitiveBiases', []) || [];
        const missedSignalCount = (_safeGet(module3Result, 'missedSignals.total', 0)) || 0;

        return {
            timestamp,
            userDecision,
            bias,
            phase,
            scenarioId,
            confidence,
            verdict,
            score,
            wasCorrect,
            executionTime,
            analysisResult: analysis,
            module2Result,
            module3Result,
            meta: {
                confidence,
                verdict,
                bias,
                phase,
                scenarioId,
                matches: _readM2Matches(module2Result),
                misses: _readM2Misses(module2Result),
                biases: biases3.map((b) => b.type || b.name || String(b)),
                missedSignalCount
            }
        };
    }

    // ================================================================
    // 1. DECISION HISTORY
    // ================================================================

    /**
     * Добавляет попытку в историю. Возвращает новую позицию (id попытки).
     */
    function addToHistory(input) {
        if (!input || typeof input !== 'object') {
            throw new Error('[PerformanceAnalyticsEngine] input is required');
        }
        if (Object.keys(input).length === 0) {
            throw new Error('[PerformanceAnalyticsEngine] input is required');
        }
        const record = _buildAttemptRecord(input);
        _history.push(record);
        _recordedAt = new Date().toISOString();
        _trimHistory();
        return { id: _history.length - 1, total: _history.length, timestamp: record.timestamp };
    }

    function getHistory() {
        return {
            total: _history.length,
            items: _history.slice(),
            lastUpdated: _recordedAt
        };
    }

    function clearHistory() {
        _history = [];
        _recordedAt = null;
        return { cleared: true };
    }

    // ================================================================
    // 2. ACCURACY
    // ================================================================

    function _percent(num, den) {
        if (!den || den <= 0) return 0;
        return Math.round((num / den) * 1000) / 10;
    }

    function _grade(percent) {
        if (percent >= 85) return 'A';
        if (percent >= 70) return 'B';
        if (percent >= 55) return 'C';
        if (percent >= 40) return 'D';
        return 'F';
    }

    /**
     * Вычисляет точность: общую, по типу решения, по фазе рынка, по сценариям.
     */
    function calculateAccuracy(attempts) {
        const a = Array.isArray(attempts) ? attempts : _history;
        if (a.length === 0) {
            return {
                overall: { total: 0, correct: 0, incorrect: 0, percent: 0, grade: 'F' },
                byDecision: emptyGroup(['long', 'short', 'wait', 'no_trade']),
                byPhase: emptyGroup(['trending', 'consolidation', 'transition', 'ranging']),
                byScenario: { groups: [], totalScenarios: 0 },
                empty: true
            };
        }

        const total = a.length;
        const correct = a.filter((x) => x.wasCorrect).length;
        const overall = {
            total,
            correct,
            incorrect: total - correct,
            percent: _percent(correct, total),
            grade: _grade(_percent(correct, total))
        };

        const byDecision = _groupAccuracy(a, (x) => x.userDecision, ['long', 'short', 'wait', 'no_trade']);
        const byPhase = _groupAccuracy(a, (x) => x.phase, ['trending', 'consolidation', 'transition', 'ranging']);

        // По сценариям — только те, что встретились
        const byScenario = _scenarioAccuracy(a);

        return { overall, byDecision, byPhase, byScenario };
    }

    function emptyGroup(keys) {
        const g = {};
        for (const k of keys) {
            g[k] = { total: 0, correct: 0, percent: 0, grade: 'F' };
        }
        return g;
    }

    function _groupAccuracy(arr, keyFn, requiredKeys) {
        const groups = {};
        if (Array.isArray(requiredKeys)) {
            for (const k of requiredKeys) groups[k] = { total: 0, correct: 0, percent: 0, grade: 'F' };
        }
        for (const x of arr) {
            const k = keyFn(x) || 'unknown';
            if (!groups[k]) groups[k] = { total: 0, correct: 0, percent: 0, grade: 'F' };
            groups[k].total++;
            if (x.wasCorrect) groups[k].correct++;
        }
        for (const k of Object.keys(groups)) {
            const g = groups[k];
            g.percent = _percent(g.correct, g.total);
            g.grade = _grade(g.percent);
        }
        return groups;
    }

    function _scenarioAccuracy(arr) {
        const groups = {};
        for (const x of arr) {
            const id = x.scenarioId || 'none';
            if (!groups[id]) groups[id] = { total: 0, correct: 0, percent: 0, grade: 'F', id };
            groups[id].total++;
            if (x.wasCorrect) groups[id].correct++;
        }
        const list = Object.values(groups).map((g) => ({
            ...g,
            percent: _percent(g.correct, g.total),
            grade: _grade(_percent(g.correct, g.total))
        }));
        list.sort((a, b) => b.total - a.total);
        return { groups: list, totalScenarios: list.length };
    }

    // ================================================================
    // 3. WEAKNESS DETECTION
    // ================================================================

    function detectWeaknesses(attempts) {
        const a = Array.isArray(attempts) ? attempts : _history;
        if (a.length === 0) {
            return { detected: [], summary: 'Недостаточно данных', empty: true };
        }

        const stats = {};
        for (const p of WEAKNESS_PATTERNS) {
            stats[p.type] = {
                type: p.type,
                label: p.label,
                description: p.description,
                occurrences: 0,
                examples: [],
                severity: 'low'
            };
        }

        for (let i = 0; i < a.length; i++) {
            const attempt = a[i];
            const hist = a.slice(0, i);
            for (const p of WEAKNESS_PATTERNS) {
                let hit = false;
                try {
                    hit = p.detect(attempt, hist) === true;
                } catch (e) {
                    hit = false;
                }
                if (hit) {
                    stats[p.type].occurrences++;
                    if (stats[p.type].examples.length < 3) {
                        stats[p.type].examples.push(attempt.timestamp);
                    }
                }
            }
        }

        const detected = [];
        for (const k of Object.keys(stats)) {
            const s = stats[k];
            if (s.occurrences > 0) {
                s.percent = _percent(s.occurrences, a.length);
                if (s.percent >= 30) s.severity = 'critical';
                else if (s.percent >= 15) s.severity = 'high';
                else if (s.percent >= 7) s.severity = 'medium';
                else s.severity = 'low';
                detected.push(s);
            }
        }

        // Сортируем по severity (по возрастанию: low → medium → high → critical,
        // в порядке приоритета отображения для выявления менее явных проблем)
        const sevRank = { critical: 4, high: 3, medium: 2, low: 1 };
        detected.sort((a, b) => {
            const dr = (sevRank[a.severity] || 0) - (sevRank[b.severity] || 0);
            if (dr !== 0) return dr;
            return b.occurrences - a.occurrences;
        });

        let summary;
        if (detected.length === 0) {
            summary = 'Критических слабых мест не обнаружено';
        } else {
            const top = detected[0];
            summary = `Главная проблема: ${top.label} (${top.occurrences} случаев, severity: ${top.severity})`;
        }

        return { detected, summary, totalAttempts: a.length };
    }

    // ================================================================
    // 4. SKILL MAP
    // ================================================================

    /**
     * Строит Skill Map: для каждой категории вычисляется процент
     * правильных решений, если соответствующие сигналы были учтены.
     */
    function buildSkillMap(attempts) {
        const a = Array.isArray(attempts) ? attempts : _history;

        const skills = {};
        for (const k of SKILL_CATEGORIES) {
            skills[k] = {
                score: 0,
                attempts: 0,
                correct: 0,
                level: 'unknown',
                evidenceHits: 0
            };
        }

        if (a.length === 0) {
            skills.overall = { score: 0, level: 'unknown' };
            return skills;
        }

        for (const x of a) {
            const matches = x.meta?.matches || [];
            const bias = x.bias;

            // Trend Reading
            {
                const trendMatched = matches.some((m) => /trend|hh|hl|ll|lh/i.test(String(m))) ||
                                    (x.scenarioId && /trend/i.test(String(x.scenarioId)));
                skills.trendReading.attempts++;
                if (x.wasCorrect && (trendMatched || bias !== 'unknown')) skills.trendReading.correct++;
                if (trendMatched) skills.trendReading.evidenceHits++;
            }

            // Market Structure
            {
                const structureMatched = matches.some((m) => /struct|bos|choch|mss|break|shift/i.test(String(m)));
                skills.marketStructure.attempts++;
                if (x.wasCorrect) skills.marketStructure.correct++;
                if (structureMatched) skills.marketStructure.evidenceHits++;
            }

            // Smart Money
            {
                const smMatched = matches.some((m) => /smc|smart|order.?block|ob|fvg|imbalance|liquidity_/i.test(String(m)));
                skills.smartMoney.attempts++;
                if (x.wasCorrect) skills.smartMoney.correct++;
                if (smMatched) skills.smartMoney.evidenceHits++;
            }

            // Price Action
            {
                const paMatched = matches.some((m) => /engulf|hammer|pin|shooting|doji|star|spike|pattern/i.test(String(m)));
                skills.priceAction.attempts++;
                if (x.wasCorrect) skills.priceAction.correct++;
                if (paMatched) skills.priceAction.evidenceHits++;
            }

            // Volume
            {
                const volMatched = matches.some((m) => /vol|spike/i.test(String(m)));
                skills.volumeAnalysis.attempts++;
                if (x.wasCorrect) skills.volumeAnalysis.correct++;
                if (volMatched) skills.volumeAnalysis.evidenceHits++;
            }

            // Liquidity
            {
                const liqMatched = matches.some((m) => /liq|sweep/i.test(String(m)));
                skills.liquidityAnalysis.attempts++;
                if (x.wasCorrect) skills.liquidityAnalysis.correct++;
                if (liqMatched) skills.liquidityAnalysis.evidenceHits++;
            }

            // Momentum
            {
                const momMatched = matches.some((m) => /momentum|rsi|macd|diverg/i.test(String(m)));
                skills.momentumAnalysis.attempts++;
                if (x.wasCorrect) skills.momentumAnalysis.correct++;
                if (momMatched) skills.momentumAnalysis.evidenceHits++;
            }

            // Risk Management (wait/no_trade = хорошо при низкой confidence)
            {
                const c = x.confidence || 0;
                const tookTrade = x.userDecision === 'long' || x.userDecision === 'short';
                const goodWait = (x.userDecision === 'wait' || x.userDecision === 'no_trade') && c < 60;
                const goodTrade = tookTrade && c >= 60 && x.wasCorrect;
                skills.riskManagement.attempts++;
                if (goodWait || goodTrade) skills.riskManagement.correct++;
            }
        }

        // Подсчёт итогов
        for (const k of SKILL_CATEGORIES) {
            const s = skills[k];
            s.score = s.attempts > 0 ? _percent(s.correct, s.attempts) : 0;
            s.level = _levelFromScore(s.score);
        }

        const overallScore = Math.round(
            SKILL_CATEGORIES.reduce((sum, k) => sum + (skills[k]?.score || 0), 0) / SKILL_CATEGORIES.length
        );
        skills.overall = {
            score: overallScore,
            level: _levelFromScore(overallScore)
        };

        return skills;
    }

    function _levelFromScore(score) {
        if (score >= 85) return 'expert';
        if (score >= 70) return 'advanced';
        if (score >= 55) return 'intermediate';
        if (score >= 40) return 'developing';
        if (score > 0) return 'novice';
        return 'unknown';
    }

    // ================================================================
    // 5. ADAPTIVE LEARNING
    // ================================================================

    /**
     * Строит рекомендации на основе выявленных слабых мест.
     */
    function generateAdaptiveLearning(weaknesses) {
        const w = (weaknesses && Array.isArray(weaknesses.detected)) ? weaknesses.detected : [];
        const recommendations = [];
        const focusAreas = [];
        const suggestedExercises = [];
        const seenTopics = new Set();
        const seenExercises = new Set();

        for (const wk of w) {
            const rec = ADAPTIVE_RECOMMENDATIONS[wk.type];
            if (!rec) continue;

            for (const t of rec.topics || []) {
                if (!seenTopics.has(t)) {
                    focusAreas.push({
                        topic: t,
                        reason: `${wk.label}: ${wk.severity}`,
                        weaknessType: wk.type
                    });
                    seenTopics.add(t);
                }
            }

            for (const ex of rec.exercises || []) {
                if (!seenExercises.has(ex)) {
                    suggestedExercises.push({
                        exercise: ex,
                        priority: wk.severity,
                        reason: `Связано с: ${wk.label}`,
                        weaknessType: wk.type
                    });
                    seenExercises.add(ex);
                }
            }

            recommendations.push({
                weaknessType: wk.type,
                label: wk.label,
                severity: wk.severity,
                summary: `${wk.label} обнаружено ${wk.occurrences} раз (${wk.percent}%)`,
                topics: rec.topics || [],
                exercises: rec.exercises || [],
                situations: rec.situations || []
            });
        }

        // Сортируем упражнения по severity
        const sevRank = { critical: 4, high: 3, medium: 2, low: 1 };
        suggestedExercises.sort((a, b) => (sevRank[b.priority] || 0) - (sevRank[a.priority] || 0));

        return {
            recommendations,
            focusAreas,
            suggestedExercises,
            hasRecommendations: recommendations.length > 0
        };
    }

    // ================================================================
    // 6. PROGRESS TRACKING
    // ================================================================

    function trackProgress(attempts) {
        const a = Array.isArray(attempts) ? attempts : _history;
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startOfWeek = startOfDay - ((now.getDay() + 6) % 7) * 24 * 60 * 60 * 1000;
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

        const buckets = {
            today: [],
            week: [],
            month: [],
            allTime: a
        };

        for (const x of a) {
            const t = new Date(x.timestamp).getTime();
            if (t >= startOfDay) buckets.today.push(x);
            if (t >= startOfWeek) buckets.week.push(x);
            if (t >= startOfMonth) buckets.month.push(x);
        }

        return {
            today: _bucketStats(buckets.today, 'Сегодня'),
            week: _bucketStats(buckets.week, 'Эта неделя'),
            month: _bucketStats(buckets.month, 'Этот месяц'),
            allTime: _bucketStats(buckets.allTime, 'За всё время')
        };
    }

    function _bucketStats(items, label) {
        const total = items.length;
        const correct = items.filter((x) => x.wasCorrect).length;
        const avgExecTime = total > 0
            ? Math.round(
                items
                    .filter((x) => typeof x.executionTime === 'number')
                    .reduce((s, x) => s + (x.executionTime || 0), 0) /
                Math.max(1, items.filter((x) => typeof x.executionTime === 'number').length)
            )
            : null;

        const byDay = {};
        for (const x of items) {
            const d = String(x.timestamp || '').slice(0, 10);
            if (!byDay[d]) byDay[d] = { attempts: 0, correct: 0 };
            byDay[d].attempts++;
            if (x.wasCorrect) byDay[d].correct++;
        }
        const dailyBreakdown = Object.keys(byDay).sort().map(k => ({
            date: k,
            attempts: byDay[k].attempts,
            correct: byDay[k].correct,
            percent: _percent(byDay[k].correct, byDay[k].attempts)
        }));

        return {
            label,
            attempts: total,
            correct,
            incorrect: total - correct,
            percent: _percent(correct, total),
            avgExecutionTimeMs: avgExecTime,
            dailyBreakdown
        };
    }

    // ================================================================
    // ГЛАВНАЯ ТОЧКА ВХОДА
    // ================================================================

    /**
     * Унифицированный метод: добавляет запись и возвращает полную аналитику.
     *
     * @param {object} input
     * @param {object} [input.analysis] AnalysisResult
     * @param {object} [input.module2Result] Module2Result
     * @param {object} [input.module3Result] Module3Result
     * @param {string} input.userDecision
     * @param {number} [input.executionTime]
     * @param {string} [input.timestamp]
     *
     * @returns {object} полный набор аналитики
     */
    function generateAnalytics(input) {
        // Если передан input — добавляем попытку
        let added = null;
        if (input && (input.analysis || input.userDecision || input.module2Result)) {
            added = addToHistory(input);
        }

        const attempts = _history.slice();

        const accuracy = calculateAccuracy(attempts);
        const weaknessesResult = detectWeaknesses(attempts);
        const skillMap = buildSkillMap(attempts);
        const adaptiveLearning = generateAdaptiveLearning(weaknessesResult);
        const progress = trackProgress(attempts);

        return {
            timestamp: new Date().toISOString(),
            added,
            history: getHistory(),
            accuracy,
            weaknesses: weaknessesResult,
            skillMap,
            adaptiveLearning,
            progress,
            moduleVersion: MODULE_VERSION
        };
    }

    /**
     * Возвращает полную аналитику без добавления новой записи.
     */
    function getAnalytics() {
        return generateAnalytics(null);
    }

    /**
     * Упрощённая запись попытки с возвратом идентификатора.
     */
    function recordAttempt(input) {
        return addToHistory(input);
    }

    // ================================================================
    // ЭКСПОРТ
    // ================================================================

    const api = {
        // Главные точки входа
        generateAnalytics: generateAnalytics,
        getAnalytics: getAnalytics,
        recordAttempt: recordAttempt,
        addToHistory: addToHistory,
        getHistory: getHistory,
        clearHistory: clearHistory,

        // 1-2
        calculateAccuracy: calculateAccuracy,

        // 3
        detectWeaknesses: detectWeaknesses,

        // 4
        buildSkillMap: buildSkillMap,

        // 5
        generateAdaptiveLearning: generateAdaptiveLearning,

        // 6
        trackProgress: trackProgress,

        // Приватные функции для тестирования
        _internal: {
            _safeGet: _safeGet,
            _normStr: _normStr,
            _normDecision: _normDecision,
            _readBias: _readBias,
            _readPhase: _readPhase,
            _readPrimaryScenarioId: _readPrimaryScenarioId,
            _wasCorrectFromM2: _wasCorrectFromM2,
            _readM2Matches: _readM2Matches,
            _readM2Misses: _readM2Misses,
            _buildAttemptRecord: _buildAttemptRecord,
            _percent: _percent,
            _grade: _grade,
            _groupAccuracy: _groupAccuracy,
            _scenarioAccuracy: _scenarioAccuracy,
            _levelFromScore: _levelFromScore,
            _bucketStats: _bucketStats,
            _history: () => _history,
            _resetHistory: () => { _history = []; _recordedAt = null; }
        },

        // Константы
        MODULE_VERSION: MODULE_VERSION,
        WEAKNESS_PATTERNS: WEAKNESS_PATTERNS,
        SKILL_CATEGORIES: SKILL_CATEGORIES,
        ADAPTIVE_RECOMMENDATIONS: ADAPTIVE_RECOMMENDATIONS,
        MAX_HISTORY_ITEMS: MAX_HISTORY_ITEMS
    };

    global.PerformanceAnalyticsEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this)));
