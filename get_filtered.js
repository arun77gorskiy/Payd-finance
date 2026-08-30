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
    // First test: get full logs
    const result = await send('Runtime.evaluate', {
      expression: 'JSON.stringify((window.__labLogs || []).filter(l => /loaders.projects|renderIfReady|Rendering|SYNCHRONOUS|data-ready|preloader-ready|already available|V2 data|Initial/.test(l.msg)))',
      returnByValue: true,
    });
    console.log(result.result.value);
    
    ws.close();
    process.exit(0);
  } catch (err) {
    console.error('ERROR:', err.message);
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
}, 10000);
