/* Quick test of enrichment API calls */
const fs = require('fs');
const path = require('path');

const projects = JSON.parse(fs.readFileSync('/workspace/public/data/projects_test.json', 'utf8'));
const coinIds = projects.map(p => p.coingeckoId);
console.log('Testing CoinGecko /coins/markets with', coinIds.length, 'coins...');

const lastCall = { coingecko: 0 };
async function rateLimit(name, ms) {
    const wait = ms - (Date.now() - lastCall[name]);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastCall[name] = Date.now();
}

async function testCoinGecko() {
    await rateLimit('coingecko', 3000);
    const url = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coinIds.join(',')}&per_page=250&page=1&sparkline=false&price_change_percentage=1h,24h,7d,30d`;
    const r = await fetch(url, { headers: { 'User-Agent': 'PAYD-Test/1.0' } });
    console.log('Status:', r.status);
    if (!r.ok) {
        const text = await r.text();
        console.log('Body:', text.slice(0, 500));
        return;
    }
    const data = await r.json();
    console.log('Got', data.length, 'coins');
    data.forEach(c => {
        console.log(`  ${c.symbol.padEnd(8)} price=$${c.current_price} mc=$${Math.round(c.market_cap / 1e6)}M rank=${c.market_cap_rank}`);
    });
}

testCoinGecko().catch(console.error);
