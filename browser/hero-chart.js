/**
 * PAYD Finance — Premium 3D Hero (TradingView-style)
 *
 * Концепция:
 *  - Реалистичный 3D-японский свечной график (как на TradingView / Binance)
 *  - Анимация: пустой экран → появление свечей слева направо → восходящий тренд
 *  - Пик: bloom-вспышка + lens flare
 *  - Коррекция: красные свечи плавно вниз
 *  - Затем справа выезжает объёмная надпись "PAYD FINANCE" (PBR)
 *  - Цикл: график продолжает строиться с живыми колебаниями
 *
 * Технологии:
 *  - Three.js r160 (ES modules + importmap)
 *  - PBR (MeshStandardMaterial)
 *  - EffectComposer + UnrealBloomPass
 *  - FontLoader + TextGeometry для надписи
 *  - 60 FPS, GPU acceleration
 */

import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ============================================================
 *                         CONSTANTS
 * ============================================================ */

const COLORS = {
    bgDeep:       0x09090B,
    bgMid:        0x0F0F14,
    green:        0x26A69A,   // TradingView classic bullish
    greenLight:   0x4ADE80,
    red:          0xEF5350,   // TradingView classic bearish
    redLight:     0xF87171,
    purple:       0x7C5CFF,
    purpleBright: 0x9D85FF,
    gold:         0xF3C94A,
    goldDark:     0x8C6F1F,
    chrome:       0x1A1A1D,
    titanium:     0x404048,
    white:        0xFFFFFF,
    gridLine:     0x1F1F26
};

const CONFIG = {
    // Количество свечей в буфере
    totalCandles: 80,
    visibleCandles: 28,        // сколько одновременно на экране
    // Геометрия свечи
    bodyWidth: 0.55,
    bodyDepth: 0.32,
    // Расстояние между свечами
    candleSpacing: 0.85,
    // Цена по Y
    priceScale: 0.08,          // множитель для перевода цены в мировые координаты
    basePrice: 0,              // сдвиг
    // Скорость анимации
    appearanceSpeed: 0.45,     // свечей в секунду
    peakTime: 14,              // секунд до пика
    peakFlashDuration: 1.4,
    correctionTime: 5,         // секунд на коррекцию
    titleAppearTime: 4,        // секунд на появление надписи
    cycleInterval: 0.7,        // секунд между новыми свечами в цикле
    // Тайминги
    phaseStart: 0,
    phase1Duration: 14,        // рост
    phase2Duration: 1.4,       // вспышка
    phase3Duration: 5,         // коррекция
    phase4Duration: 4,         // появление надписи
    phase5Duration: Infinity   // цикл
};

const STATE = {
    container: null,
    width: 0,
    height: 0,
    renderer: null,
    scene: null,
    camera: null,
    composer: null,
    bloomPass: null,
    chartGroup: null,
    titleGroup: null,
    flashLight: null,
    flashSphere: null,
    gridGroup: null,
    rafId: null,
    isVisible: true,
    isInView: false,
    startTime: 0,
    lastTime: 0,
    phase: 0,
    candles: [],              // массив созданных свечных мешей
    ohlcData: [],             // массив OHLC {o,h,l,c,index}
    appearedCount: 0,         // сколько свечей уже "нарисовано"
    peakReached: false,
    cycleCandleIdx: 0,        // индекс для циклических свечей
    titleAppeared: false,
    isMobile: false,
    isLowEnd: false,
    observer: null,
    titleFinalX: 5.5,         // финальная позиция надписи по X
    titleStartX: 16,          // начальная позиция (за экраном)
    cameraStart: { x: -3, y: 2.5, z: 13 },
    cameraLook: { x: 1, y: 1.5, z: 0 }
};

/* ============================================================
 *                     PERFORMANCE DETECT
 * ============================================================ */

function detectPerformance() {
    const ua = navigator.userAgent || '';
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    const lowCores = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4;
    const lowMem = navigator.deviceMemory && navigator.deviceMemory <= 4;
    return { isMobile, isLowEnd: isMobile || lowCores || lowMem };
}

/* ============================================================
 *                  OHLC DATA GENERATION
 *  Реалистичный восходящий тренд + пик + коррекция
 * ============================================================ */

function generateOHLC() {
    const candles = [];
    let price = 100;
    const peakIdx = 45;       // индекс пиковой свечи
    const correctionEnd = 65; // конец коррекции

    for (let i = 0; i < CONFIG.totalCandles; i++) {
        let open = price;
        let close, high, low;

        if (i < peakIdx) {
            // Восходящий тренд: постепенный рост
            const trend = 0.6 + Math.sin(i * 0.18) * 0.35;
            const noise = (Math.random() - 0.5) * 1.4;
            const move = trend + noise;
            close = open + move;
            // Изредка красная свеча во время роста
            if (Math.random() < 0.18) {
                close = open - (Math.random() * 1.2 + 0.3);
            }
        } else if (i === peakIdx) {
            // Пик: большая зелёная свеча с длинной тенью вверх
            close = open + 4.5;
        } else if (i < correctionEnd) {
            // Коррекция: падение
            const drop = -(0.4 + Math.random() * 1.6);
            close = open + drop;
            // Изредка отскок
            if (Math.random() < 0.2) {
                close = open + (Math.random() * 0.8);
            }
        } else {
            // Боковик/небольшой рост после коррекции (для цикла)
            const wobble = (Math.random() - 0.5) * 1.2;
            close = open + wobble;
        }

        close = Math.max(close, 5);
        high = Math.max(open, close) + Math.random() * 1.5 + 0.2;
        low  = Math.min(open, close) - Math.random() * 1.2 - 0.2;

        // Защита: low не ниже 0
        low = Math.max(low, 1);

        candles.push({ o: open, h: high, l: low, c: close, index: i });
        price = close;
    }

    return candles;
}

/* ============================================================
 *                  COORDINATE MAPPING
 * ============================================================ */

function priceToY(price) {
    return (price - 100) * CONFIG.priceScale;
}

function indexToX(i) {
    return i * CONFIG.candleSpacing;
}

/* ============================================================
 *                  CANDLE GEOMETRY
 * ============================================================ */

const bodyGeoCache = new Map();
function getBodyGeometry(width, height, depth) {
    const key = `${width.toFixed(3)}_${height.toFixed(3)}_${depth.toFixed(3)}`;
    if (bodyGeoCache.has(key)) return bodyGeoCache.get(key);
    const geo = new THREE.BoxGeometry(width, height, depth);
    bodyGeoCache.set(key, geo);
    return geo;
}

const wickGeoCache = new Map();
function getWickGeometry(height) {
    const key = `wick_${height.toFixed(3)}`;
    if (wickGeoCache.has(key)) return wickGeoCache.get(key);
    const geo = new THREE.BoxGeometry(0.06, height, 0.06);
    wickGeoCache.set(key, geo);
    return geo;
}

function createCandleMesh(ohlc) {
    const isBull = ohlc.c >= ohlc.o;
    const baseColor = isBull ? COLORS.green : COLORS.red;
    const emissiveColor = isBull ? COLORS.greenLight : COLORS.redLight;

    const bodyTop = priceToY(Math.max(ohlc.o, ohlc.c));
    const bodyBot = priceToY(Math.min(ohlc.o, ohlc.c));
    const bodyHeight = Math.max(bodyTop - bodyBot, 0.05);
    const bodyCenter = (bodyTop + bodyBot) / 2;

    const wickTop = priceToY(ohlc.h);
    const wickBot = priceToY(ohlc.l);
    const wickHeight = Math.max(wickTop - wickBot, 0.05);
    const wickCenter = (wickTop + wickBot) / 2;

    const group = new THREE.Group();

    // === Тело свечи ===
    const bodyGeo = getBodyGeometry(CONFIG.bodyWidth, bodyHeight, CONFIG.bodyDepth);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: baseColor,
        emissive: emissiveColor,
        emissiveIntensity: 0.18,
        metalness: 0.1,
        roughness: 0.55,
        transparent: true,
        opacity: 0
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = bodyCenter;
    group.add(body);

    // === Тень (wick) ===
    const wickGeo = getWickGeometry(wickHeight);
    const wickMat = new THREE.MeshBasicMaterial({
        color: baseColor,
        transparent: true,
        opacity: 0
    });
    const wick = new THREE.Mesh(wickGeo, wickMat);
    wick.position.y = wickCenter;
    group.add(wick);

    // === Тонкая обводка тела для премиального вида ===
    const edgesGeo = new THREE.EdgesGeometry(bodyGeo, 1);
    const edgesMat = new THREE.LineBasicMaterial({
        color: isBull ? COLORS.greenLight : COLORS.redLight,
        transparent: true,
        opacity: 0
    });
    const edges = new THREE.LineSegments(edgesGeo, edgesMat);
    edges.position.y = bodyCenter;
    edges.renderOrder = 1;
    group.add(edges);

    group.userData = {
        body, wick, edges,
        bodyMat, wickMat, edgesMat,
        isBull,
        ohlc,
        targetBodyOpacity: 0.95,
        targetWickOpacity: 0.85,
        targetEdgesOpacity: 0.45
    };

    return group;
}

/* ============================================================
 *                  CHART BACKGROUND GRID
 * ============================================================ */

function createGrid() {
    const group = new THREE.Group();
    const gridColor = COLORS.gridLine;
    const lineMat = new THREE.LineBasicMaterial({
        color: gridColor,
        transparent: true,
        opacity: 0.35
    });

    // Горизонтальные линии цен
    const priceLevels = [80, 90, 100, 110, 120, 130, 140];
    priceLevels.forEach((p) => {
        const y = priceToY(p);
        const points = [
            new THREE.Vector3(-15, y, -0.4),
            new THREE.Vector3(15, y, -0.4)
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geo, lineMat);
        group.add(line);
    });

    // Вертикальные линии времени
    for (let i = 0; i < 30; i++) {
        const x = -14 + i * 1;
        const points = [
            new THREE.Vector3(x, -8, -0.4),
            new THREE.Vector3(x, 10, -0.4)
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geo, lineMat);
        group.add(line);
    }

    // === Ось X (низ) ===
    const xAxisGeo = new THREE.BoxGeometry(30, 0.04, 0.04);
    const xAxisMat = new THREE.MeshBasicMaterial({ color: gridColor });
    const xAxis = new THREE.Mesh(xAxisGeo, xAxisMat);
    xAxis.position.set(0, -8, -0.3);
    group.add(xAxis);

    return group;
}

/* ============================================================
 *                  PEAK FLASH
 * ============================================================ */

function createFlashEffect() {
    const group = new THREE.Group();

    // === Яркая сферическая вспышка ===
    const flashGeo = new THREE.SphereGeometry(0.4, 32, 32);
    const flashMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    group.add(flash);
    STATE.flashSphere = flash;

    // === Внутреннее ядро (фиолетовое) ===
    const coreGeo = new THREE.SphereGeometry(0.25, 24, 24);
    const coreMat = new THREE.MeshBasicMaterial({
        color: COLORS.purpleBright,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    // === Точечный источник света для вспышки ===
    const flashLight = new THREE.PointLight(0xffffff, 0, 30, 1.5);
    flashLight.color.setHex(0xffffff);
    group.add(flashLight);
    STATE.flashLight = flashLight;

    // === Расходящиеся лучи (lens flare effect) ===
    const rayCount = 12;
    for (let i = 0; i < rayCount; i++) {
        const angle = (i / rayCount) * Math.PI * 2;
        const rayLength = 3 + Math.random() * 2;
        const rayGeo = new THREE.PlaneGeometry(rayLength, 0.08);
        const rayMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        const ray = new THREE.Mesh(rayGeo, rayMat);
        ray.rotation.z = angle;
        ray.position.z = 0.1;
        group.add(ray);
    }
    group.userData.rays = group.children.filter((c) => c.material && c.material.opacity === 0 && c !== flash && c !== core);

    group.userData.flashMat = flashMat;
    group.userData.coreMat = coreMat;
    group.userData.flashLight = flashLight;
    return group;
}

/* ============================================================
 *                  TITLE: PAYD FINANCE
 * ============================================================ */

function createTitle(font) {
    const group = new THREE.Group();
    group.position.set(STATE.titleStartX, 2.0, 0);

    // === "PAYD" — крупно, PBR ===
    const paydGeo = new TextGeometry('PAYD', {
        font: font,
        size: 1.6,
        height: 0.35,
        curveSegments: 6,
        bevelEnabled: true,
        bevelThickness: 0.04,
        bevelSize: 0.03,
        bevelOffset: 0,
        bevelSegments: 3
    });
    paydGeo.computeBoundingBox();
    const paydBb = paydGeo.boundingBox;
    const paydW = paydBb.max.x - paydBb.min.x;
    paydGeo.translate(-paydW / 2, 0, 0);

    const paydMat = new THREE.MeshStandardMaterial({
        color: COLORS.chrome,
        metalness: 0.95,
        roughness: 0.22,
        emissive: COLORS.purple,
        emissiveIntensity: 0.08,
        envMapIntensity: 1.8
    });
    const paydMesh = new THREE.Mesh(paydGeo, paydMat);
    paydMesh.position.y = 0.6;
    group.add(paydMesh);

    // === "FINANCE" — мелко, золотой ===
    const financeGeo = new TextGeometry('FINANCE', {
        font: font,
        size: 0.55,
        height: 0.12,
        curveSegments: 5,
        bevelEnabled: true,
        bevelThickness: 0.015,
        bevelSize: 0.012,
        bevelOffset: 0,
        bevelSegments: 2
    });
    financeGeo.computeBoundingBox();
    const finBb = financeGeo.boundingBox;
    const finW = finBb.max.x - finBb.min.x;
    financeGeo.translate(-finW / 2, 0, 0);

    const financeMat = new THREE.MeshStandardMaterial({
        color: COLORS.gold,
        metalness: 1.0,
        roughness: 0.25,
        emissive: COLORS.goldDark,
        emissiveIntensity: 0.35,
        envMapIntensity: 2.0
    });
    const financeMesh = new THREE.Mesh(financeGeo, financeMat);
    financeMesh.position.y = -0.6;
    group.add(financeMesh);

    // === Золотые рёбра на PAYD (EdgesGeometry) ===
    const paydEdgesGeo = new THREE.EdgesGeometry(paydGeo, 1);
    const paydEdgesMat = new THREE.LineBasicMaterial({
        color: COLORS.gold,
        transparent: true,
        opacity: 0.85
    });
    const paydEdges = new THREE.LineSegments(paydEdgesGeo, paydEdgesMat);
    paydEdges.position.y = 0.6;
    group.add(paydEdges);

    // === Фиолетовое свечение (outer glow) ===
    const glowGeo = new THREE.PlaneGeometry(paydW + 1.2, 3.5);
    const glowMat = new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(COLORS.purple) },
            uOpacity: { value: 0 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform vec3 uColor;
            uniform float uOpacity;
            varying vec2 vUv;
            void main() {
                vec2 c = vUv - 0.5;
                float d = length(c) * 2.0;
                float intensity = pow(1.0 - clamp(d, 0.0, 1.0), 2.5);
                gl_FragColor = vec4(uColor, intensity * uOpacity);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.set(0, 0, -0.6);
    glow.position.y = 0.4;
    group.add(glow);

    group.userData = {
        paydMesh, financeMesh, paydEdges, glow, glowMat,
        paydMat, financeMat, paydEdgesMat
    };

    return group;
}

/* ============================================================
 *                  SCENE SETUP
 * ============================================================ */

function createRenderer() {
    const renderer = new THREE.WebGLRenderer({
        antialias: !STATE.isLowEnd,
        alpha: true,
        powerPreference: 'high-performance',
        stencil: false
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, STATE.isLowEnd ? 1.5 : 2));
    renderer.setSize(STATE.width, STATE.height);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    return renderer;
}

function createScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.bgDeep);
    scene.fog = new THREE.FogExp2(COLORS.bgDeep, 0.025);
    return scene;
}

function createCamera() {
    const aspect = STATE.width / STATE.height;
    const camera = new THREE.PerspectiveCamera(36, aspect, 0.1, 100);
    camera.position.set(STATE.cameraStart.x, STATE.cameraStart.y, STATE.cameraStart.z);
    camera.lookAt(STATE.cameraLook.x, STATE.cameraLook.y, STATE.cameraLook.z);
    return camera;
}

function createLighting() {
    // Ambient
    STATE.scene.add(new THREE.AmbientLight(0x2a2540, 0.55));

    // Key light
    const key = new THREE.DirectionalLight(0xeae0ff, 0.7);
    key.position.set(5, 8, 6);
    STATE.scene.add(key);

    // Fill light
    const fill = new THREE.DirectionalLight(0xfff5d8, 0.3);
    fill.position.set(-4, 2, 4);
    STATE.scene.add(fill);

    // Rim purple
    const rim = new THREE.PointLight(COLORS.purple, 2.5, 18, 1.6);
    rim.position.set(-3, 1, -2.5);
    STATE.scene.add(rim);

    // Gold accent
    const gold = new THREE.PointLight(COLORS.gold, 1.4, 14, 1.8);
    gold.position.set(4, -1, 2);
    STATE.scene.add(gold);

    // Top
    const top = new THREE.DirectionalLight(0xffffff, 0.35);
    top.position.set(0, 6, 2);
    STATE.scene.add(top);
}

function createEnvironment() {
    try {
        const pmrem = new THREE.PMREMGenerator(STATE.renderer);
        const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        STATE.scene.environment = env;
        pmrem.dispose();
    } catch (e) {
        console.warn('[HeroChart] RoomEnvironment failed:', e.message);
    }
}

/* ============================================================
 *                  POST-PROCESSING
 * ============================================================ */

function setupPostProcessing() {
    STATE.composer = new EffectComposer(STATE.renderer);
    STATE.composer.setSize(STATE.width, STATE.height);

    STATE.composer.addPass(new RenderPass(STATE.scene, STATE.camera));

    STATE.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(STATE.width, STATE.height),
        0.75,    // strength
        0.85,    // radius
        0.55     // threshold
    );
    STATE.composer.addPass(STATE.bloomPass);

    STATE.composer.addPass(new OutputPass());
}

/* ============================================================
 *                  EVENT HANDLERS
 * ============================================================ */

function onResize() {
    if (!STATE.container) return;
    const rect = STATE.container.getBoundingClientRect();
    STATE.width = Math.max(rect.width, 320);
    STATE.height = Math.max(rect.height, 320);
    if (STATE.renderer) STATE.renderer.setSize(STATE.width, STATE.height);
    if (STATE.camera) {
        STATE.camera.aspect = STATE.width / STATE.height;
        STATE.camera.updateProjectionMatrix();
    }
    if (STATE.composer) STATE.composer.setSize(STATE.width, STATE.height);
}

function onVisibilityChange() {
    STATE.isVisible = !document.hidden;
    if (STATE.isVisible && !STATE.rafId) animate(performance.now());
}

function observeInView() {
    if (!STATE.container) return;
    const obs = new IntersectionObserver((entries) => {
        entries.forEach((entry) => { STATE.isInView = entry.isIntersecting; });
    }, { threshold: 0.05 });
    obs.observe(STATE.container);
    STATE.observer = obs;
}

/* ============================================================
 *                  ANIMATION TIMELINE
 * ============================================================ */

function getCurrentPhase(t) {
    if (t < CONFIG.phase1Duration) return 1;  // рост
    if (t < CONFIG.phase1Duration + CONFIG.phase2Duration) return 2;  // вспышка
    if (t < CONFIG.phase1Duration + CONFIG.phase2Duration + CONFIG.phase3Duration) return 3;  // коррекция
    if (t < CONFIG.phase1Duration + CONFIG.phase2Duration + CONFIG.phase3Duration + CONFIG.phase4Duration) return 4;  // надпись
    return 5;  // цикл
}

function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function updateCandleAppearance(t, dt) {
    // === Фаза 1: появление свечей слева направо ===
    if (STATE.phase === 1) {
        const targetCount = Math.floor(t / (1 / CONFIG.appearanceSpeed)) + 1;
        const newCount = Math.min(targetCount, CONFIG.totalCandles);
        if (newCount > STATE.appearedCount) {
            for (let i = STATE.appearedCount; i < newCount; i++) {
                const candle = STATE.candles[i];
                if (candle) {
                    STATE.appearedCount = i + 1;
                }
            }
        }
    }
    // === Фаза 5: циклические новые свечи ===
    else if (STATE.phase === 5) {
        const cycleCandles = STATE.ohlcData.slice(65);
        if (cycleCandles.length > 0) {
            const cycleT = t - (CONFIG.phase1Duration + CONFIG.phase2Duration + CONFIG.phase3Duration + CONFIG.phase4Duration);
            const newCount = Math.floor(cycleT / CONFIG.cycleInterval);
            if (newCount > STATE.cycleCandleIdx) {
                STATE.cycleCandleIdx = Math.min(newCount, cycleCandles.length);
            }
        }
    }

    // === Анимация opacity каждой видимой свечи ===
    for (let i = 0; i < STATE.appearedCount; i++) {
        const candle = STATE.candles[i];
        if (!candle) continue;
        const ud = candle.userData;
        // Плавное появление
        const targetO = ud.targetBodyOpacity;
        const targetW = ud.targetWickOpacity;
        const targetE = ud.targetEdgesOpacity;
        ud.bodyMat.opacity += (targetO - ud.bodyMat.opacity) * 0.12;
        ud.wickMat.opacity += (targetW - ud.wickMat.opacity) * 0.12;
        ud.edgesMat.opacity += (targetE - ud.edgesMat.opacity) * 0.12;
    }

    // === Цикл: добавление новых свечей в правый край ===
    if (STATE.phase === 5) {
        const baseAppeared = STATE.appearedCount;
        const cycleAdded = STATE.cycleCandleIdx;
        for (let i = 0; i < cycleAdded; i++) {
            const targetIdx = 65 + i;
            if (targetIdx < STATE.candles.length) {
                STATE.candles[targetIdx].userData.targetBodyOpacity = 0.95;
                STATE.candles[targetIdx].userData.targetWickOpacity = 0.85;
                STATE.candles[targetIdx].userData.targetEdgesOpacity = 0.45;
                STATE.appearedCount = Math.max(STATE.appearedCount, targetIdx + 1);
            }
        }
    }
}

function updateChartScroll(t) {
    if (!STATE.chartGroup) return;

    // === Прокрутка графика (камера остаётся, а график движется влево) ===
    if (STATE.phase === 1) {
        // Мягкий сдвиг, чтобы новые свечи появлялись в зоне видимости
        const targetScrollX = -Math.max(0, (STATE.appearedCount - 18) * CONFIG.candleSpacing) * 0.3;
        STATE.chartGroup.position.x += (targetScrollX - STATE.chartGroup.position.x) * 0.04;
    } else if (STATE.phase === 5) {
        // Плавная прокрутка влево для имитации живого рынка
        const cycleT = t - (CONFIG.phase1Duration + CONFIG.phase2Duration + CONFIG.phase3Duration + CONFIG.phase4Duration);
        const scrollSpeed = 0.04;
        STATE.chartGroup.position.x = -Math.max(0, (cycleT - 5)) * scrollSpeed;
    } else {
        // Фазы 2-4: фиксируем позицию на пике
        const peakIdx = 45;
        const targetScrollX = -Math.max(0, (peakIdx - 18) * CONFIG.candleSpacing) * 0.3;
        STATE.chartGroup.position.x += (targetScrollX - STATE.chartGroup.position.x) * 0.05;
    }
}

function updatePeakFlash(t) {
    if (STATE.phase !== 2 || !STATE.flashSphere) return;

    const peakT = t - CONFIG.phase1Duration;
    const flashDuration = CONFIG.peakFlashDuration;
    const ud = STATE.flashSphere.parent.userData;

    // === Позиция вспышки — на пиковой свече ===
    const peakIdx = 45;
    const peakCandle = STATE.candles[peakIdx];
    if (peakCandle) {
        const peakX = indexToX(peakIdx) + STATE.chartGroup.position.x;
        const peakY = priceToY(peakCandle.userData.ohlc.h) + 0.5;
        STATE.flashSphere.parent.position.set(peakX, peakY, 1.5);
    }

    // === Анимация вспышки: нарастание → пик → затухание ===
    const norm = peakT / flashDuration;
    let intensity = 0;
    if (norm < 0.3) {
        intensity = norm / 0.3;  // нарастание
    } else if (norm < 0.5) {
        intensity = 1.0;  // пик
    } else {
        intensity = Math.max(0, 1.0 - (norm - 0.5) / 0.5);  // затухание
    }

    ud.flashMat.opacity = intensity * 1.0;
    ud.coreMat.opacity = intensity * 0.85;
    ud.flashLight.intensity = intensity * 12;

    // === Масштаб сфер ===
    const scale = 0.5 + intensity * 3.5;
    STATE.flashSphere.scale.setScalar(scale);
    ud.coreMat && (STATE.flashSphere.parent.children[1].scale.setScalar(scale * 0.7));

    // === Лучи (lens flare) — расходятся во все стороны ===
    const rays = STATE.flashSphere.parent.userData.rays;
    if (rays) {
        rays.forEach((ray, i) => {
            const angle = (i / rays.length) * Math.PI * 2;
            const rayScale = 0.5 + intensity * 4;
            ray.scale.set(rayScale, 1, 1);
            ray.rotation.z = angle + t * 0.5;
            ray.material.opacity = intensity * 0.7;
            // Раздвигаем лучи от центра
            const dist = intensity * 1.5;
            ray.position.x = Math.cos(angle) * dist;
            ray.position.y = Math.sin(angle) * dist;
        });
    }
}

function updateTitle(t) {
    if (!STATE.titleGroup) return;

    // === Фаза 4: появление надписи ===
    const phase4Start = CONFIG.phase1Duration + CONFIG.phase2Duration + CONFIG.phase3Duration;
    const phase4T = t - phase4Start;
    const phase4Duration = CONFIG.phase4Duration;

    if (t >= phase4Start) {
        const norm = Math.min(1, phase4T / phase4Duration);
        const eased = easeInOutQuad(norm);

        // Позиция: из-за экрана → финальная
        const startX = STATE.titleStartX;
        const endX = STATE.titleFinalX;
        STATE.titleGroup.position.x = startX + (endX - startX) * eased;

        // Прозрачность: 0 → 1
        const ud = STATE.titleGroup.userData;
        ud.glowMat.uniforms.uOpacity.value = eased * 0.9;
        ud.paydMat.emissiveIntensity = 0.08 + eased * 0.18;
        ud.financeMat.emissiveIntensity = 0.35 + eased * 0.3;

        if (norm >= 0.99) {
            STATE.titleAppeared = true;
        }

        // Лёгкое покачивание
        STATE.titleGroup.position.y = 2.0 + Math.sin(t * 0.6) * 0.08;
        STATE.titleGroup.rotation.y = Math.sin(t * 0.4) * 0.04;
    }
}

function updateCamera(t) {
    if (!STATE.camera) return;

    // === Лёгкое движение камеры в фазе 5 (цикл) ===
    if (STATE.phase === 5) {
        const cycleT = t - (CONFIG.phase1Duration + CONFIG.phase2Duration + CONFIG.phase3Duration + CONFIG.phase4Duration);
        // Слегка поворачиваем камеру для живости
        STATE.camera.position.x = STATE.cameraStart.x + Math.sin(cycleT * 0.1) * 0.5;
        STATE.camera.position.y = STATE.cameraStart.y + Math.sin(cycleT * 0.15) * 0.2;
        STATE.camera.lookAt(STATE.cameraLook.x, STATE.cameraLook.y, STATE.cameraLook.z);
    }
}

/* ============================================================
 *                  ANIMATE LOOP
 * ============================================================ */

function animate(now) {
    STATE.rafId = requestAnimationFrame(animate);
    if (!STATE.isVisible || !STATE.isInView) {
        STATE.rafId = null;
        return;
    }

    const t = (now - STATE.startTime) / 1000;
    const dt = (now - STATE.lastTime) / 1000;
    STATE.lastTime = now;
    STATE.phase = getCurrentPhase(t);

    updateCandleAppearance(t, dt);
    updateChartScroll(t);
    updatePeakFlash(t);
    updateTitle(t);
    updateCamera(t);

    if (STATE.composer) {
        STATE.composer.render();
    } else if (STATE.renderer) {
        STATE.renderer.render(STATE.scene, STATE.camera);
    }
}

/* ============================================================
 *                  INIT
 * ============================================================ */

async function init() {
    const container = document.getElementById('payd-hero-3d');
    if (!container) {
        console.warn('[HeroChart] Container #payd-hero-3d not found');
        return;
    }
    STATE.container = container;

    // === Детект производительности ===
    const perf = detectPerformance();
    STATE.isMobile = perf.isMobile;
    STATE.isLowEnd = perf.isLowEnd;
    if (STATE.isLowEnd) {
        CONFIG.totalCandles = 60;
        CONFIG.appearanceSpeed = 0.55;
    }

    onResize();
    STATE.renderer = createRenderer();
    container.appendChild(STATE.renderer.domElement);
    STATE.scene = createScene();
    STATE.camera = createCamera();

    createLighting();
    createEnvironment();

    // === Сетка (фон графика) ===
    STATE.gridGroup = createGrid();
    STATE.scene.add(STATE.gridGroup);

    // === OHLC данные ===
    STATE.ohlcData = generateOHLC();

    // === Свечи ===
    STATE.chartGroup = new THREE.Group();
    for (let i = 0; i < STATE.ohlcData.length; i++) {
        const ohlc = STATE.ohlcData[i];
        const candle = createCandleMesh(ohlc);
        candle.position.x = indexToX(i);
        STATE.candles.push(candle);
        STATE.chartGroup.add(candle);
    }
    STATE.scene.add(STATE.chartGroup);

    // === Вспышка пика (изначально скрыта) ===
    const flashGroup = createFlashEffect();
    flashGroup.visible = false;
    STATE.scene.add(flashGroup);

    // === Надпись PAYD FINANCE (создаётся после загрузки шрифта) ===
    const fontLoader = new FontLoader();
    fontLoader.load(
        'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json',
        (font) => {
            STATE.titleGroup = createTitle(font);
            STATE.titleGroup.visible = false;
            STATE.scene.add(STATE.titleGroup);
            console.log('[HeroChart] Title ready');
        },
        undefined,
        (err) => {
            console.warn('[HeroChart] Font load error:', err.message);
        }
    );

    setupPostProcessing();

    // === События ===
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', onVisibilityChange);
    observeInView();

    // === Показываем вспышку перед её фазой ===
    STATE.scene.traverse((obj) => {
        if (obj.userData && obj.userData.flashMat) {
            obj.visible = true;
        }
    });
    flashGroup.visible = true;
    STATE.titleGroup && (STATE.titleGroup.visible = true);

    // === Запуск анимации ===
    STATE.startTime = performance.now();
    STATE.lastTime = STATE.startTime;
    animate(STATE.startTime);

    console.log('[HeroChart] Initialized with', STATE.ohlcData.length, 'candles');
}

// Авто-инициализация
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
} else {
    init();
}