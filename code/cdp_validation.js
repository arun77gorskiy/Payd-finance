// Direct CDP validation script for window.PAYD_INTEL
const WebSocket = require('ws');
const http = require('http');

function getPages() {
    return new Promise((resolve, reject) => {
        http.get('http://127.0.0.1:9222/json', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        }).on('error', reject);
    });
}

async function main() {
    const pages = await getPages();
    const target = pages.find(p => p.type === 'page' && p.url.includes('yq0wf1dpxk5v') && p.title.includes('Payd_Finance')) ||
                   pages.find(p => p.type === 'page' && p.url.includes('yq0wf1dpxk5v'));
    if (!target) {
        console.error('No matching page found.');
        process.exit(1);
    }
    console.log('Targeting:', target.title);
    console.log('WS:', target.webSocketDebuggerUrl);

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let msgId = 0;
    const pending = new Map();

    function send(method, params = {}) {
        return new Promise((resolve, reject) => {
            const id = ++msgId;
            pending.set(id, { resolve, reject });
            ws.send(JSON.stringify({ id, method, params }));
            setTimeout(() => {
                if (pending.has(id)) {
                    pending.delete(id);
                    reject(new Error('Timeout: ' + method));
                }
            }, 120000);
        });
    }

    ws.on('open', async () => {
        try {
            await send('Runtime.enable');
            console.log('Runtime enabled.');

            const expression = `
                (function() {
                    const results = {
                        canonical_runtime_exists: false,
                        total_projects: 0,
                        multi_sector_count: 0,
                        sector_count: 0,
                        cross_sector_mismatches: 0,
                        sector_names: [],
                        sample_multisector_assets: {},
                        required_assets_exist: {},
                        disallowed_assets_exist: {},
                        console_errors: [],
                        extra_checks: {}
                    };
                    try {
                        results.canonical_runtime_exists = !!(window.PAYD_INTEL && window.PAYD_INTEL.Canonical && typeof window.PAYD_INTEL.Canonical.build === 'function');
                        const projectsMap = window.PAYD_INTEL && window.PAYD_INTEL.CANONICAL_PROJECTS;
                        if (!(projectsMap instanceof Map)) {
                            throw new Error('CANONICAL_PROJECTS is not a Map: ' + typeof projectsMap);
                        }
                        results.extra_checks.canonical_projects_is_map = true;
                        results.extra_checks.canonical_projects_size = projectsMap.size;

                        const projectsList = window.PAYD_INTEL && window.PAYD_INTEL.CANONICAL_LIST;
                        if (!Array.isArray(projectsList)) {
                            throw new Error('CANONICAL_LIST is not an Array: ' + typeof projectsList);
                        }
                        results.total_projects = projectsList.length;

                        const sectorIndex = window.PAYD_INTEL && window.PAYD_INTEL.SECTOR_INDEX;
                        if (!sectorIndex) throw new Error('SECTOR_INDEX does not exist.');
                        results.sector_count = Object.keys(sectorIndex).length;
                        results.sector_names = Object.keys(sectorIndex).sort();

                        const multiSectorAssets = projectsList.filter(p => p && p.sectors && p.sectors.length > 1);
                        results.multi_sector_count = multiSectorAssets.length;
                        let mismatches = 0;
                        let mismatchDetails = [];
                        multiSectorAssets.forEach(asset => {
                            const firstSector = asset.sectors[0];
                            const firstRef = sectorIndex[firstSector] && sectorIndex[firstSector].find(p => p.id === asset.id);
                            if (!firstRef) return;
                            for (let i = 1; i < asset.sectors.length; i++) {
                                const otherSector = asset.sectors[i];
                                const otherRef = sectorIndex[otherSector] && sectorIndex[otherSector].find(p => p.id === asset.id);
                                if (firstRef !== otherRef) {
                                    mismatches++;
                                    if (mismatchDetails.length < 5) {
                                        mismatchDetails.push({id: asset.id, sectors: asset.sectors});
                                    }
                                }
                            }
                        });
                        results.cross_sector_mismatches = mismatches;
                        results.extra_checks.mismatch_details_sample = mismatchDetails;

                        multiSectorAssets.slice(0, 5).forEach(asset => {
                            results.sample_multisector_assets[asset.id] = asset.sectors;
                        });

                        const required = ['bittensor', 'akash', 'immutable', 'internet-computer', 'mina-protocol', 'polygon'];
                        required.forEach(id => {
                            results.required_assets_exist[id] = projectsMap.has(id);
                        });

                        const disallowed = ['tao', 'immutable-x', 'icp', 'mina', 'akash-network', 'polygon-ecosystem-token'];
                        disallowed.forEach(id => {
                            results.disallowed_assets_exist[id] = projectsMap.has(id);
                        });

                        return JSON.stringify(results, null, 2);
                    } catch (e) {
                        return JSON.stringify({ error: e.message, stack: e.stack, partial_results: results }, null, 2);
                    }
                })()
            `;

            const result = await send('Runtime.evaluate', {
                expression: expression,
                returnByValue: true,
                awaitPromise: false
            });

            console.log('\n=== VALIDATION RESULT ===');
            if (result.result && result.result.result) {
                const value = result.result.result.value;
                if (value) {
                    try {
                        const parsed = JSON.parse(value);
                        console.log(JSON.stringify(parsed, null, 2));
                    } catch(e) {
                        console.log(value);
                    }
                }
            } else {
                console.log(JSON.stringify(result, null, 2));
            }

            const errorsResult = await send('Runtime.evaluate', {
                expression: 'JSON.stringify({ url: window.location.href, readyState: document.readyState, title: document.title, hasPAYD: !!window.PAYD_INTEL, hasCanonical: !!(window.PAYD_INTEL && window.PAYD_INTEL.Canonical) })',
                returnByValue: true
            });
            console.log('\n=== PAGE INFO ===');
            if (errorsResult.result && errorsResult.result.result && errorsResult.result.result.value) {
                console.log(errorsResult.result.result.value);
            }

            ws.close();
        } catch (e) {
            console.error('Error:', e);
            ws.close();
            process.exit(1);
        }
    });

    ws.on('error', (err) => {
        console.error('WS error:', err.message);
        process.exit(1);
    });
}

main().catch(e => {
    console.error('Main error:', e);
    process.exit(1);
});
