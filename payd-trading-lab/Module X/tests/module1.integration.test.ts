// ============================================================
// Module 1 — Интеграционные тесты после полной интеграции с Module X v1.0.0
// ============================================================
// Цель тестов:
//   1. Доказать, что MarketAnalysisEngine.js НЕ содержит собственного
//      анализа графика (только форматирование).
//   2. Доказать, что Module 1 ВСЕГДА вызывает только
//      coreAnalysisEngine.analyzeMarket() (никаких обходных путей).
//   3. Полностью проверить ВСЕ приватные _format* и _read* функции
//      через публичный API, передавая кастомные AnalysisResult.
//   4. Проверить корректную работу с пустыми/частичными результатами.
//   5. Проверить, что moduleXOutput пробрасывается без изменений.
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

class Module1TestRunner {
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
            const passed = !!out && out.pass === true;
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
        const totalDuration = this.results.reduce((s, r) => r.duration, 0);

        console.log(`\n${'═'.repeat(70)}`);
        console.log(`  ИТОГОВЫЙ ОТЧЁТ — MODULE 1 (presentation layer)`);
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
        console.log(`${'═'.repeat(70)}\n`);
    }
}

// ============================================================
// 1. ЗАГРУЗКА МОДУЛЕЙ
// ============================================================
console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║  MODULE 1 — ТЕСТЫ ИНТЕГРАЦИИ С MODULE X v1.0.0                    ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

const fs = require('fs');
const vm = require('vm');

console.log('[Загрузка] Module 1 (MarketAnalysisEngine.js)...');
const module1Code = fs.readFileSync('/workspace/payd-trading-lab/Module 1/MarketAnalysisEngine.js', 'utf8');

// КРИТИЧЕСКОЕ РЕШЕНИЕ: используем vm.createContext, чтобы IIFE
// внутри MarketAnalysisEngine.js получал наш context в качестве
// глобального объекта (а не реальный globalThis Node.js).
//
// Это имитирует браузерную среду, где все скрипты <script> разделяют
// один и тот же globalThis. Тогда _getX() видит тот же объект, в который
// мы подменяем coreAnalysisEngine через installMockX().
const ctx: any = vm.createContext({});
ctx.window = ctx;
ctx.global = ctx;
ctx.globalThis = ctx;

try {
    const script = new vm.Script(module1Code, { filename: 'MarketAnalysisEngine.js' });
    script.runInContext(ctx);
} catch (err) {
    console.error('[FATAL] Не удалось загрузить Module 1:', err);
    process.exit(2);
}

const Module1 = ctx.MarketAnalysisEngine;

console.log('[Загрузка] Module 1 загружен ✓');
console.log(`[Проверка] Module 1 имеет analyze: ${typeof Module1?.analyze === 'function'}\n`);

// ============================================================
// 2. УТИЛИТЫ ДЛЯ СВЕЧЕЙ
// ============================================================

interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

function makeCandlesFlat(n: number, price: number): Candle[] {
    const out: Candle[] = [];
    for (let i = 0; i < n; i++) {
        out.push({
            time: i * 3600000,
            open: price,
            high: price + 1,
            low: price - 1,
            close: price,
            volume: 1000
        });
    }
    return out;
}

function makeUptrendCandles(n: number): Candle[] {
    const out: Candle[] = [];
    let price = 100;
    for (let i = 0; i < n; i++) {
        const open = price;
        const close = price + (0.6 + (i % 5) * 0.05);
        out.push({ time: i * 3600000, open, high: close + 0.2, low: open - 0.2, close, volume: 1000 });
        price = close;
    }
    return out;
}

function makeDowntrendCandles(n: number): Candle[] {
    const out: Candle[] = [];
    let price = 200;
    for (let i = 0; i < n; i++) {
        const open = price;
        const close = price - (0.6 + (i % 5) * 0.05);
        out.push({ time: i * 3600000, open, high: open + 0.2, low: close - 0.2, close, volume: 1000 });
        price = close;
    }
    return out;
}

// ============================================================
// 3. ГИБКИЙ MOCK ДЛЯ coreAnalysisEngine
// ============================================================

interface CallRecord {
    method: string;
    input: { candlesLength?: number; level?: any; timeframe?: string };
    ts: number;
}

/**
 * Создаёт mock coreAnalysisEngine, который:
 *  - записывает каждый вызов analyzeMarket
 *  - возвращает заранее подготовленный AnalysisResult
 *
 * Если передан factory — он вызывается с input и должен вернуть AnalysisResult.
 * Это удобно для динамических сценариев.
 */
function createMockModuleX(analyzerResult: any, callLog: CallRecord[] = []) {
    return {
        analyzeMarket: function (input: any) {
            callLog.push({
                method: 'analyzeMarket',
                input: {
                    candlesLength: input.candles?.length,
                    level: input.level,
                    timeframe: input.timeframe
                },
                ts: Date.now()
            });
            if (typeof analyzerResult === 'function') {
                return analyzerResult(input);
            }
            return analyzerResult;
        }
    };
}

/**
 * Устанавливает mock-реализацию Module X в наш vm-контекст.
 * Возвращает оригинальный Module X (для последующего восстановления).
 */
function installMockX(analyzerResult: any, callLog: CallRecord[] = []) {
    const original = ctx.coreAnalysisEngine;
    ctx.coreAnalysisEngine = createMockModuleX(analyzerResult, callLog);
    return original;
}

function uninstallMockX(original: any) {
    ctx.coreAnalysisEngine = original;
}

/**
 * Универсальный baseline-AnalysisResult.
 * Каждый тест при необходимости переписывает отдельные поля.
 */
function makeBaselineAnalysis(overrides: any = {}): any {
    return {
        error: null,
        marketStructure: {
            type: 'uptrend',
            higherHighs: [{ price: 110, time: 1 }],
            higherLows:  [{ price: 105, time: 1 }],
            lowerHighs:  [],
            lowerLows:   [],
            swings:      [],
            structureShift: null,
            summary: 'Baseline summary'
        },
        trend: {
            primaryTrend: 'strong_bull',
            strength: 80,
            description: 'bullish trend'
        },
        momentum: {
            signal: 'strong_bull',
            strength: 75,
            rsi: 65,
            value: 0.65,
            description: 'Сильный моментум'
        },
        volume: {
            signal: 'high',
            ratio: 1.2,
            current: 1200,
            average: 1000,
            description: 'Объём выше среднего'
        },
        volatility: {
            signal: 'medium',
            atr: 1.5,
            atrPercent: 1.5,
            description: 'Средняя волатильность'
        },
        supportResistance: {
            supports: [{ price: 95, strength: 0.8 }],
            resistances: [{ price: 110, strength: 0.7 }]
        },
        probabilities: {
            continuation: 0.7,
            reversal: 0.3
        },
        confidence: { percent: 78, grade: 'B' },
        confluence: { score: 7, grade: 'A' },
        marketPhase: { phase: 'trending' },
        smartMoney: {},
        priceAction: { patterns: [] },
        evidence: { keySignals: [] },
        invalidation: null,
        executionPlan: null,
        riskAssessment: null,
        scenarios: [],
        liquidity: null,
        ...overrides
    };
}

// ============================================================
// 4. ТЕСТЫ
// ============================================================

const runner = new Module1TestRunner();

// ------------------------------------------------------------
// SUITE 1 — ARCHITECTURE
// ------------------------------------------------------------
runner.suite('ARCHITECTURE: Module 1 не выполняет собственный анализ', () => {
    runner.test('В исходном коде Module 1 нет собственных аналитических функций', () => {
        const src = fs.readFileSync('/workspace/payd-trading-lab/Module 1/MarketAnalysisEngine.js', 'utf8');

        const forbiddenPatterns = [
            /function\s+\w*[Tt]rend\s*\(/,
            /function\s+\w*[Bb]OS\s*\(/,
            /function\s+\w*[Cc]HoCH\s*\(/,
            /function\s+\w*[Mm]omentum[Aa]nalyze/,
            /function\s+\w*RSI\s*\(/,
            /function\s+\w*[Pp]inBar\s*\(/,
            /function\s+\w*[Ss]wingDetect/,
            /function\s+calculateRSI/,
            /function\s+calculateMACD/,
            /function\s+findSwings/,
            /function\s+detectStructure/
        ];

        const violations: string[] = [];
        for (const p of forbiddenPatterns) {
            const m = src.match(p);
            if (m) violations.push(`${p.toString()}: ${m[0].substring(0, 50)}`);
        }

        return {
            pass: violations.length === 0,
            info: violations.length === 0
                ? 'Собственная аналитика отсутствует ✓'
                : `Нарушения (${violations.length}):\n${violations.join('\n')}`
        };
    });

    runner.test('analyzeMarket вызывается из analyze()', () => {
        const src = fs.readFileSync('/workspace/payd-trading-lab/Module 1/MarketAnalysisEngine.js', 'utf8');
        const hasCall = /\.analyzeMarket\s*\(/.test(src);
        return {
            pass: hasCall,
            info: hasCall ? 'analyzeMarket() вызывается ✓' : 'analyzeMarket() НЕ вызывается'
        };
    });

    runner.test('Module 1 имеет только экспорт { analyze }', () => {
        const keys = Object.keys(Module1).sort();
        const pass = keys.length === 1 && keys[0] === 'analyze';
        return {
            pass,
            info: `Module1 keys = ${JSON.stringify(keys)}`
        };
    });
});

// ------------------------------------------------------------
// SUITE 2 — API INVOCATION
// ------------------------------------------------------------
runner.suite('DATA FLOW: вызов coreAnalysisEngine.analyzeMarket()', () => {
    runner.test('analyzeMarket вызывается ровно один раз за analyze()', () => {
        const callLog: CallRecord[] = [];
        const originalX = installMockX(makeBaselineAnalysis(), callLog);
        try {
            const candles = makeUptrendCandles(50);
            Module1.analyze({ history: candles, level: 105 });
            return {
                pass: callLog.length === 1,
                info: `analyzeMarket вызван ${callLog.length} раз(а)`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('В analyzeMarket передаётся history.length как candles.length', () => {
        const callLog: CallRecord[] = [];
        const originalX = installMockX(makeBaselineAnalysis(), callLog);
        try {
            const candles = makeUptrendCandles(75);
            Module1.analyze({ history: candles, level: 110 });
            const last = callLog[callLog.length - 1];
            const pass = last?.input?.candlesLength === 75;
            return {
                pass,
                info: `candlesLength=${last?.input?.candlesLength}, ожидалось 75`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('В analyzeMarket передаётся level', () => {
        const callLog: CallRecord[] = [];
        const originalX = installMockX(makeBaselineAnalysis(), callLog);
        try {
            const candles = makeUptrendCandles(50);
            Module1.analyze({ history: candles, level: 99.5 });
            const last = callLog[callLog.length - 1];
            return {
                pass: last?.input?.level === 99.5,
                info: `level=${JSON.stringify(last?.input?.level)}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('timeframe передаётся как "unknown"', () => {
        const callLog: CallRecord[] = [];
        const originalX = installMockX(makeBaselineAnalysis(), callLog);
        try {
            const candles = makeUptrendCandles(50);
            Module1.analyze({ history: candles, level: 100 });
            const last = callLog[callLog.length - 1];
            return {
                pass: last?.input?.timeframe === 'unknown',
                info: `timeframe=${last?.input?.timeframe}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('moduleXOutput пробрасывается без изменений (identity)', () => {
        const baseline = makeBaselineAnalysis({ customMarker: 'XYZ-12345' });
        const originalX = installMockX(baseline, []);
        try {
            const candles = makeUptrendCandles(50);
            const result = Module1.analyze({ history: candles, level: 100 });
            const same = result.moduleXOutput === baseline;
            return {
                pass: same && result.moduleXOutput?.customMarker === 'XYZ-12345',
                info: same ? 'moduleXOutput проброшен identity ✓' : 'moduleXOutput !== AnalysisResult'
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('meta.poweredBy указывает Module X v1.0.0', () => {
        const originalX = installMockX(makeBaselineAnalysis(), []);
        try {
            const candles = makeUptrendCandles(50);
            const result = Module1.analyze({ history: candles, level: 100 });
            const pass = result.meta?.poweredBy === 'Module X v1.0.0 (coreAnalysisEngine)';
            return {
                pass,
                info: `poweredBy=${result.meta?.poweredBy}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('meta содержит analyzedAt, candlesCount, currentPrice', () => {
        const originalX = installMockX(makeBaselineAnalysis(), []);
        try {
            const candles = makeUptrendCandles(40);
            const result = Module1.analyze({ history: candles, level: 100 });
            const last = candles[candles.length - 1];
            const meta = result.meta || {};
            const pass =
                typeof meta.analyzedAt === 'string' &&
                meta.candlesCount === 40 &&
                meta.currentPrice === Math.round(last.close * 100) / 100;
            return {
                pass,
                info: `analyzedAt=${meta.analyzedAt}, candlesCount=${meta.candlesCount}, currentPrice=${meta.currentPrice}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });
});

// ------------------------------------------------------------
// SUITE 3 — _formatStructureLabel (через public API)
// ------------------------------------------------------------
runner.suite('FORMATTING: _formatStructureLabel', () => {
    function assertStructureLabel(type: string | null, expectedLabel: string) {
        const originalX = installMockX(
            makeBaselineAnalysis({ marketStructure: { type: type, higherHighs: [], higherLows: [], lowerHighs: [], lowerLows: [], swings: [], structureShift: null, summary: '' } }),
            []
        );
        try {
            const candles = makeUptrendCandles(30);
            const result = Module1.analyze({ history: candles, level: 100 });
            const pass = result.structure?.label === expectedLabel;
            return {
                pass,
                info: `type="${type}" → label="${result.structure?.label}" (ожидалось "${expectedLabel}")`
            };
        } finally {
            uninstallMockX(originalX);
        }
    }

    runner.test('uptrend → "восходящий тренд (HH/HL)"', () =>
        assertStructureLabel('uptrend', 'восходящий тренд (HH/HL)'));

    runner.test('downtrend → "нисходящий тренд (LH/LL)"', () =>
        assertStructureLabel('downtrend', 'нисходящий тренд (LH/LL)'));

    runner.test('range → "боковик (range)"', () =>
        assertStructureLabel('range', 'боковик (range)'));

    runner.test('consolidation → "консолидация"', () =>
        assertStructureLabel('consolidation', 'консолидация'));

    runner.test('expansion → "расширение волатильности"', () =>
        assertStructureLabel('expansion', 'расширение волатильности'));

    runner.test('compression → "сжатие волатильности"', () =>
        assertStructureLabel('compression', 'сжатие волатильности'));

    runner.test('null → "переходная фаза"', () =>
        assertStructureLabel(null, 'переходная фаза'));

    runner.test('"unknown" (неизвестный тип) → "переходная фаза"', () =>
        assertStructureLabel('weird_type', 'переходная фаза'));
});

// ------------------------------------------------------------
// SUITE 4 — _readBias
// ------------------------------------------------------------
runner.suite('FORMATTING: _readBias', () => {
    function assertBias(overrides: any, expected: string) {
        const originalX = installMockX(makeBaselineAnalysis(overrides), []);
        try {
            const candles = makeUptrendCandles(30);
            const result = Module1.analyze({ history: candles, level: 100 });
            const pass = result.bias === expected;
            return {
                pass,
                info: `overrides=${JSON.stringify(overrides).substring(0, 60)}... → bias="${result.bias}"`
            };
        } finally {
            uninstallMockX(originalX);
        }
    }

    runner.test('trend.primaryTrend="strong_bull" → bullish', () =>
        assertBias({ trend: { primaryTrend: 'strong_bull', strength: 80 } }, 'bullish'));

    runner.test('trend.primaryTrend="strong_bear" → bearish', () =>
        assertBias({ trend: { primaryTrend: 'strong_bear', strength: 80 } }, 'bearish'));

    runner.test('trend.primaryTrend="bull" (regex) → bullish', () =>
        assertBias({ trend: { primaryTrend: 'bull', strength: 50 } }, 'bullish'));

    runner.test('trend.primaryTrend="bearish_market" (regex) → bearish', () =>
        assertBias({ trend: { primaryTrend: 'bearish_market', strength: 50 } }, 'bearish'));

    runner.test('fallback: structure.type=uptrend → bullish', () =>
        assertBias({ trend: null, marketStructure: { type: 'uptrend', higherHighs: [], higherLows: [], lowerHighs: [], lowerLows: [], swings: [], structureShift: null, summary: '' } }, 'bullish'));

    runner.test('fallback: structure.type=downtrend → bearish', () =>
        assertBias({ trend: null, marketStructure: { type: 'downtrend', higherHighs: [], higherLows: [], lowerHighs: [], lowerLows: [], swings: [], structureShift: null, summary: '' } }, 'bearish'));

    runner.test('fallback: structure.type=range → neutral', () =>
        assertBias({ trend: null, marketStructure: { type: 'range', higherHighs: [], higherLows: [], lowerHighs: [], lowerLows: [], swings: [], structureShift: null, summary: '' } }, 'neutral'));

    runner.test('fallback: ни trend, ни структура → neutral', () =>
        assertBias({ trend: null, marketStructure: null }, 'neutral'));

    runner.test('trend не содержит bull/bear → fallback на structure', () =>
        assertBias({ trend: { primaryTrend: 'neutral' }, marketStructure: { type: 'downtrend', higherHighs: [], higherLows: [], lowerHighs: [], lowerLows: [], swings: [], structureShift: null, summary: '' } }, 'bearish'));
});

// ------------------------------------------------------------
// SUITE 5 — _readConfidence
// ------------------------------------------------------------
runner.suite('FORMATTING: _readConfidence', () => {
    function assertConfidence(confidence: any, expected: number | null) {
        const originalX = installMockX(makeBaselineAnalysis({ confidence }), []);
        try {
            const candles = makeUptrendCandles(30);
            const result = Module1.analyze({ history: candles, level: 100 });
            const pass = result.confidence === expected;
            return {
                pass,
                info: `confidence=${JSON.stringify(confidence)} → result.confidence=${result.confidence}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    }

    runner.test('число 80 → 80', () => assertConfidence(80, 80));
    runner.test('число 65.7 → 66', () => assertConfidence(65.7, 66));
    runner.test('object{percent: 73} → 73', () => assertConfidence({ percent: 73 }, 73));
    runner.test('object{percent: 73.4} → 73', () => assertConfidence({ percent: 73.4 }, 73));
    runner.test('object{value: 0.8} → 80', () => assertConfidence({ value: 0.8 }, 80));
    runner.test('object{value: 0.756} → 76', () => assertConfidence({ value: 0.756 }, 76));
    runner.test('object{percent:80,value:0.9} → приоритет у percent', () =>
        assertConfidence({ percent: 80, value: 0.9 }, 80));
    runner.test('object{} (пустой) → null', () => assertConfidence({}, null));
    runner.test('null → null', () => assertConfidence(null, null));
    runner.test('undefined → null', () => assertConfidence(undefined, null));
});

// ------------------------------------------------------------
// SUITE 6 — _readContinuationPct / _readReversalPct
// ------------------------------------------------------------
runner.suite('FORMATTING: _readContinuationPct и _readReversalPct', () => {
    function assertProbabilities(p: any, expectedCont: number | null, expectedRev: number | null) {
        const originalX = installMockX(makeBaselineAnalysis({ probabilities: p }), []);
        try {
            const candles = makeUptrendCandles(30);
            const result = Module1.analyze({ history: candles, level: 100 });
            const pass =
                result.probabilities?.continuation === expectedCont &&
                result.probabilities?.reversal === expectedRev;
            return {
                pass,
                info: `p=${JSON.stringify(p)} → result.prob=${JSON.stringify(result.probabilities)}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    }

    runner.test('доля 0.7 → continuation=70, reversal=30', () =>
        assertProbabilities({ continuation: 0.7, reversal: 0.3 }, 70, 30));

    runner.test('проценты 70 → continuation=70, reversal=30', () =>
        assertProbabilities({ continuation: 70, reversal: 30 }, 70, 30));

    runner.test('null → continuation=null, reversal=null', () =>
        assertProbabilities(null, null, null));

    runner.test('{} → continuation=null, reversal=null', () =>
        assertProbabilities({}, null, null));

    runner.test('partial {continuation: 0.55} → cont=55, rev=null', () =>
        assertProbabilities({ continuation: 0.55 }, 55, null));

    runner.test('точная граница 0.5 → 50', () =>
        assertProbabilities({ continuation: 0.5 }, 50, null));
});

// ------------------------------------------------------------
// SUITE 7 — _readContext
// ------------------------------------------------------------
runner.suite('FORMATTING: _readContext', () => {
    function assertContext(overrides: any, expected: string) {
        const originalX = installMockX(makeBaselineAnalysis(overrides), []);
        try {
            const candles = makeUptrendCandles(30);
            const result = Module1.analyze({ history: candles, level: 100 });
            return {
                pass: result.context === expected,
                info: `overrides=${JSON.stringify(overrides).substring(0, 80)}... → context="${result.context}"`
            };
        } finally {
            uninstallMockX(originalX);
        }
    }

    runner.test('marketPhase.phase="trending" → "trending"', () =>
        assertContext({ marketPhase: { phase: 'trending' }, marketStructure: { type: 'range', higherHighs: [], higherLows: [], lowerHighs: [], lowerLows: [], swings: [], structureShift: null, summary: '' } }, 'trending'));

    runner.test('без marketPhase, structure.type=range → "range"', () =>
        assertContext({ marketPhase: null, marketStructure: { type: 'range', higherHighs: [], higherLows: [], lowerHighs: [], lowerLows: [], swings: [], structureShift: null, summary: '' } }, 'range'));

    runner.test('без marketPhase, structure.type=uptrend → "uptrend"', () =>
        assertContext({ marketPhase: null, marketStructure: { type: 'uptrend', higherHighs: [], higherLows: [], lowerHighs: [], lowerLows: [], swings: [], structureShift: null, summary: '' } }, 'uptrend'));

    runner.test('всё null/undefined → "unknown"', () =>
        assertContext({ marketPhase: null, marketStructure: null }, 'unknown'));

    runner.test('marketPhase с phase=null → fallback на structure', () =>
        assertContext({ marketPhase: { phase: null }, marketStructure: { type: 'downtrend', higherHighs: [], higherLows: [], lowerHighs: [], lowerLows: [], swings: [], structureShift: null, summary: '' } }, 'downtrend'));
});

// ------------------------------------------------------------
// SUITE 8 — _readKeySignals
// ------------------------------------------------------------
runner.suite('FORMATTING: _readKeySignals', () => {
    function assertKeySignals(overrides: any, predicate: (signals: string[]) => boolean, info: string) {
        const originalX = installMockX(makeBaselineAnalysis(overrides), []);
        try {
            const candles = makeUptrendCandles(30);
            const result = Module1.analyze({ history: candles, level: 100 });
            const signals = result.keySignals || [];
            const pass = Array.isArray(signals) && predicate(signals);
            return {
                pass,
                info: `${info} → [${signals.join(', ')}]`
            };
        } finally {
            uninstallMockX(originalX);
        }
    }

    runner.test('evidence.keySignals пробрасываются', () =>
        assertKeySignals(
            { evidence: { keySignals: ['a', 'b', 'c'] } },
            s => s.includes('a') && s.includes('b') && s.includes('c'),
            'evidence.keySignals=["a","b","c"]'
        ));

    runner.test('smartMoney.bos=true → "bos_detected"', () =>
        assertKeySignals({ smartMoney: { bos: true } },
            s => s.includes('bos_detected'),
            'smartMoney.bos=true'));

    runner.test('smartMoney.choch=true → "choch_detected"', () =>
        assertKeySignals({ smartMoney: { choch: true } },
            s => s.includes('choch_detected'),
            'smartMoney.choch=true'));

    runner.test('smartMoney.orderBlocks.length>0 → "order_block_present"', () =>
        assertKeySignals({ smartMoney: { orderBlocks: [{ price: 100 }] } },
            s => s.includes('order_block_present'),
            'smartMoney.orderBlocks'));

    runner.test('smartMoney.fairValueGaps.length>0 → "fvg_present"', () =>
        assertKeySignals({ smartMoney: { fairValueGaps: [{ low: 1, high: 2 }] } },
            s => s.includes('fvg_present'),
            'smartMoney.fairValueGaps'));

    runner.test('priceAction.patterns.length>0 → "price_action_pattern"', () =>
        assertKeySignals({ priceAction: { patterns: ['pin_bar'] } },
            s => s.includes('price_action_pattern'),
            'priceAction.patterns'));

    runner.test('momentum.signal="strong_bull" → "strong_bullish_momentum"', () =>
        assertKeySignals({ momentum: { signal: 'strong_bull', rsi: 70 } },
            s => s.includes('strong_bullish_momentum'),
            'momentum.signal=strong_bull'));

    runner.test('momentum.signal="strong_bear" → "strong_bearish_momentum"', () =>
        assertKeySignals({ momentum: { signal: 'strong_bear', rsi: 30 } },
            s => s.includes('strong_bearish_momentum'),
            'momentum.signal=strong_bear'));

    runner.test('marketStructure.type=range → "range_structure"', () =>
        assertKeySignals({ marketStructure: { type: 'range', higherHighs: [], higherLows: [], lowerHighs: [], lowerLows: [], swings: [], structureShift: null, summary: '' } },
            s => s.includes('range_structure'),
            'structure=range'));

    runner.test('marketStructure.type=uptrend → "uptrend_structure"', () =>
        assertKeySignals({ marketStructure: { type: 'uptrend', higherHighs: [], higherLows: [], lowerHighs: [], lowerLows: [], swings: [], structureShift: null, summary: '' } },
            s => s.includes('uptrend_structure'),
            'structure=uptrend'));

    runner.test('volume.signal=climax → "volume_climax"', () =>
        assertKeySignals({ volume: { signal: 'climax', ratio: 2.5, current: 1500, average: 1000, description: '' } },
            s => s.includes('volume_climax'),
            'volume.signal=climax'));

    runner.test('volume.signal=low → "low_volume"', () =>
        assertKeySignals({ volume: { signal: 'low', ratio: 0.5, current: 500, average: 1000, description: '' } },
            s => s.includes('low_volume'),
            'volume.signal=low'));

    runner.test('пустой AnalysisResult → пустой массив', () =>
        assertKeySignals({
            evidence: { keySignals: [] },
            smartMoney: {},
            priceAction: { patterns: [] },
            momentum: { signal: 'neutral' },
            marketStructure: { type: 'unknown', higherHighs: [], higherLows: [], lowerHighs: [], lowerLows: [], swings: [], structureShift: null, summary: '' },
            volume: { signal: 'neutral' }
        }, s => s.length === 0, 'всё пустое/нейтральное'));
});

// ------------------------------------------------------------
// SUITE 9 — _buildReasons (формирование reasons[])
// ------------------------------------------------------------
runner.suite('FORMATTING: _buildReasons', () => {
    function getReasons(overrides: any): string[] {
        const originalX = installMockX(makeBaselineAnalysis(overrides), []);
        try {
            const candles = makeUptrendCandles(30);
            const result = Module1.analyze({ history: candles, level: 100 });
            return result.reasons || [];
        } finally {
            uninstallMockX(originalX);
        }
    }

    runner.test('reasons всегда содержит "Структура: ..."', () => {
        const reasons = getReasons({});
        const pass = reasons.some(r => r.startsWith('Структура:'));
        return { pass, info: `Структура reason: ${reasons.find(r => r.startsWith('Структура:'))}` };
    });

    runner.test('структура в reasons содержит HH/HL/LH/LL counts', () => {
        const reasons = getReasons({
            marketStructure: {
                type: 'uptrend',
                higherHighs: [{}, {}],
                higherLows: [{}],
                lowerHighs: [{}, {}, {}],
                lowerLows: [{}, {}, {}, {}],
                swings: [],
                structureShift: null,
                summary: ''
            }
        });
        const structureReason = reasons.find(r => r.startsWith('Структура:')) || '';
        const pass = structureReason.includes('HH=2') && structureReason.includes('HL=1') &&
                      structureReason.includes('LH=3') && structureReason.includes('LL=4');
        return {
            pass,
            info: `structureReason="${structureReason}"`
        };
    });

    runner.test('моментум в reasons содержит signal и RSI', () => {
        const reasons = getReasons({ momentum: { signal: 'bullish', rsi: 64, value: 0.64 } });
        const momentumReason = reasons.find(r => r.startsWith('Моментум:')) || '';
        return {
            pass: momentumReason.includes('RSI=64'),
            info: `momentumReason="${momentumReason}"`
        };
    });

    runner.test('объём в reasons содержит ratio', () => {
        const reasons = getReasons({ volume: { signal: 'high', ratio: 1.85, current: 1850, average: 1000, description: 'High' } });
        const volReason = reasons.find(r => r.startsWith('Объём:')) || '';
        return {
            pass: volReason.includes('ratio=1.85') && volReason.includes('High'),
            info: `volReason="${volReason}"`
        };
    });

    runner.test('волатильность в reasons содержит ATR', () => {
        const reasons = getReasons({ volatility: { signal: 'medium', atr: 2.34, atrPercent: 2.5, description: 'Normal' } });
        const vltReason = reasons.find(r => r.startsWith('Волатильность:')) || '';
        return {
            pass: vltReason.includes('ATR=2.34') && vltReason.includes('Normal'),
            info: `vltReason="${vltReason}"`
        };
    });

    runner.test('фаза рынка добавляется в reasons', () => {
        const reasons = getReasons({ marketPhase: { phase: 'expansion' } });
        const phaseReason = reasons.find(r => r.startsWith('Фаза рынка:')) || '';
        return {
            pass: phaseReason.includes('expansion'),
            info: `phaseReason="${phaseReason}"`
        };
    });

    runner.test('вероятность продолжения добавляется в reasons', () => {
        const reasons = getReasons({ probabilities: { continuation: 0.65, reversal: 0.35 } });
        const probReason = reasons.find(r => r.startsWith('Вероятность продолжения')) || '';
        return {
            pass: probReason.includes('65%'),
            info: `probReason="${probReason}"`
        };
    });

    runner.test('confluence score добавляется в reasons', () => {
        const reasons = getReasons({ confluence: { score: 8, grade: 'A+' } });
        const confReason = reasons.find(r => r.startsWith('Confluence')) || '';
        return {
            pass: confReason.includes('8') && confReason.includes('A+'),
            info: `confReason="${confReason}"`
        };
    });

    runner.test('reasons — это массив строк', () => {
        const reasons = getReasons({});
        const pass = Array.isArray(reasons) && reasons.every(r => typeof r === 'string');
        return {
            pass,
            info: `count=${reasons.length}, all strings=${pass}`
        };
    });
});

// ------------------------------------------------------------
// SUITE 10 — Структура выходного объекта
// ------------------------------------------------------------
runner.suite('OUTPUT: полная структура результата', () => {
    runner.test('Все базовые поля присутствуют', () => {
        const originalX = installMockX(makeBaselineAnalysis(), []);
        try {
            const candles = makeUptrendCandles(30);
            const result = Module1.analyze({ history: candles, level: 100 });

            const required = [
                'context', 'bias', 'confidence', 'reasons',
                'structure', 'momentum', 'volume', 'volatility',
                'levels', 'levelPosition', 'probabilities', 'keySignals',
                'extended', 'moduleXOutput', 'meta'
            ];
            const missing = required.filter(k => !(k in result));
            return {
                pass: missing.length === 0,
                info: missing.length === 0
                    ? `Все ${required.length} полей присутствуют ✓`
                    : `Отсутствуют: ${missing.join(', ')}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('extended содержит все 15 под-секций Module X', () => {
        const originalX = installMockX(makeBaselineAnalysis(), []);
        try {
            const candles = makeUptrendCandles(30);
            const result = Module1.analyze({ history: candles, level: 100 });

            const required = [
                'structure', 'trend', 'smartMoney', 'priceAction',
                'liquidity', 'supportResistance', 'momentum', 'probability',
                'scenarios', 'confidence', 'confluence', 'riskAssessment',
                'invalidation', 'marketPhase', 'executionPlan'
            ];
            const missing = required.filter(s => !(s in result.extended));
            return {
                pass: missing.length === 0,
                info: missing.length === 0
                    ? 'Все 15 секций проброшены ✓'
                    : `Отсутствуют: ${missing.join(', ')}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('structure содержит higherHighs, higherLows, lowerHighs, lowerLows, swings', () => {
        const originalX = installMockX(makeBaselineAnalysis(), []);
        try {
            const candles = makeUptrendCandles(30);
            const result = Module1.analyze({ history: candles, level: 100 });
            const struct = result.structure;
            const required = ['type', 'label', 'higherHighs', 'higherLows', 'lowerHighs', 'lowerLows', 'swings', 'structureShift', 'summary'];
            const missing = required.filter(k => !(k in struct));
            return {
                pass: missing.length === 0 && Array.isArray(struct.higherHighs),
                info: missing.length === 0
                    ? 'Все поля structure заполнены ✓'
                    : `Отсутствуют: ${missing.join(', ')}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('levels содержит support[] и resistance[]', () => {
        const originalX = installMockX(makeBaselineAnalysis({
            supportResistance: {
                supports: [{ price: 95, strength: 0.8 }, { price: 92, strength: 0.6 }],
                resistances: [{ price: 115, strength: 0.9 }]
            }
        }), []);
        try {
            const candles = makeUptrendCandles(30);
            const result = Module1.analyze({ history: candles, level: 100 });
            const pass =
                Array.isArray(result.levels.support) &&
                result.levels.support.length === 2 &&
                result.levels.support[0].price === 95 &&
                result.levels.resistance.length === 1 &&
                result.levels.resistance[0].price === 115;
            return {
                pass,
                info: `support=${result.levels.support.length}, resistance=${result.levels.resistance.length}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });
});

// ------------------------------------------------------------
// SUITE 11 — Level Position Math
// ------------------------------------------------------------
runner.suite('LOGIC: вычисление position относительно level', () => {
    runner.test('close > level (последняя свеча выше уровня) → above_level, distancePct > 0', () => {
        const originalX = installMockX(makeBaselineAnalysis(), []);
        try {
            // Last candle close = 110, level = 100 → +10%
            const candles = makeCandlesFlat(30, 110);
            const result = Module1.analyze({ history: candles, level: 100 });
            const pos = result.levelPosition;
            const pass =
                pos.position === 'above_level' &&
                Math.abs(pos.distancePct - 10) < 0.001;
            return {
                pass,
                info: `pos=${JSON.stringify(pos)}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('close < level → below_level, distancePct < 0', () => {
        const originalX = installMockX(makeBaselineAnalysis(), []);
        try {
            const candles = makeCandlesFlat(30, 90);
            const result = Module1.analyze({ history: candles, level: 100 });
            const pos = result.levelPosition;
            const pass =
                pos.position === 'below_level' &&
                Math.abs(pos.distancePct - (-10)) < 0.001;
            return {
                pass,
                info: `pos=${JSON.stringify(pos)}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('close ≈ level (в пределах 0.1%) → at_level', () => {
        const originalX = installMockX(makeBaselineAnalysis(), []);
        try {
            const candles = makeCandlesFlat(30, 100); // exactly at level
            const result = Module1.analyze({ history: candles, level: 100 });
            const pos = result.levelPosition;
            return {
                pass: pos.position === 'at_level',
                info: `pos=${JSON.stringify(pos)}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('без level → levelPosition = null', () => {
        const originalX = installMockX(makeBaselineAnalysis(), []);
        try {
            const candles = makeUptrendCandles(30);
            const result = Module1.analyze({ history: candles }); // no level
            return {
                pass: result.levelPosition === null,
                info: `levelPosition=${JSON.stringify(result.levelPosition)}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('currentPrice округляется до 2 знаков', () => {
        const originalX = installMockX(makeBaselineAnalysis(), []);
        try {
            const candles: Candle[] = [{
                time: 0, open: 100.45678, high: 101, low: 99, close: 100.45678, volume: 1000
            }];
            const result = Module1.analyze({ history: candles, level: 100 });
            const pass = result.meta.currentPrice === 100.46;
            return {
                pass,
                info: `currentPrice=${result.meta.currentPrice} (ожидалось 100.46)`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });
});

// ------------------------------------------------------------
// SUITE 12 — Edge cases: пустые и ошибочные входы
// ------------------------------------------------------------
runner.suite('EDGE CASES: обработка ошибок', () => {
    runner.test('history = [] → throws "history is empty"', () => {
        try {
            Module1.analyze({ history: [], level: 100 });
            return { pass: false, info: 'Ожидалась ошибка, но её не было' };
        } catch (e: any) {
            return {
                pass: e.message.includes('history is empty'),
                info: `Поймана ошибка: ${e.message}`
            };
        }
    });

    runner.test('input = undefined → throws "history is empty"', () => {
        try {
            (Module1.analyze as any)(undefined);
            return { pass: false, info: 'Ожидалась ошибка, но её не было' };
        } catch (e: any) {
            return {
                pass: e.message.includes('history is empty'),
                info: `Поймана ошибка: ${e.message}`
            };
        }
    });

    runner.test('input = {} → throws "history is empty"', () => {
        try {
            Module1.analyze({} as any);
            return { pass: false, info: 'Ожидалась ошибка, но её не было' };
        } catch (e: any) {
            return {
                pass: e.message.includes('history is empty'),
                info: `Поймана ошибка: ${e.message}`
            };
        }
    });

    runner.test('coreAnalysisEngine недоступен → throws "is not available"', () => {
        const originalX = ctx.coreAnalysisEngine;
        ctx.coreAnalysisEngine = undefined;
        try {
            const candles = makeUptrendCandles(50);
            Module1.analyze({ history: candles, level: 100 });
            return { pass: false, info: 'Ожидалась ошибка, но её не было' };
        } catch (e: any) {
            const pass = e.message.includes('coreAnalysisEngine') && e.message.includes('not available');
            return {
                pass,
                info: pass ? `Поймана ошибка: ${e.message}` : `Другая ошибка: ${e.message}`
            };
        } finally {
            ctx.coreAnalysisEngine = originalX;
        }
    });

    runner.test('coreAnalysisEngine.analyzeMarket не функция → throws "is not available"', () => {
        const originalX = ctx.coreAnalysisEngine;
        ctx.coreAnalysisEngine = { analyzeMarket: 'not_a_function' };
        try {
            const candles = makeUptrendCandles(50);
            Module1.analyze({ history: candles, level: 100 });
            return { pass: false, info: 'Ожидалась ошибка, но её не было' };
        } catch (e: any) {
            return {
                pass: e.message.includes('is not available'),
                info: `Поймана ошибка: ${e.message}`
            };
        } finally {
            ctx.coreAnalysisEngine = originalX;
        }
    });

    runner.test('Module X возвращает null → Module 1 возвращает null', () => {
        const originalX = installMockX(null, []);
        try {
            const candles = makeUptrendCandles(50);
            const result = Module1.analyze({ history: candles, level: 100 });
            return {
                pass: result === null,
                info: `result=${result}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('Module X возвращает {error: "..."} → throws "Module X error: ..."', () => {
        const originalX = installMockX({ error: 'Not enough candles' }, []);
        try {
            const candles = makeUptrendCandles(50);
            Module1.analyze({ history: candles, level: 100 });
            return { pass: false, info: 'Ожидалась ошибка, но её не было' };
        } catch (e: any) {
            const pass = e.message.includes('Module X error') && e.message.includes('Not enough candles');
            return {
                pass,
                info: pass ? `Поймана ошибка: ${e.message}` : `Другая ошибка: ${e.message}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('Частичный AnalysisResult (только error=null и structure) → остальные поля optional', () => {
        const originalX = installMockX({
            error: null,
            marketStructure: {
                type: 'range',
                higherHighs: [],
                higherLows: [],
                lowerHighs: [],
                lowerLows: [],
                swings: [],
                structureShift: null,
                summary: ''
            }
            // всё остальное undefined
        }, []);
        try {
            const candles = makeUptrendCandles(30);
            const result = Module1.analyze({ history: candles, level: 100 });
            const pass =
                result.context === 'range' &&
                result.bias === 'neutral' &&
                result.confidence === null &&
                Array.isArray(result.reasons) &&
                result.probabilities.continuation === null &&
                result.probabilities.reversal === null;
            return {
                pass,
                info: `context=${result.context}, bias=${result.bias}, confidence=${result.confidence}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('Минимальный AnalysisResult → meta.candlesCount корректен', () => {
        const originalX = installMockX(makeBaselineAnalysis(), []);
        try {
            const candles = makeUptrendCandles(42);
            const result = Module1.analyze({ history: candles, level: 100 });
            return {
                pass: result.meta.candlesCount === 42,
                info: `candlesCount=${result.meta.candlesCount} (ожидалось 42)`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });
});

// ------------------------------------------------------------
// SUITE 13 — Round-trip через factory-функцию
// ------------------------------------------------------------
runner.suite('FACTORY: dynamic mock factory', () => {
    runner.test('factory может возвращать разный результат для разных inputs', () => {
        const callLog: CallRecord[] = [];
        const factory = (input: any) => {
            // Возвращаем разный уровень в зависимости от candlesLength
            if (input.candles.length < 30) {
                return makeBaselineAnalysis({ marketStructure: { type: 'range', higherHighs: [], higherLows: [], lowerHighs: [], lowerLows: [], swings: [], structureShift: null, summary: 'few candles' } });
            }
            return makeBaselineAnalysis({ marketStructure: { type: 'uptrend', higherHighs: [{}], higherLows: [{}], lowerHighs: [], lowerLows: [], swings: [], structureShift: null, summary: 'enough candles' } });
        };
        const originalX = installMockX(factory, callLog);
        try {
            const r1 = Module1.analyze({ history: makeUptrendCandles(15), level: 100 });
            const r2 = Module1.analyze({ history: makeUptrendCandles(50), level: 100 });
            const pass =
                r1.structure.type === 'range' &&
                r2.structure.type === 'uptrend' &&
                callLog.length === 2;
            return {
                pass,
                info: `r1=${r1.structure.type}, r2=${r2.structure.type}, calls=${callLog.length}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });
});

// ============================================================
// 5. ЗАПУСК
// ============================================================

runner.report();

// Exit code для CI
const failed = runner.results.filter(r => !r.passed).length;
process.exit(failed === 0 ? 0 : 1);
