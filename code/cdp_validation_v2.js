// Try creating a new page/target to execute validation
const WebSocket = require('ws');
const http = require('http');
const { execSync } = require('child_process');

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
    // Try ALL page targets, including the JS_EXEC_TEST one
    const pages = await getPages();
    const targetPages = pages.filter(p => p.type === 'page' && p.url.includes('yq0wf1dpxk5v'));

    for (const target of targetPages) {
        console.log('\n=== Trying:', target.title, '===');
        try {
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
                    }, 30000);
                });
            }

            await new Promise((resolve, reject) => {
                ws.on('open', resolve);
                ws.on('error', reject);
                setTimeout(() => reject(new Error('WS open timeout')), 10000);
            });
            console.log('WS connected.');

            // Try Page.enable first (lighter weight)
            try {
                await send('Page.enable');
                console.log('Page.enable OK.');
            } catch (e) {
                console.log('Page.enable failed:', e.message);
            }

            // Now try Runtime.enable
            try {
                await send('Runtime.enable');
                console.log('Runtime.enable OK.');

                // Quick sanity test
                const test = await send('Runtime.evaluate', {
                    expression: '1+1',
                    returnByValue: true
                });
                console.log('Sanity test:', test.result && test.result.result && test.result.result.value);

                // Now run the actual validation
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
                            results.extra_checks.canonical_projects_type = typeof projectsMap;
                            results.extra_checks.canonical_projects_is_map = (projectsMap instanceof Map);
                            if (projectsMap instanceof Map) {
                                results.extra_checks.canonical_projects_size = projectsMap.size;
                            }

                            const projectsList = window.PAYD_INTEL && window.PAYD_INTEL.CANONICAL_LIST;
                            results.extra_checks.canonical_list_type = typeof projectsList;
                            if (Array.isArray(projectsList)) {
                                results.total_projects = projectsList.length;
                            }

                            const sectorIndex = window.PAYD_INTEL && window.PAYD_INTEL.SECTOR_INDEX;
                            if (sectorIndex && typeof sectorIndex === 'object') {
                                results.sector_count = Object.keys(sectorIndex).length;
                                results.sector_names = Object.keys(sectorIndex).sort();
                            }

                            if (Array.isArray(projectsList) && sectorIndex) {
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
                            }

                            if (projectsMap instanceof Map) {
                                const required = ['bittensor', 'akash', 'immutable', 'internet-computer', 'mina-protocol', 'polygon'];
                                required.forEach(id => {
                                    results.required_assets_exist[id] = projectsMap.has(id);
                                });
                                const disallowed = ['tao', 'immutable-x', 'icp', 'mina', 'akash-network', 'polygon-ecosystem-token'];
                                disallowed.forEach(id => {
                                    results.disallowed_assets_exist[id] = projectsMap.has(id);
                                });
                            }

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
                if (result.result && result.result.result && result.result.result.value) {
                    try {
                        const parsed = JSON.parse(result.result.result.value);
                        console.log(JSON.stringify(parsed, null, 2));
                    } catch(e) {
                        console.log(result.result.result.value);
                    }
                } else {
                    console.log(JSON.stringify(result, null, 2));
                }

                ws.close();
                return;
            } catch (e) {
                console.log('Runtime.enable failed:', e.message);
                ws.close();
            }
        } catch (e) {
            console.log('Connection error:', e.message);
        }
    }
}

main().catch(e => {
    console.error('Main error:', e);
    process.exit(1);
});
