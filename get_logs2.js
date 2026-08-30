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
    // Get full logs dump
    const result = await send('Runtime.evaluate', {
      expression: 'JSON.stringify(window.__labLogs || [])',
      returnByValue: true,
    });
    const logs = JSON.parse(result.result.value);
    console.log('=== Total logs:', logs.length, '===');
    
    // Search for specific patterns the user asked about
    const checks = {
      'loaders.projects STARTED': logs.filter(l => l.msg.includes('loaders.projects() STARTED')),
      'loaders.projects THEN': logs.filter(l => l.msg.includes('loaders.projects() THEN')),
      'renderIfReady called': logs.filter(l => l.msg.includes('renderIfReady called')),
      '✓ Rendering': logs.filter(l => l.msg.includes('✓ Rendering')),
      'SYNCHRONOUS': logs.filter(l => l.msg.includes('SYNCHRONOUS')),
      'data-ready': logs.filter(l => l.msg.includes('data-ready')),
      'preloader-ready': logs.filter(l => l.msg.includes('preloader-ready')),
      'data already available': logs.filter(l => l.msg.includes('data already available')),
      'V2 data loaded': logs.filter(l => l.msg.includes('V2 data loaded')),
      'Initial': logs.filter(l => l.msg.includes('Initial')),
    };
    
    for (const [k, v] of Object.entries(checks)) {
      console.log(`\n=== ${k}: ${v.length} match(es) ===`);
      v.forEach((l, i) => console.log(`  [${i}] ${l.msg}`));
    }
    
    // Search for "Layer 1" header content
    const headerResult = await send('Runtime.evaluate', {
      expression: `(() => {
        const out = [];
        document.querySelectorAll('*').forEach(el => {
          if (el.children.length === 0 && el.innerText && el.innerText.includes('Layer 1')) {
            out.push({tag: el.tagName, cls: el.className, text: el.innerText.slice(0, 300)});
          }
        });
        return JSON.stringify(out);
      })()`,
      returnByValue: true,
    });
    console.log('\n=== Layer 1 elements ===');
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
