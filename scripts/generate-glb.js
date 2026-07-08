/**
 * Генератор GLB-модели логотипа PAYD для Hero-анимации.
 * Использует three.js + GLTFExporter для создания .glb файла,
 * который включает в себя процедурную геометрию (октаэдр + икосаэдр + стекло)
 * с PBR-материалами.
 *
 * Запуск: node generate-glb.js
 */
const fs = require('fs');
const path = require('path');
const THREE = require('three');

const COLORS = {
    chrome:      0x1A1A1D,
    gunMetal:    0x2A2A2F,
    titanium:    0x404048,
    purple:      0x7C5CFF,
    purpleBright:0x9D85FF,
    gold:        0xF3C94A,
    goldDark:    0x8C6F1F
};

function buildLogoScene() {
    const root = new THREE.Group();
    root.name = 'PAYD_LogoRoot';

    // Внутреннее ядро — октаэдр из чёрного хрома
    const coreGeo = new THREE.OctahedronGeometry(0.9, 0);
    const coreMat = new THREE.MeshPhysicalMaterial({
        color: COLORS.chrome,
        metalness: 0.98,
        roughness: 0.18,
        clearcoat: 0.85,
        clearcoatRoughness: 0.12,
        reflectivity: 0.95,
        envMapIntensity: 1.8
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.name = 'ChromeCore';
    core.scale.set(1.0, 1.25, 1.0);
    root.add(core);

    // Золотые рёбра
    const edgesGeo = new THREE.EdgesGeometry(coreGeo, 1);
    const edgesMat = new THREE.LineBasicMaterial({
        color: COLORS.gold,
        transparent: true,
        opacity: 0.9
    });
    const edges = new THREE.LineSegments(edgesGeo, edgesMat);
    edges.name = 'GoldEdges';
    edges.scale.set(1.012, 1.265, 1.012);
    root.add(edges);

    // Средняя оболочка — икосаэдр (gun metal)
    const midGeo = new THREE.IcosahedronGeometry(1.15, 0);
    const midMat = new THREE.MeshPhysicalMaterial({
        color: COLORS.gunMetal,
        metalness: 0.92,
        roughness: 0.32,
        clearcoat: 0.6,
        clearcoatRoughness: 0.22,
        envMapIntensity: 1.4,
        transparent: true,
        opacity: 0.85
    });
    const mid = new THREE.Mesh(midGeo, midMat);
    mid.name = 'GunMetalShell';
    root.add(mid);

    // Внешняя стеклянная оболочка с iridescence
    const glassGeo = new THREE.IcosahedronGeometry(1.45, 1);
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        metalness: 0.0,
        roughness: 0.05,
        transmission: 0.85,
        thickness: 0.5,
        ior: 1.45,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        iridescence: 0.9,
        iridescenceIOR: 1.3,
        transparent: true,
        opacity: 0.35,
        envMapIntensity: 2.0,
        side: THREE.DoubleSide
    });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.name = 'GlassCoating';
    root.add(glass);

    // Тонкие золотые кольца
    const ringConfigs = [
        { r: 1.55, axis: 'y', opacity: 0.85 },
        { r: 1.7,  axis: 'x', opacity: 0.65 },
        { r: 1.85, axis: 'z', opacity: 0.45 }
    ];
    ringConfigs.forEach((cfg, i) => {
        const ringGeo = new THREE.TorusGeometry(cfg.r, 0.006, 8, 96);
        const ringMat = new THREE.MeshStandardMaterial({
            color: COLORS.gold,
            metalness: 1.0,
            roughness: 0.25,
            emissive: COLORS.goldDark,
            emissiveIntensity: 0.4,
            envMapIntensity: 2.0,
            transparent: true,
            opacity: cfg.opacity
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.name = `GoldRing_${i}`;
        if (cfg.axis === 'x') ring.rotation.x = Math.PI / 2;
        if (cfg.axis === 'z') ring.rotation.y = Math.PI / 2;
        root.add(ring);
    });

    // Неоновый внутренний кристалл
    const neonGeo = new THREE.OctahedronGeometry(0.6, 0);
    const neonMat = new THREE.MeshBasicMaterial({
        color: COLORS.purpleBright,
        transparent: true,
        opacity: 0.85
    });
    const neon = new THREE.Mesh(neonGeo, neonMat);
    neon.name = 'NeonCore';
    neon.scale.set(0.95, 1.2, 0.95);
    root.add(neon);

    return root;
}

/**
 * Построить PBR-материал для меша на основе его имени.
 * Возвращает структуру, совместимую с glTF 2.0 materials[].pbrMetallicRoughness.
 */
function buildPBRMaterial(meshName) {
    if (meshName === 'ChromeCore') {
        return {
            name: 'BlackChrome',
            pbrMetallicRoughness: {
                baseColorFactor: [0.10, 0.10, 0.11, 1.0],
                metallicFactor: 0.98,
                roughnessFactor: 0.18
            }
        };
    }
    if (meshName === 'GunMetalShell') {
        return {
            name: 'GunMetal',
            pbrMetallicRoughness: {
                baseColorFactor: [0.16, 0.16, 0.18, 1.0],
                metallicFactor: 0.92,
                roughnessFactor: 0.32
            }
        };
    }
    if (meshName === 'GlassCoating') {
        return {
            name: 'Glass',
            pbrMetallicRoughness: {
                baseColorFactor: [1.0, 1.0, 1.0, 1.0],
                metallicFactor: 0.0,
                roughnessFactor: 0.05
            }
        };
    }
    if (meshName && meshName.startsWith('GoldRing')) {
        return {
            name: 'Gold',
            pbrMetallicRoughness: {
                baseColorFactor: [0.95, 0.79, 0.29, 1.0],
                metallicFactor: 1.0,
                roughnessFactor: 0.25
            },
            emissiveFactor: [0.55, 0.43, 0.12]
        };
    }
    if (meshName === 'NeonCore') {
        return {
            name: 'Neon',
            pbrMetallicRoughness: {
                baseColorFactor: [0.61, 0.52, 1.0, 1.0],
                metallicFactor: 0.0,
                roughnessFactor: 0.5
            },
            emissiveFactor: [0.61, 0.52, 1.0]
        };
    }
    // Дефолт
    return {
        name: meshName || 'Default',
        pbrMetallicRoughness: {
            baseColorFactor: [0.5, 0.5, 0.5, 1.0],
            metallicFactor: 0.5,
            roughnessFactor: 0.5
        }
    };
}

/**
 * Экспорт сцены в GLB через самописный сериализатор (без зависимости от GLTFExporter/examples).
 * Создаём bin-чанк с вершинными данными и индексами, плюс минимальный JSON.
 */
function exportToGLB(scene) {
    const meshes = [];
    scene.traverse((obj) => {
        if (obj.isMesh && obj.geometry) {
            meshes.push(obj);
        }
    });

    // === Сборка геометрии в один буфер ===
    let totalVerts = 0;
    let totalIndices = 0;
    const accessorBuffers = [];

    // Сначала пройдёмся и приведём все геометрии к одному набору атрибутов
    meshes.forEach((m) => {
        const g = m.geometry;
        g.computeVertexNormals();

        if (!g.attributes.position) return;
        if (!g.attributes.normal) {
            g.computeVertexNormals();
        }
        // Сконвертируем в non-indexed для предсказуемости
        const gNI = g.index ? g.toNonIndexed() : g.clone();
        if (g.index) g.dispose();

        const pos = gNI.attributes.position.array;
        const norm = gNI.attributes.normal ? gNI.attributes.normal.array : new Float32Array(pos.length);
        const baseColor = m.material.color || new THREE.Color(0xffffff);
        const c = [baseColor.r, baseColor.g, baseColor.b, 1.0];
        const colors = new Float32Array(pos.length / 3 * 4);
        for (let i = 0; i < colors.length; i += 4) {
            colors[i] = c[0]; colors[i+1] = c[1]; colors[i+2] = c[2]; colors[i+3] = c[3];
        }

        const vertCount = pos.length / 3;
        const indexArr = new Uint32Array(vertCount);
        for (let i = 0; i < vertCount; i++) indexArr[i] = i;

        accessorBuffers.push({
            mesh: m,
            geometry: gNI,
            positions: new Float32Array(pos),
            normals: new Float32Array(norm),
            colors: colors,
            indices: indexArr
        });

        totalVerts += vertCount;
        totalIndices += vertCount;
    });

    // === Сборка одного бинарного буфера ===
    // Формат для каждого меша: positions (vec3), normals (vec3), colors (vec4)
    // После каждого блока меша — его индексы (uint32)
    const STRIDE_PER_VERT = 3 + 3 + 4; // pos + normal + color = 10 floats
    const bytesPerVert = STRIDE_PER_VERT * 4;
    const totalBufferSize = totalVerts * bytesPerVert + totalIndices * 4;
    const buffer = new ArrayBuffer(totalBufferSize);
    const view = new DataView(buffer);
    const f32 = new Float32Array(buffer);
    const u32 = new Uint32Array(buffer);

    const accessors = [];
    const bufferViews = [];
    let byteOffset = 0;

    let vertOffset = 0; // cumulative vertex offset for indices

    accessorBuffers.forEach((ab) => {
        const vertCount = ab.positions.length / 3;

        // positions view
        const positionsViewIndex = bufferViews.length;
        bufferViews.push({
            buffer: 0,
            byteOffset: byteOffset,
            byteLength: vertCount * 12,
            target: 34962 // ARRAY_BUFFER
        });
        const posAccIndex = accessors.length;
        accessors.push({
            bufferView: positionsViewIndex,
            byteOffset: 0,
            componentType: 5126, // FLOAT
            count: vertCount,
            type: 'VEC3',
            min: [Infinity, Infinity, Infinity],
            max: [-Infinity, -Infinity, -Infinity]
        });
        for (let i = 0; i < ab.positions.length; i++) {
            f32[(byteOffset / 4) + i] = ab.positions[i];
            const dim = i % 3;
            const vi = (i - dim) / 3;
            if (ab.positions[i] < accessors[posAccIndex].min[dim]) accessors[posAccIndex].min[dim] = ab.positions[i];
            if (ab.positions[i] > accessors[posAccIndex].max[dim]) accessors[posAccIndex].max[dim] = ab.positions[i];
        }
        byteOffset += vertCount * 12;

        // normals view
        const normalsViewIndex = bufferViews.length;
        bufferViews.push({
            buffer: 0,
            byteOffset: byteOffset,
            byteLength: vertCount * 12,
            target: 34962
        });
        accessors.push({
            bufferView: normalsViewIndex,
            byteOffset: 0,
            componentType: 5126,
            count: vertCount,
            type: 'VEC3'
        });
        for (let i = 0; i < ab.normals.length; i++) {
            f32[(byteOffset / 4) + i] = ab.normals[i];
        }
        byteOffset += vertCount * 12;

        // colors view
        const colorsViewIndex = bufferViews.length;
        bufferViews.push({
            buffer: 0,
            byteOffset: byteOffset,
            byteLength: vertCount * 16,
            target: 34962
        });
        accessors.push({
            bufferView: colorsViewIndex,
            byteOffset: 0,
            componentType: 5126,
            count: vertCount,
            type: 'VEC4'
        });
        for (let i = 0; i < ab.colors.length; i++) {
            f32[(byteOffset / 4) + i] = ab.colors[i];
        }
        byteOffset += vertCount * 16;

        // indices view
        const indicesViewIndex = bufferViews.length;
        bufferViews.push({
            buffer: 0,
            byteOffset: byteOffset,
            byteLength: vertCount * 4,
            target: 34963 // ELEMENT_ARRAY_BUFFER
        });
        const indicesAccIndex = accessors.length;
        accessors.push({
            bufferView: indicesViewIndex,
            byteOffset: 0,
            componentType: 5125, // UNSIGNED_INT
            count: vertCount,
            type: 'SCALAR'
        });
        for (let i = 0; i < vertCount; i++) {
            u32[(byteOffset / 4) + i] = i + vertOffset;
        }
        byteOffset += vertCount * 4;
        vertOffset += vertCount;
    });

    // === Сборка glTF JSON ===
    // Сначала создаём массив материалов (по одному на меш, на основе имени)
    const materialsJson = accessorBuffers.map((ab) => buildPBRMaterial(ab.mesh.name));

    const meshesJson = accessorBuffers.map((ab, i) => {
        const posAcc = i * 4;       // позиции
        const normAcc = i * 4 + 1;  // нормали
        const colAcc = i * 4 + 2;   // цвета
        const idxAcc = i * 4 + 3;   // индексы
        return {
            name: ab.mesh.name || `Mesh_${i}`,
            primitives: [{
                attributes: {
                    POSITION: posAcc,
                    NORMAL: normAcc,
                    COLOR_0: colAcc
                },
                indices: idxAcc,
                mode: 4, // TRIANGLES
                material: i // каждый меш = свой материал
            }]
        };
    });

    const gltf = {
        asset: {
            version: '2.0',
            generator: 'PAYD GLB Exporter'
        },
        scene: 0,
        scenes: [{
            nodes: accessorBuffers.map((_, i) => i),
            name: 'PAYDLogoScene'
        }],
        nodes: accessorBuffers.map((ab, i) => ({
            mesh: i,
            name: ab.mesh.name || `Mesh_${i}`
        })),
        meshes: meshesJson,
        materials: materialsJson,
        accessors: accessors,
        bufferViews: bufferViews,
        buffers: [{ byteLength: totalBufferSize }]
    };

    // === Упаковка GLB (12-байтный header + 8-байт chunk header + JSON + BIN) ===
    const jsonStr = JSON.stringify(gltf);
    const jsonBytes = Buffer.from(jsonStr, 'utf-8');
    // Дополняем JSON до кратного 4
    const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
    const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc(jsonPadding, 0x20)]);

    const binPadding = (4 - (buffer.byteLength % 4)) % 4;
    const binBuffer = Buffer.from(buffer);
    const binPadded = Buffer.concat([binBuffer, Buffer.alloc(binPadding, 0)]);

    const totalLength = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
    const glb = Buffer.alloc(totalLength);

    // Header: magic 'glTF' (4) + version (4) + length (4)
    glb.writeUInt32LE(0x46546C67, 0); // 'glTF' little-endian
    glb.writeUInt32LE(2, 4); // version
    glb.writeUInt32LE(totalLength, 8);

    // JSON chunk
    let offset = 12;
    glb.writeUInt32LE(jsonPadded.length, offset); // chunkLength
    glb.writeUInt32LE(0x4E4F534A, offset + 4); // 'JSON'
    jsonPadded.copy(glb, offset + 8);
    offset += 8 + jsonPadded.length;

    // BIN chunk
    glb.writeUInt32LE(binPadded.length, offset); // chunkLength
    glb.writeUInt32LE(0x004E4942, offset + 4); // 'BIN\0'
    binPadded.copy(glb, offset + 8);

    return glb;
}

// === MAIN ===
console.log('[GLB] Building PAYD logo scene...');
const scene = buildLogoScene();
console.log('[GLB] Scene built, meshes:', scene.children.length);

console.log('[GLB] Exporting to GLB binary...');
const glbBuffer = exportToGLB(scene);
console.log('[GLB] GLB size:', (glbBuffer.length / 1024).toFixed(1), 'KB');

const outPath = path.resolve(__dirname, '../public/models/payd-logo.glb');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, glbBuffer);
console.log('[GLB] Saved:', outPath);

// Копия как fallback
const fallbackPath = path.resolve(__dirname, '../public/models/payd-logo-fallback.glb');
fs.writeFileSync(fallbackPath, glbBuffer);
console.log('[GLB] Fallback saved:', fallbackPath);