const data = require('/workspace/public/data/projects.json');
const projects = Array.isArray(data) ? data : (data.projects || []);

const withVerified = projects.filter(p => p.verified_status === 'verified');
const withoutVerified = projects.filter(p => p.verified_status !== 'verified');
const missingField = projects.filter(p => p.verified_status === undefined);

console.log('Total projects:', projects.length);
console.log('With verified_status=verified:', withVerified.length);
console.log('Without verified_status=verified:', withoutVerified.length);
console.log('Missing verified_status field:', missingField.length);

console.log('\nSample project keys:', Object.keys(projects[0] || {}));
console.log('Sample project.verified_status:', projects[0] && projects[0].verified_status);
console.log('Sample project.coingecko_id:', projects[0] && projects[0].coingecko_id);

let wouldRender = 0;
const thirtyDays = 30 * 24 * 60 * 60 * 1000;
const now = Date.now();
for (const p of projects) {
    const status = p.verified_status || (p.metadata && p.metadata.verified_status);
    if (status !== 'verified') continue;
    const cgId = p.coingecko_id || (p.metadata && p.metadata.coingecko_id);
    const cmcId = p.cmc_id || (p.metadata && p.metadata.cmc_id);
    if (!cgId && !cmcId) continue;
    if (p.last_verified_at) {
        const lv = new Date(p.last_verified_at).getTime();
        if (!isNaN(lv) && (now - lv) > thirtyDays) continue;
    }
    wouldRender++;
}
console.log('\nWould pass isProjectVerified():', wouldRender, '/', projects.length);
