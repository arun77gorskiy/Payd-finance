const { chromium } = require('/tmp/.npm-global/lib/node_modules/playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const logs = [];
  page.on('console', msg => logs.push(`[CONSOLE ${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[PAGE ERROR] ${err.message}`));

  try {
    console.log('Step 1: Navigating...');
    await page.goto('https://k4ushhz0zlzo.space.minimax.io/#edu/trading-lab/0', { waitUntil: 'networkidle', timeout: 60000 });
    console.log('Step 2: Waiting 20 seconds...');
    await page.waitForTimeout(20000);

    console.log('Step 3: Clicking ▲ Long...');
    // Find the button with "▲" and "Long"
    const longBtn = await page.locator('button').filter({ hasText: /^\s*▲\s*Long/i }).first();
    await longBtn.click({ timeout: 10000 });
    await page.waitForTimeout(1000);

    console.log('Step 4: Setting Stop Loss to 75000...');
    // Find Stop Loss input - typically has label or placeholder
    const stopLossInputs = await page.locator('input[type="number"]').all();
    console.log(`Found ${stopLossInputs.length} number inputs`);

    // Try to find by surrounding label text
    const stopLossInput = page.locator('input[type="number"]').nth(0);
    await stopLossInput.click({ clickCount: 3 });
    await stopLossInput.fill('75000');
    await stopLossInput.press('Tab');
    await page.waitForTimeout(500);

    console.log('Step 5: Setting Take Profit to 79000...');
    const takeProfitInput = page.locator('input[type="number"]').nth(1);
    await takeProfitInput.click({ clickCount: 3 });
    await takeProfitInput.fill('79000');
    await takeProfitInput.press('Tab');
    await page.waitForTimeout(500);

    console.log('Step 6: Clicking "✓ Подтвердить Long Enter"...');
    const confirmBtn = await page.locator('button').filter({ hasText: /Подтвердить Long/i }).first();
    await confirmBtn.click({ timeout: 10000 });

    console.log('Step 7: Waiting 10 seconds...');
    await page.waitForTimeout(10000);

    console.log('Step 8: Setting document.title with logs...');
    const title = await page.evaluate(() => {
      const logs = (window.__labLogs || []);
      const titleStr = 'LOGS:' + JSON.stringify(logs.slice(-50).map(l => l.level + ':' + l.msg));
      document.title = titleStr;
      return titleStr;
    });

    console.log('Step 9: Read document.title...');
    const finalTitle = await page.title();
    console.log('FINAL_TITLE: ' + finalTitle);
    console.log('TITLE_PLAIN: ' + finalTitle);
    console.log('LOGS_FROM_PAGE: ' + title);

    console.log('Step 10: Screenshot...');
    await page.screenshot({ path: '/workspace/browser/screenshots/final.png', fullPage: true });

    console.log('\n=== Console logs from page ===');
    logs.forEach(l => console.log(l));

  } catch (err) {
    console.error('ERROR:', err.message);
    console.error(err.stack);
    try {
      await page.screenshot({ path: '/workspace/browser/screenshots/error.png', fullPage: true });
    } catch (e) {}
  } finally {
    await browser.close();
  }
})();
