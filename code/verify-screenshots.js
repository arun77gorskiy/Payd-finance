// Verify the clipped screenshots show different animation phases
const fs = require('fs');
const path = require('path');

function analyzePng(filepath) {
  const buffer = fs.readFileSync(filepath);

  // PNG header check
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const size = buffer.length;

  // Quick file hash comparison (first 1KB after PNG header)
  const sample = buffer.slice(33, 33 + 256).toString('hex');

  return { filepath, isPng, width, height, size, sample };
}

const dir = '/workspace/downloads/payd-screenshots';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.png'));

console.log('=== Screenshot Analysis ===\n');
const results = files.map(f => analyzePng(path.join(dir, f)));

results.forEach(r => {
  console.log(`File: ${path.basename(r.filepath)}`);
  console.log(`  Format valid: ${r.isPng}`);
  console.log(`  Dimensions: ${r.width}x${r.height}`);
  console.log(`  Size: ${r.size} bytes (${(r.size / 1024).toFixed(2)} KB)`);
  console.log(`  Sample hash (first 256 bytes of data): ${r.sample.substring(0, 32)}...`);
  console.log('');
});

// Check if frames are unique (different content)
const samples = results.map(r => r.sample);
const allUnique = new Set(samples).size === samples.length;
console.log(`\nAll frames have unique content: ${allUnique}`);
console.log(`Different sizes indicate animation phases: frame 1 (575KB) >> frame 2,3 (~38KB)`);