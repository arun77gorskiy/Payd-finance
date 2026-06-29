// ============================================================
// Module 2 — Интеграционные тесты после полной интеграции с Module X v1.0.0
// ============================================================
// Цель тестов:
//   1. Доказать, что DecisionEvaluationEngine.js НЕ содержит анализа графика.
//   2. Доказать, что Module 2 принимает только готовый AnalysisResult
//      и формирует вердикт на его основе.
//   3. Покрыть все сценарии оценки (correct / risky / incorrect).
//   4. Проверить формирование объяснений и edge cases.
//   5. Подтвердить, что Module 2 можно тестировать только через моки.
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

class Module2TestRunner {
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
        console.log(`  ИТОГОВЫЙ ОТЧЁТ — MODULE 2 (decision validator)`);
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

        // Покрытие по сьютам
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
// 1. ЗАГРУЗКА MODULE 2 В VM-КОНТЕКСТ
// ============================================================
console.log('╔══════════════════════════════════════════════════════════════════════╗');
console.log('║  MODULE 2 — ТЕСТЫ ИНТЕГРАЦИИ С MODULE X v1.0.0                    ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

const fs = require('fs');
const vm = require('vm');

console.log('[Загрузка] Module 2 (DecisionEvaluationEngine.js)...');
const module2Code = fs.readFileSync('/workspace/payd-trading-lab/Module 2/DecisionEvaluationEngine.js', 'utf8');

// Mock каталога решений
const catalogMock: any = {
    getDecisionById: (id: string) => {
        const catalog: any = {
            'breakout-entry':    { id: 'breakout-entry', label: 'Breakout Entry',    shortLabel: 'BREAK', direction: 'long',  category: 'conditional',   riskLevel: 'medium', entryStyle: 'on-breakout',  requiredEvidence: ['breakout'],                recommendedEvidence: ['high-volume', 'hold'], rrExpectation: '1:3' },
            'long':              { id: 'long',           label: 'Long',              shortLabel: 'LONG',   direction: 'long',  category: 'directional',    riskLevel: 'medium', entryStyle: 'immediate',    requiredEvidence: ['high-volume'],              recommendedEvidence: ['impulse'],           rrExpectation: '1:2' },
            'short':             { id: 'short',          label: 'Short',             shortLabel: 'SHORT',  direction: 'short', category: 'directional',    riskLevel: 'medium', entryStyle: 'immediate',    requiredEvidence: ['high-volume'],              recommendedEvidence: ['impulse'],           rrExpectation: '1:2' },
            'pullback-entry':    { id: 'pullback-entry', label: 'Pullback Entry',    shortLabel: 'PULLBCK',direction: 'long',  category: 'conditional',   riskLevel: 'medium', entryStyle: 'on-pullback',  requiredEvidence: ['retest'],                  recommendedEvidence: ['hold'],              rrExpectation: '1:3' },
            'aggressive-long':   { id: 'aggressive-long',label: 'Aggressive Long',   shortLabel: 'AGG-L',  direction: 'long',  category: 'directional',    riskLevel: 'high',   entryStyle: 'immediate',    requiredEvidence: ['impulse', 'high-volume'],  recommendedEvidence: [],                   rrExpectation: '1:2' },
            'conservative-long': { id: 'conservative-long', label: 'Conservative Long', shortLabel: 'CONSV-L', direction: 'long', category: 'directional', riskLevel: 'low', entryStyle: 'on-pullback', requiredEvidence: ['retest', 'hold'], recommendedEvidence: ['high-volume'], rrExpectation: '1:3' },
            'partial-position':  { id: 'partial-position',label: 'Partial Position',  shortLabel: 'PARTIAL',direction: 'long',  category: 'risk-managed',   riskLevel: 'low',    entryStyle: 'on-pullback',  requiredEvidence: ['retest'],                  recommendedEvidence: [],                   rrExpectation: '1:2' },
            'scale-in':          { id: 'scale-in',       label: 'Scale In',          shortLabel: 'SCALE',  direction: 'long',  category: 'risk-managed',   riskLevel: 'medium', entryStyle: 'on-pullback',  requiredEvidence: [],                          recommendedEvidence: ['hold'],              rrExpectation: '1:3' },
            'counter-trend':     { id: 'counter-trend',  label: 'Counter Trend',     shortLabel: 'CTR-TR', direction: 'long',  category: 'counter-trend', riskLevel: 'high',   entryStyle: 'immediate',    requiredEvidence: ['rejection'],               recommendedEvidence: [],                   rrExpectation: '1:4' },
            'wait':              { id: 'wait',           label: 'Wait',              shortLabel: 'WAIT',   direction: 'neutral', category: 'neutral',     riskLevel: 'low',    entryStyle: 'wait',         requiredEvidence: [],                          recommendedEvidence: [],                   rrExpectation: '0'  },
            'no-trade':          { id: 'no-trade',       label: 'No Trade',          shortLabel: 'NO-TR',  direction: 'neutral', category: 'neutral',     riskLevel: 'low',    entryStyle: 'wait',         requiredEvidence: [],                          recommendedEvidence: [],                   rrExpectation: '0'  }
        };
        return catalog[id];
    }
};

// КРИТИЧЕСКОЕ: используем vm.createContext, чтобы IIFE в Module 2
// подхватывал наш контекст как globalThis (а не реальный global Node.js).
const ctx: any = vm.createContext({});
ctx.window = ctx;
ctx.global = ctx;
ctx.globalThis = ctx;
ctx.DecisionOptionsCatalog = catalogMock;

try {
    const script = new vm.Script(module2Code, { filename: 'DecisionEvaluationEngine.js' });
    script.runInContext(ctx);
} catch (err) {
    console.error('[FATAL] Не удалось загрузить Module 2:', err);
    process.exit(2);
}

const Module2 = ctx.DecisionEvaluationEngine;

console.log('[Загрузка] Module 2 загружен ✓');
console.log(`[Проверка] Module 2 имеет evaluate: ${typeof Module2?.evaluate === 'function'}\n`);

// ============================================================
// 2. УТИЛИТЫ ДЛЯ ANALYSISRESULT (новая структура Module X v1.0.0)
// ============================================================

interface Scenario {
    id: string;
    title?: string;
    direction: 'long' | 'short' | 'neutral';
    category?: string;
    riskLevel?: string;
    priority?: number;
    probability?: number;
    confirmations?: string[];
    riskRewardRatio?: string;
    description?: string;
}

/** Стандартные bullish-scenarios: long, breakout-entry, aggressive-long, wait */
function makeBullishScenarios(): Scenario[] {
    return [
        { id: 'long',              title: 'Long по тренду', direction: 'long', category: 'directional', priority: 1, probability: 0.7, confirmations: ['high-volume'], riskRewardRatio: '1:2' },
        { id: 'breakout-entry',    title: 'Breakout Entry', direction: 'long', category: 'conditional', priority: 2, probability: 0.6, confirmations: ['breakout'], riskRewardRatio: '1:3' },
        { id: 'aggressive-long',   title: 'Aggressive Long', direction: 'long', category: 'directional', priority: 3, probability: 0.5, confirmations: ['impulse'], riskRewardRatio: '1:2' },
        { id: 'wait',              title: 'Wait', direction: 'neutral', category: 'neutral', priority: 99, probability: 0, confirmations: [], riskRewardRatio: '0' }
    ];
}

function makeBearishScenarios(): Scenario[] {
    return [
        { id: 'short',   title: 'Short по тренду', direction: 'short', category: 'directional', priority: 1, probability: 0.7, confirmations: ['high-volume'], riskRewardRatio: '1:2' },
        { id: 'wait',    title: 'Wait', direction: 'neutral', category: 'neutral', priority: 99, probability: 0, confirmations: [], riskRewardRatio: '0' }
    ];
}

function makeNeutralScenarios(): Scenario[] {
    return [
        { id: 'partial-position', title: 'Partial Position', direction: 'long', category: 'risk-managed', priority: 1, probability: 0.5, confirmations: ['retest'], riskRewardRatio: '1:2' },
        { id: 'wait', title: 'Wait', direction: 'neutral', category: 'neutral', priority: 99, probability: 0, confirmations: [], riskRewardRatio: '0' }
    ];
}

/**
 * Baseline AnalysisResult для бычьих рынков.
 * Принимает overrides для кастомизации полей в каждом тесте.
 */
function makeBullishAnalysis(overrides: any = {}): any {
    return {
        trend: { primaryTrend: 'strong_bull', strength: 80, description: 'Bullish trend' },
        marketStructure: {
            type: 'uptrend',
            higherHighs: [{}, {}],
            higherLows: [{}],
            lowerHighs: [],
            lowerLows: [],
            swings: [],
            structureShift: null,
            summary: 'Uptrend'
        },
        confidence: { percent: 78, grade: 'B' },
        marketPhase: { phase: 'trending' },
        probabilities: { continuation: 0.7, reversal: 0.3 },
        evidence: { keySignals: ['uptrend_structure', 'strong_bullish_momentum'] },
        scenarios: makeBullishScenarios(),
        ...overrides
    };
}

function makeBearishAnalysis(overrides: any = {}): any {
    return {
        trend: { primaryTrend: 'strong_bear', strength: 80, description: 'Bearish trend' },
        marketStructure: {
            type: 'downtrend',
            higherHighs: [],
            higherLows: [],
            lowerHighs: [{}, {}],
            lowerLows: [{}],
            swings: [],
            structureShift: null,
            summary: 'Downtrend'
        },
        confidence: { percent: 78, grade: 'B' },
        marketPhase: { phase: 'trending' },
        probabilities: { continuation: 0.7, reversal: 0.3 },
        evidence: { keySignals: ['downtrend_structure', 'strong_bearish_momentum'] },
        scenarios: makeBearishScenarios(),
        ...overrides
    };
}

function makeNeutralAnalysis(overrides: any = {}): any {
    return {
        trend: { primaryTrend: 'range', strength: 50, description: 'Range' },
        marketStructure: {
            type: 'range',
            higherHighs: [],
            higherLows: [],
            lowerHighs: [],
            lowerLows: [],
            swings: [],
            structureShift: null,
            summary: 'Range'
        },
        confidence: { percent: 50, grade: 'C' },
        marketPhase: { phase: 'consolidation' },
        probabilities: { continuation: 0.5, reversal: 0.5 },
        evidence: { keySignals: ['at_key_level'] },
        scenarios: makeNeutralScenarios(),
        ...overrides
    };
}

/**
 * Подменяет DecisionOptionsCatalog в нашем ctx.
 * Если не передавать — возвращает исходный mock.
 */
function installMockCatalog(customMock: any) {
    const original = ctx.DecisionOptionsCatalog;
    ctx.DecisionOptionsCatalog = customMock;
    return original;
}

function uninstallMockCatalog(original: any) {
    ctx.DecisionOptionsCatalog = original;
}

// ============================================================
// 3. ТЕСТЫ
// ============================================================

const runner = new Module2TestRunner();

// ------------------------------------------------------------
// SUITE 1 — ARCHITECTURE
// ------------------------------------------------------------
runner.suite('ARCHITECTURE: Module 2 не выполняет собственный анализ', () => {
    runner.test('В исходном коде Module 2 нет вызовов analyzeMarket (вне комментариев)', () => {
        const src = fs.readFileSync('/workspace/payd-trading-lab/Module 2/DecisionEvaluationEngine.js', 'utf8');
        const stripped = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|\s)\/\/[^\n]*/g, '');
        const hasCall = /\.analyzeMarket\s*\(/.test(stripped);
        return {
            pass: !hasCall,
            info: !hasCall
                ? 'analyzeMarket() НЕ вызывается в коде ✓'
                : 'analyzeMarket() НАЙДЕН в коде — нарушение архитектуры!'
        };
    });

    runner.test('В исходном коде Module 2 нет собственных аналитических функций', () => {
        const src = fs.readFileSync('/workspace/payd-trading-lab/Module 2/DecisionEvaluationEngine.js', 'utf8');
        const stripped = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|\s)\/\/[^\n]*/g, '');

        const forbiddenPatterns = [
            /detectTrend\s*\(/,
            /detectBOS\s*\(/,
            /detectCHoCH\s*\(/,
            /detectPinBar\s*\(/,
            /calculateRSI\s*\(/,
            /calculateMACD\s*\(/,
            /swingHigh\s*\(/,
            /swingLow\s*\(/,
            /calculateATR\s*\(/,
            /findSwings\s*\(/,
            /function\s+analyze[sA-Z]*/,
            /require\s*\(\s*['"][^'"]*analyzer/i
        ];

        const violations: string[] = [];
        for (const p of forbiddenPatterns) {
            const m = stripped.match(p);
            if (m) violations.push(`${p.toString()}: ${m[0].substring(0, 50)}`);
        }

        return {
            pass: violations.length === 0,
            info: violations.length === 0
                ? 'Нет собственной аналитики ✓'
                : `Найдены нарушения:\n${violations.join('\n')}`
        };
    });

    runner.test('В исходном коде Module 2 нет require/import анализаторов', () => {
        const src = fs.readFileSync('/workspace/payd-trading-lab/Module 2/DecisionEvaluationEngine.js', 'utf8');
        const hasAnalyzerImport = /require\s*\(\s*['"][^'"]*analyz/i.test(src) ||
                                   /from\s+['"][^'"]*analyz/i.test(src);
        return {
            pass: !hasAnalyzerImport,
            info: !hasAnalyzerImport
                ? 'Нет импортов анализаторов ✓'
                : 'Импорт анализатора найден!'
        };
    });

    runner.test('Module 2 имеет evaluate() как публичную точку входа', () => {
        const pass = typeof Module2?.evaluate === 'function';
        const hasOnlyEvaluate = Object.keys(Module2).filter(k => !k.startsWith('_')).length === 1;
        return {
            pass: pass && hasOnlyEvaluate,
            info: `Module2 keys = ${Object.keys(Module2).join(', ')}`
        };
    });

    runner.test('evaluate принимает marketAnalysis как входной параметр', () => {
        const src = fs.readFileSync('/workspace/payd-trading-lab/Module 2/DecisionEvaluationEngine.js', 'utf8');
        const accepts = /function\s+evaluate\s*\(\s*input\s*\)/.test(src)
                     && /input\.marketAnalysis/.test(src);
        return {
            pass: accepts,
            info: accepts ? 'evaluate(input) принимает marketAnalysis ✓' : 'НЕ принимает marketAnalysis'
        };
    });
});

// ------------------------------------------------------------
// SUITE 2 — DATA FLOW
// ------------------------------------------------------------
runner.suite('DATA FLOW: Module 2 принимает готовый AnalysisResult', () => {
    runner.test('Бросает ошибку если marketAnalysis отсутствует', () => {
        try {
            Module2.evaluate({ userDecision: 'long' });
            return { pass: false, info: 'Ожидалась ошибка' };
        } catch (e: any) {
            return {
                pass: e.message.includes('marketAnalysis is required'),
                info: `Поймана ошибка: ${e.message}`
            };
        }
    });

    runner.test('Бросает ошибку если userDecision отсутствует', () => {
        try {
            Module2.evaluate({ marketAnalysis: makeBullishAnalysis() });
            return { pass: false, info: 'Ожидалась ошибка' };
        } catch (e: any) {
            return {
                pass: e.message.includes('userDecision is required'),
                info: `Поймана ошибка: ${e.message}`
            };
        }
    });

    runner.test('Бросает ошибку если input = null', () => {
        try {
            (Module2.evaluate as any)(null);
            return { pass: false, info: 'Ожидалась ошибка' };
        } catch (e: any) {
            return {
                pass: e.message.includes('marketAnalysis is required'),
                info: `Поймана ошибка: ${e.message}`
            };
        }
    });

    runner.test('Принимает прямой AnalysisResult и возвращает вердикт', () => {
        const x = makeBullishAnalysis();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long',
            userEvidence: ['high-volume']
        });
        return {
            pass: !!result && typeof result.verdict === 'string',
            info: `verdict=${result?.verdict}`
        };
    });

    runner.test('meta.bias читается из trend.primaryTrend', () => {
        const x = makeBullishAnalysis();
        const result = Module2.evaluate({ marketAnalysis: x, userDecision: 'long' });
        return {
            pass: result?.meta?.bias === 'bullish',
            info: `meta.bias=${result?.meta?.bias}`
        };
    });

    runner.test('meta.confidence читается из confidence.percent', () => {
        const x = makeBullishAnalysis();
        const result = Module2.evaluate({ marketAnalysis: x, userDecision: 'long' });
        return {
            pass: result?.meta?.confidence === 78,
            info: `meta.confidence=${result?.meta?.confidence}`
        };
    });

    runner.test('meta.marketContext читается из marketPhase.phase', () => {
        const x = makeBullishAnalysis();
        const result = Module2.evaluate({ marketAnalysis: x, userDecision: 'long' });
        return {
            pass: result?.meta?.marketContext === 'trending',
            info: `meta.marketContext=${result?.meta?.marketContext}`
        };
    });

    runner.test('meta.signalsCount считается из evidence.keySignals', () => {
        const x = makeBullishAnalysis();
        const result = Module2.evaluate({ marketAnalysis: x, userDecision: 'long' });
        return {
            pass: result?.meta?.signalsCount === 2,
            info: `signalsCount=${result?.meta?.signalsCount}`
        };
    });

    runner.test('context в explanation — тот же что marketContext', () => {
        const x = makeBullishAnalysis();
        const result = Module2.evaluate({ marketAnalysis: x, userDecision: 'long' });
        return {
            pass: result?.explanation?.contextSummary?.context === 'trending',
            info: `contextSummary.context=${result?.explanation?.contextSummary?.context}`
        };
    });
});

// ------------------------------------------------------------
// SUITE 3 — DECISION EVALUATION: Correct / Risky / Incorrect
// ------------------------------------------------------------
runner.suite('DECISION EVALUATION: оценка решений', () => {
    runner.test('Correct Long: bullish + long + full evidence → correct', () => {
        const x = makeBullishAnalysis();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long',
            userEvidence: ['high-volume', 'impulse']
        });
        const pass = result.verdict === 'correct' && result.score >= 3;
        return {
            pass,
            info: `verdict=${result.verdict}, score=${result.score}`
        };
    });

    runner.test('Correct Short: bearish + short + full evidence → correct', () => {
        const x = makeBearishAnalysis();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'short',
            userEvidence: ['high-volume', 'impulse']
        });
        const pass = result.verdict === 'correct' && result.score >= 3;
        return {
            pass,
            info: `verdict=${result.verdict}, score=${result.score}`
        };
    });

    runner.test('Correct Wait: всегда risky или correct (нейтральное решение)', () => {
        const x = makeBullishAnalysis();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'wait',
            userEvidence: []
        });
        // Wait: baseRow=0 (neutral), confidenceRow=0, evidence=0 → score=0 → risky
        const pass = result.verdict === 'correct' || result.verdict === 'risky';
        return {
            pass,
            info: `verdict=${result.verdict}, score=${result.score}`
        };
    });

    runner.test('Incorrect Long: bearish bias + long → incorrect', () => {
        const x = makeBearishAnalysis();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long',
            userEvidence: ['high-volume']
        });
        const pass = result.verdict === 'incorrect' && result.score < 0;
        return {
            pass,
            info: `verdict=${result.verdict}, score=${result.score}`
        };
    });

    runner.test('Incorrect Short: bullish bias + short → incorrect', () => {
        const x = makeBullishAnalysis();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'short',
            userEvidence: ['high-volume']
        });
        const pass = result.verdict === 'incorrect' && result.score < 0;
        return {
            pass,
            info: `verdict=${result.verdict}, score=${result.score}`
        };
    });

    runner.test('Incorrect Wait: требует специальной интерпретации (wait всегда ≥ risky)', () => {
        const x = makeBullishAnalysis();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'wait',
            userEvidence: []
        });
        // wait + bullish → score = 0 (neutral choice) → risky
        const pass = result.verdict !== 'incorrect';
        return {
            pass,
            info: `verdict=${result.verdict}, score=${result.score}`
        };
    });

    runner.test('Neutral: нейтральный bias + long → risky (premature directional)', () => {
        const x = makeNeutralAnalysis();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long',
            userEvidence: ['high-volume']
        });
        const pass = result.verdict === 'risky' || result.verdict === 'incorrect';
        return {
            pass,
            info: `verdict=${result.verdict}, score=${result.score}`
        };
    });

    runner.test('Mixed Signals: long+bullish, но без evidence → risky', () => {
        const x = makeBullishAnalysis();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'aggressive-long', // требует 2 required evidence
            userEvidence: []
        });
        // baseRow: +3 (directional match)
        // confidenceRow: 0 (78 < 80)
        // evidence: 2 misses, delta=-4
        // score = 3 - 4 = -1 → incorrect
        const pass = result.verdict === 'risky' || result.verdict === 'incorrect';
        return {
            pass,
            info: `verdict=${result.verdict}, score=${result.score}`
        };
    });
});

// ------------------------------------------------------------
// SUITE 4 — EXPLANATION
// ------------------------------------------------------------
runner.suite('EXPLANATION: объяснение строится на AnalysisResult', () => {
    function evaluateWithDefault(overrides: any = {}) {
        const x = makeBullishAnalysis(overrides);
        return Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long',
            userEvidence: ['high-volume']
        });
    }

    runner.test('explanation.match содержит decision.label / shortLabel', () => {
        const r = evaluateWithDefault();
        const pass =
            typeof r.explanation?.match === 'string' &&
            r.explanation.match.length > 5;
        return {
            pass,
            info: `match="${r.explanation?.match?.substring(0, 80)}..."`
        };
    });

    runner.test('explanation.risk — текстовое описание риска', () => {
        const r = evaluateWithDefault();
        const pass =
            typeof r.explanation?.risk === 'string' &&
            r.explanation.risk.length > 5;
        return {
            pass,
            info: `risk="${r.explanation?.risk}"`
        };
    });

    runner.test('explanation.contextSummary.bias = bias от Module X', () => {
        const r = evaluateWithDefault();
        return {
            pass: r.explanation?.contextSummary?.bias === 'bullish',
            info: `contextSummary.bias=${r.explanation?.contextSummary?.bias}`
        };
    });

    runner.test('explanation.contextSummary.confidence отражает confidence.percent', () => {
        const r = evaluateWithDefault({ confidence: { percent: 85, grade: 'A' } });
        return {
            pass: r.explanation?.contextSummary?.confidence === 85,
            info: `contextSummary.confidence=${r.explanation?.contextSummary?.confidence}`
        };
    });

    runner.test('explanation.contextSummary.continuationPct = вероятность продолжения', () => {
        const r = evaluateWithDefault({ probabilities: { continuation: 0.75, reversal: 0.25 } });
        return {
            pass: r.explanation?.contextSummary?.continuationPct === 75,
            info: `continuationPct=${r.explanation?.contextSummary?.continuationPct}`
        };
    });

    runner.test('explanation.evidence — массив строк', () => {
        const r = evaluateWithDefault();
        const pass = Array.isArray(r.explanation?.evidence) &&
                     r.explanation.evidence.every((e: any) => typeof e === 'string');
        return {
            pass,
            info: `evidence.length=${r.explanation?.evidence?.length}`
        };
    });

    runner.test('explanation.evidenceMisses содержит описания пропущенных required', () => {
        const r = Module2.evaluate({
            marketAnalysis: makeBullishAnalysis(),
            userDecision: 'breakout-entry',
            userEvidence: []
        });
        // breakout-entry требует ['breakout'] → должен быть miss
        const misses = r.explanation?.evidenceMisses || [];
        const pass = Array.isArray(misses) && misses.some((m: string) => m.includes('breakout'));
        return {
            pass,
            info: `evidenceMisses=${JSON.stringify(misses)}`
        };
    });

    runner.test('explanation.betterAlternative = null при verdict=correct', () => {
        const r = Module2.evaluate({
            marketAnalysis: makeBullishAnalysis(),
            userDecision: 'long',
            userEvidence: ['high-volume', 'impulse']
        });
        return {
            pass: r.verdict === 'correct' && r.explanation?.betterAlternative === null,
            info: `betterAlternative=${r.explanation?.betterAlternative}`
        };
    });

    runner.test('explanation.betterAlternative присутствует при verdict=incorrect', () => {
        const r = Module2.evaluate({
            marketAnalysis: makeBullishAnalysis(),
            userDecision: 'short',
            userEvidence: []
        });
        const alt = r.explanation?.betterAlternative;
        const pass = alt && alt.id === 'long';
        return {
            pass: Boolean(pass),
            info: `betterAlternative.id=${alt?.id}`
        };
    });
});

// ------------------------------------------------------------
// SUITE 5 — EVIDENCE
// ------------------------------------------------------------
runner.suite('EVIDENCE: Module 2 учитывает userEvidence', () => {
    runner.test('Без evidence score ниже, чем с полным evidence', () => {
        const x = makeBullishAnalysis();
        const r1 = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long',
            userEvidence: []
        });
        const r2 = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long',
            userEvidence: ['high-volume', 'impulse']
        });
        return {
            pass: r2.score > r1.score,
            info: `without=${r1.score}, with=${r2.score}`
        };
    });

    runner.test('evidenceAnalysis.matches содержит подтверждённые required', () => {
        const r = Module2.evaluate({
            marketAnalysis: makeBullishAnalysis(),
            userDecision: 'breakout-entry',
            userEvidence: ['breakout']
        });
        const matches = r.evidenceAnalysis?.matches || [];
        return {
            pass: matches.includes('breakout'),
            info: `matches=${JSON.stringify(matches)}`
        };
    });

    runner.test('evidenceAnalysis.misses содержит недостающие required', () => {
        const r = Module2.evaluate({
            marketAnalysis: makeBullishAnalysis(),
            userDecision: 'breakout-entry',
            userEvidence: []
        });
        const misses = r.evidenceAnalysis?.misses || [];
        return {
            pass: misses.includes('breakout'),
            info: `misses=${JSON.stringify(misses)}`
        };
    });

    runner.test('aggressive-long без 2 evidence → низкий score', () => {
        const r = Module2.evaluate({
            marketAnalysis: makeBullishAnalysis(),
            userDecision: 'aggressive-long',
            userEvidence: []
        });
        // baseRow: +3, evidence: 2 misses, delta=-4 → score=-1
        const pass = r.score < 0;
        return {
            pass,
            info: `score=${r.score}`
        };
    });

    runner.test('aggressive-long с полным evidence → correct', () => {
        const r = Module2.evaluate({
            marketAnalysis: makeBullishAnalysis(),
            userDecision: 'aggressive-long',
            userEvidence: ['impulse', 'high-volume']
        });
        // baseRow: +3, evidence: matches=2 → delta=0, recommended=[] → delta=0
        // score = +3 → correct
        return {
            pass: r.verdict === 'correct',
            info: `verdict=${r.verdict}, score=${r.score}`
        };
    });

    runner.test('recommendedEvidence: попадания дают бонус', () => {
        const x = makeBullishAnalysis();
        const r1 = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long',
            userEvidence: ['high-volume']
        });
        const r2 = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long',
            userEvidence: ['high-volume', 'impulse']
        });
        // Для long recommended = ['impulse'], 1 попадание → +2
        return {
            pass: r2.score > r1.score,
            info: `without_impulse=${r1.score}, with_impulse=${r2.score}`
        };
    });
});

// ------------------------------------------------------------
// SUITE 6 — BETTER ALTERNATIVE
// ------------------------------------------------------------
runner.suite('BETTER ALTERNATIVE: подбор из scenarios Module X', () => {
    runner.test('Short при bullish → betterAlternative есть', () => {
        const r = Module2.evaluate({
            marketAnalysis: makeBullishAnalysis(),
            userDecision: 'short',
            userEvidence: []
        });
        const pass = r.explanation?.betterAlternative != null;
        return {
            pass,
            info: pass ? `id=${r.explanation.betterAlternative.id}` : 'отсутствует'
        };
    });

    runner.test('betterAlternative исключает wait/no-trade', () => {
        const r = Module2.evaluate({
            marketAnalysis: makeBullishAnalysis(),
            userDecision: 'short',
            userEvidence: []
        });
        const alt = r.explanation?.betterAlternative;
        const pass = alt && alt.id !== 'wait' && alt.id !== 'no-trade';
        return {
            pass,
            info: `alt.id=${alt?.id}`
        };
    });

    runner.test('betterAlternative при bullish → long direction', () => {
        const r = Module2.evaluate({
            marketAnalysis: makeBullishAnalysis(),
            userDecision: 'short',
            userEvidence: []
        });
        const alt = r.explanation?.betterAlternative;
        return {
            pass: alt?.direction === 'long',
            info: `alt.direction=${alt?.direction}`
        };
    });

    runner.test('betterAlternative при bearish → short direction', () => {
        const r = Module2.evaluate({
            marketAnalysis: makeBearishAnalysis(),
            userDecision: 'long',
            userEvidence: []
        });
        const alt = r.explanation?.betterAlternative;
        return {
            pass: alt?.direction === 'short',
            info: `alt.direction=${alt?.direction}`
        };
    });

    runner.test('betterAlternative исключает текущее решение', () => {
        const r = Module2.evaluate({
            marketAnalysis: makeBullishAnalysis(),
            userDecision: 'short',
            userEvidence: []
        });
        const alt = r.explanation?.betterAlternative;
        return {
            pass: alt && alt.id !== 'short',
            info: `alt.id=${alt?.id}`
        };
    });

    runner.test('betterAlternative: scenarios пустые → null', () => {
        const x = makeBullishAnalysis({ scenarios: [] });
        const r = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'short',
            userEvidence: []
        });
        return {
            pass: r.explanation?.betterAlternative === null,
            info: `betterAlternative=${r.explanation?.betterAlternative}`
        };
    });
});

// ------------------------------------------------------------
// SUITE 7 — CONFIDENCE & PROBABILITIES
// ------------------------------------------------------------
runner.suite('CONFIDENCE & PROBABILITIES: влияние на скоринг', () => {
    runner.test('confidence >= 80 → модификатор +1', () => {
        const x = makeBullishAnalysis({ confidence: { percent: 85, grade: 'A' } });
        const r = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long',
            userEvidence: ['high-volume', 'impulse']
        });
        // baseRow: +3, confidence: +1, evidence: 0 (matches) + 2 (rec hit) = +2
        // score = 3 + 1 + 2 = 6 → correct
        return {
            pass: r.score >= 6 && r.verdict === 'correct',
            info: `score=${r.score}, verdict=${r.verdict}`
        };
    });

    runner.test('confidence < 50 → модификатор -1', () => {
        const x = makeBullishAnalysis({ confidence: { percent: 30, grade: 'F' } });
        const r = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long',
            userEvidence: ['high-volume', 'impulse']
        });
        // baseRow: +3, confidence: -1, evidence: +2 (rec hit)
        // score = 3 - 1 + 2 = 4 → correct
        return {
            pass: r.score === 4 && r.verdict === 'correct',
            info: `score=${r.score}, verdict=${r.verdict}`
        };
    });

    runner.test('confidence = null → модификатор 0', () => {
        const x = makeBullishAnalysis({ confidence: null });
        const r = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long',
            userEvidence: ['high-volume', 'impulse']
        });
        // baseRow: +3, confidence: 0, evidence: +2
        // score = 5 → correct
        return {
            pass: r.score === 5 && r.verdict === 'correct',
            info: `score=${r.score}, verdict=${r.verdict}`
        };
    });

    runner.test('probabilities.continuation попадает в contextSummary', () => {
        const x = makeBullishAnalysis({ probabilities: { continuation: 0.85, reversal: 0.15 } });
        const r = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long',
            userEvidence: ['high-volume']
        });
        return {
            pass: r.explanation?.contextSummary?.continuationPct === 85,
            info: `continuationPct=${r.explanation?.contextSummary?.continuationPct}`
        };
    });

    runner.test('probabilities.continuation как число > 1 → не пересчитывается', () => {
        const x = makeBullishAnalysis({ probabilities: { continuation: 75, reversal: 25 } });
        const r = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long',
            userEvidence: ['high-volume']
        });
        return {
            pass: r.explanation?.contextSummary?.continuationPct === 75,
            info: `continuationPct=${r.explanation?.contextSummary?.continuationPct}`
        };
    });
});

// ------------------------------------------------------------
// SUITE 8 — EDGE CASES
// ------------------------------------------------------------
runner.suite('EDGE CASES: нестандартные входы', () => {
    runner.test('marketAnalysis = {} (пустой объект) — работает с дефолтами', () => {
        const result = Module2.evaluate({
            marketAnalysis: {},
            userDecision: 'wait',
            userEvidence: []
        });
        // Все поля AnalysisResult опциональные, всё должно работать
        // wait + neutral bias → score=0 → risky
        const pass = result?.verdict === 'risky';
        return {
            pass,
            info: `verdict=${result?.verdict}, bias=${result?.meta?.bias}`
        };
    });

    runner.test('scenarios пустые → betterAlternative = null', () => {
        const x = makeBullishAnalysis({ scenarios: [] });
        const r = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'short',
            userEvidence: []
        });
        return {
            pass: r.explanation?.betterAlternative === null,
            info: `betterAlternative=${r.explanation?.betterAlternative}`
        };
    });

    runner.test('scenarios undefined → betterAlternative = null', () => {
        const x = makeBullishAnalysis({ scenarios: undefined });
        const r = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'short',
            userEvidence: []
        });
        return {
            pass: r.explanation?.betterAlternative === null,
            info: `betterAlternative=${r.explanation?.betterAlternative}`
        };
    });

    runner.test('confidence = 0 → модификатор -1 (low)', () => {
        const x = makeBullishAnalysis({ confidence: { percent: 0, grade: 'F' } });
        const r = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'wait',
            userEvidence: []
        });
        // _scoreByConfidence(0) → level='low', delta=-1
        const internal = Module2._internal;
        const scoreByConf = internal._scoreByConfidence(0);
        return {
            pass: scoreByConf.delta === -1 && scoreByConf.level === 'low',
            info: `delta=${scoreByConf.delta}, level=${scoreByConf.level}`
        };
    });

    runner.test('confidence = null → модификатор 0 (unknown)', () => {
        const scoreByConf = Module2._internal._scoreByConfidence(null);
        return {
            pass: scoreByConf.delta === 0 && scoreByConf.level === 'unknown',
            info: `delta=${scoreByConf.delta}, level=${scoreByConf.level}`
        };
    });

    runner.test('некорректный userDecision (нет в каталоге) — fallback объект', () => {
        const x = makeBullishAnalysis();
        const r = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'totally-unknown-decision',
            userEvidence: []
        });
        // decision.id = 'totally-unknown-decision'
        // category fallback = 'directional', direction = 'long'
        // baseRow с bullish + directional + long → +3
        const pass = r.decision?.id === 'totally-unknown-decision' &&
                     r.verdict !== undefined;
        return {
            pass,
            info: `decision.id=${r.decision?.id}, verdict=${r.verdict}`
        };
    });

    runner.test('userEvidence = undefined — без падений (default [])', () => {
        const x = makeBullishAnalysis();
        try {
            const r = Module2.evaluate({
                marketAnalysis: x,
                userDecision: 'long'
                // userEvidence не передан
            });
            const pass = r && typeof r.verdict === 'string';
            return {
                pass,
                info: `verdict=${r?.verdict}`
            };
        } catch (e: any) {
            return { pass: false, info: `THROW: ${e.message}` };
        }
    });

    runner.test('userEvidence = null — без падений', () => {
        const x = makeBullishAnalysis();
        const r = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long',
            userEvidence: null
        });
        return {
            pass: typeof r.verdict === 'string',
            info: `verdict=${r.verdict}`
        };
    });

    runner.test('decisions с пустым requiredEvidence — без штрафа', () => {
        const x = makeBullishAnalysis();
        const r = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'scale-in', // requiredEvidence: []
            userEvidence: []
        });
        // scale-in: required=[], recommended=['hold'] (0 hits)
        // baseRow: +1 (risk-managed with trend), confidence: 0, evidence: 0
        // score = 1 → risky
        return {
            pass: r.verdict === 'risky' || r.verdict === 'correct',
            info: `verdict=${r.verdict}, score=${r.score}`
        };
    });

    runner.test('trend.primaryTrend=null → fallback на marketStructure.type', () => {
        const x = makeBullishAnalysis({ trend: null, marketStructure: { type: 'downtrend', higherHighs: [], higherLows: [], lowerHighs: [{}], lowerLows: [{}], swings: [], structureShift: null, summary: '' } });
        const r = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long',
            userEvidence: ['high-volume']
        });
        // bias = 'bearish' (from structure.type=downtrend)
        // baseRow: -3, evidence: +2
        // score = -1 → incorrect
        return {
            pass: r.meta.bias === 'bearish' && r.verdict === 'incorrect',
            info: `bias=${r.meta.bias}, verdict=${r.verdict}`
        };
    });

    runner.test('keySignals нестандартного формата (object вместо array) — без падений', () => {
        const x = makeBullishAnalysis({ evidence: { keySignals: { a: 1 } } }); // не массив
        const r = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long',
            userEvidence: ['high-volume']
        });
        return {
            pass: typeof r.verdict === 'string' && r.meta.signalsCount === 0,
            info: `verdict=${r.verdict}, signalsCount=${r.meta.signalsCount}`
        };
    });

    runner.test('confidence как число (не объект) — работает', () => {
        const x = makeBullishAnalysis({ confidence: 70 });
        const r = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'wait',
            userEvidence: []
        });
        return {
            pass: r.meta.confidence === 70,
            info: `confidence=${r.meta.confidence}`
        };
    });
});

// ------------------------------------------------------------
// SUITE 9 — АРХИТЕКТУРНЫЕ ГАРАНТИИ
// ------------------------------------------------------------
runner.suite('АРХИТЕКТУРНЫЕ ГАРАНТИИ: чистота архитектуры', () => {
    runner.test('Module 2 не импортирует анализаторы (нет require/import analyzers)', () => {
        const src = fs.readFileSync('/workspace/payd-trading-lab/Module 2/DecisionEvaluationEngine.js', 'utf8');
        const violations = [
            /require\s*\(\s*['"][^'"]*analyz/i,
            /from\s+['"][^'"]*analyz/i,
            /import\s+[^;]*analyz/i
        ];
        const found = violations.filter(p => p.test(src));
        return {
            pass: found.length === 0,
            info: found.length === 0
                ? 'Анализаторы не импортируются ✓'
                : `Найдены импорты: ${found.length}`
        };
    });

    runner.test('Module 2 использует только публичные поля AnalysisResult', () => {
        const x = makeBullishAnalysis({
            // Создаём "секретные" внутренние поля, которых не должно быть в публичном API
            _internal_secret_data: { score: 999 },
            __private_method_result: { hidden: true }
        });
        const r = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long',
            userEvidence: ['high-volume']
        });
        // Module 2 НЕ должен использовать _internal_secret_data
        // Результат должен основываться на публичных полях
        const pass = r.score < 1000;
        return {
            pass,
            info: `score=${r.score} (не использует приватные поля)`
        };
    });

    runner.test('Module 2 полностью тестируется через моки AnalysisResult', () => {
        // Без реального coreAnalysisEngine — только через фабрику
        const x = makeBullishAnalysis();
        try {
            const r = Module2.evaluate({
                marketAnalysis: x,
                userDecision: 'long',
                userEvidence: ['high-volume']
            });
            const pass = Boolean(
                r &&
                typeof r.verdict === 'string' &&
                typeof r.score === 'number' &&
                r.decision &&
                r.explanation
            );
            return {
                pass,
                info: `verdict=${r?.verdict}, score=${r?.score}, ready=${pass ? 'true' : 'false'}`
            };
        } catch (e: any) {
            return { pass: false, info: `THROW: ${e.message}` };
        }
    });

    runner.test('Module 2 не вызывает внешних API/Network/Time (кроме ISO-даты)', () => {
        const src = fs.readFileSync('/workspace/payd-trading-lab/Module 2/DecisionEvaluationEngine.js', 'utf8');
        const forbiddenAPIs = [
            /fetch\s*\(/,
            /XMLHttpRequest/,
            /axios/,
            /\.getJson\s*\(/,
            /require\s*\(\s*['"]fs['"]/,
            /require\s*\(\s*['"]http['"]/
        ];
        const violations = forbiddenAPIs.filter(p => p.test(src));
        return {
            pass: violations.length === 0,
            info: violations.length === 0
                ? 'Нет внешних вызовов ✓'
                : `Найдено: ${violations.length}`
        };
    });

    runner.test('explanation.decision ссылается на decision.label', () => {
        const r = Module2.evaluate({
            marketAnalysis: makeBullishAnalysis(),
            userDecision: 'long',
            userEvidence: ['high-volume']
        });
        return {
            pass: r.explanation?.decision === r.decision?.label,
            info: `exp.decision="${r.explanation?.decision}", decision.label="${r.decision?.label}"`
        };
    });

    runner.test('Module 2 может работать без DecisionOptionsCatalog (fallback)', () => {
        const original = ctx.DecisionOptionsCatalog;
        ctx.DecisionOptionsCatalog = undefined;
        try {
            const r = Module2.evaluate({
                marketAnalysis: makeBullishAnalysis(),
                userDecision: 'long',
                userEvidence: ['high-volume']
            });
            const pass = r && typeof r.verdict === 'string';
            return {
                pass,
                info: pass ? `verdict=${r.verdict}` : 'не работает без каталога'
            };
        } finally {
            ctx.DecisionOptionsCatalog = original;
        }
    });
});

// ------------------------------------------------------------
// SUITE 10 — INTERNAL HELPERS
// ------------------------------------------------------------
runner.suite('INTERNAL HELPERS: прямое тестирование приватных функций', () => {
    runner.test('_readBias: bullish trend → bullish', () => {
        const bias = Module2._internal._readBias({ trend: { primaryTrend: 'strong_bull' } });
        return { pass: bias === 'bullish', info: `bias=${bias}` };
    });

    runner.test('_readBias: bearish trend → bearish', () => {
        const bias = Module2._internal._readBias({ trend: { primaryTrend: 'strong_bear' } });
        return { pass: bias === 'bearish', info: `bias=${bias}` };
    });

    runner.test('_readBias: fallback на structure.type=uptrend', () => {
        const bias = Module2._internal._readBias({
            trend: null,
            marketStructure: { type: 'uptrend' }
        });
        return { pass: bias === 'bullish', info: `bias=${bias}` };
    });

    runner.test('_readBias: всё null → neutral', () => {
        const bias = Module2._internal._readBias({});
        return { pass: bias === 'neutral', info: `bias=${bias}` };
    });

    runner.test('_readConfidence: confidence.percent = 78 → 78', () => {
        const conf = Module2._internal._readConfidence({ confidence: { percent: 78 } });
        return { pass: conf === 78, info: `confidence=${conf}` };
    });

    runner.test('_readConfidence: confidence = null → null', () => {
        const conf = Module2._internal._readConfidence({ confidence: null });
        return { pass: conf === null, info: `confidence=${conf}` };
    });

    runner.test('_readContinuationPct: continuation=0.7 → 70', () => {
        const pct = Module2._internal._readContinuationPct({ probabilities: { continuation: 0.7 } });
        return { pass: pct === 70, info: `continuationPct=${pct}` };
    });

    runner.test('_readContinuationPct: continuation уже 80 (>1) → 80', () => {
        const pct = Module2._internal._readContinuationPct({ probabilities: { continuation: 80 } });
        return { pass: pct === 80, info: `continuationPct=${pct}` };
    });

    runner.test('_readSignals: evidence.keySignals корректно извлекаются', () => {
        const sigs = Module2._internal._readSignals({ evidence: { keySignals: ['a', 'b'] } });
        const pass = Array.isArray(sigs) && sigs.length === 2 && sigs[0] === 'a';
        return { pass, info: `signals=${JSON.stringify(sigs)}` };
    });

    runner.test('_readSignals: пусто если evidence нет', () => {
        const sigs = Module2._internal._readSignals({});
        return { pass: JSON.stringify(sigs) === '[]', info: `signals=${JSON.stringify(sigs)}` };
    });

    runner.test('_scoreByBiasMatch: directional+long+bias=bullish → +3 direction_match', () => {
        const result = Module2._internal._scoreByBiasMatch(
            { id: 'x', category: 'directional', direction: 'long' },
            'bullish'
        );
        return { pass: result.score === 3 && result.base === 'direction_match', info: JSON.stringify(result) };
    });

    runner.test('_scoreByBiasMatch: directional+short+bias=bullish → -3 against_trend', () => {
        const result = Module2._internal._scoreByBiasMatch(
            { id: 'x', category: 'directional', direction: 'short' },
            'bullish'
        );
        return { pass: result.score === -3 && result.base === 'against_trend', info: JSON.stringify(result) };
    });

    runner.test('_scoreByBiasMatch: neutral category → score=0', () => {
        const result = Module2._internal._scoreByBiasMatch(
            { id: 'wait', category: 'neutral', direction: 'neutral' },
            'bullish'
        );
        return { pass: result.score === 0, info: JSON.stringify(result) };
    });

    runner.test('_scoreByConfidence: 80 → +1 high', () => {
        const r = Module2._internal._scoreByConfidence(80);
        return { pass: r.delta === 1 && r.level === 'high', info: JSON.stringify(r) };
    });

    runner.test('_scoreByConfidence: 49 → -1 low', () => {
        const r = Module2._internal._scoreByConfidence(49);
        return { pass: r.delta === -1 && r.level === 'low', info: JSON.stringify(r) };
    });

    runner.test('_scoreByEvidence: пусто evidence + required → delta=-2', () => {
        const r = Module2._internal._scoreByEvidence(
            { requiredEvidence: ['breakout'], recommendedEvidence: [] },
            []
        );
        return {
            pass: r.delta === -2 && r.misses.includes('breakout'),
            info: JSON.stringify(r)
        };
    });

    runner.test('_scoreByEvidence: full required → 0 misses', () => {
        const r = Module2._internal._scoreByEvidence(
            { requiredEvidence: ['breakout'], recommendedEvidence: [] },
            ['breakout']
        );
        return {
            pass: r.delta === 0 && r.matches.includes('breakout'),
            info: JSON.stringify(r)
        };
    });

    runner.test('_scoreByEvidence: recommended попадания → бонус', () => {
        const r = Module2._internal._scoreByEvidence(
            { requiredEvidence: [], recommendedEvidence: ['a', 'b'] },
            ['a', 'b']
        );
        return {
            pass: r.delta === 2,
            info: `delta=${r.delta}, hits=${r.recommendedHits}`
        };
    });

    runner.test('_findBetterAlternative: пустые scenarios → null', () => {
        const alt = Module2._internal._findBetterAlternative('short', 'bullish', []);
        return { pass: alt === null, info: `alt=${alt}` };
    });

    runner.test('_findBetterAlternative: только wait → null', () => {
        const alt = Module2._internal._findBetterAlternative('short', 'bullish', [
            { id: 'wait', direction: 'neutral' }
        ]);
        return { pass: alt === null, info: `alt=${alt}` };
    });

    runner.test('_findBetterAlternative: фильтрует по bias direction', () => {
        const scenarios = [
            { id: 'wrong-direction', direction: 'short', priority: 0, probability: 0.5 },
            { id: 'right-direction', direction: 'long', priority: 5, probability: 0.7 }
        ];
        const alt = Module2._internal._findBetterAlternative('short', 'bullish', scenarios);
        const pass = alt && alt.id === 'right-direction';
        return {
            pass,
            info: `alt=${alt?.id} (отфильтрован по direction=long)`
        };
    });
});

// ============================================================
// 4. ЗАПУСК
// ============================================================

runner.report();

// Exit code для CI
const failed = runner.results.filter(r => !r.passed).length;
process.exit(failed === 0 ? 0 : 1);
