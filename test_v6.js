// Финальный тест: проверяем что fitContent() УБРАН и нет fitContent в логах
const { chromium } = require('playwright');
const URL = 'https://iam7rpgcuhu8.space.minimax.io/lab.html';

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

    const allLogs = [];
    page.on('console', (msg) => allLogs.push({ type: msg.type(), text: msg.text() }));

    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const start = await page.$('button:has-text("Начать")');
    if (start) await start.click();
    await page.waitForTimeout(4000);

    const checkPixels = async (label) => {
        const result = await page.evaluate(() => {
            const container = document.getElementById('lt-chart-canvas');
            if (!container) return { error: 'no container' };
            const canvases = container.querySelectorAll('canvas');
            let totalGreen = 0, totalRed = 0;
            for (const c of canvases) {
                const ctx = c.getContext('2d', { willReadFrequently: true });
                if (!ctx) continue;
                try {
                    const id = ctx.getImageData(0, 0, c.width, c.height);
                    const px = id.data;
                    for (let i = 0; i < px.length; i += 4) {
                        if (px[i] < 80 && px[i+1] > 130 && px[i+2] > 100) totalGreen++;
                        else if (px[i+1] < 100 && px[i+2] < 100 && px[i] > 200) totalRed++;
                    }
                } catch (e) {}
            }
            const ct = window.LabTrainer && window.LabTrainer.instance;
            let range = null;
            if (ct && ct.chart && ct.chart.timeScale) {
                try { range = ct.chart.timeScale().getVisibleLogicalRange(); } catch (e) {}
            }
            return { totalGreen, totalRed, range };
        });
        console.log(`  [${label}] green=${result.totalGreen}, red=${result.totalRed}, range=${JSON.stringify(result.range)}`);
        return result;
    };

    await checkPixels('СЦЕНАРИЙ 1');
    for (let i = 2; i <= 8; i++) {
        await page.click('#lt-btn-next');
        await page.waitForTimeout(4000);
        await checkPixels(`СЦЕНАРИЙ ${i}`);
    }

    // Проверяем, что fitContent() НЕ вызывается
    const fitContentCalls = allLogs.filter(l => l.text.includes('fitContent'));
    console.log(`\n[CHECK] Вызовов fitContent() в логах: ${fitContentCalls.length} (должно быть 0)`);
    if (fitContentCalls.length > 0) {
        console.log('  ❌ fitContent() всё ещё вызывается:');
        fitContentCalls.slice(0, 5).forEach(l => console.log('   ' + l.text.substring(0, 150)));
    } else {
        console.log('  ✅ fitContent() полностью удалён');
    }

    await browser.close();
    process.exit(0);
})().catch((e) => {
    console.error('[TEST] FATAL:', e);
    process.exit(1);
});
