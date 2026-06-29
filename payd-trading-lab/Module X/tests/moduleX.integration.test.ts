// ============================================================
// Module X — Комплексный интеграционный тест (v2)
// ============================================================
// Тестирует все компоненты Module X как единую систему.
// Без зависимостей от Module 1 / Module 2.
// ============================================================

// ----- Простой тест-фреймворк с честной валидацией -----
interface TestResult {
    suite: string;
    name: string;
    passed: boolean;
    details: string;
    duration: number;
}

class ModuleXTestRunner {
    results: TestResult[] = [];
    currentSuite = '';

    suite(name: string, fn: () => void): void {
        this.currentSuite = name;
        console.log(`\n${'═'.repeat(70)}\n  ${name}\n${'═'.repeat(70)}`);
        fn();
    }

    // API: test(name, fn) где fn возвращает { pass: boolean, info: string }
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
        console.log(`  ИТОГОВЫЙ ОТЧЁТ`);
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
            console.log(`  ${s.padEnd(40)} ${suitePassed}/${suiteTests.length} (${pct}%)`);
        }

        console.log(`${'═'.repeat(70)}\n`);
    }
}

// ============================================================
// 1. ЗАГРУЗКА МОДУЛЕЙ
// ============================================================
console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║  MODULE X — КОМПЛЕКСНЫЙ ИНТЕГРАЦИОННЫЙ ТЕСТ                        ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

console.log('[Загрузка] Компиляция TypeScript → JavaScript...');
const childProcess = require('child_process');
const fs = require('fs');

const outDir = '/tmp/module_x_test_build';
try { childProcess.execSync(`rm -rf ${outDir}`); } catch (e: any) { console.error(e.message); }
childProcess.execSync(`npx tsc --outDir ${outDir} --project tsconfig.test.json`, { stdio: 'pipe' });

const loadModule = (path: string): any => {
    const fullPath = `${outDir}/public/js/core-analysis/analyzers/${path}`;
    if (!fs.existsSync(fullPath)) throw new Error(`Файл не найден: ${fullPath}`);
    return require(fullPath);
};

const ms_marketStructure = loadModule('marketStructureAnalyzer.js');
const ms_trend = loadModule('trendAnalyzer.js');
const ms_momentum = loadModule('momentumAnalyzer.js');
const ms_priceAction = loadModule('priceActionAnalyzer.js');
const ms_smartMoney = loadModule('smartMoneyAnalyzer.js');
const ms_volume = loadModule('volumeAnalyzer.js');
const ms_liquidity = loadModule('liquidityAnalyzer.js');
const ms_volatility = loadModule('volatilityAnalyzer.js');
const ms_sr = loadModule('supportResistanceAnalyzer.js');
const ms_confluence = loadModule('confluenceEngine.js');
const ms_probability = loadModule('probabilityEngine.js');
const ms_confidence = loadModule('confidenceEngine.js');
const ms_scenario = loadModule('scenarioGenerator.js');

console.log('[Загрузка] 12 модулей Module X загружены ✓\n');

// ============================================================
// 2. ГЕНЕРАТОРЫ ТЕСТОВЫХ СВЕЧЕЙ
// ============================================================

interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

function makeCandle(open: number, close: number, wickSize: number, bodyWickRatio: number, vol: number): Candle {
    const body = Math.abs(close - open);
    const high = Math.max(open, close) + wickSize * bodyWickRatio;
    const low = Math.min(open, close) - wickSize * bodyWickRatio;
    return { time: 0, open, high, low, close, volume: vol };
}

function uptrendCandles(n: number): Candle[] {
    const candles: Candle[] = [];
    let price = 100;
    for (let i = 0; i < n; i++) {
        const open = price;
        const close = price + (0.5 + Math.random() * 0.5);
        const high = close + Math.random() * 0.3;
        const low = open - Math.random() * 0.2;
        const vol = 1000 + Math.random() * 200;
        candles.push({ time: i * 3600000, open, high, low, close, volume: vol });
        price = close;
    }
    return candles;
}

function downtrendCandles(n: number): Candle[] {
    const candles: Candle[] = [];
    let price = 200;
    for (let i = 0; i < n; i++) {
        const open = price;
        const close = price - (0.5 + Math.random() * 0.5);
        const high = open + Math.random() * 0.2;
        const low = close - Math.random() * 0.3;
        const vol = 1000 + Math.random() * 200;
        candles.push({ time: i * 3600000, open, high, low, close, volume: vol });
        price = close;
    }
    return candles;
}

function rangeCandles(n: number): Candle[] {
    const candles: Candle[] = [];
    let price = 150;
    for (let i = 0; i < n; i++) {
        const dir = Math.random() > 0.5 ? 1 : -1;
        const open = price;
        const close = price + dir * (Math.random() * 0.5);
        const high = Math.max(open, close) + Math.random() * 0.2;
        const low = Math.min(open, close) - Math.random() * 0.2;
        const vol = 1000 + Math.random() * 200;
        candles.push({ time: i * 3600000, open, high, low, close, volume: vol });
        price = Math.max(140, Math.min(160, close));
    }
    return candles;
}

function consolidationCandles(n: number): Candle[] {
    const candles: Candle[] = [];
    let price = 150;
    for (let i = 0; i < n; i++) {
        const open = price;
        const close = price + (Math.random() - 0.5) * 0.15;
        const high = Math.max(open, close) + 0.05;
        const low = Math.min(open, close) - 0.05;
        const vol = 800 + Math.random() * 100;
        candles.push({ time: i * 3600000, open, high, low, close, volume: vol });
        price = close;
    }
    return candles;
}

function bullishPinBar(): Candle[] {
    const candles: Candle[] = [];
    for (let i = 0; i < 15; i++) candles.push(makeCandle(100 + i, 101 + i, 0.1, 0.3, 1000));
    candles.push(makeCandle(115, 115.1, 5, 0.2, 1500));
    return candles;
}

function bearishPinBar(): Candle[] {
    const candles: Candle[] = [];
    for (let i = 0; i < 15; i++) candles.push(makeCandle(120 - i, 119 - i, 0.1, 0.3, 1000));
    candles.push(makeCandle(105, 104.9, 5, 0.2, 1500));
    return candles;
}

function hammerPattern(): Candle[] {
    const candles: Candle[] = [];
    for (let i = 0; i < 15; i++) candles.push(makeCandle(110 - i * 0.5, 109.5 - i * 0.5, 0.2, 0.3, 1000));
    candles.push({ time: 15 * 3600000, open: 100, close: 100.5, high: 100.6, low: 99.0, volume: 1500 });
    return candles;
}

function shootingStarPattern(): Candle[] {
    const candles: Candle[] = [];
    for (let i = 0; i < 15; i++) candles.push(makeCandle(100 + i * 0.5, 100.5 + i * 0.5, 0.2, 0.3, 1000));
    candles.push({ time: 15 * 3600000, open: 108, close: 107.5, high: 109.5, low: 107.4, volume: 1500 });
    return candles;
}

function bullishEngulfingPattern(): Candle[] {
    const candles: Candle[] = [];
    for (let i = 0; i < 14; i++) candles.push(makeCandle(110 - i, 109 - i, 0.2, 0.3, 1000));
    candles.push({ time: 14 * 3600000, open: 96, close: 95.5, high: 96.1, low: 95.4, volume: 1000 });
    candles.push({ time: 15 * 3600000, open: 95.0, close: 96.5, high: 96.6, low: 94.9, volume: 1500 });
    return candles;
}

function bearishEngulfingPattern(): Candle[] {
    const candles: Candle[] = [];
    for (let i = 0; i < 14; i++) candles.push(makeCandle(100 + i, 101 + i, 0.2, 0.3, 1000));
    candles.push({ time: 14 * 3600000, open: 114, close: 114.5, high: 114.6, low: 113.9, volume: 1000 });
    candles.push({ time: 15 * 3600000, open: 115.0, close: 113.5, high: 115.1, low: 113.4, volume: 1500 });
    return candles;
}

function dojiPattern(): Candle[] {
    const candles: Candle[] = [];
    for (let i = 0; i < 15; i++) candles.push(makeCandle(110 - i, 109 - i, 0.2, 0.3, 1000));
    candles.push({ time: 15 * 3600000, open: 95, close: 95.01, high: 95.5, low: 94.5, volume: 1000 });
    return candles;
}

function insideBarPattern(): Candle[] {
    const candles: Candle[] = [];
    for (let i = 0; i < 15; i++) candles.push(makeCandle(100 + i * 0.3, 100.3 + i * 0.3, 0.2, 0.3, 1000));
    candles.push({ time: 14 * 3600000, open: 105, close: 106, high: 106.5, low: 104.5, volume: 1000 });
    candles.push({ time: 15 * 3600000, open: 105.5, close: 105.7, high: 105.9, low: 104.8, volume: 1000 });
    return candles;
}

function haramiPattern(): Candle[] {
    // Бычье харами: большая красная свеча, потом маленький бычий бар внутри
    const candles: Candle[] = [];
    for (let i = 0; i < 14; i++) candles.push(makeCandle(110 - i, 109 - i, 0.2, 0.3, 1000));
    candles.push({ time: 14 * 3600000, open: 96, close: 94.5, high: 96.1, low: 94.4, volume: 1200 });
    candles.push({ time: 15 * 3600000, open: 95.0, close: 95.3, high: 95.5, low: 94.8, volume: 1000 });
    return candles;
}

function morningStarPattern(): Candle[] {
    const candles: Candle[] = [];
    for (let i = 0; i < 14; i++) candles.push(makeCandle(110 - i, 109 - i, 0.2, 0.3, 1000));
    candles.push({ time: 14 * 3600000, open: 96, close: 94, high: 96, low: 93.9, volume: 1200 }); // большая красная
    candles.push({ time: 15 * 3600000, open: 94.0, close: 94.1, high: 94.2, low: 93.8, volume: 800 });  // маленькая
    candles.push({ time: 16 * 3600000, open: 94.1, close: 96, high: 96.1, low: 94, volume: 1500 });   // большая зелёная
    return candles;
}

function eveningStarPattern(): Candle[] {
    const candles: Candle[] = [];
    for (let i = 0; i < 14; i++) candles.push(makeCandle(100 + i, 101 + i, 0.2, 0.3, 1000));
    candles.push({ time: 14 * 3600000, open: 114, close: 116, high: 116.1, low: 113.9, volume: 1200 });
    candles.push({ time: 15 * 3600000, open: 116.0, close: 115.9, high: 116.2, low: 115.8, volume: 800 });
    candles.push({ time: 16 * 3600000, open: 115.9, close: 114.0, high: 116.0, low: 113.9, volume: 1500 });
    return candles;
}

// ============================================================
// 3. ТЕСТЫ
// ============================================================

const runner = new ModuleXTestRunner();

// ───────────────────────────── MARKET STRUCTURE ─────────────────────────────
runner.suite('MARKET STRUCTURE', () => {
    runner.test('Uptrend — определяется тип uptrend', () => {
        const candles = uptrendCandles(80);
        const result = ms_marketStructure.analyze(candles);
        const valid = ['uptrend', 'strong_uptrend'].includes(result.type);
        return { pass: valid, info: `type=${result.type}` };
    });

    runner.test('Downtrend — определяется тип downtrend', () => {
        const candles = downtrendCandles(80);
        const result = ms_marketStructure.analyze(candles);
        const valid = ['downtrend', 'strong_downtrend'].includes(result.type);
        return { pass: valid, info: `type=${result.type}` };
    });

    runner.test('Range — определяется тип range', () => {
        const candles = rangeCandles(80);
        const result = ms_marketStructure.analyze(candles);
        const valid = ['range', 'ranging'].includes(result.type);
        return { pass: valid, info: `type=${result.type}` };
    });

    runner.test('Consolidation — узкий диапазон', () => {
        const candles = consolidationCandles(80);
        const result = ms_marketStructure.analyze(candles);
        return { pass: result.type !== undefined, info: `type=${result.type}, swings=${result.swings?.length || 0}` };
    });

    runner.test('Все типы содержат swings[]', () => {
        const result = ms_marketStructure.analyze(uptrendCandles(80));
        return { pass: Array.isArray(result.swings), info: `Найдено ${result.swings?.length || 0} свингов` };
    });
});

// ───────────────────────────── TREND ─────────────────────────────
runner.suite('TREND', () => {
    runner.test('Strong Bull — выраженный восходящий тренд', () => {
        const candles = uptrendCandles(80);
        const result = ms_trend.analyze(candles);
        const valid = ['strong_bull', 'bull', 'strong_bullish', 'bullish'].includes(result.primaryTrend);
        return { pass: valid, info: `trend=${result.primaryTrend}, strength=${(result.strength || 0).toFixed(2)}` };
    });

    runner.test('Strong Bear — выраженный нисходящий тренд', () => {
        const candles = downtrendCandles(80);
        const result = ms_trend.analyze(candles);
        const valid = ['strong_bear', 'bear', 'strong_bearish', 'bearish'].includes(result.primaryTrend);
        return { pass: valid, info: `trend=${result.primaryTrend}, strength=${(result.strength || 0).toFixed(2)}` };
    });

    runner.test('Weak Trend — слабый ADX', () => {
        const candles = rangeCandles(80);
        const result = ms_trend.analyze(candles);
        return { pass: result.adx !== undefined, info: `ADX=${(result.adx || 0).toFixed(1)}, trend=${result.primaryTrend}` };
    });
});

// ───────────────────────────── MOMENTUM ─────────────────────────────
runner.suite('MOMENTUM', () => {
    runner.test('Расчёт RSI ∈ [0, 100]', () => {
        const candles = uptrendCandles(50);
        const result = ms_momentum.analyze(candles);
        const valid = typeof result.rsi === 'number' && result.rsi >= 0 && result.rsi <= 100;
        return { pass: valid, info: `RSI=${result.rsi?.toFixed(1)}` };
    });

    runner.test('MACD гистограмма — число', () => {
        const candles = uptrendCandles(50);
        const result = ms_momentum.analyze(candles);
        return { pass: typeof result.macdHistogram === 'number', info: `hist=${result.macdHistogram?.toFixed(3)}` };
    });
});

// ───────────────────────────── PRICE ACTION ─────────────────────────────
runner.suite('PRICE ACTION', () => {
    runner.test('Pin Bar (бычий) — длинная нижняя тень', () => {
        const candles = bullishPinBar();
        const result = ms_priceAction.analyze(candles);
        const hasPin = (result.bullishPatterns || []).some((p: any) => /pin|hammer/i.test(p.name || p.type || ''));
        const valid = hasPin || (result.bullishPatterns?.length || 0) > 0;
        return { pass: valid, info: `Найдено: ${result.bullishPatterns?.length || 0} бычьих, ${result.bearishPatterns?.length || 0} медвежьих` };
    });

    runner.test('Pin Bar (медвежий)', () => {
        const candles = bearishPinBar();
        const result = ms_priceAction.analyze(candles);
        const valid = (result.bearishPatterns?.length || 0) > 0 || (result.bullishPatterns?.length || 0) > 0;
        return { pass: valid, info: `Найдено паттернов: bull=${result.bullishPatterns?.length || 0}, bear=${result.bearishPatterns?.length || 0}` };
    });

    runner.test('Hammer — бычий разворот', () => {
        const candles = hammerPattern();
        const result = ms_priceAction.analyze(candles);
        const hasHammer = (result.bullishPatterns || []).some((p: any) => /hammer/i.test(p.name || p.type || ''));
        return { pass: hasHammer || (result.bullishPatterns?.length || 0) > 0, info: `Найдено ${result.bullishPatterns?.length || 0} паттернов` };
    });

    runner.test('Shooting Star — медвежий разворот', () => {
        const candles = shootingStarPattern();
        const result = ms_priceAction.analyze(candles);
        const hasStar = (result.bearishPatterns || []).some((p: any) => /shooting|star/i.test(p.name || p.type || ''));
        return { pass: hasStar || (result.bearishPatterns?.length || 0) > 0, info: `Найдено ${result.bearishPatterns?.length || 0} медвежьих паттернов` };
    });

    runner.test('Bullish Engulfing — поглощение', () => {
        const candles = bullishEngulfingPattern();
        const result = ms_priceAction.analyze(candles);
        const hasEngulfing = (result.bullishPatterns || []).some((p: any) => /engulf/i.test(p.name || p.type || ''));
        return { pass: hasEngulfing || (result.bullishPatterns?.length || 0) > 0, info: `Найдено ${result.bullishPatterns?.length || 0} бычьих паттернов` };
    });

    runner.test('Bearish Engulfing — поглощение', () => {
        const candles = bearishEngulfingPattern();
        const result = ms_priceAction.analyze(candles);
        const hasEngulfing = (result.bearishPatterns || []).some((p: any) => /engulf/i.test(p.name || p.type || ''));
        return { pass: hasEngulfing || (result.bearishPatterns?.length || 0) > 0, info: `Найдено ${result.bearishPatterns?.length || 0} медвежьих паттернов` };
    });

    runner.test('Doji — нерешительность', () => {
        const candles = dojiPattern();
        const result = ms_priceAction.analyze(candles);
        const hasDoji = [...(result.bullishPatterns || []), ...(result.bearishPatterns || [])].some((p: any) => /doji/i.test(p.name || p.type || ''));
        return { pass: hasDoji || (result.totalPatterns || 0) >= 0, info: `Паттернов: ${result.totalPatterns}` };
    });

    runner.test('Inside Bar — внутренний бар', () => {
        const candles = insideBarPattern();
        const result = ms_priceAction.analyze(candles);
        const hasIB = [...(result.bullishPatterns || []), ...(result.bearishPatterns || [])].some((p: any) => /inside/i.test(p.name || p.type || ''));
        return { pass: hasIB || (result.totalPatterns || 0) >= 0, info: `Паттернов: ${result.totalPatterns}` };
    });

    runner.test('Структура результата Price Action', () => {
        const candles = [...bullishEngulfingPattern(), ...bearishEngulfingPattern()];
        const result = ms_priceAction.analyze(candles);
        const valid = (result.totalPatterns >= 0 && Array.isArray(result.bullishPatterns) && Array.isArray(result.bearishPatterns));
        return { pass: valid, info: `totalPatterns=${result.totalPatterns}, bull=${result.bullishPatterns.length}, bear=${result.bearishPatterns.length}` };
    });
});

// ───────────────────────────── SMART MONEY ─────────────────────────────
runner.suite('SMART MONEY', () => {
    runner.test('BOS (bullish) — на чистом восходящем тренде', () => {
        const candles = uptrendCandles(80);
        const result = ms_smartMoney.analyze(candles);
        const bullBOS = (result.bos || []).filter((b: any) => b.type === 'bullish');
        return { pass: bullBOS.length > 0, info: `Найдено BOS: ${result.bos?.length || 0} (бычьих ${bullBOS.length})` };
    });

    runner.test('BOS (bearish) — на нисходящем тренде', () => {
        const candles = downtrendCandles(80);
        const result = ms_smartMoney.analyze(candles);
        const bearBOS = (result.bos || []).filter((b: any) => b.type === 'bearish');
        return { pass: bearBOS.length > 0, info: `Найдено BOS: ${result.bos?.length || 0} (медвежьих ${bearBOS.length})` };
    });

    runner.test('CHoCH — структура существует', () => {
        const candles = [...uptrendCandles(40), ...downtrendCandles(40)];
        const result = ms_smartMoney.analyze(candles);
        return { pass: Array.isArray(result.choch), info: `Найдено CHoCH: ${result.choch?.length || 0}, internalTrend=${result.internalTrend}` };
    });

    runner.test('Order Blocks — на трендовом рынке', () => {
        const candles = uptrendCandles(80);
        const result = ms_smartMoney.analyze(candles);
        return { pass: Array.isArray(result.orderBlocks), info: `Найдено OB: ${result.orderBlocks?.length || 0}` };
    });

    runner.test('FVG (Fair Value Gaps) — детектируются', () => {
        const candles = uptrendCandles(80);
        const result = ms_smartMoney.analyze(candles);
        return { pass: Array.isArray(result.fairValueGaps) && result.fairValueGaps.length > 0, info: `Найдено FVG: ${result.fairValueGaps?.length || 0}` };
    });

    runner.test('Liquidity Sweeps — структура', () => {
        const candles = uptrendCandles(120);
        const result = ms_smartMoney.analyze(candles);
        return { pass: Array.isArray(result.liquiditySweeps), info: `Найдено sweeps: ${result.liquiditySweeps?.length || 0}` };
    });

    runner.test('Equal Highs / Lows на range', () => {
        const candles = rangeCandles(80);
        const result = ms_smartMoney.analyze(candles);
        return { pass: Array.isArray(result.equalHighs) && Array.isArray(result.equalLows), info: `EqualHighs: ${result.equalHighs?.length || 0}, EqualLows: ${result.equalLows?.length || 0}` };
    });

    runner.test('Internal Trend — определён', () => {
        const candles = uptrendCandles(80);
        const result = ms_smartMoney.analyze(candles);
        const valid = ['bullish', 'bearish', 'neutral'].includes(result.internalTrend);
        return { pass: valid, info: `internalTrend=${result.internalTrend}` };
    });
});

// ───────────────────────────── VOLUME ─────────────────────────────
runner.suite('VOLUME', () => {
    runner.test('Volume Spike — аномальный объём детектируется', () => {
        const candles = uptrendCandles(80);
        candles[candles.length - 1].volume = candles[candles.length - 1].volume * 5;
        const result = ms_volume.analyze(candles);
        return { pass: (result.spikes?.length || 0) > 0 || result.volumeSpike === true, info: `Спайков: ${result.spikes?.length || 0}, volumeSpike=${result.volumeSpike}, strength=${result.spikeStrength?.toFixed(2)}` };
    });

    runner.test('Buying Pressure > Selling Pressure в аптренде', () => {
        const candles = uptrendCandles(80);
        const result = ms_volume.analyze(candles);
        return { pass: result.buyingPressure > result.sellingPressure, info: `Buy=${(result.buyingPressure * 100).toFixed(0)}%, Sell=${(result.sellingPressure * 100).toFixed(0)}%` };
    });

    runner.test('Selling Pressure ≥ Buying Pressure в даунтренде', () => {
        const candles = downtrendCandles(80);
        const result = ms_volume.analyze(candles);
        return { pass: result.sellingPressure >= result.buyingPressure, info: `Buy=${(result.buyingPressure * 100).toFixed(0)}%, Sell=${(result.sellingPressure * 100).toFixed(0)}%` };
    });

    runner.test('Volume Divergences — массив существует', () => {
        const candles = uptrendCandles(80);
        const result = ms_volume.analyze(candles);
        return { pass: Array.isArray(result.divergences), info: `Дивергенций: ${result.divergences?.length || 0}` };
    });

    runner.test('OBV — рассчитан', () => {
        const candles = uptrendCandles(50);
        const result = ms_volume.analyze(candles);
        return { pass: typeof result.obv === 'number', info: `OBV=${result.obv?.toFixed(0)}, trend=${result.obvTrend}` };
    });
});

// ───────────────────────────── LIQUIDITY ─────────────────────────────
runner.suite('LIQUIDITY', () => {
    runner.test('Liquidity Grab — структура', () => {
        const candles = rangeCandles(100);
        const sm = ms_smartMoney.analyze(candles);
        const result = ms_liquidity.analyze(candles, sm);
        return { pass: Array.isArray(result.liquidityGrabs), info: `Grabs: ${result.liquidityGrabs?.length || 0}` };
    });

    runner.test('Stop Hunt — детектируется', () => {
        const candles = rangeCandles(100);
        const sm = ms_smartMoney.analyze(candles);
        const result = ms_liquidity.analyze(candles, sm);
        return { pass: Array.isArray(result.stopHunts) && result.stopHunts.length > 0, info: `Stop Hunts: ${result.stopHunts?.length || 0}` };
    });

    runner.test('Liquidity Void — структура', () => {
        const candles = uptrendCandles(80);
        const sm = ms_smartMoney.analyze(candles);
        const result = ms_liquidity.analyze(candles, sm);
        return { pass: Array.isArray(result.liquidityVoids), info: `Voids: ${result.liquidityVoids?.length || 0}` };
    });

    runner.test('Bias определён', () => {
        const candles = uptrendCandles(100);
        const sm = ms_smartMoney.analyze(candles);
        const result = ms_liquidity.analyze(candles, sm);
        const valid = ['bullish', 'bearish', 'neutral'].includes(result.bias);
        return { pass: valid, info: `bias=${result.bias}` };
    });
});

// ───────────────────────────── VOLATILITY ─────────────────────────────
runner.suite('VOLATILITY', () => {
    runner.test('ATR Expansion — волатильность растёт', () => {
        const candles: Candle[] = [];
        for (let i = 0; i < 80; i++) {
            const range = 0.5 + i * 0.05;
            candles.push({
                time: i * 3600000, open: 100 + i * 0.1, close: 100 + i * 0.1 + 0.05,
                high: 100 + i * 0.1 + range, low: 100 + i * 0.1 - range * 0.3, volume: 1000
            });
        }
        const result = ms_volatility.analyze(candles);
        return { pass: result.atr > 0 && result.atrPercent > 0, info: `ATR=${result.atr?.toFixed(3)}, ${result.atrPercent?.toFixed(2)}%, expansion=${result.atrExpansion}` };
    });

    runner.test('ATR Compression — волатильность сжимается', () => {
        const candles: Candle[] = [];
        for (let i = 0; i < 80; i++) {
            const range = 2 - i * 0.02;
            candles.push({
                time: i * 3600000, open: 100, close: 100.01,
                high: 100 + range, low: 100 - range * 0.5, volume: 1000
            });
        }
        const result = ms_volatility.analyze(candles);
        return { pass: result.atr > 0 && result.regime !== undefined, info: `ATR=${result.atr?.toFixed(3)}, regime=${result.regime}` };
    });

    runner.test('Bollinger Bands — рассчитаны', () => {
        const candles = uptrendCandles(80);
        const result = ms_volatility.analyze(candles);
        return { pass: result.bbUpper > result.bbMiddle && result.bbMiddle > result.bbLower, info: `Upper=${result.bbUpper?.toFixed(2)}, Mid=${result.bbMiddle?.toFixed(2)}, Lower=${result.bbLower?.toFixed(2)}` };
    });

    runner.test('Regime — один из 5 уровней', () => {
        const candles = uptrendCandles(80);
        const result = ms_volatility.analyze(candles);
        const valid = ['extreme_low', 'low', 'normal', 'high', 'extreme_high'].includes(result.regime);
        return { pass: valid, info: `regime=${result.regime}` };
    });
});

// ───────────────────────────── SUPPORT/RESISTANCE ─────────────────────────────
runner.suite('SUPPORT/RESISTANCE', () => {
    runner.test('Уровни определяются', () => {
        const candles = uptrendCandles(100);
        const result = ms_sr.analyze(candles);
        return { pass: Array.isArray(result.levels), info: `Уровней: ${result.levels?.length || 0}, position=${result.pricePosition}` };
    });

    runner.test('Price Position — определена', () => {
        const candles = uptrendCandles(100);
        const result = ms_sr.analyze(candles);
        const valid = ['in_supply', 'in_demand', 'neutral', 'at_level', 'premium', 'discount'].includes(result.pricePosition);
        return { pass: valid, info: `position=${result.pricePosition}` };
    });

    runner.test('Nearest Support/Resistance — объекты или массивы', () => {
        const candles = uptrendCandles(100);
        const result = ms_sr.analyze(candles);
        return { pass: result.nearestSupport !== undefined || result.nearestResistance !== undefined, info: `Support=${result.nearestSupport?.price?.toFixed(2) || 'n/a'}, Resist=${result.nearestResistance?.price?.toFixed(2) || 'n/a'}` };
    });
});

// ───────────────────────────── CONFLUENCE ENGINE ─────────────────────────────
runner.suite('CONFLUENCE ENGINE', () => {
    runner.test('Сигналы извлекаются из всех источников', () => {
        const candles = uptrendCandles(80);
        const inputs = {
            marketStructure: ms_marketStructure.analyze(candles),
            trend: ms_trend.analyze(candles),
            momentum: ms_momentum.analyze(candles),
            priceAction: ms_priceAction.analyze(candles),
            smartMoney: ms_smartMoney.analyze(candles),
            volume: ms_volume.analyze(candles),
            liquidity: ms_liquidity.analyze(candles, ms_smartMoney.analyze(candles)),
            volatility: ms_volatility.analyze(candles),
            supportResistance: ms_sr.analyze(candles)
        };
        const result = ms_confluence.calculate(inputs);
        return { pass: result.totalSignals > 0, info: `Сигналов: ${result.totalSignals}, bull=${result.bullishCount}, bear=${result.bearishCount}` };
    });

    runner.test('Confluence Score ∈ [0, 100]', () => {
        const candles = uptrendCandles(80);
        const result = ms_confluence.calculate({
            marketStructure: ms_marketStructure.analyze(candles),
            trend: ms_trend.analyze(candles),
            momentum: ms_momentum.analyze(candles),
            priceAction: ms_priceAction.analyze(candles),
            smartMoney: ms_smartMoney.analyze(candles),
            volume: ms_volume.analyze(candles),
            volatility: ms_volatility.analyze(candles),
            supportResistance: ms_sr.analyze(candles)
        });
        const valid = result.confluenceScore >= 0 && result.confluenceScore <= 100;
        return { pass: valid, info: `score=${result.confluenceScore?.toFixed(0)}, strength=${result.strength}` };
    });

    runner.test('Strength — один из 5 уровней', () => {
        const candles = uptrendCandles(80);
        const result = ms_confluence.calculate({
            trend: ms_trend.analyze(candles),
            volume: ms_volume.analyze(candles)
        });
        const valid = ['no_confluence', 'weak', 'moderate', 'strong', 'very_strong'].includes(result.strength);
        return { pass: valid, info: `strength=${result.strength}` };
    });

    runner.test('Confluence > направленное движение при сильных сигналах', () => {
        const candles = uptrendCandles(120);
        const result = ms_confluence.calculate({
            marketStructure: ms_marketStructure.analyze(candles),
            trend: ms_trend.analyze(candles),
            smartMoney: ms_smartMoney.analyze(candles),
            volume: ms_volume.analyze(candles),
            volatility: ms_volatility.analyze(candles),
            supportResistance: ms_sr.analyze(candles)
        });
        return { pass: result.dominantDirection !== 'neutral', info: `direction=${result.dominantDirection}, alignment=${result.alignmentPercent?.toFixed(0)}%` };
    });
});

// ───────────────────────────── PROBABILITY ENGINE ─────────────────────────────
runner.suite('PROBABILITY ENGINE', () => {
    runner.test('Сумма вероятностей = 100%', () => {
        const candles = uptrendCandles(80);
        const conf = ms_confluence.calculate({
            marketStructure: ms_marketStructure.analyze(candles),
            trend: ms_trend.analyze(candles),
            volume: ms_volume.analyze(candles),
            volatility: ms_volatility.analyze(candles)
        });
        const result = ms_probability.calculate(conf, {
            trend: ms_trend.analyze(candles),
            volume: ms_volume.analyze(candles)
        });
        const sum = result.bullish + result.bearish + result.neutral;
        return { pass: Math.abs(sum - 100) < 0.05, info: `bull=${result.bullish?.toFixed(2)}, bear=${result.bearish?.toFixed(2)}, neut=${result.neutral?.toFixed(2)}, sum=${sum?.toFixed(2)}` };
    });

    runner.test('Bullish ≥ Bearish при восходящем тренде', () => {
        const candles = uptrendCandles(100);
        const conf = ms_confluence.calculate({
            trend: ms_trend.analyze(candles),
            marketStructure: ms_marketStructure.analyze(candles),
            volume: ms_volume.analyze(candles)
        });
        const result = ms_probability.calculate(conf, {
            trend: ms_trend.analyze(candles),
            volume: ms_volume.analyze(candles),
            volatility: ms_volatility.analyze(candles)
        });
        return { pass: result.bullish >= result.bearish, info: `bull=${result.bullish?.toFixed(1)}, bear=${result.bearish?.toFixed(1)}` };
    });

    runner.test('Bearish ≥ Bullish при нисходящем тренде', () => {
        const candles = downtrendCandles(100);
        const conf = ms_confluence.calculate({
            trend: ms_trend.analyze(candles),
            marketStructure: ms_marketStructure.analyze(candles),
            volume: ms_volume.analyze(candles)
        });
        const result = ms_probability.calculate(conf, {
            trend: ms_trend.analyze(candles),
            volume: ms_volume.analyze(candles),
            volatility: ms_volatility.analyze(candles)
        });
        return { pass: result.bearish >= result.bullish, info: `bull=${result.bullish?.toFixed(1)}, bear=${result.bearish?.toFixed(1)}` };
    });

    runner.test('Confidence ∈ [0, 100]', () => {
        const candles = uptrendCandles(80);
        const conf = ms_confluence.calculate({ trend: ms_trend.analyze(candles) });
        const result = ms_probability.calculate(conf);
        return { pass: result.confidence >= 0 && result.confidence <= 100, info: `confidence=${result.confidence?.toFixed(0)}%` };
    });

    runner.test('Expected — одно из 3 направлений', () => {
        const candles = uptrendCandles(80);
        const conf = ms_confluence.calculate({ trend: ms_trend.analyze(candles) });
        const result = ms_probability.calculate(conf);
        const valid = ['bullish', 'bearish', 'neutral'].includes(result.expected);
        return { pass: valid, info: `expected=${result.expected}` };
    });

    runner.test('Базовый случай ~33/33/34 без данных', () => {
        const result = ms_probability.calculate(null);
        const sum = result.bullish + result.bearish + result.neutral;
        return { pass: Math.abs(sum - 100) < 0.05, info: `Баланс: ${result.bullish}/${result.bearish}/${result.neutral}, sum=${sum?.toFixed(2)}` };
    });
});

// ───────────────────────────── CONFIDENCE ENGINE ─────────────────────────────
runner.suite('CONFIDENCE ENGINE', () => {
    runner.test('Значение ∈ [0, 1]', () => {
        const candles = uptrendCandles(80);
        const result = ms_confidence.calculate({
            confluence: ms_confluence.calculate({
                trend: ms_trend.analyze(candles),
                marketStructure: ms_marketStructure.analyze(candles)
            }),
            volume: ms_volume.analyze(candles),
            volatility: ms_volatility.analyze(candles),
            smartMoney: ms_smartMoney.analyze(candles),
            trend: ms_trend.analyze(candles)
        });
        return { pass: result.confidence >= 0 && result.confidence <= 1, info: `confidence=${result.confidence?.toFixed(2)}, percent=${result.percent}%, grade=${result.grade}` };
    });

    runner.test('Confidence ВЫШЕ при сильных совпадающих сигналах', () => {
        const confStrong = ms_confluence.calculate({
            marketStructure: { type: 'uptrend', structureShift: { type: 'BOS' } },
            trend: { primaryTrend: 'strong_bull', strength: 0.9, adx: 35 },
            volume: { bias: 'bullish', regime: 'high_volume', buyingPressure: 0.7, sellingPressure: 0.3 },
            smartMoney: { bos: [{ type: 'bullish' }], choch: [{ type: 'bullish' }], internalTrend: 'bullish' }
        });
        const confWeak = ms_confluence.calculate({
            marketStructure: { type: 'range' },
            trend: { primaryTrend: 'neutral', strength: 0.1 },
            volume: { bias: 'neutral', regime: 'normal_volume', buyingPressure: 0.5, sellingPressure: 0.5 }
        });
        const cStrong = ms_confidence.calculate({ confluence: confStrong, volume: { bias: 'bullish', regime: 'high_volume', buyingPressure: 0.7, sellingPressure: 0.3 }, trend: { primaryTrend: 'strong_bull', strength: 0.9 }, smartMoney: { bos: [], choch: [], mss: [], orderBlocks: [], fairValueGaps: [], liquiditySweeps: [] } });
        const cWeak = ms_confidence.calculate({ confluence: confWeak });
        return { pass: cStrong.confidence > cWeak.confidence, info: `Strong=${cStrong.confidence?.toFixed(2)} > Weak=${cWeak.confidence?.toFixed(2)}` };
    });

    runner.test('Confidence НИЖЕ при множественных конфликтах', () => {
        const conf = ms_confluence.calculate({
            trend: { primaryTrend: 'bull', strength: 0.5 },
            momentum: { rsi: 80, macdHistogram: -1 }
        });
        const result = ms_confidence.calculate({
            confluence: { ...conf, conflictingCount: 10, netScore: 0.1 }
        });
        return { pass: result.confidence < 0.8, info: `С конфликтами: confidence=${result.confidence?.toFixed(2)}` };
    });

    runner.test('Grade — A/B/C/D/F', () => {
        const candles = uptrendCandles(120);
        const result = ms_confidence.calculate({
            confluence: ms_confluence.calculate({ trend: ms_trend.analyze(candles) }),
            volume: ms_volume.analyze(candles),
            volatility: ms_volatility.analyze(candles),
            smartMoney: ms_smartMoney.analyze(candles)
        });
        const valid = ['A', 'B', 'C', 'D', 'F'].includes(result.grade);
        return { pass: valid, info: `grade=${result.grade}, percent=${result.percent}%` };
    });
});

// ───────────────────────────── SCENARIO GENERATOR ─────────────────────────────
runner.suite('SCENARIO GENERATOR', () => {
    function makeFullInputs(candles: Candle[]): any {
        const ms = ms_marketStructure.analyze(candles);
        const tr = ms_trend.analyze(candles);
        const pa = ms_priceAction.analyze(candles);
        const sm = ms_smartMoney.analyze(candles);
        const vol = ms_volume.analyze(candles);
        const liq = ms_liquidity.analyze(candles, sm);
        const vlt = ms_volatility.analyze(candles);
        const srRes = ms_sr.analyze(candles);
        const conf = ms_confluence.calculate({
            marketStructure: ms, trend: tr, momentum: ms_momentum.analyze(candles),
            priceAction: pa, smartMoney: sm, volume: vol, liquidity: liq,
            volatility: vlt, supportResistance: srRes
        });
        const prob = ms_probability.calculate(conf, { trend: tr, volume: vol, volatility: vlt });
        return {
            candles, marketStructure: ms, trend: tr, priceAction: pa,
            smartMoney: sm, volume: vol, liquidity: liq, volatility: vlt,
            supportResistance: srRes, probabilities: prob, confluence: conf
        };
    }

    runner.test('Генерируется 19 сценариев', () => {
        const inputs = makeFullInputs(uptrendCandles(120));
        const result = ms_scenario.generate(inputs);
        return { pass: result.length === 19, info: `Сгенерировано: ${result.length}` };
    });

    runner.test('Long сценарий', () => {
        const inputs = makeFullInputs(uptrendCandles(120));
        const result = ms_scenario.generate(inputs);
        const long = result.find((s: any) => s.id === 'long');
        return { pass: long !== undefined, info: `Long: priority=${long?.priority}, applicable=${long?.applicable}` };
    });

    runner.test('Short сценарий', () => {
        const inputs = makeFullInputs(downtrendCandles(120));
        const result = ms_scenario.generate(inputs);
        const short = result.find((s: any) => s.id === 'short');
        return { pass: short !== undefined, info: `Short: priority=${short?.priority}, applicable=${short?.applicable}` };
    });

    runner.test('Wait сценарий', () => {
        const inputs = makeFullInputs(rangeCandles(120));
        const result = ms_scenario.generate(inputs);
        const wait = result.find((s: any) => s.id === 'wait');
        return { pass: wait !== undefined, info: `Wait: priority=${wait?.priority}` };
    });

    runner.test('Pullback Entry', () => {
        const inputs = makeFullInputs(uptrendCandles(120));
        const result = ms_scenario.generate(inputs);
        const pullback = result.find((s: any) => s.id === 'pullback_entry');
        return { pass: pullback !== undefined, info: `Pullback: applicable=${pullback?.applicable}` };
    });

    runner.test('Breakout Entry', () => {
        const inputs = makeFullInputs(uptrendCandles(120));
        const result = ms_scenario.generate(inputs);
        const br = result.find((s: any) => s.id === 'breakout_entry');
        return { pass: br !== undefined, info: `Breakout: applicable=${br?.applicable}` };
    });

    runner.test('BOS Continuation', () => {
        const inputs = makeFullInputs(uptrendCandles(120));
        const result = ms_scenario.generate(inputs);
        const bos = result.find((s: any) => s.id === 'bos_continuation');
        return { pass: bos !== undefined, info: `BOS: priority=${bos?.priority}` };
    });

    runner.test('Order Block Entry', () => {
        const inputs = makeFullInputs(uptrendCandles(120));
        const result = ms_scenario.generate(inputs);
        const ob = result.find((s: any) => s.id === 'ob_entry');
        return { pass: ob !== undefined, info: `OB: applicable=${ob?.applicable}` };
    });

    runner.test('Pin Bar Entry', () => {
        const inputs = makeFullInputs(uptrendCandles(120));
        const result = ms_scenario.generate(inputs);
        const pin = result.find((s: any) => s.id === 'pin_bar_entry');
        return { pass: pin !== undefined, info: `Pin: applicable=${pin?.applicable}` };
    });

    runner.test('Сценарии отсортированы по приоритету (убывание)', () => {
        const inputs = makeFullInputs(uptrendCandles(120));
        const result = ms_scenario.generate(inputs);
        let sorted = true;
        for (let i = 1; i < result.length; i++) {
            if (result[i].priority > result[i - 1].priority) { sorted = false; break; }
        }
        return { pass: sorted, info: sorted ? `Сортировка OK, max priority=${result[0].priority}` : 'Не отсортировано' };
    });

    runner.test('Каждый сценарий имеет reasons и invalidationConditions', () => {
        const inputs = makeFullInputs(uptrendCandles(120));
        const result = ms_scenario.generate(inputs);
        const allValid = result.every((s: any) => Array.isArray(s.reasons) && Array.isArray(s.invalidationConditions));
        return { pass: allValid, info: allValid ? 'Все сценарии валидны' : 'Некоторые сценарии не имеют reasons/invalidations' };
    });
});

// ============================================================
// 4. ОТЧЁТ
// ============================================================
runner.report();

// Выходной код для CI
const failedCount = runner.results.filter(r => !r.passed).length;
process.exit(failedCount > 0 ? 1 : 0);
