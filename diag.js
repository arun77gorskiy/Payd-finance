const https = require('https');
const fs = require('fs');

const BASE = 'https://w3qbpaugijs2.space.minimax.io';

const PATHS = [
    '/js/intelligence/config/data-provider.config.js',
    '/js/intelligence/data/IDataProvider.js',
    '/js/intelligence/data/IMarketDataProvider.js',
    '/js/intelligence/data/providers/LocalJsonDataProvider.js',
    '/js/intelligence/data/providers/ApiDataProvider.js',
    '/js/intelligence/data/providers/DatabaseProvider.js',
    '/js/intelligence/data/DataProviderFactory.js',
];

function fetch(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'Node-Diag' } }, (res) => {
            let body = '';
            res.on('data', (c) => body += c);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        }).on('error', reject);
    });
}

(async () => {
    console.log('=== A. СРАВНЕНИЕ КОНТЕНТА: deployed vs local ===');
    const dbpDeployed = await fetch(BASE + '/js/intelligence/data/providers/DatabaseProvider.js');
    const dbpLocal = fs.readFileSync('/workspace/public/js/intelligence/data/providers/DatabaseProvider.js', 'utf-8');
    if (dbpDeployed.body === dbpLocal) {
        console.log('IDENTICAL');
    } else {
        console.log('DIFFER');
        console.log('Deployed len:', dbpDeployed.body.length, 'Local len:', dbpLocal.length);
    }

    console.log('\n=== B. ТЕСТ: выполнение DatabaseProvider.js в Node ===');
    const fakeWindow = { PAYD_INTEL: {} };
    eval(`class IDataProvider { constructor() { this.name = 'IDataProvider'; } } fakeWindow.PAYD_INTEL.IDataProvider = IDataProvider;`);
    try {
        const fn = new Function('window', dbpLocal);
        fn(fakeWindow);
        console.log('OK - DatabaseProvider IIFE executed');
        console.log('  PAYD_INTEL keys:', Object.keys(fakeWindow.PAYD_INTEL));
        console.log('  DatabaseProvider:', typeof fakeWindow.PAYD_INTEL.DatabaseProvider);
    } catch (e) {
        console.log('FAILED:', e.message);
        console.log('  Stack:', e.stack);
    }

    console.log('\n=== C. HTTP-доступность 7 ключевых скриптов ===');
    for (const path of PATHS) {
        try {
            const r = await fetch(BASE + path);
            const size = r.body ? r.body.length : 0;
            console.log(`  ${r.status}  (${size}b)  ${path}`);
        } catch (e) {
            console.log(`  ERR  ${path}  ${e.message}`);
        }
    }

    console.log('\n=== D. Проверка заголовков CORS на DatabaseProvider.js ===');
    console.log('  Access-Control-Allow-Origin:', dbpDeployed.headers['access-control-allow-origin']);
    console.log('  Content-Type:', dbpDeployed.headers['content-type']);
    console.log('  Content-Length:', dbpDeployed.headers['content-length']);
})();
