const https = require('https');
const { URL } = require('url');

const BASE = 'https://w3qbpaugijs2.space.minimax.io';
const DBPROVIDER_URL = BASE + '/js/intelligence/data/providers/DatabaseProvider.js';

function request(reqUrl, method = 'GET', headers = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(reqUrl);
        const opts = {
            hostname: urlObj.hostname,
            path: urlObj.pathname,
            method,
            headers,
        };
        const req = https.request(opts, (res) => {
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', reject);
        req.end();
    });
}

(async () => {
    console.log('=== 1. CORS PREFLIGHT (OPTIONS) ===');
    try {
        const r = await request(DBPROVIDER_URL, 'OPTIONS', {
            'Origin': 'https://w3qbpaugijs2.space.minimax.io',
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': '',
        });
        console.log('  Status:', r.status);
        console.log('  Access-Control-Allow-Origin:', r.headers['access-control-allow-origin']);
        console.log('  Access-Control-Allow-Methods:', r.headers['access-control-allow-methods']);
        console.log('  Access-Control-Allow-Headers:', r.headers['access-control-allow-headers']);
    } catch (e) {
        console.log('  ERR:', e.message);
    }

    console.log('\n=== 2. GET with Origin header (CORS) ===');
    try {
        const r = await request(DBPROVIDER_URL, 'GET', {
            'Origin': 'https://w3qbpaugijs2.space.minimax.io',
        });
        console.log('  Status:', r.status);
        console.log('  Access-Control-Allow-Origin:', r.headers['access-control-allow-origin']);
        console.log('  Content-Length:', r.headers['content-length']);
    } catch (e) {
        console.log('  ERR:', e.message);
    }

    console.log('\n=== 3. GET без Origin (no CORS) ===');
    try {
        const r = await request(DBPROVIDER_URL, 'GET');
        console.log('  Status:', r.status);
        console.log('  Content-Length:', r.headers['content-length']);
    } catch (e) {
        console.log('  ERR:', e.message);
    }

    console.log('\n=== 4. Проверка первого байта тела ответа (на BOM или мусор) ===');
    try {
        const r = await request(DBPROVIDER_URL, 'GET', { 'Origin': 'https://w3qbpaugijs2.space.minimax.io' });
        const firstBytes = r.body.slice(0, 30);
        const hex = Buffer.from(firstBytes).toString('hex');
        console.log('  First 30 chars:', JSON.stringify(firstBytes));
        console.log('  Hex:', hex);
        // BOM = EF BB BF
        if (hex.startsWith('efbbbf')) {
            console.log('  !!! ОБНАРУЖЕН UTF-8 BOM !!!');
        } else {
            console.log('  BOM отсутствует');
        }
    } catch (e) {
        console.log('  ERR:', e.message);
    }

    console.log('\n=== 5. Сравнение с ApiDataProvider.js (предыдущий файл) ===');
    try {
        const r = await request(BASE + '/js/intelligence/data/providers/ApiDataProvider.js', 'GET', {
            'Origin': 'https://w3qbpaugijs2.space.minimax.io',
        });
        const firstBytes = r.body.slice(0, 30);
        const hex = Buffer.from(firstBytes).toString('hex');
        console.log('  First 30 chars:', JSON.stringify(firstBytes));
        console.log('  Hex:', hex);
        if (hex.startsWith('efbbbf')) {
            console.log('  !!! ApiDataProvider.js тоже имеет BOM !!!');
        }
    } catch (e) {
        console.log('  ERR:', e.message);
    }
})();
