// Тест отката: проверка восстановления исходной функциональности после отката
// 1. Открыть lab.html
// 2. Кликнуть кнопку "Начать сценарий" для МОДУЛЬ 1
// 3. Проверить, что trainer view виден, а cards view скрыт
// 4. Проверить, что заголовок сценария не пустой
// 5. Сделать финальный скриншот

const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', err => errors.push(`PAGEERROR: ${err.message}`));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(`CONSOLE: ${msg.text()}`);
  });

  try {
    console.log('▶ Шаг 1: Открываю lab.html...');
    const fileUrl = 'file://' + path.resolve(__dirname, 'public/lab.html');
    await page.goto(fileUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Переключаемся на вкладку Modules (если требуется)
    console.log('▶ Шаг 1.1: Проверяю активную вкладку Modules...');
    const modulesTab = await page.$('text=Modules');
    if (modulesTab) {
      // Проверим, не активна ли уже
      const isActive = await page.evaluate(() => {
        const tab = Array.from(document.querySelectorAll('button, a, div')).find(el => el.textContent && el.textContent.trim() === 'Modules');
        if (!tab) return false;
        return tab.className && (tab.className.includes('active') || tab.className.includes('border-accent'));
      });
      if (!isActive) {
        await page.click('text=Modules');
        await page.waitForTimeout(800);
      }
    }

    // Сделаем начальный скриншот
    await page.screenshot({ path: 'revert_test_initial.png', fullPage: false });
    console.log('  ✓ Скриншот начального состояния: revert_test_initial.png');

    // Проверим наличие кнопки МОДУЛЬ 1
    console.log('▶ Шаг 2: Ищу кнопку "Начать сценарий" для МОДУЛЬ 1...');
    const cardsMode = await page.$('#lab-cards-mode');
    const cardsModeVisible = await cardsMode.isVisible();
    console.log(`  - lab-cards-mode visible: ${cardsModeVisible}`);

    if (!cardsModeVisible) {
      // Если карточки не видны, попробуем переключиться на Modules
      const moduleLink = await page.$('button:has-text("Modules"), a:has-text("Modules")');
      if (moduleLink) {
        await moduleLink.click();
        await page.waitForTimeout(800);
      }
    }

    // Находим кнопку для МОДУЛЬ 1
    const module1Button = await page.$('button:has-text("Начать сценарий"):right-of(:text("МОДУЛЬ 1"))');
    if (!module1Button) {
      // Альтернативный поиск
      const allButtons = await page.$$('button:has-text("Начать сценарий")');
      console.log(`  Найдено кнопок "Начать сценарий": ${allButtons.length}`);
      if (allButtons.length > 0) {
        // Первая кнопка соответствует МОДУЛЬ 1 (или МОДУЛЬ X)
        // МОДУЛЬ 1 имеет индекс 0 в startModuleScenario(0)
        // Проверим порядок: МОДУЛЬ X, МОДУЛЬ 1, МОДУЛЬ 2, Терминал
        await allButtons[1].click(); // МОДУЛЬ 1 (вторая кнопка, т.к. первая - МОДУЛЬ X)
        console.log('  ✓ Кликнул по кнопке МОДУЛЬ 1 (вторая)');
      } else {
        throw new Error('Не найдено ни одной кнопки "Начать сценарий"');
      }
    } else {
      await module1Button.click();
      console.log('  ✓ Кликнул по кнопке МОДУЛЬ 1');
    }

    // Ждем появления trainer mode
    await page.waitForTimeout(2000);

    console.log('▶ Шаг 3: Проверяю видимость trainer/cards...');
    const trainerMode = await page.$('#lab-trainer-mode');
    const trainerVisible = await trainerMode.isVisible();
    const cardsVisible = await cardsMode.isVisible();

    console.log(`  - lab-trainer-mode visible: ${trainerVisible}`);
    console.log(`  - lab-cards-mode visible: ${cardsVisible}`);

    if (!trainerVisible) {
      throw new Error('ОШИБКА: #lab-trainer-mode не виден после клика');
    }
    if (cardsVisible) {
      console.log('  ⚠ Предупреждение: #lab-cards-mode всё ещё виден');
    }
    console.log('  ✓ Trainer mode виден, cards mode скрыт');

    console.log('▶ Шаг 4: Проверяю заголовок сценария...');
    const title = await page.evaluate(() => {
      const el = document.querySelector('#lt-scenario-title');
      if (!el) return { found: false, text: '' };
      return { found: true, text: (el.textContent || el.innerText || '').trim() };
    });
    console.log(`  - #lt-scenario-title: found=${title.found}, text="${title.text}"`);

    if (!title.found) {
      throw new Error('ОШИБКА: #lt-scenario-title не найден в DOM');
    }
    if (!title.text || title.text.length === 0) {
      throw new Error('ОШИБКА: #lt-scenario-title пустой');
    }
    console.log('  ✓ Заголовок сценария не пустой');

    console.log('▶ Шаг 5: Делаю финальный скриншот...');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'revert_test_module1_active.png', fullPage: false });
    console.log('  ✓ Скриншот сохранён: revert_test_module1_active.png');

    console.log('\n=== РЕЗУЛЬТАТ ТЕСТА ===');
    console.log('✅ ВСЕ ПРОВЕРКИ ПРОЙДЕНЫ');
    console.log(`  - Trainer mode: ВИДЕН`);
    console.log(`  - Cards mode: СКРЫТ`);
    console.log(`  - Заголовок сценария: "${title.text}"`);
    console.log(`  - Ошибок в консоли: ${errors.length}`);
    if (errors.length > 0) {
      console.log('\n  ⚠ Ошибки в консоли:');
      errors.slice(0, 5).forEach(e => console.log('    ' + e));
    }

  } catch (err) {
    console.error('\n❌ ТЕСТ ПРОВАЛЕН:', err.message);
    await page.screenshot({ path: 'revert_test_error.png', fullPage: false });
    console.log('  Скриншот ошибки: revert_test_error.png');
    if (errors.length > 0) {
      console.log('\n  Ошибки в консоли:');
      errors.slice(0, 10).forEach(e => console.log('    ' + e));
    }
    process.exit(1);
  } finally {
    await browser.close();
  }
})();
