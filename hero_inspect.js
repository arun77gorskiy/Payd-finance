const { chromium } = require('/workspace/node_modules/playwright/index.js');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Capture console logs and errors
  const consoleLogs = [];
  const consoleErrors = [];
  page.on('console', msg => {
    consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => {
    consoleErrors.push(`PageError: ${err.message}`);
  });

  console.log('=== NAVIGATING ===');
  await page.goto('https://igfhaekyzazp.space.minimax.io', { waitUntil: 'networkidle', timeout: 30000 });

  // Scroll to top
  await page.evaluate(() => window.scrollTo(0, 0));

  console.log('=== WAITING 5 SECONDS FOR ANIMATION ===');
  await page.waitForTimeout(5000);

  // Get hero element bounding box
  console.log('=== INSPECTING HERO ELEMENT ===');
  const heroInfo = await page.evaluate(() => {
    const el = document.querySelector('#payd-hero-3d');
    if (!el) return { found: false };
    const rect = el.getBoundingClientRect();
    return {
      found: true,
      tag: el.tagName,
      id: el.id,
      className: el.className,
      boundingBox: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      offsetWidth: el.offsetWidth,
      offsetHeight: el.offsetHeight,
      childCount: el.children.length
    };
  });
  console.log('Hero Info:', JSON.stringify(heroInfo, null, 2));

  // Get __heroPremium properties
  console.log('=== __heroPremium PROPERTIES ===');
  const heroData = await page.evaluate(() => {
    const result = {};
    if (typeof window.__heroPremium === 'undefined') {
      result.exists = false;
      result.message = 'window.__heroPremium is UNDEFINED';
    } else {
      result.exists = true;
      result.type = typeof window.__heroPremium;
      result.keys = Object.keys(window.__heroPremium);

      // Try to get each requested value
      try {
        result.scene_children_length = window.__heroPremium.scene?.children?.length;
      } catch (e) { result.scene_children_length = `ERROR: ${e.message}`; }

      try {
        result.bars_length = window.__heroPremium.bars?.length;
      } catch (e) { result.bars_length = `ERROR: ${e.message}`; }

      try {
        result.orbitGroup_children_length = window.__heroPremium.orbitGroup?.children?.length;
      } catch (e) { result.orbitGroup_children_length = `ERROR: ${e.message}`; }

      try {
        result.rings_length = window.__heroPremium.rings?.length;
      } catch (e) { result.rings_length = `ERROR: ${e.message}`; }

      try {
        result.fontReady = window.__heroPremium.fontReady;
      } catch (e) { result.fontReady = `ERROR: ${e.message}`; }

      try {
        result.isVisible = window.__heroPremium.isVisible;
      } catch (e) { result.isVisible = `ERROR: ${e.message}`; }
    }
    return result;
  });
  console.log('Hero Data:', JSON.stringify(heroData, null, 2));

  // Take full page screenshot
  console.log('=== TAKING FULL PAGE SCREENSHOT ===');
  await page.screenshot({ path: '/workspace/browser/screenshots/hero_full_page_t5.png', fullPage: true });

  // Take hero-only screenshot using clip
  if (heroInfo.found) {
    console.log('=== TAKING HERO-ONLY SCREENSHOT (T=5s) ===');
    await page.screenshot({
      path: '/workspace/browser/screenshots/hero_element_t5.png',
      clip: {
        x: Math.max(0, heroInfo.boundingBox.x),
        y: Math.max(0, heroInfo.boundingBox.y),
        width: heroInfo.boundingBox.width,
        height: heroInfo.boundingBox.height
      }
    });
  }

  // Wait another 5 seconds and take another hero screenshot
  console.log('=== WAITING ANOTHER 5 SECONDS ===');
  await page.waitForTimeout(5000);

  if (heroInfo.found) {
    console.log('=== TAKING HERO-ONLY SCREENSHOT (T=10s) ===');
    await page.screenshot({
      path: '/workspace/browser/screenshots/hero_element_t10.png',
      clip: {
        x: Math.max(0, heroInfo.boundingBox.x),
        y: Math.max(0, heroInfo.boundingBox.y),
        width: heroInfo.boundingBox.width,
        height: heroInfo.boundingBox.height
      }
    });
  }

  // Take final full page screenshot
  await page.screenshot({ path: '/workspace/browser/screenshots/hero_full_page_t10.png', fullPage: true });

  console.log('=== CONSOLE LOGS ===');
  consoleLogs.forEach(log => console.log(log));

  console.log('=== CONSOLE ERRORS ===');
  consoleErrors.forEach(err => console.log(err));

  console.log('=== DONE ===');
  console.log(JSON.stringify({
    heroInfo,
    heroData,
    consoleLogsCount: consoleLogs.length,
    consoleErrorsCount: consoleErrors.length,
    consoleErrors
  }, null, 2));

  await browser.close();
})().catch(err => {
  console.error('SCRIPT ERROR:', err);
  process.exit(1);
});