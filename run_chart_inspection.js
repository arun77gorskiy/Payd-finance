// run_chart_inspection.js
// Использует Playwright для навигации в Trainer Module 1 и выполнения JS-команд пользователя
const { chromium } = require('/tmp/.npm-global/lib/node_modules/playwright');

(async () => {
  console.log('🚀 Запуск браузера...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  // Перехватываем консольные сообщения со страницы
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    consoleLogs.push(`[pageerror] ${err.message}`);
  });

  try {
    console.log('🌐 Переход на https://yutnvfddkjqc.space.minimax.io/lab.html ...');
    await page.goto('https://yutnvfddkjqc.space.minimax.io/lab.html', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    console.log('🔎 Ищем кнопку "Начать сценарий" для Module 1...');

    // Попытка 1: ищем по тексту "Начать сценарий"
    let scenarioButton = page.getByRole('button', { name: /Начать сценарий/i }).first();

    let buttonFound = false;
    try {
      await scenarioButton.waitFor({ state: 'visible', timeout: 10000 });
      buttonFound = true;
      console.log('✅ Кнопка найдена через getByRole');
    } catch (e) {
      console.log('⚠️  Не найдено через getByRole, пробуем альтернативный селектор...');
      // Попытка 2: ищем через селектор по тексту
      const buttons = await page.$$('button');
      for (const btn of buttons) {
        const text = await btn.textContent();
        if (text && text.includes('Начать сценарий')) {
          scenarioButton = btn;
          buttonFound = true;
          console.log('✅ Кнопка найдена через перебор всех <button>');
          break;
        }
      }
    }

    if (!buttonFound) {
      // Попытка 3: сделать скриншот и сообщить
      console.log('❌ Кнопка "Начать сценарий" не найдена. Делаю скриншот...');
      await page.screenshot({ path: '/workspace/run_chart_inspection_fail.png', fullPage: true });
      // Попробуем вывести все кнопки
      const allButtons = await page.$$eval('button', els => els.map(e => ({ text: e.textContent.trim().substring(0, 100), id: e.id, class: e.className })));
      console.log('Все кнопки на странице:', JSON.stringify(allButtons, null, 2));
      throw new Error('Кнопка "Начать сценарий" не найдена');
    }

    console.log('🖱️  Кликаем по кнопке "Начать сценарий"...');
    await scenarioButton.click();

    console.log('⏳ Ждём загрузки графика (до 30 сек)...');
    // Ждём появления canvas графика или элемента с классом lt-terminal-pointer
    await page.waitForTimeout(5000);

    // Попробуем дождаться canvas
    try {
      await page.waitForSelector('canvas', { state: 'attached', timeout: 15000 });
      console.log('✅ Canvas найден');
    } catch (e) {
      console.log('⚠️  Canvas не найден за 15 сек, продолжаем...');
    }

    await page.waitForTimeout(5000); // Дополнительная пауза для инициализации чарта

    console.log('\n📊 Выполняем JS-команды пользователя:\n');
    console.log('=' .repeat(60));

    // Выполняем команды пользователя
    const inspectionResult = await page.evaluate(() => {
      const result = {
        command1_lt_terminal_pointer_count: null,
        command2_pointer_events_per_element: [],
        command3_timeScale_visibleLogicalRange: null,
        command4_handleScroll_options: null,
        command5_handleScale_options: null,
        debug: {}
      };

      // Команда 1: document.querySelectorAll('.lt-terminal-pointer').length
      try {
        const pointers = document.querySelectorAll('.lt-terminal-pointer');
        result.command1_lt_terminal_pointer_count = pointers.length;
      } catch (e) {
        result.command1_lt_terminal_pointer_count = `ERROR: ${e.message}`;
      }

      // Команда 2: для каждого .lt-terminal-pointer - getComputedStyle(el).pointerEvents
      try {
        const pointers = document.querySelectorAll('.lt-terminal-pointer');
        const list = [];
        pointers.forEach((el, idx) => {
          const cs = getComputedStyle(el);
          list.push({
            index: idx,
            className: el.className,
            pointerEvents: cs.pointerEvents,
            position: cs.position,
            cursor: cs.cursor,
            zIndex: cs.zIndex,
            display: cs.display,
            visibility: cs.visibility,
            opacity: cs.opacity,
            tagName: el.tagName
          });
        });
        result.command2_pointer_events_per_element = list;
      } catch (e) {
        result.command2_pointer_events_per_element = `ERROR: ${e.message}`;
      }

      // Поиск объекта chart в глобальной области видимости
      let chart = null;
      const candidates = [
        window.chart,
        window.LabTrainer && window.LabTrainer.instance && window.LabTrainer.instance.chart,
        window.LabTrainer && window.LabTrainer.instance && window.LabTrainer.instance.tradingTerminal && window.LabTrainer.instance.tradingTerminal.chart,
        window.LabTrainer && window.LabTrainer.chart,
        window.tradingTerminal && window.tradingTerminal.chart,
        window.LabTerminal && window.LabTerminal.chart,
        window.TradingTerminal && window.TradingTerminal.chart
      ];
      for (const c of candidates) {
        if (c && typeof c.timeScale === 'function') {
          chart = c;
          break;
        }
      }

      result.debug.chart_candidates = candidates.map(c => !!c);
      result.debug.chart_found = !!chart;
      result.debug.LabTrainer_exists = !!window.LabTrainer;
      result.debug.LabTrainer_keys = window.LabTrainer ? Object.keys(window.LabTrainer) : [];

      // Команда 3: chart.timeScale().getVisibleLogicalRange()
      try {
        if (chart) {
          const range = chart.timeScale().getVisibleLogicalRange();
          result.command3_timeScale_visibleLogicalRange = range;
        } else {
          result.command3_timeScale_visibleLogicalRange = 'CHART_NOT_FOUND';
        }
      } catch (e) {
        result.command3_timeScale_visibleLogicalRange = `ERROR: ${e.message}`;
      }

      // Команда 4: chart.options().handleScroll
      try {
        if (chart) {
          const opts = chart.options();
          result.command4_handleScroll_options = opts.handleScroll;
        } else {
          result.command4_handleScroll_options = 'CHART_NOT_FOUND';
        }
      } catch (e) {
        result.command4_handleScroll_options = `ERROR: ${e.message}`;
      }

      // Команда 5: chart.options().handleScale
      try {
        if (chart) {
          const opts = chart.options();
          result.command5_handleScale_options = opts.handleScale;
        } else {
          result.command5_handleScale_options = 'CHART_NOT_FOUND';
        }
      } catch (e) {
        result.command5_handleScale_options = `ERROR: ${e.message}`;
      }

      return result;
    });

    console.log('\n🔹 КОМАНДА 1: document.querySelectorAll(".lt-terminal-pointer").length');
    console.log('   Результат:', inspectionResult.command1_lt_terminal_pointer_count);

    console.log('\n🔹 КОМАНДА 2: getComputedStyle(el).pointerEvents для каждого .lt-terminal-pointer');
    if (Array.isArray(inspectionResult.command2_pointer_events_per_element)) {
      console.log(`   Всего элементов: ${inspectionResult.command2_pointer_events_per_element.length}`);
      inspectionResult.command2_pointer_events_per_element.forEach((item) => {
        console.log(`   [${item.index}] tag=${item.tagName} class="${item.className}"`);
        console.log(`       pointer-events: ${item.pointerEvents}`);
        console.log(`       position: ${item.position}, cursor: ${item.cursor}, z-index: ${item.zIndex}`);
        console.log(`       display: ${item.display}, visibility: ${item.visibility}, opacity: ${item.opacity}`);
      });
    } else {
      console.log('   ', inspectionResult.command2_pointer_events_per_element);
    }

    console.log('\n🔹 КОМАНДА 3: chart.timeScale().getVisibleLogicalRange()');
    console.log('   Результат:', JSON.stringify(inspectionResult.command3_timeScale_visibleLogicalRange));

    console.log('\n🔹 КОМАНДА 4: chart.options().handleScroll');
    console.log('   Результат:', JSON.stringify(inspectionResult.command4_handleScroll_options));

    console.log('\n🔹 КОМАНДА 5: chart.options().handleScale');
    console.log('   Результат:', JSON.stringify(inspectionResult.command5_handleScale_options));

    console.log('\n📋 ОТЛАДОЧНАЯ ИНФОРМАЦИЯ:');
    console.log('   LabTrainer существует:', inspectionResult.debug.LabTrainer_exists);
    console.log('   LabTrainer ключи:', JSON.stringify(inspectionResult.debug.LabTrainer_keys));
    console.log('   Chart найден:', inspectionResult.debug.chart_found);

    console.log('\n' + '=' .repeat(60));
    console.log('📜 Логи консоли со страницы:');
    consoleLogs.forEach(log => console.log('   ', log));

    // Делаем финальный скриншот
    await page.screenshot({ path: '/workspace/run_chart_inspection_result.png', fullPage: true });
    console.log('\n📸 Скриншот сохранён в /workspace/run_chart_inspection_result.png');

  } catch (err) {
    console.error('\n❌ ОШИБКА:', err.message);
    console.error(err.stack);
    await page.screenshot({ path: '/workspace/run_chart_inspection_error.png', fullPage: true });
    console.log('📸 Скриншот ошибки сохранён в /workspace/run_chart_inspection_error.png');
  } finally {
    await browser.close();
    console.log('\n🏁 Браузер закрыт');
  }
})();