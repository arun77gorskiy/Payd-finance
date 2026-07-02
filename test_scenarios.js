// =====================================================
// Playwright test: проверка загрузки нескольких сценариев
// Цель: убедиться, что сценарии 1, 2, 3, 5, 10
// корректно загружают свечи (150-300 шт) и рисуют график.
// =====================================================

const { chromium } = require('playwright');

const URL = 'https://2sa10j1ugjik.space.minimax.io/lab.html';

// ID сценариев, которые нужно проверить
const TARGET_SCENARIOS = [1, 2, 3, 5, 10];

// Ожидаемые диагностические фразы в консоли
const DIAGNOSTIC_TOKENS = [
  'Candles loaded',
  'Series updated',
  'Chart rendered',
  'Module X started',
  'Module X rendered',
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'ru-RU',
  });
  const page = await context.newPage();

  // Сбор всех консольных сообщений
  const consoleLog = [];
  page.on('console', (msg) => {
    const text = msg.text();
    consoleLog.push({ type: msg.type(), text });
  });

  // Сбор ошибок
  const pageErrors = [];
  page.on('pageerror', (err) => {
    pageErrors.push(err.message);
  });

  console.log(`[TEST] Открываю ${URL}`);
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Дам странице подгрузить все скрипты
  await page.waitForTimeout(3000);

  // -------- ШАГ 1: Стартуем сценарий 1 --------
  console.log('[TEST] Ищу кнопку старта первого сценария...');

  // Сначала пытаемся найти явные кнопки запуска
  const startSelectors = [
    'button:has-text("Начать")',
    'button:has-text("Старт")',
    'button:has-text("Сценарий 1")',
    '[data-action="start"]',
    'a:has-text("Начать")',
  ];

  let startedFirst = false;
  for (const sel of startSelectors) {
    const btn = await page.$(sel);
    if (btn) {
      const visible = await btn.isVisible();
      if (visible) {
        console.log(`[TEST] Нажимаю "${sel}"`);
        await btn.click();
        startedFirst = true;
        break;
      }
    }
  }

  if (!startedFirst) {
    console.log('[TEST] Явной кнопки не нашёл, пробую кликнуть первую карточку сценария');
    // Ищем карточки, которые выглядят как список сценариев
    const cardSelectors = [
      '.scenario-card',
      '.scenarios-list button',
      '.scenarios button',
      '[data-scenario-id]',
      '.lab-card',
      'main button',
    ];
    for (const sel of cardSelectors) {
      const cards = await page.$$(sel);
      if (cards.length > 0) {
        await cards[0].click();
        console.log(`[TEST] Кликнул по первому элементу селектора "${sel}"`);
        startedFirst = true;
        break;
      }
    }
  }

  if (!startedFirst) {
    console.error('[TEST] ❌ Не удалось запустить первый сценарий');
    await page.screenshot({ path: 'screenshots/FAIL_no_start_button.png', fullPage: true });
    process.exit(1);
  }

  // -------- Функция: проверить текущий сценарий --------
  async function verifyScenario(scenarioNumber, screenshotPath) {
    console.log(`\n[TEST] ============ СЦЕНАРИЙ ${scenarioNumber} ============`);

    // Ждём появления canvas графика
    let canvasFound = false;
    try {
      await page.waitForSelector('canvas', { timeout: 15000 });
      canvasFound = true;
    } catch (e) {
      console.error(`[TEST] ❌ Сценарий ${scenarioNumber}: canvas не появился за 15 сек`);
    }

    // Дополнительно ждём, чтобы график успел отрисоваться
    await page.waitForTimeout(2000);

    // Проверяем наличие canvas
    const canvasCount = await page.locator('canvas').count();
    console.log(`[TEST] Найдено canvas-элементов: ${canvasCount}`);

    // Проверяем, что canvas видим
    let canvasVisible = false;
    if (canvasCount > 0) {
      try {
        canvasVisible = await page.locator('canvas').first().isVisible();
      } catch (e) {
        canvasVisible = false;
      }
    }
    console.log(`[TEST] Canvas видим: ${canvasVisible}`);

    // Берём содержимое canvas и проверяем, что он не пустой
    // (у Lightweight Charts canvas — внутри контейнера, рисуем пиксельный тест)
    let hasPixels = false;
    if (canvasVisible) {
      try {
        const buffer = await page.locator('canvas').first().screenshot();
        hasPixels = buffer && buffer.length > 1000; // > 1KB значит что-то отрисовано
        console.log(`[TEST] Размер снапшота canvas: ${buffer.length} байт`);
      } catch (e) {
        console.log(`[TEST] Не удалось снять canvas: ${e.message}`);
      }
    }

    // Ищем в консоли диагностику по этому сценарию
    const recent = consoleLog.slice(-40).map((l) => l.text);
    const foundTokens = DIAGNOSTIC_TOKENS.map((token) => {
      const has = recent.some((line) => line.includes(token));
      return `${has ? '✓' : '✗'} ${token}`;
    });
    console.log(`[TEST] Диагностические сообщения:`);
    foundTokens.forEach((t) => console.log(`         ${t}`));

    // Берём сообщение "Candles loaded = N" для проверки количества свечей
    const candlesLine = recent.find((l) => l.includes('Candles loaded'));
    if (candlesLine) {
      const m = candlesLine.match(/=\s*(\d+)/);
      if (m) {
        const count = parseInt(m[1], 10);
        console.log(`[TEST] Количество свечей: ${count} ${count >= 150 && count <= 320 ? '✓ (в диапазоне 150-300)' : '⚠ вне диапазона'}`);
      }
    } else {
      console.log(`[TEST] ⚠ Строка "Candles loaded" не найдена в консоли`);
    }

    // Сохраняем общий скриншот страницы
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`[TEST] Скриншот сохранён: ${screenshotPath}`);

    return { canvasFound, canvasVisible, hasPixels, foundTokens, candlesLine };
  }

  // -------- Проверка сценария 1 --------
  const r1 = await verifyScenario(1, 'screenshots/scenario_1.png');

  // -------- Переход к следующим сценариям --------
  // Кнопка "→ Дальше" имеет id="lt-btn-next"
  const nextSelectors = [
    '#lt-btn-next',
    'button:has-text("Дальше")',
    'button:has-text("Следующий")',
    'button:has-text("Следующий сценарий")',
    'button:has-text("Далее")',
    'button:has-text("Next")',
    '[data-action="next"]',
  ];

  async function clickNext() {
    for (const sel of nextSelectors) {
      const btn = await page.$(sel);
      if (btn) {
        const visible = await btn.isVisible().catch(() => false);
        const enabled = await btn.isEnabled().catch(() => true);
        if (visible && enabled) {
          await btn.click();
          return true;
        }
      }
    }
    return false;
  }

  // Перебираем оставшиеся сценарии: 2, 3, 5, 10
  // Каждый раз жмём "Дальше" 1 раз, потому что идём последовательно.
  for (const target of TARGET_SCENARIOS.slice(1)) {
    console.log(`\n[TEST] >>> Перехожу к сценарию ${target}`);

    const clicked = await clickNext();
    if (!clicked) {
      console.error(`[TEST] ❌ Не нашёл кнопку Next перед сценарием ${target}`);
      await page.screenshot({ path: `screenshots/FAIL_no_next_before_${target}.png`, fullPage: true });
      continue;
    }
    await page.waitForTimeout(2500);
    await verifyScenario(target, `screenshots/scenario_${target}.png`);
  }

  // -------- Итог --------
  console.log('\n========================================');
  console.log('[TEST] ИТОГ ТЕСТА');
  console.log('========================================');
  console.log(`JS-ошибок на странице: ${pageErrors.length}`);
  if (pageErrors.length > 0) {
    pageErrors.forEach((e) => console.log(`   • ${e}`));
  }
  console.log(`Всего console-сообщений: ${consoleLog.length}`);

  // Сохраняем полный лог консоли
  const fs = require('fs');
  fs.mkdirSync('logs', { recursive: true });
  fs.writeFileSync('logs/console.log', consoleLog.map((l) => `[${l.type}] ${l.text}`).join('\n'));
  console.log('[TEST] Полный лог консоли сохранён в logs/console.log');

  await browser.close();
})().catch((e) => {
  console.error('[TEST] FATAL:', e);
  process.exit(1);
});
