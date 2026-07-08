const { chromium } = require('/tmp/.npm-global/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const consoleLogs = [];
  page.on('console', msg => consoleLogs.push({ type: msg.type(), text: msg.text() }));

  await page.goto('https://k4ushhz0zlzo.space.minimax.io/?_=final3#edu/trading-lab/0', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(20000);

  // Click Long
  await page.locator('button').filter({ hasText: /Long/i }).first().click({ force: true });
  await page.waitForTimeout(1000);

  // Fill values
  const inputs = await page.locator('input[type="number"]').all();
  if (inputs.length >= 3) {
    await inputs[1].fill('75000');
    await inputs[2].fill('79000');
  }
  await page.waitForTimeout(500);

  // Click confirm
  await page.locator('button').filter({ hasText: /Подтвердить Long/i }).first().click();
  await page.waitForTimeout(10000);

  // Extract logs
  const result = await page.evaluate(() => {
    const logs = window.__labLogs || [];
    const titleStr = 'LOGS:' + JSON.stringify(logs.slice(-50).map(l => l.level + ':' + l.msg));
    document.title = titleStr;
    return {
      logCount: logs.length,
      hasLabLogs: typeof window.__labLogs !== 'undefined',
      logs: logs.slice(-50).map(l => ({ level: l.level, msg: l.msg })),
      title: titleStr,
      windowKeys: Object.keys(window).filter(k => k.includes('log') || k.includes('Log') || k.includes('Lab') || k.includes('Trainer')).slice(0, 30)
    };
  });

  console.log('FINAL_TITLE: ' + result.title);
  console.log('LOG_COUNT: ' + result.logCount);
  console.log('HAS_LOGS: ' + result.hasLabLogs);
  console.log('WINDOW_KEYS:', JSON.stringify(result.windowKeys));
  console.log('LOGS:', JSON.stringify(result.logs));
  console.log('--- Console Errors ---');
  consoleLogs.filter(l => l.type === 'error').slice(0, 5).forEach(l => console.log(l.text));

  await page.screenshot({ path: '/workspace/browser/screenshots/final_complete.png', fullPage: true });
  await browser.close();
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });