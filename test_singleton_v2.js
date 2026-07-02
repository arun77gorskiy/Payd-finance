// =====================================================
// Singleton-invariant test v2: перехват createChart ДО mount().
// Чтобы перехватить — патчим LightweightCharts через addInitScript
// ДО первой загрузки любых скриптов.
// =====================================================

const { chromium } = require('playwright');

const URL = 'https://vy5bg8qu0pag.space.minimax.io/lab.html';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // Устанавливаем перехват ДО загрузки любых скриптов страницы.
  // lightWeight Charts грузится динамически через document.createElement,
  // поэтому мы должны подменить createElement для script-тегов ИЛИ
  // переопределить глобальный namespace после его появления.
  // Стратегия: следим за появлением window.LightweightCharts и сразу патчим.
  await context.addInitScript(() => {
    window.__chartCreateCount = 0;
    window.__candleAddCount = 0;
    window.__volumeAddCount = 0;
    window.__chartInstances = [];
    window.__candleSeriesInstances = [];
    window.__volumeSeriesInstances = [];

    // Подождём появления LightweightCharts и пропатчим его
    const checkAndPatch = () => {
      if (window.LightweightCharts && !window.__patched) {
        window.__patched = true;
        const origCreate = window.LightweightCharts.createChart;
        window.LightweightCharts.createChart = function (...args) {
          window.__chartCreateCount++;
          const chart = origCreate.apply(this, args);
          window.__chartInstances.push(chart);
          const origAddCandle = chart.addCandlestickSeries.bind(chart);
          const origAddHist = chart.addHistogramSeries.bind(chart);
          chart.addCandlestickSeries = function (...a) {
            window.__candleAddCount++;
            const s = origAddCandle(...a);
            window.__candleSeriesInstances.push(s);
            return s;
          };
          chart.addHistogramSeries = function (...a) {
            window.__volumeAddCount++;
            const s = origAddHist(...a);
            window.__volumeSeriesInstances.push(s);
            return s;
          };
          console.log('[INSTRUMENT] createChart() вызван, всего=' + window.__chartCreateCount);
          return chart;
        };
        console.log('[INSTRUMENT] LightweightCharts пропатчен');
      }
    };

    // Проверяем каждые 50мс (Lightweight Charts грузится динамически)
    const interval = setInterval(checkAndPatch, 50);
    setTimeout(() => clearInterval(interval), 30000);
  });

  const page = await context.newPage();
  const consoleLog = [];
  page.on('console', (msg) => consoleLog.push({ type: msg.type(), text: msg.text() }));
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  console.log(`[TEST] Открываю ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // Стартуем первый сценарий
  const start = await page.$('button:has-text("Начать")');
  if (start) await start.click();
  await page.waitForTimeout(4000);

  let counts = await page.evaluate(() => ({
    charts: window.__chartCreateCount,
    candles: window.__candleAddCount,
    volumes: window.__volumeAddCount,
    patched: window.__patched || false,
  }));
  console.log('\n[TEST] После сценария 1:');
  console.log('  createChart() =', counts.charts, ', addCandlestickSeries() =', counts.candles, ', addHistogramSeries() =', counts.volumes);
  console.log('  Patched:', counts.patched);

  // Переходы: ещё 3 раза "Дальше" (получаем сценарии 2, 3, 4)
  for (let i = 0; i < 3; i++) {
    await page.click('#lt-btn-next');
    await page.waitForTimeout(2500);
  }

  counts = await page.evaluate(() => ({
    charts: window.__chartCreateCount,
    candles: window.__candleAddCount,
    volumes: window.__volumeAddCount,
  }));
  console.log('\n[TEST] После сценариев 1+2+3+4:');
  console.log('  createChart() =', counts.charts, ', addCandlestickSeries() =', counts.candles, ', addHistogramSeries() =', counts.volumes);

  const passed = counts.charts === 1 && counts.candles === 1 && counts.volumes === 1;
  console.log('\n========================================');
  console.log('[TEST] SINGLETON-INVARIANT: ' + (passed ? '✅ ПРОЙДЕН' : '❌ ПРОВАЛЕН'));
  console.log('  Ожидалось: charts=1, candleSeries=1, volumeSeries=1');
  console.log('  Получено:  charts=' + counts.charts + ', candleSeries=' + counts.candles + ', volumeSeries=' + counts.volumes);
  console.log('========================================');

  // Сохраняем скриншот
  await page.screenshot({ path: 'screenshots/singleton_v2.png', fullPage: true });

  // Собственная инструментация из кода
  const createLogs = consoleLog.filter(l => l.text.includes('создан singleton chart'));
  const repeatWarnings = consoleLog.filter(l => l.text.includes('вызван повторно'));
  const singletonChecks = consoleLog.filter(l => l.text.includes('singleton check'));
  const mismatchWarnings = consoleLog.filter(l => l.text.includes('UID MISMATCH'));

  console.log('\n[INTERNAL instrumentation]');
  console.log('  "создан singleton chart" :', createLogs.length, createLogs.length === 1 ? '✓' : '❌');
  console.log('  "вызван повторно" :', repeatWarnings.length, repeatWarnings.length === 0 ? '✓' : '❌');
  console.log('  "singleton check" :', singletonChecks.length);
  console.log('  "UID MISMATCH" :', mismatchWarnings.length, mismatchWarnings.length === 0 ? '✓' : '❌');
  console.log('\n  Первые 2 singleton check:');
  singletonChecks.slice(0, 2).forEach(l => console.log('    ' + l.text));

  console.log('\n[TEST] JS-ошибок: ' + pageErrors.length);
  pageErrors.forEach(e => console.log('  • ' + e));

  const fs = require('fs');
  fs.writeFileSync('logs/singleton_v2.log', consoleLog.map(l => `[${l.type}] ${l.text}`).join('\n'));

  await browser.close();
  process.exit(passed ? 0 : 1);
})().catch((e) => {
  console.error('[TEST] FATAL:', e);
  process.exit(1);
});
