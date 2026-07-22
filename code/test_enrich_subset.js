/* Test enrichment with first 10 projects */
const fs = require('fs');
const path = require('path');

const DATA_DIR = '/workspace/public/data';
const TEST_OUTPUT = path.join(DATA_DIR, 'projects_enriched_test.json');

// Load first 10 projects with coingeckoId
const projects = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'projects.json'), 'utf8'));
const testProjects = projects.filter(p => p.coingeckoId).slice(0, 10);

console.log(`Testing enrichment with ${testProjects.length} projects:`);
testProjects.forEach(p => console.log(`  - ${p.name} (${p.symbol}, cg=${p.coingeckoId})`));

// Save subset
fs.writeFileSync(path.join(DATA_DIR, 'projects_test.json'), JSON.stringify(testProjects, null, 2));
console.log(`\nWrote test subset to projects_test.json`);
