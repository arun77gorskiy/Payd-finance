const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
    const page = await context.newPage();

    const consoleLogs = [];
    page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));
    page.on('pageerror', err => consoleLogs.push(`[PAGEERROR] ${err.message}`));

    console.log('1. Переход на lab.html...');
    await page.goto('https://c4ltb0kr6hfg.space.minimax.io/lab.html', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Найти кнопку "Начать сценарий" или "▶"
    console.log('2. Ищем кнопку "Начать сценарий"...');
    const buttons = await page.$$('button');
    let startBtn = null;
    for (const btn of buttons) {
        const text = await btn.textContent();
        if (text && (text.includes('Начать') || text.includes('сценар'))) {
            startBtn = btn;
            break;
        }
    }

    if (startBtn) {
        await startBtn.click();
        console.log('3. Кликнули по кнопке начала сценария');
    } else {
        // Альтернатива - найти карточку Module 1 и кликнуть
        const moduleCards = await page.$$('[data-module], .module-card, .lab-card');
        if (moduleCards.length > 0) {
            await moduleCards[0].click();
            console.log('3. Кликнули по первой карточке модуля');
        }
    }

    // Дождаться загрузки графика
    console.log('4. Ждём загрузки canvas...');
    await page.waitForSelector('canvas', { timeout: 30000 });
    await page.waitForTimeout(3000);

    console.log('\n5. Проверка DOM...');
    const checks = await page.evaluate(() => {
        const result = {};
        const pointerEls = document.querySelectorAll('.lt-terminal-pointer');
        result.pointerElementsCount = pointerEls.length;
        result.pointerEventsValues = [];
        pointerEls.forEach(el => {
            result.pointerEventsValues.push(getComputedStyle(el).pointerEvents);
        });
        // Проверяем, есть ли ModuleXRenderer
        result.ModuleXRenderer_available = typeof window.ModuleXRenderer !== 'undefined';
        result.ModuleXUIPanel_available = typeof window.ModuleXUIPanel !== 'undefined';
        // Проверяем наличие LabTrainer
        result.LabTrainer_available = typeof window.LabTrainer !== 'undefined';
        if (window.LabTrainer && window.LabTrainer.instance) {
            const inst = window.LabTrainer.instance;
            result.chart = !!inst.chart;
            if (inst.chart) {
                try {
                    result.handleScroll = inst.chart.options().handleScroll;
                    result.handleScale = inst.chart.options().handleScale;
                    result.visibleLogicalRange = inst.chart.timeScale().getVisibleLogicalRange();
                } catch (e) {
                    result.chartError = e.message;
                }
            }
        }
        return result;
    });
    console.log('Результаты проверки:', JSON.stringify(checks, null, 2));

    // 6. Симулируем PAN — зажимаем левую кнопку и тянем
    console.log('\n6. Симулируем PAN графика...');
    const canvas = await page.$('canvas');
    if (canvas) {
        const box = await canvas.boundingBox();
        console.log('   canvas box:', JSON.stringify(box));
        // Получаем начальную позицию
        const beforeRange = await page.evaluate(() => {
            if (window.LabTrainer && window.LabTrainer.instance) {
                return window.LabTrainer.instance.chart.timeScale().getVisibleLogicalRange();
            }
            return null;
        });
        console.log('   До PAN:', JSON.stringify(beforeRange));

        // Pan: вниз-вправо — это движение в прошлое по графику
        const startX = box.x + box.width / 2;
        const startY = box.y + box.height / 2;
        const endX = startX - 300;
        const endY = startY;
        await page.mouse.move(startX, startY);
        await page.mouse.down();
        await page.mouse.move(endX, endY, { steps: 20 });
        await page.waitForTimeout(300);
        await page.mouse.up();
        await page.waitForTimeout(500);

        const afterRange = await page.evaluate(() => {
            if (window.LabTrainer && window.LabTrainer.instance) {
                return window.LabTrainer.instance.chart.timeScale().getVisibleLogicalRange();
            }
            return null;
        });
        console.log('   После PAN:', JSON.stringify(afterRange));
        const rangeChanged = beforeRange && afterRange &&
            (Math.abs(beforeRange.from - afterRange.from) > 0.1 || Math.abs(beforeRange.to - afterRange.to) > 0.1);
        console.log('   Диапазон изменился?', rangeChanged ? '✅ ДА' : '❌ НЕТ');
    }

    // 7. Симулируем ZOOM колесом мыши
    console.log('\n7. Симулируем ZOOM колесом мыши...');
    if (canvas) {
        const box = await canvas.boundingBox();
        const beforeRange = await page.evaluate(() => {
            if (window.LabTrainer && window.LabTrainer.instance) {
                return window.LabTrainer.instance.chart.timeScale().getVisibleLogicalRange();
            }
            return null;
        });
        console.log('   До ZOOM:', JSON.stringify(beforeRange));
        // Zoom out — колесо вниз
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.wheel(0, 500);
        await page.waitForTimeout(500);
        const afterRange = await page.evaluate(() => {
            if (window.LabTrainer && window.LabTrainer.instance) {
                return window.LabTrainer.instance.chart.timeScale().getVisibleLogicalRange();
            }
            return null;
        });
        console.log('   После ZOOM OUT:', JSON.stringify(afterRange));
        const rangeChanged = beforeRange && afterRange &&
            (Math.abs(beforeRange.to - beforeRange.from) !== Math.abs(afterRange.to - afterRange.from));
        console.log('   Zoom изменил диапазон?', rangeChanged ? '✅ ДА' : '❌ НЕТ');
    }

    await page.screenshot({ path: '/workspace/chart_after_interaction.png', fullPage: false });

    console.log('\n8. Консольные логи:');
    consoleLogs.slice(-30).forEach(log => console.log('   ' + log));

    await browser.close();
    console.log('\n🏁 Готово');
})();
