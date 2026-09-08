// Try Page.captureScreenshot only
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');

function getPages() {
    return new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9222/json', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function main() {
    const pages = await getPages();
    const target = pages.find(p => p.type === 'page' && p.url.includes('yq0wf1dpxk5v') && p.title.includes('Payd_Finance')) ||
                   pages.find(p => p.type === 'page' && p.url.includes('yq0wf1dpxk5v'));
    console.log('Targeting:', target.title);

    const ws = new WebSocket(target.webSocketDebuggerUrl);
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
            }, 30000);
        });
    }

    await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('WS open timeout')), 10000);
    });
    console.log('WS connected.');

    // Try Page domain only
    try {
        await send('Page.enable');
        console.log('Page.enable OK.');
    } catch (e) {
        console.log('Page.enable failed:', e.message);
        // try without enable - some CDP methods don't need it
    }

    // Try captureScreenshot
    try {
        const result = await send('Page.captureScreenshot', { format: 'png' });
        if (result.result && result.result.data) {
            const buffer = Buffer.from(result.result.data, 'base64');
            fs.writeFileSync('/workspace/tmp/page_screenshot.png', buffer);
            console.log('Screenshot saved:', buffer.length, 'bytes');
        } else {
            console.log('No screenshot data:', JSON.stringify(result).substring(0, 200));
        }
    } catch (e) {
        console.log('Screenshot failed:', e.message);
    }

    ws.close();
}

main().catch(e => {
    console.error('Main error:', e);
    process.exit(1);
});
