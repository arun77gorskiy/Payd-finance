const e = JSON.parse(require('fs').readFileSync('/workspace/public/data/projects_enriched.json', 'utf8'));
['bitcoin', 'ethereum', 'uniswap', 'aave', 'arbitrum', 'optimism', 'helium', 'render-token', 'akash-network', 'ondo-finance'].forEach(id => {
    const p = e.projects.find(p => p.id === id);
    console.log(id.padEnd(16), 'has_market:', !!p?.market, 'mc_value:', p?.market?.market_cap_usd);
});
