// Серьёзный тест: реальные скриншоты после каждого перехода + диагностика
const { chromium } = require('playwright');
const fs = require('fs');

const URL = 'https://iam7rpgcuhu8.space.minimax.io/lab.html';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    fs.mkdirSync('screenshots/repro', { recursive: true });

    const allLogs = [];
    page.on('console', (msg) => allLogs.push({ type: msg.type(), text: msg.text() }));
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message + ' | ' + err.stack));

    console.log(`[TEST] Открываю ${URL}`);
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const start = await page.$('button:has-text("Начать")');
    if (start) await start.click();
    await page.waitForTimeout(4000);

    const dumpState = async (label) => {
        const result = await page.evaluate(() => {
            const container = document.getElementById('lt-chart-canvas');
            if (!container) return { error: 'no container' };

            const canvases = container.querySelectorAll('canvas');
            let totalGreen = 0, totalRed = 0, totalUnique = new Set();
            for (const c of canvases) {
                const ctx = c.getContext('2d', { willReadFrequently: true });
                if (!ctx) continue;
                try {
                    const id = ctx.getImageData(0, 0, c.width, c.height);
                    const px = id.data;
                    for (let i = 0; i < px.length; i += 4) {
                        if (px[i+3] < 100) continue;
                        const key = `${Math.floor(px[i]/20)}_${Math.floor(px[i+1]/20)}_${Math.floor(px[i+2]/20)}`;
                        totalUnique.add(key);
                        if (px[i] < 80 && px[i+1] > 130 && px[i+2] > 100) totalGreen++;
                        else if (px[i+1] < 100 && px[i+2] < 100 && px[i] > 200) totalRed++;
                    }
                } catch (e) {}
            }

            // Проверка состояния через LabTrainer.instance
            const ct = window.LabTrainer && window.LabTrainer.instance;
            let info = { error: 'no instance' };
            if (ct) {
                info = {
                    hasChart: !!ct.chart,
                    hasCandleSeries: !!ct.candleSeries,
                    hasVolumeSeries: !!ct.volumeSeries,
                    currentScenario: ct.currentScenario ? ct.currentScenario.id : 'none',
                    currentScenarioName: ct.currentScenario ? ct.currentScenario.name : 'none',
                    candlesCount: ct.currentScenario && ct.currentScenario.candles ? ct.currentScenario.candles.length : 0,
                    chartSize: ct._elements && ct._elements.chartCanvas ? (() => { const r = ct._elements.chartCanvas.getBoundingClientRect(); return `${r.width}x${r.height}`; })() : 'unknown',
                    seriesDataLength: (ct.candleSeries && ct.candleSeries.data) ? (ct.candleSeries.data().length) : 0,
                    visibleRange: (ct.chart && ct.chart.timeScale) ? (ct.chart.timeScale().getVisibleLogicalRange()) : null,
                    scenarioId: ct.currentScenarioId || 'none'
                };
            }
            return { totalGreen, totalRed, uniqueColors: totalUnique.size, info };
        });
        console.log(`\n=== ${label} ===`);
        console.log(`  ПИКСЕЛИ: green=${result.totalGreen}, red=${result.totalRed}, unique_colors=${result.uniqueColors}`);
        console.log(`  STATE: ${JSON.stringify(result.info, null, 2)}`);
        return result;
    };

    // СЦЕНАРИЙ 1 - начальный
    let s1 = await dumpState('СЦЕНАРИЙ 1 (начальный)');
    await page.locator('#lt-chart-canvas').screenshot({ path: 'screenshots/repro/01_scenario_1.png' });

    // Переход к сценарию 2
    console.log('\n>>> КЛИКАЮ #lt-btn-next >>>');
    await page.click('#lt-btn-next');
    await page.waitForTimeout(4500);
    let s2 = await dumpState('СЦЕНАРИЙ 2 (после next)');
    await page.locator('#lt-chart-canvas').screenshot({ path: 'screenshots/repro/02_scenario_2.png' });

    // Переход к сценарию 3
    console.log('\n>>> КЛИКАЮ #lt-btn-next >>>');
    await page.click('#lt-btn-next');
    await page.waitForTimeout(4500);
    let s3 = await dumpState('СЦЕНАРИЙ 3 (после next)');
    await page.locator('#lt-chart-canvas').screenshot({ path: 'screenshots/repro/03_scenario_3.png' });

    // Переход к сценарию 4
    console.log('\n>>> КЛИКАЮ #lt-btn-next >>>');
    await page.click('#lt-btn-next');
    await page.waitForTimeout(4500);
    let s4 = await dumpState('СЦЕНАРИЙ 4 (после next)');
    await page.locator('#lt-chart-canvas').screenshot({ path: 'screenshots/repro/04_scenario_4.png' });

    // Переход к сценарию 5
    console.log('\n>>> КЛИКАЮ #lt-btn-next >>>');
    await page.click('#lt-btn-next');
    await page.waitForTimeout(4500);
    let s5 = await dumpState('СЦЕНАРИЙ 5 (после next)');
    await page.locator('#lt-chart-canvas').screenshot({ path: 'screenshots/repro/05_scenario_5.png' });

    // Диагностика
    console.log('\n\n═══════════════════════════════════════════════════════');
    console.log('ИТОГИ ВОСПРОИЗВЕДЕНИЯ:');
    console.log('═══════════════════════════════════════════════════════');
    [s1, s2, s3, s4, s5].forEach((s, i) => {
        const status = s.totalGreen + s.totalRed > 5000 ? '✅' : '❌ ПУСТО';
        console.log(`  Сценарий ${i+1}: green=${s.totalGreen}, red=${s.totalRed} ${status}`);
    });

    // Логи с переходов
    console.log('\n=== ЛОГИ CHECK/STEP ===');
    const recent = allLogs.slice(-300);
    recent.forEach(l => {
        if (l.text.includes('CHECK') || l.text.includes('STEP') || l.text.includes('HEALTH') || l.text.includes('🚨')) {
            console.log(`  [${l.type}] ${l.text.substring(0, 200)}`);
        }
    });

    console.log('\n=== JS-ОШИБКИ ===');
    pageErrors.forEach(e => console.log('  ' + e.substring(0, 300)));

    await browser.close();
    process.exit(0);
})().catch((e) => {
    console.error('[TEST] FATAL:', e);
    process.exit(1);
});
