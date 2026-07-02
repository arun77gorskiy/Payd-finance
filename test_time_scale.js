const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await context.newPage();

    page.on('pageerror', err => console.log('PAGEERROR:', err.message));

    await page.goto('https://ejz9rkgnkjmq.space.minimax.io/lab.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

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

    // Получаем точные координаты canvas и находим time scale через LWC API
    const info = await page.evaluate(() => {
        const c = window.LabTrainer.instance.chart;
        const canvases = document.querySelectorAll('canvas');
        const chartCanvas = Array.from(canvases).find(cn => cn.width > 800);
        const rect = chartCanvas.getBoundingClientRect();
        // Получаем видимый диапазон
        const range = c.timeScale().getVisibleLogicalRange();
        // Получаем размеры шкалы времени (там особая высота)
        const timeScale = c.timeScale();
        const width = c.options().width;
        const height = c.options().height;
        return { rect, range, width, height, canvasCount: canvases.length };
    });
    console.log('Canvas rect:', JSON.stringify(info.rect));
    console.log('Visible range:', JSON.stringify(info.range));
    console.log('Chart w x h:', info.width, 'x', info.height);

    // Test 1: Pan за нижнюю часть (где time scale) — кликнем ровно по нижнему краю
    console.log('\n=== Тест Time Scale pan (нижний край canvas) ===');
    const before = await page.evaluate(() => window.LabTrainer.instance.chart.timeScale().getVisibleLogicalRange());
    
    // LWC time scale находится в самом низу canvas
    const timeScaleY = info.rect.y + info.rect.height - 5;
    const timeScaleX = info.rect.x + info.rect.width / 2;
    
    await page.mouse.move(timeScaleX, timeScaleY);
    await page.mouse.down();
    await page.mouse.move(timeScaleX - 250, timeScaleY, { steps: 25 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    
    const after = await page.evaluate(() => window.LabTrainer.instance.chart.timeScale().getVisibleLogicalRange());
    console.log(`До: from=${before.from.toFixed(2)}`);
    console.log(`После: from=${after.from.toFixed(2)}`);
    console.log(Math.abs(after.from - before.from) > 0.5 ? '✅ Time Scale pan работает' : '❌ Не работает');

    // Test 2: Pan за правую часть (price scale)
    console.log('\n=== Тест Price Scale pan (правый край canvas) ===');
    const before2 = await page.evaluate(() => {
        const c = window.LabTrainer.instance.chart;
        return {
            range: c.timeScale().getVisibleLogicalRange(),
            // Получаем видимый ценовой диапазон
            priceScale: c.priceScale('right')
        };
    });
    
    // LWC price scale — справа от графика
    const priceScaleX = info.rect.x + info.rect.width - 5;
    const priceScaleY = info.rect.y + info.rect.height / 2;
    
    await page.mouse.move(priceScaleX, priceScaleY);
    await page.mouse.down();
    await page.mouse.move(priceScaleX, priceScaleY - 250, { steps: 25 });
    await page.mouse.up();
    await page.waitForTimeout(500);
    
    // Проверяем через candle series
    const after2 = await page.evaluate(() => {
        const c = window.LabTrainer.instance.chart;
        const cs = window.LabTrainer.instance.candleSeries;
        return {
            range: c.timeScale().getVisibleLogicalRange()
        };
    });
    console.log(`Time range до: from=${before2.range.from.toFixed(2)}`);
    console.log(`Time range после: from=${after2.range.from.toFixed(2)}`);
    
    // Делаем скриншот после всех действий
    await page.screenshot({ path: '/workspace/chart_final_state.png' });
    console.log('\nСкриншот сохранён в /workspace/chart_final_state.png');
    
    await browser.close();
})();
