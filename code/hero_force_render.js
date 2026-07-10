const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text());
  });

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

  // Wait for the element to be present
  console.log('Waiting for #payd-hero-3d element...');
  await page.waitForSelector('#payd-hero-3d', { timeout: 30000 });

  // Check that __forceRender exists
  const forceRenderExists = await page.evaluate(() => typeof window.__forceRender);
  console.log('window.__forceRender type:', forceRenderExists);

  // Get bounding box info
  const box = await page.evaluate(() => {
    const el = document.querySelector('#payd-hero-3d');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  console.log('Element box:', JSON.stringify(box));

  // Step 3: Force render at 8 (climax)
  console.log('Step 3: Force render at 8 (climax)');
  await page.evaluate(() => {
    if (typeof window.__forceRender === 'function') {
      window.__forceRender(8);
    } else {
      throw new Error('window.__forceRender is not a function');
    }
  });
  await page.waitForTimeout(500);

  // Step 4: Bounding box clip screenshot
  console.log('Step 4: Screenshot 1 at frame 8');
  const boxPos = { x: 745, y: 129, width: 582, height: 460 };
  await page.screenshot({
    path: '/workspace/imgs/hero_forceRender_08_climax.png',
    clip: boxPos,
  });
  console.log('Saved hero_forceRender_08_climax.png');

  // Step 5: Wait 1 second
  console.log('Step 5: Wait 1 second');
  await page.waitForTimeout(1000);

  // Step 6: Force render at 11 (correction)
  console.log('Step 6: Force render at 11');
  await page.evaluate(() => window.__forceRender(11));
  await page.waitForTimeout(500);

  // Step 7: Bounding box clip screenshot
  console.log('Step 7: Screenshot 2 at frame 11');
  await page.screenshot({
    path: '/workspace/imgs/hero_forceRender_11_correction.png',
    clip: boxPos,
  });
  console.log('Saved hero_forceRender_11_correction.png');

  // Step 8: Wait 1 second
  console.log('Step 8: Wait 1 second');
  await page.waitForTimeout(1000);

  // Step 9: Force render at 2 (beginning of growth)
  console.log('Step 9: Force render at 2');
  await page.evaluate(() => window.__forceRender(2));
  await page.waitForTimeout(500);

  // Step 10: Bounding box clip screenshot
  console.log('Step 10: Screenshot 3 at frame 2');
  await page.screenshot({
    path: '/workspace/imgs/hero_forceRender_02_growth.png',
    clip: boxPos,
  });
  console.log('Saved hero_forceRender_02_growth.png');

  await browser.close();
  console.log('Done!');
})().catch(err => {
  console.error('SCRIPT ERROR:', err);
  process.exit(1);
});
