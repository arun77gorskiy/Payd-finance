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
    // Search for "Layer 1" header content - faster query
    const headerResult = await send('Runtime.evaluate', {
      expression: `JSON.stringify(Array.from(document.querySelectorAll('*')).filter(el => el.children.length === 0 && el.innerText && el.innerText.includes('Layer 1')).map(el => ({tag: el.tagName, cls: el.className.toString().slice(0, 80), text: el.innerText.slice(0, 300)})).slice(0, 15))`,
      returnByValue: true,
    });
    console.log('=== Layer 1 elements ===');
    console.log(headerResult.result.value);
    
    // Also get text containing "projects"
    const projResult = await send('Runtime.evaluate', {
      expression: `JSON.stringify(Array.from(document.querySelectorAll('*')).filter(el => el.children.length === 0 && el.innerText && /projects/i.test(el.innerText)).map(el => ({tag: el.tagName, cls: el.className.toString().slice(0, 80), text: el.innerText.slice(0, 300)})).slice(0, 15))`,
      returnByValue: true,
    });
    console.log('\n=== Elements with "projects" ===');
    console.log(projResult.result.value);
    
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
