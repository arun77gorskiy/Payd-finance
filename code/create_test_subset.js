/* Создает подмножество из 10 проектов для быстрого тестирования enrichment pipeline */
const fs = require('fs');
const path = require('path');

const SRC = '/workspace/public/data/projects.json';
const DST = '/workspace/public/data/projects_test.json';

const projects = JSON.parse(fs.readFileSync(SRC, 'utf8'));

// Возьмём по 1-2 из разных секторов для разнообразия теста
const testIds = [
    'akash',           // depin
    'uniswap',         // defi
    'ethereum',        // layer1
    'arbitrum',        // layer2
    'render-token',    // depin (RENDER)
    'ondo-finance',    // rwa
    'maker',           // rwa (MKR)
    'fetch-ai',        // ai
    'the-graph',       // infrastructure
    'story-protocol',  // infrastructure
];

const subset = projects.filter(p => testIds.includes(p.id));
console.log('Подмножество:', subset.length, 'проектов');
subset.forEach(p => console.log('  -', p.id, '|', p.name, '|', p.sector));

fs.writeFileSync(DST, JSON.stringify(subset, null, 2));
console.log('Сохранено в', DST);
