/* Тест: проверяет что enriched данные корректно подставляются в V1 формат
   Мокаем fetch чтобы читать локальные файлы */
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'public', 'data');

global.fetch = async (url) => {
    const filename = url.replace(/^.*\//, '');
    const filepath = path.join(dataDir, filename);
    if (!fs.existsSync(filepath)) {
        return { ok: false, status: 404, json: async () => ({}) };
    }
    const content = fs.readFileSync(filepath, 'utf8');
    return { ok: true, status: 200, json: async () => JSON.parse(content) };
};

global.sessionStorage = {
    _data: {},
    getItem(k) { return this._data[k] || null; },
    setItem(k, v) { this._data[k] = v; },
    removeItem(k) { delete this._data[k]; },
};

global.window = global;

const dataJsPath = path.join(__dirname, '..', 'public', 'js', 'intelligence', 'intelligence-data.js');
const dataJsCode = fs.readFileSync(dataJsPath, 'utf8');
eval(dataJsCode);

console.log('=== ТЕСТ ИНТЕГРАЦИИ ENRICHED DATA В V1 ФОРМАТ ===\n');

window.PAYD_INTEL.load()
    .then(data => {
        const v1Projects = data.projects.projects;
        const total = Object.keys(v1Projects).length;
        console.log('V1 проектов: ' + total);

        let withPrice = 0, withMcap = 0, withTVL = 0, withPayd = 0, withStars = 0, withBullCase = 0;
        let withDescription = 0, withRank = 0, withChange = 0, withRisk = 0;

        for (const p of Object.values(v1Projects)) {
            if (p.price_usd) withPrice++;
            if (p.market_cap_usd) withMcap++;
            if (p.tvl_usd) withTVL++;
            if (p.payd_score != null) withPayd++;
            if (p.risk_score != null) withRisk++;
            if (p.github?.stars > 0) withStars++;
            if (p.bull_case?.length) withBullCase++;
            if (p.description && p.description.length > 20) withDescription++;
            if (p.market_cap_rank) withRank++;
            if (p.change_24h_pct != null) withChange++;
        }

        console.log('\n╔════════════════════════════════════════════════════╗');
        console.log('║  ЗАПОЛНЕННОСТЬ ДАННЫХ В V1 (UI-формате)            ║');
        console.log('╠════════════════════════════════════════════════════╣');
        console.log('║ Price:        ' + String(withPrice).padStart(3) + '/' + total + ' (' + Math.round(withPrice/total*100) + '%)      ║');
        console.log('║ Market Cap:   ' + String(withMcap).padStart(3) + '/' + total + ' (' + Math.round(withMcap/total*100) + '%)      ║');
        console.log('║ Rank:         ' + String(withRank).padStart(3) + '/' + total + ' (' + Math.round(withRank/total*100) + '%)      ║');
        console.log('║ 24h Change:   ' + String(withChange).padStart(3) + '/' + total + ' (' + Math.round(withChange/total*100) + '%)      ║');
        console.log('║ TVL:          ' + String(withTVL).padStart(3) + '/' + total + ' (' + Math.round(withTVL/total*100) + '%)      ║');
        console.log('║ Payd Score:   ' + String(withPayd).padStart(3) + '/' + total + ' (' + Math.round(withPayd/total*100) + '%)      ║');
        console.log('║ Risk Score:   ' + String(withRisk).padStart(3) + '/' + total + ' (' + Math.round(withRisk/total*100) + '%)      ║');
        console.log('║ GitHub Stars: ' + String(withStars).padStart(3) + '/' + total + ' (' + Math.round(withStars/total*100) + '%)      ║');
        console.log('║ Bull Case:    ' + String(withBullCase).padStart(3) + '/' + total + ' (' + Math.round(withBullCase/total*100) + '%)      ║');
        console.log('║ Description:  ' + String(withDescription).padStart(3) + '/' + total + ' (' + Math.round(withDescription/total*100) + '%)      ║');
        console.log('╚════════════════════════════════════════════════════╝');

        const top = Object.values(v1Projects)
            .filter(p => p.payd_score != null)
            .sort((a, b) => b.payd_score - a.payd_score)
            .slice(0, 5);

        console.log('\nТОП-5 ПО PAYD SCORE:\n');
        top.forEach((p, i) => {
            console.log((i+1) + '. ' + p.name + ' (' + p.ticker + ')');
            console.log('   Payd: ' + p.payd_score + ' | Risk: ' + p.risk_score + ' (' + p.risk_label + ')');
            console.log('   Rating: ' + p.investment_rating);
            console.log('   Price: $' + (p.price_usd?.toFixed(4) || 'N/A') + ' | MCap: $' +
                (p.market_cap_usd ? (p.market_cap_usd/1e9).toFixed(2) + 'B' : 'N/A') +
                ' | 24h: ' + (p.change_24h_pct?.toFixed(2) || 'N/A') + '%');
            console.log('   GitHub: ' + p.github.stars + '★, ' + p.github.commits_30d + ' commits/30d');
            console.log('   Opinion: ' + p.ai_opinion);
            console.log();
        });

        console.log('=== OVERVIEW ===\n');
        const overview = data.overview;
        console.log('Market Cap Total: $' + (overview.market_overview.total_market_cap_usd ?
            (overview.market_overview.total_market_cap_usd/1e9).toFixed(2) + 'B' : 'N/A'));
        console.log('TVL Total:        $' + (overview.market_overview.total_tvl_usd ?
            (overview.market_overview.total_tvl_usd/1e9).toFixed(2) + 'B' : 'N/A'));
        console.log('24h Avg Change:   ' + overview.market_overview.market_cap_change_24h + '%');
        console.log('Projects w/market:' + overview.market_overview.projects_with_market);
        console.log('Projects w/TVL:   ' + overview.market_overview.projects_with_tvl);
        console.log('Avg AI Score:     ' + overview.ai_score_average.global + ' (based on ' + overview.ai_score_average.based_on + ' projects)');
    })
    .catch(err => {
        console.error('FAILED:', err.message);
        process.exit(1);
    });
