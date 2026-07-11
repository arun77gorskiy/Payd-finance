/**
 * PAYD Finance — Premium Hero (Reference-style)
 *
 * Композиция из референса:
 *  • Объёмные стеклянные столбцы (12 шт) с градиентом фиолетовый → золотой
 *  • Кольцевая орбита с повторяющимся текстом "PAYD Finance"
 *  • Глянцевый пол с отражением и тонкой сеткой
 *  • Световые кольца в основании
 *  • Бесконечный цикл: рост → кульминация → коррекция → повтор
 *  • Bloom, PBR, HDR lighting
 *
 * Цвета (из брифа):
 *  • #7C5CFF — фиолетовый
 *  • #5B2CFF — тёмно-фиолетовый
 *  • #F3C94A — золотой
 *  • #FFFFFF — белый
 *  • #09090B — чёрный
 *
 * Вдохновение: Apple, NVIDIA, Stripe, OpenAI
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ============================================================
 *  CONFIG
 * ============================================================ */
const CONFIG = {
    // --- Colors (из брифа) ---
    bgColor:         0x09090B,  // #09090B чёрный
    violet:          0x7C5CFF,  // #7C5CFF основной фиолетовый
    violetDeep:      0x5B2CFF,  // #5B2CFF тёмно-фиолетовый
    gold:            0xF3C94A,  // #F3C94A золотой
    white:           0xFFFFFF,  // #FFFFFF белый

    // --- Camera ---
    cameraFOV:       42,
    cameraStart:     { x: 0,    y: 3.2, z: 9.0 },
    cameraLook:      { x: 0,    y: 1.5, z: 0   },
    cameraZoomIn:    40,        // FOV в начале (шире)
    cameraZoomOut:   42,        // FOV в конце цикла (уже)
    zoomDuration:    20,        // секунд на один zoom-цикл

    // --- Chart bars (12 объёмных столбцов) ---
    barCount:        12,
    barWidth:        0.55,      // шире — заметнее
    barDepth:        0.55,
    barSpacing:      0.78,      // больше места между столбцами
    barBaseY:        0.21,
    barMaxHeight:    3.5,       // выше — более впечатляюще
    barBaseHeight:   0.35,
    barStartX:       -4.29,     // скорректировано под новый spacing

    // --- Cycle (бесконечный) ---
    cycleDuration:   14,        // секунд на полный цикл
    growPhaseEnd:    0.55,      // 0..1 — фаза роста (нормировано)
    climaxPhaseEnd:  0.62,      // 0..1 — кульминация
    correctPhaseEnd: 0.92,      // 0..1 — коррекция
    pausePhaseEnd:   1.0,       // 0..1 — пауза перед новым циклом

    // --- Orbital ring (PAYD Finance) ---
    orbitRadius:     5.2,
    orbitTextCount:  10,
    orbitY:          1.6,
    orbitSpeed:      0.12,      // рад/с
    orbitTextSize:   0.32,      // крупнее — заметнее

    // --- Floor / rings ---
    floorSize:       30,
    ringCount:       3,
    ringRadii:       [2.4, 3.2, 4.0],
    ringThickness:   0.025,

    // --- Lighting ---
    bloomStrength:   2.4,       // насыщенный bloom
    bloomRadius:     0.85,
    bloomThreshold:  0.12,      // понижен порог — больше пикселей светятся

    // --- Perf ---
    dprMax:          1.75,
    dprMin:          1.0,
};

/* ============================================================
 *  STATE
 * ============================================================ */
const STATE = {
    scene: null,
    camera: null,
    renderer: null,
    composer: null,
    bloomPass: null,
    flashPass: null,

    bars: [],                  // { mesh, baseHeight, currentHeight, currentScaleY, growth }
    barGroup: null,
    orbitGroup: null,
    floor: null,
    grid: null,
    rings: [],
    environment: null,

    rafId: null,
    startTime: 0,
    lastTime: 0,
    elapsed: 0,
    width: 0,
    height: 0,
    dpr: 1,

    isVisible: true,
    isLowEnd: false,
    isAutomated: false,
    fontReady: false,
};

/* ============================================================
 *  HELPERS
 * ============================================================ */
function hexToVec3(hex) {
    return new THREE.Vector3(
        ((hex >> 16) & 0xff) / 255,
        ((hex >> 8)  & 0xff) / 255,
        (hex & 0xff) / 255
    );
}

function lerpColorVec3(a, b, t, out) {
    out.r = a.r + (b.r - a.r) * t;
    out.g = a.g + (b.g - a.g) * t;
    out.b = a.b + (b.b - a.b) * t;
    return out;
}

function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

function easeInOutSine(t) {
    return -(Math.cos(Math.PI * t) - 1) / 2;
}

/* ============================================================
 *  PERF / CONTEXT
 * ============================================================ */
function detectContext() {
    const ua = navigator.userAgent;
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
    const memLevel = navigator.deviceMemory ? (navigator.deviceMemory < 4 ? 'low' : 'high') : 'high';
    const cores = navigator.hardwareConcurrency ? (navigator.hardwareConcurrency < 4 ? 'low' : 'high') : 'high';
    const isAutomated = !!(navigator.webdriver || window.__nightmare || window.callPhantom || window._phantom);
    return {
        isMobile,
        isLowEnd: isMobile || memLevel === 'low' || cores === 'low',
        isAutomated,
    };
}

/* ============================================================
 *  INIT
 * ============================================================ */
function init() {
    const container = document.getElementById('payd-hero-3d');
    if (!container) {
        console.warn('[HeroPremium] Container #payd-hero-3d not found');
        return;
    }

    const ctx = detectContext();
    STATE.isAutomated = ctx.isAutomated;
    STATE.isLowEnd = ctx.isLowEnd || ctx.isAutomated;

    // DPR
    STATE.dpr = Math.min(window.devicePixelRatio || 1, ctx.isLowEnd ? CONFIG.dprMin : CONFIG.dprMax);

    const rect = container.getBoundingClientRect();
    STATE.width  = Math.max(2, Math.floor(rect.width));
    STATE.height = Math.max(2, Math.floor(rect.height));

    // === Scene ===
    STATE.scene = new THREE.Scene();
    STATE.scene.background = new THREE.Color(CONFIG.bgColor);
    STATE.scene.fog = new THREE.FogExp2(CONFIG.bgColor, 0.025);

    // === Camera ===
    STATE.camera = new THREE.PerspectiveCamera(CONFIG.cameraFOV, STATE.width / STATE.height, 0.1, 80);
    STATE.camera.position.set(CONFIG.cameraStart.x, CONFIG.cameraStart.y, CONFIG.cameraStart.z);
    STATE.camera.lookAt(CONFIG.cameraLook.x, CONFIG.cameraLook.y, CONFIG.cameraLook.z);

    // === Renderer ===
    STATE.renderer = new THREE.WebGLRenderer({
        antialias: !ctx.isLowEnd,
        alpha: false,
        powerPreference: 'high-performance',
    });
    STATE.renderer.setPixelRatio(STATE.dpr);
    STATE.renderer.setSize(STATE.width, STATE.height);
    STATE.renderer.outputColorSpace = THREE.SRGBColorSpace;
    STATE.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    STATE.renderer.toneMappingExposure = 1.15;
    container.appendChild(STATE.renderer.domElement);

    // === Environment (IBL) ===
    try {
        const pmrem = new THREE.PMREMGenerator(STATE.renderer);
        const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
        STATE.scene.environment = envRT.texture;
        STATE.environment = envRT.texture;
        pmrem.dispose();
    } catch (e) {
        // fall back to flat lighting
    }

    // === Scene setup ===
    setupLights();
    buildFloor();
    buildBaseRings();
    buildBars();
    buildOrbitTexts();
    setupPostProcessing();

    // === Events ===
    window.addEventListener('resize', onResize);
    setupVisibilityObserver();
    setupAnimationFallback();

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            STATE.isVisible = false;
        } else {
            STATE.isVisible = true;
            STATE.lastTime = performance.now();
            animate(STATE.lastTime);
        }
    });

    STATE.startTime = performance.now();
    STATE.lastTime = STATE.startTime;
    console.log('[HeroPremium] Initialized. Size:', STATE.width, 'x', STATE.height,
                'DPR:', STATE.dpr, 'Mode:', ctx.isLowEnd ? 'low-end' : 'full');
    animate(STATE.startTime);
}

/* ============================================================
 *  LIGHTS
 * ============================================================ */
function setupLights() {
    // Ambient — глубокий фиолетовый (фон)
    const ambient = new THREE.AmbientLight(CONFIG.violetDeep, 0.55);
    STATE.scene.add(ambient);

    // Key — мощный мягкий золотой сверху (подсвечивает вершины столбцов)
    const key = new THREE.DirectionalLight(CONFIG.gold, 2.6);
    key.position.set(0, 9, 4);
    STATE.scene.add(key);

    // Rim — фиолетовый сзади-сбоку
    const rim = new THREE.DirectionalLight(CONFIG.violet, 1.6);
    rim.position.set(-5, 3, -6);
    STATE.scene.add(rim);

    // Bottom — мощная фиолетовая подсветка снизу (purple glow)
    const bottom = new THREE.PointLight(CONFIG.violet, 7.0, 14, 1.5);
    bottom.position.set(0, -0.3, 0);
    STATE.scene.add(bottom);

    // Gold spot над графиком — ярче, подсвечивает золотые вершины
    const spot = new THREE.SpotLight(CONFIG.gold, 6.5, 18, Math.PI / 4, 0.6, 1.2);
    spot.position.set(0, 8, 2);
    spot.target.position.set(0, 2.0, 0);
    STATE.scene.add(spot);
    STATE.scene.add(spot.target);

    // Subtle violet fills по бокам для depth
    const fillL = new THREE.PointLight(CONFIG.violet, 1.8, 11, 2.0);
    fillL.position.set(-3, 1, 0);
    STATE.scene.add(fillL);

    const fillR = new THREE.PointLight(CONFIG.violet, 1.8, 11, 2.0);
    fillR.position.set(3, 1, 0);
    STATE.scene.add(fillR);

    // Hemisphere для равномерного "небесного" света (золото сверху, фиолет снизу)
    const hemi = new THREE.HemisphereLight(CONFIG.gold, CONFIG.violetDeep, 0.65);
    STATE.scene.add(hemi);
}

/* ============================================================
 *  FLOOR + GRID
 * ============================================================ */
function buildFloor() {
    // Глянцевый пол с отражением
    const floorGeom = new THREE.PlaneGeometry(CONFIG.floorSize, CONFIG.floorSize);
    const floorMat = new THREE.MeshStandardMaterial({
        color: 0x0C0A14,
        metalness: 0.92,
        roughness: 0.32,
        envMapIntensity: 1.4,
    });
    STATE.floor = new THREE.Mesh(floorGeom, floorMat);
    STATE.floor.rotation.x = -Math.PI / 2;
    STATE.floor.position.y = 0;
    STATE.scene.add(STATE.floor);

    // Тонкая светящаяся сетка
    const grid = new THREE.GridHelper(CONFIG.floorSize, 60, CONFIG.violet, CONFIG.violetDeep);
    grid.position.y = 0.005;
    grid.material.transparent = true;
    grid.material.opacity = 0.22;
    grid.material.depthWrite = false;
    STATE.grid = grid;
    STATE.scene.add(grid);
}

/* ============================================================
 *  BASE LIGHT RINGS (вокруг основания)
 * ============================================================ */
function buildBaseRings() {
    for (let i = 0; i < CONFIG.ringCount; i++) {
        const radius = CONFIG.ringRadii[i];
        const geom = new THREE.TorusGeometry(radius, CONFIG.ringThickness, 12, 96);
        // Градиент: внутренние — фиолет, внешние — золото
        const color = i < 2 ? CONFIG.violet : CONFIG.gold;
        const mat = new THREE.MeshBasicMaterial({
            color: color,
            transparent: true,
            opacity: 0.55 - i * 0.10,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });
        const ring = new THREE.Mesh(geom, mat);
        ring.position.y = 0.015 + i * 0.003;
        ring.rotation.x = -Math.PI / 2;
        STATE.scene.add(ring);
        STATE.rings.push(ring);
    }
}

/* ============================================================
 *  BARS (стеклянные столбцы с градиентом)
 * ============================================================ */
function buildBars() {
    STATE.barGroup = new THREE.Group();
    STATE.scene.add(STATE.barGroup);

    const violetTop = hexToVec3(CONFIG.gold);
    const violetBot = hexToVec3(CONFIG.violetDeep);

    for (let i = 0; i < CONFIG.barCount; i++) {
        // Базовая высота — единичная (для масштабирования)
        // Увеличены сегменты по Y для плавного градиента
        const geom = new THREE.BoxGeometry(CONFIG.barWidth, 1, CONFIG.barDepth, 2, 32, 2);

        // Vertex colors: градиент снизу (violet) вверх (gold)
        const posAttr = geom.attributes.position;
        const colors = new Float32Array(posAttr.count * 3);
        const tmpColor = new THREE.Color();
        for (let v = 0; v < posAttr.count; v++) {
            const y = posAttr.getY(v); // [-0.5, 0.5]
            // Градиент: 0.0 (низ) = #5B2CFF (тёмно-фиолетовый)
            //          0.5 (середина) = #7C5CFF (фиолетовый)
            //          1.0 (верх) = #F3C94A (золотой)
            // Используем power curve для более выраженного золотого верха
            const t01 = (y + 0.5); // 0..1
            // Усиленный градиент: квадратичная интерполяция к золоту
            const t = Math.pow(t01, 0.65); // 0.65 < 1: быстрее достигает золотого
            // Lerp: violetDeep -> violet -> gold
            if (t < 0.5) {
                lerpColorVec3(hexToVec3(CONFIG.violetDeep), hexToVec3(CONFIG.violet), t * 2, tmpColor);
            } else {
                lerpColorVec3(hexToVec3(CONFIG.violet), hexToVec3(CONFIG.gold), (t - 0.5) * 2, tmpColor);
            }
            // Усиление яркости по высоте — верх ярче для bloom
            const bright = 1.0 + 0.6 * t01;
            colors[v * 3]     = Math.min(1, tmpColor.r * bright);
            colors[v * 3 + 1] = Math.min(1, tmpColor.g * bright);
            colors[v * 3 + 2] = Math.min(1, tmpColor.b * bright);
        }
        geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        // MeshBasicMaterial — не зависит от освещения, всегда показывает vertex colors ярко
        // Это гарантирует, что градиент фиолетовый→золотой всегда виден
        const mat = new THREE.MeshBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.95,
            toneMapped: false,  // отключаем tone mapping для более яркого цвета
        });

        const mesh = new THREE.Mesh(geom, mat);
        const x = CONFIG.barStartX + i * CONFIG.barSpacing;
        mesh.position.set(x, CONFIG.barBaseY, 0);
        mesh.scale.y = CONFIG.barBaseHeight; // начинаем с минимальной
        mesh.visible = true;
        STATE.barGroup.add(mesh);

        // Золотой кэп на вершине — отдельный эмиссивный объект (для bloom)
        const capGeom = new THREE.BoxGeometry(CONFIG.barWidth * 1.10, 0.12, CONFIG.barDepth * 1.10);
        const capMat = new THREE.MeshBasicMaterial({
            color: CONFIG.gold,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,  // яркий цвет без tone mapping
        });
        const cap = new THREE.Mesh(capGeom, capMat);
        // НЕ делаем child of mesh — позиционируем вручную в animate()
        cap.position.set(x, CONFIG.barBaseY, 0);
        STATE.barGroup.add(cap);

        // Яркий glow под столбцом — большая сфера для bloom свечения
        const glowGeom = new THREE.SphereGeometry(0.28, 18, 18);
        const glowMat = new THREE.MeshBasicMaterial({
            color: CONFIG.violet,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            toneMapped: false,
        });
        const glow = new THREE.Mesh(glowGeom, glowMat);
        glow.position.set(x, 0.08, 0);
        STATE.barGroup.add(glow);

        STATE.bars.push({
            mesh,
            cap,
            glow,
            index: i,
            x: x,
            baseScale: CONFIG.barBaseHeight,
            currentScale: CONFIG.barBaseHeight,
            glowBaseOp: 0.85,
        });
    }
}

/* ============================================================
 *  ORBITAL RING (PAYD Finance × N copies)
 * ============================================================ */
function buildOrbitTexts() {
    STATE.orbitGroup = new THREE.Group();
    STATE.orbitGroup.position.set(0, CONFIG.orbitY, 0);
    STATE.scene.add(STATE.orbitGroup);

    const loader = new FontLoader();
    loader.load(
        'https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json',
        (font) => {
            const textGeom = new TextGeometry('PAYD Finance', {
                font: font,
                size: CONFIG.orbitTextSize,
                height: 0.045,
                curveSegments: 8,
                bevelEnabled: true,
                bevelThickness: 0.010,
                bevelSize: 0.008,
                bevelSegments: 4,
            });
            textGeom.computeBoundingBox();
            const bb = textGeom.boundingBox;
            const w = bb.max.x - bb.min.x;
            const h = bb.max.y - bb.min.y;
            // Центрируем
            textGeom.translate(-w / 2 - bb.min.x, -h / 2 - bb.min.y, 0);

            // Glass + metallic purple material — ярче, заметнее
            const textMat = new THREE.MeshPhysicalMaterial({
                color: CONFIG.violet,
                metalness: 0.85,
                roughness: 0.18,
                transmission: 0.20,
                thickness: 0.4,
                ior: 1.45,
                clearcoat: 1.0,
                clearcoatRoughness: 0.08,
                envMapIntensity: 2.2,
                emissive: CONFIG.violet,
                emissiveIntensity: 0.85,  // ярче
                transparent: true,
                opacity: 0.98,
            });

            // Glow material (для неонового ореола) — крупнее, ярче
            const glowMat = new THREE.MeshBasicMaterial({
                color: CONFIG.violet,
                transparent: true,
                opacity: 0.65,           // ярче
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.BackSide,
            });

            // Создаём N копий по окружности
            for (let i = 0; i < CONFIG.orbitTextCount; i++) {
                const angle = (i / CONFIG.orbitTextCount) * Math.PI * 2;
                const x = Math.cos(angle) * CONFIG.orbitRadius;
                const z = Math.sin(angle) * CONFIG.orbitRadius;

                const pivot = new THREE.Group();
                pivot.position.set(x, 0, z);

                // Текст смотрит наружу от центра
                const text = new THREE.Mesh(textGeom, textMat);
                // Поворачиваем текст: он лежит в плоскости XY, нужно развернуть наружу
                text.rotation.y = -angle + Math.PI / 2;

                const glow = new THREE.Mesh(textGeom, glowMat);
                glow.rotation.y = -angle + Math.PI / 2;
                glow.scale.set(1.20, 1.35, 1.45);  // крупнее halo

                pivot.add(text);
                pivot.add(glow);
                STATE.orbitGroup.add(pivot);
            }

            STATE.fontReady = true;
            console.log('[HeroPremium] Orbit text loaded');
        },
        undefined,
        (err) => {
            console.warn('[HeroPremium] Font load failed', err);
        }
    );
}

/* ============================================================
 *  POST-PROCESSING
 * ============================================================ */
function setupPostProcessing() {
    STATE.composer = new EffectComposer(STATE.renderer);
    STATE.composer.setPixelRatio(STATE.dpr);
    STATE.composer.setSize(STATE.width, STATE.height);

    STATE.composer.addPass(new RenderPass(STATE.scene, STATE.camera));

    // Сильный bloom
    STATE.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(STATE.width, STATE.height),
        CONFIG.bloomStrength,
        CONFIG.bloomRadius,
        CONFIG.bloomThreshold
    );
    STATE.composer.addPass(STATE.bloomPass);

    // Custom flash overlay (для кульминации)
    const flashShader = {
        uniforms: {
            tDiffuse: { value: null },
            uIntensity: { value: 0.0 },
            uTint: { value: new THREE.Color(CONFIG.gold) },
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform float uIntensity;
            uniform vec3  uTint;
            varying vec2 vUv;
            void main() {
                vec4 src = texture2D(tDiffuse, vUv);
                vec2 c = vUv - 0.5;
                float r = length(c) * 1.3;
                float falloff = smoothstep(1.0, 0.0, r);
                vec3 col = src.rgb + uTint * uIntensity * falloff * 0.85;
                col += uTint * uIntensity * 0.18;
                gl_FragColor = vec4(col, src.a);
            }
        `,
    };
    STATE.flashPass = new ShaderPass(flashShader);
    STATE.composer.addPass(STATE.flashPass);

    STATE.composer.addPass(new OutputPass());
}

/* ============================================================
 *  ANIMATION — бесконечный цикл (рост → кульминация → коррекция → повтор)
 * ============================================================ */
function animate(now) {
    if (document.hidden || !STATE.isVisible) return;
    STATE.rafId = requestAnimationFrame(animate);

    const t  = (now - STATE.startTime) / 1000;
    const dt = Math.min((now - STATE.lastTime) / 1000, 0.05);
    STATE.lastTime = now;
    STATE.elapsed = t;

    // --- Бесконечный цикл: нормализованное время ---
    const cyc = t / CONFIG.cycleDuration;
    const phase = cyc - Math.floor(cyc); // 0..1

    /* === 1. Высота столбцов (бесконечный рост/коррекция) === */
    // Каждый столбец имеет своё целевое значение в зависимости от индекса
    // и текущей фазы цикла
    for (let i = 0; i < STATE.bars.length; i++) {
        const bar = STATE.bars[i];
        // Целевая высота зависит от позиции столбца и фазы цикла
        const targetScale = computeBarTarget(bar.index, phase);

        // Плавная интерполяция к целевому значению
        const lerpK = Math.min(1, dt * 4.0);
        bar.currentScale += (targetScale - bar.currentScale) * lerpK;

        bar.mesh.scale.y = Math.max(0.05, bar.currentScale);
        // Поднимаем столбец так, чтобы низ оставался на полу (pivot внизу)
        bar.mesh.position.y = (bar.currentScale) / 2;

        // Золотая "крышечка" на вершине: позиция в мировых координатах
        if (bar.cap) {
            // Cap находится на вершине столбца (currentScale/2 + halfCap = currentScale/2 + 0.06)
            bar.cap.position.y = bar.currentScale + 0.06;
            // Яркость кэпа пульсирует на пике цикла
            const capBright = 0.85 + 0.15 * Math.exp(-Math.pow((phase - CONFIG.climaxPhaseEnd) * 12, 2));
            bar.cap.material.opacity = capBright;
        }

        // Glow под столбцом
        const glowIntensity = 0.5 + 0.6 * (bar.currentScale / CONFIG.barMaxHeight);
        bar.glow.material.opacity = glowIntensity;
        // Цвет glow: фиолет→золото по высоте
        const ratio = bar.currentScale / CONFIG.barMaxHeight;
        bar.glow.material.color.lerpColors(
            new THREE.Color(CONFIG.violet),
            new THREE.Color(CONFIG.gold),
            Math.min(1, ratio)
        );
        // Размер glow увеличивается с высотой
        const glowScale = 1.0 + 0.4 * ratio;
        bar.glow.scale.set(glowScale, glowScale, glowScale);
    }

    /* === 2. Орбитальное кольцо: медленное вращение === */
    if (STATE.fontReady) {
        STATE.orbitGroup.rotation.y = t * CONFIG.orbitSpeed;
        // Лёгкое вертикальное колебание
        STATE.orbitGroup.position.y = CONFIG.orbitY + Math.sin(t * 0.3) * 0.04;
    }

    /* === 3. Световые кольца у основания: пульсация === */
    for (let i = 0; i < STATE.rings.length; i++) {
        const ring = STATE.rings[i];
        const k = 0.6 + 0.4 * Math.sin(t * 0.8 - i * 0.7);
        ring.material.opacity = (0.55 - i * 0.10) * k;
        // Лёгкое вращение
        ring.rotation.z = t * (0.05 - i * 0.015);
    }

    /* === 4. Камера: очень медленный zoom (2-3%) === */
    const zoomK = (t % CONFIG.zoomDuration) / CONFIG.zoomDuration;
    const zoomE = easeInOutSine(zoomK);
    const fov = CONFIG.cameraZoomIn + (CONFIG.cameraZoomOut - CONFIG.cameraZoomIn) * zoomE;
    if (STATE.camera.fov !== fov) {
        STATE.camera.fov = fov;
        STATE.camera.updateProjectionMatrix();
    }

    /* === 5. Кульминационная вспышка === */
    // На пике цикла (climaxPhaseEnd) — flash
    let flashIntensity = 0;
    if (phase > CONFIG.growPhaseEnd && phase < CONFIG.climaxPhaseEnd + 0.05) {
        const flashK = (phase - CONFIG.growPhaseEnd) / (CONFIG.climaxPhaseEnd - CONFIG.growPhaseEnd);
        const bell = Math.exp(-Math.pow((flashK - 0.5) * 4, 2));
        flashIntensity = bell * 0.65;
    } else if (STATE.flashPass.uniforms.uIntensity.value > 0) {
        flashIntensity = Math.max(0, STATE.flashPass.uniforms.uIntensity.value - dt * 0.5);
    }
    STATE.flashPass.uniforms.uIntensity.value = flashIntensity;

    /* === 6. Bloom: пульсация вместе с циклом === */
    const bloomBase = CONFIG.bloomStrength;
    const bloomPulse = bloomBase + 0.4 * Math.exp(-Math.pow((phase - CONFIG.climaxPhaseEnd) * 8, 2));
    STATE.bloomPass.strength += (bloomPulse - STATE.bloomPass.strength) * Math.min(1, dt * 3.0);

    /* === 7. Сетка пола: лёгкое мерцание === */
    if (STATE.grid) {
        STATE.grid.material.opacity = 0.18 + 0.06 * Math.sin(t * 0.5);
    }

    if (STATE.composer) STATE.composer.render(dt);
    else if (STATE.renderer) STATE.renderer.render(STATE.scene, STATE.camera);
}

/**
 * Вычисляет целевую высоту столбца для текущей фазы цикла.
 * Алгоритм:
 *  • Фаза роста (0 → growPhaseEnd): столбцы появляются один за другим,
 *    высота растёт слева направо до кульминации
 *  • Фаза кульминации: максимальная высота
 *  • Фаза коррекции: высота уменьшается (последние уходят первыми)
 *  • Фаза паузы: минимальная высота
 */
function computeBarTarget(index, phase) {
    const N = CONFIG.barCount;
    const i01 = index / (N - 1); // 0..1

    // === Фаза роста: каждый столбец появляется последовательно ===
    // Появление: столбец i становится видимым при phase = (i / N) * growPhaseEnd
    const appearPhase = i01 * CONFIG.growPhaseEnd;
    const growDuration = 0.20; // 20% цикла на рост одного столбца
    let grow = 0;
    if (phase >= appearPhase) {
        const localK = Math.min(1, (phase - appearPhase) / growDuration);
        grow = easeOutCubic(localK);
    }

    // Базовая высота при росте: восходящая (1 + i*0.18) — каждый следующий выше
    const growBaseHeight = 0.4 + i01 * (CONFIG.barMaxHeight - 0.4);
    const growHeight = CONFIG.barBaseHeight + grow * (growBaseHeight - CONFIG.barBaseHeight);

    // === Фаза коррекции: столбцы уменьшаются (последние первыми) ===
    let correct = 0;
    let correctHeight = CONFIG.barMaxHeight;
    if (phase > CONFIG.climaxPhaseEnd) {
        const correctK = (phase - CONFIG.climaxPhaseEnd) / (CONFIG.correctPhaseEnd - CONFIG.climaxPhaseEnd);
        // Каждый столбец начинает корректироваться последовательно (с конца)
        const startCorrect = i01 * 0.6; // последний начинает раньше
        const duration = 0.4;
        if (correctK >= startCorrect) {
            const localK = Math.min(1, (correctK - startCorrect) / duration);
            correct = easeInOutSine(localK);
        }
        // Высота уменьшается до базовой
        correctHeight = growBaseHeight + (CONFIG.barBaseHeight - growBaseHeight) * correct;
    }

    // === Пауза (последние 8% цикла) — все столбцы сжаты ===
    if (phase > CONFIG.correctPhaseEnd) {
        return CONFIG.barBaseHeight;
    }

    // === Композиция: в фазе роста используем growHeight, после кульминации — correctHeight ===
    if (phase <= CONFIG.climaxPhaseEnd) {
        return growHeight;
    } else {
        return correctHeight;
    }
}

/* ============================================================
 *  RESIZE / VISIBILITY
 * ============================================================ */
function onResize() {
    const container = document.getElementById('payd-hero-3d');
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const w = Math.max(2, Math.floor(rect.width));
    const h = Math.max(2, Math.floor(rect.height));
    if (w === STATE.width && h === STATE.height) return;
    STATE.width = w;
    STATE.height = h;
    STATE.camera.aspect = w / h;
    STATE.camera.updateProjectionMatrix();
    STATE.renderer.setSize(w, h);
    STATE.composer.setSize(w, h);
    if (STATE.bloomPass) STATE.bloomPass.setSize(w, h);
}

function setupVisibilityObserver() {
    const container = document.getElementById('payd-hero-3d');
    if (!container || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                if (!STATE.isVisible) {
                    STATE.isVisible = true;
                    STATE.lastTime = performance.now();
                    animate(STATE.lastTime);
                }
            } else {
                STATE.isVisible = false;
            }
        });
    }, { threshold: 0.01 });
    observer.observe(container);
}

// Fallback: setInterval если requestAnimationFrame не работает (headless)
function setupAnimationFallback() {
    // Каждые 33ms (~30fps) обновляем анимацию, если RAF не сработал
    setInterval(() => {
        if (STATE.isVisible && STATE.startTime > 0) {
            const now = performance.now();
            const dt = (now - STATE.lastTime) / 1000;
            // Если прошло больше 100ms с последнего RAF — RAF не работает
            if (dt > 0.1) {
                STATE.lastTime = now;
                animate(now);
            }
        }
    }, 33);
}

// Глобальный API для тестов: принудительный рендер кадра
window.__forceRender = function(seconds) {
    if (!STATE.startTime) {
        STATE.startTime = performance.now() - (seconds || 0) * 1000;
    } else {
        STATE.startTime = performance.now() - (seconds || 0) * 1000;
    }
    STATE.lastTime = performance.now();
    STATE.isVisible = true;
    if (STATE.composer) {
        STATE.composer.render(0.016);
    } else if (STATE.renderer) {
        STATE.renderer.render(STATE.scene, STATE.camera);
    }
};

/* ============================================================
 *  BOOT
 * ============================================================ */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

window.__heroPremium = STATE;
