/**
 * Module X Bootstrap Loader
 *
 * Единая точка загрузки Module X для любой среды (браузер / Node.js / тесты).
 *
 * Загружает все 17 анализаторов в правильном порядке, затем регистрирует
 * `global.coreAnalysisEngine` для использования Module 1, Module 2, Module 3.
 *
 * Использование:
 *
 *   // В Node.js / тестах:
 *   require('./Module X/bootstrap');
 *   const result = global.coreAnalysisEngine.analyzeMarket(candles, '1h');
 *
 *   // В браузере:
 *   <script src="Module X/bootstrap.js"></script>
 *   <script>
 *     const result = coreAnalysisEngine.analyzeMarket(candles, '1h');
 *   </script>
 */

(function (root) {
    'use strict';

    const path = (typeof __dirname !== 'undefined') ? __dirname : '.';
    const requireFn = (typeof require !== 'undefined') ? require : null;

    // Список анализаторов в порядке загрузки (порядок не критичен — они независимы)
    const ANALYZERS = [
        'marketStructureAnalyzer',
        'trendAnalyzer',
        'momentumAnalyzer',
        'smartMoneyAnalyzer',
        'priceActionAnalyzer',
        'volumeAnalyzer',
        'liquidityAnalyzer',
        'volatilityAnalyzer',
        'supportResistanceAnalyzer',
        'probabilityEngine',
        'confidenceEngine',
        'scenarioGenerator',
        'confluenceEngine',
        'riskAssessor',
        'invalidationBuilder',
        'marketPhaseAnalyzer',
        'executionPlanBuilder'
    ];

    function loadAnalyzers() {
        if (!requireFn) return;

        for (const name of ANALYZERS) {
            try {
                requireFn(`./analyzers/${name}`);
            } catch (err) {
                // Анализатор v1.0.0 — необязательный, продолжаем
                if (!err.message.includes('Cannot find module')) {
                    console.warn(`[Module X] Failed to load ${name}:`, err.message);
                }
            }
        }
    }

    function loadCoordinator() {
        if (requireFn) {
            try {
                // Скомпилированная JS-версия координатора
                requireFn('./coreAnalysisEngine');
            } catch (err) {
                console.warn('[Module X] Failed to load coreAnalysisEngine:', err.message);
            }
        }
    }

    function init() {
        loadAnalyzers();
        loadCoordinator();

        if (root.coreAnalysisEngine) {
            root.ModuleX = {
                analyzeMarket: root.coreAnalysisEngine.analyzeMarket,
                VERSION: root.coreAnalysisEngine.VERSION || '3.0.0',
                NAME: 'Module X — Core Analysis Engine'
            };
            // eslint-disable-next-line no-console
            console.log(`[Module X] Loaded v${root.ModuleX.VERSION}`);
        } else {
            console.error('[Module X] coreAnalysisEngine is not available after loading');
        }
    }

    if (typeof window !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    } else {
        init();
    }

})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : globalThis));
