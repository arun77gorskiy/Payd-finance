// ============================================================
// Комплексный тест всей системы Module X
// Тестирует все 9 модулей и поток данных через них.
// ============================================================

require('ts-node/register/transpile-only');
const { execSync } = require('child_process');

// 1. Компилируем все TypeScript файлы Module X в JS во временную папку
console.log('=== Этап 1: Компиляция модулей Module X ===');
try {
    execSync('npx tsc --outDir /tmp/module_x_compiled --project tsconfig.test.json', { stdio: 'inherit' });
    console.log('✓ Все модули скомпилированы без ошибок\n');
} catch (e) {
    const err = e as Error;
    console.error('✗ Ошибка компиляции:', err.message);
    process.exit(1);
}

// 2. Загружаем скомпилированные модули
console.log('=== Этап 2: Загрузка модулей ===');
const smartMoney = require('/tmp/module_x_compiled/public/js/core-analysis/analyzers/smartMoneyAnalyzer.js');
const priceAction = require('/tmp/module_x_compiled/public/js/core-analysis/analyzers/priceActionAnalyzer.js');
const volume = require('/tmp/module_x_compiled/public/js/core-analysis/analyzers/volumeAnalyzer.js');
const liquidity = require('/tmp/module_x_compiled/public/js/core-analysis/analyzers/liquidityAnalyzer.js');
const volatility = require('/tmp/module_x_compiled/public/js/core-analysis/analyzers/volatilityAnalyzer.js');
const sr = require('/tmp/module_x_compiled/public/js/core-analysis/analyzers/supportResistanceAnalyzer.js');
const confluenceEngine = require('/tmp/module_x_compiled/public/js/core-analysis/analyzers/confluenceEngine.js');
const probabilityEngine = require('/tmp/module_x_compiled/public/js/core-analysis/analyzers/probabilityEngine.js');
const confidenceEngine = require('/tmp/module_x_compiled/public/js/core-analysis/analyzers/confidenceEngine.js');
const scenarioGenerator = require('/tmp/module_x_compiled/public/js/core-analysis/analyzers/scenarioGenerator.js');
console.log('✓ 10 модулей загружены (4 анализатора + 1 PA + 4 движка + scenario)\n');

// 3. Генерация тестовых данных
console.log('=== Этап 3: Генерация тестовых данных ===');

function generateCandles(count: number, trend: 'up' | 'down' | 'range'): any[] {
    const candles: any[] = [];
    let price = 100;
    let t = Date.now() - count * 3600000;
    for (let i = 0; i < count; i++) {
        let open = price;
        let move;
        if (trend === 'up') move = (Math.random() - 0.35) * 1.2 + 0.1;
        else if (trend === 'down') move = (Math.random() - 0.65) * 1.2 - 0.1;
        else move = (Math.random() - 0.5) * 0.6;
        price = open + move;
        const high = Math.max(open, price) + Math.random() * 0.5;
        const low = Math.min(open, price) - Math.random() * 0.5;
        const close = price;
        const volume = 1000 + Math.random() * 500 + (Math.abs(move) > 0.8 ? 1000 : 0);
        candles.push({ time: t, open, high, low, close, volume });
        t += 3600000;
    }
    return candles;
}

const datasets = [
    { name: 'Uptrend', trend: 'up' as const, candles: generateCandles(120, 'up') },
    { name: 'Downtrend', trend: 'down' as const, candles: generateCandles(120, 'down') },
    { name: 'Range', trend: 'range' as const, candles: generateCandles(120, 'range') }
];

console.log(`✓ Создано 3 набора по 120 свечей каждый\n`);

// 4. Запуск всей цепочки Module X
console.log('=== Этап 4: Прогон данных через все модули Module X ===\n');

for (const ds of datasets) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`  СЦЕНАРИЙ: ${ds.name} (${ds.candles.length} свечей)`);
    console.log(`${'='.repeat(70)}`);

    try {
        // -- Анализаторы --
        console.log('\n[1] Price Action...');
        const pa = priceAction.analyze(ds.candles);
        console.log(`  ✓ Паттернов: ${pa.totalPatterns} (${pa.bullishPatterns?.length || 0} bull / ${pa.bearishPatterns?.length || 0} bear)`);

        console.log('[2] Volume...');
        const vol = volume.analyze(ds.candles);
        console.log(`  ✓ Bias: ${vol.bias}, Regime: ${vol.regime}, OBV Trend: ${vol.obvTrend}`);
        console.log(`  ✓ Давление: buy=${(vol.buyingPressure * 100).toFixed(0)}%, sell=${(vol.sellingPressure * 100).toFixed(0)}%`);
        console.log(`  ✓ Дивергенций: ${vol.divergences.length}, Спайков: ${vol.spikes.length}`);

        console.log('[3] Smart Money...');
        const sm = smartMoney.analyze(ds.candles);
        console.log(`  ✓ Internal Trend: ${sm.internalTrend}`);
        console.log(`  ✓ BOS: ${sm.bos.length}, CHoCH: ${sm.choch.length}, OB: ${sm.orderBlocks.length}`);
        console.log(`  ✓ FVG: ${sm.fairValueGaps.length}, Sweeps: ${sm.liquiditySweeps.length}`);

        console.log('[4] Liquidity...');
        const liq = liquidity.analyze(ds.candles, sm);
        console.log(`  ✓ Bias: ${liq.bias}`);
        console.log(`  ✓ Stop Hunts: ${liq.stopHunts.length}, Grabs: ${liq.liquidityGrabs.length}, Voids: ${liq.liquidityVoids.length}`);

        console.log('[5] Volatility...');
        const vlt = volatility.analyze(ds.candles);
        console.log(`  ✓ Regime: ${vlt.regime}, ATR%: ${vlt.atrPercent.toFixed(2)}%`);
        console.log(`  ✓ In Squeeze: ${vlt.inSqueeze}, Squeeze Strength: ${(vlt.squeezeStrength * 100).toFixed(0)}%`);
        console.log(`  ✓ BB%: ${(vlt.bbPercentB * 100).toFixed(0)}%, Bias: ${vlt.bias}`);

        console.log('[6] Support/Resistance...');
        const srRes = sr.analyze(ds.candles);
        console.log(`  ✓ Levels: ${srRes.levels?.length || 0}, Position: ${srRes.pricePosition}`);
        if (srRes.nearestSupport) console.log(`  ✓ Support: ${srRes.nearestSupport.price.toFixed(2)}`);
        if (srRes.nearestResistance) console.log(`  ✓ Resistance: ${srRes.nearestResistance.price.toFixed(2)}`);

        // -- Движки --
        console.log('\n[7] Confluence Engine...');
        const conf = confluenceEngine.calculate({
            priceAction: pa,
            volume: vol,
            smartMoney: sm,
            liquidity: liq,
            volatility: vlt,
            supportResistance: srRes,
            trend: { primaryTrend: ds.trend === 'up' ? 'strong_bull' : (ds.trend === 'down' ? 'strong_bear' : 'neutral'), strength: ds.trend === 'range' ? 0.3 : 0.7 },
            momentum: { rsi: ds.trend === 'up' ? 65 : (ds.trend === 'down' ? 35 : 50), macdHistogram: ds.trend === 'up' ? 0.5 : (ds.trend === 'down' ? -0.5 : 0), roc: ds.trend === 'up' ? 1 : (ds.trend === 'down' ? -1 : 0) },
            marketStructure: { type: ds.trend === 'up' ? 'uptrend' : (ds.trend === 'down' ? 'downtrend' : 'range') }
        });
        console.log(`  ✓ Total: ${conf.totalSignals} (${conf.bullishCount} bull / ${conf.bearishCount} bear / ${conf.neutralCount} neutral)`);
        console.log(`  ✓ Confluence Score: ${conf.confluenceScore.toFixed(0)}/100, Strength: ${conf.strength}`);
        console.log(`  ✓ Recommendation: ${conf.recommendation}`);
        console.log(`  ✓ Conflicts: ${conf.conflictingCount}, Alignment: ${conf.alignmentPercent.toFixed(0)}%`);

        console.log('\n[8] Probability Engine...');
        const prob = probabilityEngine.calculate(conf, {
            trend: { primaryTrend: ds.trend === 'up' ? 'strong_bull' : (ds.trend === 'down' ? 'strong_bear' : 'neutral'), strength: ds.trend === 'range' ? 0.3 : 0.7 },
            volume: { regime: vol.regime, bias: vol.bias },
            volatility: { regime: vlt.regime }
        });
        console.log(`  ✓ Bull: ${prob.bullish.toFixed(2)}% / Bear: ${prob.bearish.toFixed(2)}% / Neutral: ${prob.neutral.toFixed(2)}%`);
        console.log(`  ✓ Expected: ${prob.expected}, Confidence: ${prob.confidence}%`);

        console.log('\n[9] Confidence Engine...');
        const confScore = confidenceEngine.calculate({
            confluence: conf,
            probability: prob,
            smartMoney: sm,
            volume: vol,
            volatility: vlt,
            liquidity: liq,
            marketStructure: { type: ds.trend === 'up' ? 'uptrend' : (ds.trend === 'down' ? 'downtrend' : 'range') },
            trend: { primaryTrend: ds.trend === 'up' ? 'strong_bull' : (ds.trend === 'down' ? 'strong_bear' : 'neutral'), strength: ds.trend === 'range' ? 0.3 : 0.7 },
            priceAction: pa,
            supportResistance: srRes
        });
        console.log(`  ✓ Confidence: ${confScore.confidence.toFixed(2)} (${confScore.percent}%, Grade: ${confScore.grade})`);
        console.log(`  ✓ Bonuses: ${confScore.bonuses.length}, Penalties: ${confScore.penalties.length}`);

        console.log('\n[10] Scenario Generator...');
        const scenarios = scenarioGenerator.generate({
            candles: ds.candles,
            marketStructure: { type: ds.trend === 'up' ? 'uptrend' : (ds.trend === 'down' ? 'downtrend' : 'range') },
            trend: { primaryTrend: ds.trend === 'up' ? 'strong_bull' : (ds.trend === 'down' ? 'strong_bear' : 'neutral'), strength: ds.trend === 'range' ? 0.3 : 0.7 },
            smartMoney: sm,
            volume: vol,
            liquidity: liq,
            volatility: vlt,
            supportResistance: srRes,
            priceAction: pa,
            probabilities: prob,
            confluence: conf
        });
        const applicable = scenarios.filter((s: any) => s.applicable).slice(0, 5);
        console.log(`  ✓ Сгенерировано сценариев: ${scenarios.length} (${applicable.length} применимых)`);
        for (const sc of applicable) {
            console.log(`    • [${sc.priority}] ${sc.name} (${sc.direction}) — ${sc.probability.toFixed(0)}% prob, R:R=${sc.riskRewardRatio || 'n/a'}`);
        }

    } catch (e) {
        const err = e as Error;
        console.error(`  ✗ ОШИБКА: ${err.message}`);
        console.error(err.stack);
    }
}

console.log('\n' + '='.repeat(70));
console.log('  ВСЕ ТЕСТЫ ЗАВЕРШЕНЫ');
console.log('='.repeat(70));
