/**
 * PAYD FINANCE — Hero Section
 * Institutional-grade product hero
 *
 * Visual reference: Apple Vision Pro, Stripe, NVIDIA GTC, Bloomberg Terminal
 *
 * Composition:
 *  • Static cinematic camera (no movement, no rotation)
 *  • Large architectural platform — black glass + dark titanium + soft gold edge
 *  • Digital core under the glass: shader-driven circuits, light impulses, AI processor glow
 *  • 14 volumetric glass columns rising organically from the platform (financial graph)
 *  • Slow platform rotation: one revolution per ~50 seconds
 *  • Static "PAYD FINANCE" 3D logo floating above the platform
 *  • Studio HDRI lighting + global illumination + post-process bloom
 *
 * No crypto clichés. No decorative rings. No chaotic particles.
 */

import * as THREE from 'three';
import { EffectComposer }   from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }       from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass }  from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }       from 'three/addons/postprocessing/OutputPass.js';
import { FontLoader }       from 'three/addons/loaders/FontLoader.js';
import { TextGeometry }     from 'three/addons/geometries/TextGeometry.js';
import { RoomEnvironment }  from 'three/addons/environments/RoomEnvironment.js';

/* ============================================================
 *  CONFIG
 * ============================================================ */
const CONFIG = {
    /* === Palette (institutional, refined) === */
    palette: {
        violet:       0x6E4CFF,
        violetDeep:   0x3A1FA8,
        gold:         0xE9C46A,
        goldWarm:     0xC9A24A,
        white:        0xFFFFFF,
        black:        0x05050A,
        titanium:     0x1B1D24,
        glassTint:    0xB8A8FF,
    },

    /* === Camera (static cinematic) === */
    camera: {
        fov:    34,
        pos:    new THREE.Vector3(0, 2.6, 12.0),
        look:   new THREE.Vector3(0, 1.55, 0),
    },

    /* === Architectural platform === */
    platform: {
        outerRadius:     5.2,     // outer titanium rim
        innerRadius:     4.6,     // glass top
        thickness:       0.32,    // platform thickness
        glassThickness:  0.05,    // glass top layer
        goldEdgeWidth:   0.06,    // gold ring width
        rotationPeriod:  50,      // seconds per full revolution
    },

    /* === Glass columns (financial graph) === */
    columns: {
        count:        14,
        baseRadius:   3.4,        // distance from center to columns
        baseHeight:   0.4,        // minimum height
        maxHeight:    4.2,        // maximum height
        width:        0.46,
        depth:        0.46,
        cornerRadius: 0.10,       // beveled corners
        cycleSeconds: 18,         // organic growth cycle
    },

    /* === Logo "PAYD FINANCE" (stationary, floating) === */
    logo: {
        position:   new THREE.Vector3(0, 5.4, 0.4),
        size:       0.72,
        depth:      0.22,
        tiltX:      -0.12,       // gentle tilt towards camera
    },
};

/* ============================================================
 *  STATE
 * ============================================================ */
const STATE = {
    renderer:        null,
    scene:           null,
    camera:          null,
    composer:        null,
    bloom:           null,
    platformGroup:   null,   // rotates slowly
    columns:         [],     // { mesh, basePhase, freq, amp }
    columnHeights:   [],     // current heights for organic animation
    logoMesh:        null,
    coreShader:      null,   // digital core shader material
    startTime:       performance.now(),
    font:            null,
    fontReady:       false,
};

/* ============================================================
 *  INIT
 * ============================================================ */
function init() {
    const container = document.getElementById('payd-hero-3d');
    if (!container) {
        console.warn('[PAYD Hero] #payd-hero-3d not found');
        return;
    }

    try {
        setupRenderer(container);
        setupScene();
        setupCamera();
        setupPostProcessing();
        setupLights();
        buildPlatform();
        buildDigitalCore();
        buildColumns();
        loadLogo();
        startAnimation();

        // Mark container as having WebGL (suppress CSS fallback)
        container.classList.add('has-webgl');
    } catch (err) {
        console.error('[PAYD Hero] WebGL init failed:', err);
        container.classList.add('webgl-fallback');
    }
}

/* ============================================================
 *  RENDERER
 * ============================================================ */
function setupRenderer(container) {
    const w = container.clientWidth  || 1280;
    const h = container.clientHeight || 720;

    const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
        stencil: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.appendChild(renderer.domElement);
    STATE.renderer = renderer;

    window.addEventListener('resize', () => onResize(container));
}

function onResize(container) {
    const w = container.clientWidth;
    const h = container.clientHeight;
    STATE.renderer.setSize(w, h, false);
    STATE.camera.aspect = w / h;
    STATE.camera.updateProjectionMatrix();
    STATE.composer.setSize(w, h);
}

/* ============================================================
 *  SCENE
 * ============================================================ */
function setupScene() {
    const scene = new THREE.Scene();
    scene.background = null;     // transparent — let CSS gradient show

    // Studio HDRI environment (RoomEnvironment) for IBL
    const pmrem = new THREE.PMREMGenerator(STATE.renderer);
    pmrem.compileEquirectangularShader();
    const envScene = new RoomEnvironment();
    const envMap   = pmrem.fromScene(envScene, 0.04).texture;
    scene.environment = envMap;
    scene.environmentIntensity = 0.55;

    // Subtle violet atmospheric fog
    scene.fog = new THREE.FogExp2(0x05050A, 0.018);

    STATE.scene = scene;
}

function setupCamera() {
    const { fov, pos, look } = CONFIG.camera;
    const container = STATE.renderer.domElement.parentElement;
    const aspect = container.clientWidth / container.clientHeight || 16 / 9;

    const camera = new THREE.PerspectiveCamera(fov, aspect, 0.1, 200);
    camera.position.copy(pos);
    camera.lookAt(look);
    STATE.camera = camera;
}

/* ============================================================
 *  POST-PROCESSING
 * ============================================================ */
function setupPostProcessing() {
    const composer = new EffectComposer(STATE.renderer);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    composer.addPass(new RenderPass(STATE.scene, STATE.camera));

    const bloom = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.55,   // strength
        0.85,   // radius
        0.78,   // threshold
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    STATE.composer = composer;
    STATE.bloom    = bloom;
}

/* ============================================================
 *  LIGHTING — studio setup
 * ============================================================ */
function setupLights() {
    const scene = STATE.scene;

    // Soft ambient fill
    const ambient = new THREE.AmbientLight(0x1a1830, 0.25);
    scene.add(ambient);

    // Key light — warm, top-front, cinematic
    const key = new THREE.DirectionalLight(0xfff0d8, 1.6);
    key.position.set(6, 9, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 0.5;
    key.shadow.camera.far  = 30;
    key.shadow.camera.left   = -8;
    key.shadow.camera.right  =  8;
    key.shadow.camera.top    =  8;
    key.shadow.camera.bottom = -8;
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
    scene.add(key);

    // Fill light — cool violet, opposite side
    const fill = new THREE.DirectionalLight(0x9080ff, 0.85);
    fill.position.set(-7, 5, 4);
    scene.add(fill);

    // Rim light — back, gold accent for the platform edge
    const rim = new THREE.DirectionalLight(0xE9C46A, 0.55);
    rim.position.set(0, 3, -8);
    scene.add(rim);

    // Top-down soft light for logo
    const top = new THREE.PointLight(0xffffff, 0.4, 12, 1.4);
    top.position.set(0, 7, 1.5);
    scene.add(top);

    // Subtle violet ground bounce
    const ground = new THREE.PointLight(0x6E4CFF, 0.6, 18, 1.6);
    ground.position.set(0, 0.4, 0);
    scene.add(ground);
}

/* ============================================================
 *  PLATFORM — architectural, black glass + titanium + gold edge
 * ============================================================ */
function buildPlatform() {
    const { outerRadius, innerRadius, thickness, goldEdgeWidth } = CONFIG.platform;
    const { titanium } = CONFIG.palette;

    const platformGroup = new THREE.Group();
    STATE.platformGroup = platformGroup;

    // === 1. Titanium base disk (architectural underbody) ===
    const baseGeo = new THREE.CylinderGeometry(outerRadius, outerRadius, thickness, 128, 1);
    const baseMat = new THREE.MeshPhysicalMaterial({
        color: titanium,
        metalness: 0.85,
        roughness: 0.32,
        clearcoat: 0.5,
        clearcoatRoughness: 0.25,
        envMapIntensity: 0.9,
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -thickness / 2;
    base.castShadow    = true;
    base.receiveShadow = true;
    platformGroup.add(base);

    // === 2. Glass top — black glass with violet tint ===
    const glassGeo = new THREE.CylinderGeometry(innerRadius, innerRadius, CONFIG.platform.glassThickness, 128, 1);
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0x0a0814,
        metalness: 0.1,
        roughness: 0.05,
        transmission: 0.6,
        thickness: 0.1,
        ior: 1.5,
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,
        envMapIntensity: 1.2,
        transparent: true,
        opacity: 0.85,
    });
    const glassTop = new THREE.Mesh(glassGeo, glassMat);
    glassTop.position.y = CONFIG.platform.glassThickness / 2;
    glassTop.receiveShadow = true;
    platformGroup.add(glassTop);

    // === 3. Gold edge ring (architectural detail) ===
    const edgeGeo = new THREE.TorusGeometry(innerRadius, goldEdgeWidth, 16, 256);
    const edgeMat = new THREE.MeshPhysicalMaterial({
        color: CONFIG.palette.goldWarm,
        metalness: 1.0,
        roughness: 0.18,
        clearcoat: 0.8,
        envMapIntensity: 1.3,
        emissive: 0x3a2a08,
        emissiveIntensity: 0.4,
    });
    const edge = new THREE.Mesh(edgeGeo, edgeMat);
    edge.rotation.x = Math.PI / 2;
    edge.position.y = CONFIG.platform.glassThickness + 0.005;
    platformGroup.add(edge);

    // === 4. Inner shadowed inset (gives depth) ===
    const insetGeo = new THREE.CylinderGeometry(
        innerRadius - 0.15, innerRadius - 0.15,
        CONFIG.platform.glassThickness + 0.01, 128, 1
    );
    const insetMat = new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 1.0,
        metalness: 0.0,
    });
    const inset = new THREE.Mesh(insetGeo, insetMat);
    inset.position.y = (CONFIG.platform.glassThickness + 0.01) / 2 - 0.005;
    platformGroup.add(inset);

    // === 5. Lower base glow ring (soft violet under-glow) ===
    const glowGeo = new THREE.TorusGeometry(outerRadius - 0.05, 0.03, 12, 128);
    const glowMat = new THREE.MeshBasicMaterial({
        color: CONFIG.palette.violet,
        transparent: true,
        opacity: 0.55,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = Math.PI / 2;
    glow.position.y = -thickness - 0.02;
    platformGroup.add(glow);

    STATE.scene.add(platformGroup);
}

/* ============================================================
 *  DIGITAL CORE — animated shader under the glass
 * ============================================================ */
function buildDigitalCore() {
    const innerRadius = CONFIG.platform.innerRadius - 0.18;

    const geo = new THREE.CircleGeometry(innerRadius, 128);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
            uTime:      { value: 0 },
            uViolet:    { value: new THREE.Color(CONFIG.palette.violet) },
            uGold:      { value: new THREE.Color(CONFIG.palette.gold) },
            uDeep:      { value: new THREE.Color(CONFIG.palette.violetDeep) },
        },
        vertexShader: /* glsl */ `
            varying vec2 vUv;
            varying vec3 vPos;
            void main() {
                vUv = uv;
                vPos = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: /* glsl */ `
            precision highp float;
            uniform float uTime;
            uniform vec3  uViolet;
            uniform vec3  uGold;
            uniform vec3  uDeep;
            varying vec2  vUv;
            varying vec3  vPos;

            // Smooth value noise
            float hash(vec2 p) {
                p = fract(p * vec2(123.34, 456.21));
                p += dot(p, p + 45.32);
                return fract(p.x * p.y);
            }
            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                float a = hash(i);
                float b = hash(i + vec2(1.0, 0.0));
                float c = hash(i + vec2(0.0, 1.0));
                float d = hash(i + vec2(1.0, 1.0));
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }

            void main() {
                vec2 uv = vUv - 0.5;
                float r = length(uv);

                // Polar coordinates
                float angle = atan(uv.y, uv.x);
                float radial = r * 2.0;

                // --- Concentric circuit rings ---
                float rings = sin(radial * 32.0 - uTime * 0.6) * 0.5 + 0.5;
                rings = pow(rings, 8.0);

                // --- Angular circuit traces ---
                float angleSteps = floor((angle + 3.14159) * 12.0 / 6.28318);
                float tracePattern = step(0.5, fract(angle * 24.0 + uTime * 0.15));
                float angleTrace = tracePattern * smoothstep(0.6, 0.4, abs(fract(radial * 8.0 + 0.5) - 0.5));

                // --- Radial data pulses ---
                float pulseT = fract(uTime * 0.18 + angleSteps * 0.13);
                float pulse = smoothstep(0.04, 0.0, abs(pulseT - r * 0.4));
                pulse *= smoothstep(1.0, 0.0, r);

                // --- Procedural noise for organic feel ---
                float n = noise(uv * 22.0 + vec2(uTime * 0.07, -uTime * 0.04));

                // --- Center AI processor glow ---
                float coreGlow = exp(-r * 9.0) * 0.9;
                float coreRing = smoothstep(0.18, 0.16, r) * (1.0 - smoothstep(0.22, 0.20, r));

                // --- Composition ---
                float energy = rings * 0.45
                             + angleTrace * 0.35
                             + pulse * 0.85
                             + n * 0.10
                             + coreGlow * 1.4
                             + coreRing * 0.6;

                vec3 col = mix(uDeep, uViolet, energy);
                col = mix(col, uGold, pulse * 0.7 + coreRing * 0.5);
                col += vec3(0.0, 0.0, 0.0);

                // Falloff at edge
                float edgeFade = smoothstep(1.0, 0.55, r);
                float alpha = energy * edgeFade * 0.95;

                gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.95));
            }
        `,
    });

    const core = new THREE.Mesh(geo, mat);
    core.position.y = 0.002;
    core.renderOrder = -1;
    STATE.platformGroup.add(core);
    STATE.coreShader = mat;
}

/* ============================================================
 *  COLUMNS — glass financial graph
 * ============================================================ */
function buildColumns() {
    const { count, baseRadius, baseHeight, maxHeight, width, depth, cornerRadius } = CONFIG.columns;
    const palette = CONFIG.palette;

    // Use a rounded box geometry for premium glass columns
    const columnGeo = roundedBoxGeometry(width, 1.0, depth, cornerRadius, 6);

    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2 - Math.PI / 2; // start at front
        const x = Math.cos(angle) * baseRadius;
        const z = Math.sin(angle) * baseRadius;

        // Alternating glass tints (violet / gold-tinted)
        const isGold = i % 4 === 1;
        const glassColor = isGold ? palette.gold : palette.glassTint;
        const emissiveColor = isGold ? 0x3a2a08 : 0x1a0a40;

        const mat = new THREE.MeshPhysicalMaterial({
            color: glassColor,
            metalness: 0.05,
            roughness: 0.08,
            transmission: 0.92,
            thickness: 0.6,
            ior: 1.52,
            clearcoat: 1.0,
            clearcoatRoughness: 0.05,
            envMapIntensity: 1.3,
            emissive: emissiveColor,
            emissiveIntensity: 0.18,
            attenuationColor: isGold ? 0xFFD96A : 0x9080FF,
            attenuationDistance: 1.8,
        });

        const mesh = new THREE.Mesh(columnGeo, mat);
        mesh.castShadow    = true;
        mesh.receiveShadow = true;
        mesh.position.set(x, baseHeight / 2, z);
        mesh.scale.y = baseHeight;

        // Pre-compute organic animation parameters
        const phase   = (i / count) * Math.PI * 2;
        const freq    = 0.5 + Math.random() * 0.4;
        const amp     = 0.55 + Math.random() * 0.45;
        const baseRatio = 0.18 + (i / count) * 0.7;     // market pattern
        const noiseSeed = Math.random() * 1000;

        STATE.columns.push({
            mesh,
            phase,
            freq,
            amp,
            baseRatio,
            noiseSeed,
        });
        STATE.columnHeights.push(baseHeight);

        STATE.platformGroup.add(mesh);
    }
}

/* ============================================================
 *  ROUNDED BOX GEOMETRY (premium glass columns)
 * ============================================================ */
function roundedBoxGeometry(width, height, depth, radius, smoothness) {
    const shape = new THREE.Shape();
    const w = width  / 2;
    const d = depth  / 2;
    const r = Math.min(radius, Math.min(w, d));

    shape.moveTo(-w + r, -d);
    shape.lineTo( w - r, -d);
    shape.quadraticCurveTo( w, -d,  w, -d + r);
    shape.lineTo( w,  d - r);
    shape.quadraticCurveTo( w,  d,  w - r,  d);
    shape.lineTo(-w + r,  d);
    shape.quadraticCurveTo(-w,  d, -w,  d - r);
    shape.lineTo(-w, -d + r);
    shape.quadraticCurveTo(-w, -d, -w + r, -d);

    const extrudeSettings = {
        steps: 1,
        depth: height,
        bevelEnabled: true,
        bevelThickness: 0.025,
        bevelSize: 0.025,
        bevelSegments: smoothness,
        curveSegments: 24,
    };

    const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geo.translate(0, 0, -height / 2);
    geo.rotateX(-Math.PI / 2); // align extrude Y to world Y
    geo.computeVertexNormals();
    return geo;
}

/* ============================================================
 *  LOGO — "PAYD FINANCE" (static, faces camera, floats)
 * ============================================================ */
function loadLogo() {
    const fontLoader = new FontLoader();
    fontLoader.load(
        'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json',
        (font) => {
            STATE.font = font;
            STATE.fontReady = true;
            buildLogo(font);
        },
        undefined,
        (err) => {
            console.warn('[PAYD Hero] Font load failed, logo will be skipped:', err);
        }
    );
}

function buildLogo(font) {
    const { size, depth, position, tiltX } = CONFIG.logo;
    const { violet, goldWarm, titanium } = CONFIG.palette;

    const textGeo = new TextGeometry('PAYD FINANCE', {
        font,
        size,
        depth,
        curveSegments: 18,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.03,
        bevelOffset: 0,
        bevelSegments: 8,
    });
    textGeo.computeBoundingBox();
    const bb = textGeo.boundingBox;
    const w = bb.max.x - bb.min.x;
    const h = bb.max.y - bb.min.y;
    textGeo.translate(-w / 2, -h / 2, -depth / 2);
    textGeo.rotateX(tiltX);

    // === Layer 1: Black chrome body (PBR) ===
    const bodyMat = new THREE.MeshPhysicalMaterial({
        color: 0x0a0a12,
        metalness: 0.95,
        roughness: 0.18,
        clearcoat: 1.0,
        clearcoatRoughness: 0.08,
        envMapIntensity: 1.4,
    });
    const body = new THREE.Mesh(textGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;

    // === Layer 2: Gold bevel highlights (slightly larger shell) ===
    const bevelGeo = textGeo.clone();
    const bevelMat = new THREE.MeshPhysicalMaterial({
        color: goldWarm,
        metalness: 1.0,
        roughness: 0.22,
        clearcoat: 0.8,
        emissive: 0x3a2a08,
        emissiveIntensity: 0.25,
        envMapIntensity: 1.5,
    });
    const bevel = new THREE.Mesh(bevelGeo, bevelMat);
    // Scale slightly so it shows only at edges
    bevel.scale.set(1.0, 1.0, 1.0);
    bevel.position.copy(body.position);

    // === Layer 3: Soft inner glow (subtle violet emissive) ===
    const glowGeo = textGeo.clone();
    const glowMat = new THREE.MeshBasicMaterial({
        color: violet,
        transparent: true,
        opacity: 0.10,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.scale.set(1.04, 1.04, 1.04);

    // === Group the logo ===
    const logoGroup = new THREE.Group();
    logoGroup.add(bevel);   // render order: gold first
    logoGroup.add(body);
    logoGroup.add(glow);
    logoGroup.position.copy(position);
    logoGroup.renderOrder = 10;

    STATE.scene.add(logoGroup);
    STATE.logoMesh = logoGroup;
}

/* ============================================================
 *  ANIMATION LOOP
 * ============================================================ */
function startAnimation() {
    const clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);

        const t  = clock.getElapsedTime();
        const dt = Math.min(clock.getDelta(), 0.05);

        // --- Slow platform rotation (50 sec / revolution) ---
        if (STATE.platformGroup) {
            const ang = (t / CONFIG.platform.rotationPeriod) * Math.PI * 2;
            STATE.platformGroup.rotation.y = ang;
        }

        // --- Digital core shader time ---
        if (STATE.coreShader) {
            STATE.coreShader.uniforms.uTime.value = t;
        }

        // --- Organic column growth ---
        animateColumns(t);

        // --- Logo micro-float ---
        if (STATE.logoMesh) {
            const baseY = CONFIG.logo.position.y;
            STATE.logoMesh.position.y = baseY + Math.sin(t * 0.5) * 0.06;
            // Always face camera (static camera, but keeps slight breathing)
            STATE.logoMesh.lookAt(STATE.camera.position);
        }

        // --- Render ---
        STATE.composer.render();
    }
    animate();
}

function animateColumns(t) {
    const { baseHeight, maxHeight, cycleSeconds } = CONFIG.columns;
    const cols = STATE.columns;

    for (let i = 0; i < cols.length; i++) {
        const c = cols[i];

        // Multi-frequency organic motion
        const w1 = Math.sin(t * c.freq + c.phase) * 0.5 + 0.5;
        const w2 = Math.sin(t * (c.freq * 0.43) + c.phase * 1.7 + c.noiseSeed) * 0.5 + 0.5;
        const w3 = Math.sin(t * 0.27 + c.phase * 0.5) * 0.5 + 0.5;

        // Combine waves with market-pattern base
        const wave = (w1 * 0.55 + w2 * 0.30 + w3 * 0.15);
        const ratio = THREE.MathUtils.clamp(c.baseRatio + (wave - 0.5) * c.amp, 0.05, 1.0);

        const targetHeight = baseHeight + (maxHeight - baseHeight) * ratio;

        // Smooth lerp for elegance
        const prev = STATE.columnHeights[i];
        const next = THREE.MathUtils.lerp(prev, targetHeight, 0.08);
        STATE.columnHeights[i] = next;

        c.mesh.scale.y = next;
        c.mesh.position.y = next / 2;
    }
}

/* ============================================================
 *  BOOT
 * ============================================================ */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
