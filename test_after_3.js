// Проверка: что именно происходит после 3-го сценария
const { chromium } = require('playwright');
const fs = require('fs');

const URL = 'https://pkczabpmnf37.space.minimax.io/lab.html';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

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

    // Скриншот первого сценария
    const chart1 = await page.$('#lt-chart-canvas');
    if (chart1) await chart1.screenshot({ path: 'screenshots/diag_1.png' });

    // Пиксели первого
    let p1 = await page.evaluate(() => {
        const c = document.querySelector('#lt-chart-canvas canvas');
        if (!c) return { error: 'no canvas' };
        const ctx = c.getContext('2d', { willReadFrequently: true });
        const id = ctx.getImageData(0, 0, c.width, c.height);
        const px = id.data;
        let g = 0, r = 0;
        for (let i = 0; i < px.length; i += 4) {
            if (px[i] < 80 && px[i+1] > 130 && px[i+2] > 100) g++;
            else if (px[i+1] < 100 && px[i+2] < 100 && px[i] > 200) r++;
        }
        return { green: g, red: r, total: px.length / 4 };
    });
    console.log(`\n[СЦЕНАРИЙ 1] green=${p1.green}, red=${p1.red}`);

    // Переход 2
    await page.click('#lt-btn-next');
    await page.waitForTimeout(3500);
    const chart2 = await page.$('#lt-chart-canvas');
    if (chart2) await chart2.screenshot({ path: 'screenshots/diag_2.png' });
    let p2 = await page.evaluate(() => {
        const c = document.querySelector('#lt-chart-canvas canvas');
        if (!c) return { error: 'no canvas' };
        const ctx = c.getContext('2d', { willReadFrequently: true });
        const id = ctx.getImageData(0, 0, c.width, c.height);
        const px = id.data;
        let g = 0, r = 0;
        for (let i = 0; i < px.length; i += 4) {
            if (px[i] < 80 && px[i+1] > 130 && px[i+2] > 100) g++;
            else if (px[i+1] < 100 && px[i+2] < 100 && px[i] > 200) r++;
        }
        return { green: g, red: r, total: px.length / 4 };
    });
    console.log(`[СЦЕНАРИЙ 2] green=${p2.green}, red=${p2.red}`);

    // Переход 3
    await page.click('#lt-btn-next');
    await page.waitForTimeout(3500);
    const chart3 = await page.$('#lt-chart-canvas');
    if (chart3) await chart3.screenshot({ path: 'screenshots/diag_3.png' });
    let p3 = await page.evaluate(() => {
        const c = document.querySelector('#lt-chart-canvas canvas');
        if (!c) return { error: 'no canvas' };
        const ctx = c.getContext('2d', { willReadFrequently: true });
        const id = ctx.getImageData(0, 0, c.width, c.height);
        const px = id.data;
        let g = 0, r = 0;
        for (let i = 0; i < px.length; i += 4) {
            if (px[i] < 80 && px[i+1] > 130 && px[i+2] > 100) g++;
            else if (px[i+1] < 100 && px[i+2] < 100 && px[i] > 200) r++;
        }
        return { green: g, red: r, total: px.length / 4 };
    });
    console.log(`[СЦЕНАРИЙ 3] green=${p3.green}, red=${p3.red}`);

    // Переход 4 - ВОТ ТУТ ПРОБЛЕМА
    await page.click('#lt-btn-next');
    await page.waitForTimeout(3500);
    const chart4 = await page.$('#lt-chart-canvas');
    if (chart4) await chart4.screenshot({ path: 'screenshots/diag_4.png' });
    let p4 = await page.evaluate(() => {
        const c = document.querySelector('#lt-chart-canvas canvas');
        if (!c) return { error: 'no canvas' };
        const ctx = c.getContext('2d', { willReadFrequently: true });
        const id = ctx.getImageData(0, 0, c.width, c.height);
        const px = id.data;
        let g = 0, r = 0;
        for (let i = 0; i < px.length; i += 4) {
            if (px[i] < 80 && px[i+1] > 130 && px[i+2] > 100) g++;
            else if (px[i+1] < 100 && px[i+2] < 100 && px[i] > 200) r++;
        }
        return { green: g, red: r, total: px.length / 4 };
    });
    console.log(`[СЦЕНАРИЙ 4] green=${p4.green}, red=${p4.red}`);

    // Переход 5
    await page.click('#lt-btn-next');
    await page.waitForTimeout(3500);
    const chart5 = await page.$('#lt-chart-canvas');
    if (chart5) await chart5.screenshot({ path: 'screenshots/diag_5.png' });
    let p5 = await page.evaluate(() => {
        const c = document.querySelector('#lt-chart-canvas canvas');
        if (!c) return { error: 'no canvas' };
        const ctx = c.getContext('2d', { willReadFrequently: true });
        const id = ctx.getImageData(0, 0, c.width, c.height);
        const px = id.data;
        let g = 0, r = 0;
        for (let i = 0; i < px.length; i += 4) {
            if (px[i] < 80 && px[i+1] > 130 && px[i+2] > 100) g++;
            else if (px[i+1] < 100 && px[i+2] < 100 && px[i] > 200) r++;
        }
        return { green: g, red: r, total: px.length / 4 };
    });
    console.log(`[СЦЕНАРИЙ 5] green=${p5.green}, red=${p5.red}`);

    console.log('\n=== ЛОГИ ПОСЛЕДНИХ СОБЫТИЙ ===');
    const recent = allLogs.slice(-200);
    recent.forEach(l => {
        if (l.text.includes('CHECK') || l.text.includes('HEALTH') || l.text.includes('🚨') || l.text.includes('render') || l.text.includes('error')) {
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
