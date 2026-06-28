// ============================================================
// Module 2 — Интеграционные тесты после интеграции с Module X
// ============================================================
// Цель: доказать, что DecisionEvaluationEngine (Module 2):
//   1. НЕ содержит собственного анализа графика
//   2. НЕ вызывает coreAnalysisEngine.analyzeMarket()
//   3. Только принимает готовый AnalysisResult и оценивает решение
//   4. Корректно выдаёт verdict на основе данных Module X
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
        const totalDuration = this.results.reduce((s, r) => r.duration + s, 0);

        console.log(`\n${'═'.repeat(70)}`);
        console.log(`  ИТОГОВЫЙ ОТЧЁТ — MODULE 2`);
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
console.log('║  MODULE 2 — ТЕСТЫ ИНТЕГРАЦИИ С MODULE X                          ║');
console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

console.log('[Загрузка] Загрузка Module 2 (DecisionEvaluationEngine.js)...');
const fs = require('fs');

// Загружаем Module 2 (он не требует Module X как глобальный объект —
// только принимает готовый AnalysisResult через marketAnalysis)
const module2Code = fs.readFileSync('/workspace/public/js/DecisionEvaluationEngine.js', 'utf8');

// Mock DecisionOptionsCatalog для тестов evidence
const catalogMock: any = {
    getDecisionById: (id: string) => {
        const catalog: any = {
            'breakout-entry': { id: 'breakout-entry', label: 'Breakout Entry', shortLabel: 'BREAK', direction: 'long', category: 'conditional', riskLevel: 'medium', entryStyle: 'on-breakout', requiredEvidence: ['breakout'], recommendedEvidence: ['high-volume', 'hold'], rrExpectation: '1:3' },
            'long': { id: 'long', label: 'Long', shortLabel: 'LONG', direction: 'long', category: 'directional', riskLevel: 'medium', entryStyle: 'immediate', requiredEvidence: ['high-volume'], recommendedEvidence: ['impulse'], rrExpectation: '1:2' },
            'short': { id: 'short', label: 'Short', shortLabel: 'SHORT', direction: 'short', category: 'directional', riskLevel: 'medium', entryStyle: 'immediate', requiredEvidence: ['high-volume'], recommendedEvidence: ['impulse'], rrExpectation: '1:2' },
            'pullback-entry': { id: 'pullback-entry', label: 'Pullback Entry', shortLabel: 'PULLBCK', direction: 'long', category: 'conditional', riskLevel: 'medium', entryStyle: 'on-pullback', requiredEvidence: ['retest'], recommendedEvidence: ['hold'], rrExpectation: '1:3' },
            'aggressive-long': { id: 'aggressive-long', label: 'Aggressive Long', shortLabel: 'AGG-L', direction: 'long', category: 'directional', riskLevel: 'high', entryStyle: 'immediate', requiredEvidence: ['impulse', 'high-volume'], recommendedEvidence: [], rrExpectation: '1:2' },
            'conservative-long': { id: 'conservative-long', label: 'Conservative Long', shortLabel: 'CONSV-L', direction: 'long', category: 'directional', riskLevel: 'low', entryStyle: 'on-pullback', requiredEvidence: ['retest', 'hold'], recommendedEvidence: ['high-volume'], rrExpectation: '1:3' },
            'partial-position': { id: 'partial-position', label: 'Partial Position', shortLabel: 'PARTIAL', direction: 'long', category: 'risk-managed', riskLevel: 'low', entryStyle: 'on-pullback', requiredEvidence: ['retest'], recommendedEvidence: [], rrExpectation: '1:2' },
            'scale-in': { id: 'scale-in', label: 'Scale In', shortLabel: 'SCALE', direction: 'long', category: 'risk-managed', riskLevel: 'medium', entryStyle: 'on-pullback', requiredEvidence: [], recommendedEvidence: ['hold'], rrExpectation: '1:3' },
            'counter-trend': { id: 'counter-trend', label: 'Counter Trend', shortLabel: 'CTR-TR', direction: 'long', category: 'counter-trend', riskLevel: 'high', entryStyle: 'immediate', requiredEvidence: ['rejection'], recommendedEvidence: [], rrExpectation: '1:4' },
            'wait': { id: 'wait', label: 'Wait', shortLabel: 'WAIT', direction: 'neutral', category: 'neutral', riskLevel: 'low', entryStyle: 'wait', requiredEvidence: [], recommendedEvidence: [], rrExpectation: '0' },
            'no-trade': { id: 'no-trade', label: 'No Trade', shortLabel: 'NO-TR', direction: 'neutral', category: 'neutral', riskLevel: 'low', entryStyle: 'wait', requiredEvidence: [], recommendedEvidence: [], rrExpectation: '0' }
        };
        return catalog[id];
    }
};

// Создаём общую "песочницу"
const sharedGlobal: any = {
    DecisionEvaluationEngine: undefined,
    DecisionOptionsCatalog: catalogMock
};

const wrapper = `
(function () {
    var window = this;
    var global = this;
    var globalThis = this;

    // Загружаем Module 2
    ${module2Code}

    this.DecisionEvaluationEngine = (typeof DecisionEvaluationEngine !== 'undefined') ? DecisionEvaluationEngine : this.DecisionEvaluationEngine;
}).call(this);
`;

const wrapperFn = new Function(wrapper);
wrapperFn.call(sharedGlobal);

const Module2 = sharedGlobal.DecisionEvaluationEngine;

console.log('[Загрузка] Module 2 загружен ✓');
console.log(`[Проверка] Module 2 имеет evaluate: ${typeof Module2?.evaluate === 'function'}`);

// ============================================================
// 2. ТЕСТОВЫЙ ANALYSISRESULT (готовый результат Module X)
// ============================================================

interface AnalysisResultMock {
    summary: any;
    structure: any;
    smc: any;
    priceAction: any;
    trend: any;
    momentum: any;
    volume: any;
    liquidity: any;
    volatility: any;
    levels: any;
    probability: any;
    scenarios: any;
    interpretations: any;
    [key: string]: any;
}

function makeBullishAnalysisResult(): AnalysisResultMock {
    return {
        moduleXVersion: '1.0',
        analyzedAt: new Date().toISOString(),
        inputMeta: { candleCount: 50, level: 105 },
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
        scenarios: [
            {
                id: 'long',
                title: 'Long по тренду',
                direction: 'long',
                category: 'directional',
                riskLevel: 'medium',
                priority: 1,
                probability: 0.7,
                confirmations: ['breakout', 'high-volume'],
                riskRewardRatio: '1:2',
                description: 'Вход в лонг по восходящему тренду'
            },
            {
                id: 'breakout-entry',
                title: 'Breakout Entry',
                direction: 'long',
                category: 'conditional',
                riskLevel: 'medium',
                priority: 2,
                probability: 0.6,
                confirmations: ['breakout'],
                riskRewardRatio: '1:3',
                description: 'Вход на пробое уровня'
            },
            {
                id: 'aggressive-long',
                title: 'Aggressive Long',
                direction: 'long',
                category: 'directional',
                riskLevel: 'high',
                priority: 3,
                probability: 0.5,
                confirmations: ['impulse'],
                riskRewardRatio: '1:2',
                description: 'Агрессивный вход в лонг'
            },
            {
                id: 'wait',
                title: 'Wait',
                direction: 'neutral',
                category: 'neutral',
                riskLevel: 'low',
                priority: 99,
                probability: 0,
                confirmations: [],
                riskRewardRatio: '0',
                description: 'Ожидание'
            }
        ],
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

function makeBearishAnalysisResult(): AnalysisResultMock {
    const r = makeBullishAnalysisResult();
    r.structure.type = 'downtrend';
    r.structure.hh = 0; r.structure.hl = 0; r.structure.lh = 4; r.structure.ll = 3;
    r.trend.type = 'strong_bear';
    r.trend.strength = 80;
    r.momentum.strength = 75;
    r.momentum.description = 'Сильный медвежий моментум';
    r.probability = { bullish: 30, bearish: 70, confidence: 70 };
    r.scenarios = [
        {
            id: 'short',
            title: 'Short по тренду',
            direction: 'short',
            category: 'directional',
            riskLevel: 'medium',
            priority: 1,
            probability: 0.7,
            confirmations: ['breakout', 'high-volume'],
            riskRewardRatio: '1:2',
            description: 'Вход в шорт'
        },
        {
            id: 'wait',
            title: 'Wait',
            direction: 'neutral',
            category: 'neutral',
            riskLevel: 'low',
            priority: 99,
            probability: 0,
            confirmations: [],
            riskRewardRatio: '0',
            description: 'Ожидание'
        }
    ];
    r.interpretations.structureLabel = 'downtrend';
    r.interpretations.momentumSignal = 'bearish';
    r.summary = {
        context: 'downtrend',
        bias: 'bearish',
        confidence: 75,
        keySignals: ['downtrend_structure', 'strong_bearish_momentum'],
        reasons: ['Test reason'],
        probabilities: { continuation: 70, reversal: 30 }
    };
    return r;
}

function makeNeutralAnalysisResult(): AnalysisResultMock {
    const r = makeBullishAnalysisResult();
    r.structure.type = 'range';
    r.trend.type = 'range';
    r.trend.strength = 50;
    r.momentum.strength = 50;
    r.momentum.description = 'Нейтральный моментум';
    r.probability = { bullish: 50, bearish: 50, confidence: 50 };
    r.scenarios = [
        {
            id: 'wait',
            title: 'Wait',
            direction: 'neutral',
            category: 'neutral',
            riskLevel: 'low',
            priority: 99,
            probability: 0,
            confirmations: [],
            riskRewardRatio: '0',
            description: 'Ожидание'
        },
        {
            id: 'partial-position',
            title: 'Partial Position',
            direction: 'long',
            category: 'risk-managed',
            riskLevel: 'low',
            priority: 1,
            probability: 0.5,
            confirmations: ['retest'],
            riskRewardRatio: '1:2',
            description: 'Частичная позиция'
        }
    ];
    r.interpretations.structureLabel = 'range';
    r.interpretations.momentumSignal = 'neutral';
    r.summary = {
        context: 'range',
        bias: 'neutral',
        confidence: 50,
        keySignals: ['at_key_level'],
        reasons: ['Test reason'],
        probabilities: { continuation: 50, reversal: 50 }
    };
    return r;
}

// ============================================================
// 3. ТЕСТЫ
// ============================================================

const runner = new Module2TestRunner();

runner.suite('ARCHITECTURE: Module 2 не выполняет собственный анализ', () => {
    runner.test('В исходном коде Module 2 нет реального вызова analyzeMarket (вне комментариев)', () => {
        const src = fs.readFileSync('/workspace/public/js/DecisionEvaluationEngine.js', 'utf8');
        // Убираем JSDoc /* ... */ и однострочные // ... комментарии перед проверкой
        const stripped = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|\s)\/\/[^\n]*/g, '');
        const hasCall = /\.analyzeMarket\s*\(/.test(stripped);
        return {
            pass: !hasCall,
            info: !hasCall ? 'analyzeMarket() НЕ вызывается в коде ✓' : 'analyzeMarket() НАЙДЕН в коде — нарушение архитектуры!'
        };
    });

    runner.test('В исходном коде Module 2 нет собственных расчётов структуры', () => {
        const src = fs.readFileSync('/workspace/public/js/DecisionEvaluationEngine.js', 'utf8');
        const forbiddenPatterns = [
            /detectTrend\s*\(/,
            /detectBOS\s*\(/,
            /detectCHoCH\s*\(/,
            /detectPinBar\s*\(/,
            /calculateRSI\s*\(/,
            /swingHigh\s*\(/,
            /swingLow\s*\(/,
            /calculateATR\s*\(/
        ];
        const violations = forbiddenPatterns.filter(p => p.test(src));
        return {
            pass: violations.length === 0,
            info: violations.length === 0
                ? 'Нет собственной аналитики ✓'
                : `Найдены паттерны: ${violations.length}`
        };
    });

    runner.test('Module 2 принимает marketAnalysis как входной параметр', () => {
        const src = fs.readFileSync('/workspace/public/js/DecisionEvaluationEngine.js', 'utf8');
        const acceptsParam = /function\s+evaluate\s*\(\s*input\s*\)/.test(src)
                          && /input\.marketAnalysis/.test(src);
        return {
            pass: acceptsParam,
            info: acceptsParam
                ? 'evaluate(input) принимает marketAnalysis ✓'
                : 'evaluate() НЕ принимает marketAnalysis'
        };
    });
});

runner.suite('DATA FLOW: Module 2 принимает готовый AnalysisResult', () => {
    runner.test('Module 2 бросает ошибку если marketAnalysis отсутствует', () => {
        try {
            Module2.evaluate({ userDecision: 'long' });
            return { pass: false, info: 'Ожидалась ошибка, но не было' };
        } catch (e: any) {
            return {
                pass: e.message.includes('marketAnalysis is required'),
                info: `Поймана ошибка: ${e.message}`
            };
        }
    });

    runner.test('Module 2 бросает ошибку если userDecision отсутствует', () => {
        const market = makeBullishAnalysisResult();
        try {
            Module2.evaluate({ marketAnalysis: market });
            return { pass: false, info: 'Ожидалась ошибка, но не было' };
        } catch (e: any) {
            return {
                pass: e.message.includes('userDecision is required'),
                info: `Поймана ошибка: ${e.message}`
            };
        }
    });

    runner.test('Module 2 принимает прямой Module X output (с полями structure/summary/scenarios)', () => {
        const x = makeBullishAnalysisResult();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long'
        });
        return {
            pass: !!result && typeof result.verdict === 'string',
            info: `verdict=${result?.verdict}`
        };
    });

    runner.test('Module 2 принимает Module 1 output (с вложенным moduleXOutput)', () => {
        const x = makeBullishAnalysisResult();
        const module1Output = {
            context: x.summary.context,
            bias: x.summary.bias,
            moduleXOutput: x
        };
        const result = Module2.evaluate({
            marketAnalysis: module1Output,
            userDecision: 'long'
        });
        return {
            pass: !!result && typeof result.verdict === 'string',
            info: `verdict=${result?.verdict}`
        };
    });

    runner.test('Module 2 читает bias из AnalysisResult.summary.bias', () => {
        const x = makeBullishAnalysisResult();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long'
        });
        const biasInMeta = result?.meta?.bias === 'bullish';
        return {
            pass: biasInMeta,
            info: `meta.bias=${result?.meta?.bias}`
        };
    });

    runner.test('Module 2 читает confidence из AnalysisResult', () => {
        const x = makeBullishAnalysisResult();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long'
        });
        const confInMeta = result?.meta?.confidence === 75;
        return {
            pass: confInMeta,
            info: `meta.confidence=${result?.meta?.confidence}`
        };
    });

    runner.test('Module 2 читает keySignals из AnalysisResult', () => {
        const x = makeBullishAnalysisResult();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long'
        });
        const signalsCount = result?.meta?.signalsCount;
        return {
            pass: signalsCount === 2,
            info: `signalsCount=${signalsCount}`
        };
    });
});

runner.suite('SCORING: Module 2 корректно оценивает решения', () => {
    runner.test('Long при bullish bias → correct или risky', () => {
        const x = makeBullishAnalysisResult();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long'
        });
        const pass = result.verdict === 'correct' || result.verdict === 'risky';
        return {
            pass,
            info: `verdict=${result.verdict}, score=${result.score}`
        };
    });

    runner.test('Short при bullish bias → risky или incorrect', () => {
        const x = makeBullishAnalysisResult();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'short'
        });
        const pass = result.verdict === 'risky' || result.verdict === 'incorrect';
        return {
            pass,
            info: `verdict=${result.verdict}, score=${result.score}`
        };
    });

    runner.test('Short при bearish bias → correct или risky', () => {
        const x = makeBearishAnalysisResult();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'short'
        });
        const pass = result.verdict === 'correct' || result.verdict === 'risky';
        return {
            pass,
            info: `verdict=${result.verdict}, score=${result.score}`
        };
    });

    runner.test('Wait в любых условиях → correct или risky (нейтральная позиция)', () => {
        const x = makeBullishAnalysisResult();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'wait'
        });
        // Wait: category=neutral, score=0 → verdict='risky' по дизайну
        return {
            pass: result.verdict === 'correct' || result.verdict === 'risky',
            info: `verdict=${result.verdict}, score=${result.score}`
        };
    });

    runner.test('Score long при bullish должен быть >= 0', () => {
        const x = makeBullishAnalysisResult();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long'
        });
        return {
            pass: result.score >= 0,
            info: `score=${result.score}`
        };
    });

    runner.test('Score short при bullish должен быть отрицательным', () => {
        const x = makeBullishAnalysisResult();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'short'
        });
        return {
            pass: result.score < 0,
            info: `score=${result.score}`
        };
    });
});

runner.suite('EVIDENCE: Module 2 учитывает userEvidence', () => {
    runner.test('Без evidence — score ниже, чем с полным evidence', () => {
        const x = makeBullishAnalysisResult();
        // Для breakout-entry требуется evidence ['breakout']
        const withoutEvidence = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'breakout-entry',
            userEvidence: []
        });
        const withEvidence = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'breakout-entry',
            userEvidence: ['breakout', 'high-volume']
        });
        const pass = withEvidence.score > withoutEvidence.score;
        return {
            pass,
            info: `withoutEvidence.score=${withoutEvidence.score}, withEvidence.score=${withEvidence.score}`
        };
    });

    runner.test('evidenceAnalysis.matches содержит подтверждённые', () => {
        const x = makeBullishAnalysisResult();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'breakout-entry',
            userEvidence: ['breakout']
        });
        const hasMatch = Array.isArray(result.evidenceAnalysis?.matches)
                      && result.evidenceAnalysis.matches.includes('breakout');
        return {
            pass: hasMatch,
            info: `matches=${JSON.stringify(result.evidenceAnalysis?.matches)}`
        };
    });

    runner.test('evidenceAnalysis.misses содержит недостающие required', () => {
        const x = makeBullishAnalysisResult();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'breakout-entry',
            userEvidence: []
        });
        // Для breakout-entry из сценария: confirmations = ['breakout']
        // decision.requiredEvidence = ['breakout'] — должен попасть в misses
        const hasMiss = Array.isArray(result.evidenceAnalysis?.misses)
                     && result.evidenceAnalysis.misses.includes('breakout');
        return {
            pass: hasMiss,
            info: `misses=${JSON.stringify(result.evidenceAnalysis?.misses)}`
        };
    });
});

runner.suite('BETTER ALTERNATIVE: Module 2 подбирает из scenarios Module X', () => {
    runner.test('Short при bullish → betterAlternative есть из scenarios', () => {
        const x = makeBullishAnalysisResult();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'short',
            userEvidence: []
        });
        const hasAlternative = result.explanation?.betterAlternative !== null
                            && result.explanation?.betterAlternative !== undefined;
        return {
            pass: hasAlternative,
            info: hasAlternative
                ? `betterAlternative.id=${result.explanation.betterAlternative.id}`
                : 'betterAlternative=отсутствует'
        };
    });

    runner.test('betterAlternative берётся из AnalysisResult.scenarios', () => {
        const x = makeBullishAnalysisResult();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'short',
            userEvidence: []
        });
        const alt = result.explanation?.betterAlternative;
        const fromScenarios = alt && (alt.id === 'long' || alt.id === 'breakout-entry' || alt.id === 'aggressive-long');
        return {
            pass: Boolean(fromScenarios),
            info: `alt.id=${alt?.id}`
        };
    });

    runner.test('betterAlternative исключает wait/no-trade', () => {
        const x = makeBullishAnalysisResult();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'short',
            userEvidence: []
        });
        const alt = result.explanation?.betterAlternative;
        const isNotWait = alt && alt.id !== 'wait' && alt.id !== 'no-trade';
        return {
            pass: Boolean(isNotWait),
            info: `alt.id=${alt?.id}`
        };
    });

    runner.test('betterAlternative при bullish → long direction', () => {
        const x = makeBullishAnalysisResult();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'short',
            userEvidence: []
        });
        const alt = result.explanation?.betterAlternative;
        const isLong = alt && alt.direction === 'long';
        return {
            pass: Boolean(isLong),
            info: `alt.direction=${alt?.direction}`
        };
    });
});

runner.suite('SIGNALS: Module 2 реагирует на signals от Module X', () => {
    runner.test('Signal uptrend_structure улучшает long', () => {
        const xWithSignal = makeBullishAnalysisResult();
        xWithSignal.summary.keySignals = ['uptrend_structure'];

        const xWithoutSignal = makeBullishAnalysisResult();
        xWithoutSignal.summary.keySignals = [];

        const r1 = Module2.evaluate({ marketAnalysis: xWithSignal, userDecision: 'long' });
        const r2 = Module2.evaluate({ marketAnalysis: xWithoutSignal, userDecision: 'long' });

        const pass = r1.score > r2.score;
        return {
            pass,
            info: `with_signal=${r1.score}, without_signal=${r2.score}`
        };
    });

    runner.test('Signal strong_bullish_momentum улучшает long', () => {
        const xWithSignal = makeBullishAnalysisResult();
        xWithSignal.summary.keySignals = ['strong_bullish_momentum'];

        const xWithoutSignal = makeBullishAnalysisResult();
        xWithoutSignal.summary.keySignals = [];

        const r1 = Module2.evaluate({ marketAnalysis: xWithSignal, userDecision: 'long' });
        const r2 = Module2.evaluate({ marketAnalysis: xWithoutSignal, userDecision: 'long' });

        const pass = r1.score > r2.score;
        return {
            pass,
            info: `with_signal=${r1.score}, without_signal=${r2.score}`
        };
    });

    runner.test('Signal low_volume ухудшает long', () => {
        const xWithSignal = makeBullishAnalysisResult();
        xWithSignal.summary.keySignals = ['low_volume'];

        const xWithoutSignal = makeBullishAnalysisResult();
        xWithoutSignal.summary.keySignals = [];

        const r1 = Module2.evaluate({ marketAnalysis: xWithSignal, userDecision: 'long' });
        const r2 = Module2.evaluate({ marketAnalysis: xWithoutSignal, userDecision: 'long' });

        const pass = r1.score < r2.score;
        return {
            pass,
            info: `with_signal=${r1.score}, without_signal=${r2.score}`
        };
    });
});

runner.suite('CONTEXT PROPAGATION: Module 2 пробрасывает контекст Module X', () => {
    runner.test('explanation.contextSummary.bias = bias от Module X', () => {
        const x = makeBullishAnalysisResult();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long'
        });
        return {
            pass: result.explanation?.contextSummary?.bias === 'bullish',
            info: `contextSummary.bias=${result.explanation?.contextSummary?.bias}`
        };
    });

    runner.test('explanation.contextSummary.continuationPct = probabilities.continuation', () => {
        const x = makeBullishAnalysisResult();
        const result = Module2.evaluate({
            marketAnalysis: x,
            userDecision: 'long'
        });
        return {
            pass: result.explanation?.contextSummary?.continuationPct === 70,
            info: `continuationPct=${result.explanation?.contextSummary?.continuationPct}`
        };
    });
});

runner.report();
