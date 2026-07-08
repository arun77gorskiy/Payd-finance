const fs = require('fs');
const buf = fs.readFileSync('../public/models/payd-logo.glb');
const jsonLen = buf.readUInt32LE(12);
const jsonStr = buf.slice(20, 20 + jsonLen).toString('utf-8').replace(/\0+$/, '');
const gltf = JSON.parse(jsonStr);
console.log('Keys:', Object.keys(gltf));
console.log('Has materials array:', Array.isArray(gltf.materials));
console.log('First mesh primitives[0]:', JSON.stringify(gltf.meshes[0].primitives[0], null, 2));