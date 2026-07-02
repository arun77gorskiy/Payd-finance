const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await context.newPage();

    const consoleLogs = [];
    const errors = [];
    page.on('console', msg => {
        if (msg.type() === 'error') errors.push(msg.text());
        consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });
    page.on('pageerror', err => errors.push(`[PAGEERROR] ${err.message}`));

    await page.goto('https://ejz9rkgnkjmq.space.minimax.io/lab.html', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Найти кнопку "Начать сценарий"
    const buttons = await page.$$('button');
    for (const btn of buttons) {
        const text = await btn.textContent();
        if (text && text.includes('Начать')) {
            await btn.click();
            break;
        }
    }

    await page.waitForSelector('canvas', { timeout: 30000 });
    await page.waitForTimeout(3500);

    const checks = await page.evaluate(() => {
        const result = {};
        const pointerEls = document.querySelectorAll('.lt-terminal-pointer');
        result.pointerElementsCount = pointerEls.length;
        result.pointerEventsValues = [];
        pointerEls.forEach(el => {
            result.pointerEventsValues.push(getComputedStyle(el).pointerEvents);
        });
        result.ModuleXRenderer = typeof window.ModuleXRenderer !== 'undefined';
        result.ModuleXUIPanel = typeof window.ModuleXUIPanel !== 'undefined';
        if (window.LabTrainer && window.LabTrainer.instance) {
            const inst = window.LabTrainer.instance;
            result.chart = !!inst.chart;
            if (inst.chart) {
                result.handleScroll = inst.chart.options().handleScroll;
                result.handleScale = inst.chart.options().handleScale;
                result.visibleRange = inst.chart.timeScale().getVisibleLogicalRange();
            }
        }
        return result;
    });
    console.log('=== ПРОВЕРКА DOM ===');
    console.log(JSON.stringify(checks, null, 2));

    // Test PAN
    const canvas = await page.$('canvas');
    if (canvas) {
        const box = await canvas.boundingBox();

        console.log('\n=== ТЕСТ 1: PAN (перетаскивание мышью) ===');
        const before = await page.evaluate(() => window.LabTrainer.instance.chart.timeScale().getVisibleLogicalRange());
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 - 200, box.y + box.height / 2, { steps: 20 });
        await page.mouse.up();
        await page.waitForTimeout(400);
        const after = await page.evaluate(() => window.LabTrainer.instance.chart.timeScale().getVisibleLogicalRange());
        console.log(`До: from=${before.from.toFixed(2)}, to=${before.to.toFixed(2)}`);
        console.log(`После: from=${after.from.toFixed(2)}, to=${after.to.toFixed(2)}`);
        console.log(Math.abs(after.from - before.from) > 0.5 ? '✅ PAN работает' : '❌ PAN не работает');

        console.log('\n=== ТЕСТ 2: ZOOM колесом мыши ===');
        const before2 = await page.evaluate(() => window.LabTrainer.instance.chart.timeScale().getVisibleLogicalRange());
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 500);  // zoom out
        await page.waitForTimeout(400);
        const after2 = await page.evaluate(() => window.LabTrainer.instance.chart.timeScale().getVisibleLogicalRange());
        const range1 = before2.to - before2.from;
        const range2 = after2.to - after2.from;
        console.log(`До: диапазон=${range1.toFixed(2)}`);
        console.log(`После: диапазон=${range2.toFixed(2)}`);
        console.log(Math.abs(range2 - range1) > 0.1 ? '✅ ZOOM работает' : '❌ ZOOM не работает');

        console.log('\n=== ТЕСТ 3: ZOOM IN колесом ===');
        await page.mouse.wheel(0, -500);  // zoom in
        await page.waitForTimeout(400);
        const after3 = await page.evaluate(() => window.LabTrainer.instance.chart.timeScale().getVisibleLogicalRange());
        const range3 = after3.to - after3.from;
        console.log(`После zoom in: диапазон=${range3.toFixed(2)}`);
        console.log(Math.abs(range3 - range2) > 0.1 ? '✅ ZOOM IN работает' : '❌ ZOOM IN не работает');

        console.log('\n=== ТЕСТ 4: Перетаскивание за нижнюю ось времени (Time Scale) ===');
        const before4 = await page.evaluate(() => window.LabTrainer.instance.chart.timeScale().getVisibleLogicalRange());
        // Time scale внизу графика, последние ~30px высоты
        const ts_y = box.y + box.height - 15;
        await page.mouse.move(box.x + box.width / 2, ts_y);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 - 200, ts_y, { steps: 20 });
        await page.mouse.up();
        await page.waitForTimeout(400);
        const after4 = await page.evaluate(() => window.LabTrainer.instance.chart.timeScale().getVisibleLogicalRange());
        console.log(`До: from=${before4.from.toFixed(2)}`);
        console.log(`После: from=${after4.from.toFixed(2)}`);
        console.log(Math.abs(after4.from - before4.from) > 0.5 ? '✅ Time Scale pan работает' : '❌ Time Scale pan не работает');

        console.log('\n=== ТЕСТ 5: Масштабирование оси цены (Price Scale) ===');
        const before5 = await page.evaluate(() => {
            const ps = window.LabTrainer.instance.chart.priceScale('right');
            return ps.getVisibleRange ? ps.getVisibleRange() : null;
        });
        // Price scale справа от графика
        const ps_x = box.x + box.width - 5;
        const ps_y = box.y + box.height / 2;
        await page.mouse.move(ps_x, ps_y);
        await page.mouse.down();
        await page.mouse.move(ps_x, ps_y - 200, { steps: 20 });
        await page.mouse.up();
        await page.waitForTimeout(400);
        const after5 = await page.evaluate(() => {
            const ps = window.LabTrainer.instance.chart.priceScale('right');
            return ps.getVisibleRange ? ps.getVisibleRange() : null;
        });
        console.log(`До: ${JSON.stringify(before5)}`);
        console.log(`После: ${JSON.stringify(after5)}`);
        const priceScaleChanged = JSON.stringify(before5) !== JSON.stringify(after5);
        console.log(priceScaleChanged ? '✅ Price Scale работает' : '❌ Price Scale не работает (но это может быть из-за позиции клика)');
    }

    await page.screenshot({ path: '/workspace/final_chart_state.png', fullPage: false });

    console.log('\n=== ОШИБКИ В КОНСОЛИ ===');
    if (errors.length === 0) {
        console.log('✅ Нет ошибок в консоли');
    } else {
        errors.forEach(e => console.log('❌ ' + e));
    }

    await browser.close();
})();
