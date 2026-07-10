// Take clipped screenshots of #payd-hero-3d element at different animation phases
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const url = 'https://fv8xyel7ciwk.space.minimax.io';
  const outDir = '/workspace/downloads/payd-screenshots';

  // Ensure output directory exists
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

  // Wait for the element to exist and animations to start
  await page.waitForSelector('#payd-hero-3d', { timeout: 30000 });
  await page.waitForTimeout(2000);

  // Get the bounding box of the element
  const box = await page.evaluate(() => {
    const el = document.querySelector('#payd-hero-3d');
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      exists: true,
      tag: el.tagName,
      visible: rect.width > 0 && rect.height > 0
    };
  });

  console.log('Element bounding box:', JSON.stringify(box, null, 2));

  if (!box || !box.exists) {
    throw new Error('Element #payd-hero-3d not found');
  }

  // Use clip parameter for screenshot
  const clip = {
    x: Math.floor(box.x),
    y: Math.floor(box.y),
    width: Math.ceil(box.width),
    height: Math.ceil(box.height)
  };

  console.log('Clip box:', clip);

  // Take 3 screenshots with 2-3 second intervals
  const intervals = [0, 2500, 2500]; // ms - first one immediately, then 2.5s, then 2.5s
  const screenshots = [];

  for (let i = 0; i < 3; i++) {
    if (i > 0) {
      console.log(`Waiting ${intervals[i]}ms for next animation phase...`);
      await page.waitForTimeout(intervals[i]);
    }

    const filename = `payd-hero-3d-frame-${i + 1}-${Date.now()}.png`;
    const filepath = path.join(outDir, filename);

    console.log(`Taking screenshot ${i + 1}/3: ${filename}`);
    await page.screenshot({
      path: filepath,
      clip: clip,
      type: 'png'
    });

    const stats = fs.statSync(filepath);
    console.log(`  Saved: ${filepath} (${stats.size} bytes)`);
    screenshots.push(filepath);
  }

  // Also dump bounding box info for verification
  fs.writeFileSync(
    path.join(outDir, 'element-info.json'),
    JSON.stringify({ box, clip, screenshots, timestamp: new Date().toISOString() }, null, 2)
  );

  await browser.close();
  console.log('Done!');
  console.log('Screenshots:');
  screenshots.forEach(s => console.log('  ' + s));
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});