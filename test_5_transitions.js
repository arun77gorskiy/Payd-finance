// Тест на 5 переходов с детальной проверкой пикселей и viewport
const { chromium } = require('playwright');

const URL = 'https://9ya5f8988z7f.space.minimax.io/lab.html';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    const allLogs = [];
    page.on('console', (msg) => allLogs.push({ type: msg.type(), text: msg.text() }));

    console.log(`[TEST] Открываю ${URL}`);
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const start = await page.$('button:has-text("Начать")');
    if (start) await start.click();
    await page.waitForTimeout(4000);

    const checkPixels = async (label) => {
        const result = await page.evaluate(() => {
            const container = document.getElementById('lt-chart-canvas');
            if (!container) return { error: 'no container' };

            // Проверяем все canvas и суммируем
            const canvases = container.querySelectorAll('canvas');
            let totalGreen = 0, totalRed = 0;
            let bestCanvas = null;
            let bestPixels = 0;

            for (const c of canvases) {
                const ctx = c.getContext('2d', { willReadFrequently: true });
                if (!ctx) continue;
                try {
                    const id = ctx.getImageData(0, 0, c.width, c.height);
                    const px = id.data;
                    let g = 0, r = 0;
                    for (let i = 0; i < px.length; i += 4) {
                        if (px[i] < 80 && px[i+1] > 130 && px[i+2] > 100) g++;
                        else if (px[i+1] < 100 && px[i+2] < 100 && px[i] > 200) r++;
                    }
                    totalGreen += g;
                    totalRed += r;
                    if (g + r > bestPixels) {
                        bestPixels = g + r;
                        bestCanvas = c;
                    }
                } catch (e) {}
            }

            // Также проверяем visible logical range
            const ct = window.LabTrainer && window.LabTrainer.instance;
            let range = null;
            if (ct && ct.chart && ct.chart.timeScale) {
                try {
                    range = ct.chart.timeScale().getVisibleLogicalRange();
                } catch (e) {}
            }

            return { totalGreen, totalRed, bestPixels, range };
        });
        console.log(`  [${label}] green=${result.totalGreen}, red=${result.totalRed}, range=${JSON.stringify(result.range)}`);
        return result;
    };

    await checkPixels('СЦЕНАРИЙ 1');
    for (let i = 2; i <= 6; i++) {
        await page.click('#lt-btn-next');
        await page.waitForTimeout(4000);  // ждём дольше для всех отложенных apply
        await checkPixels(`СЦЕНАРИЙ ${i}`);
    }

    // Проверяем, что НЕ было вызовов setVisibleRange или fitContent извне
    console.log('\n=== ЛОГИ RANGE GUARD ===');
    allLogs.forEach(l => {
        if (l.text.includes('CHECK 7') || l.text.includes('range') || l.text.includes('restore') || l.text.includes('GUARD')) {
            console.log(`  [${l.type}] ${l.text.substring(0, 200)}`);
        }
    });

    await browser.close();
    process.exit(0);
})().catch((e) => {
    console.error('[TEST] FATAL:', e);
    process.exit(1);
});
