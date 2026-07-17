// Симуляция потока данных от JSON до UI

const fs = require('fs');

console.log('===== ТРАССИРОВКА ПОТОКА ДАННЫХ: JSON → UI =====\n');

// 1. Загрузка JSON
const rawJson = fs.readFileSync('/workspace/public/data/projects.json', 'utf-8');
const allProjects = JSON.parse(rawJson);

console.log('1. /data/projects.json:');
console.log('   Loaded from JSON:', allProjects.length);
console.log('   First project keys:', Object.keys(allProjects[0] || {}));
console.log('   First project.verifiedStatus:', allProjects[0]?.verifiedStatus);
console.log('   First project.coingeckoId:', allProjects[0]?.coingeckoId);
console.log('   First project.verified_status:', allProjects[0]?.verified_status, '← SNAKE');
console.log('');

// 2. LocalJsonDataProvider._loadTable('projects') — копирует в this._cache
// Симуляция: cache.set('projects', allProjects)
const cache = new Map();
cache.set('projects', allProjects);
console.log('2. LocalJsonDataProvider._cache["projects"]:');
console.log('   In memory:', cache.get('projects').length);
console.log('');

// 3. ProjectRepository.getAll() → provider.getProjects()
const repoResult = cache.get('projects');
console.log('3. ProjectRepository.getAll():');
console.log('   Returned:', repoResult.length);
console.log('');

// 4. ProjectService.getAllProjects() → projects.getAll() (passthrough)
const serviceResult = repoResult;
console.log('4. ProjectService.getAllProjects():');
console.log('   Returned:', serviceResult.length);
console.log('');

// 5. isProjectVerified() из intelligence-v2-render.js
const VERIFICATION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const now = Date.now();

function isProjectVerified(project, nowMs = Date.now()) {
    if (!project) return false;
    // ❌ ПРОБЛЕМА: проверяет snake_case, но в JSON camelCase
    const status = project.verified_status
        || (project.metadata && project.metadata.verified_status)
        || null;
    if (status !== 'verified') return false;

    const cgId = project.coingecko_id
        || (project.metadata && project.metadata.coingecko_id)
        || null;
    const cmcId = project.cmc_id
        || (project.metadata && project.metadata.cmc_id)
        || null;
    if (!cgId && !cmcId) return false;

    const lastVerified = project.last_verified_at
        || (project.metadata && project.metadata.last_verified_at)
        || null;
    if (lastVerified) {
        const lv = new Date(lastVerified).getTime();
        if (!isNaN(lv) && (nowMs - lv) > VERIFICATION_MAX_AGE_MS) return false;
    }
    return true;
}

console.log('5. isProjectVerified() фильтр:');
const filtered = serviceResult.filter(p => isProjectVerified(p));
console.log('   Passed:', filtered.length, '/', serviceResult.length);
console.log('   ❌ Все 339 отфильтрованы:');
console.log('     - project.verified_status =', JSON.stringify(allProjects[0].verified_status), '(snake_case не существует)');
console.log('     - project.verifiedStatus =', JSON.stringify(allProjects[0].verifiedStatus), '(camelCase — есть, но игнорируется)');
console.log('');

// 6. Что увидит пользователь
console.log('6. UI (renderStats → setText("payd-v2-stat-total")):');
console.log('   Rendered:', filtered.length);
console.log('');

console.log('===== ВЫВОД =====');
console.log('Точка сокращения данных: filterVerified() / isProjectVerified()');
console.log('Файл: /workspace/public/js/intelligence/intelligence-v2-render.js, строки 72-96');
console.log('Причина: проверяются поля snake_case, а в JSON данные в camelCase');
console.log('');
console.log('Цепочка данных:');
console.log('  /data/projects.json (camelCase: verifiedStatus, coingeckoId)');
console.log('     ↓ LocalJsonDataProvider._loadTable()');
console.log('  cache["projects"] (339 записей)');
console.log('     ↓ ProjectRepository.getAll()');
console.log('  339 записей');
console.log('     ↓ ProjectService.getAllProjects()');
console.log('  339 записей');
console.log('     ↓ filterVerified() в render.js');
console.log('  0 записей (ВСЕ отфильтрованы)');
console.log('     ↓ renderStats / renderSectors / renderProjects');
console.log('  Tracked: 0, Emerging: 0, Watchlist: 0, Core: 0, Archive: 0');
