const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await context.newPage();

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

    // Скриншот 1: начальное состояние
    await page.screenshot({ path: '/workspace/visual_1_initial.png' });
    console.log('Скриншот 1: начальное состояние');

    // Pan
    const info = await page.evaluate(() => {
        const canvases = document.querySelectorAll('canvas');
        const chartCanvas = Array.from(canvases).find(cn => cn.width > 800);
        const rect = chartCanvas.getBoundingClientRect();
        return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    });
    const cx = info.x + info.w / 2;
    const cy = info.y + info.h / 2;
    
    // Pan влево-вправо 3 раза
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 3; i++) {
        await page.mouse.move(cx - 200, cy, { steps: 15 });
        await page.waitForTimeout(200);
    }
    await page.mouse.up();
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/workspace/visual_2_after_pan.png' });
    console.log('Скриншот 2: после Pan');

    // Zoom out
    await page.mouse.move(cx, cy);
    await page.mouse.wheel(0, 800);
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/workspace/visual_3_after_zoom.png' });
    console.log('Скриншот 3: после Zoom');

    // Zoom in
    await page.mouse.wheel(0, -800);
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/workspace/visual_4_after_zoom_in.png' });
    console.log('Скриншот 4: после Zoom In');

    // Финальное состояние
    const final = await page.evaluate(() => ({
        range: window.LabTrainer.instance.chart.timeScale().getVisibleLogicalRange(),
        chartOptions: {
            handleScroll: window.LabTrainer.instance.chart.options().handleScroll,
            handleScale: window.LabTrainer.instance.chart.options().handleScale
        }
    }));
    console.log('\nФинальный диапазон:', JSON.stringify(final.range));
    console.log('Chart options: handleScroll.pressedMouseMove =', final.chartOptions.handleScroll.pressedMouseMove);
    console.log('Chart options: handleScale.axisPressedMouseMove =', JSON.stringify(final.chartOptions.handleScale.axisPressedMouseMove));

    await browser.close();
})();
