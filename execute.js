const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture all browser console messages
  const consoleLogs = [];
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', err => {
    consoleLogs.push(`[pageerror] ${err.message}`);
  });

  // Navigate to the target URL
  console.log('Navigating to https://k4ushhz0zlzo.space.minimax.io/ ...');
  await page.goto('https://k4ushhz0zlzo.space.minimax.io/', { waitUntil: 'networkidle', timeout: 60000 });

  // Wait a bit for any async scripts to populate window.__labLogs
  await page.waitForTimeout(5000);

  // Execute the user-specified JavaScript code
  console.log('\nExecuting user-specified JavaScript code...');
  const result = await page.evaluate(() => {
    try {
      const logs = (window.__labLogs || []).slice(-40).map(l => l.level + ':' + l.msg);
      document.title = 'LOGS:' + JSON.stringify(logs);
      const title = document.title;
      const totalLogs = (window.__labLogs || []).length;
      const last40 = logs;
      return { success: true, title, totalLogs, last40 };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });

  console.log('\n=== RESULT ===');
  console.log(JSON.stringify(result, null, 2));

  console.log('\n=== Browser Console Logs ===');
  for (const log of consoleLogs) {
    console.log(log);
  }

  await browser.close();
})().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
