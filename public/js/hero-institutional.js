/**
 * PAYD Finance — Institutional Hero (Apple Vision Pro / OpenAI / Bloomberg grade)
 *
 * Кинематографическая заставка из 6 сцен:
 *   Сцена 1 — Тишина. Чёрный экран. Появляется тонкая baseline-линия (как в TradingView).
 *   Сцена 2 — Слева начинает строиться настоящий свечной график (японские свечи).
 *   Сцена 3 — График естественно растёт. Никаких резких скачков.
 *   Сцена 4 — Последняя зелёная свеча обновляет максимум → cinematic light flash
 *             (как отражение солнца на полированном металле).
 *   Сцена 5 — Здоровая коррекция: 3-4 красные свечи. Не обвал.
 *   Сцена 6 — Во время коррекции справа плавно выезжает "PAYD FINANCE"
 *             (Black Chrome / Dark Titanium / слегка золотые грани / violet rim glow).
 *   Финал  — Слева живой график (медленное движение), справа логотип.
 *             Минималистичная дорогая композиция.
 *
 * Запрещено: монеты, сферы, кольца, летающие свечи, 3D-кубы, NFT-стиль.
 * Вдохновение: Apple Vision Pro, OpenAI, TradingView, Bloomberg Terminal, Stripe.
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
    // --- Scene / Camera ---
    bgColor:        0x050507,
    fogColor:       0x050507,
    fogDensity:     0.012,
    cameraFOV:      42,
    cameraStart:    { x: -0.8, y: 0.0, z: 10.5 },  // начинаем левее, чтобы впустить график
    cameraLook:     { x: 0.0,  y: 0.0, z: 0  },
    cameraFinal:    { x: 0.0,  y: 0.0, z: 10.5 }, // к финалу камера мягко центрируется
    cameraMoveTime: 7.0,                            // время плавного движения камеры

    // --- Chart layout (TradingView-grade) ---
    chartBaseY:     0.0,       // baseline (y = 0)
    candleSpacing:  0.42,      // x distance between candle centers
    candleBodyW:    0.22,      // thin body (TradingView look)
    candleBodyH:    2.5,       // vertical scale factor (price → world units)
    candleDepth:    0.10,      // depth (front-to-back) — subtle, не толстый
    candleWickW:    0.012,     // очень тонкий фитиль
    chartSlope:     0.07,      // upward bias per candle
    chartLength:    16,        // total candle count
    chartStartX:    -3.2,      // leftmost candle x

    // --- Climax (Сцена 4) ---
    climaxCandleIdx: 12,       // кульминация на 13-й свече
    climaxDuration:  1.5,      // длительность вспышки
    climaxFlash:     3.6,      // bloom multiplier
    climaxFlashDecay: 1.6,

    // --- Correction (Сцена 5) ---
    correctionCount: 4,        // сколько красных свечей после кульминации

    // --- Timing ---
    candleRevealDelay: 0.32,   // секунд между появлениями свечей
    baselineFadeTime:  0.8,    // время появления baseline
    baselineHoldTime:  0.5,    // пауза после baseline перед первой свечой
    candleRevealAnim:  0.32,   // анимация scale-in каждой свечи
    labelSlideTime:    2.2,    // время slide-in для PAYD FINANCE
    labelStartDelay:   0.4,    // пауза между кульминацией и стартом текста
    scene0Duration:    0.6,    // Scene 1: silence до начала baseline

    // --- Living chart (Финал) ---
    finalHoverAmp:    0.004,   // амплитуда живого hover после финала
    finalHoverSpeed:  0.45,

    // --- Colors (TradingView палитра + золото/фиолет из референса) ---
    bullBody:       0x16C784,  // TradingView green
    bullWick:       0x16C784,
    bearBody:       0xEA3943,  // TradingView red
    bearWick:       0xEA3943,
    baselineColor:  0x2A2A35,  // едва заметная серая baseline
    accent:         0xD0A24C,  // доминирующее золото (как в референсе rgb 208,162,76)
    accentEdge:     0xF0D080,  // яркое золото для rim
    violetRim:      0x7040B8,  // насыщенный фиолетовый (как в референсе rgb 112,64,184)
    violetDeep:     0x4A1F8C,  // глубокий фиолет для ambient
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
    candleGroup: null,
    labelGroup: null,
    plate: null,
    gridLines: [],

    candles: [],        // { body, wick, dir, bodyCenterY, bodyHeight, wickCenterY, wickHeight, isClimax, revealed, revealStart }
    label: null,
    labelMaterial: null,

    rafId: null,
    startTime: 0,
    lastTime: 0,
    elapsed: 0,
    width: 0,
    height: 0,
    dpr: 1,

    isVisible: true,
    isAutomated: false,
    isLowEnd: false,

    bloomStrengthBase: 0.85,
    bloomStrengthCurrent: 0.85,
};

/* ============================================================
 *  PERF / CONTEXT GUARDS
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
        console.warn('[HeroInst] Container #payd-hero-3d not found');
        return;
    }

    const ctx = detectContext();
    STATE.isAutomated = ctx.isAutomated;
    STATE.isLowEnd = ctx.isLowEnd || ctx.isAutomated;

    // DPR — keep high enough for sharp candles, cap for perf
    STATE.dpr = Math.min(window.devicePixelRatio || 1, ctx.isLowEnd ? 1.25 : 1.75);

    const rect = container.getBoundingClientRect();
    STATE.width  = Math.max(2, Math.floor(rect.width));
    STATE.height = Math.max(2, Math.floor(rect.height));

    // === Scene ===
    STATE.scene = new THREE.Scene();
    STATE.scene.background = new THREE.Color(CONFIG.bgColor);
    STATE.scene.fog = new THREE.FogExp2(CONFIG.fogColor, CONFIG.fogDensity);

    // === Camera ===
    STATE.camera = new THREE.PerspectiveCamera(CONFIG.cameraFOV, STATE.width / STATE.height, 0.1, 60);
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
    STATE.renderer.toneMappingExposure = 1.05;
    STATE.renderer.shadowMap.enabled = !ctx.isLowEnd;
    if (STATE.renderer.shadowMap.enabled) {
        STATE.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    container.appendChild(STATE.renderer.domElement);

    // === Environment (IBL) for PBR reflections ===
    try {
        const pmrem = new THREE.PMREMGenerator(STATE.renderer);
        const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
        STATE.scene.environment = envRT.texture;
        pmrem.dispose();
    } catch (e) {
        // RoomEnvironment may not be available — fall back to flat lighting
    }

    // === Lights ===
    setupLights();

    // === Chart plate (faint baseline) ===
    buildChartPlate();

    // === Candles (hidden until revealed) ===
    buildCandles();

    // === PAYD FINANCE text ===
    buildPaydLabel();

    // === Post-processing ===
    setupPostProcessing();

    // === Events ===
    window.addEventListener('resize', onResize);
    setupVisibilityObserver();

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
    console.log('[HeroInst] Initialized. Mode:', ctx.isLowEnd ? 'low-end' : 'full',
                'DPR:', STATE.dpr, 'Size:', STATE.width, 'x', STATE.height);
    animate(STATE.startTime);
}

/* ============================================================
 *  LIGHTS — HDR-style, soft rim, ambient, key
 * ============================================================ */
function setupLights() {
    // --- Ambient base: глубокий фиолетовый (как в референсе) ---
    const ambient = new THREE.AmbientLight(CONFIG.violetDeep, 0.55);
    STATE.scene.add(ambient);

    // --- Key light: тёплый золотой сверху-слева (как солнце на полированном металле) ---
    const key = new THREE.DirectionalLight(CONFIG.accent, 1.6);
    key.position.set(-4, 6, 5);
    key.castShadow = !STATE.isLowEnd;
    if (key.castShadow) {
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.camera.near = 0.5;
        key.shadow.camera.far = 30;
        key.shadow.camera.left = -8;
        key.shadow.camera.right = 8;
        key.shadow.camera.top = 4;
        key.shadow.camera.bottom = -4;
        key.shadow.bias = -0.0008;
    }
    STATE.scene.add(key);

    // --- Rim light: насыщенный фиолетовый сзади-справа ---
    const rim = new THREE.DirectionalLight(CONFIG.violetRim, 1.5);
    rim.position.set(5, 1.5, -4);
    STATE.scene.add(rim);

    // --- Fill: тёплое золото снизу-справа для объёма ---
    const fill = new THREE.DirectionalLight(0x6A4F2A, 0.45);
    fill.position.set(2, -3, 2);
    STATE.scene.add(fill);

    // --- Institutional spot: мягкий золотой сверху над графиком ---
    const spot = new THREE.SpotLight(0xF0D080, 2.2, 18, Math.PI / 5, 0.6, 1.4);
    spot.position.set(0, 6.5, 3);
    spot.target.position.set(0, 0, 0);
    STATE.scene.add(spot);
    STATE.scene.add(spot.target);

    // --- Point light: фиолетовый за текстом для purple glow эффекта ---
    const violetPoint = new THREE.PointLight(CONFIG.violetRim, 1.4, 12, 1.6);
    violetPoint.position.set(3.5, 0.5, 2.5);
    STATE.scene.add(violetPoint);
}

/* ============================================================
 *  BASELINE — одна тонкая горизонтальная линия (как в TradingView)
 *  Появляется первой в Сцене 1.
 * ============================================================ */
function buildChartPlate() {
    STATE.candleGroup = new THREE.Group();
    STATE.scene.add(STATE.candleGroup);

    // Тонкая горизонтальная baseline — сначала невидима (fade-in в Сцене 1)
    const baselineGeom = new THREE.BoxGeometry(7.4, 0.008, 0.04);
    const baselineMat = new THREE.MeshBasicMaterial({
        color: CONFIG.baselineColor,
        transparent: true,
        opacity: 0.0,
    });
    STATE.baseline = new THREE.Mesh(baselineGeom, baselineMat);
    STATE.baseline.position.set(0, CONFIG.chartBaseY, 0);
    STATE.scene.add(STATE.baseline);

    // Тонкий tick marker справа (как у TradingView/Bloomberg — текущая цена)
    const tickGeom = new THREE.BoxGeometry(0.015, 0.10, 0.04);
    const tickMat = new THREE.MeshBasicMaterial({
        color: CONFIG.baselineColor,
        transparent: true,
        opacity: 0.0,
    });
    STATE.priceTick = new THREE.Mesh(tickGeom, tickMat);
    STATE.priceTick.position.set(3.7, CONFIG.chartBaseY, 0);
    STATE.scene.add(STATE.priceTick);
}

/* ============================================================
 *  CANDLES — realistic bodies + thin wicks
 * ============================================================ */
function buildCandles() {
    // Generate price path: 18 candles, gentle uptrend, one climax, three corrective reds
    const closes = [];
    let price = 1.0;
    for (let i = 0; i < CONFIG.chartLength; i++) {
        // Up-trend bias with small noise
        const trend = CONFIG.chartSlope * (0.6 + Math.random() * 0.6);
        const noise = (Math.random() - 0.5) * 0.22;
        let delta = trend + noise;
        // Climax candle: a long bullish bar
        if (i === CONFIG.climaxCandleIdx) {
            delta = 0.85;
        }
        // After climax: 3 corrective red candles
        if (i > CONFIG.climaxCandleIdx && i <= CONFIG.climaxCandleIdx + 3) {
            delta = -0.18 - Math.random() * 0.08;
        }
        price += delta;
        closes.push(price);
    }

    for (let i = 0; i < CONFIG.chartLength; i++) {
        const dir = i === 0
            ? (closes[0] >= 1.0 ? 'bull' : 'bear')
            : (closes[i] >= closes[i - 1] ? 'bull' : 'bear');

        const open  = i === 0 ? 1.0 : closes[i - 1];
        const close = closes[i];
        // Wick extends a bit above/below the body
        const bodyTop    = Math.max(open, close);
        const bodyBot    = Math.min(open, close);
        const wickHigh   = bodyTop + 0.08 + Math.random() * 0.05;
        const wickLow    = bodyBot - 0.08 - Math.random() * 0.05;

        const x = CONFIG.chartStartX + i * CONFIG.candleSpacing;
        const bodyHeight = Math.max(0.08, (bodyTop - bodyBot) * CONFIG.candleBodyH);
        const bodyCenterY = CONFIG.chartBaseY + ((bodyTop + bodyBot) / 2 - 1.0) * CONFIG.candleBodyH;

        const color = dir === 'bull' ? CONFIG.bullBody : CONFIG.bearBody;
        const wickColor = dir === 'bull' ? CONFIG.bullWick : CONFIG.bearWick;

        // --- Body (PBR — slight metallic for that "polished" look + emissive glow) ---
        const bodyGeom = new THREE.BoxGeometry(CONFIG.candleBodyW, bodyHeight, CONFIG.candleBodyW * 0.55);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: color,
            metalness: 0.25,
            roughness: 0.35,
            emissive: color,
            emissiveIntensity: 0.45,        // заметнее свечение
            envMapIntensity: 1.2,
        });
        const body = new THREE.Mesh(bodyGeom, bodyMat);
        body.position.set(x, bodyCenterY, 0);
        body.castShadow = !STATE.isLowEnd;
        body.visible = false;
        STATE.candleGroup.add(body);

        // --- Wick (thin cylinder, glowing) ---
        const wickHeight = (wickHigh - wickLow) * CONFIG.candleBodyH;
        const wickCenterY = CONFIG.chartBaseY + ((wickHigh + wickLow) / 2 - 1.0) * CONFIG.candleBodyH;
        const wickGeom = new THREE.CylinderGeometry(CONFIG.candleWickW, CONFIG.candleWickW, wickHeight, 8);
        const wickMat = new THREE.MeshStandardMaterial({
            color: wickColor,
            metalness: 0.0,
            roughness: 0.5,
            emissive: wickColor,
            emissiveIntensity: 0.55,        // ярче
        });
        const wick = new THREE.Mesh(wickGeom, wickMat);
        wick.position.set(x, wickCenterY, 0);
        wick.visible = false;
        STATE.candleGroup.add(wick);

        STATE.candles.push({
            index: i,
            x: x,
            body: body,
            wick: wick,
            dir: dir,
            bodyCenterY: bodyCenterY,
            bodyHeight: bodyHeight,
            wickCenterY: wickCenterY,
            wickHeight: wickHeight,
            isClimax: i === CONFIG.climaxCandleIdx,
            revealed: false,
        });
    }
}

/* ============================================================
 *  PAYD FINANCE — Black Chrome / Dark Titanium label
 * ============================================================ */
function buildPaydLabel() {
    STATE.labelGroup = new THREE.Group();
    STATE.labelGroup.visible = false;
    STATE.labelGroup.position.set(4.5, 0.2, 0.4); // starts off-screen to the right
    STATE.scene.add(STATE.labelGroup);

    // Material: премиальный металл с золотом и фиолетом
    // (как в референсе — градиент silver/gold → violet, с clearcoat)
    const labelMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x2A2014,            // тёплый тёмный graphite (не чёрный)
        metalness: 0.95,            // максимальная металличность
        roughness: 0.12,            // гладкий полированный
        clearcoat: 1.0,
        clearcoatRoughness: 0.04,   // идеальный лак
        envMapIntensity: 2.2,       // усиленные отражения
        emissive: CONFIG.accent,    // золотой внутренний glow
        emissiveIntensity: 0.18,    // заметный тёплый glow
        sheen: 1.0,                 // шелковистый фиолетовый блик
        sheenColor: CONFIG.violetRim,
        sheenRoughness: 0.4,
    });
    STATE.labelMaterial = labelMaterial;

    // Try to load a font; if it fails, fall back to simple geometry-less label
    const loader = new FontLoader();
    loader.load(
        'https://unpkg.com/three@0.160.0/examples/fonts/helvetiker_bold.typeface.json',
        (font) => {
            const geom = new TextGeometry('PAYD FINANCE', {
                font: font,
                size: 0.34,               // чуть крупнее для большей выразительности
                height: 0.12,             // глубина — более объёмный 3D
                curveSegments: 18,        // более гладкие кривые
                bevelEnabled: true,
                bevelThickness: 0.022,    // жирнее фаска
                bevelSize: 0.016,         // шире фаска
                bevelOffset: 0,
                bevelSegments: 8,         // больше сегментов для гладкости
            });
            geom.computeBoundingBox();
            const bb = geom.boundingBox;
            const w = bb.max.x - bb.min.x;
            geom.translate(-w / 2, 0, 0);
            geom.center();

            const text = new THREE.Mesh(geom, labelMaterial);
            text.castShadow = !STATE.isLowEnd;
            STATE.labelGroup.add(text);

            // Violet rim glow — фиолетовое свечение по контуру
            const glowMat = new THREE.MeshBasicMaterial({
                color: CONFIG.violetRim,
                transparent: true,
                opacity: 0.0,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.BackSide,
            });
            const glow = new THREE.Mesh(geom.clone(), glowMat);
            glow.scale.set(1.06, 1.12, 1.22);
            STATE.labelGroup.add(glow);
            STATE.labelGlow = glow;

            // Gold edge — тонкая золотая линия по контуру (видна после появления)
            const edgeMat = new THREE.MeshBasicMaterial({
                color: CONFIG.accentEdge,
                transparent: true,
                opacity: 0.0,
                blending: THREE.AdditiveBlending,
                depthWrite: false,
                side: THREE.BackSide,
            });
            const edge = new THREE.Mesh(geom.clone(), edgeMat);
            edge.scale.set(1.014, 1.028, 1.07);
            STATE.labelGroup.add(edge);
            STATE.labelEdge = edge;

            // Animate label slide-in once the climax has played
            STATE.labelReady = true;
        },
        undefined,
        (err) => {
            console.warn('[HeroInst] Font load failed, using fallback', err);
            buildFallbackLabel();
        }
    );
}

function buildFallbackLabel() {
    // Use a simple extruded plane + canvas texture for the text if the font fails
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1B1B22';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#E8C77A';
    ctx.font = 'bold 110px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PAYD FINANCE', canvas.width / 2, canvas.height / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshPhysicalMaterial({
        map: tex,
        metalness: 0.95,
        roughness: 0.2,
        clearcoat: 1,
        clearcoatRoughness: 0.1,
        envMapIntensity: 1.4,
    });
    const geom = new THREE.PlaneGeometry(5, 1.25);
    const mesh = new THREE.Mesh(geom, mat);
    STATE.labelGroup.add(mesh);
    STATE.labelMaterial = mat;
    STATE.labelReady = true;
}

/* ============================================================
 *  POST-PROCESSING — Bloom + custom light-burst flash
 * ============================================================ */
function setupPostProcessing() {
    STATE.composer = new EffectComposer(STATE.renderer);
    STATE.composer.setPixelRatio(STATE.dpr);
    STATE.composer.setSize(STATE.width, STATE.height);

    const renderPass = new RenderPass(STATE.scene, STATE.camera);
    STATE.composer.addPass(renderPass);

    // Bloom — премиальное свечение (как в референсе — насыщенное золото/фиолет)
    STATE.bloomPass = new UnrealBloomPass(
        new THREE.Vector2(STATE.width, STATE.height),
        0.85,                      // strength — заметнее, как в референсе
        0.65,                      // radius — мягкое рассеивание
        0.55                       // threshold — больше деталей попадает в bloom
    );
    STATE.bloomStrengthBase = 0.85;
    STATE.bloomStrengthCurrent = 0.85;

    // Custom flash overlay for the climax burst
    const flashShader = {
        uniforms: {
            tDiffuse: { value: null },
            uIntensity: { value: 0.0 },
            uTint: { value: new THREE.Color(0xFFF6E0) },
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
                // Cinematic radial vignette of warmth
                vec2 c = vUv - 0.5;
                float r = length(c) * 1.4;
                float falloff = smoothstep(1.05, 0.0, r);
                vec3 col = src.rgb + uTint * uIntensity * falloff * 0.55;
                // Soft global lift (very gentle)
                col += uTint * uIntensity * 0.10;
                gl_FragColor = vec4(col, src.a);
            }
        `,
    };
    STATE.flashPass = new ShaderPass(flashShader);
    STATE.composer.addPass(STATE.flashPass);

    const outputPass = new OutputPass();
    STATE.composer.addPass(outputPass);
}

/* ============================================================
 *  ANIMATION — кинематографический таймлайн (6 сцен)
 * ============================================================
 *  Scene 1  t < baselineStart  : тишина, чёрный экран
 *  Scene 2  baselineStart→End : fade-in тонкой baseline
 *  Scene 3  candles start      : последовательное появление свечей (зелёные/красные)
 *  Scene 4  climax candle      : финальная зелёная → cinematic light flash
 *  Scene 5  correction         : 3-4 красные свечи (здоровая коррекция)
 *  Scene 6  label slide        : плавный выезд PAYD FINANCE справа
 *  Final    t > labelEnd       : живой chart + статичный текст
 * ============================================================ */
function animate(now) {
    if (document.hidden || !STATE.isVisible) return;
    STATE.rafId = requestAnimationFrame(animate);

    const t  = (now - STATE.startTime) / 1000;
    const dt = Math.min((now - STATE.lastTime) / 1000, 0.05);
    STATE.lastTime = now;
    STATE.elapsed = t;

    /* ---------- Таймлайн (вычисляется один раз) ---------- */
    const scene0End          = CONFIG.scene0Duration;                                 // 0.6
    const baselineStart      = scene0End;                                              // 0.6
    const baselineEnd        = baselineStart + CONFIG.baselineFadeTime;               // 1.4
    const firstCandleAt      = baselineEnd + CONFIG.baselineHoldTime;                  // 1.9
    const climaxAt           = firstCandleAt + CONFIG.climaxCandleIdx * CONFIG.candleRevealDelay + CONFIG.candleRevealAnim; // кульминация полностью проявилась
    const flashStart         = climaxAt + 0.2;
    const flashEnd           = flashStart + CONFIG.climaxDuration;
    const labelStart         = climaxAt + CONFIG.labelStartDelay;                      // 0.4s после кульминации
    const labelEnd           = labelStart + CONFIG.labelSlideTime;
    const cameraMoveEnd      = CONFIG.cameraMoveTime;

    /* ---------- Scene 1: baseline fade-in ---------- */
    if (STATE.baseline) {
        if (t < baselineStart) {
            STATE.baseline.material.opacity = 0;
            if (STATE.priceTick) STATE.priceTick.material.opacity = 0;
        } else if (t < baselineEnd) {
            const k = (t - baselineStart) / CONFIG.baselineFadeTime;
            const e = 1 - Math.pow(1 - k, 3); // ease-out cubic
            STATE.baseline.material.opacity = 0.85 * e;
            if (STATE.priceTick) STATE.priceTick.material.opacity = 0.85 * e;
        } else {
            // Лёгкое "дыхание" baseline после появления
            const breathe = 0.85 + Math.sin(t * 0.6) * 0.05;
            STATE.baseline.material.opacity = breathe;
            if (STATE.priceTick) STATE.priceTick.material.opacity = breathe;
        }
    }

    /* ---------- Scene 2-5: candles ---------- */
    STATE.candles.forEach((c) => {
        const candleStart = firstCandleAt + c.index * CONFIG.candleRevealDelay;
        if (!c.revealed && t >= candleStart) {
            c.body.visible = true;
            c.wick.visible = true;
            c.revealed = true;
            c.body.scale.y = 0.05;
            c.wick.scale.y = 0.05;
            c.body.position.y = c.bodyCenterY - (c.bodyHeight * (1 - 0.05)) / 2;
            c.wick.position.y = c.wickCenterY - (c.wickHeight * (1 - 0.05)) / 2;
            c.revealStart = t;
        }

        if (c.revealed) {
            const localT = Math.min(1, (t - c.revealStart) / CONFIG.candleRevealAnim);
            // ease-out quart
            const e = 1 - Math.pow(1 - localT, 4);
            c.body.scale.y = 0.05 + 0.95 * e;
            c.wick.scale.y = 0.05 + 0.95 * e;
            c.body.position.y = c.bodyCenterY - (c.bodyHeight * (1 - c.body.scale.y)) / 2;
            c.wick.position.y = c.wickCenterY - (c.wickHeight * (1 - c.wick.scale.y)) / 2;

            // Живой hover (микро-движение) после появления
            if (localT >= 1) {
                const hover = Math.sin(t * 0.55 + c.index * 0.35) * 0.004;
                c.body.position.y = c.bodyCenterY + hover;
                c.wick.position.y = c.wickCenterY + hover;
            }

            /* ---------- Scene 4: climax flash ---------- */
            if (c.isClimax) {
                if (t >= flashStart && t < flashEnd) {
                    const k = (t - flashStart) / CONFIG.climaxDuration; // 0..1
                    // Bell curve: peak ~0.35
                    const bell = Math.exp(-Math.pow((k - 0.35) * 2.4, 2));
                    const burst = bell * CONFIG.climaxFlash;
                    c.body.material.emissiveIntensity = 0.45 + burst * 1.2;
                    c.wick.material.emissiveIntensity = 0.55 + burst * 1.4;
                    STATE.bloomStrengthCurrent = STATE.bloomStrengthBase + burst * 1.2;
                    STATE.flashPass.uniforms.uIntensity.value = Math.max(
                        STATE.flashPass.uniforms.uIntensity.value,
                        bell * 0.55
                    );
                } else if (t >= flashEnd) {
                    // Decay после кульминации
                    const dt2 = t - flashEnd;
                    const decay = Math.exp(-dt2 * CONFIG.climaxFlashDecay);
                    c.body.material.emissiveIntensity = 0.45 + decay * 0.7;
                    c.wick.material.emissiveIntensity = 0.55 + decay * 0.8;
                    STATE.bloomStrengthCurrent = STATE.bloomStrengthBase + decay * 0.5;
                    STATE.flashPass.uniforms.uIntensity.value = Math.max(
                        STATE.flashPass.uniforms.uIntensity.value,
                        decay * 0.20
                    );
                }
            }
        }
    });

    /* ---------- Decay flash overlay (всегда) ---------- */
    if (STATE.flashPass && STATE.flashPass.uniforms.uIntensity.value > 0) {
        STATE.flashPass.uniforms.uIntensity.value = Math.max(
            0, STATE.flashPass.uniforms.uIntensity.value - dt * 0.6
        );
    }

    /* ---------- Bloom smooth lerp ---------- */
    if (STATE.bloomPass) {
        STATE.bloomPass.strength += (STATE.bloomStrengthCurrent - STATE.bloomPass.strength) * Math.min(1, dt * 4.0);
    }

    /* ---------- Scene 6: label slide-in ---------- */
    if (STATE.labelReady && STATE.labelGroup) {
        if (t < labelStart) {
            STATE.labelGroup.visible = false;
        } else {
            STATE.labelGroup.visible = true;
            const lt = Math.min(1, (t - labelStart) / CONFIG.labelSlideTime);
            // ease-out cubic
            const e = 1 - Math.pow(1 - lt, 3);
            const startX = 4.8;
            const endX   = 1.9;
            STATE.labelGroup.position.x = startX + (endX - startX) * e;
            // Микро-вертикальный settle
            STATE.labelGroup.position.y = 0.2 + Math.sin(t * 0.4) * 0.012;

            // Edge / glow / emissive — плавно нарастают (заметнее, как в референсе)
            if (STATE.labelGlow) {
                STATE.labelGlow.material.opacity = 0.22 * e;
            }
            if (STATE.labelEdge) {
                STATE.labelEdge.material.opacity = 0.28 * e;
            }
            if (STATE.labelMaterial) {
                STATE.labelMaterial.emissiveIntensity = 0.08 + 0.10 * e;
            }
        }
    }

    /* ---------- Camera: плавный переход cameraStart → cameraFinal ---------- */
    if (t < cameraMoveEnd) {
        const k = t / cameraMoveEnd;
        const e = 1 - Math.pow(1 - k, 3); // ease-out cubic
        STATE.camera.position.x = CONFIG.cameraStart.x + (CONFIG.cameraFinal.x - CONFIG.cameraStart.x) * e;
        STATE.camera.position.y = CONFIG.cameraStart.y + (CONFIG.cameraFinal.y - CONFIG.cameraStart.y) * e;
        STATE.camera.position.z = CONFIG.cameraStart.z + (CONFIG.cameraFinal.z - CONFIG.cameraStart.z) * e;
    } else {
        // Микро-дыхание камеры (после завершения основного перехода)
        const breath = Math.sin(t * 0.18) * 0.03;
        STATE.camera.position.x = CONFIG.cameraFinal.x + breath;
        STATE.camera.position.y = CONFIG.cameraFinal.y;
        STATE.camera.position.z = CONFIG.cameraFinal.z;
    }
    STATE.camera.lookAt(CONFIG.cameraLook.x, CONFIG.cameraLook.y, CONFIG.cameraLook.z);

    if (STATE.composer) STATE.composer.render(dt);
    else if (STATE.renderer) STATE.renderer.render(STATE.scene, STATE.camera);
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

/* ============================================================
 *  BOOT
 * ============================================================ */
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

window.__heroInst = STATE;
