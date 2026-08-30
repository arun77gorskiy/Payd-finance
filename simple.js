const puppeteer = require('puppeteer-core');

console.log('Starting...');

(async () => {
  try {
    console.log('Connecting to browser...');
    const browser = await puppeteer.connect({
      browserURL: 'http://127.0.0.1:9222',
      defaultViewport: null,
      protocolTimeout: 60000
    });
    console.log('Connected!');

    const pages = await browser.pages();
    console.log('Total pages:', pages.length);

    const page = pages.find(p => p.url().includes('083kkiha0nsd'));
    if (!page) {
      console.log('Page not found');
      process.exit(1);
    }
    console.log('Found page:', page.url());

    // Get the title first
    const title = await page.title();
    console.log('Title:', title);

    // Get the URL
    const url = page.url();
    console.log('URL:', url);

    await browser.disconnect();
    console.log('Done');
  } catch (e) {
    console.error('ERROR:', e.message);
  }
  process.exit(0);
})();
