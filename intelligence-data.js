/* =================================================================
   PAYD Finance — Intelligence Data Loader
   Читает предрассчитанные данные из JSON-файлов.
   Архитектурно: эти JSON-файлы являются "представлением" данных,
   которые серверный AI Agent пишет в локальные JSON-файлы по расписанию.
   Клиент НИКОГДА не вызывает LLM. Клиент НИКОГДА не анализирует.
   Данные хранятся полностью локально — никаких внешних сервисов.
   ================================================================= */

const DATA_BASE = '/data/intelligence/';

const INTEL_DATA = {
    overview:       null,
    depin:          null,
    aiInfra:        null,
    watchlist:      null,
    opportunities:  null,
    weeklyReports:  null,
    projects:       null,
};

const INTEL_LOAD_STATE = {
    loaded: false,
    error:  null,
};

/* === Cache layer (in-memory + sessionStorage) === */
function withCache(key, fetcher) {
    return new Promise((resolve, reject) => {
        try {
            const cached = sessionStorage.getItem('intel_' + key);
            if (cached) {
                resolve(JSON.parse(cached));
                return;
            }
        } catch (e) { /* sessionStorage unavailable */ }

        fetcher()
            .then(data => {
                try { sessionStorage.setItem('intel_' + key, JSON.stringify(data)); } catch (e) {}
                resolve(data);
            })
            .catch(reject);
    });
}

function fetchJSON(path) {
    return fetch(path, { cache: 'no-store' })
        .then(r => {
            if (!r.ok) throw new Error('Failed to load ' + path + ' (status ' + r.status + ')');
            return r.json();
        });
}

const loaders = {
    overview:       () => withCache('overview',       () => fetchJSON(DATA_BASE + 'overview.json')),
    depin:          () => withCache('depin',          () => fetchJSON(DATA_BASE + 'depin.json')),
    aiInfra:        () => withCache('ai-infra',       () => fetchJSON(DATA_BASE + 'ai-infra.json')),
    watchlist:      () => withCache('watchlist',      () => fetchJSON(DATA_BASE + 'watchlist.json')),
    opportunities:  () => withCache('opportunities',  () => fetchJSON(DATA_BASE + 'opportunities.json')),
    weeklyReports:  () => withCache('weekly-reports', () => fetchJSON(DATA_BASE + 'weekly-reports.json')),
    projects:       () => withCache('projects',       () => fetchJSON(DATA_BASE + 'projects.json')),
};

function loadAllIntelligenceData() {
    return Promise.all([
        loaders.overview().then(d => INTEL_DATA.overview = d),
        loaders.depin().then(d => INTEL_DATA.depin = d),
        loaders.aiInfra().then(d => INTEL_DATA.aiInfra = d),
        loaders.watchlist().then(d => INTEL_DATA.watchlist = d),
        loaders.opportunities().then(d => INTEL_DATA.opportunities = d),
        loaders.weeklyReports().then(d => INTEL_DATA.weeklyReports = d),
        loaders.projects().then(d => INTEL_DATA.projects = d),
    ])
    .then(() => {
        INTEL_LOAD_STATE.loaded = true;
        return INTEL_DATA;
    })
    .catch(err => {
        INTEL_LOAD_STATE.error = err;
        console.error('[Intelligence] Data load failed:', err);
        throw err;
    });
}

window.PAYD_INTEL = {
    data: INTEL_DATA,
    state: INTEL_LOAD_STATE,
    load: loadAllIntelligenceData,
};
