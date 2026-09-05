/* =================================================================
   PAYD Finance — SelfHealingEngine (V2.3)
   Главный оркестратор Self-Healing процесса.

   На каждой инициализации:
     1. Проверяет целостность секторов (SectorIntegrityChecker)
     2. Для каждого GAP-сектора:
        a) Запускает AutoDiscoveryService (7 источников)
        b) Классифицирует кандидатов (SectorClassifier)
        c) Обогащает (AutoEnrichmentService)
        d) Сохраняет в localStorage + пытается сохранить на сервер
     3. Возвращает массив новых проектов для интеграции в датасет

   Никогда не блокирует UI:
     - Таймаут на весь процесс: 60 секунд
     - Watchdog: если что-то зависло, возвращаем пустой массив
   ================================================================= */

(function (global) {
    'use strict';

    const STATE_KEY = 'payd_heal_state';
    const NEW_PROJECTS_KEY = 'payd_heal_new_projects';
    const RUN_HISTORY_KEY = 'payd_heal_run_history';
    const RUN_COOLDOWN_MS = 10 * 60 * 1000; // 10 минут между автоматическими запусками

    class SelfHealingEngine {
        constructor(config = {}) {
            // Сервисы создаются лениво, чтобы не падать, если модули не загружены
            this._integrityChecker = null;
            this._discoveryService = null;
            this._classifier = null;
            this._enrichmentService = null;

            this.config = {
                enabled: config.enabled !== false, // default: true
                autoRun: config.autoRun !== false,
                minProjectsPerSector: config.minProjectsPerSector || 15, // мягче чем в sector_config
                targetProjectsPerSector: config.targetProjectsPerSector || 30,
                totalTimeoutMs: config.totalTimeoutMs || 60000,
                discoveryTimeoutMs: config.discoveryTimeoutMs || 15000,
                enrichmentTimeoutMs: config.enrichmentTimeoutMs || 30000,
                persistenceEndpoint: config.persistenceEndpoint || null,
                coingeckoApiKey: config.coingeckoApiKey || null,
                onProgress: config.onProgress || null, // (phase, message, current, total) => void
                onNewProjects: config.onNewProjects || null, // (projects) => void
            };

            this._state = this._loadState();
            this._abortController = null;
        }

        /**
         * Главный метод: запускает проверку и восстановление.
         * @param {Array} projectsArray - текущий массив проектов
         * @param {Map} [enrichedMap] - текущий enriched map
         * @param {Array} [sectorConfig] - опциональный sector_config.json
         * @returns {Promise<Object>} { report, newProjects, needsReload }
         */
        async run(projectsArray, enrichedMap, sectorConfig) {
            if (!this.config.enabled) {
                return { report: null, newProjects: [], needsReload: false, skipped: 'disabled' };
            }

            // Cooldown check
            const now = Date.now();
            if (this._state.lastRunAt && (now - this._state.lastRunAt) < RUN_COOLDOWN_MS) {
                const minutesLeft = Math.ceil((RUN_COOLDOWN_MS - (now - this._state.lastRunAt)) / 60000);
                console.log(`[SelfHealing] Cooldown active — skipping run (${minutesLeft}m left)`);
                return { report: null, newProjects: [], needsReload: false, skipped: 'cooldown' };
            }

            // AbortController для отмены
            this._abortController = new AbortController();
            const timeoutId = setTimeout(() => {
                console.warn('[SelfHealing] Total timeout reached — aborting');
                this._abortController?.abort();
            }, this.config.totalTimeoutMs);

            this._emit('start', 'Starting self-healing process...', 0, 0);

            try {
                // === STEP 1: Check integrity ===
                this._emit('check', 'Checking sector integrity...', 0, 0);
                const checker = this._getIntegrityChecker();
                const report = checker.check(projectsArray, enrichedMap, sectorConfig);

                if (report.healthy) {
                    console.log('[SelfHealing] All sectors healthy — nothing to recover');
                    this._updateState({ lastRunAt: now, lastReport: report, healthy: true });
                    return { report, newProjects: [], needsReload: false };
                }

                // === STEP 2: Get recovery targets ===
                const targets = checker.getRecoveryTargets(report);
                console.log(`[SelfHealing] Found ${targets.length} GAP sectors:`, targets.map(t => t.sector).join(', '));

                // === STEP 3: For each GAP sector, discover + classify + enrich ===
                const allNewProjects = [];
                for (let i = 0; i < targets.length; i++) {
                    const target = targets[i];
                    if (this._abortController.signal.aborted) break;

                    this._emit('discover', `Discovering ${target.sector} (need ${target.gap} more)...`, i, targets.length);

                    try {
                        const newProjects = await this._healSector(target);
                        allNewProjects.push(...newProjects);
                        console.log(`[SelfHealing] ${target.sector}: added ${newProjects.length} new projects`);
                    } catch (e) {
                        console.error(`[SelfHealing] Failed to heal ${target.sector}:`, e.message);
                    }
                }

                // === STEP 4: Persist new projects ===
                if (allNewProjects.length > 0) {
                    this._emit('persist', `Persisting ${allNewProjects.length} new projects...`, targets.length, targets.length);
                    await this._persistNewProjects(allNewProjects);
                }

                // === STEP 5: Update state ===
                this._updateState({
                    lastRunAt: now,
                    lastReport: report,
                    healthy: false,
                    newProjectsAdded: allNewProjects.length,
                });

                this._emit('complete', `Self-healing complete: +${allNewProjects.length} projects`, targets.length, targets.length);

                return {
                    report,
                    newProjects: allNewProjects,
                    needsReload: allNewProjects.length > 0,
                };
            } catch (e) {
                console.error('[SelfHealing] Unexpected error:', e);
                return { report: null, newProjects: [], needsReload: false, error: e.message };
            } finally {
                clearTimeout(timeoutId);
            }
        }

        /**
         * Лечит один сектор: discovery → classification → enrichment.
         * @param {Object} target - { sector, current, min, gap }
         * @returns {Promise<Array>} массив enriched DTO
         */
        async _healSector(target) {
            const needed = target.gap;
            if (needed <= 0) return [];

            const discovery = this._getDiscoveryService();
            const classifier = this._getClassifier();
            const enrichment = this._getEnrichmentService();

            // === Discovery ===
            const candidates = await Promise.race([
                discovery.discoverForSector(target.sector, Math.max(needed * 2, 30)),
                new Promise(resolve => setTimeout(() => resolve([]), this.config.discoveryTimeoutMs)),
            ]);

            if (!candidates || candidates.length === 0) {
                console.warn(`[SelfHealing] No candidates found for ${target.sector}`);
                return [];
            }

            // === Classification ===
            const classified = classifier.classifyMany(candidates);

            // Берём топ-N с максимальной уверенностью
            const topCandidates = classified
                .filter(c => c.classification.sector === target.sector)
                .sort((a, b) => b.classification.confidence - a.classification.confidence)
                .slice(0, needed * 2)
                .map(c => ({
                    ...c.candidate,
                    classification: c.classification,
                }));

            if (topCandidates.length === 0) {
                console.warn(`[SelfHealing] No candidates classified to ${target.sector}`);
                return [];
            }

            // === Enrichment ===
            const enriched = await Promise.race([
                enrichment.enrichMany(topCandidates.slice(0, needed), {
                    onProgress: (done, total) => {
                        this._emit('enrich', `Enriching ${target.sector}: ${done}/${total}`, 0, 0);
                    },
                }),
                new Promise(resolve => setTimeout(() => resolve([]), this.config.enrichmentTimeoutMs)),
            ]);

            return enriched;
        }

        /**
         * Сохраняет новые проекты в localStorage и пытается отправить на сервер.
         */
        async _persistNewProjects(newProjects) {
            // 1) Сохраняем в localStorage (гарантирует, что при следующей загрузке они будут доступны)
            try {
                const existing = JSON.parse(localStorage.getItem(NEW_PROJECTS_KEY) || '[]');
                const merged = this._mergeUnique([...existing, ...newProjects], p => p.id);
                localStorage.setItem(NEW_PROJECTS_KEY, JSON.stringify(merged));
            } catch (e) {
                console.warn('[SelfHealing] Failed to persist to localStorage:', e.message);
            }

            // 2) Сохраняем историю запусков
            try {
                const history = JSON.parse(localStorage.getItem(RUN_HISTORY_KEY) || '[]');
                history.push({
                    timestamp: new Date().toISOString(),
                    count: newProjects.length,
                    sectors: [...new Set(newProjects.map(p => p.sector))],
                    needsReview: newProjects.filter(p => p._classification?.needsReview).length,
                });
                // Оставляем только последние 20 запусков
                if (history.length > 20) history.splice(0, history.length - 20);
                localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(history));
            } catch (e) { /* ignore */ }

            // 3) Пытаемся отправить на сервер (best-effort)
            if (this.config.persistenceEndpoint) {
                try {
                    await fetch(this.config.persistenceEndpoint, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ projects: newProjects }),
                    });
                } catch (e) {
                    console.warn('[SelfHealing] Server persistence failed (will use local cache):', e.message);
                }
            }

            // 4) Уведомляем UI
            if (typeof this.config.onNewProjects === 'function') {
                try {
                    this.config.onNewProjects(newProjects);
                } catch (e) {
                    console.warn('[SelfHealing] onNewProjects callback failed:', e.message);
                }
            }
        }

        /**
         * Возвращает все ранее обнаруженные проекты из localStorage.
         * Используется intelligence-data.js для интеграции в текущий датасет.
         */
        getCachedNewProjects() {
            try {
                return JSON.parse(localStorage.getItem(NEW_PROJECTS_KEY) || '[]');
            } catch (e) {
                return [];
            }
        }

        /**
         * Возвращает историю последних запусков self-healing.
         */
        getRunHistory() {
            try {
                return JSON.parse(localStorage.getItem(RUN_HISTORY_KEY) || '[]');
            } catch (e) {
                return [];
            }
        }

        /**
         * Очищает все кэшированные данные (для отладки).
         */
        clearCache() {
            try {
                localStorage.removeItem(NEW_PROJECTS_KEY);
                localStorage.removeItem(RUN_HISTORY_KEY);
            } catch (e) {}
        }

        /**
         * Возвращает текущее состояние engine'а.
         */
        getState() {
            return this._state;
        }

        /**
         * Принудительно сбрасывает cooldown (для отладки или ручного запуска).
         */
        resetCooldown() {
            this._state.lastRunAt = 0;
            this._saveState();
        }

        // === Lazy service getters ===
        _getIntegrityChecker() {
            if (!this._integrityChecker && global.PAYD_INTEL?.SectorIntegrityChecker) {
                this._integrityChecker = new global.PAYD_INTEL.SectorIntegrityChecker();
            }
            if (!this._integrityChecker) {
                throw new Error('[SelfHealing] SectorIntegrityChecker not available');
            }
            return this._integrityChecker;
        }

        _getDiscoveryService() {
            if (!this._discoveryService && global.PAYD_INTEL?.AutoDiscoveryService) {
                this._discoveryService = new global.PAYD_INTEL.AutoDiscoveryService({
                    coingeckoApiKey: this.config.coingeckoApiKey,
                });
            }
            if (!this._discoveryService) {
                throw new Error('[SelfHealing] AutoDiscoveryService not available');
            }
            return this._discoveryService;
        }

        _getClassifier() {
            if (!this._classifier && global.PAYD_INTEL?.SectorClassifier) {
                this._classifier = new global.PAYD_INTEL.SectorClassifier();
            }
            if (!this._classifier) {
                throw new Error('[SelfHealing] SectorClassifier not available');
            }
            return this._classifier;
        }

        _getEnrichmentService() {
            if (!this._enrichmentService && global.PAYD_INTEL?.AutoEnrichmentService) {
                this._enrichmentService = new global.PAYD_INTEL.AutoEnrichmentService({
                    coingeckoApiKey: this.config.coingeckoApiKey,
                });
            }
            if (!this._enrichmentService) {
                throw new Error('[SelfHealing] AutoEnrichmentService not available');
            }
            return this._enrichmentService;
        }

        _emit(phase, message, current, total) {
            if (typeof this.config.onProgress === 'function') {
                try {
                    this.config.onProgress(phase, message, current, total);
                } catch (e) { /* ignore */ }
            }
            console.log(`[SelfHealing][${phase}] ${message}${current > 0 ? ` (${current}/${total})` : ''}`);
        }

        _mergeUnique(arr, keyFn) {
            const seen = new Set();
            const out = [];
            for (const item of arr) {
                const key = keyFn(item);
                if (seen.has(key)) continue;
                seen.add(key);
                out.push(item);
            }
            return out;
        }

        _loadState() {
            try {
                const raw = localStorage.getItem(STATE_KEY);
                return raw ? JSON.parse(raw) : { lastRunAt: 0 };
            } catch (e) {
                return { lastRunAt: 0 };
            }
        }

        _updateState(updates) {
            this._state = { ...this._state, ...updates };
            this._saveState();
        }

        _saveState() {
            try {
                localStorage.setItem(STATE_KEY, JSON.stringify(this._state));
            } catch (e) { /* ignore */ }
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.SelfHealingEngine = SelfHealingEngine;

})(window);
