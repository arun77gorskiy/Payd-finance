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
    // Use document.title
    const t1 = await send('Runtime.evaluate', {
      expression: 'document.title',
      returnByValue: true,
    });
    console.log('Title:', t1.result.value);
    
    // Use document.querySelector for h1 only - fast
    const t2 = await send('Runtime.evaluate', {
      expression: 'JSON.stringify(Array.from(document.querySelectorAll("h1")).map(e => e.innerText.slice(0, 200)))',
      returnByValue: true,
    });
    console.log('H1:', t2.result.value);
    
    // Use the main visible h2
    const t3 = await send('Runtime.evaluate', {
      expression: 'JSON.stringify(Array.from(document.querySelectorAll("h2")).map(e => e.innerText.slice(0, 200)))',
      returnByValue: true,
    });
    console.log('H2:', t3.result.value);
    
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
}, 15000);
