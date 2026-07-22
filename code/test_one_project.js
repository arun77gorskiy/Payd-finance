/* Quick test: enrich 1 project end-to-end */
const projects = require('/workspace/public/data/projects.json');
const p = projects.find(x => x.id === 'akash');

async function testGitHub(owner, repo) {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'PAYD-Test', 'Accept': 'application/vnd.github+json' } });
    console.log('Status:', r.status);
    if (!r.ok) {
        console.log('Body:', (await r.text()).slice(0, 200));
        return null;
    }
    const d = await r.json();
    return {
        full_name: d.full_name,
        stars: d.stargazers_count,
        forks: d.forks_count,
        watchers: d.subscribers_count,
        open_issues: d.open_issues_count,
        language: d.language,
        size_kb: d.size,
        pushed_at: d.pushed_at,
        created_at: d.created_at,
        default_branch: d.default_branch,
        topics: d.topics,
        archived: d.archived,
    };
}

async function testDefiLlama(slug) {
    const r = await fetch(`https://api.llama.fi/protocol/${slug}`);
    console.log('DefiLlama status:', r.status);
    if (!r.ok) return null;
    const d = await r.json();
    return {
        name: d.name,
        tvl: d.tvl,
        category: d.category,
        chains: (d.chains || []).slice(0, 5),
        mcapToTvl: d.mcapToTvl,
    };
}

async function main() {
    console.log(`Testing ${p.name} (${p.symbol})`);
    console.log('GitHub:', p.githubOrg, '/', p.githubRepo.split('/')[1]);

    // Wait 2s between API calls
    const gh = await testGitHub(p.githubOrg, p.githubRepo.split('/')[1]);
    console.log('GitHub data:', gh);

    await new Promise(r => setTimeout(r, 2000));

    // Try DefiLlama for DePIN/RWA/etc
    const defi = await testDefiLlama(p.id);
    console.log('DefiLlama data:', defi);
}

main().catch(console.error);
