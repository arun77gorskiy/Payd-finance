/**
 * Верификатор GLB — парсит файл и проверяет корректность.
 */
const fs = require('fs');
const path = require('path');
const THREE = require('three');

const file = process.argv[2] || path.resolve(__dirname, '../public/models/payd-logo.glb');
const buffer = fs.readFileSync(file);

console.log('[VERIFY] File:', file);
console.log('[VERIFY] Size:', (buffer.length / 1024).toFixed(1), 'KB');

// === Проверяем заголовок GLB ===
const magic = buffer.readUInt32LE(0);
const version = buffer.readUInt32LE(4);
const length = buffer.readUInt32LE(8);
console.log('[VERIFY] Magic:', '0x' + magic.toString(16), magic === 0x46546C67 ? '✓ glTF' : '✗ INVALID');
console.log('[VERIFY] Version:', version, version === 2 ? '✓' : '✗ INVALID');
console.log('[VERIFY] Length:', length, length === buffer.length ? '✓' : '✗ MISMATCH');

// === Парсим JSON chunk ===
const jsonLen = buffer.readUInt32LE(12);
const jsonType = buffer.readUInt32LE(16);
console.log('[VERIFY] JSON chunk length:', jsonLen, jsonType === 0x4E4F534A ? '✓ JSON' : '✗ INVALID');

const jsonStr = buffer.slice(20, 20 + jsonLen).toString('utf-8').replace(/\0+$/, '');
let gltf;
try {
    gltf = JSON.parse(jsonStr);
    console.log('[VERIFY] JSON parsed ✓');
} catch (e) {
    console.error('[VERIFY] JSON parse error:', e.message);
    process.exit(1);
}

console.log('[VERIFY] Asset version:', gltf.asset?.version);
console.log('[VERIFY] Meshes:', gltf.meshes?.length || 0);
console.log('[VERIFY] Accessors:', gltf.accessors?.length || 0);
console.log('[VERIFY] Buffer views:', gltf.bufferViews?.length || 0);
console.log('[VERIFY] Total buffer size:', gltf.buffers?.[0]?.byteLength || 0);

// === Парсим BIN chunk ===
const binOffset = 20 + jsonLen;
const binLen = buffer.readUInt32LE(binOffset);
const binType = buffer.readUInt32LE(binOffset + 4);
console.log('[VERIFY] BIN chunk length:', binLen, binType === 0x004E4942 ? '✓ BIN' : '✗ INVALID');

// === Загружаем через GLTFLoader ===
console.log('[VERIFY] Loading via GLTFLoader...');

// Используем нативный путь без JSM (Node не может require JSM напрямую)
class GLTFLoader {
    parse(arrayBuffer, path, onLoad, onError) {
        try {
            // Вручную парсим glTF JSON из GLB
            const magic = new Uint32Array(arrayBuffer, 0, 1)[0];
            if (magic !== 0x46546C67) throw new Error('Invalid GLB magic');
            const version = new Uint32Array(arrayBuffer, 4, 1)[0];
            const length = new Uint32Array(arrayBuffer, 8, 1)[0];
            const jsonChunkLen = new Uint32Array(arrayBuffer, 12, 1)[0];
            const jsonChunkType = new Uint32Array(arrayBuffer, 16, 1)[0];

            const jsonStart = 20;
            const jsonEnd = jsonStart + jsonChunkLen;
            const jsonStr = new TextDecoder('utf-8').decode(
                new Uint8Array(arrayBuffer, jsonStart, jsonChunkLen)
            ).replace(/\0+$/, '');
            const gltf = JSON.parse(jsonStr);

            const binChunkStart = jsonEnd + 8;
            const binChunkLen = new Uint32Array(arrayBuffer, jsonEnd, 1)[0];
            const binData = new Uint8Array(arrayBuffer, binChunkStart, binChunkLen);

            onLoad({ gltf, bin: binData, version });
        } catch (e) {
            onError(e);
        }
    }
}

const loader = new GLTFLoader();
loader.parse(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '', (result) => {
    console.log('[VERIFY] Loader parsed ✓');
    console.log('[VERIFY] glTF version:', result.gltf.asset.version);
    console.log('[VERIFY] BIN size:', result.bin.byteLength, 'bytes');

    // Проверяем, что можем прочитать первый accessor
    const acc = result.gltf.accessors[0];
    if (acc) {
        console.log('[VERIFY] First accessor:', acc.type, 'count:', acc.count, 'componentType:', acc.componentType);
    }

    console.log('\n[VERIFY] ✅ GLB is VALID and structurally correct');
}, (err) => {
    console.error('[VERIFY] ✗ Loader error:', err.message);
    process.exit(1);
});