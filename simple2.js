const puppeteer = require('puppeteer-core');

console.log('Starting...');

(async () => {
  try {
    console.log('Connecting to browser via WebSocket...');
    const browser = await puppeteer.connect({
      browserWSEndpoint: 'ws://127.0.0.1:9222/devtools/page/9687537DB9ACA7E398E97C0775D8F2B3',
      defaultViewport: null,
      protocolTimeout: 60000
    });
    console.log('Connected!');

    // Get the title
    const pages = await browser.pages();
    console.log('Total pages:', pages.length);

    if (pages.length > 0) {
      const page = pages[0];
      console.log('Page URL:', page.url());

      // Get the title
      const title = await page.title();
      console.log('Title:', title);
    }

    await browser.disconnect();
    console.log('Done');
  } catch (e) {
    console.error('ERROR:', e.message);
  }
  process.exit(0);
})();
