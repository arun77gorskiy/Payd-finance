// =====================================================
// Singleton-invariant test: убеждаемся, что chart создаётся 1 раз
// и series переиспользуются через setData() при смене сценария.
// Также считаем, сколько раз вызывается createChart() и addCandlestickSeries().
// =====================================================

const { chromium } = require('playwright');

const URL = 'https://vy5bg8qu0pag.space.minimax.io/lab.html';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const consoleLog = [];
  page.on('console', (msg) => consoleLog.push({ type: msg.type(), text: msg.text() }));
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  // Перехватываем вызовы createChart/addCandlestickSeries/addHistogramSeries
  await page.addInitScript(() => {
    const origCreate = window.LightweightCharts && window.LightweightCharts.createChart;
    window.__chartCreateCount = 0;
    window.__candleAddCount = 0;
    window.__volumeAddCount = 0;
    window.__chartInstances = [];
    window.__candleSeriesInstances = [];
    window.__volumeSeriesInstances = [];
  });

  console.log(`[TEST] Открываю ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Внедряем счётчики через обёртку над LightweightCharts
  await page.evaluate(() => {
    if (!window.LightweightCharts) {
      console.error('[TEST] LightweightCharts не загружен!');
      return;
    }
    const origCreate = window.LightweightCharts.createChart;
    const origAddSeries = window.LightweightCharts.Chart.prototype ? null : null; // не работает, т.к. метод на instance

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
      console.log('[INSTRUMENT] createChart() вызван, всего: ' + window.__chartCreateCount);
      return chart;
    };
  });

  // Стартуем первый сценарий
  const start = await page.$('button:has-text("Начать")');
  if (start) await start.click();
  await page.waitForTimeout(4000);

  console.log('\n[TEST] После сценария 1:');
  let counts = await page.evaluate(() => ({
    charts: window.__chartCreateCount,
    candles: window.__candleAddCount,
    volumes: window.__volumeAddCount,
  }));
  console.log('  createChart() =', counts.charts, ', addCandlestickSeries() =', counts.candles, ', addHistogramSeries() =', counts.volumes);

  // Жмём "Дальше" ещё 3 раза (сценарии 2, 3, 4)
  for (let i = 0; i < 3; i++) {
    await page.click('#lt-btn-next');
    await page.waitForTimeout(2500);
  }

  console.log('\n[TEST] После сценариев 1+2+3+4:');
  counts = await page.evaluate(() => ({
    charts: window.__chartCreateCount,
    candles: window.__candleAddCount,
    volumes: window.__volumeAddCount,
  }));
  console.log('  createChart() =', counts.charts, ', addCandlestickSeries() =', counts.candles, ', addHistogramSeries() =', counts.volumes);

  // Проверяем, что singleton-инвариант соблюдён
  const passed =
    counts.charts === 1 &&
    counts.candles === 1 &&
    counts.volumes === 1;

  console.log('\n========================================');
  console.log('[TEST] SINGLETON-INVARIANT: ' + (passed ? '✅ ПРОЙДЕН' : '❌ ПРОВАЛЕН'));
  console.log('  Ожидалось: charts=1, candleSeries=1, volumeSeries=1');
  console.log('  Получено:  charts=' + counts.charts + ', candleSeries=' + counts.candles + ', volumeSeries=' + counts.volumes);
  console.log('========================================');

  // Сохраняем скриншот финального состояния
  await page.screenshot({ path: 'screenshots/singleton_test.png', fullPage: true });

  // Также проверяем наличие новых логов singleton check
  const singletonLogs = consoleLog.filter(l => l.text.includes('singleton check'));
  console.log('\n[TEST] Логи singleton-проверки: ' + singletonLogs.length);
  singletonLogs.slice(0, 5).forEach(l => console.log('  • ' + l.text));

  // Ищем _initChart() с предупреждением о повторном вызове (их быть не должно)
  const repeatWarnings = consoleLog.filter(l => l.text.includes('вызван повторно'));
  console.log('[TEST] Предупреждения о повторной инициализации: ' + repeatWarnings.length + (repeatWarnings.length > 0 ? ' ❌' : ' ✓'));

  // Ищем singleton-сообщение о создании
  const createLogs = consoleLog.filter(l => l.text.includes('создан singleton chart'));
  console.log('[TEST] Сообщений "создан singleton chart": ' + createLogs.length + (createLogs.length === 1 ? ' ✓' : ' ❌'));

  console.log('\n[TEST] JS-ошибок: ' + pageErrors.length);
  pageErrors.forEach(e => console.log('  • ' + e));

  // Сохраняем полный лог
  const fs = require('fs');
  fs.writeFileSync('logs/singleton_test.log', consoleLog.map(l => `[${l.type}] ${l.text}`).join('\n'));

  await browser.close();
  process.exit(passed ? 0 : 1);
})().catch((e) => {
  console.error('[TEST] FATAL:', e);
  process.exit(1);
});
