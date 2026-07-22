/* Поиск правильных GitHub репо для ondo-finance и проверка DefiLlama для akash */
async function test() {
    console.log('--- Поиск ondo-finance GitHub ---');
    const candidates = [
        'ondofinance/ondo-protocol-contracts',
        'Ondo-Finance/ondo-global-markets',
        'Ondo-Finance/ondo',
        'Ondo-Finance/global-markets',
        'ondo-finance/ondo-protocol',
        'Ondo-Finance/ondo-protocol',
        'Ondo-Finance/global-markets-contracts',
        'Ondo-Finance/contracts',
    ];
    for (const repo of candidates) {
        const r = await fetch(`https://api.github.com/repos/${repo}`, { headers: { 'User-Agent': 'PAYD-Test' } });
        const d = await r.json();
        console.log(`  ${repo}: ${r.status} ${r.status === 200 ? 'stars=' + d.stargazers_count : d.message?.slice(0, 50)}`);
        await new Promise(rr => setTimeout(rr, 1500));
    }

    console.log('\n--- DefiLlama поиск akash ---');
    const r = await fetch('https://api.llama.fi/protocols');
    const protocols = await r.json();
    const akashMatches = protocols.filter(p => p.name && p.name.toLowerCase().includes('akash'));
    akashMatches.forEach(p => console.log(`  ${p.slug} (${p.name}) - TVL: $${(p.tvl/1e6).toFixed(1)}M`));

    console.log('\n--- Поиск ondo в DefiLlama ---');
    const ondoMatches = protocols.filter(p => p.name && p.name.toLowerCase().includes('ondo'));
    ondoMatches.forEach(p => console.log(`  ${p.slug} (${p.name}) - TVL: $${(p.tvl/1e6).toFixed(1)}M`));
}
test().catch(console.error);
