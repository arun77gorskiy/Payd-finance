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
    // Use TreeWalker-like approach with textContent matching on smaller set
    const headerResult = await send('Runtime.evaluate', {
      expression: `(function(){
        // Find h1/h2/h3/header
        const candidates = document.querySelectorAll('h1, h2, h3, h4, header, [class*="title"], [class*="header"], [class*="layer"]');
        const out = [];
        for (const el of candidates) {
          const t = (el.innerText || '').trim();
          if (t && t.length < 500) out.push({tag: el.tagName, cls: (el.className || '').toString().slice(0, 100), text: t});
        }
        return JSON.stringify(out.slice(0, 30));
      })()`,
      returnByValue: true,
    });
    console.log('=== Header candidates ===');
    console.log(headerResult.result.value);
    
    ws.close();
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err);
    ws.close();
    process.exit(1);
  }
});

ws.on('error', (e) => {
  console.error('WS error:', e.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('TIMEOUT');
  process.exit(1);
}, 20000);
