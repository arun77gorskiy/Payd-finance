// Direct CDP client without puppeteer
const WebSocket = require('ws');

console.log('Starting...');

const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/9687537DB9ACA7E398E97C0775D8F2B3');

let msgId = 0;
const pending = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error('Timeout: ' + method));
      }
    }, 60000);
  });
}

ws.on('open', async () => {
  console.log('Connected to WebSocket');

  try {
    // Enable Runtime
    await send('Runtime.enable');
    console.log('Runtime enabled');

    // Wait a bit
    await new Promise(r => setTimeout(r, 1000));

    // Evaluate JS to get all H2 elements and body text
    const result = await send('Runtime.evaluate', {
      expression: `
        (function() {
          const h1s = Array.from(document.querySelectorAll('h1')).map(h => h.textContent.trim());
          const h2s = Array.from(document.querySelectorAll('h2')).map(h => h.textContent.trim());
          const h3s = Array.from(document.querySelectorAll('h3')).map(h => h.textContent.trim());
          const allHeaders = { h1: h1s, h2: h2s, h3: h3s };
          const bodyText = document.body ? document.body.innerText.substring(0, 3000) : '';
          return JSON.stringify({ allHeaders, bodyText, readyState: document.readyState, title: document.title, url: window.location.href });
        })()
      `,
      returnByValue: true
    });

    console.log('\n=== RESULT ===');
    if (result.result && result.result.result) {
      const data = JSON.parse(result.result.result.value);
      console.log('URL:', data.url);
      console.log('Title:', data.title);
      console.log('Ready State:', data.readyState);
      console.log('\nH1 Headers:', JSON.stringify(data.allHeaders.h1, null, 2));
      console.log('\nH2 Headers:', JSON.stringify(data.allHeaders.h2, null, 2));
      console.log('\nH3 Headers:', JSON.stringify(data.allHeaders.h3, null, 2));
      console.log('\n=== BODY TEXT (first 3000 chars) ===');
      console.log(data.bodyText);
    } else {
      console.log('Unexpected result:', JSON.stringify(result, null, 2));
    }
  } catch (e) {
    console.error('ERROR:', e.message);
  }
  ws.close();
  process.exit(0);
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  }
});

ws.on('error', (err) => {
  console.error('WS ERROR:', err.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log('WS closed');
});
