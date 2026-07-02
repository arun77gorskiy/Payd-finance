// =====================================================
// 20-переходный тест: каждый переход проверяет, что все
// 8 STEP логов появились и singleton-инвариант сохранён.
// =====================================================

const { chromium } = require('playwright');

const URL = 'https://jxkson13hjjt.space.minimax.io/lab.html';
const TRANSITIONS = 20;

const STEP_TOKENS = [
    { step: 1, pattern: /STEP 1: Next scenario requested/, label: 'Next scenario requested' },
    { step: 2, pattern: /STEP 2 (render|DONE)?: Scenario (loaded|ID)/, label: 'Scenario loaded' },
    { step: 3, pattern: /STEP 3: Chart instance exists/, label: 'Chart instance exists' },
    { step: 4, pattern: /STEP 4: Candlestick series exists/, label: 'Candlestick series exists' },
    { step: 5, pattern: /STEP 5: Calling series\.setData/, label: 'Calling series.setData' },
    { step: 6, pattern: /STEP 6: Candles rendered/, label: 'Candles rendered' },
    { step: 7, pattern: /STEP 7:/, label: 'timeScale.fitContent' },
    { step: 8, pattern: /STEP 8 (DONE|started): Module X render/, label: 'Module X render' }
];

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    const consoleLog = [];
    page.on('console', (msg) => consoleLog.push({ type: msg.type(), text: msg.text() }));
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    console.log(`[TEST] Открываю ${URL}`);
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Запускаем первый сценарий
    const start = await page.$('button:has-text("Начать")');
    if (start) await start.click();
    await page.waitForTimeout(4000);
    console.log('[TEST] Сценарий 1 запущен');

    // Результаты по каждому переходу
    const transitionResults = [];

    for (let i = 0; i < TRANSITIONS; i++) {
        const before = consoleLog.length;
        const chartUidBefore = await page.evaluate(() => {
            return window.LabTrainer && window.LabTrainer.instance && window.LabTrainer.instance._chartUid;
        });

        // Нажимаем "Дальше"
        await page.click('#lt-btn-next');
        await page.waitForTimeout(2500);

        const newLogs = consoleLog.slice(before);
        const result = {
            n: i + 1,
            steps: {},
            newChartCount: newLogs.filter(l => l.text.includes('создан singleton chart')).length,
            mismatchCount: newLogs.filter(l => l.text.includes('UID MISMATCH')).length,
            repeatInitCount: newLogs.filter(l => l.text.includes('вызван повторно')).length,
            abortCount: newLogs.filter(l => l.text.includes('ABORT')).length,
            chartUidAfter: await page.evaluate(() => {
                return window.LabTrainer && window.LabTrainer.instance && window.LabTrainer.instance._chartUid;
            })
        };

        for (const { step, pattern, label } of STEP_TOKENS) {
            const found = newLogs.some(l => pattern.test(l.text));
            result.steps[step] = { found, label };
        }

        transitionResults.push(result);

        // Краткий вывод
        const allSteps = Object.values(result.steps).every(s => s.found);
        const noProblems = result.newChartCount === 0 && result.mismatchCount === 0 && result.repeatInitCount === 0;
        const icon = allSteps && noProblems ? '✓' : '✗';
        console.log(`  ${icon} Переход #${i + 1}: ` + Object.entries(result.steps).map(([k, v]) => `[STEP ${k}: ${v.found ? '✓' : '✗'}]`).join(' ') + (noProblems ? '' : ` (problems: chart=${result.newChartCount} mismatch=${result.mismatchCount} repeat=${result.repeatInitCount} abort=${result.abortCount})`));
    }

    // Сводка
    console.log('\n========================================');
    console.log('[TEST] ИТОГИ');
    console.log('========================================');

    let allPassed = true;
    for (const r of transitionResults) {
        const allSteps = Object.values(r.steps).every(s => s.found);
        if (!allSteps) {
            allPassed = false;
            const missing = Object.entries(r.steps).filter(([k, v]) => !v.found).map(([k, v]) => `STEP ${k} (${v.label})`).join(', ');
            console.log(`❌ Переход #${r.n}: отсутствуют шаги: ${missing}`);
        }
        if (r.newChartCount > 0) {
            allPassed = false;
            console.log(`❌ Переход #${r.n}: chart был пересоздан ${r.newChartCount} раз`);
        }
        if (r.mismatchCount > 0) {
            allPassed = false;
            console.log(`❌ Переход #${r.n}: UID MISMATCH ${r.mismatchCount} раз`);
        }
        if (r.repeatInitCount > 0) {
            allPassed = false;
            console.log(`❌ Переход #${r.n}: повторная инициализация ${r.repeatInitCount} раз`);
        }
    }

    if (allPassed) {
        console.log('✅ ВСЕ ' + TRANSITIONS + ' ПЕРЕХОДОВ ПРОШЛИ УСПЕШНО');
    }

    // Проверка singleton-инварианта
    const firstChartUid = transitionResults[0] ? transitionResults[0].chartUidAfter : null;
    const lastChartUid = transitionResults[transitionResults.length - 1] ? transitionResults[transitionResults.length - 1].chartUidAfter : null;
    console.log('Chart UID первый переход:', firstChartUid);
    console.log('Chart UID последний переход:', lastChartUid);
    if (firstChartUid === lastChartUid && firstChartUid) {
        console.log('✅ SINGLETON: chart остался тем же объектом через все 20 переходов');
    } else {
        console.log('❌ SINGLETON: chart был пересоздан!');
        allPassed = false;
    }

    console.log('JS-ошибок:', pageErrors.length);
    pageErrors.forEach(e => console.log('  • ' + e));

    // Сохраняем лог
    const fs = require('fs');
    fs.writeFileSync('logs/20_transitions.log', consoleLog.map(l => `[${l.type}] ${l.text}`).join('\n'));

    await page.screenshot({ path: 'screenshots/after_20_transitions.png', fullPage: true });

    await browser.close();
    process.exit(allPassed ? 0 : 1);
})().catch((e) => {
    console.error('[TEST] FATAL:', e);
    process.exit(1);
});
