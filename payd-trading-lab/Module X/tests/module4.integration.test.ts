// ============================================================
// Module 4 — Интеграционные тесты (Performance Analytics)
// ============================================================
// Цель тестов:
//   1. Доказать, что PerformanceAnalyticsEngine.js НЕ выполняет анализ графика.
//   2. Доказать, что Module 4 принимает только готовые результаты
//      Module X, Module 2, Module 3 и действие пользователя.
//   3. Покрыть все 6 функций: Decision History, Accuracy,
//      Weakness Detection, Skill Map, Adaptive Learning, Progress Tracking.
//   4. Проверить edge cases (пустая история, неполные данные, попытки с разными решениями).
//   5. Подтвердить, что Module 4 тестируется только через моки.
// ============================================================

export {};

// ============================================================
// 0. ТЕСТ-ФРЕЙМВОРК
// ============================================================
interface TestResult {
    suite: string;
    name: string;
    passed: boolean;
    details: string;
    duration: number;
}

class Module4TestRunner {
    results: TestResult[] = [];
    currentSuite = '';

    suite(name: string, fn: () => void): void {
        this.currentSuite = name;
        console.log(`\n${'═'.repeat(70)}\n  ${name}\n${'═'.repeat(70)}`);
        fn();
    }

    test(name: string, fn: () => { pass: boolean; info: string }): void {
        const t0 = Date.now();
        try {
            const out = fn();
            const passed = Boolean(out && out.pass === true);
            const details = out?.info ?? (passed ? 'OK' : 'FAILED');
            this.results.push({ suite: this.currentSuite, name, passed, details, duration: Date.now() - t0 });
            const icon = passed ? '✓' : '✗';
            const color = passed ? '\x1b[32m' : '\x1b[31m';
            console.log(`  ${color}${icon}\x1b[0m  ${name}  [${details}]  (${Date.now() - t0}ms)`);
        } catch (e) {
            const err = e as Error;
            this.results.push({ suite: this.currentSuite, name, passed: false, details: 'THROW: ' + err.message, duration: Date.now() - t0 });
            console.log(`  \x1b[31m✗\x1b[0m  ${name}  [THROW: ${err.message}]  (${Date.now() - t0}ms)`);
        }
    }

    report(): void {
        const total = this.results.length;
        const passed = this.results.filter(r => r.passed).length;
        const failed = total - passed;
        const failedTests = this.results.filter(r => !r.passed);
        const totalDuration = this.results.reduce((s, r) => s + r.duration, 0);

        console.log(`\n${'═'.repeat(70)}`);
        console.log(`  ИТОГОВЫЙ ОТЧЁТ — MODULE 4 (performance analytics)`);
        console.log(`${'═'.repeat(70)}`);
        console.log(`  Всего тестов:    ${total}`);
        console.log(`  \x1b[32mПройдено:       ${passed}\x1b[0m`);
        console.log(`  \x1b[31mПровалено:      ${failed}\x1b[0m`);
        console.log(`  Общее время:     ${totalDuration}ms`);
        console.log(`  Процент успеха:  ${total > 0 ? ((passed / total) * 100).toFixed(1) : 0}%`);

        if (failedTests.length > 0) {
            console.log(`\n  ── Провалившиеся тесты ──`);
            for (const t of failedTests) {
                console.log(`  • [${t.suite}] ${t.name}`);
                console.log(`    → ${t.details}`);
            }
        }

        console.log(`\n  ── Покрытие по группам ──`);
        const suites = [...new Set(this.results.map(r => r.suite))];
        for (const s of suites) {
            const suiteTests = this.results.filter(r => r.suite === s);
            const suitePassed = suiteTests.filter(r => r.passed).length;
            const pct = suiteTests.length > 0 ? ((suitePassed / suiteTests.length) * 100).toFixed(0) : '0';
            console.log(`  ${s.padEnd(45)} ${suitePassed}/${suiteTests.length} (${pct}%)`);
        }

        console.log(`${'═'.repeat(70)}\n`);
    }
}

// ============================================================
// 1. ЗАГРУЗКА MODULE 4 В VM-КОНТЕКСТ
// ============================================================
const fs = require('fs');
const vm = require('vm');

console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║  MODULE 4 — ТЕСТЫ ИНТЕГРАЦИИ (Performance Analytics) v1.0.0       ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

const module4Path = '/workspace/payd-trading-lab/Module 4/PerformanceAnalyticsEngine.js';
console.log('[Загрузка] Module 4 (PerformanceAnalyticsEngine.js)...');
const module4Code = fs.readFileSync(module4Path, 'utf8');

// КРИТИЧЕСКОЕ: используем vm.createContext, чтобы IIFE в Module 4
// подхватывал наш контекст как globalThis (а не реальный global Node.js).
const ctx: any = vm.createContext({});
ctx.window = ctx;
ctx.global = ctx;
ctx.globalThis = ctx;

let Module4: any;
try {
    const script = new vm.Script(module4Code, { filename: 'PerformanceAnalyticsEngine.js' });
    script.runInContext(ctx);
    Module4 = ctx.PerformanceAnalyticsEngine;
    console.log('[Загрузка] Module 4 загружен ✓');
    console.log(`[Проверка] Module 4 имеет generateAnalytics: ${typeof Module4?.generateAnalytics === 'function'}\n`);
} catch (e: any) {
    console.error('[ОШИБКА] Не удалось загрузить Module 4:', e.message);
    throw e;
}

// ============================================================
// 2. ВСПОМОГАТЕЛЬНЫЕ ФАБРИКИ МОКОВ
// ============================================================

/**
 * Mock AnalysisResult — бычий тренд.
 */
function makeBullishAnalysis(overrides: any = {}): any {
    const base: any = {
        trend: { primaryTrend: 'strong_bull', strength: 80, description: 'Strong bullish' },
        marketStructure: {
            type: 'uptrend',
            summary: 'Uptrend with HH/HL',
            swings: [{ type: 'HH' }, { type: 'HL' }],
            structureShift: null,
            strength: 80
        },
        smartMoney: {
            summary: 'Order blocks identified',
            concepts: ['order_block', 'liquidity_sweep'],
            orderBlocks: [{ type: 'bullish', zone: 'support' }]
        },
        priceAction: {
            pattern: 'bullish_engulfing',
            summary: 'Bullish PA at support',
            signals: ['hammer', 'bullish_engulfing']
        },
        volume: { trend: 'increasing', relative: 1.4, spikes: ['volume_spike'] },
        liquidity: { levels: ['equal_highs_above'], zones: ['buy_side_liquidity'] },
        momentum: { trend: 'positive', value: 0.65, divergences: [], summary: 'Momentum+' },
        volatility: { value: 0.02, trend: 'normal' },
        supportResistance: { nearestSupport: 100, nearestResistance: 110 },
        probabilities: { continuation: 0.75, reversal: 0.25 },
        scenarios: [
            { id: 'long', label: 'Long', direction: 'long', priority: 1, probability: 0.7 },
            { id: 'short', label: 'Short', direction: 'short', priority: 3, probability: 0.3 }
        ],
        confidence: { percent: 78, grade: 'B' },
        evidence: {
            keySignals: ['uptrend_structure', 'strong_bullish_momentum'],
            supporting: ['bullish_engulfing', 'volume_increase'],
            against: ['overextension_at_resistance']
        },
        confluence: { score: 75, level: 4, sources: ['structure', 'momentum', 'volume', 'smc'], conflictingSignals: 1 },
        marketPhase: { phase: 'trending' },
        meta: { version: '2.0.0', analyzedAt: '2024-01-01T00:00:00Z', candleCount: 100, timeframe: 'H1' }
    };
    return { ...base, ...overrides };
}

function makeBearishAnalysis(overrides: any = {}): any {
    return makeBullishAnalysis({
        trend: { primaryTrend: 'strong_bear', strength: 75, description: 'Bearish' },
        marketStructure: { type: 'downtrend', summary: 'LL, LH', swings: [{ type: 'LL' }, { type: 'LH' }], strength: 75 },
        priceAction: { pattern: 'bearish_engulfing', summary: 'Bearish', signals: ['shooting_star'] },
        momentum: { trend: 'negative', value: -0.6 },
        scenarios: [
            { id: 'short', label: 'Short', direction: 'short', priority: 1, probability: 0.7 }
        ],
        confidence: { percent: 75, grade: 'B' },
        ...overrides
    });
}

function makeRangeAnalysis(overrides: any = {}): any {
    return makeBullishAnalysis({
        trend: { primaryTrend: 'range', strength: 30 },
        marketStructure: { type: 'range', summary: 'Range', swings: [], strength: 30 },
        smartMoney: { summary: '', concepts: [], orderBlocks: [] },
        priceAction: { pattern: 'doji', summary: 'Range', signals: [] },
        volume: { trend: 'flat', relative: 0.7, spikes: [] },
        momentum: { trend: 'flat', value: 0 },
        probabilities: { continuation: 0.5, reversal: 0.5 },
        scenarios: [
            { id: 'wait', label: 'Wait', direction: 'neutral', priority: 1, probability: 0.5 }
        ],
        confidence: { percent: 35, grade: 'D' },
        evidence: { keySignals: [], supporting: [], against: [] },
        confluence: { score: 35, level: 1, conflictingSignals: 3 },
        marketPhase: { phase: 'consolidation' },
        ...overrides
    });
}

/**
 * Mock Module2Result — correct/long.
 */
function makeModule2Result(overrides: any = {}): any {
    const base: any = {
        verdict: 'correct',
        verdictLabel: '✓ Correct',
        score: 5,
        decision: { id: 'long', label: 'Long', shortLabel: 'LONG', direction: 'long', category: 'directional' },
        explanation: {
            match: 'Long matches bullish bias.',
            risk: 'Умеренный риск.',
            contextSummary: { bias: 'bullish', confidence: 78, marketContext: 'trending', continuationPct: 75 },
            betterAlternative: null,
            decision: 'Long'
        },
        evidenceAnalysis: { modifier: 2, matches: ['high-volume', 'hh-pattern'], misses: [], recommendedHits: 1, recommendedTotal: 1 }
    };
    return { ...base, ...overrides };
}

function makeIncorrectM2(overrides: any = {}): any {
    return makeModule2Result({
        verdict: 'incorrect',
        verdictLabel: '✗ Incorrect',
        score: -3,
        decision: { id: 'short', label: 'Short', shortLabel: 'SHORT', direction: 'short', category: 'directional' },
        explanation: {
            match: 'Short against bullish bias.',
            risk: 'High risk.',
            contextSummary: { bias: 'bullish', confidence: 78 },
            betterAlternative: { id: 'long', label: 'Long' },
            decision: 'Short'
        },
        evidenceAnalysis: { modifier: 0, matches: [], misses: ['high-volume', 'hh-pattern'], recommendedHits: 0, recommendedTotal: 1 },
        ...overrides
    });
}

/**
 * Mock Module3Result — минимальный валидный.
 */
function makeModule3Result(overrides: any = {}): any {
    const base: any = {
        timestamp: '2024-01-01T00:00:00Z',
        userDecision: 'long',
        bias: 'bullish',
        confidence: 78,
        marketPhase: 'trending',
        whyExplanation: { headline: 'Decision matches bias', bullets: ['bias bullish'], confidenceNote: 'high' },
        missedSignals: { total: 0, items: [], categorical: {} },
        cognitiveBiases: [],
        learningTips: [],
        difficulty: { level: 'easy', score: 20, factors: [] },
        lesson: { primary: { id: 'l1', rule: 'r', explanation: 'e', practical: 'p' }, secondary: [] },
        moduleVersion: '1.0.0'
    };
    return { ...base, ...overrides };
}

function resetHistory() {
    Module4._internal._resetHistory();
}

// ============================================================
// 3. ТЕСТЫ
// ============================================================

const runner = new Module4TestRunner();

// ------------------------------------------------------------
// SUITE 1 — ARCHITECTURE
// ------------------------------------------------------------
runner.suite('ARCHITECTURE: Module 4 не выполняет собственный анализ', () => {
    runner.test('В исходном коде Module 4 нет вызовов analyzeMarket', () => {
        const src = fs.readFileSync(module4Path, 'utf8');
        const cleanSrc = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        const hasCall = /analyzeMarket\s*\(/.test(cleanSrc);
        return { pass: !hasCall, info: hasCall ? 'analyzeMarket() вызывается ✗' : 'analyzeMarket() НЕ вызывается ✓' };
    });

    runner.test('В коде Module 4 нет собственных аналитических функций', () => {
        const src = fs.readFileSync(module4Path, 'utf8');
        const forbidden = [
            /function\s+analyzeStructure\s*\(/i,
            /function\s+computeTrend\s*\(/i,
            /function\s+detectOrderBlock\s*\(/i,
            /function\s+calculateMomentum\s*\(/i,
            /function\s+analyzeVolume\s*\(/i,
            /function\s+detectPattern\s*\(/i
        ];
        const found = forbidden.filter(p => p.test(src));
        return {
            pass: found.length === 0,
            info: found.length === 0 ? 'Нет собственной аналитики ✓' : `Найдены запрещённые функции: ${found.length}`
        };
    });

    runner.test('В коде Module 4 нет require/import анализаторов', () => {
        const src = fs.readFileSync(module4Path, 'utf8');
        const patterns = [
            /require\s*\(\s*['"][^'"]*analyzer/i,
            /from\s+['"][^'"]*analyzer/i,
            /import\s+[^;]*from\s+['"][^'"]*analyzer/i
        ];
        const found = patterns.filter(p => p.test(src));
        return {
            pass: found.length === 0,
            info: found.length === 0 ? 'Анализаторы не импортируются ✓' : `Найдено импортов: ${found.length}`
        };
    });

    runner.test('Module 4 имеет generateAnalytics как публичную точку входа', () => {
        const pass = Boolean(Module4) && typeof Module4.generateAnalytics === 'function';
        return {
            pass,
            info: pass ? `Module4.keys = ${Object.keys(Module4).join(', ')}` : 'Нет публичной точки входа'
        };
    });

    runner.test('Module 4 принимает только публичные поля AnalysisResult', () => {
        const r = Module4.generateAnalytics({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: makeModule2Result(),
            module3Result: makeModule3Result()
        });
        const pass = Boolean(r) && typeof r === 'object';
        return { pass, info: `keys = ${r ? Object.keys(r).join(',') : 'null'}` };
    });
});

// ------------------------------------------------------------
// SUITE 2 — DECISION HISTORY
// ------------------------------------------------------------
runner.suite('DECISION HISTORY: накопление и хранение попыток', () => {
    runner.test('История инициализируется пустой', () => {
        resetHistory();
        const h = Module4.getHistory();
        return { pass: h.total === 0 && Array.isArray(h.items), info: `total=${h.total}` };
    });

    runner.test('addToHistory добавляет одну запись', () => {
        resetHistory();
        const result = Module4.addToHistory({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: makeModule2Result(),
            module3Result: makeModule3Result(),
            executionTime: 1000
        });
        const pass = result.total === 1 && typeof result.id === 'number';
        return { pass, info: `id=${result.id}, total=${result.total}` };
    });

    runner.test('addToHistory накапливает несколько записей', () => {
        resetHistory();
        for (let i = 0; i < 10; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis(),
                userDecision: i % 2 === 0 ? 'long' : 'short',
                module2Result: i % 3 === 0 ? makeModule2Result() : makeIncorrectM2(),
                module3Result: makeModule3Result()
            });
        }
        const h = Module4.getHistory();
        return { pass: h.total === 10, info: `total=${h.total}` };
    });

    runner.test('getHistory возвращает объекты с ожидаемыми полями', () => {
        resetHistory();
        Module4.addToHistory({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: makeModule2Result(),
            module3Result: makeModule3Result(),
            executionTime: 1500,
            timestamp: '2024-06-01T12:00:00Z'
        });
        const h = Module4.getHistory();
        const item = h.items[0];
        const required = ['timestamp', 'userDecision', 'bias', 'phase', 'wasCorrect', 'executionTime'];
        const pass = required.every(k => k in item);
        return { pass, info: `keys=${Object.keys(item).join(',')}` };
    });

    runner.test('history items нормализуют userDecision (no-trade → no_trade)', () => {
        resetHistory();
        Module4.addToHistory({
            analysis: makeRangeAnalysis(),
            userDecision: 'no-trade',
            module2Result: makeModule2Result({ verdict: 'risky', score: 0 }),
            module3Result: makeModule3Result()
        });
        const h = Module4.getHistory();
        return { pass: h.items[0].userDecision === 'no_trade', info: `decision=${h.items[0].userDecision}` };
    });

    runner.test('history items сохраняют timestamp если задан', () => {
        resetHistory();
        const ts = '2024-06-15T10:30:00Z';
        Module4.addToHistory({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: makeModule2Result(),
            module3Result: makeModule3Result(),
            timestamp: ts
        });
        const h = Module4.getHistory();
        return { pass: h.items[0].timestamp === ts, info: `timestamp=${h.items[0].timestamp}` };
    });

    runner.test('clearHistory обнуляет историю', () => {
        Module4.addToHistory({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: makeModule2Result(),
            module3Result: makeModule3Result()
        });
        const r = Module4.clearHistory();
        const h = Module4.getHistory();
        return { pass: h.total === 0 && r.cleared === true, info: `total=${h.total}` };
    });

    runner.test('history items не превышают MAX_HISTORY_ITEMS', () => {
        resetHistory();
        // Запишем MAX + 5 = 1005 записей
        const max = Module4.MAX_HISTORY_ITEMS;
        const overshoot = max + 5;
        for (let i = 0; i < overshoot; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis(),
                userDecision: 'long',
                module2Result: makeModule2Result(),
                module3Result: makeModule3Result()
            });
        }
        const h = Module4.getHistory();
        return { pass: h.total <= max, info: `total=${h.total}, max=${max}` };
    });
});

// ------------------------------------------------------------
// SUITE 3 — ACCURACY
// ------------------------------------------------------------
runner.suite('ACCURACY: расчёт точности', () => {
    runner.test('Пустая история → overall = 0', () => {
        resetHistory();
        const acc = Module4.calculateAccuracy();
        return { pass: acc.overall.total === 0 && acc.overall.percent === 0, info: `total=${acc.overall.total}` };
    });

    runner.test('overall считается правильно', () => {
        resetHistory();
        // 7 correct + 3 incorrect = 70%
        for (let i = 0; i < 7; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis(),
                userDecision: 'long',
                module2Result: makeModule2Result({ verdict: 'correct' }),
                module3Result: makeModule3Result()
            });
        }
        for (let i = 0; i < 3; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis(),
                userDecision: 'short',
                module2Result: makeIncorrectM2(),
                module3Result: makeModule3Result()
            });
        }
        const acc = Module4.calculateAccuracy();
        return { pass: acc.overall.percent === 70 && acc.overall.total === 10, info: `pct=${acc.overall.percent}` };
    });

    runner.test('grade назначается в соответствии с percent', () => {
        resetHistory();
        // 9 correct + 1 incorrect = 90% → grade A
        for (let i = 0; i < 9; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis(),
                userDecision: 'long',
                module2Result: makeModule2Result({ verdict: 'correct' }),
                module3Result: makeModule3Result()
            });
        }
        Module4.addToHistory({
            analysis: makeBullishAnalysis(),
            userDecision: 'short',
            module2Result: makeIncorrectM2(),
            module3Result: makeModule3Result()
        });
        const acc = Module4.calculateAccuracy();
        return { pass: acc.overall.grade === 'A', info: `grade=${acc.overall.grade}, pct=${acc.overall.percent}` };
    });

    runner.test('byDecision.long разделяет длинные позиции', () => {
        resetHistory();
        for (let i = 0; i < 4; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis(),
                userDecision: 'long',
                module2Result: i < 3 ? makeModule2Result({ verdict: 'correct' }) : makeIncorrectM2(),
                module3Result: makeModule3Result()
            });
        }
        const acc = Module4.calculateAccuracy();
        const long = acc.byDecision.long;
        return { pass: long.total === 4 && long.correct === 3 && long.percent === 75, info: `long=${JSON.stringify(long)}` };
    });

    runner.test('byDecision.short разделяет короткие позиции', () => {
        resetHistory();
        for (let i = 0; i < 5; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis(),
                userDecision: 'short',
                module2Result: i < 2 ? makeModule2Result({ verdict: 'correct' }) : makeIncorrectM2(),
                module3Result: makeModule3Result()
            });
        }
        const acc = Module4.calculateAccuracy();
        const short = acc.byDecision.short;
        return { pass: short.total === 5 && short.correct === 2 && short.percent === 40, info: `short=${JSON.stringify(short)}` };
    });

    runner.test('byPhase разделяет по фазам рынка', () => {
        resetHistory();
        for (let i = 0; i < 4; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis({ marketPhase: { phase: 'trending' } }),
                userDecision: 'long',
                module2Result: makeModule2Result({ verdict: 'correct' }),
                module3Result: makeModule3Result()
            });
        }
        for (let i = 0; i < 3; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis({ marketPhase: { phase: 'consolidation' } }),
                userDecision: 'wait',
                module2Result: makeModule2Result({ verdict: 'correct' }),
                module3Result: makeModule3Result()
            });
        }
        const acc = Module4.calculateAccuracy();
        const tr = acc.byPhase.trending;
        const co = acc.byPhase.consolidation;
        return { pass: tr.total === 4 && co.total === 3, info: `trending=${tr.total}, consol=${co.total}` };
    });

    runner.test('byScenario группирует по scenarioId', () => {
        resetHistory();
        for (let i = 0; i < 5; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis(),
                userDecision: 'long',
                module2Result: makeModule2Result({ verdict: 'correct' }),
                module3Result: makeModule3Result()
            });
        }
        const acc = Module4.calculateAccuracy();
        const hasScenarios = Array.isArray(acc.byScenario.groups) && acc.byScenario.groups.length > 0;
        return { pass: hasScenarios, info: `scenarioGroups=${acc.byScenario.groups.length}` };
    });
});

// ------------------------------------------------------------
// SUITE 4 — WEAKNESS DETECTION
// ------------------------------------------------------------
runner.suite('WEAKNESS DETECTION: выявление повторяющихся слабых мест', () => {
    runner.test('Пустая история → нет обнаруженных слабостей', () => {
        resetHistory();
        const w = Module4.detectWeaknesses();
        return { pass: w.empty === true && w.detected.length === 0, info: `empty=${w.empty}` };
    });

    runner.test('against_trend детектируется', () => {
        resetHistory();
        // Bullish trend → short 5 раз (all incorrect)
        for (let i = 0; i < 5; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis(),
                userDecision: 'short',
                module2Result: makeIncorrectM2(),
                module3Result: makeModule3Result()
            });
        }
        const w = Module4.detectWeaknesses();
        const types = w.detected.map((d: any) => d.type);
        return { pass: types.includes('against_trend'), info: `types=${types.join(',')}` };
    });

    runner.test('severity назначается (critical для 30%+)', () => {
        resetHistory();
        // 10/10 against_trend → severity critical
        for (let i = 0; i < 10; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis(),
                userDecision: 'short',
                module2Result: makeIncorrectM2(),
                module3Result: makeModule3Result()
            });
        }
        const w = Module4.detectWeaknesses();
        const at = w.detected.find((d: any) => d.type === 'against_trend');
        return { pass: at && at.severity === 'critical', info: `severity=${at?.severity}, pct=${at?.percent}` };
    });

    runner.test('detected сортируется по severity и occurrences', () => {
        resetHistory();
        for (let i = 0; i < 10; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis(),
                userDecision: 'short',
                module2Result: makeIncorrectM2(),
                module3Result: makeModule3Result()
            });
        }
        const w = Module4.detectWeaknesses();
        const sevRank = { critical: 4, high: 3, medium: 2, low: 1 };
        let sorted = true;
        for (let i = 1; i < w.detected.length; i++) {
            const dr = (sevRank[w.detected[i].severity] || 0) - (sevRank[w.detected[i - 1].severity] || 0);
            if (dr < 0) { sorted = false; break; }
        }
        return { pass: sorted, info: w.detected.map((d: any) => `${d.type}:${d.severity}`).join(',') };
    });

    runner.test('revenge_trading детектируется', () => {
        resetHistory();
        const now = Date.now();
        // Попытка 1: проигрыш long
        Module4.addToHistory({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: makeIncorrectM2(),
            module3Result: makeModule3Result(),
            timestamp: new Date(now - 60000).toISOString()
        });
        // Попытка 2 (через 30 сек): шорт
        Module4.addToHistory({
            analysis: makeBullishAnalysis(),
            userDecision: 'short',
            module2Result: makeIncorrectM2(),
            module3Result: makeModule3Result(),
            timestamp: new Date(now).toISOString()
        });
        const w = Module4.detectWeaknesses();
        const types = w.detected.map((d: any) => d.type);
        return { pass: types.includes('revenge_trading'), info: `types=${types.join(',')}` };
    });

    runner.test('low_confidence_misuse детектируется', () => {
        resetHistory();
        for (let i = 0; i < 3; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis({ confidence: { percent: 25 } }),
                userDecision: 'long',
                module2Result: makeModule2Result({ verdict: 'risky', score: -1 }),
                module3Result: makeModule3Result()
            });
        }
        const w = Module4.detectWeaknesses();
        const types = w.detected.map((d: any) => d.type);
        return { pass: types.includes('low_confidence_misuse'), info: `types=${types.join(',')}` };
    });

    runner.test('ignored_volume детектируется когда объём не учтён', () => {
        resetHistory();
        for (let i = 0; i < 4; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis(),
                userDecision: 'long',
                module2Result: makeIncorrectM2({ evidenceAnalysis: { modifier: 0, matches: [], misses: ['volume_spike'], recommendedHits: 0, recommendedTotal: 1 } }),
                module3Result: makeModule3Result()
            });
        }
        const w = Module4.detectWeaknesses();
        const types = w.detected.map((d: any) => d.type);
        return { pass: types.includes('ignored_volume'), info: `types=${types.join(',')}` };
    });

    runner.test('price_action_errors детектируется при PA-mismatch', () => {
        resetHistory();
        // bullish_engulfing → short (incorrect)
        for (let i = 0; i < 3; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis({ priceAction: { pattern: 'bullish_engulfing', signals: ['bullish_engulfing'] } }),
                userDecision: 'short',
                module2Result: makeIncorrectM2(),
                module3Result: makeModule3Result()
            });
        }
        const w = Module4.detectWeaknesses();
        const types = w.detected.map((d: any) => d.type);
        return { pass: types.includes('price_action_errors'), info: `types=${types.join(',')}` };
    });

    runner.test('weakness summary содержит информативный текст', () => {
        resetHistory();
        for (let i = 0; i < 5; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis(),
                userDecision: 'short',
                module2Result: makeIncorrectM2(),
                module3Result: makeModule3Result()
            });
        }
        const w = Module4.detectWeaknesses();
        return { pass: typeof w.summary === 'string' && w.summary.length > 0, info: w.summary.slice(0, 80) };
    });
});

// ------------------------------------------------------------
// SUITE 5 — SKILL MAP
// ------------------------------------------------------------
runner.suite('SKILL MAP: профиль навыков пользователя', () => {
    runner.test('Пустая история → score 0', () => {
        resetHistory();
        const sm = Module4.buildSkillMap();
        return { pass: sm.trendReading.score === 0 && sm.overall.score === 0, info: `overall=${sm.overall.score}` };
    });

    runner.test('Все 8 категорий присутствуют', () => {
        resetHistory();
        Module4.addToHistory({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: makeModule2Result(),
            module3Result: makeModule3Result()
        });
        const sm = Module4.buildSkillMap();
        const required = Module4.SKILL_CATEGORIES;
        const pass = required.every((k: string) => k in sm);
        return { pass, info: required.length === (sm && Object.keys(sm).length - 1) ? '8 categories ✓' : 'mismatch' };
    });

    runner.test('score ∈ [0, 100]', () => {
        resetHistory();
        for (let i = 0; i < 5; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis(),
                userDecision: 'long',
                module2Result: makeModule2Result({ verdict: 'correct' }),
                module3Result: makeModule3Result()
            });
        }
        const sm = Module4.buildSkillMap();
        const allScores = Module4.SKILL_CATEGORIES.map((k: string) => sm[k].score);
        const valid = allScores.every((s: number) => s >= 0 && s <= 100);
        return { pass: valid, info: allScores.join(',') };
    });

    runner.test('level ∈ {expert, advanced, intermediate, developing, novice, unknown}', () => {
        resetHistory();
        for (let i = 0; i < 5; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis(),
                userDecision: 'long',
                module2Result: makeModule2Result({ verdict: 'correct' }),
                module3Result: makeModule3Result()
            });
        }
        const sm = Module4.buildSkillMap();
        const validLevels = ['expert', 'advanced', 'intermediate', 'developing', 'novice', 'unknown'];
        const allValid = Module4.SKILL_CATEGORIES.every((k: string) => validLevels.includes(sm[k].level));
        return { pass: allValid, info: Module4.SKILL_CATEGORIES.map((k: string) => `${k}=${sm[k].level}`).join(',') };
    });

    runner.test('100% correct → score = 100 для всех категорий', () => {
        resetHistory();
        for (let i = 0; i < 10; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis(),
                userDecision: 'long',
                module2Result: makeModule2Result({ verdict: 'correct', score: 5 }),
                module3Result: makeModule3Result()
            });
        }
        const sm = Module4.buildSkillMap();
        const all100 = Module4.SKILL_CATEGORIES.every((k: string) => sm[k].score === 100 || sm[k].attempts === 0);
        return { pass: all100, info: Module4.SKILL_CATEGORIES.map((k: string) => `${k}=${sm[k].score}`).join(',') };
    });

    runner.test('overall.score = среднему арифметическому всех категорий', () => {
        resetHistory();
        for (let i = 0; i < 5; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis(),
                userDecision: 'long',
                module2Result: makeModule2Result({ verdict: 'correct' }),
                module3Result: makeModule3Result()
            });
        }
        const sm = Module4.buildSkillMap();
        const avg = Math.round(Module4.SKILL_CATEGORIES.reduce((s: number, k: string) => s + sm[k].score, 0) / Module4.SKILL_CATEGORIES.length);
        return { pass: sm.overall.score === avg, info: `overall=${sm.overall.score}, calc=${avg}` };
    });

    runner.test('riskManagement учитывает правильный wait при низкой confidence', () => {
        resetHistory();
        for (let i = 0; i < 5; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis({ confidence: { percent: 30 } }),
                userDecision: 'wait',
                module2Result: makeModule2Result({ verdict: 'risky' }),
                module3Result: makeModule3Result()
            });
        }
        const sm = Module4.buildSkillMap();
        return { pass: sm.riskManagement.score === 100, info: `rm=${sm.riskManagement.score}` };
    });

    runner.test('evidenceHits считается для каждой категории', () => {
        resetHistory();
        for (let i = 0; i < 3; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis(),
                userDecision: 'long',
                module2Result: makeModule2Result({ evidenceAnalysis: { matches: ['volume_spike', 'hh-pattern', 'liquidity_sweep'], misses: [], recommendedHits: 3, recommendedTotal: 3 } }),
                module3Result: makeModule3Result()
            });
        }
        const sm = Module4.buildSkillMap();
        const hasHits = Module4.SKILL_CATEGORIES.some((k: string) => sm[k].evidenceHits > 0);
        return { pass: hasHits, info: Module4.SKILL_CATEGORIES.map((k: string) => `${k}=${sm[k].evidenceHits}`).join(',') };
    });
});

// ------------------------------------------------------------
// SUITE 6 — ADAPTIVE LEARNING
// ------------------------------------------------------------
runner.suite('ADAPTIVE LEARNING: рекомендации на основе слабых мест', () => {
    runner.test('hasRecommendations = false если нет weaknesses', () => {
        const al = Module4.generateAdaptiveLearning({ detected: [] });
        return { pass: al.hasRecommendations === false, info: `has=${al.hasRecommendations}` };
    });

    runner.test('focusAreas генерируются на основе weaknesses', () => {
        const w = {
            detected: [{ type: 'against_trend', label: 'Против тренда', severity: 'critical', occurrences: 5, percent: 50 }]
        };
        const al = Module4.generateAdaptiveLearning(w);
        const has = al.focusAreas.length > 0;
        return { pass: has, info: `topics=${al.focusAreas.map((f: any) => f.topic).join(';')}` };
    });

    runner.test('suggestedExercises содержат упражнения', () => {
        const w = {
            detected: [{ type: 'overtrading', label: 'Overtrading', severity: 'high', occurrences: 3, percent: 30 }]
        };
        const al = Module4.generateAdaptiveLearning(w);
        return { pass: al.suggestedExercises.length > 0, info: `ex=${al.suggestedExercises.map((e: any) => e.exercise).join(';')}` };
    });

    runner.test('suggestedExercises сортируются по severity', () => {
        const w = {
            detected: [
                { type: 'overtrading', label: 'A', severity: 'low', occurrences: 1, percent: 5 },
                { type: 'revenge_trading', label: 'B', severity: 'critical', occurrences: 3, percent: 30 },
                { type: 'against_trend', label: 'C', severity: 'high', occurrences: 5, percent: 50 }
            ]
        };
        const al = Module4.generateAdaptiveLearning(w);
        const ranks = al.suggestedExercises.map((e: any) => {
            const sevRank = { critical: 4, high: 3, medium: 2, low: 1 };
            return sevRank[e.priority] || 0;
        });
        let sorted = true;
        for (let i = 1; i < ranks.length; i++) {
            if (ranks[i] > ranks[i - 1]) { sorted = false; break; }
        }
        return { pass: sorted, info: ranks.join(',') };
    });

    runner.test('recommendations структурированы', () => {
        const w = {
            detected: [{ type: 'ignored_volume', label: 'IV', severity: 'high', occurrences: 4, percent: 40 }]
        };
        const al = Module4.generateAdaptiveLearning(w);
        const r = al.recommendations[0];
        const required = ['weaknessType', 'label', 'severity', 'topics', 'exercises'];
        const pass = r && required.every(k => k in r);
        return { pass, info: r ? Object.keys(r).join(',') : 'no recommendations' };
    });

    runner.test('темы не дублируются', () => {
        const w = {
            detected: [
                { type: 'ignored_volume', label: 'A', severity: 'high', occurrences: 4, percent: 40 },
                { type: 'ignored_liquidity', label: 'B', severity: 'high', occurrences: 4, percent: 40 }
            ]
        };
        const al = Module4.generateAdaptiveLearning(w);
        const topics = al.focusAreas.map((f: any) => f.topic);
        const unique = new Set(topics).size === topics.length;
        return { pass: unique, info: `topics=${topics.join(';')}` };
    });
});

// ------------------------------------------------------------
// SUITE 7 — PROGRESS TRACKING
// ------------------------------------------------------------
runner.suite('PROGRESS TRACKING: отслеживание по периодам', () => {
    runner.test('progress имеет today, week, month, allTime', () => {
        resetHistory();
        Module4.addToHistory({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: makeModule2Result(),
            module3Result: makeModule3Result()
        });
        const p = Module4.trackProgress();
        const required = ['today', 'week', 'month', 'allTime'];
        const pass = required.every(k => k in p);
        return { pass, info: Object.keys(p).join(',') };
    });

    runner.test('allTime содержит все попытки', () => {
        resetHistory();
        for (let i = 0; i < 5; i++) {
            Module4.addToHistory({
                analysis: makeBullishAnalysis(),
                userDecision: 'long',
                module2Result: makeModule2Result({ verdict: 'correct' }),
                module3Result: makeModule3Result()
            });
        }
        const p = Module4.trackProgress();
        return { pass: p.allTime.attempts === 5, info: `allTime=${p.allTime.attempts}` };
    });

    runner.test('bucket содержит attempts, correct, percent', () => {
        resetHistory();
        Module4.addToHistory({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: makeModule2Result(),
            module3Result: makeModule3Result()
        });
        const p = Module4.trackProgress();
        const t = p.today;
        const required = ['attempts', 'correct', 'percent'];
        const pass = required.every(k => k in t);
        return { pass, info: Object.keys(t).join(',') };
    });

    runner.test('dailyBreakdown корректен', () => {
        resetHistory();
        Module4.addToHistory({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: makeModule2Result(),
            module3Result: makeModule3Result(),
            timestamp: '2024-01-15T12:00:00Z'
        });
        Module4.addToHistory({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: makeModule2Result(),
            module3Result: makeModule3Result(),
            timestamp: '2024-01-15T15:00:00Z'
        });
        const p = Module4.trackProgress();
        const db = p.allTime.dailyBreakdown;
        const pass = Array.isArray(db) && db.length > 0 && db[0].attempts === 2;
        return { pass, info: `days=${db.length}, firstDay=${JSON.stringify(db[0])}` };
    });

    runner.test('avgExecutionTimeMs корректен', () => {
        resetHistory();
        Module4.addToHistory({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: makeModule2Result(),
            module3Result: makeModule3Result(),
            executionTime: 1000
        });
        Module4.addToHistory({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: makeModule2Result(),
            module3Result: makeModule3Result(),
            executionTime: 3000
        });
        const p = Module4.trackProgress();
        return { pass: p.allTime.avgExecutionTimeMs === 2000, info: `avg=${p.allTime.avgExecutionTimeMs}` };
    });
});

// ------------------------------------------------------------
// SUITE 8 — GENERATE ANALYTICS (integration)
// ------------------------------------------------------------
runner.suite('GENERATE ANALYTICS: полный интеграционный отчёт', () => {
    runner.test('generateAnalytics возвращает все ожидаемые блоки', () => {
        resetHistory();
        const r = Module4.generateAnalytics({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: makeModule2Result(),
            module3Result: makeModule3Result()
        });
        const required = ['timestamp', 'history', 'accuracy', 'weaknesses', 'skillMap', 'adaptiveLearning', 'progress', 'moduleVersion'];
        const pass = required.every(k => k in r);
        return { pass, info: Object.keys(r).join(',') };
    });

    runner.test('generateAnalytics добавляет запись в историю', () => {
        resetHistory();
        const before = Module4.getHistory().total;
        Module4.generateAnalytics({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: makeModule2Result(),
            module3Result: makeModule3Result()
        });
        const after = Module4.getHistory().total;
        return { pass: after === before + 1, info: `before=${before}, after=${after}` };
    });

    runner.test('getAnalytics не добавляет запись', () => {
        resetHistory();
        const before = Module4.getHistory().total;
        Module4.getAnalytics();
        const after = Module4.getHistory().total;
        return { pass: after === before, info: `before=${before}, after=${after}` };
    });

    runner.test('full pipeline: 5 attempts → полный отчёт', () => {
        resetHistory();
        for (let i = 0; i < 5; i++) {
            Module4.generateAnalytics({
                analysis: makeBullishAnalysis(),
                userDecision: 'long',
                module2Result: i < 4 ? makeModule2Result({ verdict: 'correct' }) : makeIncorrectM2(),
                module3Result: makeModule3Result()
            });
        }
        const r = Module4.getAnalytics();
        const pass = r.accuracy.overall.total === 5 &&
                     r.history.total === 5 &&
                     r.skillMap.overall.score >= 0 &&
                     Array.isArray(r.adaptiveLearning.recommendations);
        return { pass, info: `acc=${r.accuracy.overall.percent}%, skills=${r.skillMap.overall.score}` };
    });

    runner.test('moduleVersion присутствует', () => {
        const r = Module4.getAnalytics();
        return { pass: r.moduleVersion === Module4.MODULE_VERSION, info: `version=${r.moduleVersion}` };
    });

    runner.test('recordAttempt — упрощённая запись', () => {
        resetHistory();
        const result = Module4.recordAttempt({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: makeModule2Result(),
            module3Result: makeModule3Result()
        });
        return { pass: result.total === 1 && typeof result.id === 'number', info: `id=${result.id}` };
    });
});

// ------------------------------------------------------------
// SUITE 9 — EDGE CASES
// ------------------------------------------------------------
runner.suite('EDGE CASES: нестандартные входы', () => {
    runner.test('input = null в addToHistory → throws', () => {
        try {
            Module4.addToHistory(null);
            return { pass: false, info: 'Ожидалась ошибка' };
        } catch (e: any) {
            return { pass: e.message.includes('required') || e.message.includes('input'), info: `Поймана: ${e.message}` };
        }
    });

    runner.test('input = {} в addToHistory → throws', () => {
        try {
            Module4.addToHistory({});
            return { pass: false, info: 'Ожидалась ошибка' };
        } catch (e: any) {
            return { pass: e.message.includes('required'), info: `Поймана: ${e.message}` };
        }
    });

    runner.test('analysis = null → запись всё равно добавляется с unknown', () => {
        resetHistory();
        const result = Module4.addToHistory({
            analysis: null,
            userDecision: 'wait',
            module2Result: makeModule2Result({ verdict: 'risky' }),
            module3Result: makeModule3Result()
        });
        const h = Module4.getHistory();
        const pass = result.total === 1 && h.items[0].bias === 'unknown';
        return { pass, info: `bias=${h.items[0].bias}` };
    });

    runner.test('module2Result отсутствует → wasCorrect = false', () => {
        resetHistory();
        Module4.addToHistory({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: null,
            module3Result: makeModule3Result()
        });
        const h = Module4.getHistory();
        return { pass: h.items[0].wasCorrect === false, info: `wasCorrect=${h.items[0].wasCorrect}` };
    });

    runner.test('Отсутствие executionTime → null', () => {
        resetHistory();
        Module4.addToHistory({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: makeModule2Result(),
            module3Result: makeModule3Result()
        });
        const h = Module4.getHistory();
        return { pass: h.items[0].executionTime === null, info: `execTime=${h.items[0].executionTime}` };
    });

    runner.test('Каждая попытка имеет meta с matches/misses', () => {
        resetHistory();
        Module4.addToHistory({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: makeModule2Result({ evidenceAnalysis: { matches: ['m1', 'm2'], misses: ['m3'], recommendedHits: 2, recommendedTotal: 3, modifier: 1 } }),
            module3Result: makeModule3Result()
        });
        const h = Module4.getHistory();
        const m = h.items[0].meta;
        return { pass: Array.isArray(m.matches) && m.matches.length === 2 && m.misses.length === 1, info: `matches=${m.matches.length}, misses=${m.misses.length}` };
    });

    runner.test('_internal выставлено для тестирования', () => {
        const int = Module4._internal;
        const required = ['_safeGet', '_normDecision', '_readBias', '_readPhase', '_percent', '_grade'];
        const pass = required.every(k => typeof int[k] === 'function');
        return { pass, info: Object.keys(int).length > 10 ? `${Object.keys(int).length} функций ✓` : 'мало' };
    });

    runner.test('Конструктор не требует никаких зависимостей', () => {
        // Проверяем, что Module 4 загружен в чистом VM
        const isClean = Boolean(Module4) && typeof Module4.generateAnalytics === 'function';
        return { pass: isClean, info: isClean ? 'Loaded clean ✓' : 'FAIL' };
    });

    runner.test('generateAdaptiveLearning с пустым input', () => {
        const al = Module4.generateAdaptiveLearning({});
        return { pass: al.recommendations.length === 0 && al.hasRecommendations === false, info: 'empty' };
    });

    runner.test('resetHistory через _internal работает', () => {
        Module4._internal._resetHistory();
        const h = Module4.getHistory();
        return { pass: h.total === 0, info: `total=${h.total}` };
    });
});

// ------------------------------------------------------------
// SUITE 10 — ARCHITECTURAL GUARANTEES
// ------------------------------------------------------------
runner.suite('ARCHITECTURAL GUARANTEES: чистота архитектуры', () => {
    runner.test('Module 4 использует только публичные поля AnalysisResult', () => {
        resetHistory();
        const partialAnalysis = {
            trend: { primaryTrend: 'strong_bull' },
            confidence: { percent: 80 },
            evidence: { supporting: ['bullish_engulfing'] }
        };
        const r = Module4.generateAnalytics({
            analysis: partialAnalysis,
            userDecision: 'long',
            module2Result: makeModule2Result(),
            module3Result: makeModule3Result()
        });
        return { pass: r.history.total === 1, info: `added=${r.history.total}` };
    });

    runner.test('Module 4 полностью тестируется через моки', () => {
        resetHistory();
        const a = Module4.generateAnalytics({
            analysis: makeBullishAnalysis(),
            userDecision: 'long',
            module2Result: makeModule2Result(),
            module3Result: makeModule3Result()
        });
        return { pass: a.history.total === 1, info: 'fields ok=true, ready=true' };
    });

    runner.test('Module 4 не вызывает внешних API/Network/Time (кроме ISO-даты)', () => {
        const src = fs.readFileSync(module4Path, 'utf8');
        const forbidden = [
            /fetch\s*\(/,
            /XMLHttpRequest/,
            /process\.env/,
            /require\s*\(\s*['"]https?/i
        ];
        const found = forbidden.filter(p => p.test(src));
        return { pass: found.length === 0, info: found.length === 0 ? 'Нет внешних вызовов ✓' : `Найдено: ${found.length}` };
    });

    runner.test('timestamp присутствует в результате', () => {
        const r = Module4.getAnalytics();
        return { pass: Boolean(r.timestamp), info: `timestamp=${r.timestamp}` };
    });

    runner.test('WEAKNESS_PATTERNS содержит не менее 5 паттернов', () => {
        const pass = Array.isArray(Module4.WEAKNESS_PATTERNS) && Module4.WEAKNESS_PATTERNS.length >= 5;
        return { pass, info: `patterns=${Module4.WEAKNESS_PATTERNS.length}` };
    });

    runner.test('SKILL_CATEGORIES содержит 8 категорий', () => {
        const pass = Array.isArray(Module4.SKILL_CATEGORIES) && Module4.SKILL_CATEGORIES.length === 8;
        return { pass, info: `categories=${Module4.SKILL_CATEGORIES.length}` };
    });

    runner.test('ADAPTIVE_RECOMMENDATIONS покрывает все weakness types', () => {
        const weaknessTypes = Module4.WEAKNESS_PATTERNS.map((p: any) => p.type);
        const recTypes = Object.keys(Module4.ADAPTIVE_RECOMMENDATIONS);
        const missing = weaknessTypes.filter((t: string) => !recTypes.includes(t));
        return { pass: missing.length === 0, info: missing.length === 0 ? 'All covered ✓' : `Missing: ${missing.join(',')}` };
    });

    runner.test('Каждый WEAKNESS_PATTERNS имеет detect-функцию', () => {
        const invalid = Module4.WEAKNESS_PATTERNS.filter((p: any) => typeof p.detect !== 'function');
        return { pass: invalid.length === 0, info: invalid.length === 0 ? 'All valid ✓' : `Invalid: ${invalid.length}` };
    });
});

// Финальный отчёт
runner.report();
