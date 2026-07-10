// Pixel-level comparison of the three frames
const { execSync } = require('child_process');
const fs = require('fs');

// Use ImageMagick or sharp to compare images
// Try sharp first
let hasSharp = false;
try {
  require.resolve('sharp');
  hasSharp = true;
} catch (e) {}

if (hasSharp) {
  const sharp = require('sharp');
  const dir = '/workspace/downloads/payd-screenshots';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();

  (async () => {
    for (const f of files) {
      const filepath = `${dir}/${f}`;
      const image = sharp(filepath);
      const stats = await image.stats();
      const meta = await image.metadata();
      console.log(`\n=== ${f} ===`);
      console.log(`Format: ${meta.format}, Channels: ${meta.channels}, Size: ${meta.width}x${meta.height}`);
      console.log(`Mean per channel:`);
      stats.channels.forEach((ch, i) => {
        console.log(`  Ch${i}: mean=${ch.mean.toFixed(2)}, std=${ch.stdev.toFixed(2)}, min=${ch.min}, max=${ch.max}`);
      });
    }
  })();
} else {
  // Fallback: use Node child process to run ImageMagick identify
  const dir = '/workspace/downloads/payd-screenshots';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).sort();
  console.log('Sharp not available, checking ImageMagick...');

  try {
    execSync('which identify', { stdio: 'pipe' });
    files.forEach(f => {
      const filepath = `${dir}/${f}`;
      const out = execSync(`identify -verbose "${filepath}" 2>/dev/null | head -40`).toString();
      console.log(`\n=== ${f} ===`);
      console.log(out.split('\n').filter(l => l.includes('mean') || l.includes('Geometry') || l.includes('Format:')).slice(0, 10).join('\n'));
    });
  } catch (e) {
    console.log('Neither sharp nor ImageMagick available');
  }
}