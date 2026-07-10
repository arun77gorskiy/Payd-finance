const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const errors = [];
  page.on('pageerror', err => errors.push('PAGE ERROR: ' + err.message));

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

  // Check if element and __forceRender exist
  const info = await page.evaluate(() => {
    const el = document.querySelector('#payd-hero-3d');
    const result = {
      elementExists: !!el,
      elementVisible: el ? !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) : false,
      forceRenderType: typeof window.__forceRender,
    };
    if (el) {
      const r = el.getBoundingClientRect();
      result.box = { x: r.x, y: r.y, width: r.width, height: r.height };
      const style = window.getComputedStyle(el);
      result.display = style.display;
      result.opacity = style.opacity;
      result.visibility = style.visibility;
      result.transform = style.transform;
    }
    return result;
  });
  console.log('Page info:', JSON.stringify(info, null, 2));

  if (!info.elementExists) {
    throw new Error('#payd-hero-3d element not found in DOM');
  }

  if (info.forceRenderType !== 'function') {
    throw new Error('window.__forceRender is not a function, type: ' + info.forceRenderType);
  }

  console.log('Step 3: Force render at 8 (climax)');
  await page.evaluate(() => window.__forceRender(8));
  await page.waitForTimeout(800);

  console.log('Step 4: Screenshot 1 at frame 8');
  const boxPos = { x: 745, y: 129, width: 582, height: 460 };
  await page.screenshot({
    path: '/workspace/imgs/hero_forceRender_08_climax.png',
    clip: boxPos,
  });
  console.log('Saved hero_forceRender_08_climax.png');

  console.log('Step 5: Wait 1 second');
  await page.waitForTimeout(1000);

  console.log('Step 6: Force render at 11');
  await page.evaluate(() => window.__forceRender(11));
  await page.waitForTimeout(800);

  console.log('Step 7: Screenshot 2 at frame 11');
  await page.screenshot({
    path: '/workspace/imgs/hero_forceRender_11_correction.png',
    clip: boxPos,
  });
  console.log('Saved hero_forceRender_11_correction.png');

  console.log('Step 8: Wait 1 second');
  await page.waitForTimeout(1000);

  console.log('Step 9: Force render at 2');
  await page.evaluate(() => window.__forceRender(2));
  await page.waitForTimeout(800);

  console.log('Step 10: Screenshot 3 at frame 2');
  await page.screenshot({
    path: '/workspace/imgs/hero_forceRender_02_growth.png',
    clip: boxPos,
  });
  console.log('Saved hero_forceRender_02_growth.png');

  if (errors.length) {
    console.log('\nPage errors encountered:');
    errors.slice(0, 5).forEach(e => console.log(' -', e));
    console.log(`(${errors.length} total errors)`);
  }

  await browser.close();
  console.log('\nAll 3 screenshots saved successfully!');
})().catch(err => {
  console.error('SCRIPT ERROR:', err.message);
  process.exit(1);
});
