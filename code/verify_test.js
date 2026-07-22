/* Проверка качества обогащения */
const data = require('/workspace/public/data/projects_test_enriched.json');

console.log('СТАТИСТИКА ОБОГАЩЕНИЯ ТЕСТОВОГО НАБОРА:');
console.log('='.repeat(70));

let withMarket = 0, withProtocol = 0, withGithub = 0, withSocial = 0, withAI = 0;
let withFollowers = 0, withTVL = 0, withCommits = 0, withLanguages = 0;

for (const p of Object.values(data)) {
    if (p.market?.price_usd) withMarket++;
    if (p.protocol?.tvl_usd) withTVL++;
    if (p.protocol) withProtocol++;
    if (p.github?.stars) withGithub++;
    if (p.social?.twitter_handle) withSocial++;
    if (p.social?.twitter_followers) withFollowers++;
    if (p.ai?.payd_score != null) withAI++;
    if (p.github?.commits_30d != null) withCommits++;
    if (p.github?.languages?.length) withLanguages++;
}

const total = Object.keys(data).length;
console.log('Market data:    ' + withMarket + '/' + total);
console.log('GitHub data:    ' + withGithub + '/' + total);
console.log('GitHub langs:   ' + withLanguages + '/' + total);
console.log('GitHub commits: ' + withCommits + '/' + total);
console.log('Social:         ' + withSocial + '/' + total + ' (followers: ' + withFollowers + ')');
console.log('DefiLlama:      ' + withProtocol + '/' + total + ' (TVL: ' + withTVL + ')');
console.log('AI scores:      ' + withAI + '/' + total);
console.log();

console.log('ДЕТАЛИ ПО ПРОЕКТАМ:');
console.log('-'.repeat(70));
['uniswap', 'ethereum', 'maker', 'ondo-finance', 'story-protocol', 'akash'].forEach(id => {
    const p = data[id];
    if (!p) return;
    console.log('\n📊 ' + p.name);
    if (p.protocol) {
        console.log('  TVL:     $' + (p.protocol.tvl_usd ? (p.protocol.tvl_usd/1e6).toFixed(0) + 'M' : 'N/A'));
        console.log('  Category: ' + (p.protocol.category || 'N/A'));
        console.log('  Chains:   ' + (p.protocol.chains?.slice(0,4).join(', ') || 'N/A'));
        console.log('  Source:   ' + (p.protocol.slug || 'N/A'));
    } else {
        console.log('  DefiLlama: N/A');
    }
    if (p.github) {
        console.log('  GitHub:   ' + p.github.full_name + ' (' + p.github.stars.toLocaleString() + ' ★)');
        console.log('  Source:   ' + (p.github.source_repo || p.github.full_name));
    } else {
        console.log('  GitHub:   N/A');
    }
    if (p.ai) {
        console.log('  AI payd:  ' + p.ai.payd_score + ' | risk: ' + p.ai.risk_score + ' | conviction: ' + p.ai.conviction_score);
    }
});
