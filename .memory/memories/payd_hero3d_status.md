# PAYD Finance Hero 3D — статус

## Что готово

### Файлы
- `public/js/hero-3d.js` (1037 строк) — главный модуль Three.js
  - Подключены: GLTFLoader, DRACOLoader, RGBELoader, FontLoader, TextGeometry, EffectComposer, UnrealBloomPass, OutputPass, RoomEnvironment
  - Реализован `loadAssets()` — параллельная загрузка GLB + HDRI + PBR-текстур с graceful fallback
  - Функции: `init()`, `animate()`, `setupPostProcessing()`, `swapToGLBLogo()`, `applyPBRTexturesToLogo()`
- `public/models/payd-logo.glb` (615 KB) — 7 мешей: ChromeCore, GunMetalShell, GlassCoating, GoldRing_0/1/2, NeonCore
- `public/models/payd-logo-fallback.glb` — резервная копия
- `public/textures/*.png` — 5 PBR-текстур 512×512:
  - chrome_normal.png, chrome_roughness.png
  - gold_normal.png, gold_metallic.png
  - gunmetal_normal.png

### Генераторы (Node.js)
- `scripts/generate-glb.js` — собирает GLB из процедурной геометрии с PBR-материалами
- `scripts/generate-pbr-textures.js` — генерирует PNG-текстуры через value-noise + FBM

## Конфигурация ассетов

```js
const ASSET_CONFIG = {
    logoGLB:    '/models/payd-logo.glb',
    logoGLBAlt: '/models/payd-logo-fallback.glb',
    hdri:       '/hdri/studio_small_09_1k.hdr',  // опционально
    textures: {
        chromeNormal:   '/textures/chrome_normal.png',
        chromeRough:    '/textures/chrome_roughness.png',
        goldNormal:     '/textures/gold_normal.png',
        goldMetallic:   '/textures/gold_metallic.png',
        gunMetalNormal: '/textures/gunmetal_normal.png'
    }
};
```

## Деплой

URL: https://nsjd8q0hsymr.space.minimax.io/

Verified в браузере:
- GLB загружается: `[Hero3D] GLB loaded: /models/payd-logo.glb children: 7`
- Подмена логотипа: `[Hero3D] Logo swapped to GLB model, scale: 0.647`
- 0 ошибок в консоли
- 3D-анимация видна и вращается

## Структура GLB (генерируется)

```json
{
  "asset": {"version": "2.0"},
  "scenes": [{"nodes": [0,1,2,3,4,5,6]}],
  "nodes": [7 нод, каждая ссылается на свой mesh],
  "meshes": [7 meshes],
  "materials": [
    {"name": "BlackChrome", "pbrMetallicRoughness": {...}},
    {"name": "GunMetal", ...},
    {"name": "Glass", ...},
    {"name": "Gold", ...},  // ×3 кольца
    {"name": "Neon", ...}
  ]
}
```

## Запуск регенерации

```bash
cd /workspace/scripts
node generate-glb.js           # пересоздать payd-logo.glb
node generate-pbr-textures.js  # пересоздать PBR-текстуры
node verify-glb-three.js       # проверить валидность через настоящий GLTFLoader
```