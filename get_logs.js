const WebSocket = require('/tmp/.npm-global/lib/node_modules/ws');

const WS_URL = 'ws://127.0.0.1:9222/devtools/page/9687537DB9ACA7E398E97C0775D8F2B3';
const ws = new WebSocket(WS_URL);

let id = 1;
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const myId = id++;
    const handler = (data) => {
      const msg = JSON.parse(data);
      if (msg.id === myId) {
        ws.off('message', handler);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
}

ws.on('open', async () => {
  try {
    // Wait for the page to be ready first
    await new Promise(r => setTimeout(r, 8000));
    
    // Evaluate window.__labLogs
    const result = await send('Runtime.evaluate', {
      expression: 'JSON.stringify(window.__labLogs || [])',
      returnByValue: true,
    });
    const logs = JSON.parse(result.result.value);
    console.log('=== Total logs:', logs.length, '===');
    
    // Filter only logs that match the requested patterns
    const patterns = [
      'loaders.projects',
      'V2 data loaded',
      'renderIfReady',
      'Rendering',
      'Initial',
      'SYNCHRONOUS',
      'data-ready',
      'preloader-ready',
      'data already available',
    ];
    
    const filtered = logs.filter(l => patterns.some(p => l.msg.includes(p)));
    console.log('=== Filtered logs:', filtered.length, '===');
    filtered.forEach((l, i) => {
      console.log(`[${i}] [${l.level}] ${l.msg}`);
    });
    
    // Also get the page text to see "Layer 1 · N projects"
    const textResult = await send('Runtime.evaluate', {
      expression: 'document.body.innerText',
      returnByValue: true,
    });
    const text = textResult.result.value;
    console.log('=== Page text excerpt ===');
    const lines = text.split('\n');
    const layer1Lines = lines.filter(l => l.toLowerCase().includes('layer 1') || l.toLowerCase().includes('layer1') || l.toLowerCase().includes('project'));
    layer1Lines.forEach(l => console.log('  >>', l));
    
    // Get the title / h1 with layer info
    const h1Result = await send('Runtime.evaluate', {
      expression: `JSON.stringify(Array.from(document.querySelectorAll('h1, h2, h3, .layer-header, [class*="layer"]')).slice(0, 20).map(el => ({tag: el.tagName, cls: el.className, text: el.innerText && el.innerText.slice(0, 200)})))`,
      returnByValue: true,
    });
    console.log('=== Headers/elements ===');
    console.log(h1Result.result.value);
    
    ws.close();
  } catch (err) {
    console.error('ERROR:', err);
    ws.close();
  }
});

ws.on('error', (e) => {
  console.error('WS error:', e.message);
});

setTimeout(() => {
  console.error('TIMEOUT');
  process.exit(1);
}, 30000);
