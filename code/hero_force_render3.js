const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  // Increase screenshot timeout
  page.setDefaultTimeout(120000);

  console.log('Navigating...');
  await page.goto('https://pnz0g46p7ivf.space.minimax.io', {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });

  console.log('Step 1: Scroll to top');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);

  console.log('Step 2: Wait 8 seconds');
  await page.waitForTimeout(8000);

  // Step 3: Force render at 8
  console.log('Step 3: Force render at 8 (climax)');
  await page.evaluate(() => window.__forceRender(8));
  await page.waitForTimeout(1500);

  // Step 4: Screenshot 1
  console.log('Step 4: Screenshot 1 at frame 8');
  const boxPos = { x: 745, y: 129, width: 582, height: 460 };
  await page.screenshot({
    path: '/workspace/imgs/hero_forceRender_08_climax.png',
    clip: boxPos,
    timeout: 120000,
  });
  console.log('  Saved hero_forceRender_08_climax.png');

  // Step 5: Wait 1 second
  console.log('Step 5: Wait 1 second');
  await page.waitForTimeout(1000);

  // Step 6: Force render at 11
  console.log('Step 6: Force render at 11');
  await page.evaluate(() => window.__forceRender(11));
  await page.waitForTimeout(1500);

  // Step 7: Screenshot 2
  console.log('Step 7: Screenshot 2 at frame 11');
  await page.screenshot({
    path: '/workspace/imgs/hero_forceRender_11_correction.png',
    clip: boxPos,
    timeout: 120000,
  });
  console.log('  Saved hero_forceRender_11_correction.png');

  // Step 8: Wait 1 second
  console.log('Step 8: Wait 1 second');
  await page.waitForTimeout(1000);

  // Step 9: Force render at 2
  console.log('Step 9: Force render at 2');
  await page.evaluate(() => window.__forceRender(2));
  await page.waitForTimeout(1500);

  // Step 10: Screenshot 3
  console.log('Step 10: Screenshot 3 at frame 2');
  await page.screenshot({
    path: '/workspace/imgs/hero_forceRender_02_growth.png',
    clip: boxPos,
    timeout: 120000,
  });
  console.log('  Saved hero_forceRender_02_growth.png');

  await browser.close();
  console.log('\nAll 3 screenshots saved!');
})().catch(err => {
  console.error('SCRIPT ERROR:', err.message);
  process.exit(1);
});
