const p = require('/workspace/public/data/projects.json');
// Check first 30 projects for githubRepo format
console.log('Sample projects:');
p.slice(0, 30).forEach(x => {
    console.log(`  ${x.id.padEnd(25)} org=${x.githubOrg || '-'} repo=${x.githubRepo || '-'}`);
});
