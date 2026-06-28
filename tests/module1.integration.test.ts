// ============================================================
// Module 1 — Интеграционные тесты после интеграции с Module X
// ============================================================
// Цель: доказать, что MarketAnalysisEngine (Module 1):
//   1. НЕ содержит собственного анализа графика
//   2. Только вызывает coreAnalysisEngine.analyzeMarket()
//   3. Только читает поля AnalysisResult
//   4. Корректно форматирует описание рынка
// ============================================================

export {};

// ----- Простой тест-фреймворк -----
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
        const totalDuration = this.results.reduce((s, r) => s + r.duration, 0);

        console.log(`\n${'═'.repeat(70)}`);
        console.log(`  ИТОГОВЫЙ ОТЧЁТ — MODULE 1`);
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
console.log('║  MODULE 1 — ТЕСТЫ ИНТЕГРАЦИИ С MODULE X                          ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

console.log('[Загрузка] Загрузка Module 1 (MarketAnalysisEngine.js)...');
const fs = require('fs');

// Загружаем production Module X как реальный источник AnalysisResult
const coreXCode = fs.readFileSync('/workspace/public/js/coreAnalysisEngine.js', 'utf8');

// Загружаем Module 1
const module1Code = fs.readFileSync('/workspace/public/js/MarketAnalysisEngine.js', 'utf8');

// Создаём общий "песочницу" с window, global, globalThis, указывающими на один объект.
// Это имитирует поведение браузера, где у кода в <script> один и тот же globalThis.
const sharedGlobal: any = {
    coreAnalysisEngine: undefined,
    MarketAnalysisEngine: undefined
};

// Загружаем код через Function, передавая sharedGlobal как globalThis
const wrapper = `
(function () {
    var window = this;
    var global = this;
    var globalThis = this;

    // Загружаем Module X
    ${coreXCode}

    // Загружаем Module 1
    ${module1Code}

    this.MarketAnalysisEngine = (typeof MarketAnalysisEngine !== 'undefined') ? MarketAnalysisEngine : this.MarketAnalysisEngine;
    this.coreAnalysisEngine = (typeof coreAnalysisEngine !== 'undefined') ? coreAnalysisEngine : this.coreAnalysisEngine;
}).call(this);
`;

const wrapperFn = new Function(wrapper);
wrapperFn.call(sharedGlobal);

const Module1 = sharedGlobal.MarketAnalysisEngine;
const ModuleX = sharedGlobal.coreAnalysisEngine;

console.log('[Загрузка] Module 1 загружен ✓');
console.log('[Загрузка] Module X загружен ✓');
console.log(`[Проверка] Module X имеет analyzeMarket: ${typeof ModuleX?.analyzeMarket === 'function'}`);
console.log(`[Проверка] Module 1 имеет analyze: ${typeof Module1?.analyze === 'function'}`);

// ============================================================
// 2. ТЕСТОВЫЕ СВЕЧИ
// ============================================================

interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

function makeUptrendCandles(n: number): Candle[] {
    const candles: Candle[] = [];
    let price = 100;
    for (let i = 0; i < n; i++) {
        const open = price;
        const close = price + (0.6 + (i % 5) * 0.05);
        const high = close + 0.2;
        const low = open - 0.2;
        const vol = 1000 + (i % 3) * 50;
        candles.push({ time: i * 3600000, open, high, low, close, volume: vol });
        price = close;
    }
    return candles;
}

function makeDowntrendCandles(n: number): Candle[] {
    const candles: Candle[] = [];
    let price = 200;
    for (let i = 0; i < n; i++) {
        const open = price;
        const close = price - (0.6 + (i % 5) * 0.05);
        const high = open + 0.2;
        const low = close - 0.2;
        const vol = 1000 + (i % 3) * 50;
        candles.push({ time: i * 3600000, open, high, low, close, volume: vol });
        price = close;
    }
    return candles;
}

// ============================================================
// 3. STUB ДЛЯ Module X
// ============================================================

/**
 * Создаёт mock-реализацию coreAnalysisEngine, которая записывает вызовы
 * и возвращает предопределённый AnalysisResult.
 */
function createMockModuleX(callLog: any[] = []) {
    return {
        analyzeMarket: function (input: any) {
            callLog.push({
                method: 'analyzeMarket',
                input: { historyLength: input.history?.length, level: input.level },
                ts: Date.now()
            });
            return {
                moduleXVersion: '1.0',
                analyzedAt: new Date().toISOString(),
                inputMeta: { candleCount: (input.history || []).length, level: input.level },
                structure: { type: 'uptrend', hh: 4, hl: 3, lh: 0, ll: 0, structureShift: null, swings: [] },
                smc: { bos: [], choch: [], orderBlocks: [], fairValueGaps: [], liquiditySweeps: [], displacement: [], buySideLiquidity: [], sellSideLiquidity: [], premiumZone: null, discountZone: null },
                priceAction: { patterns: [] },
                trend: { type: 'strong_bull', strength: 80 },
                momentum: { strength: 75, description: 'Сильный моментум', rsi: 65, history: [], divergence: null, acceleration: null },
                volume: { ratio: 1.2, current: 1200, average: 1000, description: 'Объём выше среднего' },
                liquidity: {},
                volatility: { atr: 1.5, atrPercent: 1.5, level: 'medium', description: 'Средняя волатильность' },
                levels: { supports: [{ price: 95, strength: 0.8 }], resistances: [{ price: 110, strength: 0.7 }] },
                probability: { bullish: 70, bearish: 30, confidence: 70 },
                scenarios: [],
                interpretations: {
                    structureLabel: 'uptrend',
                    momentumSignal: 'bullish',
                    volumeTrend: 'increasing',
                    volatilitySignal: 'stable',
                    position: { level: 100, distancePct: 5, position: 'above_level' }
                },
                summary: {
                    context: 'uptrend',
                    bias: 'bullish',
                    confidence: 75,
                    keySignals: ['uptrend_structure', 'strong_bullish_momentum'],
                    reasons: ['Test reason'],
                    probabilities: { continuation: 70, reversal: 30 }
                }
            };
        }
    };
}

/**
 * Подменяет coreAnalysisEngine в shared global на mock.
 */
function installMockX(callLog: any[] = []) {
    const original = sharedGlobal.coreAnalysisEngine;
    sharedGlobal.coreAnalysisEngine = createMockModuleX(callLog);
    return original;
}

function uninstallMockX(original: any) {
    sharedGlobal.coreAnalysisEngine = original;
}

// ============================================================
// 4. ТЕСТЫ
// ============================================================

const runner = new Module1TestRunner();

runner.suite('ARCHITECTURE: Module 1 не выполняет собственный анализ', () => {
    runner.test('В исходном коде Module 1 нет собственных аналитических функций', () => {
        const src = fs.readFileSync('/workspace/public/js/MarketAnalysisEngine.js', 'utf8');

        // Запрещённые паттерны: собственная аналитика графика
        const forbiddenPatterns = [
            /function\s+\w*[Tt]rend\s*\(/,
            /function\s+\w*[Bb]OS\s*\(/,
            /function\s+\w*[Cc]HoCH\s*\(/,
            /function\s+\w*[Mm]omentum\s*\(/,
            /function\s+\w*[Vv]olume[Aa]nalyze\s*\(/,
            /function\s+\w*RSI\s*\(/,
            /function\s+\w*[Pp]inBar\s*\(/,
            /function\s+\w*[Ss]wing[s]?\s*\(/,
            /calculateRSI\s*\(/,
            /calculateMACD\s*\(/,
            /findSwings\s*\(/,
            /detectStructure/,
            /findBOS/,
            /findFVG/,
        ];

        const violations: string[] = [];
        for (const p of forbiddenPatterns) {
            const m = src.match(p);
            if (m) violations.push(`${p.toString()}: ${m[0].substring(0, 50)}`);
        }

        return {
            pass: violations.length === 0,
            info: violations.length === 0
                ? 'Нет собственной аналитики ✓'
                : `Найдены нарушения: ${violations.length}\n${violations.join('\n')}`
        };
    });

    runner.test('В исходном коде Module 1 есть вызов analyzeMarket', () => {
        const src = fs.readFileSync('/workspace/public/js/MarketAnalysisEngine.js', 'utf8');
        const hasCall = /\.analyzeMarket\s*\(/.test(src);
        return {
            pass: hasCall,
            info: hasCall ? 'analyzeMarket() вызывается ✓' : 'analyzeMarket() НЕ вызывается'
        };
    });
});

runner.suite('DATA FLOW: Module 1 вызывает Module X и читает AnalysisResult', () => {
    runner.test('Module 1 вызывает coreAnalysisEngine.analyzeMarket()', () => {
        const callLog: any[] = [];
        const originalX = installMockX(callLog);

        try {
            const candles = makeUptrendCandles(50);
            Module1.analyze({ history: candles, level: 105 });

            return {
                pass: callLog.length > 0 && callLog[0].method === 'analyzeMarket',
                info: callLog.length > 0
                    ? `analyzeMarket() вызван ${callLog.length} раз(а) ✓`
                    : 'analyzeMarket() НЕ был вызван'
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('Module 1 передаёт history.length и level в analyzeMarket', () => {
        const callLog: any[] = [];
        const originalX = installMockX(callLog);

        try {
            const candles = makeUptrendCandles(60);
            Module1.analyze({ history: candles, level: 110 });

            const lastCall = callLog[callLog.length - 1];
            const pass = lastCall?.input?.historyLength === 60 && lastCall?.input?.level === 110;

            return {
                pass,
                info: pass
                    ? `Передано history.length=60, level=110 ✓`
                    : `Передано history.length=${lastCall?.input?.historyLength}, level=${lastCall?.input?.level}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('Module 1 возвращает context/bias/confidence из summary', () => {
        const callLog: any[] = [];
        const originalX = installMockX(callLog);

        try {
            const candles = makeUptrendCandles(50);
            const result = Module1.analyze({ history: candles, level: 105 });

            const pass = result.context === 'uptrend'
                      && result.bias === 'bullish'
                      && result.confidence === 75;

            return {
                pass,
                info: `context=${result.context}, bias=${result.bias}, confidence=${result.confidence}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('Module 1 возвращает structure из AnalysisResult', () => {
        const callLog: any[] = [];
        const originalX = installMockX(callLog);

        try {
            const candles = makeUptrendCandles(50);
            const result = Module1.analyze({ history: candles, level: 105 });

            const pass = result.structure
                      && result.structure.structure === 'uptrend'
                      && result.structure.hh === 4
                      && result.structure.hl === 3;

            return {
                pass,
                info: `structure=${result.structure?.structure}, hh=${result.structure?.hh}, hl=${result.structure?.hl}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('Module 1 возвращает momentum из AnalysisResult', () => {
        const callLog: any[] = [];
        const originalX = installMockX(callLog);

        try {
            const candles = makeUptrendCandles(50);
            const result = Module1.analyze({ history: candles, level: 105 });

            const pass = result.momentum
                      && result.momentum.rsi === 65
                      && result.momentum.signal === 'bullish';

            return {
                pass,
                info: `rsi=${result.momentum?.rsi}, signal=${result.momentum?.signal}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('Module 1 возвращает levels из AnalysisResult', () => {
        const callLog: any[] = [];
        const originalX = installMockX(callLog);

        try {
            const candles = makeUptrendCandles(50);
            const result = Module1.analyze({ history: candles, level: 105 });

            const pass = result.levels
                      && Array.isArray(result.levels.support)
                      && Array.isArray(result.levels.resistance)
                      && result.levels.support.length === 1
                      && result.levels.resistance.length === 1;

            return {
                pass,
                info: `support=${result.levels?.support?.length}, resistance=${result.levels?.resistance?.length}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('Module 1 пробрасывает Module X output через moduleXOutput', () => {
        const callLog: any[] = [];
        const originalX = installMockX(callLog);

        try {
            const candles = makeUptrendCandles(50);
            const result = Module1.analyze({ history: candles, level: 105 });

            const pass = Boolean(result.moduleXOutput)
                      && Boolean(result.moduleXOutput?.summary)
                      && Boolean(result.moduleXOutput?.structure);

            return {
                pass,
                info: pass ? 'moduleXOutput проброшен ✓' : 'moduleXOutput отсутствует'
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('meta.poweredBy указывает Module X', () => {
        const callLog: any[] = [];
        const originalX = installMockX(callLog);

        try {
            const candles = makeUptrendCandles(50);
            const result = Module1.analyze({ history: candles, level: 105 });

            const pass = result.meta?.poweredBy === 'Module X (coreAnalysisEngine)';

            return {
                pass,
                info: `poweredBy=${result.meta?.poweredBy}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });
});

runner.suite('FORMATTING: Module 1 корректно формирует описание', () => {
    runner.test('reasons содержит описание структуры', () => {
        const callLog: any[] = [];
        const originalX = installMockX(callLog);

        try {
            const candles = makeUptrendCandles(50);
            const result = Module1.analyze({ history: candles, level: 105 });

            const hasStructureReason = Array.isArray(result.reasons) && result.reasons.some((r: string) => r.includes('Структура'));
            const hasUptrendText = Array.isArray(result.reasons) && result.reasons.some((r: string) => r.includes('восходящий'));

            return {
                pass: hasStructureReason && hasUptrendText,
                info: hasStructureReason && hasUptrendText
                    ? `reasons=${result.reasons.length}, есть "Структура" и "восходящий" ✓`
                    : `reasons=${JSON.stringify(result.reasons)}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('reasons содержит моментум', () => {
        const callLog: any[] = [];
        const originalX = installMockX(callLog);

        try {
            const candles = makeUptrendCandles(50);
            const result = Module1.analyze({ history: candles, level: 105 });

            const hasMomentum = result.reasons.some((r: string) => r.includes('Моментум'));

            return {
                pass: hasMomentum,
                info: hasMomentum ? 'Моментум присутствует в reasons ✓' : 'Моментум ОТСУТСТВУЕТ'
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('levelPosition форматируется корректно', () => {
        const callLog: any[] = [];
        const originalX = installMockX(callLog);

        try {
            const candles = makeUptrendCandles(50);
            const result = Module1.analyze({ history: candles, level: 100 });

            const pos = result.levelPosition;
            const pass = pos && pos.position === 'above_level' && pos.level === 100 && pos.distancePct === 5;

            return {
                pass,
                info: pass ? `pos=${JSON.stringify(pos)} ✓` : `Некорректная позиция: ${JSON.stringify(pos)}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });

    runner.test('extended содержит все секции из Module X', () => {
        const callLog: any[] = [];
        const originalX = installMockX(callLog);

        try {
            const candles = makeUptrendCandles(50);
            const result = Module1.analyze({ history: candles, level: 105 });

            const sections = ['structureShift', 'swings', 'smc', 'trend', 'liquidity', 'probability', 'scenarios', 'priceAction', 'interpretations'];
            const missing = sections.filter(s => !(s in result.extended));

            return {
                pass: missing.length === 0,
                info: missing.length === 0 ? 'Все 9 секций проброшены ✓' : `Отсутствуют: ${missing.join(', ')}`
            };
        } finally {
            uninstallMockX(originalX);
        }
    });
});

runner.suite('EDGE CASES: обработка ошибок', () => {
    runner.test('Бросает ошибку если history пустой', () => {
        try {
            Module1.analyze({ history: [], level: 100 });
            return { pass: false, info: 'Ожидалась ошибка, но не было' };
        } catch (e: any) {
            return {
                pass: e.message.includes('history is empty'),
                info: `Поймана ошибка: ${e.message}`
            };
        }
    });

    runner.test('Бросает ошибку если coreAnalysisEngine недоступен', () => {
        const originalX = sharedGlobal.coreAnalysisEngine;
        sharedGlobal.coreAnalysisEngine = undefined;

        try {
            const candles = makeUptrendCandles(50);
            Module1.analyze({ history: candles, level: 100 });
            return { pass: false, info: 'Ожидалась ошибка, но не было' };
        } catch (e: any) {
            const isError = e.message.includes('coreAnalysisEngine is not available');
            return {
                pass: isError,
                info: isError ? `Поймана ошибка: ${e.message}` : `Не та ошибка: ${e.message}`
            };
        } finally {
            sharedGlobal.coreAnalysisEngine = originalX;
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
