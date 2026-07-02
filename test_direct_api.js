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

    // Прямой вызов API для pan
    console.log('=== Прямой вызов API LWC (scrollToPosition) ===');
    const result = await page.evaluate(() => {
        const c = window.LabTrainer.instance.chart;
        const before = c.timeScale().getVisibleLogicalRange();
        c.timeScale().scrollToPosition(2, false);
        const after = c.timeScale().getVisibleLogicalRange();
        return { before, after };
    });
    console.log('До:', JSON.stringify(result.before));
    console.log('После:', JSON.stringify(result.after));
    
    // Сбрасываем и пробуем mouse drag на нижнюю часть canvas (где time scale)
    console.log('\n=== Mouse drag в нижнюю часть canvas (time scale) ===');
    await page.evaluate(() => {
        window.LabTrainer.instance.chart.timeScale().fitContent();
    });
    await page.waitForTimeout(300);
    
    const before = await page.evaluate(() => window.LabTrainer.instance.chart.timeScale().getVisibleLogicalRange());
    console.log('До:', JSON.stringify(before));
    
    // Пробуем mouse drag в нижнюю область — на 20 пикселей вверх от низа
    const info = await page.evaluate(() => {
        const canvases = document.querySelectorAll('canvas');
        const chartCanvas = Array.from(canvases).find(cn => cn.width > 800);
        const rect = chartCanvas.getBoundingClientRect();
        return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    });
    
    // Time scale обычно занимает ~25-30px внизу
    const timeScaleCenterY = info.y + info.h - 15;
    const timeScaleCenterX = info.x + info.w / 2;
    
    // Пробуем 5 разных позиций по Y
    for (const offset of [-5, -15, -25, -35, -50]) {
        const ty = info.y + info.h + offset;
        if (ty < info.y) continue;
        const beforeX = await page.evaluate(() => window.LabTrainer.instance.chart.timeScale().getVisibleLogicalRange());
        await page.mouse.move(timeScaleCenterX, ty);
        await page.mouse.down();
        await page.mouse.move(timeScaleCenterX - 300, ty, { steps: 20 });
        await page.mouse.up();
        await page.waitForTimeout(300);
        const afterX = await page.evaluate(() => window.LabTrainer.instance.chart.timeScale().getVisibleLogicalRange());
        const changed = Math.abs(afterX.from - beforeX.from) > 0.5;
        console.log(`Offset ${offset}px от низа, y=${ty.toFixed(0)}: ${changed ? '✅ PAN OK' : 'не сработал'} from=${beforeX.from.toFixed(2)}→${afterX.from.toFixed(2)}`);
    }

    await page.screenshot({ path: '/workspace/chart_time_scale_test.png' });
    
    await browser.close();
})();
