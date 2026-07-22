/* Диагностический тест: проверить GitHub и CoinGecko */
async function test() {
  console.log('--- 1. GitHub ondo-finance ---');
  let r = await fetch('https://api.github.com/repos/ondofinance/ondo-protocol', {
    headers: { 'User-Agent': 'PAYD-Test' }
  });
  console.log('  Status:', r.status);
  if (r.status === 200) {
    const d = await r.json();
    console.log('  Stars:', d.stargazers_count, 'Pushed:', d.pushed_at);
  } else {
    console.log('  Body:', (await r.text()).slice(0, 200));
  }

  await new Promise(rr => setTimeout(rr, 1500));

  console.log('\n--- 2. GitHub story-protocol variants ---');
  for (const repo of ['storyprotocol/typescript-sdk', 'storyprotocol/story', 'storyprotocol/protocol-core']) {
    r = await fetch(`https://api.github.com/repos/${repo}`, { headers: { 'User-Agent': 'PAYD-Test' } });
    const d = await r.json();
    console.log(`  ${repo}: ${r.status} ${r.status === 200 ? 'stars=' + d.stargazers_count : d.message}`);
    await new Promise(rr => setTimeout(rr, 1500));
  }

  console.log('\n--- 3. CoinGecko community_data для uniswap ---');
  r = await fetch('https://api.coingecko.com/api/v3/coins/uniswap?localization=false&tickers=false&market_data=false&community_data=true&developer_data=false');
  const d = await r.json();
  console.log('  twitter_followers:', d.community_data?.twitter_followers);
  console.log('  reddit_subscribers:', d.community_data?.reddit_subscribers);
  console.log('  telegram_channel_user_count:', d.community_data?.telegram_channel_user_count);
  console.log('  twitter_screen_name:', d.links?.twitter_screen_name);

  console.log('\n--- 4. DefiLlama slugs для топ-проектов ---');
  r = await fetch('https://api.llama.fi/protocols');
  const protocols = await r.json();
  const names = ['Uniswap', 'Ethereum', 'Maker', 'Ondo', 'Lido', 'Aave'];
  for (const n of names) {
    const found = protocols.filter(p => p.name && p.name.toLowerCase().includes(n.toLowerCase())).slice(0, 2);
    found.forEach(p => console.log(`  ${n} -> ${p.slug} (${p.name})`));
  }
}

test().catch(console.error);
