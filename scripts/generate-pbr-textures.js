/**
 * Генератор синтетических PBR-текстур для Hero-логотипа.
 * Создаёт PNG-файлы с минимальным шумом, которые браузер может загрузить
 * как normalMap / roughnessMap / metalnessMap.
 *
 * Без зависимости от canvas — генерируем пиксели вручную.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT_DIR = path.resolve(__dirname, '../public/textures');
fs.mkdirSync(OUT_DIR, { recursive: true });

/* === Минимальный PNG-кодер (RGBA, без фильтра) ============================== */
function crc32(buf) {
    let c, table = [];
    for (let n = 0; n < 256; n++) {
        c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgbaData) {
    // Добавляем filter byte (0 = None) к каждой строке
    const rowBytes = width * 4;
    const raw = Buffer.alloc((rowBytes + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (rowBytes + 1)] = 0;
        rgbaData.copy(raw, y * (rowBytes + 1) + 1, y * rowBytes, (y + 1) * rowBytes);
    }
    const idat = zlib.deflateSync(raw);

    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // color type RGBA
    ihdr[10] = 0; // compression
    ihdr[11] = 0; // filter
    ihdr[12] = 0; // interlace

    return Buffer.concat([
        signature,
        chunk('IHDR', ihdr),
        chunk('IDAT', idat),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

/* === Генераторы текстур =================================================== */

function valueNoise2D(x, y, seed) {
    // Простой хэш-шум
    const h = Math.sin(x * 12.9898 + y * 78.233 + seed * 43.5453) * 43758.5453;
    return h - Math.floor(h);
}

function smoothNoise(x, y, seed) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const a = valueNoise2D(xi, yi, seed);
    const b = valueNoise2D(xi + 1, yi, seed);
    const c = valueNoise2D(xi, yi + 1, seed);
    const d = valueNoise2D(xi + 1, yi + 1, seed);
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

function fbm(x, y, seed) {
    let total = 0, amp = 0.5, freq = 1.0;
    for (let i = 0; i < 5; i++) {
        total += smoothNoise(x * freq, y * freq, seed + i) * amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    return total;
}

/* Chrome: тёмный, лёгкий шум → нормал-мап */
function makeChromeNormal(width, height) {
    const data = Buffer.alloc(width * height * 4);
    const strength = 1.5;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const fx = x / width * 8;
            const fy = y / height * 8;
            const dx = (fbm(fx + 0.01, fy, 1) - fbm(fx - 0.01, fy, 1)) * strength;
            const dy = (fbm(fx, fy + 0.01, 1) - fbm(fx, fy - 0.01, 1)) * strength;
            data[i + 0] = Math.max(0, Math.min(255, Math.floor((dx * 0.5 + 0.5) * 255)));
            data[i + 1] = Math.max(0, Math.min(255, Math.floor((dy * 0.5 + 0.5) * 255)));
            data[i + 2] = 255;
            data[i + 3] = 255;
        }
    }
    return encodePNG(width, height, data);
}

/* Chrome roughness: почти равномерно низкая, с лёгкой неоднородностью */
function makeChromeRoughness(width, height) {
    const data = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const fx = x / width * 4;
            const fy = y / height * 4;
            const n = fbm(fx, fy, 7);
            // 18-30% roughness
            const v = Math.floor(0.18 * 255 + n * 30);
            data[i + 0] = v;
            data[i + 1] = v;
            data[i + 2] = v;
            data[i + 3] = 255;
        }
    }
    return encodePNG(width, height, data);
}

/* Gold normal: более выраженные микро-царапины */
function makeGoldNormal(width, height) {
    const data = Buffer.alloc(width * height * 4);
    const strength = 2.5;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const fx = x / width * 16;
            const fy = y / height * 16;
            // Anisotropic noise — горизонтальные штрихи (как полированное золото)
            const dx = (fbm(fx + 0.05, fy, 3) - fbm(fx - 0.05, fy, 3)) * strength;
            const dy = (fbm(fx, fy + 0.05, 3) - fbm(fx, fy - 0.05, 3)) * strength;
            data[i + 0] = Math.max(0, Math.min(255, Math.floor((dx * 0.5 + 0.5) * 255)));
            data[i + 1] = Math.max(0, Math.min(255, Math.floor((dy * 0.5 + 0.5) * 255)));
            data[i + 2] = 255;
            data[i + 3] = 255;
        }
    }
    return encodePNG(width, height, data);
}

/* Gold metallic: почти 100% металл */
function makeGoldMetallic(width, height) {
    const data = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const v = 240 + Math.floor(Math.random() * 15);
            data[i + 0] = v;
            data[i + 1] = v;
            data[i + 2] = v;
            data[i + 3] = 255;
        }
    }
    return encodePNG(width, height, data);
}

/* Gun Metal normal: средний шум */
function makeGunMetalNormal(width, height) {
    const data = Buffer.alloc(width * height * 4);
    const strength = 1.0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const fx = x / width * 12;
            const fy = y / height * 12;
            const dx = (fbm(fx + 0.01, fy, 11) - fbm(fx - 0.01, fy, 11)) * strength;
            const dy = (fbm(fx, fy + 0.01, 11) - fbm(fx, fy - 0.01, 11)) * strength;
            data[i + 0] = Math.max(0, Math.min(255, Math.floor((dx * 0.5 + 0.5) * 255)));
            data[i + 1] = Math.max(0, Math.min(255, Math.floor((dy * 0.5 + 0.5) * 255)));
            data[i + 2] = 255;
            data[i + 3] = 255;
        }
    }
    return encodePNG(width, height, data);
}

/* === MAIN ================================================================ */

const W = 512, H = 512;
const targets = [
    { name: 'chrome_normal.png',     fn: makeChromeNormal },
    { name: 'chrome_roughness.png',  fn: makeChromeRoughness },
    { name: 'gold_normal.png',       fn: makeGoldNormal },
    { name: 'gold_metallic.png',     fn: makeGoldMetallic },
    { name: 'gunmetal_normal.png',   fn: makeGunMetalNormal }
];

targets.forEach((t) => {
    const buf = t.fn(W, H);
    const out = path.join(OUT_DIR, t.name);
    fs.writeFileSync(out, buf);
    console.log(`[TEX] ${t.name} (${W}x${H}, ${(buf.length / 1024).toFixed(1)} KB)`);
});

console.log('[TEX] Done.');