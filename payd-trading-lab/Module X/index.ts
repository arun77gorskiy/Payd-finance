/**
 * Module X — публичная точка входа
 *
 * Этот файл является ЕДИНСТВЕННЫМ публичным интерфейсом Module X.
 * Module 1, Module 2, Module 3 и любые будущие модули PAYD Trading Lab
 * имеют право обращаться ТОЛЬКО к этому файлу.
 *
 * Прямой доступ к отдельным анализаторам внутри Module X/analyzers/
 * СТРОГО ЗАПРЕЩЁН согласно архитектурному правилу PAYD Trading Lab.
 *
 * Публичный API:
 *   analyzeMarket(candles, timeframe): AnalysisResult
 *
 * Использование:
 *
 *   // Node.js / TypeScript:
 *   const { analyzeMarket } = require('./Module X');
 *   const result = analyzeMarket(candles, '1h');
 *
 *   // Браузер / глобально:
 *   const result = global.coreAnalysisEngine.analyzeMarket(candles, '1h');
 *   // или
 *   const result = window.ModuleX.analyzeMarket(candles, '1h');
 */

export { analyzeMarket } from './coreAnalysisEngine';

// Реэкспорт для совместимости с require() и CommonJS
import * as coreEngine from './coreAnalysisEngine';

export const ModuleX = {
    analyzeMarket: coreEngine.analyzeMarket,
    VERSION: '3.0.0',
    NAME: 'Module X — Core Analysis Engine'
};

export default ModuleX;
