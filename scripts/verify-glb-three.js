/**
 * Полная проверка GLB через настоящий three.js GLTFLoader.
 * Парсит GLB как ArrayBuffer и убеждается, что геометрия восстанавливается.
 */
const fs = require('fs');
const path = require('path');
const THREE = require('three');

// Используем встроенный GLTFLoader из three/examples/jsm
// Т.к. Node.js не может require .jsm напрямую, оборачиваем через dynamic import
async function main() {
    // Загружаем GLTFLoader через dynamic import (ESM)
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    const { DRACOLoader } = await import('three/examples/jsm/loaders/DRACOLoader.js');

    const file = path.resolve(__dirname, '../public/models/payd-logo.glb');
    const buffer = fs.readFileSync(file);
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    const loader = new GLTFLoader();
    loader.setDRACOLoader(new DRACOLoader());

    return new Promise((resolve, reject) => {
        loader.parse(arrayBuffer, '', (gltf) => {
            console.log('[OK] GLTFLoader parsed successfully');
            console.log('[OK] Scene children:', gltf.scene.children.length);
            console.log('[OK] Meshes found:');
            gltf.scene.traverse((obj) => {
                if (obj.isMesh) {
                    const vCount = obj.geometry.attributes.position?.count || 0;
                    console.log(`     - ${obj.name || 'unnamed'}: ${vCount} verts, material: ${obj.material?.type || 'none'}`);
                }
            });
            resolve();
        }, (err) => {
            console.error('[FAIL] GLTFLoader parse error:', err.message);
            reject(err);
        });
    });
}

main().then(() => {
    console.log('\n✅ Verification complete');
}).catch((e) => {
    console.error('❌ Verification failed:', e.message);
    process.exit(1);
});